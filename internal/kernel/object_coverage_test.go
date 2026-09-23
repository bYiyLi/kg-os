package kernel

import (
	"context"
	"encoding/json"
	"math"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestPhase04KnowledgeTaggedPropertyValueProfiles(t *testing.T) {
	valid := []struct {
		name   string
		raw    string
		family knowledgePropertyFamily
		want   string
	}{
		{"integer", `{"$type":"Integer","value":"9007199254740992"}`, propertyFamilyInteger, `{"$type":"Integer","value":"9007199254740992"}`},
		{"float nan", `{"$type":"Float","value":"NaN"}`, propertyFamilyFloat, `{"$type":"Float","value":"NaN"}`},
		{"float positive infinity", `{"$type":"Float","value":"Infinity"}`, propertyFamilyFloat, `{"$type":"Float","value":"Infinity"}`},
		{"float negative infinity", `{"$type":"Float","value":"-Infinity"}`, propertyFamilyFloat, `{"$type":"Float","value":"-Infinity"}`},
		{"date", `{"$type":"Date","value":"2026-09-23"}`, propertyFamilyDate, `{"$type":"Date","value":"2026-09-23"}`},
		{"local time", `{"$type":"LocalTime","value":"10:11:12"}`, propertyFamilyLocalTime, `{"$type":"LocalTime","value":"10:11:12"}`},
		{"time", `{"$type":"Time","value":"10:11:12+08:00"}`, propertyFamilyTime, `{"$type":"Time","value":"10:11:12+08:00"}`},
		{"local datetime", `{"$type":"LocalDateTime","value":"2026-09-23T10:11:12"}`, propertyFamilyLocalDateTime, `{"$type":"LocalDateTime","value":"2026-09-23T10:11:12"}`},
		{"duration", `{"$type":"Duration","value":"P1DT2H"}`, propertyFamilyDuration, `{"$type":"Duration","value":"P1DT2H"}`},
		{"uuid", `{"$type":"UUID","value":"550E8400-E29B-41D4-A716-446655440000"}`, propertyFamilyUUID, `{"$type":"UUID","value":"550e8400-e29b-41d4-a716-446655440000"}`},
		{"zoned datetime", `{"$type":"ZonedDateTime","value":"2026-09-23T10:11:12","zone":"Asia/Shanghai"}`, propertyFamilyZonedDateTime, `{"$type":"ZonedDateTime","value":"2026-09-23T10:11:12","zone":"Asia/Shanghai"}`},
	}
	for _, test := range valid {
		t.Run(test.name, func(t *testing.T) {
			got, family, err := normalizeKnowledgePropertyRaw(json.RawMessage(test.raw))
			if err != nil || family != test.family || string(got) != test.want {
				t.Fatalf("got=%s family=%v err=%v want=%s", got, family, err, test.want)
			}
		})
	}

	invalid := []string{
		`{"$type":"Float","value":"1.0"}`,
		`{"$type":"Integer","value":"01"}`,
		`{"$type":"UUID","value":"not-a-uuid"}`,
		`{"$type":"ZonedDateTime","value":"","zone":"UTC"}`,
		`{"$type":"Map","value":{}}`,
		`{"$type":"Node"}`,
		`{"$type":"Relationship"}`,
		`{"$type":"Path"}`,
		`{"$type":"Unknown","value":"x"}`,
		`{"$type":1,"value":"x"}`,
		`{"$type":"Date","value":"x","extra":true}`,
	}
	for _, raw := range invalid {
		if _, _, err := normalizeKnowledgePropertyRaw(json.RawMessage(raw)); err == nil {
			t.Fatalf("invalid tagged value unexpectedly succeeded: %s", raw)
		}
	}

	if string(canonicalFloatRaw(math.NaN())) != `{"$type":"Float","value":"NaN"}` ||
		string(canonicalFloatRaw(math.Inf(1))) != `{"$type":"Float","value":"Infinity"}` ||
		string(canonicalFloatRaw(math.Inf(-1))) != `{"$type":"Float","value":"-Infinity"}` {
		t.Fatal("special Float canonicalization changed")
	}
}

func TestPhase04KnowledgePointProfiles(t *testing.T) {
	valid := []struct {
		name string
		raw  string
		want string
	}{
		{
			"wgs84 longitude normalization",
			`{"$type":"Point","crs":"wgs-84","coordinates":[190,45]}`,
			`{"$type":"Point","coordinates":[-170.0,45.0],"crs":"wgs-84"}`,
		},
		{
			"wgs84 3d",
			`{"$type":"Point","crs":"wgs-84-3d","coordinates":[10,20,30]}`,
			`{"$type":"Point","coordinates":[10.0,20.0,30.0],"crs":"wgs-84-3d"}`,
		},
		{
			"cartesian",
			`{"$type":"Point","crs":"cartesian","coordinates":[1,2]}`,
			`{"$type":"Point","coordinates":[1.0,2.0],"crs":"cartesian"}`,
		},
		{
			"cartesian 3d",
			`{"$type":"Point","crs":"cartesian-3d","coordinates":[1,2,3]}`,
			`{"$type":"Point","coordinates":[1.0,2.0,3.0],"crs":"cartesian-3d"}`,
		},
	}
	for _, test := range valid {
		t.Run(test.name, func(t *testing.T) {
			got, family, err := normalizeKnowledgePropertyRaw(json.RawMessage(test.raw))
			if err != nil || family != propertyFamilyPoint || string(got) != test.want {
				t.Fatalf("got=%s family=%v err=%v want=%s", got, family, err, test.want)
			}
		})
	}
	for _, raw := range []string{
		`{"$type":"Point","crs":"unknown","coordinates":[1,2]}`,
		`{"$type":"Point","crs":"wgs-84","coordinates":[1]}`,
		`{"$type":"Point","crs":"wgs-84","coordinates":[1,91]}`,
		`{"$type":"Point","crs":"cartesian","coordinates":["x",2]}`,
	} {
		if _, _, err := normalizeKnowledgePropertyRaw(json.RawMessage(raw)); err == nil {
			t.Fatalf("invalid Point unexpectedly succeeded: %s", raw)
		}
	}
	if normalizeLongitude(540) != -180 || normalizeLongitude(-190) != 170 || normalizeLongitude(10) != 10 {
		t.Fatal("longitude normalization changed")
	}
}

func TestPhase04KnowledgePropertyPrimitiveAndListBranches(t *testing.T) {
	valid := []struct {
		raw    string
		family knowledgePropertyFamily
		want   string
	}{
		{`true`, propertyFamilyBoolean, `true`},
		{`false`, propertyFamilyBoolean, `false`},
		{`"text"`, propertyFamilyString, `"text"`},
		{`1`, propertyFamilyInteger, `1`},
		{`9007199254740992`, propertyFamilyInteger, `{"$type":"Integer","value":"9007199254740992"}`},
		{`1.5`, propertyFamilyFloat, `1.5`},
		{`1e2`, propertyFamilyFloat, `100.0`},
		{`[1,2,3]`, propertyFamilyList, `[1,2,3]`},
		{`["a","b"]`, propertyFamilyList, `["a","b"]`},
	}
	for _, test := range valid {
		got, family, err := normalizeKnowledgePropertyRaw(json.RawMessage(test.raw))
		if err != nil || family != test.family || string(got) != test.want {
			t.Fatalf("raw=%s got=%s family=%v err=%v want=%s", test.raw, got, family, err, test.want)
		}
	}
	for _, raw := range []string{
		"{",
		"1 2",
		"null",
		"[[1]]",
		"[1,\"x\"]",
		"{}",
		"9223372036854775808",
		"1e999",
		`{"$type":"Integer","value":1}`,
		`{"$type":"Float","value":1}`,
		`{"$type":"Date","value":""}`,
		`{"$type":"Point","crs":1,"coordinates":[1,2]}`,
		`{"$type":"Vector","value":[1,2]}`,
	} {
		if _, _, err := normalizeKnowledgePropertyRaw(json.RawMessage(raw)); err == nil {
			t.Fatalf("invalid primitive/list unexpectedly succeeded: %s", raw)
		}
	}
	if _, _, err := normalizeKnowledgePropertyDecoded(123, true); err == nil {
		t.Fatal("unsupported decoded Go value unexpectedly succeeded")
	}
	if got := canonicalIntegerRaw(-lithographJSSafeInteger - 1); !strings.Contains(string(got), `"$type":"Integer"`) {
		t.Fatalf("large negative integer = %s", got)
	}
}

func TestPhase04KnowledgeYAMLPropertyBranches(t *testing.T) {
	parseNode := func(source string) *yaml.Node {
		t.Helper()
		var document yaml.Node
		if err := yaml.Unmarshal([]byte(source), &document); err != nil {
			t.Fatalf("parse YAML %q: %v", source, err)
		}
		if len(document.Content) == 0 {
			t.Fatalf("empty YAML node for %q", source)
		}
		return document.Content[0]
	}
	valid := []struct {
		source string
		want   string
	}{
		{"true", "true"},
		{"false", "false"},
		{"42", "42"},
		{"1.5", "1.5"},
		{"hello", `"hello"`},
		{"[1, 2]", "[1,2]"},
		{`{$type: Date, value: "2026-09-23"}`, `{"$type":"Date","value":"2026-09-23"}`},
	}
	for _, test := range valid {
		got, _, err := normalizeYAMLKnowledgeProperty(parseNode(test.source), true)
		if err != nil || string(got) != test.want {
			t.Fatalf("YAML %q got=%s err=%v want=%s", test.source, got, err, test.want)
		}
	}
	for _, source := range []string{"null", "[[1]]", "[1, x]", "!custom x"} {
		if _, _, err := normalizeYAMLKnowledgeProperty(parseNode(source), true); err == nil {
			t.Fatalf("invalid YAML Property unexpectedly succeeded: %s", source)
		}
	}
	if _, _, err := normalizeYAMLKnowledgeProperty(parseNode("[1]"), false); err == nil {
		t.Fatal("nested YAML List unexpectedly succeeded")
	}
	if _, err := yamlMappingJSON(&yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Tag: "!!int", Value: "1"},
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"},
		},
	}); err == nil {
		t.Fatal("non-String typed mapping key unexpectedly succeeded")
	}
	if _, err := yamlNodeJSONRaw(&yaml.Node{Kind: yaml.ScalarNode, Tag: "!custom", Value: "x"}); err == nil {
		t.Fatal("custom YAML scalar unexpectedly converted to JSON")
	}
	if _, err := yamlNodeJSONRaw(&yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{
		{Kind: yaml.ScalarNode, Tag: "!custom", Value: "x"},
	}}); err == nil {
		t.Fatal("invalid child in YAML sequence unexpectedly converted")
	}
	if _, err := yamlNodeJSONRaw(&yaml.Node{Kind: yaml.AliasNode}); err == nil {
		t.Fatal("invalid YAML alias unexpectedly converted")
	}
}

