//go:build lithograph_smoke

package kernel_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestPhase38RelationshipSeekAliasExistingSelfLoopAndRollback(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	ctx := context.Background()
	rt, err := openKernelIntegrationRuntime(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	base, err := rt.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	// Patch declarations intentionally place Relationships before endpoint
	// Nodes; only the topologically ordered executor may create the edge.
	created, err := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-relationship:edge",
			"type: \"KNOWS\"\nstart: \"new:knowledge-node:left\"\nend: \"new:knowledge-node:right\"\nproperties:\n  \"since\": 2026\n") +
			addRawObjectPatch("new:knowledge-node:left",
				"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Left\"\n") +
			addRawObjectPatch("new:knowledge-node:right",
				"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Right\"\n"),
	})
	if err != nil {
		t.Fatalf("new endpoints: %v", err)
	}
	refs := map[string]string{}
	for _, value := range created.Created {
		refs[value.Alias] = value.Ref
	}
	if len(refs) != 3 || !strings.HasPrefix(refs["edge"], "r:") {
		t.Fatalf("created references: %+v", refs)
	}
	readRelation := func(at, ref string) kernel.KnowledgeRelationship {
		t.Helper()
		object, err := rt.Kernel.ReadObject(ctx, at, ref)
		if err != nil {
			t.Fatal(err)
		}
		var rel kernel.KnowledgeRelationship
		value, err := kernel.ParseObjectYAML(kernel.KindKnowledgeRelationship, object.YAML)
		if err != nil {
			t.Fatal(err)
		}
		rel = *value.KnowledgeRelationship
		return rel
	}
	edge := readRelation(created.State, refs["edge"])
	if edge.Start != refs["left"] || edge.End != refs["right"] {
		t.Fatalf("alias edge endpoints: %+v", edge)
	}

	// A self-loop and an existing-endpoint-only edge must not require a
	// Cartesian product or an additional independent graph transaction.
	withLoops, err := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-relationship:self",
			"type: \"KNOWS\"\nstart: \""+refs["left"]+"\"\nend: \""+refs["left"]+"\"\nproperties:\n  \"since\": 2027\n") +
			addRawObjectPatch("new:knowledge-relationship:existing",
				"type: \"KNOWS\"\nstart: \""+refs["right"]+"\"\nend: \""+refs["left"]+"\"\nproperties:\n  \"since\": 2028\n"),
	})
	if err != nil {
		t.Fatalf("existing endpoints/self loop: %v", err)
	}
	loops := map[string]string{}
	for _, obj := range withLoops.Created {
		loops[obj.Alias] = obj.Ref
	}
	self := readRelation(withLoops.State, loops["self"])
	if self.Start != refs["left"] || self.End != refs["left"] {
		t.Fatalf("invalid loop endpoints: %+v", self)
	}
	reverse := readRelation(withLoops.State, loops["existing"])
	if reverse.Start != refs["right"] || reverse.End != refs["left"] {
		t.Fatalf("invalid existing endpoints: %+v", reverse)
	}

	// The operation must not leave a partially persisted relationship when
	// either endpoint fails to resolve after transaction start.
	_, err = rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: withLoops.State, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-node:uncommitted",
			"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Transient\"\n") +
			addRawObjectPatch("new:knowledge-relationship:missing",
				"type: \"KNOWS\"\nstart: \"new:knowledge-node:uncommitted\"\nend: \"n:9999999\"\nproperties:\n  \"since\": 2030\n"),
	})
	if err == nil {
		t.Fatal("unknown endpoint accepted")
	}
	assertMainState(t, rt, withLoops.State)
	_, err = rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-relationship:stale",
			"type: \"KNOWS\"\nstart: \""+refs["left"]+"\"\nend: \""+refs["right"]+"\"\n"),
	})
	if kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
		t.Fatalf("unexpected stale base error: %v", err)
	}
	assertMainState(t, rt, withLoops.State)

	// No hidden secondary commit: all identities remain readable together
	// at the single final state.
	read, err := rt.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At: withLoops.State, Refs: []string{refs["left"], refs["right"], refs["edge"], loops["self"], loops["existing"]},
	})
	if err != nil || len(read.Results) != 5 {
		t.Fatalf("missing linked graph identity at committed State: %+v %v", read, err)
	}
	if body, err := json.Marshal(read); err != nil || len(body) == 0 {
		t.Fatalf("invalid stable Object read payload: %v", err)
	}
}

