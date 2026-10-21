//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

// These tests verify real persistence, version and mutation boundaries. They do not
// implement or prove automated semantic duplicate/conflict classification.
func TestMaintenanceSkillEvidence(t *testing.T) {
	t.Run("same-name-different-identity-remains-distinct", func(t *testing.T) {
		r, base := newMaintenanceSkillRuntime(t)
		inserted := graphExecute(t, r, "maintenance", `CREATE
			(:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'}),
			(:MaintenancePerson {scope:'A', personKey:'P2', name:'Alex'}),
			(:MaintenancePerson {scope:'B', personKey:'P1', name:'Alex'})`, nil)
		assertMaintenanceRows(t, r, inserted.State, "MATCH (p:MaintenancePerson) RETURN p.scope, p.personKey, p.name ORDER BY p.scope, p.personKey", [][]any{{"A", "P1", "Alex"}, {"A", "P2", "Alex"}, {"B", "P1", "Alex"}})
		assertMaintenanceRows(t, r, base, "MATCH (p:MaintenancePerson) RETURN count(p)", [][]any{{float64(0)}})
	})
	t.Run("same-key-nodes-retain-distinct-sourced-relations", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		created := graphExecute(t, r, "maintenance", `CREATE
			(a:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'}),
			(b:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'}),
			(x:MaintenanceEvidence {evidenceKey:'X', text:'First appointment', source:'X'}),
			(y:MaintenanceEvidence {evidenceKey:'Y', text:'Second appointment', source:'Y'}),
			(a)-[:MAINTENANCE_TEST_LINK {period:'2024'}]->(x),
			(b)-[:MAINTENANCE_TEST_LINK {period:'2026'}]->(y)`, nil)
		assertMaintenanceRows(t, r, created.State, "MATCH (p:MaintenancePerson)-[r:MAINTENANCE_TEST_LINK]->(e:MaintenanceEvidence) RETURN e.source, r.period ORDER BY e.source", [][]any{{"X", "2024"}, {"Y", "2026"}})
		assertMaintenanceRows(t, r, created.State, "MATCH (p:MaintenancePerson {scope:'A', personKey:'P1'}) RETURN count(p)", [][]any{{float64(2)}})
	})
	t.Run("targeted-correction-preserves-unrelated-values-and-relations", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", `CREATE
			(a:MaintenancePerson {scope:'A', personKey:'P1', name:'Alicia', source:'verified-source'}),
			(b:MaintenancePerson {scope:'A', personKey:'P2', name:'Alex', source:'another-person'}),
			(e:MaintenanceEvidence {evidenceKey:'E1', text:'Independent evidence', source:'source-X'}),
			(a)-[:MAINTENANCE_TEST_LINK {period:'2024'}]->(e)
			RETURN elementId(a)`, nil)
		ref := maintenanceStringCell(t, seed.Rows[0][0])
		before := maintenanceReadValue(t, r, seed.State, ref)
		next := maintenanceReadValue(t, r, seed.State, ref)
		maintenanceSetString(t, &next, "name", "Alex")
		result := maintenanceUpdate(t, r, seed.State, ref, next)
		if result.State == seed.State {
			t.Fatal("correction returned unchanged State")
		}
		assertMaintenanceObject(t, r, result.State, ref, next)
		assertMaintenanceObject(t, r, seed.State, ref, before)
		assertMaintenanceRows(t, r, result.State, "MATCH (p:MaintenancePerson {personKey:'P2'}) RETURN p.name, p.source", [][]any{{"Alex", "another-person"}})
		assertMaintenanceRows(t, r, result.State, "MATCH (p:MaintenancePerson {personKey:'P1'})-[r:MAINTENANCE_TEST_LINK]->(e:MaintenanceEvidence) RETURN p.source, r.period, e.evidenceKey", [][]any{{"verified-source", "2024", "E1"}})
	})
	t.Run("changing-description-does-not-repair-wrong-edge", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", `CREATE
			(p:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex', note:'Wrong edge noted'}),
			(x:MaintenanceEvidence {evidenceKey:'X', text:'Wrong endpoint'}),
			(y:MaintenanceEvidence {evidenceKey:'Y', text:'Correct endpoint'}),
			(p)-[:MAINTENANCE_TEST_LINK {period:'2024'}]->(x)
			RETURN elementId(p)`, nil)
		ref := maintenanceStringCell(t, seed.Rows[0][0])
		next := maintenanceReadValue(t, r, seed.State, ref)
		maintenanceSetString(t, &next, "note", "Corrected description")
		changed := maintenanceUpdate(t, r, seed.State, ref, next)
		assertMaintenanceRows(t, r, changed.State, "MATCH (p:MaintenancePerson)-[:MAINTENANCE_TEST_LINK]->(e:MaintenanceEvidence) RETURN e.evidenceKey", [][]any{{"X"}})
		assertMaintenanceRows(t, r, changed.State, "MATCH (e:MaintenanceEvidence) RETURN e.evidenceKey ORDER BY e.evidenceKey", [][]any{{"X"}, {"Y"}})
		// A successful node mutation cannot be represented as a repaired relationship.
	})
	t.Run("stale-correction-requires-new-base-and-preserves-concurrent-evidence", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", "CREATE (p:MaintenancePerson {scope:'A', personKey:'P1', name:'Alicia', source:'initial'}) RETURN elementId(p)", nil)
		ref := maintenanceStringCell(t, seed.Rows[0][0])
		old := maintenanceReadValue(t, r, seed.State, ref)
		other := maintenanceReadValue(t, r, seed.State, ref)
		maintenanceSetString(t, &other, "source", "other-agent-evidence")
		advanced := maintenanceUpdate(t, r, seed.State, ref, other)
		stale := maintenanceReadValue(t, r, seed.State, ref)
		maintenanceSetString(t, &stale, "name", "Alex")
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "maintenance", BaseState: seed.State, Patch: replaceObjectPatch(ref, maintenanceYAML(t, old), maintenanceYAML(t, stale))})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
			t.Fatalf("stale correction not refused: %v", err)
		}
		assertMaintenanceHead(t, r, advanced.State)
		fresh := maintenanceReadValue(t, r, advanced.State, ref)
		maintenanceSetString(t, &fresh, "name", "Alex")
		final := maintenanceUpdate(t, r, advanced.State, ref, fresh)
		assertMaintenanceObject(t, r, final.State, ref, fresh)
		assertMaintenanceObject(t, r, seed.State, ref, old)
		assertMaintenanceRows(t, r, final.State, "MATCH (p:MaintenancePerson {personKey:'P1'}) RETURN p.name, p.source", [][]any{{"Alex", "other-agent-evidence"}})
	})
	t.Run("invalid-mixed-patch-has-no-partial-delta", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", "CREATE (p:MaintenancePerson {scope:'A', personKey:'P1', name:'Alicia'}) RETURN elementId(p)", nil)
		ref := maintenanceStringCell(t, seed.Rows[0][0])
		old := maintenanceReadValue(t, r, seed.State, ref)
		next := maintenanceReadValue(t, r, seed.State, ref)
		maintenanceSetString(t, &next, "name", "Alex")
		bad := maintenancePerson(t, map[string]string{"scope": "A", "name": "Incomplete"})
		patch := replaceObjectPatch(ref, maintenanceYAML(t, old), maintenanceYAML(t, next)) + addObjectPatch(t, "new:knowledge-node:invalid", bad)
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "maintenance", BaseState: seed.State, Patch: patch})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
			t.Fatalf("invalid partial edit accepted: %v", err)
		}
		assertMaintenanceHead(t, r, seed.State)
		assertMaintenanceObject(t, r, seed.State, ref, old)
		assertMaintenanceRows(t, r, seed.State, "MATCH (p:MaintenancePerson) RETURN p.name", [][]any{{"Alicia"}})
	})
	t.Run("no-change-scoped-check-does-not-need-a-new-commit", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", "CREATE (p:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'}) RETURN elementId(p)", nil)
		ref := maintenanceStringCell(t, seed.Rows[0][0])
		assertMaintenanceRows(t, r, seed.State, "MATCH (p:MaintenancePerson {scope:'A'}) RETURN p.personKey", [][]any{{"P1"}})
		value := maintenanceReadValue(t, r, seed.State, ref)
		same := maintenanceUpdate(t, r, seed.State, ref, value)
		if same.State != seed.State {
			t.Fatalf("no-op mutation created State %s", same.State)
		}
		assertMaintenanceHead(t, r, seed.State)
	})
	t.Run("pinned-evidence-and-moving-world-head", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		first := graphExecute(t, r, "maintenance", "CREATE (:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'})", nil)
		second := graphExecute(t, r, "maintenance", "CREATE (:MaintenancePerson {scope:'A', personKey:'P2', name:'Alex'})", nil)
		assertMaintenanceRows(t, r, first.State, "MATCH (p:MaintenancePerson) RETURN count(p)", [][]any{{float64(1)}})
		assertMaintenanceRows(t, r, second.State, "MATCH (p:MaintenancePerson) RETURN count(p)", [][]any{{float64(2)}})
		assertMaintenanceHead(t, r, second.State)
	})
	t.Run("absence-of-optional-relationship-is-not-storage-inconsistency", func(t *testing.T) {
		r, _ := newMaintenanceSkillRuntime(t)
		seed := graphExecute(t, r, "maintenance", "CREATE (:MaintenancePerson {scope:'A', personKey:'P1', name:'Alex'})", nil)
		assertMaintenanceRows(t, r, seed.State, "MATCH (p:MaintenancePerson)-[:MAINTENANCE_TEST_LINK]->(e:MaintenanceEvidence) RETURN count(e)", [][]any{{float64(0)}})
		assertMaintenanceRows(t, r, seed.State, "MATCH (p:MaintenancePerson) RETURN count(p)", [][]any{{float64(1)}})
		assertMaintenanceHead(t, r, seed.State)
	})
}

func newMaintenanceSkillRuntime(t *testing.T) (*host.Runtime, string) {
	t.Helper()
	for _, envName := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(envName)); err != nil {
			t.Fatalf("required real native fixture %s: %v", envName, err)
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
	person := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: "MaintenancePerson", Constraints: []kernel.Constraint{}}}
	for _, key := range []string{"scope", "personKey", "name"} {
		person.Definition.Properties = append(person.Definition.Properties, kernel.Property{Name: key, Type: "STRING", Required: true})
	}
	for _, key := range []string{"note", "source", "period"} {
		person.Definition.Properties = append(person.Definition.Properties, kernel.Property{Name: key, Type: "STRING"})
	}
	evidence := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: "MaintenanceEvidence", Properties: []kernel.Property{{Name: "evidenceKey", Type: "STRING", Required: true}, {Name: "text", Type: "STRING", Required: true}, {Name: "source", Type: "STRING"}}, Constraints: []kernel.Constraint{}}}
	from, to := "new:node-definition:person", "new:node-definition:evidence"
	link := kernel.ObjectValue{Kind: kernel.KindRelationshipDefinition, Definition: &kernel.Definition{Kind: kernel.KindRelationshipDefinition, Name: "MAINTENANCE_TEST_LINK", From: &from, To: &to, Properties: []kernel.Property{{Name: "period", Type: "STRING"}}, Constraints: []kernel.Constraint{}}}
	modelState, err := r.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: base, Patch: addObjectPatch(t, "new:node-definition:person", person) +
		addObjectPatch(t, "new:node-definition:evidence", evidence) +
		addObjectPatch(t, "new:relationship-definition:link", link)})
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"maintenance", "reference"} {
		if _, err := r.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: name, From: modelState.State}); err != nil {
			t.Fatal(err)
		}
	}
	modelBefore := map[string]string{}
	for _, ref := range []string{"node:MaintenancePerson", "node:MaintenanceEvidence", "relationship:MAINTENANCE_TEST_LINK"} {
		value, err := r.Kernel.ReadObject(ctx, modelState.State, ref)
		if err != nil {
			t.Fatal(err)
		}
		modelBefore[ref] = string(value.YAML)
	}
	t.Cleanup(func() {
		for _, name := range []string{"main", "reference"} {
			state, err := r.Database.ResolveState(ctx, "branch/"+name)
			if err != nil || state != modelState.State {
				t.Errorf("maintenance moved unrelated Branch %s: %s %v", name, state, err)
			}
		}
		head, err := r.Database.ResolveState(ctx, "branch/maintenance")
		if err != nil {
			t.Error(err)
			return
		}
		for ref, want := range modelBefore {
			got, err := r.Kernel.ReadObject(ctx, head, ref)
			if err != nil || string(got.YAML) != want {
				t.Errorf("maintenance changed schema %s: %v", ref, err)
			}
		}
	})
	return r, modelState.State
}

func maintenancePerson(t *testing.T, fields map[string]string) kernel.ObjectValue {
	t.Helper()
	props := map[string]json.RawMessage{}
	for name, value := range fields {
		raw, err := json.Marshal(value)
		if err != nil {
			t.Fatal(err)
		}
		props[name] = raw
	}
	return kernel.ObjectValue{Kind: kernel.KindKnowledgeNode, KnowledgeNode: &kernel.KnowledgeNode{Labels: []string{"MaintenancePerson"}, Properties: props}}
}

func maintenanceStringCell(t *testing.T, raw json.RawMessage) string {
	t.Helper()
	var text string
	if err := json.Unmarshal(raw, &text); err != nil {
		t.Fatal(err)
	}
	return text
}

func maintenanceReadValue(t *testing.T, r *host.Runtime, state, ref string) kernel.ObjectValue {
	t.Helper()
	value, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := kernel.ParseObjectYAML(kernel.KindKnowledgeNode, value.YAML)
	if err != nil {
		t.Fatal(err)
	}
	return parsed
}

func maintenanceSetString(t *testing.T, value *kernel.ObjectValue, key, text string) {
	t.Helper()
	raw, err := json.Marshal(text)
	if err != nil {
		t.Fatal(err)
	}
	value.KnowledgeNode.Properties[key] = raw
}

func maintenanceYAML(t *testing.T, value kernel.ObjectValue) string {
	t.Helper()
	body, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(body)
}

func maintenanceUpdate(t *testing.T, r *host.Runtime, state, ref string, next kernel.ObjectValue) kernel.PatchResult {
	t.Helper()
	prev, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil {
		t.Fatal(err)
	}
	result, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "maintenance", BaseState: state, Patch: replaceObjectPatch(ref, string(prev.YAML), maintenanceYAML(t, next))})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func assertMaintenanceObject(t *testing.T, r *host.Runtime, state, ref string, want kernel.ObjectValue) {
	t.Helper()
	got, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil || string(got.YAML) != maintenanceYAML(t, want) {
		t.Fatalf("object %s: actual=%s err=%v", ref, got.YAML, err)
	}
}

func assertMaintenanceHead(t *testing.T, r *host.Runtime, want string) {
	t.Helper()
	got, err := r.Database.ResolveState(context.Background(), "branch/maintenance")
	if err != nil || got != want {
		t.Fatalf("Head=%s want=%s err=%v", got, want, err)
	}
}

func assertMaintenanceRows(t *testing.T, r *host.Runtime, state, query string, want [][]any) {
	t.Helper()
	got := graphQuery(t, r, state, query, nil)
	if got.State != state {
		t.Fatalf("query returned wrong State: %s", got.State)
	}
	raw, err := json.Marshal(got.Rows)
	if err != nil {
		t.Fatal(err)
	}
	var rows [][]any
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("query %s: got=%v want=%v", query, rows, want)
	}
}