func TestPhase04KnowledgePropertyRemainingErrorBranches(t *testing.T) {
	for _, raw := range []string{
		`{"$type":"Integer","value":"1","extra":true}`,
		`{"$type":"Float","value":"NaN","extra":true}`,
		`{"$type":"UUID","value":"550e8400-e29b-41d4-a716-446655440000","extra":true}`,
		`{"$type":"ZonedDateTime","value":"2026-09-23T10:00:00","zone":"UTC","extra":true}`,
		`{"$type":"Point","crs":"cartesian","coordinates":[1,2],"extra":true}`,
		`{"$type":"Date","other":"x"}`,
		`{"$type":"Point","crs":"cartesian","coordinates":[1e999,2]}`,
	} {
		if _, _, err := normalizeKnowledgePropertyRaw(json.RawMessage(raw)); err == nil {
			t.Fatalf("tagged error branch unexpectedly succeeded: %s", raw)
		}
	}
	if _, ok := canonicalUUID("550e8400-e29b-41d4-a716-44665544000g"); ok {
		t.Fatal("UUID with non-hex character unexpectedly accepted")
	}

	for _, test := range []struct {
		name string
		node *yaml.Node
		ok   bool
	}{
		{"null", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}, true},
		{"boolean", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "true"}, true},
		{"invalid boolean", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "maybe"}, false},
		{"integer", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: "7"}, true},
		{"integer overflow", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!int", Value: "9223372036854775808"}, false},
		{"float", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!float", Value: "1.5"}, true},
		{"nan float", &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!float", Value: ".nan"}, false},
		{"mapping", &yaml.Node{Kind: yaml.MappingNode}, true},
		{"unsupported", &yaml.Node{Kind: yaml.DocumentNode}, false},
	} {
		_, err := yamlNodeJSONRaw(test.node)
		if test.ok && err != nil {
			t.Fatalf("%s: %v", test.name, err)
		}
		if !test.ok && err == nil {
			t.Fatalf("%s unexpectedly converted", test.name)
		}
	}
	for _, node := range []*yaml.Node{
		{Kind: yaml.AliasNode},
		{Kind: yaml.ScalarNode, Tag: "!!bool", Value: "maybe"},
		{Kind: yaml.ScalarNode, Tag: "!!int", Value: "9223372036854775808"},
		{Kind: yaml.ScalarNode, Tag: "!!float", Value: "bad"},
		{Kind: yaml.DocumentNode},
	} {
		if _, _, err := normalizeYAMLKnowledgeProperty(node, true); err == nil {
			t.Fatalf("invalid YAML node unexpectedly normalized: %#v", node)
		}
	}
	badMapping := &yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"},
			{Kind: yaml.ScalarNode, Tag: "!custom", Value: "x"},
		},
	}
	if _, err := yamlMappingJSON(badMapping); err == nil {
		t.Fatal("invalid mapping child unexpectedly converted")
	}
}

