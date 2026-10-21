//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

// Given-model fixtures validate persistence boundaries, not a universal VLog Schema or event truth.
func TestVLogSkillRecords(t *testing.T) {
	t.Run("distinct-attempts-and-followup-history", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		examples := vlogSkillExamples(t)
		first := applyVLogSkillPatch(t, r, base, addObjectPatch(t, "new:knowledge-node:first", examples["first-attempt"]))
		firstRef := vlogCreatedRef(t, first, "first")
		second := applyVLogSkillPatch(t, r, first.State, addObjectPatch(t, "new:knowledge-node:second", examples["second-attempt"]))
		secondRef := vlogCreatedRef(t, second, "second")
		assertVLogSkillValue(t, r, second.State, firstRef, examples["first-attempt"])
		assertVLogSkillValue(t, r, second.State, secondRef, examples["second-attempt"])
		updated := replaceVLogSkillValue(t, r, second.State, secondRef, examples["verified-followup"])
		assertVLogSkillValue(t, r, updated.State, firstRef, examples["first-attempt"])
		assertVLogSkillValue(t, r, updated.State, secondRef, examples["verified-followup"])
		assertVLogSkillValue(t, r, second.State, secondRef, examples["second-attempt"])
		assertVLogSkillRows(t, r, updated.State, "MATCH (v:ExampleVLog) RETURN v.entryKey, v.eventKey, v.runKey ORDER BY v.entryKey", [][]any{{"L1", "INC-1", "RUN-1"}, {"L2", "INC-1", "RUN-2"}})
	})
	t.Run("source-state-and-record-state-are-distinct", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		source := graphExecute(t, r, "source", "CREATE (n:VLogSourceFixture {value:'before'}) RETURN elementId(n)", nil)
		ref := vlogStringCell(t, source.Rows[0][0])
		pinned := graphExecute(t, r, "source", "MATCH (n:VLogSourceFixture) SET n.value='applied'", nil)
		value := vlogSkillRecord(t, "TRACE", "INC-TRACE", "RUN-TRACE", "Source change applied; separately recorded.")
		for name, text := range map[string]string{"sourceInstance": "isolated-test-instance", "sourceBranch": "source", "sourceState": pinned.State, "sourceRef": ref} {
			vlogSetString(t, &value, name, text)
		}
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: pinned.State, Patch: addObjectPatch(t, "new:knowledge-node:wrong-base", value)})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
			t.Fatalf("source State used as VLog baseline: %v", err)
		}
		assertVLogHead(t, r, base)
		saved := applyVLogSkillPatch(t, r, base, addObjectPatch(t, "new:knowledge-node:trace", value))
		if saved.State == pinned.State || saved.State == base {
			t.Fatal("record and source commits conflated")
		}
		assertVLogSkillValue(t, r, saved.State, vlogCreatedRef(t, saved, "trace"), value)
		if _, err := r.Kernel.ReadObject(context.Background(), saved.State, ref); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
			t.Fatalf("source object was implicitly imported: %v", err)
		}
		later := graphExecute(t, r, "source", "MATCH (n:VLogSourceFixture) SET n.value='later'", nil)
		assertVLogSkillRows(t, r, pinned.State, "MATCH (n:VLogSourceFixture) RETURN n.value", [][]any{{"applied"}})
		assertVLogSkillRows(t, r, later.State, "MATCH (n:VLogSourceFixture) RETURN n.value", [][]any{{"later"}})
		assertVLogHead(t, r, saved.State)
		assertVLogSkillValue(t, r, saved.State, vlogCreatedRef(t, saved, "trace"), value)
	})
	t.Run("source-success-survives-recording-rejection", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		source := graphExecute(t, r, "source", "CREATE (:VLogSourceFixture {value:'applied'})", nil)
		invalid := vlogSkillRecord(t, "BAD", "INC-BAD", "RUN-BAD", "removed below")
		delete(invalid.KnowledgeNode.Properties, "narrative")
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: base, Patch: addObjectPatch(t, "new:knowledge-node:invalid", invalid)})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
			t.Fatalf("invalid record must fail structurally: %v", err)
		}
		assertVLogHead(t, r, base)
		head, err := r.Database.ResolveState(context.Background(), "branch/source")
		if err != nil || head != source.State {
			t.Fatalf("record failure rolled back source: %s %v", head, err)
		}
		assertVLogSkillRows(t, r, head, "MATCH (n:VLogSourceFixture) RETURN n.value", [][]any{{"applied"}})
		assertVLogSkillRows(t, r, base, "MATCH (v:ExampleVLog) RETURN count(v)", [][]any{{float64(0)}})
	})
	t.Run("cross-snapshot-endpoint-is-not-a-local-edge", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		source := graphExecute(t, r, "source", "CREATE (n:VLogSourceFixture {value:'evidence'}) RETURN elementId(n)", nil)
		sourceRef := vlogStringCell(t, source.Rows[0][0])
		node := vlogSkillRecord(t, "CROSS", "INC-CROSS", "RUN-CROSS", "Cross-snapshot reference is not an endpoint.")
		// Request-local aliases belong in input Patch YAML, not canonical stored Object values.
		rel := fmt.Sprintf("type: \"VLOG_TEST_LINK\"\nstart: \"new:knowledge-node:record\"\nend: %q\nproperties:\n  purpose: \"evidence\"\n", sourceRef)
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: base, Patch: addObjectPatch(t, "new:knowledge-node:record", node) + addRawObjectPatch("new:knowledge-relationship:link", rel)})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
			t.Fatalf("missing target-snapshot endpoint must fail for identity lookup: %v", err)
		}
		t.Logf("missing target-snapshot endpoint rejected: code=%s", kernel.AsPublicError(err).Code)
		assertVLogHead(t, r, base)
		assertVLogSkillRows(t, r, base, "MATCH (v:ExampleVLog) RETURN count(v)", [][]any{{float64(0)}})
		assertVLogSkillRows(t, r, source.State, "MATCH (n:VLogSourceFixture) RETURN n.value", [][]any{{"evidence"}})
	})
	t.Run("concurrent-record-update-preserves-other-evidence", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		value := vlogSkillRecord(t, "UPDATE", "INC-U", "RUN-U", "Outcome unknown.")
		created := applyVLogSkillPatch(t, r, base, addObjectPatch(t, "new:knowledge-node:record", value))
		ref := vlogCreatedRef(t, created, "record")
		old := vlogReadValue(t, r, created.State, ref)
		concurrent := vlogReadValue(t, r, created.State, ref)
		vlogSetString(t, &concurrent, "annotation", "Other observer evidence; preserve.")
		advanced := replaceVLogSkillValue(t, r, created.State, ref, concurrent)
		stale := vlogReadValue(t, r, created.State, ref)
		vlogSetString(t, &stale, "narrative", "Now verified in environment T.")
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: created.State, Patch: replaceObjectPatch(ref, vlogYAML(t, old), vlogYAML(t, stale))})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
			t.Fatalf("stale record replacement: %v", err)
		}
		assertVLogHead(t, r, advanced.State)
		fresh := vlogReadValue(t, r, advanced.State, ref)
		vlogSetString(t, &fresh, "narrative", "Now verified in environment T; previous uncertainty preserved in history.")
		corrected := replaceVLogSkillValue(t, r, advanced.State, ref, fresh)
		assertVLogSkillValue(t, r, corrected.State, ref, fresh)
		assertVLogSkillValue(t, r, created.State, ref, old)
		assertVLogSkillRows(t, r, corrected.State, "MATCH (v:ExampleVLog {entryKey:'UPDATE'}) RETURN v.annotation", [][]any{{"Other observer evidence; preserve."}})
	})
	t.Run("duplicate-delivery-distinct-run-and-semantic-limits", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		first := vlogSkillRecord(t, "CHECK-1", "MAINTENANCE", "DAY-1", "No problems found in checked scope.")
		created := applyVLogSkillPatch(t, r, base, addObjectPatch(t, "new:knowledge-node:first", first))
		ref := vlogCreatedRef(t, created, "first")
		noop := replaceVLogSkillValue(t, r, created.State, ref, first)
		if noop.State != created.State {
			t.Fatal("duplicate observation produced a new State")
		}
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: noop.State, Patch: addObjectPatch(t, "new:knowledge-node:duplicate", first)})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
			t.Fatalf("declared record key uniqueness: %v", err)
		}
		second := vlogSkillRecord(t, "CHECK-2", "MAINTENANCE", "DAY-2", "No problems found in checked scope.")
		saved := applyVLogSkillPatch(t, r, noop.State, addObjectPatch(t, "new:knowledge-node:second", second))
		assertVLogSkillRows(t, r, saved.State, "MATCH (v:ExampleVLog) RETURN v.runKey ORDER BY v.runKey", [][]any{{"DAY-1"}, {"DAY-2"}})
		// Structure cannot independently establish the truth of an overconfident narrative.
		unsupported := vlogSkillRecord(t, "UNSUPPORTED", "INC-X", "RUN-X", "All environments passed, without corresponding test evidence.")
		accepted := applyVLogSkillPatch(t, r, saved.State, addObjectPatch(t, "new:knowledge-node:unsupported", unsupported))
		assertVLogSkillValue(t, r, accepted.State, vlogCreatedRef(t, accepted, "unsupported"), unsupported)
	})
	t.Run("observe-discarded-write-result-without-repeating-source", func(t *testing.T) {
		r, base := newVLogSkillRuntime(t)
		source := graphExecute(t, r, "source", "CREATE (:VLogSourceFixture {value:'once'})", nil)
		value := vlogSkillRecord(t, "RECEIPT", "INC-R", "RUN-R", "Source succeeded; recording separately verified.")
		// Discard a real successful return; this does not inject a real transport timeout.
		if _, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: base, Patch: addObjectPatch(t, "new:knowledge-node:receipt", value)}); err != nil {
			t.Fatal(err)
		}
		head, err := r.Database.ResolveState(context.Background(), "branch/vlog")
		if err != nil || head == base {
			t.Fatalf("read actual recording State: %v", err)
		}
		found := graphQuery(t, r, head, "MATCH (v:ExampleVLog {entryKey:'RECEIPT'}) RETURN elementId(v)", nil)
		if len(found.Rows) != 1 || len(found.Rows[0]) != 1 {
			t.Fatal("actual record is not uniquely identified")
		}
		assertVLogSkillValue(t, r, head, vlogStringCell(t, found.Rows[0][0]), value)
		assertVLogSkillRows(t, r, source.State, "MATCH (n:VLogSourceFixture) RETURN count(n)", [][]any{{float64(1)}})
		current, err := r.Database.ResolveState(context.Background(), "branch/source")
		if err != nil || current != source.State {
			t.Fatal("source changed during recording recovery")
		}
	})
}

