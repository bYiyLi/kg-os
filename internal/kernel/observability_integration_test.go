//go:build lithograph_smoke

package kernel_test

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestConfirmedBusinessEventsRespectIndependentWrites(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	rt, err := openKernelIntegrationRuntime(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	defer rt.Close()
	var lines bytes.Buffer
	observer, err := observability.New(&lines, "")
	if err != nil {
		t.Fatal(err)
	}
	ctx, requestID, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	ctx = observability.WithSurface(ctx, "mcp")
	base, err := rt.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	created, err := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addRawObjectPatch("new:knowledge-node:visible", "labels:\n  - \"SafeLabel\"\nproperties:\n  \"name\": \"private-content-123\"\n"),
	})
	if err != nil {
		t.Fatalf("patch: %v", err)
	}
	if _, err := rt.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addRawObjectPatch("new:knowledge-node:stale", "labels:\n  - \"Other\"\n"),
	}); kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
		t.Fatalf("expected stale base: %v", err)
	}
	if _, err := rt.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "private-branch", From: created.State,
	}); err != nil {
		t.Fatalf("branch.create: %v", err)
	}
	if _, err := rt.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main", Cypher: "RETURN 1 AS value",
	}); err != nil {
		t.Fatalf("read-only execute: %v", err)
	}
	if strings.Contains(lines.String(), "private-content-123") || strings.Contains(lines.String(), "private-branch") {
		t.Fatal("business log includes knowledge or branch name")
	}
	var events []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(lines.String()), "\n") {
		var item map[string]any
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			t.Fatal(err)
		}
		events = append(events, item)
	}
	if len(events) != 4 {
		t.Fatalf("want exactly four operations; got %+v", events)
	}
	want := []struct{ operation, outcome string }{
		{"object.patch", "committed"},
		{"object.patch", "rejected"},
		{"evolution.branch.create", "applied"},
		{"graph.execute", "applied"},
	}
	ids := make(map[string]bool)
	for index, record := range events {
		if record["operation"] != want[index].operation ||
			record["outcome"] != want[index].outcome ||
			record["request_id"] != requestID || record["surface"] != "mcp" {
			t.Fatalf("business event %d: %+v", index, record)
		}
		id, _ := record["operation_id"].(string)
		if id == "" || ids[id] {
			t.Fatalf("operation ID collision/missing: %+v", record)
		}
		ids[id] = true
	}
	if events[0]["result_state"] != created.State {
		t.Fatalf("lost confirmed Commit ID: %+v", events[0])
	}
	if observer.Snapshot().Business.OperationsTotal != 4 {
		t.Fatal("business metrics not updated")
	}
}

// A syntactically invalid Patch is rejected before an explicit transaction
// exists. Diagnostic outcomes must not conflate a proven preflight rejection
// with a potentially committed transaction whose result is unknown.
func TestPhase38PreflightPatchRejectionIsNotUnknown(t *testing.T) {
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
	var lines bytes.Buffer
	observer, err := observability.New(&lines, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	ctx, _, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	ctx = observability.WithSurface(ctx, "mcp")
	request := kernel.PatchRequest{BaseState: base, Branch: "main", Patch: ""}
	if _, err := rt.Kernel.PatchObjects(ctx, request); kernel.AsPublicError(err).Code != kernel.CodeParse {
		t.Fatalf("expected rejected Object parse error, got %v", err)
	}
	if _, err := rt.Kernel.PatchOntology(ctx, request); kernel.AsPublicError(err).Code != kernel.CodeParse {
		t.Fatalf("expected rejected Ontology parse error, got %v", err)
	}
	events := strings.Split(strings.TrimSpace(lines.String()), "\n")
	if len(events) != 2 {
		t.Fatalf("expected one terminal diagnostic event per rejected Patch, got %d: %s", len(events), lines.String())
	}
	for _, line := range events {
		var event struct {
			Operation string `json:"operation"`
			Outcome   string `json:"outcome"`
			ErrorCode string `json:"error_code"`
		}
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			t.Fatal(err)
		}
		if event.Operation != "object.patch" && event.Operation != "ontology.patch" {
			t.Fatalf("unexpected diagnostic event: %s", line)
		}
		if event.Outcome != "rejected" || event.ErrorCode != string(kernel.CodeParse) {
			t.Fatalf("pre-write %s was not classified as rejected: %+v", event.Operation, event)
		}
	}
	state, err := rt.Database.ResolveState(context.Background(), "branch/main")
	if err != nil || state != base {
		t.Fatalf("preflight rejection modified branch: %s %v", state, err)
	}
}