func TestPhase04KnowledgeSerializationErrorProfiles(t *testing.T) {
	parseDocument := func(source string) *yaml.Node {
		t.Helper()
		var document yaml.Node
		if err := yaml.Unmarshal([]byte(source), &document); err != nil {
			t.Fatalf("parse YAML %q: %v", source, err)
		}
		return &document
	}
	for _, test := range []struct {
		kind ObjectKind
		body string
	}{
		{KindKnowledgeNode, "[]"},
		{KindKnowledgeNode, "properties: {}"},
		{KindKnowledgeNode, "labels: x\nproperties: {}"},
		{KindKnowledgeNode, "labels: [1]\nproperties: {}"},
		{KindKnowledgeNode, "labels: []\nproperties: x"},
		{KindKnowledgeNode, "labels: []\nproperties: {}\nextra: true"},
		{KindKnowledgeRelationship, "start: n:1\nend: n:2\nproperties: {}"},
		{KindKnowledgeRelationship, "type: 1\nstart: n:1\nend: n:2\nproperties: {}"},
		{KindKnowledgeRelationship, "type: KNOWS\nend: n:2\nproperties: {}"},
		{KindKnowledgeRelationship, "type: KNOWS\nstart: n:1\nproperties: {}"},
		{KindKnowledgeRelationship, "type: KNOWS\nstart: n:1\nend: n:2"},
		{KindKnowledgeRelationship, "type: KNOWS\nstart: n:1\nend: n:2\nproperties: {}\nextra: true"},
	} {
		if _, err := parseKnowledgeYAML(test.kind, parseDocument(test.body)); err == nil {
			t.Fatalf("invalid Knowledge YAML unexpectedly succeeded: kind=%s body=%q", test.kind, test.body)
		}
	}
	if _, err := parseKnowledgeYAML(KindDomain, parseDocument("{}")); err == nil {
		t.Fatal("non-Knowledge kind unexpectedly accepted by Knowledge parser")
	}
	if _, err := rawPropertiesFromYAML(&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"}); err == nil {
		t.Fatal("scalar properties unexpectedly accepted")
	}
	if _, err := rawPropertiesFromYAML(&yaml.Node{
		Kind: yaml.MappingNode,
		Content: []*yaml.Node{
			{Kind: yaml.ScalarNode, Tag: "!!int", Value: "1"},
			{Kind: yaml.ScalarNode, Tag: "!!str", Value: "x"},
		},
	}); err == nil {
		t.Fatal("non-String property key unexpectedly accepted")
	}
	if _, err := rawPropertiesYAMLNode(map[string]json.RawMessage{"bad": json.RawMessage("{")}); err == nil {
		t.Fatal("invalid raw JSON property unexpectedly rendered")
	}
	if _, err := jsonRawYAMLNode(json.RawMessage("{")); err == nil {
		t.Fatal("invalid raw JSON unexpectedly rendered to YAML")
	}
	if _, err := jsonRawYAMLNode(json.RawMessage("1 2")); err == nil {
		t.Fatal("trailing raw JSON unexpectedly rendered to YAML")
	}
	for _, value := range []any{
		nil,
		true,
		"string",
		json.Number("1"),
		json.Number("1.5"),
		[]any{json.Number("1"), "x"},
		map[string]any{"a": json.Number("1")},
		map[string]any{"$type": "Date", "value": "2026-09-23"},
	} {
		if _, err := jsonValueYAMLNode(value); err != nil {
			t.Fatalf("jsonValueYAMLNode(%#v): %v", value, err)
		}
	}
	if _, err := jsonValueYAMLNode(struct{}{}); err == nil {
		t.Fatal("unsupported decoded JSON type unexpectedly rendered")
	}
}

