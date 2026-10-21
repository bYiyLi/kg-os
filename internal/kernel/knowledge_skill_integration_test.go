//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

// These tests exercise the instance outcomes, not an automated fact checker or model selector.
func TestKnowledgeSkillInstances(t *testing.T) {
	t.Run("evidence-not-truth", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		values := knowledgeSkillExamples(t, "evidence-decisions.md")
		for i, value := range values {
			applied := applyKnowledgeSkillPatch(t, r, state, addObjectPatch(t, fmt.Sprintf("new:knowledge-node:note%d", i), value))
			if len(applied.Created) != 1 {
				t.Fatal("expected exactly one created instance")
			}
			assertKnowledgeSkillValue(t, r, applied.State, applied.Created[0].Ref, value)
			state = applied.State
		}
		// A fabricated certainty also satisfies this Schema: storage success is not semantic validation.
		bad := knowledgeSkillNode("Note", map[string]any{"key": "BAD", "text": "方案 A 已证明适合所有规模。", "status": "verified"})
		applied := applyKnowledgeSkillPatch(t, r, state, addObjectPatch(t, "new:knowledge-node:bad", bad))
		assertKnowledgeSkillRows(t, r, applied.State, "MATCH (n:Note) RETURN n.key AS key, n.status AS status ORDER BY key", [][]any{{"BAD", "verified"}, {"N1", "hypothesis"}, {"N2", "decision"}})
	})

	t.Run("scoped-identity-and-concurrent-update", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		patch := ""
		for alias, data := range map[string]map[string]any{
			"one":   {"directory": "A", "personKey": "P1", "name": "Alex", "email": "a1@example.invalid"},
			"two":   {"directory": "A", "personKey": "P2", "name": "Alex"},
			"other": {"directory": "B", "personKey": "P1", "name": "Alex"},
		} {
			patch += addObjectPatch(t, "new:knowledge-node:"+alias, knowledgeSkillNode("Person", data))
		}
		created := applyKnowledgeSkillPatch(t, r, state, patch)
		ref := knowledgeSkillCreated(t, created, "one")
		before := knowledgeSkillBody(t, r, created.State, ref)
		want := knowledgeSkillExamples(t, "identity-decisions.md")[0]
		target, err := kernel.RenderObjectYAML(want)
		if err != nil {
			t.Fatal(err)
		}
		updated := applyKnowledgeSkillPatch(t, r, created.State, replaceObjectPatch(ref, before, string(target)))
		assertKnowledgeSkillValue(t, r, updated.State, ref, want)
		assertKnowledgeSkillRows(t, r, updated.State, "MATCH (p:Person) RETURN p.directory AS directory, p.personKey AS key, p.name AS name ORDER BY directory, key", [][]any{{"A", "P1", "Alicia"}, {"A", "P2", "Alex"}, {"B", "P1", "Alex"}})
		base := knowledgeSkillBody(t, r, updated.State, ref)
		concurrent := applyKnowledgeSkillPatch(t, r, updated.State, replaceObjectPatch(ref, base, strings.Replace(base, "a1@example.invalid", "new@example.invalid", 1)))
		stalePatch := replaceObjectPatch(ref, base, strings.Replace(base, "Alicia", "Alice", 1))
		_, err = r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "main", BaseState: updated.State, Patch: stalePatch})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
			t.Fatalf("old baseline should fail: %v", err)
		}
		assertMainState(t, r, concurrent.State)
		fresh := knowledgeSkillBody(t, r, concurrent.State, ref)
		rebased := applyKnowledgeSkillPatch(t, r, concurrent.State, replaceObjectPatch(ref, fresh, strings.Replace(fresh, "Alicia", "Alice", 1)))
		assertKnowledgeSkillRows(t, r, rebased.State, "MATCH (p:Person {directory:'A',personKey:'P1'}) RETURN p.name AS name, p.email AS email", [][]any{{"Alice", "new@example.invalid"}})
	})

	t.Run("relationship-episodes-and-replacement", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		patch := addObjectPatch(t, "new:knowledge-node:p1", knowledgeSkillNode("Person", map[string]any{"directory": "A", "personKey": "P1", "name": "Alex"})) +
			addObjectPatch(t, "new:knowledge-node:p2", knowledgeSkillNode("Person", map[string]any{"directory": "A", "personKey": "P2", "name": "Alex"})) +
			addObjectPatch(t, "new:knowledge-node:company", knowledgeSkillNode("Company", map[string]any{"key": "O"}))
		created := applyKnowledgeSkillPatch(t, r, state, patch)
		p1, p2, company := knowledgeSkillCreated(t, created, "p1"), knowledgeSkillCreated(t, created, "p2"), knowledgeSkillCreated(t, created, "company")
		// Distinct known employment events have the same endpoints without being duplicates.
		first := applyKnowledgeSkillPatch(t, r, created.State, addObjectPatch(t, "new:knowledge-relationship:m1", knowledgeSkillRelationship(p1, company, "M1")))
		ref := knowledgeSkillCreated(t, first, "m1")
		body := knowledgeSkillBody(t, r, first.State, ref)
		noop := applyKnowledgeSkillPatch(t, r, first.State, replaceObjectPatch(ref, body, body))
		if noop.State != first.State {
			t.Fatal("repeated identical observation created a new State")
		}
		second := applyKnowledgeSkillPatch(t, r, first.State, addObjectPatch(t, "new:knowledge-relationship:m2", knowledgeSkillRelationship(p1, company, "M2")))
		assertKnowledgeSkillRows(t, r, second.State, "MATCH (:Person {directory:'A',personKey:'P1'})-[r:WORKS_AT]->(:Company {key:'O'}) RETURN r.periodKey AS period ORDER BY period", [][]any{{"M1"}, {"M2"}})
		// A corrected participant may replace the physical relationship; inspect the actual transition.
		old := knowledgeSkillBody(t, r, second.State, ref)
		next, err := kernel.RenderObjectYAML(knowledgeSkillRelationship(p2, company, "M1"))
		if err != nil {
			t.Fatal(err)
		}
		corrected := applyKnowledgeSkillPatch(t, r, second.State, replaceObjectPatch(ref, old, string(next)))
		if len(corrected.Transitions) != 1 || corrected.Transitions[0].From != ref {
			t.Fatalf("missing relationship transition: %+v", corrected.Transitions)
		}
		assertKnowledgeSkillValue(t, r, corrected.State, corrected.Transitions[0].To, knowledgeSkillRelationship(p2, company, "M1"))
		assertKnowledgeSkillRows(t, r, corrected.State, "MATCH (p:Person)-[r:WORKS_AT]->(:Company {key:'O'}) RETURN p.personKey AS person, r.periodKey AS period, r.role AS role ORDER BY period", [][]any{{"P2", "M1", "reviewer"}, {"P1", "M2", "reviewer"}})
	})

	t.Run("update-preserves-unrelated-and-history", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		value := knowledgeSkillNode("Device", map[string]any{"key": "A1", "currentVersion": "1.0", "notes": "保留人工备注"})
		created := applyKnowledgeSkillPatch(t, r, state, addObjectPatch(t, "new:knowledge-node:device", value))
		ref := knowledgeSkillCreated(t, created, "device")
		before := knowledgeSkillBody(t, r, created.State, ref)
		want := knowledgeSkillExamples(t, "update-decisions.md")[0]
		after, err := kernel.RenderObjectYAML(want)
		if err != nil {
			t.Fatal(err)
		}
		updated := applyKnowledgeSkillPatch(t, r, created.State, replaceObjectPatch(ref, before, string(after)))
		assertKnowledgeSkillValue(t, r, updated.State, ref, want)
		assertKnowledgeSkillValue(t, r, created.State, ref, value)
	})

	t.Run("attributed-conflict-without-overwriting-confirmed-value", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		seed := applyKnowledgeSkillPatch(t, r, state, addObjectPatch(t, "new:knowledge-node:device", knowledgeSkillNode("Device", map[string]any{"key": "A1", "currentVersion": "1.0"})))
		patch := ""
		for _, row := range [][3]string{{"R1", "supports X", "source-one"}, {"R2", "does not support X", "source-two"}} {
			patch += addObjectPatch(t, "new:knowledge-node:"+row[0], knowledgeSkillNode("Report", map[string]any{"reportKey": row[0], "subject": "C/T/2.0", "text": row[1], "basis": row[2], "assessedAt": "2026-10-01"}))
		}
		saved := applyKnowledgeSkillPatch(t, r, seed.State, patch)
		assertKnowledgeSkillRows(t, r, saved.State, "MATCH (r:Report) RETURN r.reportKey AS key, r.text AS text, r.basis AS basis ORDER BY key", [][]any{{"R1", "supports X", "source-one"}, {"R2", "does not support X", "source-two"}})
		assertKnowledgeSkillRows(t, r, saved.State, "MATCH (d:Device {key:'A1'}) RETURN d.currentVersion AS version", [][]any{{"1.0"}})
	})

	t.Run("atomic-rejection-has-no-partial-instance", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		good := knowledgeSkillNode("Note", map[string]any{"key": "GOOD", "text": "valid", "status": "reported"})
		bad := knowledgeSkillNode("Note", map[string]any{"key": "BAD", "status": "reported"})
		_, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "main", BaseState: state, Patch: addObjectPatch(t, "new:knowledge-node:good", good) + addObjectPatch(t, "new:knowledge-node:bad", bad)})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
			t.Fatalf("missing mandatory content should reject batch: %v", err)
		}
		assertMainState(t, r, state)
		assertKnowledgeSkillRows(t, r, state, "MATCH (n:Note) RETURN count(n) AS count", [][]any{{float64(0)}})
	})

	t.Run("inspect-without-replaying-unobserved-result", func(t *testing.T) {
		r, state := newKnowledgeSkillRuntime(t)
		ctx := context.Background()
		if _, err := r.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "review", From: state}); err != nil {
			t.Fatal(err)
		}
		want := knowledgeSkillExamples(t, "write-decisions.md")[0]
		// Discard a real success result, NOT a simulated claim of transport fault injection.
		if _, err := r.Kernel.PatchObjects(ctx, kernel.PatchRequest{Branch: "review", BaseState: state, Patch: addObjectPatch(t, "new:knowledge-node:import", want)}); err != nil {
			t.Fatal(err)
		}
		head, err := r.Database.ResolveState(ctx, "branch/review")
		if err != nil || head == state {
			t.Fatalf("read actual target head: %s %v", head, err)
		}
		found, err := r.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{At: head, Cypher: "MATCH (n:Note {key:'I1'}) RETURN elementId(n) AS ref"})
		if err != nil || len(found.Rows) != 1 || len(found.Rows[0]) != 1 {
			t.Fatalf("unique result must be observed: %+v %v", found, err)
		}
		var ref string
		if err := json.Unmarshal(found.Rows[0][0], &ref); err != nil {
			t.Fatal(err)
		}
		assertKnowledgeSkillValue(t, r, head, ref, want)
		assertMainState(t, r, state)
		assertKnowledgeSkillRows(t, r, state, "MATCH (n:Note) RETURN count(n) AS count", [][]any{{float64(0)}})
	})
}

