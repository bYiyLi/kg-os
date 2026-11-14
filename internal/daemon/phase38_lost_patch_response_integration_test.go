//go:build lithograph_smoke

package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

// The real Object Patch commits before its HTTP JSON result is delivered.
// Hijacking and closing this test-only connection AFTER the handler completes
// represents a lost response, not a failed SQLite Commit or an early cancel.
// A caller must read the Branch/State before deciding whether to write again.
func TestPhase38CommittedRelationshipPatchWithLostHTTPResponseIsNotReplayed(t *testing.T) {
	rt := openDaemonRuntime(t)
	defer rt.Close()
	ctx := context.Background()
	base, err := rt.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}

	var diagnostics bytes.Buffer
	observer, err := observability.New(&diagnostics, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	handler := observability.HTTPMiddleware(observer, NewHandler(rt, http.NotFoundHandler()))
	type withheldResult struct {
		status int
		body   []byte
		err    error
	}
	withheld := make(chan withheldResult, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/object/patch" {
			handler.ServeHTTP(w, r)
			return
		}
		// Do not expose the committed response to the real HTTP connection.
		captured := httptest.NewRecorder()
		handler.ServeHTTP(captured, r)
		hijacker, ok := w.(http.Hijacker)
		if !ok {
			withheld <- withheldResult{err: fmt.Errorf("test HTTP writer cannot be hijacked")}
			return
		}
		conn, _, hijackErr := hijacker.Hijack()
		if hijackErr == nil {
			hijackErr = conn.Close()
		}
		withheld <- withheldResult{
			status: captured.Code,
			body:   bytes.Clone(captured.Body.Bytes()),
			err:    hijackErr,
		}
	}))
	defer server.Close()

	add := func(ref, yaml string) string {
		t.Helper()
		lines := strings.Split(strings.TrimSuffix(yaml, "\n"), "\n")
		var result strings.Builder
		fmt.Fprintf(&result, "diff --git a/%s b/%s\nnew file mode 100644\n--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n", ref, ref, ref, len(lines))
		for _, line := range lines {
			result.WriteString("+" + line + "\n")
		}
		return result.String()
	}
	patch := add("new:knowledge-relationship:evidence", "type: \"EVIDENCES\"\nstart: \"new:knowledge-node:source\"\nend: \"new:knowledge-node:claim\"\nproperties: {}\n") +
		add("new:knowledge-node:source", "labels:\n  - \"Source\"\nproperties:\n  \"id\": \"source-unique\"\n") +
		add("new:knowledge-node:claim", "labels:\n  - \"Claim\"\nproperties:\n  \"id\": \"claim-unique\"\n")
	payload, err := json.Marshal(kernel.PatchRequest{
		Branch: "main", BaseState: base, Patch: patch,
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+"/api/v1/object/patch", bytes.NewReader(payload))
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+rt.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	client := server.Client()
	client.Timeout = 15 * time.Second
	response, err := client.Do(request)
	if response != nil {
		response.Body.Close()
		t.Fatalf("the committed response unexpectedly reached the client: status=%d", response.StatusCode)
	}
	if err == nil {
		t.Fatal("expected a lost HTTP response after the server committed")
	}

	var serverResult withheldResult
	select {
	case serverResult = <-withheld:
	case <-time.After(5 * time.Second):
		t.Fatal("the HTTP handler did not finish the actual Object Patch")
	}
	if serverResult.err != nil || serverResult.status != http.StatusOK {
		t.Fatalf("the server did not complete the Patch before losing its response: %+v", serverResult)
	}
	var committed kernel.PatchResult
	if err := json.Unmarshal(serverResult.body, &committed); err != nil {
		t.Fatalf("server result was not a committed Patch: %v", err)
	}
	if committed.State == base || len(committed.Created) != 3 {
		t.Fatalf("the committed Patch did not create all three objects: %+v", committed)
	}

	assertCommitted := func() {
		t.Helper()
		current, err := rt.Database.ResolveState(ctx, "branch/main")
		if err != nil || current != committed.State {
			t.Fatalf("lost HTTP response changed confirmed Head: got=%q want=%q err=%v", current, committed.State, err)
		}
		for _, pair := range []struct {
			cypher string
			want   int64
		}{
			{"MATCH (n:Source) RETURN count(n) AS count", 1},
			{"MATCH (n:Claim) RETURN count(n) AS count", 1},
			{"MATCH (:Source)-[r:EVIDENCES]->(:Claim) RETURN count(r) AS count", 1},
		} {
			got, err := rt.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{At: current, Cypher: pair.cypher})
			if err != nil || len(got.Rows) != 1 || len(got.Rows[0]) != 1 || string(got.Rows[0][0]) != fmt.Sprint(pair.want) {
				t.Fatalf("committed graph was not durable: query=%q rows=%+v err=%v", pair.cypher, got.Rows, err)
			}
		}
	}
	assertCommitted()

	// Simulate an unsafe manual retry with the same strict baseState.
	// It must be rejected without creating a second Relationship/Commit.
	retry := httptest.NewRequest(http.MethodPost, "/api/v1/object/patch", bytes.NewReader(payload))
	retry.Header.Set("Authorization", "Bearer "+rt.Credential.Token)
	retry.Header.Set("Content-Type", "application/json")
	denied := httptest.NewRecorder()
	handler.ServeHTTP(denied, retry)
	if denied.Code != http.StatusConflict || !strings.Contains(denied.Body.String(), string(kernel.CodeStaleBaseState)) {
		t.Fatalf("unsafe retry did not reject stale base: status=%d body=%s", denied.Code, denied.Body.String())
	}
	assertCommitted()

	// The owner of the durable result can record committed; the transport
	// did not tell the caller that outcome. The rejected retry is separate.
	var outcomes []string
	for _, line := range strings.Split(strings.TrimSpace(diagnostics.String()), "\n") {
		var event struct {
			Event     string `json:"event"`
			Operation string `json:"operation"`
			Outcome   string `json:"outcome"`
		}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event.Event == "business.operation.finished" && event.Operation == "object.patch" {
			outcomes = append(outcomes, event.Outcome)
		}
	}
	if len(outcomes) != 2 || outcomes[0] != "committed" || outcomes[1] != "rejected" {
		t.Fatalf("unexpected durable business diagnostics after lost response and rejected retry: %+v", outcomes)
	}
}