func TestPhase04DerivedKnowledgeMaintenanceHelpers(t *testing.T) {
	properties := map[string]json.RawMessage{
		"name": json.RawMessage(`"Alice"`),
	}
	if err := applyDerivedPropertyRenames(
		properties,
		map[string]string{"name": "displayName"},
		"n:1",
	); err != nil {
		t.Fatal(err)
	}
	if _, exists := properties["name"]; exists || string(properties["displayName"]) != `"Alice"` {
		t.Fatalf("renamed properties = %#v", properties)
	}

	properties = map[string]json.RawMessage{
		"name":        json.RawMessage(`"Alice"`),
		"displayName": json.RawMessage(`"Bob"`),
	}
	if err := applyDerivedPropertyRenames(
		properties,
		map[string]string{"name": "displayName"},
		"n:1",
	); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("derived conflict error = %v", err)
	}
	if !equalRawJSON(json.RawMessage(`{"b":2,"a":1}`), json.RawMessage(`{"a":1,"b":2}`)) ||
		equalRawJSON(json.RawMessage(`1`), json.RawMessage(`2`)) {
		t.Fatal("raw JSON equality changed")
	}
	if got := removeString([]string{"A", "B", "C"}, "B"); strings.Join(got, ",") != "A,C" {
		t.Fatalf("removeString = %#v", got)
	}
}