func newKnowledgeSkillRuntime(t *testing.T) (*host.Runtime, string) {
	t.Helper()
	for _, name := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(name)); err != nil {
			t.Fatalf("real fixture %s required: %v", name, err)
		}
	}
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	r, err := openKernelIntegrationRuntime(context.Background(), home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := r.Close(); err != nil {
			t.Error(err)
		}
	})
	base, err := r.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	// Establish existing models before exercising any Knowledge operation; these are not Skill templates.
	definition := func(name string, required, optional []string) kernel.ObjectValue {
		d := &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: name, Constraints: []kernel.Constraint{}}
		for _, key := range required {
			d.Properties = append(d.Properties, kernel.Property{Name: key, Type: "STRING", Required: true})
		}
		for _, key := range optional {
			d.Properties = append(d.Properties, kernel.Property{Name: key, Type: "STRING"})
		}
		if name != "Person" {
			d.Properties[0].Unique = true
		} else {
			// The composite key supplies presence; do not duplicate it as standalone required rules.
			d.Properties[0].Required = false
			d.Properties[1].Required = false
			d.Constraints = []kernel.Constraint{{Name: "person_directory_key", Type: "key", Properties: []string{"directory", "personKey"}}}
		}
		return kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: d}
	}
	models := []kernel.ObjectValue{
		definition("Note", []string{"key", "text", "status"}, []string{"basis"}),
		definition("Person", []string{"directory", "personKey", "name"}, []string{"email"}),
		definition("Company", []string{"key"}, nil),
		definition("Device", []string{"key", "currentVersion"}, []string{"notes"}),
		definition("Report", []string{"reportKey", "subject", "text", "basis", "assessedAt"}, nil),
	}
	patch := ""
	for i, model := range models {
		patch += addObjectPatch(t, fmt.Sprintf("new:node-definition:m%d", i), model)
	}
	from, to := "new:node-definition:m1", "new:node-definition:m2"
	rel := kernel.ObjectValue{Kind: kernel.KindRelationshipDefinition, Definition: &kernel.Definition{Kind: kernel.KindRelationshipDefinition, Name: "WORKS_AT", From: &from, To: &to, Properties: []kernel.Property{{Name: "role", Type: "STRING", Required: true}, {Name: "periodKey", Type: "STRING", Required: true}}, Constraints: []kernel.Constraint{}}}
	patch += addObjectPatch(t, "new:relationship-definition:works", rel)
	ready, err := r.Kernel.PatchOntology(context.Background(), kernel.PatchRequest{Branch: "main", BaseState: base, Patch: patch})
	if err != nil {
		t.Fatalf("fixture create: %v details=%#v", err, kernel.AsPublicError(err).Details)
	}
	refs := []string{"node:Note", "node:Person", "node:Company", "node:Device", "node:Report", "relationship:WORKS_AT"}
	before := map[string]string{}
	for _, ref := range refs {
		before[ref] = knowledgeSkillBody(t, r, ready.State, ref)
	}
	t.Cleanup(func() {
		branches, err := r.Kernel.EvolutionBranchList(context.Background())
		if err != nil {
			t.Error(err)
			return
		}
		for _, branch := range branches.Items {
			head, err := r.Database.ResolveState(context.Background(), "branch/"+branch.Name)
			if err != nil {
				t.Error(err)
				continue
			}
			for _, ref := range refs {
				if knowledgeSkillBody(t, r, head, ref) != before[ref] {
					t.Errorf("Knowledge task changed model %s on %s", ref, branch.Name)
				}
			}
		}
	})
	return r, ready.State
}

