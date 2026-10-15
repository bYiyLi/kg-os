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