func TestPhase04MergeOntologyDerivedKnowledgeNodeAndRelationship(t *testing.T) {
	personBase := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	humanTarget := OntologyRef{Kind: KindNodeDefinition, Name: "Human"}
	authoredBase := OntologyRef{Kind: KindRelationshipDefinition, Name: "AUTHORED"}
	wroteTarget := OntologyRef{Kind: KindRelationshipDefinition, Name: "WROTE"}
	plan := &plannedState{
		Base: &snapshot{Definitions: map[OntologyRef]*definitionRecord{
			personBase:   {Value: Definition{Kind: KindNodeDefinition, Name: "Person"}},
			authoredBase: {Value: Definition{Kind: KindRelationshipDefinition, Name: "AUTHORED"}},
		}},
		Objects: map[OntologyRef]*plannedObject{
			humanTarget: {
				BaseRef:      &personBase,
				Value:        ObjectValue{Kind: KindNodeDefinition, Definition: &Definition{Kind: KindNodeDefinition, Name: "Human"}},
				PropertyBase: map[string]string{"displayName": "name"},
			},
			wroteTarget: {
				BaseRef:      &authoredBase,
				Value:        ObjectValue{Kind: KindRelationshipDefinition, Definition: &Definition{Kind: KindRelationshipDefinition, Name: "WROTE"}},
				PropertyBase: map[string]string{"year": "since"},
			},
		},
	}
	knowledge := &plannedKnowledgePatch{Mutations: []plannedKnowledgeMutation{
		{
			Operation: patchUpdate,
			Ref:       ObjectRef{Kind: KindKnowledgeNode, ID: "1"},
			Kind:      KindKnowledgeNode,
			Target: &ObjectValue{Kind: KindKnowledgeNode, KnowledgeNode: &KnowledgeNode{
				Labels: []string{"Person"},
				Properties: map[string]json.RawMessage{
					"name": json.RawMessage(`"Alice"`),
				},
			}},
		},
		{
			Operation: patchUpdate,
			Ref:       ObjectRef{Kind: KindKnowledgeRelationship, ID: "2"},
			Kind:      KindKnowledgeRelationship,
			Target: &ObjectValue{Kind: KindKnowledgeRelationship, KnowledgeRelationship: &KnowledgeRelationship{
				Type: "AUTHORED",
				Properties: map[string]json.RawMessage{
					"since": json.RawMessage(`"2026"`),
				},
			}},
		},
	}}
	if err := mergeOntologyDerivedKnowledge(plan, knowledge); err != nil {
		t.Fatal(err)
	}
	node := knowledge.Mutations[0].Target.KnowledgeNode
	if len(node.Labels) != 1 || node.Labels[0] != "Human" ||
		string(node.Properties["displayName"]) != `"Alice"` {
		t.Fatalf("merged node = %#v", node)
	}
	relationship := knowledge.Mutations[1].Target.KnowledgeRelationship
	if relationship.Type != "WROTE" || string(relationship.Properties["year"]) != `"2026"` {
		t.Fatalf("merged relationship = %#v", relationship)
	}
}

