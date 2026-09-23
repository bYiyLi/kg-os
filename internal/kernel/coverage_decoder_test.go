package kernel

import (
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func decoderSnapshot() *snapshot {
	return &snapshot{
		State:   "commit/" + "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		Domains: map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{
			{Kind: KindNodeDefinition, Name: "N"}: {
				Value: Definition{
					Kind: KindNodeDefinition,
					Name: "N",
					Properties: []Property{
						{Name: "p", Type: "STRING", Required: true},
						{Name: "q", Type: "STRING"},
						{Name: "n", Type: "INTEGER"},
					},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
			{Kind: KindNodeDefinition, Name: "M"}: {
				Value: Definition{
					Kind: KindNodeDefinition,
					Name: "M",
					Properties: []Property{
						{Name: "p", Type: "STRING"},
						{Name: "q", Type: "STRING"},
					},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
			{Kind: KindRelationshipDefinition, Name: "R"}: {
				Value: Definition{
					Kind:        KindRelationshipDefinition,
					Name:        "R",
					Properties:  []Property{{Name: "p", Type: "STRING", Required: true}},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
		},
	}
}

func constraintRowFor(
	name string,
	typeName string,
	entityType string,
	targets []string,
	properties []string,
	classification string,
) resultRow {
	return resultRow{
		"name":           mustJSON(name),
		"type":           mustJSON(typeName),
		"entityType":     mustJSON(entityType),
		"labelsOrTypes":  mustJSON(targets),
		"properties":     mustJSON(properties),
		"classification": mustJSON(classification),
		"propertyType":   mustJSON(nil),
	}
}

func indexRowFor(
	name string,
	typeName string,
	entityType string,
	targets []string,
	properties []string,
	options any,
) resultRow {
	return resultRow{
		"name":             mustJSON(name),
		"type":             mustJSON(typeName),
		"entityType":       mustJSON(entityType),
		"labelsOrTypes":    mustJSON(targets),
		"properties":       mustJSON(properties),
		"owningConstraint": mustJSON(nil),
		"options":          mustJSON(options),
	}
}

func validSemanticOptionsForTest() map[string]any {
	return map[string]any{
		"indexConfig": map[string]any{
			"provider": "openai-compatible",
			"providerConfig": map[string]any{
				"base_url":        "https://example.invalid/v1",
				"model":           "m",
				"send_dimensions": false,
				"encoding_format": "float",
				"cache": map[string]any{
					"enabled":   false,
					"path":      "/tmp/kgos-phase02-cache.db",
					"max_bytes": float64(10),
				},
			},
			"dimensions": float64(3),
			"similarity": "cosine",
		},
	}
}

func TestConstraintDecoderClosedProfileCoverage(t *testing.T) {
	t.Parallel()

	for _, row := range []resultRow{
		constraintRowFor("c", "NODE_KEY", "NODE", []string{}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "OTHER", []string{"N"}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "NODE", []string{"Missing"}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_PROPERTY_EXISTENCE", "NODE", []string{"N"}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_PROPERTY_TYPE", "NODE", []string{"N"}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_LABEL_EXISTENCE", "NODE", []string{"N"}, []string{}, "undesignated"),
		constraintRowFor("c", "UNKNOWN", "NODE", []string{"N"}, []string{"p"}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "NODE", []string{"N"}, []string{}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "NODE", []string{"N"}, []string{"missing"}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "NODE", []string{"N"}, []string{"p", "missing"}, "undesignated"),
		constraintRowFor("c", "NODE_KEY", "NODE", []string{"__kgos_internal"}, []string{}, "undesignated"),
	} {
		if err := decodeConstraintRow(decoderSnapshot(), row); err == nil {
			t.Fatalf("invalid Constraint row accepted: %#v", row)
		}
	}
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor("reserved", "NODE_PROPERTY_TYPE", "NODE", []string{"__kgos_internal"}, []string{"x"}, "dependent"),
	); err != nil {
		t.Fatalf("reserved dependent Constraint rejected: %v", err)
	}

	state := decoderSnapshot()
	row := constraintRowFor("named_unique", "NODE_PROPERTY_UNIQUENESS", "NODE", []string{"N"}, []string{"q"}, "undesignated")
	if err := decodeConstraintRow(state, row); err != nil {
		t.Fatalf("named unique: %v", err)
	}
	if got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Properties[1].Constraints; len(got) != 1 {
		t.Fatalf("property Constraint projection = %#v", got)
	}

	state = decoderSnapshot()
	row = constraintRowFor("named_key", "NODE_KEY", "NODE", []string{"N"}, []string{"p", "q"}, "undesignated")
	if err := decodeConstraintRow(state, row); err != nil {
		t.Fatalf("named composite key: %v", err)
	}
	if got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Constraints; len(got) != 1 {
		t.Fatalf("definition Constraint projection = %#v", got)
	}

	state = decoderSnapshot()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	generated, err := lithographGraphConstraintName(ref, []string{"q"}, "unique")
	if err != nil {
		t.Fatal(err)
	}
	if err := decodeConstraintRow(
		state,
		constraintRowFor(generated, "NODE_PROPERTY_UNIQUENESS", "NODE", []string{"N"}, []string{"q"}, "undesignated"),
	); err != nil {
		t.Fatalf("Graph Type unique: %v", err)
	}
	if !state.Definitions[ref].Value.Properties[1].Unique {
		t.Fatal("Graph Type unique did not fold into Property.unique")
	}
	generatedComposite, _ := lithographGraphConstraintName(ref, []string{"p", "q"}, "unique")
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor(generatedComposite, "NODE_PROPERTY_UNIQUENESS", "NODE", []string{"N"}, []string{"p", "q"}, "undesignated"),
	); err == nil {
		t.Fatal("Graph Type composite unique accepted")
	}
	generatedMissing, _ := lithographGraphConstraintName(ref, []string{"missing"}, "unique")
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor(generatedMissing, "NODE_PROPERTY_UNIQUENESS", "NODE", []string{"N"}, []string{"missing"}, "undesignated"),
	); err == nil {
		t.Fatal("Graph Type unique with unknown Property accepted")
	}
	generatedKey, _ := lithographGraphConstraintName(ref, []string{"p"}, "key")
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor(generatedKey, "NODE_KEY", "NODE", []string{"N"}, []string{"p"}, "undesignated"),
	); err == nil {
		t.Fatal("Graph Type KEY accepted")
	}

	state = decoderSnapshot()
	if err := decodeConstraintRow(
		state,
		constraintRowFor("dep_exists", "NODE_PROPERTY_EXISTENCE", "NODE", []string{"N"}, []string{"p"}, "dependent"),
	); err != nil {
		t.Fatalf("dependent existence: %v", err)
	}
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor("dep_exists", "NODE_PROPERTY_EXISTENCE", "NODE", []string{"N"}, []string{"q"}, "dependent"),
	); err == nil {
		t.Fatal("dependent existence disagreement accepted")
	}
	typeRow := constraintRowFor("dep_type", "NODE_PROPERTY_TYPE", "NODE", []string{"N"}, []string{"p"}, "dependent")
	typeRow["propertyType"] = mustJSON("STRING")
	if err := decodeConstraintRow(decoderSnapshot(), typeRow); err != nil {
		t.Fatalf("dependent type: %v", err)
	}
	typeRow["propertyType"] = mustJSON("INTEGER")
	if err := decodeConstraintRow(decoderSnapshot(), typeRow); err == nil {
		t.Fatal("dependent type disagreement accepted")
	}
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor("endpoint", "RELATIONSHIP_SOURCE_LABEL", "RELATIONSHIP", []string{"R"}, []string{}, "dependent"),
	); err != nil {
		t.Fatalf("dependent endpoint rejected: %v", err)
	}
	if err := decodeConstraintRow(
		decoderSnapshot(),
		constraintRowFor("bad_dep", "UNKNOWN", "NODE", []string{"N"}, []string{"p"}, "dependent"),
	); err == nil {
		t.Fatal("unknown dependent Constraint accepted")
	}
}

func TestIndexDecoderClosedProfileCoverage(t *testing.T) {
	t.Parallel()

	owned := indexRowFor("i", "RANGE", "NODE", []string{"N"}, []string{"p"}, map[string]any{})
	owned["owningConstraint"] = mustJSON("c")
	if err := decodeIndexRow(decoderSnapshot(), owned); err != nil {
		t.Fatalf("Constraint-owned Index should be hidden: %v", err)
	}

	invalid := []resultRow{
		indexRowFor("i", "RANGE", "NODE", []string{"__kgos_internal"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "RANGE", "NODE", []string{}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "RANGE", "OTHER", []string{"N"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "RANGE", "NODE", []string{"Missing"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "LOOKUP", "NODE", []string{"N"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "VECTOR", "NODE", []string{"N"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "OTHER", "NODE", []string{"N"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "RANGE", "NODE", []string{"N"}, []string{}, map[string]any{}),
		indexRowFor("i", "TEXT", "NODE", []string{"N"}, []string{"p", "q"}, map[string]any{}),
		indexRowFor("i", "POINT", "NODE", []string{"N"}, []string{"p", "q"}, map[string]any{}),
		indexRowFor("i", "SEMANTIC", "NODE", []string{"N"}, []string{"p", "q"}, validSemanticOptionsForTest()),
		indexRowFor("i", "RANGE", "NODE", []string{"N", "M"}, []string{"p"}, map[string]any{}),
		indexRowFor("i", "RANGE", "NODE", []string{"N"}, []string{"missing"}, map[string]any{}),
		indexRowFor("i", "FULLTEXT", "NODE", []string{"N"}, []string{"n"}, map[string]any{
			"indexConfig": map[string]any{
				"fulltext.analyzer": "unicode61", "fulltext.eventually_consistent": false,
			},
		}),
	}
	for _, row := range invalid {
		if err := decodeIndexRow(decoderSnapshot(), row); err == nil {
			t.Fatalf("invalid Index row accepted: %#v", row)
		}
	}

	state := decoderSnapshot()
	if err := decodeIndexRow(state, indexRowFor(
		"range_p", "RANGE", "NODE", []string{"N"}, []string{"p"}, map[string]any{},
	)); err != nil {
		t.Fatalf("single-property range: %v", err)
	}
	if got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Properties[0].Indexes; len(got) != 1 {
		t.Fatalf("property-local range = %#v", got)
	}

	state = decoderSnapshot()
	if err := decodeIndexRow(state, indexRowFor(
		"range_pq", "RANGE", "NODE", []string{"N"}, []string{"p", "q"}, map[string]any{},
	)); err != nil {
		t.Fatalf("composite range: %v", err)
	}
	if got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Indexes; len(got) != 1 {
		t.Fatalf("definition range = %#v", got)
	}

	fulltextOptions := map[string]any{"indexConfig": map[string]any{
		"fulltext.analyzer": "unicode61", "fulltext.eventually_consistent": false,
	}}
	state = decoderSnapshot()
	if err := decodeIndexRow(state, indexRowFor(
		"shared_text", "FULLTEXT", "NODE", []string{"M", "N"}, []string{"p", "q"}, fulltextOptions,
	)); err != nil {
		t.Fatalf("shared fulltext: %v", err)
	}
	for _, name := range []string{"N", "M"} {
		got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: name}].Value.Indexes
		if len(got) != 1 || len(got[0].Targets) != 2 {
			t.Fatalf("%s shared fulltext = %#v", name, got)
		}
	}

	state = decoderSnapshot()
	if err := decodeIndexRow(state, indexRowFor(
		"semantic_p", "SEMANTIC", "NODE", []string{"N"}, []string{"p"}, validSemanticOptionsForTest(),
	)); err != nil {
		t.Fatalf("semantic: %v", err)
	}
	if got := state.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Properties[0].Indexes; len(got) != 1 ||
		got[0].Type != "vector" {
		t.Fatalf("semantic projection = %#v", got)
	}
}

func TestInternalDecoderClosedProfileCoverage(t *testing.T) {
	t.Parallel()
	stringRaw := func(value any) json.RawMessage { return mustJSON(value) }
	validDomain := taggedNode{
		ElementID:  "d1",
		Labels:     []string{internalLabel, domainLabel},
		Properties: map[string]json.RawMessage{internalNameProperty: stringRaw("D")},
	}
	if got, err := decodeInternalNode(validDomain); err != nil || got.Name != "D" || got.Category != domainLabel {
		t.Fatalf("valid Domain Binding = %#v err=%v", got, err)
	}
	validDefinition := taggedNode{
		ElementID: "n1",
		Labels:    []string{internalLabel, definitionBindingLabel},
		Properties: map[string]json.RawMessage{
			internalNameProperty:  stringRaw("N"),
			internalKindProperty:  stringRaw("node"),
			internalTitleProperty: stringRaw("Title"),
		},
	}
	if got, err := decodeInternalNode(validDefinition); err != nil || got.Kind != "node" || got.Title == nil {
		t.Fatalf("valid Definition Binding = %#v err=%v", got, err)
	}
	invalidNodes := []taggedNode{
		{},
		{ElementID: "x", Labels: []string{domainLabel}, Properties: map[string]json.RawMessage{}},
		{ElementID: "x", Labels: []string{internalLabel}, Properties: map[string]json.RawMessage{}},
		{ElementID: "x", Labels: []string{internalLabel, domainLabel, propertyBindingLabel}, Properties: map[string]json.RawMessage{}},
		{ElementID: "x", Labels: []string{internalLabel, domainLabel}, Properties: map[string]json.RawMessage{"extra": stringRaw("x")}},
		{ElementID: "x", Labels: []string{internalLabel, domainLabel}, Properties: map[string]json.RawMessage{}},
		{ElementID: "x", Labels: []string{internalLabel, domainLabel}, Properties: map[string]json.RawMessage{internalNameProperty: stringRaw(1)}},
		{ElementID: "x", Labels: []string{internalLabel, domainLabel}, Properties: map[string]json.RawMessage{
			internalNameProperty: stringRaw("D"), internalTitleProperty: stringRaw(1),
		}},
		{ElementID: "x", Labels: []string{internalLabel, definitionBindingLabel}, Properties: map[string]json.RawMessage{
			internalNameProperty: stringRaw("N"), internalKindProperty: stringRaw("bad"),
		}},
	}
	for _, node := range invalidNodes {
		if _, err := decodeInternalNode(node); err == nil {
			t.Fatalf("invalid internal node accepted: %#v", node)
		}
	}
	if value, err := taggedStringProperty(map[string]json.RawMessage{}, "x", false); err != nil || value != "" {
		t.Fatalf("optional string = %q err=%v", value, err)
	}
	if value, err := taggedOptionalStringProperty(map[string]json.RawMessage{"x": mustJSON(nil)}, "x"); err != nil || value != nil {
		t.Fatalf("optional null = %#v err=%v", value, err)
	}

	nodeResult := lithograph.Result{
		Columns: []string{"n"},
		Rows:    [][]json.RawMessage{{mustJSON(validDomain)}},
	}
	validProperty := taggedNode{
		ElementID:  "p1",
		Labels:     []string{internalLabel, propertyBindingLabel},
		Properties: map[string]json.RawMessage{internalNameProperty: stringRaw("p")},
	}
	validDefinition.ElementID = "n1"
	validRelationship := taggedRelationship{
		ElementID: "r1", Type: includesType, Start: "d1", End: "n1",
		Properties: map[string]json.RawMessage{},
	}
	_ = validProperty
	_ = validRelationship
	for _, relationship := range []taggedRelationship{
		{ElementID: "r", Type: includesType, Start: "missing", End: "d1", Properties: map[string]json.RawMessage{}},
		{ElementID: "r", Type: includesType, Start: "d1", End: "missing", Properties: map[string]json.RawMessage{}},
		{ElementID: "r", Type: includesType, Start: "d1", End: "d1", Properties: map[string]json.RawMessage{"x": mustJSON(1)}},
		{ElementID: "r", Type: "OTHER", Start: "d1", End: "d1", Properties: map[string]json.RawMessage{}},
	} {
		relResult := lithograph.Result{Columns: []string{"r"}, Rows: [][]json.RawMessage{{mustJSON(relationship)}}}
		if _, _, err := decodeInternalGraphResults(nodeResult, []lithograph.Result{relResult}); err == nil {
			t.Fatalf("invalid internal relationship accepted: %#v", relationship)
		}
	}
}
