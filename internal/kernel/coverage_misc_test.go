package kernel

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestValidateTargetIndexesCoverage(t *testing.T) {
	t.Parallel()
	plan := plannedFromBaseForTest(plannerBaseSnapshot())
	n := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	m := OntologyRef{Kind: KindNodeDefinition, Name: "M"}
	r := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}

	invalid := []map[string]logicalIndex{
		{"i": {Name: "i", Type: "range", Properties: []string{"p"}}},
		{"i": {Name: "i", Type: "fulltext", Targets: []OntologyRef{n, r}, Properties: []string{"p"}}},
		{"i": {Name: "i", Type: "range", Targets: []OntologyRef{{Kind: KindNodeDefinition, Name: "Missing"}}, Properties: []string{"p"}}},
		{"i": {Name: "i", Type: "range", Targets: []OntologyRef{n}, Properties: []string{"missing"}}},
		{"i": {Name: "i", Type: "fulltext", Targets: []OntologyRef{n}, Properties: []string{"p", "missing"}}},
		{"i": {Name: "i", Type: "fulltext", Targets: []OntologyRef{n}, Properties: []string{"n"}}},
		{"i": {Name: "i", Type: "range", Targets: []OntologyRef{n, m}, Properties: []string{"p"}}},
		{"i": {Name: "i", Type: "vector", Targets: []OntologyRef{n}, Properties: []string{"p", "q"}}},
	}
	plan.Objects[n].Value.Definition.Properties = append(
		plan.Objects[n].Value.Definition.Properties,
		Property{Name: "n", Type: "INTEGER"},
	)
	for index, indexes := range invalid {
		if err := validateTargetIndexes(plan, indexes); err == nil {
			t.Fatalf("invalid Index case %d accepted: %#v", index, indexes)
		}
	}
	valid := map[string]logicalIndex{
		"range":    {Name: "range", Type: "range", Targets: []OntologyRef{n}, Properties: []string{"p", "q"}},
		"text":     {Name: "text", Type: "fulltext", Targets: []OntologyRef{n, m}, Properties: []string{"p"}},
		"semantic": {Name: "semantic", Type: "vector", Targets: []OntologyRef{n}, Properties: []string{"p"}},
	}
	if err := validateTargetIndexes(plan, valid); err != nil {
		t.Fatalf("valid target indexes: %v", err)
	}
}

func TestCompilerResultHelpersCoverage(t *testing.T) {
	t.Parallel()
	if _, err := createdInternalID(lithograph.Result{Columns: []string{"id"}}, "x"); err == nil {
		t.Fatal("zero-row internal create accepted")
	}
	if _, err := createdInternalID(lithograph.Result{
		Columns: []string{"other"}, Rows: [][]json.RawMessage{{mustJSON("x")}},
	}, "x"); err == nil {
		t.Fatal("missing id column accepted")
	}
	if _, err := createdInternalID(lithograph.Result{
		Columns: []string{"id"}, Rows: [][]json.RawMessage{{mustJSON("")}},
	}, "x"); err == nil {
		t.Fatal("empty id accepted")
	}
	if got, err := createdInternalID(lithograph.Result{
		Columns: []string{"id"}, Rows: [][]json.RawMessage{{mustJSON("id-1")}},
	}, "x"); err != nil || got != "id-1" {
		t.Fatalf("created id = %q err=%v", got, err)
	}

	if _, err := commitState([]byte("{")); err == nil {
		t.Fatal("malformed commit JSON accepted")
	}
	if _, err := commitState(mustJSON(map[string]any{"commit": "bad"})); err == nil {
		t.Fatal("invalid commit state accepted")
	}
	validState := "commit/" + strings.Repeat("a", 64)
	if got, err := commitState(mustJSON(map[string]any{"commit": validState})); err != nil || got != validState {
		t.Fatalf("commit state = %q err=%v", got, err)
	}
}

func TestPatchOntologyEarlyValidationCoverage(t *testing.T) {
	t.Parallel()
	service := &Service{}
	validState := "commit/" + strings.Repeat("a", 64)
	for _, request := range []PatchRequest{
		{},
		{BaseState: validState},
		{BaseState: validState, Branch: "main"},
	} {
		if _, err := service.PatchOntology(context.Background(), request); err == nil {
			t.Fatalf("invalid Patch request accepted: %#v", request)
		}
	}
}