func TestPhase04KnowledgePlanningValidationBranches(t *testing.T) {
	service := &Service{}
	node := ObjectValue{
		Kind: KindKnowledgeNode,
		KnowledgeNode: &KnowledgeNode{
			Labels:     []string{"Person", "Person"},
			Properties: map[string]json.RawMessage{},
		},
	}
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&node,
		nil,
		nil,
		false,
	); err == nil || AsPublicError(err).Code != CodeType {
		t.Fatalf("duplicate-label validation = %v", err)
	}

	relationship := ObjectValue{
		Kind: KindKnowledgeRelationship,
		KnowledgeRelationship: &KnowledgeRelationship{
			Type:       "KNOWS",
			Start:      "new:knowledge-node:left",
			End:        "new:knowledge-node:right",
			Properties: map[string]json.RawMessage{},
		},
	}
	aliases := map[string]ObjectKind{
		"new:knowledge-node:left":  KindKnowledgeNode,
		"new:knowledge-node:right": KindKnowledgeNode,
	}
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&relationship,
		aliases,
		nil,
		true,
	); err != nil {
		t.Fatalf("alias endpoint validation: %v", err)
	}
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&relationship,
		map[string]ObjectKind{},
		nil,
		true,
	); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("unknown alias validation = %v", err)
	}
	wrongAliases := map[string]ObjectKind{
		"new:knowledge-node:left":  KindKnowledgeRelationship,
		"new:knowledge-node:right": KindKnowledgeNode,
	}
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&relationship,
		wrongAliases,
		nil,
		true,
	); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("wrong alias kind validation = %v", err)
	}

	deletedEndpoint := ObjectValue{
		Kind: KindKnowledgeRelationship,
		KnowledgeRelationship: &KnowledgeRelationship{
			Type: "KNOWS", Start: "n:1", End: "n:2", Properties: map[string]json.RawMessage{},
		},
	}
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&deletedEndpoint,
		nil,
		map[string]struct{}{"n:1": {}},
		true,
	); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("deleted endpoint validation = %v", err)
	}

	wrongEndpoint := cloneObjectValue(deletedEndpoint)
	wrongEndpoint.KnowledgeRelationship.Start = "r:1"
	if err := service.normalizePlannedKnowledgeValue(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		&wrongEndpoint,
		nil,
		nil,
		true,
	); err == nil || AsPublicError(err).Code != CodeType {
		t.Fatalf("wrong endpoint kind validation = %v", err)
	}

	if !relationshipUsesAlias(plannedKnowledgeMutation{Kind: KindKnowledgeRelationship, Target: &relationship}) {
		t.Fatal("relationship alias was not detected")
	}
	if relationshipUsesAlias(plannedKnowledgeMutation{Kind: KindKnowledgeNode, Target: &node}) {
		t.Fatal("Knowledge Node reported relationship alias")
	}
	if got, err := resolveKnowledgeEndpoint("new:knowledge-node:left", map[string]string{
		"new:knowledge-node:left": "n:7",
	}); err != nil || got != "n:7" {
		t.Fatalf("resolve alias = %q err=%v", got, err)
	}
	if got, err := resolveKnowledgeEndpoint("n:8", nil); err != nil || got != "n:8" {
		t.Fatalf("resolve direct endpoint = %q err=%v", got, err)
	}
	if _, err := resolveKnowledgeEndpoint("r:8", nil); err == nil {
		t.Fatal("relationship endpoint accepted Relationship Ref")
	}

	baseRelationship := ObjectValue{
		Kind: KindKnowledgeRelationship,
		KnowledgeRelationship: &KnowledgeRelationship{
			Type: "KNOWS", Start: "n:1", End: "n:2", Properties: map[string]json.RawMessage{},
		},
	}
	targetRelationship := cloneObjectValue(baseRelationship)
	targetRelationship.KnowledgeRelationship.Type = "LIKES"
	mutation := plannedKnowledgeMutation{
		Operation: patchUpdate,
		Kind:      KindKnowledgeRelationship,
		Base:      &baseRelationship,
		Target:    &targetRelationship,
	}
	if !knowledgeRelationshipNeedsReplacement(mutation) {
		t.Fatal("Relationship type change did not require replacement")
	}
	targetRelationship.KnowledgeRelationship.Type = "KNOWS"
	mutation.Target = &targetRelationship
	if knowledgeRelationshipNeedsReplacement(mutation) {
		t.Fatal("property-only Relationship change required replacement")
	}

	if got := stringDifference([]string{"A", "B", "C"}, []string{"B"}); strings.Join(got, ",") != "A,C" {
		t.Fatalf("stringDifference = %#v", got)
	}

	domain := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "D", Includes: []string{"node:A"}}}
	domainClone := cloneObjectValue(domain)
	domainClone.Domain.Includes[0] = "node:B"
	if domain.Domain.Includes[0] != "node:A" {
		t.Fatal("Domain clone shares Includes storage")
	}
	definition := ObjectValue{
		Kind: KindNodeDefinition,
		Definition: &Definition{
			Kind: KindNodeDefinition, Name: "A",
			Properties: []Property{{Name: "x", Type: "STRING"}},
		},
	}
	definitionClone := cloneObjectValue(definition)
	definitionClone.Definition.Properties[0].Name = "y"
	if definition.Definition.Properties[0].Name != "x" {
		t.Fatal("Definition clone shares Property storage")
	}
}

