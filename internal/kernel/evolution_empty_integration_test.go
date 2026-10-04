//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase14EvolutionPublicCollectionsEncodeArrays(t *testing.T) {
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
	get, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: base})
	if err != nil {
		t.Fatal(err)
	}
	assertEvolutionArrayField(t, get, "parents")
	if len(assertEvolutionArrayField(t, get.Consistency, "issues")) != 0 {
		t.Fatalf("valid State must have empty consistency issues: %#v", get)
	}

	ancestry, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: base})
	if err != nil || len(ancestry.Items) == 0 {
		t.Fatalf("ancestry = %#v, %v", ancestry, err)
	}
	assertEvolutionArrayField(t, ancestry, "items")
	foundGenesis := false
	for _, summary := range ancestry.Items {
		assertEvolutionArrayField(t, summary, "parents")
		if len(summary.Parents) == 0 {
			foundGenesis = true
			genesis, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: summary.State})
			if err != nil {
				t.Fatal(err)
			}
			if len(assertEvolutionArrayField(t, genesis, "parents")) != 0 {
				t.Fatalf("genesis has parents: %#v", genesis)
			}
			assertEvolutionArrayField(t, genesis.Consistency, "issues")
		}
	}
	if !foundGenesis {
		t.Fatalf("fresh ancestry did not include the zero-parent native genesis: %#v", ancestry)
	}

	tags, err := runtime.Kernel.EvolutionTagList(ctx)
	if err != nil || len(assertEvolutionArrayField(t, tags, "items")) != 0 {
		t.Fatalf("fresh tag list = %#v, %v", tags, err)
	}
	branches, err := runtime.Kernel.EvolutionBranchList(ctx)
	if err != nil || len(assertEvolutionArrayField(t, branches, "items")) != 1 || branches.Items[0].Name != "main" {
		t.Fatalf("fresh branch list = %#v, %v", branches, err)
	}
	list, err := runtime.Kernel.EvolutionMergeList(ctx, kernel.MergeListRequest{})
	if err != nil || len(assertEvolutionArrayField(t, list, "items")) != 0 {
		t.Fatalf("fresh merge list = %#v, %v", list, err)
	}
	session, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: base})
	if err != nil || session.Status != "up_to_date" {
		t.Fatalf("up-to-date merge = %#v, %v", session, err)
	}
	conflicts, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: session.Session})
	if err != nil || len(assertEvolutionArrayField(t, conflicts, "items")) != 0 {
		t.Fatalf("up-to-date conflicts = %#v, %v", conflicts, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{Session: session.Session, ExpectedRevision: session.Revision}); err != nil {
		t.Fatal(err)
	}

	created, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil || created.State == base {
		t.Fatalf("explicit empty-delta State = %#v, %v", created, err)
	}
	for _, after := range []string{base, created.State} {
		for _, scope := range []string{"all", "ontology", "knowledge"} {
			diff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{Before: base, After: after, Scope: scope})
			if err != nil || len(assertEvolutionArrayField(t, diff, "items")) != 0 || diff.Cursor != "" {
				t.Fatalf("empty %s Diff = %#v, %v", scope, diff, err)
			}
		}
	}
	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{Root: created.State, Scope: "all"})
	if err != nil || len(history.Items) == 0 || history.Items[0].State != created.State || history.Items[0].Change != nil {
		t.Fatalf("empty-delta history = %#v, %v", history, err)
	}
	assertEvolutionArrayField(t, history, "items")
	for _, entry := range history.Items {
		assertEvolutionArrayField(t, entry, "parents")
	}
	assertMainState(t, runtime, created.State)
}

func assertEvolutionArrayField(t *testing.T, value any, field string) []json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(encoded, &object); err != nil {
		t.Fatal(err)
	}
	raw := object[field]
	if len(raw) == 0 || raw[0] != '[' {
		t.Fatalf("public %s must encode an array: %s", field, encoded)
	}
	var array []json.RawMessage
	if err := json.Unmarshal(raw, &array); err != nil {
		t.Fatal(err)
	}
	return array
}