func newVLogSkillRuntime(t *testing.T) (*host.Runtime, string) {
	t.Helper()
	for _, name := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(name)); err != nil {
			t.Fatalf("real native fixture %s required: %v", name, err)
		}
	}
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	r, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := r.Close(); err != nil {
			t.Error(err)
		}
	})
	base, err := r.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"source", "vlog"} {
		if _, err := r.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: name, From: base}); err != nil {
			t.Fatal(err)
		}
	}
	model := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: "ExampleVLog", Constraints: []kernel.Constraint{}}}
	for _, name := range []string{"entryKey", "eventKey", "runKey", "narrative"} {
		model.Definition.Properties = append(model.Definition.Properties, kernel.Property{Name: name, Type: "STRING", Required: true, Unique: name == "entryKey"})
	}
	for _, name := range []string{"sourceInstance", "sourceBranch", "sourceState", "sourceRef", "annotation"} {
		model.Definition.Properties = append(model.Definition.Properties, kernel.Property{Name: name, Type: "STRING"})
	}
	from := "new:node-definition:record"
	rel := kernel.ObjectValue{Kind: kernel.KindRelationshipDefinition, Definition: &kernel.Definition{Kind: kernel.KindRelationshipDefinition, Name: "VLOG_TEST_LINK", From: &from, To: nil, Properties: []kernel.Property{{Name: "purpose", Type: "STRING"}}, Constraints: []kernel.Constraint{}}}
	ready, err := r.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "vlog", BaseState: base, Patch: addObjectPatch(t, "new:node-definition:record", model) + addObjectPatch(t, "new:relationship-definition:link", rel)})
	if err != nil {
		t.Fatal(err)
	}
	modelRefs := []string{"node:ExampleVLog", "relationship:VLOG_TEST_LINK"}
	canonical := map[string]string{}
	for _, ref := range modelRefs {
		value, err := r.Kernel.ReadObject(ctx, ready.State, ref)
		if err != nil {
			t.Fatal(err)
		}
		canonical[ref] = string(value.YAML)
	}
	t.Cleanup(func() {
		head, err := r.Database.ResolveState(ctx, "branch/vlog")
		if err != nil {
			t.Error(err)
			return
		}
		for ref, want := range canonical {
			got, err := r.Kernel.ReadObject(ctx, head, ref)
			if err != nil || string(got.YAML) != want {
				t.Errorf("recording changed model %s: %v", ref, err)
			}
		}
		main, err := r.Database.ResolveState(ctx, "branch/main")
		if err != nil || main != base {
			t.Errorf("recording changed main: %v", err)
		}
	})
	return r, ready.State
}