func TestPhase04KnowledgeModelValidationBranches(t *testing.T) {
	for _, value := range []ObjectValue{
		{Kind: KindDomain},
		{Kind: KindNodeDefinition},
		{Kind: KindKnowledgeNode},
		{Kind: KindKnowledgeRelationship},
		{Kind: ObjectKind("unknown")},
	} {
		if err := normalizeObject(value); err == nil {
			t.Fatalf("invalid Object shape unexpectedly normalized: %#v", value)
		}
	}
	node := &KnowledgeNode{Labels: []string{"Person"}}
	if err := normalizeKnowledgeNode(node); err != nil || node.Properties == nil {
		t.Fatalf("nil Knowledge Node properties normalization = %#v err=%v", node, err)
	}
	for _, label := range []string{"", "__kgos_hidden", "bad\x00label"} {
		if err := normalizeKnowledgeNode(&KnowledgeNode{
			Labels: []string{label}, Properties: map[string]json.RawMessage{},
		}); err == nil {
			t.Fatalf("invalid Knowledge label %q unexpectedly succeeded", label)
		}
	}
	relationship := &KnowledgeRelationship{
		Type: "KNOWS", Start: "n:1", End: "n:2",
	}
	if err := normalizeKnowledgeRelationship(relationship); err != nil || relationship.Properties == nil {
		t.Fatalf("nil Relationship properties normalization = %#v err=%v", relationship, err)
	}
	for _, test := range []KnowledgeRelationship{
		{Type: "", Start: "n:1", End: "n:2", Properties: map[string]json.RawMessage{}},
		{Type: "__kgos_internal", Start: "n:1", End: "n:2", Properties: map[string]json.RawMessage{}},
		{Type: "KNOWS", Start: "r:1", End: "n:2", Properties: map[string]json.RawMessage{}},
		{Type: "KNOWS", Start: "n:1", End: "bad", Properties: map[string]json.RawMessage{}},
	} {
		copyValue := test
		if err := normalizeKnowledgeRelationship(&copyValue); err == nil {
			t.Fatalf("invalid Relationship unexpectedly succeeded: %#v", test)
		}
	}
	for _, identifier := range []string{"", "__kgos_x", "x\x00y"} {
		if err := validateKnowledgeIdentifier(identifier, "test"); err == nil {
			t.Fatalf("invalid Knowledge identifier %q unexpectedly succeeded", identifier)
		}
	}
	for _, properties := range []map[string]json.RawMessage{
		{"": json.RawMessage(`"x"`)},
		{"__kgos_x": json.RawMessage(`"x"`)},
		{"ok": json.RawMessage("null")},
		{"ok": json.RawMessage("{")},
	} {
		if err := validateKnowledgeProperties(properties); err == nil {
			t.Fatalf("invalid Knowledge properties unexpectedly succeeded: %#v", properties)
		}
	}
	properties := map[string]json.RawMessage{"count": json.RawMessage("9007199254740992")}
	if err := validateKnowledgeProperties(properties); err != nil ||
		!strings.Contains(string(properties["count"]), `"$type":"Integer"`) {
		t.Fatalf("canonical Knowledge property = %s err=%v", properties["count"], err)
	}
}