func knowledgeSkillNode(label string, values map[string]any) kernel.ObjectValue {
	properties := map[string]json.RawMessage{}
	for key, value := range values {
		raw, err := json.Marshal(value)
		if err != nil {
			panic(err)
		}
		properties[key] = raw
	}
	return kernel.ObjectValue{Kind: kernel.KindKnowledgeNode, KnowledgeNode: &kernel.KnowledgeNode{Labels: []string{label}, Properties: properties}}
}

func knowledgeSkillRelationship(start, end, period string) kernel.ObjectValue {
	return kernel.ObjectValue{Kind: kernel.KindKnowledgeRelationship, KnowledgeRelationship: &kernel.KnowledgeRelationship{Type: "WORKS_AT", Start: start, End: end, Properties: map[string]json.RawMessage{"role": json.RawMessage(`"reviewer"`), "periodKey": json.RawMessage(fmt.Sprintf("%q", period))}}}
}

func applyKnowledgeSkillPatch(t *testing.T, r *host.Runtime, state, patch string) kernel.PatchResult {
	t.Helper()
	result, err := r.Kernel.PatchObjects(context.Background(), kernel.PatchRequest{Branch: "main", BaseState: state, Patch: patch})
	if err != nil {
		t.Fatal(err)
	}
	return result
}

