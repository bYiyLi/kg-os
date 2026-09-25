//go:build lithograph_smoke

package daemon

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase04ObjectAPIReadPatchRoundTrip(t *testing.T) {
	runtime := openDaemonRuntime(t)
	defer runtime.Close()
	server := httptest.NewServer(NewHandler(runtime, http.NotFoundHandler()))
	defer server.Close()

	ctx := context.Background()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	patchText := "diff --git a/new:knowledge-node:alice b/new:knowledge-node:alice\n" +
		"new file mode 100644\n" +
		"--- /dev/null\n" +
		"+++ b/new:knowledge-node:alice\n" +
		"@@ -0,0 +1,3 @@\n" +
		"+labels: []\n" +
		"+properties:\n" +
		"+  \"name\": \"Alice\"\n"
	patchPayload, err := json.Marshal(kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     patchText,
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		server.URL+"/api/v1/object/patch",
		bytes.NewReader(patchPayload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("object patch request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("object patch status = %d", response.StatusCode)
	}
	var patched kernel.PatchResult
	if err := json.NewDecoder(response.Body).Decode(&patched); err != nil {
		t.Fatalf("decode object patch: %v", err)
	}
	if len(patched.Created) != 1 || patched.Created[0].Alias != "alice" ||
		patched.Created[0].Kind != kernel.KindKnowledgeNode {
		t.Fatalf("patch result = %#v", patched)
	}
	ref := patched.Created[0].Ref

	readPayload, err := json.Marshal(kernel.ObjectReadRequest{
		At:   patched.State,
		Refs: []string{ref},
	})
	if err != nil {
		t.Fatal(err)
	}
	request, err = http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		server.URL+"/api/v1/object/read",
		bytes.NewReader(readPayload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("object read request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("object read status = %d", response.StatusCode)
	}
	var read kernel.ObjectReadResult
	if err := json.NewDecoder(response.Body).Decode(&read); err != nil {
		t.Fatalf("decode object read: %v", err)
	}
	if read.State != patched.State || len(read.Results) != 1 ||
		read.Results[0].Ref != ref || read.Results[0].Kind != kernel.KindKnowledgeNode ||
		!bytes.Contains(read.Results[0].Value, []byte("\"name\":\"Alice\"")) {
		t.Fatalf("read result = %#v", read)
	}

	request, err = http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		server.URL+"/api/v1/object/read-text",
		bytes.NewReader(readPayload),
	)
	if err != nil {
		t.Fatal(err)
	}
	request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
	request.Header.Set("Content-Type", "application/json")
	response, err = http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("object text read request: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("object text read status = %d", response.StatusCode)
	}
	var textRead kernel.ObjectTextReadResult
	if err := json.NewDecoder(response.Body).Decode(&textRead); err != nil {
		t.Fatalf("decode object text read: %v", err)
	}
	if textRead.State != patched.State || len(textRead.Results) != 1 ||
		textRead.Results[0].Ref != ref || textRead.Results[0].Kind != kernel.KindKnowledgeNode ||
		!strings.Contains(textRead.Results[0].Body, "Alice") {
		t.Fatalf("text read result = %#v", textRead)
	}

	objectPayload, err := json.Marshal(map[string]string{
		"at":  patched.State,
		"ref": ref,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name        string
		accept      string
		wantStatus  int
		wantType    string
		wantContent string
	}{
		{
			name:        "json",
			accept:      "application/json",
			wantStatus:  http.StatusOK,
			wantType:    "application/json; charset=utf-8",
			wantContent: "\"name\":\"Alice\"",
		},
		{
			name:        "yaml",
			accept:      "application/yaml",
			wantStatus:  http.StatusOK,
			wantType:    "application/yaml; charset=utf-8",
			wantContent: "\"name\": \"Alice\"",
		},
		{
			name:       "not acceptable",
			accept:     "text/plain",
			wantStatus: http.StatusNotAcceptable,
			wantType:   "application/json; charset=utf-8",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			request, requestErr := http.NewRequestWithContext(
				ctx,
				http.MethodPost,
				server.URL+"/api/v1/ontology/object",
				bytes.NewReader(objectPayload),
			)
			if requestErr != nil {
				t.Fatal(requestErr)
			}
			request.Header.Set("Authorization", "Bearer "+runtime.Credential.Token)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Accept", test.accept)
			response, requestErr := http.DefaultClient.Do(request)
			if requestErr != nil {
				t.Fatalf("ontology object request: %v", requestErr)
			}
			defer response.Body.Close()
			if response.StatusCode != test.wantStatus {
				t.Fatalf("status = %d, want %d", response.StatusCode, test.wantStatus)
			}
			if got := response.Header.Get("Content-Type"); got != test.wantType {
				t.Fatalf("Content-Type = %q, want %q", got, test.wantType)
			}
			if test.wantStatus == http.StatusOK {
				if response.Header.Get("X-KGOS-State") != patched.State ||
					response.Header.Get("X-KGOS-Ref") != ref ||
					response.Header.Get("X-KGOS-Kind") != string(kernel.KindKnowledgeNode) {
					t.Fatalf("Object headers = %#v", response.Header)
				}
			}
			body := new(bytes.Buffer)
			if _, requestErr := body.ReadFrom(response.Body); requestErr != nil {
				t.Fatal(requestErr)
			}
			if test.wantContent != "" && !strings.Contains(body.String(), test.wantContent) {
				t.Fatalf("body = %q, want content %q", body.String(), test.wantContent)
			}
		})
	}
}