func TestPhase04KnowledgePatchPartitionAndPreflightBranches(t *testing.T) {
	ontology, knowledge, err := partitionObjectPatchEntries(patchDocument{Entries: []patchEntry{
		{Operation: patchAdd, NewTarget: "new:node-definition:a"},
		{Operation: patchAdd, NewTarget: "new:knowledge-node:b"},
		{Operation: patchUpdate, OldTarget: "domain:D"},
		{Operation: patchUpdate, OldTarget: "r:1"},
	}})
	if err != nil || len(ontology) != 2 || len(knowledge) != 2 {
		t.Fatalf("partition ontology=%d knowledge=%d err=%v", len(ontology), len(knowledge), err)
	}
	for _, document := range []patchDocument{
		{Entries: []patchEntry{{Operation: patchAdd, NewTarget: "new:bad-kind:x"}}},
		{Entries: []patchEntry{{Operation: patchUpdate, OldTarget: "bad"}}},
		{Entries: []patchEntry{{
			Operation: patchRename, OldTarget: "n:1", NewTarget: "n:2",
		}}},
	} {
		if _, _, err := partitionObjectPatchEntries(document); err == nil {
			t.Fatalf("invalid partition document unexpectedly succeeded: %#v", document)
		}
	}

	service := &Service{}
	for _, entries := range [][]patchEntry{
		{{Operation: patchAdd, NewTarget: "new:bad-kind:x"}},
		{{Operation: patchAdd, NewTarget: "new:domain:x"}},
		{
			{Operation: patchAdd, NewTarget: "new:knowledge-node:x"},
			{Operation: patchAdd, NewTarget: "new:knowledge-node:x"},
		},
		{{Operation: patchUpdate, OldTarget: "bad"}},
		{{Operation: patchUpdate, OldTarget: "domain:D"}},
		{
			{Operation: patchUpdate, OldTarget: "n:1"},
			{Operation: patchDelete, OldTarget: "n:1"},
		},
	} {
		if _, err := service.planKnowledgePatch(context.Background(), "commit/"+strings.Repeat("a", 64), entries); err == nil {
			t.Fatalf("invalid Knowledge preflight unexpectedly succeeded: %#v", entries)
		}
	}

	addPatch, err := parseGitPatch(
		"diff --git a/new:knowledge-node:x b/new:knowledge-node:x\n" +
			"new file mode 100644\n--- /dev/null\n+++ b/new:knowledge-node:x\n" +
			"@@ -0,0 +1,2 @@\n+labels: []\n+properties: {}\n",
	)
	if err != nil {
		t.Fatal(err)
	}
	mutation, keep, err := service.planKnowledgeEntry(
		context.Background(),
		"commit/"+strings.Repeat("a", 64),
		addPatch.Entries[0],
	)
	if err != nil || !keep || mutation.Kind != KindKnowledgeNode || mutation.Alias != "x" {
		t.Fatalf("planned add = %#v keep=%v err=%v", mutation, keep, err)
	}
	badAdd := addPatch.Entries[0]
	badAdd.NewTarget = "new:bad-kind:x"
	if _, _, err := service.planKnowledgeEntry(context.Background(), "", badAdd); err == nil {
		t.Fatal("bad add target unexpectedly planned")
	}
	badBody := addPatch.Entries[0]
	badBody.Hunks[0].Lines[0] = "+labels: ["
	if _, _, err := service.planKnowledgeEntry(context.Background(), "", badBody); err == nil {
		t.Fatal("invalid add body unexpectedly planned")
	}
}

func TestPhase04ObjectReadPreflightBranches(t *testing.T) {
	service := &Service{}
	for _, request := range []ObjectReadRequest{
		{},
		{At: "branch/main"},
		{At: "branch/main", Refs: append([]string(nil), make([]string, 101)...)},
		{At: "branch/main", Refs: []string{"n:1", "n:1"}},
		{At: "branch/main", Refs: []string{"n:01"}},
	} {
		if _, err := service.ReadObjects(context.Background(), request); err == nil {
			t.Fatalf("invalid Object read preflight unexpectedly reached database: %#v", request)
		}
	}
	if _, err := service.ReadObject(context.Background(), "", "n:1"); err == nil {
		t.Fatal("single Object read without State unexpectedly succeeded")
	}
	if _, err := (&snapshot{}).objectValue(OntologyRef{Kind: KindKnowledgeNode, Name: "x"}); err == nil {
		t.Fatal("Ontology snapshot accepted Knowledge kind")
	}
}

func TestPhase04ObjectJSONParseProfiles(t *testing.T) {
	valid := []struct {
		kind ObjectKind
		body string
	}{
		{KindDomain, `{"name":"D","includes":[]}`},
		{KindNodeDefinition, `{"name":"Person","properties":[{"name":"name","type":"STRING"}],"constraints":[]}`},
		{KindRelationshipDefinition, `{"name":"KNOWS","from":null,"to":null,"properties":[{"name":"since","type":"STRING"}],"constraints":[]}`},
		{KindKnowledgeNode, `{"labels":["Person"],"properties":{"name":"Alice"}}`},
		{KindKnowledgeRelationship, `{"type":"KNOWS","start":"n:1","end":"n:2","properties":{"since":"2026"}}`},
	}
	for _, test := range valid {
		value, err := ParseObjectJSON(test.kind, []byte(test.body))
		if err != nil || value.Kind != test.kind {
			t.Fatalf("ParseObjectJSON(%s) value=%#v err=%v", test.kind, value, err)
		}
	}
	for _, test := range []struct {
		kind ObjectKind
		body string
		code ErrorCode
	}{
		{KindDomain, "{", CodeType},
		{KindDomain, `{"name":"D","includes":[],"extra":true}`, CodeType},
		{KindDomain, `{"name":"D","includes":[]} {}`, CodeParse},
		{KindDomain, `{"name":"","includes":[]}`, CodeType},
		{KindKnowledgeNode, `{"labels":["Person","Person"],"properties":{}}`, CodeType},
		{ObjectKind("unknown"), `{}`, CodeInvalidArgument},
	} {
		_, err := ParseObjectJSON(test.kind, []byte(test.body))
		if err == nil || AsPublicError(err).Code != test.code {
			t.Fatalf("ParseObjectJSON(%s, %q) error=%v want=%s", test.kind, test.body, err, test.code)
		}
	}
}
