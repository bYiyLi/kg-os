package kernel

import (
	"strings"
	"testing"
)

func TestPhase08PublicModelValidationEdges(t *testing.T) {
	if err := normalizeDefinition(&Definition{Kind: KindDomain}); err == nil {
		t.Fatal("invalid Definition kind unexpectedly succeeded")
	}
	if err := normalizeDefinition(&Definition{
		Kind:       KindNodeDefinition,
		Name:       "__kgos_reserved",
		Properties: []Property{{Name: "value", Type: "STRING"}},
	}); err == nil {
		t.Fatal("reserved Definition name unexpectedly succeeded")
	}
	if err := normalizeDefinition(&Definition{
		Kind:       KindNodeDefinition,
		Name:       "Valid",
		Properties: []Property{{Name: "__kgos_bad", Type: "STRING"}},
	}); err == nil {
		t.Fatal("reserved Property name unexpectedly succeeded")
	}
	if err := normalizePropertyNullability(&Property{Type: "STRING >"}); err == nil {
		t.Fatal("unbalanced property type unexpectedly succeeded")
	}

	properties := map[string]struct{}{"value": {}, "other": {}}
	propertyTypes := map[string]string{"value": "STRING", "other": "STRING"}
	for _, indexes := range [][]Index{
		{{Name: "dup-targets", Type: "fulltext", Targets: []string{"node:A", "node:A"}, Properties: []string{"value"}}},
		{{Name: "bad-target", Type: "fulltext", Targets: []string{"bad"}, Properties: []string{"value"}}},
		{{Name: "too-many", Type: "text", Properties: []string{"value", "other"}}},
	} {
		if err := normalizeIndexes(indexes, properties, propertyTypes, ""); err == nil {
			t.Fatalf("invalid indexes unexpectedly succeeded: %#v", indexes)
		}
	}

	if err := rejectBooleanConstraintDuplicates(Property{
		Unique:      true,
		Constraints: []Constraint{{Type: "unique"}},
	}); err == nil {
		t.Fatal("duplicate boolean unique rule unexpectedly succeeded")
	}

	if err := validateConstraintDuplicates(&Definition{
		Constraints: []Constraint{
			{Type: "unique", Properties: []string{"value"}},
			{Type: "unique", Properties: []string{"value"}},
		},
	}); err == nil {
		t.Fatal("duplicate Definition constraint rule unexpectedly succeeded")
	}

	if err := validateResourceNames(&Definition{
		Constraints: []Constraint{{Name: "same"}, {Name: "same"}},
	}); err == nil {
		t.Fatal("duplicate Definition constraint name unexpectedly succeeded")
	}
	if err := validateResourceNames(&Definition{
		Indexes: []Index{{Name: "same"}, {Name: "same"}},
	}); err == nil {
		t.Fatal("duplicate Definition index name unexpectedly succeeded")
	}
	if err := validateResourceNames(&Definition{
		Constraints: []Constraint{{Name: "same"}},
		Properties: []Property{{
			Name:        "value",
			Constraints: []Constraint{{Name: "same"}},
		}},
	}); err == nil {
		t.Fatal("cross-scope duplicate constraint name unexpectedly succeeded")
	}

	for _, rule := range []string{">STRING", "| STRING", "LIST<STRING", "STRING |"} {
		if _, err := splitTopLevelTypeUnion(rule); err == nil {
			t.Fatalf("invalid type rule %q unexpectedly succeeded", rule)
		}
	}

	if _, _, err := parseNewObjectTarget("new:domain:%41"); err == nil {
		t.Fatal("non-canonical new object alias unexpectedly succeeded")
	}

	longName := strings.Repeat("x", 256)
	if err := normalizeDomain(&Domain{Name: longName}); err == nil {
		t.Fatal("oversized Domain name unexpectedly succeeded")
	}
}