func knowledgeSkillCreated(t *testing.T, result kernel.PatchResult, alias string) string {
	t.Helper()
	for _, created := range result.Created {
		if created.Alias == alias {
			return created.Ref
		}
	}
	t.Fatalf("created alias %s absent", alias)
	return ""
}

func knowledgeSkillBody(t *testing.T, r *host.Runtime, state, ref string) string {
	t.Helper()
	value, err := r.Kernel.ReadObject(context.Background(), state, ref)
	if err != nil {
		t.Fatal(err)
	}
	return string(value.YAML)
}

func assertKnowledgeSkillValue(t *testing.T, r *host.Runtime, state, ref string, want kernel.ObjectValue) {
	t.Helper()
	body, err := kernel.RenderObjectYAML(want)
	if err != nil {
		t.Fatal(err)
	}
	if got := knowledgeSkillBody(t, r, state, ref); got != string(body) {
		t.Fatalf("%s got %s want %s", ref, got, body)
	}
}

func assertKnowledgeSkillRows(t *testing.T, r *host.Runtime, state, query string, want [][]any) {
	t.Helper()
	result, err := r.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{At: state, Cypher: query})
	if err != nil || result.State != state {
		t.Fatalf("query failed: %v", err)
	}
	raw, err := json.Marshal(result.Rows)
	if err != nil {
		t.Fatal(err)
	}
	var got [][]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("query %s got=%v want=%v", query, got, want)
	}
}