// A constraint violation on the second edge must roll back both endpoints
// and the first edge, which were staged earlier in the same Object Patch.
// This checks actual Lithograph transaction atomicity, not just preflight
// rejection of an invalid endpoint or a stale baseState.
func TestPhase38RelationshipConstraintFailureRollsBackStagedGraph(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	ctx := context.Background()
	rt, err := openKernelIntegrationRuntime(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	base, err := rt.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	from, to := "new:node-definition:person", "new:node-definition:person"
	model, err := rt.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:node-definition:person", kernel.ObjectValue{
			Kind: kernel.KindNodeDefinition,
			Definition: &kernel.Definition{
				Kind: kernel.KindNodeDefinition, Name: "Person",
				Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
				Constraints: []kernel.Constraint{},
			},
		}) + addObjectPatch(t, "new:relationship-definition:knows", kernel.ObjectValue{
			Kind: kernel.KindRelationshipDefinition,
			Definition: &kernel.Definition{
				Kind: kernel.KindRelationshipDefinition, Name: "KNOWS", From: &from, To: &to,
				Properties:  []kernel.Property{{Name: "key", Type: "STRING"}},
				Constraints: []kernel.Constraint{{Type: "unique", Properties: []string{"key"}}},
			},
		}),
	})
	if err != nil {
		t.Fatalf("create constraint fixture: %v", err)
	}
	patch := addRawObjectPatch("new:knowledge-node:left", "labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Staged Left\"\n") +
		addRawObjectPatch("new:knowledge-node:right", "labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Staged Right\"\n") +
		addRawObjectPatch("new:knowledge-relationship:first", "type: \"KNOWS\"\nstart: \"new:knowledge-node:left\"\nend: \"new:knowledge-node:right\"\nproperties:\n  \"key\": \"duplicate\"\n") +
		addRawObjectPatch("new:knowledge-relationship:second", "type: \"KNOWS\"\nstart: \"new:knowledge-node:right\"\nend: \"new:knowledge-node:left\"\nproperties:\n  \"key\": \"duplicate\"\n")
	// A failure after real mutations have been staged cannot be treated
	// as a proven preflight rejection in the persisted business outcome.
	var diagnostic bytes.Buffer
	observer, err := observability.New(&diagnostic, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	writeCtx, _, err := observability.WithRequest(ctx, observer)
	if err != nil {
		t.Fatal(err)
	}
	writeCtx = observability.WithSurface(writeCtx, "mcp")
	_, err = rt.Kernel.PatchObjects(writeCtx, kernel.PatchRequest{
		BaseState: model.State, Branch: "main", Patch: patch,
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("second relationship must violate uniqueness constraint: %v", err)
	}
	terminations := 0
	for _, line := range strings.Split(strings.TrimSpace(diagnostic.String()), "\n") {
		var event struct {
			Event     string `json:"event"`
			Outcome   string `json:"outcome"`
			ErrorCode string `json:"error_code"`
		}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatalf("invalid diagnostic event: %v", err)
		}
		if event.Event != "business.operation.finished" {
			continue
		}
		terminations++
		if event.Outcome != "unknown" || event.ErrorCode != string(kernel.CodeConstraint) {
			t.Fatalf("staged transaction error misclassified: %+v", event)
		}
	}
	if terminations != 1 {
		t.Fatalf("want one terminal business record; got %d", terminations)
	}
	assertMainState(t, rt, model.State)
	if got := querySingleInt(t, rt, model.State, "MATCH (n:Person) RETURN count(n) AS count"); got != 0 {
		t.Fatalf("staged nodes leaked after constraint failure: %d", got)
	}
	if got := querySingleInt(t, rt, model.State, "MATCH ()-[r:KNOWS]->() RETURN count(r) AS count"); got != 0 {
		t.Fatalf("staged relationship leaked after constraint failure: %d", got)
	}
}

// Cancellation is triggered only after the real diagnostic stage confirms
// the two endpoint nodes have been staged inside the explicit transaction.
// A short timeout before PatchObjects begins would not exercise rollback.
func TestPhase38CancelAfterStagedNodesRollsBack(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	rt, err := openKernelIntegrationRuntime(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	base, err := rt.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}

	store, err := observability.OpenStore(filepath.Join(t.TempDir(), "logs"), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	defer func() {
		closeCtx, done := context.WithTimeout(context.Background(), 5*time.Second)
		defer done()
		if closeErr := observer.Close(closeCtx); closeErr != nil {
			t.Errorf("close diagnostics: %v", closeErr)
		}
	}()
	ctx, cancel := context.WithCancel(observability.WithObserver(context.Background(), observer))
	defer cancel()

	var patch strings.Builder
	patch.WriteString(addRawObjectPatch("new:knowledge-node:left", "labels:\n  - \"Person\"\nproperties:\n  \"id\": \"staged-left\"\n"))
	patch.WriteString(addRawObjectPatch("new:knowledge-node:right", "labels:\n  - \"Person\"\nproperties:\n  \"id\": \"staged-right\"\n"))
	for i := 0; i < 150; i++ {
		patch.WriteString(addRawObjectPatch(
			fmt.Sprintf("new:knowledge-relationship:edge-%03d", i),
			"type: \"KNOWS\"\nstart: \"new:knowledge-node:left\"\nend: \"new:knowledge-node:right\"\nproperties: {}\n",
		))
	}
	result := make(chan error, 1)
	go func() {
		_, patchErr := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{BaseState: base, Branch: "main", Patch: patch.String()})
		result <- patchErr
	}()

	deadline := time.NewTimer(20 * time.Second)
	defer deadline.Stop()
	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()
	found := false
	for !found {
		select {
		case patchErr := <-result:
			t.Fatalf("Patch completed before the post_schema_relationships checkpoint was observed: %v", patchErr)
		case <-deadline.C:
			cancel()
			<-result
			t.Fatal("did not observe post_schema_relationships checkpoint in time")
		case <-ticker.C:
			list, listErr := store.ListLogs(context.Background(), observability.LogListInput{Limit: 100})
			if listErr != nil {
				t.Fatalf("read diagnostic stage: %v", listErr)
			}
			for _, event := range list.Items {
				if event.Event == "business.operation.stage" && event.Fields["stage"] == "post_schema_relationships" {
					found = true
					cancel()
					break
				}
			}
		}
	}
	if patchErr := <-result; patchErr == nil {
		t.Fatal("mid-transaction cancellation unexpectedly committed")
	}
	assertMainState(t, rt, base)
	if got := querySingleInt(t, rt, base, "MATCH (n:Person) RETURN count(n) AS count"); got != 0 {
		t.Fatalf("staged nodes survived cancellation: %d", got)
	}
	if got := querySingleInt(t, rt, base, "MATCH ()-[r:KNOWS]->() RETURN count(r) AS count"); got != 0 {
		t.Fatalf("staged relationships survived cancellation: %d", got)
	}
}