func vlogSkillRecord(t *testing.T, key, event, run, text string) kernel.ObjectValue {
	t.Helper()
	value := kernel.ObjectValue{Kind: kernel.KindKnowledgeNode, KnowledgeNode: &kernel.KnowledgeNode{Labels: []string{"ExampleVLog"}, Properties: map[string]json.RawMessage{}}}
	for name, item := range map[string]string{"entryKey": key, "eventKey": event, "runKey": run, "narrative": text} {
		vlogSetString(t, &value, name, item)
	}
	return value
}

func vlogSetString(t *testing.T, value *kernel.ObjectValue, name, text string) {
	t.Helper()
	raw, err := json.Marshal(text)
	if err != nil {
		t.Fatal(err)
	}
	value.KnowledgeNode.Properties[name] = raw
}

func vlogStringCell(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func vlogYAML(t *testing.T, value kernel.ObjectValue) string {
	t.Helper()
	raw, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func vlogReadValue(t *testing.T, r *host.Runtime, state, ref string) kernel.ObjectValue {
	t.Helper()
	result, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil {
		t.Fatal(err)
	}
	value, err := kernel.ParseObjectYAML(kernel.KindKnowledgeNode, result.YAML)
	if err != nil {
		t.Fatal(err)
	}
	return value
}

func applyVLogSkillPatch(t *testing.T, r *host.Runtime, state, patch string) kernel.PatchResult {
	t.Helper()
	result, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "vlog", BaseState: state, Patch: patch})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func replaceVLogSkillValue(t *testing.T, r *host.Runtime, state, ref string, value kernel.ObjectValue) kernel.PatchResult {
	t.Helper()
	old, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil {
		t.Fatal(err)
	}
	return applyVLogSkillPatch(t, r, state, replaceObjectPatch(ref, string(old.YAML), vlogYAML(t, value)))
}

func vlogCreatedRef(t *testing.T, result kernel.PatchResult, alias string) string {
	t.Helper()
	for _, created := range result.Created {
		if created.Alias == alias {
			return created.Ref
		}
	}
	t.Fatalf("missing created alias %s", alias)
	return ""
}

func assertVLogSkillValue(t *testing.T, r *host.Runtime, state, ref string, want kernel.ObjectValue) {
	t.Helper()
	got, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil || string(got.YAML) != vlogYAML(t, want) {
		t.Fatalf("record round trip %s: got=%s err=%v", ref, got.YAML, err)
	}
}

func assertVLogHead(t *testing.T, r *host.Runtime, want string) {
	t.Helper()
	got, err := r.Database.ResolveState(context.Background(), "branch/vlog")
	if err != nil || got != want {
		t.Fatalf("VLog Head=%s want=%s err=%v", got, want, err)
	}
}

func assertVLogSkillRows(t *testing.T, r *host.Runtime, state, query string, want [][]any) {
	t.Helper()
	result := graphQuery(t, r, state, query, nil)
	if result.State != state {
		t.Fatal("query changed requested State")
	}
	raw, err := json.Marshal(result.Rows)
	if err != nil {
		t.Fatal(err)
	}
	var rows [][]any
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("query %s rows=%v want=%v", query, rows, want)
	}
}
