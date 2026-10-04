//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase14NumericMergePropertyProjectionPaginationAndChoices(t *testing.T) {
	runtime := openNumericMergeRuntime(t)
	ctx := context.Background()
	seeded := executeNumericMergeGraph(t, runtime, "main",
		"UNWIND range(0, 21) AS ordinal CREATE (n {ordinal:ordinal, score:$score, negative:$negative}) RETURN elementId(n) AS ref",
		`{"score":1.0,"negative":-0.0}`,
	)
	if len(seeded.Rows) != 22 {
		t.Fatalf("numeric fixture has %d Nodes", len(seeded.Rows))
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "numeric-source", From: seeded.State}); err != nil {
		t.Fatal(err)
	}
	update := "MATCH (n) WHERE n.ordinal >= 0 SET n.score=$score, n.negative=$negative FINISH"
	ours := executeNumericMergeGraph(t, runtime, "main", update, `{"score":1,"negative":0}`)
	theirs := executeNumericMergeGraph(t, runtime, "numeric-source", update, `{"score":2.0,"negative":-0.0}`)
	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: theirs.State})
	if err != nil || started.Status != "conflicted" || started.Unresolved != 22 {
		t.Fatalf("numeric merge start = %#v, %v", started, err)
	}
	first, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session, Limit: 20})
	if err != nil || len(first.Items) != 20 || first.Cursor == "" || first.Revision != started.Revision {
		t.Fatalf("numeric conflict first page = %#v, %v", first, err)
	}
	second, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session, Limit: 20, Cursor: first.Cursor})
	if err != nil || len(second.Items) != 2 || second.Cursor != "" || second.Revision != started.Revision {
		t.Fatalf("numeric conflict second page = %#v, %v", second, err)
	}
	items := append(append([]kernel.MergeConflict{}, first.Items...), second.Items...)
	wantScores := map[string]string{}
	seen := map[string]bool{}
	resolutions := make([]kernel.MergeResolution, 0, len(items))
	for index, conflict := range items {
		if conflict.Kind != kernel.KindKnowledgeNode || conflict.Path != "/properties/score" ||
			conflict.BaseRef != conflict.OursRef || conflict.OursRef != conflict.TheirsRef ||
			string(conflict.Base) != "1.0" || string(conflict.Ours) != "1" || string(conflict.Theirs) != "2.0" || seen[conflict.ConflictID] {
			t.Fatalf("typed scalar conflict or identity changed: %#v", conflict)
		}
		seen[conflict.ConflictID] = true
		resolution := kernel.MergeResolution{ConflictID: conflict.ConflictID}
		switch index % 3 {
		case 0:
			resolution.Choice = "ours"
			wantScores[conflict.OursRef] = "1"
		case 1:
			resolution.Choice = "theirs"
			wantScores[conflict.OursRef] = "2.0"
		case 2:
			resolution.Choice, resolution.Value = "value", json.RawMessage("3.0")
			wantScores[conflict.OursRef] = "3.0"
		}
		resolutions = append(resolutions, resolution)
	}
	for _, invalid := range []struct {
		value json.RawMessage
		code  kernel.ErrorCode
	}{
		{json.RawMessage(`{"score":3.0,"negative":-0.0}`), kernel.CodeType},
		{json.RawMessage(`{"$type":"Vector","elementType":"F64","values":[1.0]}`), kernel.CodeUnsupportedOperation},
	} {
		if _, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
			Session: started.Session, ExpectedRevision: started.Revision,
			Resolutions: []kernel.MergeResolution{{ConflictID: items[0].ConflictID, Choice: "value", Value: invalid.value}},
		}); err == nil || kernel.AsPublicError(err).Code != invalid.code {
			t.Fatalf("invalid scalar value changed candidate: %v", err)
		}
		unchanged, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: started.Session})
		if err != nil || unchanged.Revision != started.Revision || unchanged.Unresolved != 22 {
			t.Fatalf("invalid scalar changed Session: %#v, %v", unchanged, err)
		}
		assertMainState(t, runtime, ours.State)
	}
	if _, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: started.Revision + 1, Resolutions: resolutions,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("wrong expected revision accepted: %v", err)
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: started.Revision, Resolutions: resolutions,
	})
	if err != nil || resolved.Unresolved != 0 || resolved.Status != "ready" || resolved.Revision <= started.Revision {
		t.Fatalf("resolve numeric choices = %#v, %v", resolved, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 20, Cursor: first.Cursor,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale scalar cursor accepted: %v", err)
	}
	stored, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session, Limit: 100})
	if err != nil || len(stored.Items) != 22 || stored.Revision != resolved.Revision {
		t.Fatalf("resolved scalar conflicts = %#v, %v", stored, err)
	}
	for _, conflict := range stored.Items {
		if conflict.Resolution == nil || conflict.Path != "/properties/score" ||
			(conflict.Resolution.Choice == "value" && string(conflict.Resolution.Value) != "3.0") {
			t.Fatalf("stored typed scalar resolution changed: %#v", conflict)
		}
	}
	if _, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: started.Revision,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale numeric finalize accepted: %v", err)
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: started.Session, ExpectedRevision: resolved.Revision})
	if err != nil || finalized.Status != "merged" {
		t.Fatalf("finalize numeric property merge = %#v, %v", finalized, err)
	}
	assertNumericMergeParents(t, runtime, finalized.State, ours.State, theirs.State)
	result, err := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
		At: finalized.State, Cypher: "MATCH (n) WHERE n.ordinal >= 0 RETURN elementId(n) AS ref, n.score AS score, n.negative AS negative",
	})
	if err != nil || len(result.Rows) != 22 {
		t.Fatalf("merged numeric Nodes = %#v, %v", result, err)
	}
	for _, row := range result.Rows {
		if len(row) != 3 || string(row[1]) != wantScores[graphString(t, row[0])] || string(row[2]) != "0" {
			t.Fatalf("scalar choice changed unrelated negative or selected family: %s", row)
		}
	}
	historical, err := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
		At: seeded.State, Cypher: "MATCH (n) WHERE n.ordinal=0 RETURN n.score AS score, n.negative AS negative",
	})
	if err != nil || len(historical.Rows) != 1 || string(historical.Rows[0][0]) != "1.0" || string(historical.Rows[0][1]) != "-0.0" {
		t.Fatalf("historical numeric family changed: %#v, %v", historical, err)
	}
}

