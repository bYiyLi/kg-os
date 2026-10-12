//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// Validate SDK-facing failure boundaries using a real initialized graph.
// Keeping errors public matters as much as a successful MCP SDK call.
func TestPhase15SDKHistoryDiffValidationAndPinnedCursors(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	expectError := func(name string, call func() error) {
		t.Helper()
		t.Run(name, func(t *testing.T) {
			if err := call(); err == nil || kernel.AsPublicError(err) == nil {
				t.Fatalf("expected public SDK error, got %v", err)
			}
		})
	}
	expectError("diff limit", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: base, After: base, Scope: "all", Limit: -1,
		})
		return err
	})
	expectError("diff before", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: "invalid-state-ref", After: base, Scope: "all",
		})
		return err
	})
	expectError("diff after", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: base, After: "invalid-state-ref", Scope: "all",
		})
		return err
	})
	expectError("diff invalid cursor", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: base, After: base, Scope: "all", Cursor: "invalid-cursor",
		})
		return err
	})
	expectError("diff invalid object anchor", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: base, After: base, Scope: "object",
			Object: &kernel.EvolutionObjectFilter{
				AnchorState: "branch/no-such-branch", Ref: "domain:Missing",
			},
		})
		return err
	})
	expectError("history limit", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: base, Scope: "all", Limit: -1,
		})
		return err
	})
	expectError("history scope", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: base, Scope: "unexpected",
		})
		return err
	})
	expectError("history root", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: "invalid-state-ref", Scope: "all",
		})
		return err
	})
	expectError("history invalid cursor", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: base, Scope: "all", Cursor: "invalid-cursor",
		})
		return err
	})
	expectError("history invalid object anchor", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: base, Scope: "object",
			Object: &kernel.EvolutionObjectFilter{
				AnchorState: "branch/no-such-branch", Ref: "domain:Missing",
			},
		})
		return err
	})
	expectError("history object not found", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: base, Scope: "object",
			Object: &kernel.EvolutionObjectFilter{AnchorState: base, Ref: "domain:Missing"},
		})
		return err
	})

	patch := addObjectPatch(t, "new:domain:first", kernel.ObjectValue{
		Kind: kernel.KindDomain, Domain: &kernel.Domain{Name: "SdkCursorFirst", Includes: []string{}},
	}) + addObjectPatch(t, "new:domain:second", kernel.ObjectValue{
		Kind: kernel.KindDomain, Domain: &kernel.Domain{Name: "SdkCursorSecond", Includes: []string{}},
	}) + addObjectPatch(t, "new:domain:third", kernel.ObjectValue{
		Kind: kernel.KindDomain, Domain: &kernel.Domain{Name: "SdkCursorThird", Includes: []string{}},
	})
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: patch,
	})
	if err != nil {
		t.Fatalf("create multiple Domain changes for real cursor tests: %v", err)
	}
	first, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "ontology", Limit: 1,
	})
	if err != nil || len(first.Items) != 1 || first.Cursor == "" {
		t.Fatalf("expected Diff page cursor: %#v, %v", first, err)
	}
	continued, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "ontology", Limit: 1, Cursor: first.Cursor,
	})
	if err != nil || len(continued.Items) != 1 {
		t.Fatalf("continue Diff by pinned cursor: %#v, %v", continued, err)
	}
	expectError("diff cursor scope changed", func() error {
		_, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
			Before: base, After: created.State, Scope: "knowledge", Limit: 1, Cursor: first.Cursor,
		})
		return err
	})
	firstHistory, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: created.State, Scope: "ontology", Limit: 1,
	})
	if err != nil || len(firstHistory.Items) != 1 || firstHistory.Cursor == "" {
		t.Fatalf("expected History page cursor: %#v, %v", firstHistory, err)
	}
	historyPage, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: created.State, Scope: "ontology", Limit: 1, Cursor: firstHistory.Cursor,
	})
	if err != nil || len(historyPage.Items) != 1 {
		t.Fatalf("continue History by pinned cursor: %#v, %v", historyPage, err)
	}
	expectError("history cursor scope changed", func() error {
		_, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
			Root: created.State, Scope: "knowledge", Limit: 1, Cursor: firstHistory.Cursor,
		})
		return err
	})

	// A single Domain with two changed public fields exercises scoped
	// pagination, the pinned Object anchor, and cursor continuation.
	const ref = "domain:SdkCursorFirst"
	body, err := runtime.Kernel.ReadObject(ctx, created.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	original := string(body.YAML)
	updatedBody := strings.Replace(original, "includes:",
		"title: \"First change\"\ndescription: \"Second change\"\nincludes:", 1)
	if updatedBody == original {
		t.Fatalf("cannot modify canonical Domain YAML: %s", original)
	}
	updated, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: replaceObjectPatch(ref, original, updatedBody),
	})
	if err != nil {
		t.Fatalf("update two Domain fields for scoped cursor: %v", err)
	}
	filter := &kernel.EvolutionObjectFilter{AnchorState: updated.State, Ref: ref}
	objectDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: updated.State, Scope: "object", Object: filter, Limit: 1,
	})
	if err != nil || len(objectDiff.Items) != 1 || objectDiff.Cursor == "" {
		t.Fatalf("expected object-scoped Diff cursor: %#v, %v", objectDiff, err)
	}
	objectDiffNext, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: updated.State, Scope: "object",
		Object: filter, Limit: 1, Cursor: objectDiff.Cursor,
	})
	if err != nil || len(objectDiffNext.Items) != 1 {
		t.Fatalf("object-scoped Diff cursor continuation: %#v, %v", objectDiffNext, err)
	}
	objectHistory, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: updated.State, Scope: "object", Object: filter, Limit: 1,
	})
	if err != nil || len(objectHistory.Items) != 1 || objectHistory.Cursor == "" {
		t.Fatalf("expected object-scoped History cursor: %#v, %v", objectHistory, err)
	}
	objectHistoryNext, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: updated.State, Scope: "object", Object: filter, Limit: 1,
		Cursor: objectHistory.Cursor,
	})
	if err != nil || len(objectHistoryNext.Items) != 1 {
		t.Fatalf("object-scoped History cursor continuation: %#v, %v", objectHistoryNext, err)
	}
}
