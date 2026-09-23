package kernel

import (
	"strings"
	"testing"
)

func TestObjectRefKnowledgeCanonicalRules(t *testing.T) {
	tests := []struct {
		input string
		kind  ObjectKind
		ok    bool
	}{
		{"n:1", KindKnowledgeNode, true},
		{"r:42", KindKnowledgeRelationship, true},
		{"node:Person", KindNodeDefinition, true},
		{"n:0", KindKnowledgeNode, true},
		{"n:01", "", false},
		{"r:+1", "", false},
		{"n:", "", false},
		{"r:abc", "", false},
	}
	for _, test := range tests {
		ref, err := ParseObjectRef(test.input)
		if test.ok {
			if err != nil || ref.Kind != test.kind || ref.String() != test.input {
				t.Fatalf("ParseObjectRef(%q) = %#v, %v", test.input, ref, err)
			}
			continue
		}
		if err == nil || AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("ParseObjectRef(%q) error = %v", test.input, err)
		}
	}
}

func TestKnowledgeObjectCanonicalRoundTripAndPropertyProfile(t *testing.T) {
	body := []byte("labels:\n  - \"Person\"\nproperties:\n" +
		"  \"active\": true\n" +
		"  \"big\": 9007199254740992\n" +
		"  \"date\":\n    $type: \"Date\"\n    value: \"2026-09-23\"\n" +
		"  \"float\": 1.0\n" +
		"  \"ints\": [1, 2]\n" +
		"  \"name\": \"Ada\"\n" +
		"  \"negZero\": -0.0\n" +
		"  \"uuid\":\n    $type: \"UUID\"\n    value: \"550E8400-E29B-41D4-A716-446655440000\"\n")
	value, err := ParseObjectYAML(KindKnowledgeNode, body)
	if err != nil {
		t.Fatal(err)
	}
	yamlBody, err := RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"\"big\":\n    $type: \"Integer\"\n    value: \"9007199254740992\"",
		"\"float\": 1.0",
		"\"negZero\": -0.0",
		"value: \"550e8400-e29b-41d4-a716-446655440000\"",
	} {
		if !strings.Contains(string(yamlBody), expected) {
			t.Fatalf("canonical YAML missing %q:\n%s", expected, yamlBody)
		}
	}
	jsonBody, err := RenderObjectJSON(value)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(jsonBody), "\"big\":{\"$type\":\"Integer\",\"value\":\"9007199254740992\"}") ||
		!strings.Contains(string(jsonBody), "\"float\":1.0") ||
		!strings.Contains(string(jsonBody), "\"negZero\":-0.0") {
		t.Fatalf("typed JSON was not canonicalized: %s", jsonBody)
	}
	decoded, err := ParseObjectJSON(KindKnowledgeNode, jsonBody)
	if err != nil {
		t.Fatal(err)
	}
	equal, err := CanonicalObjectEqual(value, decoded)
	if err != nil || !equal {
		t.Fatalf("round trip equal=%v err=%v", equal, err)
	}

	tests := []struct {
		name string
		body string
		code ErrorCode
	}{
		{"null", "labels: []\nproperties:\n  \"x\": null\n", CodeType},
		{"map", "labels: []\nproperties:\n  \"x\": {a: 1}\n", CodeType},
		{"mixed-list", "labels: []\nproperties:\n  \"x\": [1, \"two\"]\n", CodeType},
		{"nested-list", "labels: []\nproperties:\n  \"x\": [[1]]\n", CodeType},
		{"vector", "labels: []\nproperties:\n  \"x\":\n    $type: \"Vector\"\n    coordinateType: \"F32\"\n    dimension: 2\n    values: [1.0, 2.0]\n", CodeUnsupportedOperation},
		{"bad-integer", "labels: []\nproperties:\n  \"x\":\n    $type: \"Integer\"\n    value: \"01\"\n", CodeType},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			_, parseErr := ParseObjectYAML(KindKnowledgeNode, []byte(test.body))
			if parseErr == nil || AsPublicError(parseErr).Code != test.code {
				t.Fatalf("error = %v, want %s", parseErr, test.code)
			}
		})
	}
}

func TestKnowledgeRelationshipAliasRawYAMLParsing(t *testing.T) {
	value, err := parseObjectYAMLRaw(
		KindKnowledgeRelationship,
		[]byte("type: \"KNOWS\"\nstart: \"new:knowledge-node:left\"\nend: \"new:knowledge-node:right\"\nproperties: {}\n"),
	)
	if err != nil {
		t.Fatal(err)
	}
	if value.KnowledgeRelationship == nil ||
		value.KnowledgeRelationship.Start != "new:knowledge-node:left" ||
		value.KnowledgeRelationship.End != "new:knowledge-node:right" {
		t.Fatalf("unexpected relationship: %#v", value.KnowledgeRelationship)
	}
	if _, err := RenderObjectYAML(value); err == nil {
		t.Fatal("unresolved relationship aliases unexpectedly passed canonical rendering")
	}
}