func TestPhase14RelationshipMergeScalarKeysAndExplicitPropertyDeletion(t *testing.T) {
	runtime := openNumericMergeRuntime(t)
	ctx := context.Background()
	seeded := executeNumericMergeGraph(t, runtime, "main",
		"CREATE (a), (b), (a)-[r:LINK {score:$score, negative:$negative, `a~/b`:$special}]->(b) RETURN elementId(r) AS ref",
		`{"score":1.0,"negative":-0.0,"special":10}`,
	)
	if len(seeded.Rows) != 1 || len(seeded.Rows[0]) != 1 {
		t.Fatalf("Relationship fixture = %#v", seeded)
	}
	ref := graphString(t, seeded.Rows[0][0])
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "numeric-source", From: seeded.State}); err != nil {
		t.Fatal(err)
	}
	update := "MATCH ()-[r:LINK]->() SET r.score=$score, r.negative=$negative, r.`a~/b`=$special FINISH"
	ours := executeNumericMergeGraph(t, runtime, "main", update, `{"score":1,"negative":0,"special":11}`)
	theirs := executeNumericMergeGraph(t, runtime, "numeric-source", update, `{"score":2.0,"negative":-0.0,"special":12}`)
	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: theirs.State})
	if err != nil || started.Unresolved != 2 {
		t.Fatalf("Relationship merge start = %#v, %v", started, err)
	}
	conflicts, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session})
	if err != nil || len(conflicts.Items) != 2 {
		t.Fatalf("two public Property conflicts = %#v, %v", conflicts, err)
	}
	resolutions := []kernel.MergeResolution{}
	for _, conflict := range conflicts.Items {
		if conflict.Kind != kernel.KindKnowledgeRelationship || conflict.OursRef != ref || conflict.TheirsRef != ref {
			t.Fatalf("Relationship property identity = %#v", conflict)
		}
		value := json.RawMessage("null")
		switch conflict.Path {
		case "/properties/score":
			value = json.RawMessage("4.0")
			if string(conflict.Base) != "1.0" || string(conflict.Ours) != "1" || string(conflict.Theirs) != "2.0" {
				t.Fatalf("Relationship numeric family = %#v", conflict)
			}
		case "/properties/a~0~1b":
			if string(conflict.Base) != "10" || string(conflict.Ours) != "11" || string(conflict.Theirs) != "12" {
				t.Fatalf("escaped Property pointed to wrong value: %#v", conflict)
			}
		default:
			t.Fatalf("unescaped or internal Property path: %#v", conflict)
		}
		resolutions = append(resolutions, kernel.MergeResolution{ConflictID: conflict.ConflictID, Choice: "value", Value: value})
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{Session: started.Session, ExpectedRevision: conflicts.Revision, Resolutions: resolutions})
	if err != nil || resolved.Unresolved != 0 {
		t.Fatalf("resolve scalar Relationship values = %#v, %v", resolved, err)
	}
	stored, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session})
	if err != nil || stored.Revision != resolved.Revision || len(stored.Items) != 2 {
		t.Fatalf("stored Relationship scalar resolutions = %#v, %v", stored, err)
	}
	for _, conflict := range stored.Items {
		want := "4.0"
		if conflict.Path == "/properties/a~0~1b" {
			want = "null"
		}
		if conflict.Resolution == nil || conflict.Resolution.Choice != "value" || string(conflict.Resolution.Value) != want {
			t.Fatalf("stored Property deletion/value lost: %#v", conflict)
		}
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: started.Session, ExpectedRevision: resolved.Revision})
	if err != nil || finalized.Status != "merged" {
		t.Fatalf("finalize Relationship scalar merge = %#v, %v", finalized, err)
	}
	assertNumericMergeParents(t, runtime, finalized.State, ours.State, theirs.State)
	read, err := runtime.Kernel.ReadObject(ctx, finalized.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	var relationship kernel.KnowledgeRelationship
	if err := json.Unmarshal(read.JSON, &relationship); err != nil || string(relationship.Properties["score"]) != "4.0" ||
		string(relationship.Properties["negative"]) != "0" || len(relationship.Properties) != 2 {
		t.Fatalf("scalar resolution modified unrelated Relationship properties: %s, %v", read.JSON, err)
	}
}

func openNumericMergeRuntime(t *testing.T) *runtimehost.Runtime {
	t.Helper()
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	runtime, err := openKernelIntegrationRuntime(context.Background(), home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	return runtime
}

func executeNumericMergeGraph(t *testing.T, runtime *runtimehost.Runtime, branch, cypher, params string) kernel.GraphExecuteResult {
	t.Helper()
	result, err := runtime.Kernel.ExecuteGraph(context.Background(), kernel.GraphExecuteRequest{Branch: branch, Cypher: cypher, Params: json.RawMessage(params)})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func assertNumericMergeParents(t *testing.T, runtime *runtimehost.Runtime, state, ours, theirs string) {
	t.Helper()
	assertMainState(t, runtime, state)
	get, err := runtime.Kernel.EvolutionGet(context.Background(), kernel.EvolutionGetRequest{State: state})
	if err != nil || get.Consistency.Status != "valid" || !reflect.DeepEqual(get.Parents, []string{ours, theirs}) {
		t.Fatalf("numeric merge has invalid Snapshot/parents = %#v, %v", get, err)
	}
}