func TestReferenceAndCompilerHelperCoverage(t *testing.T) {
	t.Parallel()
	if got := graphTypeEndpoint(nil); got != "()" {
		t.Fatalf("nil endpoint = %q", got)
	}
	bad := "bad"
	if got := graphTypeEndpoint(&bad); got != "()" {
		t.Fatalf("bad endpoint = %q", got)
	}
	valid := "node:N"
	if got := graphTypeEndpoint(&valid); got != "(:`N` =>)" {
		t.Fatalf("valid endpoint = %q", got)
	}

	if _, err := lithographGraphConstraintName(OntologyRef{Kind: KindDomain, Name: "D"}, []string{"p"}, "unique"); err == nil {
		t.Fatal("Domain Graph Constraint owner accepted")
	}
	if _, err := lithographGraphConstraintName(OntologyRef{Kind: KindNodeDefinition, Name: "N"}, []string{"p"}, "other"); err == nil {
		t.Fatal("unsupported Graph Constraint kind accepted")
	}

	if sameOntologyRefSet([]OntologyRef{{Kind: KindNodeDefinition, Name: "N"}}, nil) {
		t.Fatal("different Ref set length reported equal")
	}
	left := []OntologyRef{
		{Kind: KindNodeDefinition, Name: "N"},
		{Kind: KindNodeDefinition, Name: "M"},
	}
	right := []OntologyRef{
		{Kind: KindNodeDefinition, Name: "M"},
		{Kind: KindNodeDefinition, Name: "N"},
	}
	if !sameOntologyRefSet(left, right) {
		t.Fatal("same Ref set in different order reported different")
	}
	right[1] = OntologyRef{Kind: KindNodeDefinition, Name: "X"}
	if sameOntologyRefSet(left, right) {
		t.Fatal("different Ref set reported equal")
	}

	if _, err := refFromObject(ObjectValue{Kind: KindDomain}); err == nil {
		t.Fatal("nil Domain body accepted")
	}
	if _, err := refFromObject(ObjectValue{Kind: KindNodeDefinition}); err == nil {
		t.Fatal("nil Definition body accepted")
	}
	if _, err := refFromObject(ObjectValue{Kind: ObjectKind("x")}); err == nil {
		t.Fatal("unsupported Object kind accepted")
	}
	if _, err := refFromObject(ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "__kgos_bad"}}); err == nil {
		t.Fatal("reserved Domain name accepted")
	}
}

func TestConstraintMaterializationCoverage(t *testing.T) {
	t.Parallel()
	n := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	objects := map[OntologyRef]*plannedObject{
		n: {
			Value: ObjectValue{
				Kind: KindNodeDefinition,
				Definition: &Definition{
					Kind: KindNodeDefinition,
					Name: "N",
					Properties: []Property{
						{
							Name: "p", Type: "STRING",
							Constraints: []Constraint{
								{Type: "unique"},
								{Name: "named", Type: "key"},
							},
						},
					},
					Constraints: []Constraint{{Type: "key", Properties: []string{"p"}}},
				},
			},
		},
	}
	if err := materializeAnonymousConstraintNames(objects); err != nil {
		t.Fatalf("materialize: %v", err)
	}
	definition := objects[n].Value.Definition
	if definition.Constraints[0].Name == "" ||
		definition.Properties[0].Constraints[0].Name == "" ||
		definition.Properties[0].Constraints[1].Name != "named" {
		t.Fatalf("materialized constraints = %#v / %#v", definition.Constraints, definition.Properties[0].Constraints)
	}

	conflict := map[OntologyRef]*plannedObject{
		n: {
			Value: ObjectValue{
				Kind: KindNodeDefinition,
				Definition: &Definition{
					Kind: KindNodeDefinition, Name: "N",
					Properties: []Property{
						{Name: "p", Type: "STRING", Constraints: []Constraint{{Name: "same", Type: "unique"}}},
						{Name: "q", Type: "STRING", Constraints: []Constraint{{Name: "same", Type: "unique"}}},
					},
					Constraints: []Constraint{},
				},
			},
		},
	}
	if _, err := collectConstraintSpecs(conflict); err == nil {
		t.Fatal("same Constraint name with different coverage accepted")
	}
}

func TestValidateReferencesCoverage(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	plan := plannedFromBaseForTest(base)
	domainRef := OntologyRef{Kind: KindDomain, Name: "D"}
	rRef := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}

	plan.Objects[domainRef].Value.Domain.Includes = []string{"bad"}
	if err := plan.validateReferences(); err == nil {
		t.Fatal("invalid Domain ref accepted")
	}
	plan = plannedFromBaseForTest(base)
	plan.Objects[domainRef].Value.Domain.Includes = []string{"node:Missing"}
	if err := plan.validateReferences(); err == nil {
		t.Fatal("missing Domain target accepted")
	}
	plan = plannedFromBaseForTest(base)
	wrong := "domain:D"
	plan.Objects[rRef].Value.Definition.From = &wrong
	if err := plan.validateReferences(); err == nil {
		t.Fatal("Relationship endpoint with wrong kind accepted")
	}
	plan = plannedFromBaseForTest(base)
	missing := "node:Missing"
	plan.Objects[rRef].Value.Definition.To = &missing
	if err := plan.validateReferences(); err == nil {
		t.Fatal("missing Relationship endpoint accepted")
	}
}
