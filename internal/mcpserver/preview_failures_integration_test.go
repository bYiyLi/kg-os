//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// Failures while reading a pinned Snapshot must propagate rather than
// silently rendering a valid-looking but incomplete Ontology document.
func TestPhase16PreviewPinnedScopeFailuresAndNoPartialResults(t *testing.T) {
	rt := phase16Runtime(t)
	ctx := context.Background()
	overview, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	builder := previewBuilder{kernel: rt.Kernel, maxItems: 8}
	if _, err := builder.snapshot(ctx, "main", "branch/main"); err == nil || !strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("mutable Head accepted: %v", err)
	}
	if _, err := builder.snapshot(ctx, "main", "commit/"+strings.Repeat("0", 64)); err == nil {
		t.Fatal("nonexistent immutable Head was rendered")
	}
	current, err := builder.snapshot(ctx, "main", overview.State)
	if err != nil {
		t.Fatalf("valid Snapshot rejected: %v", err)
	}
	if current.commit.State != overview.State || current.head != overview.State {
		t.Fatal("pinned snapshot not the requested State")
	}
	if _, err := builder.paginate(ctx, "commit/"+strings.Repeat("0", 64), ""); err == nil {
		t.Fatal("invalid Ontology Snapshot accepted")
	}
	if _, err := builder.paginate(ctx, overview.State, "domain:Nonexistent"); err == nil {
		t.Fatal("unknown Domain represented as complete collection")
	}
	if _, _, err := builder.loadBodies(ctx, overview.State, []string{"node:Absent"}); err == nil {
		t.Fatal("missing Ontology canonical text/value silently accepted")
	}
	if _, _, err := builder.loadBodies(ctx, "commit/"+strings.Repeat("0", 64), []string{"node:Absent"}); err == nil {
		t.Fatal("invalid State canonical body request accepted")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, err := builder.snapshot(cancelled, "main", overview.State); err == nil {
		t.Fatal("cancelled Snapshot request yielded partial result")
	}
	if _, err := builder.paginate(cancelled, overview.State, ""); err == nil {
		t.Fatal("cancelled pagination request yielded partial Ontology")
	}
	if _, _, err := builder.loadBodies(cancelled, overview.State, []string{"node:Absent"}); err == nil {
		t.Fatal("cancelled canonical body read succeeded")
	}
	service, err := New(rt.Kernel, Options{Token: "auth-for-preview-failure", PreviewMaxItems: 1})
	if err != nil {
		t.Fatal(err)
	}
	badLimit := -1
	if _, err := service.preview(ctx, "principal", PreviewInput{Limit: &badLimit}); err == nil {
		t.Fatal("invalid line range was accepted")
	}
	if _, err := service.preview(cancelled, "principal", PreviewInput{}); err == nil {
		t.Fatal("cancelled Preview returned incomplete document")
	}
	root, err := rt.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "test-failed-read-scope", From: overview.State,
	})
	if err != nil || root.Name == "" {
		t.Fatalf("failed to create isolated Branch: %v", err)
	}
}

func TestPhase16PreviewSourceBudgetFailsBeforeMaterializingDocument(t *testing.T) {
	rt := phase16Runtime(t)
	ctx := context.Background()
	before, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	patch := addMatrixPatch("new:node-definition:source-budget",
		"name: \"SourceBudgeted\"\nproperties:\n  - name: \"title\"\n    type: \"STRING\"\nconstraints: []\n")
	if _, err := rt.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: before.State, Branch: "main", Patch: patch,
	}); err != nil {
		t.Fatal(err)
	}
	after, err := rt.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	builder := previewBuilder{kernel: rt.Kernel, maxItems: 100}
	items, err := builder.paginate(ctx, after.State, "")
	if err != nil {
		t.Fatal(err)
	}
	ref := ""
	for _, item := range items {
		if item.Kind == kernel.KindNodeDefinition && item.Name == "SourceBudgeted" {
			ref = item.Ref
			break
		}
	}
	if ref == "" {
		t.Fatal("test Ontology Definition was not materialized")
	}
	budget := 8
	builder.remainingBytes = &budget
	if _, _, err := builder.loadBodies(ctx, after.State, []string{ref}); err == nil ||
		!strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("canonical source oversized for budget, got %v", err)
	}
	budget = maxMarkdownBytes
	texts, values, err := builder.loadBodies(ctx, after.State, []string{ref})
	if err != nil || texts[ref] == "" || len(values[ref]) == 0 || budget >= maxMarkdownBytes {
		t.Fatalf("valid canonical source was not loaded with sufficient budget: %v", err)
	}
}
