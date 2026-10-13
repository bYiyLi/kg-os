//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase16PreviewPinnedBranchesCacheEvictionAndBudgets(t *testing.T) {
	rt := phase16Runtime(t)
	ctx := context.Background()
	server, err := New(rt.Kernel, Options{Token: "preview-test-secret", PreviewCacheEntries: 2, PreviewCacheTTL: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	initial, err := server.preview(ctx, "administrator", PreviewInput{})
	if err != nil || !strings.Contains(initial.Preview, "main") || initial.ViewRevision == "" {
		t.Fatalf("initial Branch preview unavailable: %#v %v", initial, err)
	}
	overview, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := rt.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "secondary", From: overview.State,
	}); err != nil {
		t.Fatal(err)
	}
	second, err := server.preview(ctx, "administrator", PreviewInput{})
	if err != nil || second.ViewRevision == initial.ViewRevision ||
		!strings.Contains(second.Preview, "secondary") {
		t.Fatalf("new Branch absent or revision not rotated: %#v %v", second, err)
	}
	// An existing revision remains frozen even when Branches move.
	frozen, err := server.preview(ctx, "administrator", PreviewInput{ViewRevision: initial.ViewRevision})
	if err != nil || frozen.Preview != initial.Preview || frozen.TotalLines != initial.TotalLines {
		t.Fatalf("old pinned view was mutated: %#v %v", frozen, err)
	}
	if _, err := server.preview(ctx, "other-principal", PreviewInput{ViewRevision: initial.ViewRevision}); err == nil {
		t.Fatal("Preview revision leaked across principals")
	}
	third, err := server.preview(ctx, "administrator", PreviewInput{})
	if err != nil {
		t.Fatal(err)
	}
	if third.ViewRevision == initial.ViewRevision {
		t.Fatal("Preview revision identifier was reused")
	}
	if _, err := server.preview(ctx, "administrator", PreviewInput{ViewRevision: initial.ViewRevision}); err == nil {
		t.Fatal("evicted Preview revision still reachable")
	}
	if current, err := server.preview(ctx, "administrator", PreviewInput{ViewRevision: second.ViewRevision}); err != nil || current.TotalLines != second.TotalLines {
		t.Fatalf("non-evicted Snapshot changed: %v", err)
	}
	time.Sleep(1100 * time.Millisecond)
	if _, err := server.preview(ctx, "administrator", PreviewInput{ViewRevision: third.ViewRevision}); err == nil {
		t.Fatal("expired Preview revision still available")
	}

	// Two Ontology objects cannot be represented by a configured one-item
	// memory budget: fail visibly instead of truncating authoritative text.
	patch := addMatrixPatch("new:domain:preview-budget",
		"name: \"Budgeted\"\nincludes:\n  - \"new:node-definition:preview-budget\"\n") +
		addMatrixPatch("new:node-definition:preview-budget",
			"name: \"BudgetedItem\"\nproperties:\n  - name: \"title\"\n    type: \"STRING\"\nconstraints: []\n")
	if _, err := rt.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: overview.State, Branch: "main", Patch: patch,
	}); err != nil {
		t.Fatal(err)
	}
	constrained, err := New(rt.Kernel, Options{Token: "budget-test-secret", PreviewMaxItems: 1})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := constrained.preview(ctx, "administrator", PreviewInput{}); err == nil ||
		!strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("oversized Ontology returned a partial Preview instead of resource error: %v", err)
	}
	unconstrained, err := server.preview(ctx, "administrator", PreviewInput{})
	if err != nil || !strings.Contains(unconstrained.Preview, "Budgeted") {
		t.Fatalf("full Ontology not visible with suitable budget: %#v %v", unconstrained, err)
	}
}
