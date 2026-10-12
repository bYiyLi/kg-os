//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// These use the real Lithograph host, not a mocked SDK or in-memory graph.
func TestPhase15EmptyDomainStagedSnapshot(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	runtime, err := openKernelIntegrationRuntime(context.Background(), home)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	ctx := context.Background()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	value := kernel.ObjectValue{
		Kind: kernel.KindDomain, Domain: &kernel.Domain{Name: "SdkMatrixEmpty", Includes: []string{}},
	}
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:domain:matrix", value),
	})
	if err != nil {
		t.Fatalf("empty Domain must be a valid caller-defined Ontology: %v", err)
	}
	read, err := runtime.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At: created.State, Refs: []string{"domain:SdkMatrixEmpty"},
	})
	if err != nil || len(read.Results) != 1 {
		t.Fatalf("empty Domain read: result=%#v err=%v", read, err)
	}
}

func TestPhase15ConflictingKnowledgeMergeWithOntology(t *testing.T) {
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
	definition := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "SdkMatrixItem",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain, Domain: &kernel.Domain{
			Name:     "SdkMatrix",
			Includes: []string{"new:node-definition:matrix"},
		},
	}
	model, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:domain:matrix", domain) +
			addObjectPatch(t, "new:node-definition:matrix", definition),
	})
	if err != nil {
		t.Fatalf("create Ontology fixture: %v", err)
	}
	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: model.State, Branch: "main",
		Patch: addRawObjectPatch("new:knowledge-node:matrix-item",
			"labels:\n  - \"SdkMatrixItem\"\nproperties:\n  \"name\": \"Before\"\n"),
	})
	if err != nil || len(seeded.Created) != 1 {
		t.Fatalf("seed knowledge object: %#v, %v", seeded, err)
	}
	ref := seeded.Created[0].Ref
	body, err := runtime.Kernel.ReadObject(ctx, seeded.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: seeded.State,
	}); err != nil {
		t.Fatal(err)
	}
	for _, step := range []struct{ branch, name string }{
		{"main", "Ours"}, {"side", "Theirs"},
	} {
		if _, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
			BaseState: seeded.State, Branch: step.branch,
			Patch: replaceObjectPatch(ref, string(body.YAML),
				strings.Replace(string(body.YAML), "Before", step.name, 1)),
		}); err != nil {
			t.Fatalf("create %s: %v", step.branch, err)
		}
	}
	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || started.Status != "conflicted" {
		t.Fatalf("conflicted merge: %#v, %v", started, err)
	}
	conflicts, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 20,
	})
	if err != nil || len(conflicts.Items) == 0 {
		t.Fatalf("merge conflicts: %#v, %v", conflicts, err)
	}
	resolutions := make([]kernel.MergeResolution, 0, len(conflicts.Items))
	for _, item := range conflicts.Items {
		resolutions = append(resolutions, kernel.MergeResolution{
			ConflictID: item.ConflictID, Choice: "ours",
		})
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: started.Revision, Resolutions: resolutions,
	})
	if err != nil || resolved.Unresolved != 0 {
		t.Fatalf("resolve knowledge conflicts: %#v, %v", resolved, err)
	}
	merged, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	})
	if err != nil {
		t.Fatalf("finalize knowledge conflict with Ontology present: %v", err)
	}
	if _, err := runtime.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At: merged.State, Refs: []string{ref},
	}); err != nil {
		t.Fatalf("merged State cannot be read: %v", err)
	}
}
