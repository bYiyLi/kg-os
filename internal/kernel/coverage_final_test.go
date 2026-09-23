package kernel

import (
	"testing"

	"gopkg.in/yaml.v3"
)

func TestCanonicalizeDefinitionSinglePropertyIndexCoverage(t *testing.T) {
	t.Parallel()
	definition := Definition{
		Kind: KindNodeDefinition,
		Name: "N",
		Properties: []Property{
			{Name: "p", Type: "STRING"},
		},
		Constraints: []Constraint{},
		Indexes: []Index{
			{Name: "p_range", Type: "range", Properties: []string{"p"}},
		},
	}
	canonicalizeDefinitionMembers(&definition)
	if len(definition.Indexes) != 0 ||
		len(definition.Properties[0].Indexes) != 1 ||
		definition.Properties[0].Indexes[0].Name != "p_range" ||
		len(definition.Properties[0].Indexes[0].Properties) != 0 {
		t.Fatalf("canonicalized Definition = %#v", definition)
	}
}

func TestDereferenceYAMLNodeCoverage(t *testing.T) {
	t.Parallel()
	scalar := &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: "value"}
	alias := &yaml.Node{Kind: yaml.AliasNode, Alias: scalar}
	if got := dereferenceYAMLNode(alias); got != scalar {
		t.Fatalf("dereferenced node = %#v", got)
	}
	cycle := &yaml.Node{Kind: yaml.AliasNode}
	cycle.Alias = cycle
	if got := dereferenceYAMLNode(cycle); got != nil {
		t.Fatalf("cyclic alias dereferenced to %#v", got)
	}
}

func TestNewRelationshipDerivedEndpointTransitionCoverage(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	from := "node:N"
	to := "node:N"
	newRelationship := OntologyRef{Kind: KindRelationshipDefinition, Name: "NEW_REL"}
	plan := &plannedState{
		Base: base,
		Objects: map[OntologyRef]*plannedObject{
			newRelationship: {
				Value: ObjectValue{
					Kind: KindRelationshipDefinition,
					Definition: &Definition{
						Kind:        KindRelationshipDefinition,
						Name:        "NEW_REL",
						From:        &from,
						To:          &to,
						Properties:  []Property{{Name: "p", Type: "STRING"}},
						Constraints: []Constraint{},
					},
				},
				PropertyBase: map[string]string{"p": ""},
			},
		},
		Aliases:         map[string]CreatedObject{},
		Transitions:     map[string]string{"node:N": "node:X"},
		PropertyRenames: map[OntologyRef]map[string]string{},
		IndexDeltas:     map[string][]indexDelta{},
	}
	if err := plan.resolveDerivedReferences(); err != nil {
		t.Fatalf("resolve derived endpoints: %v", err)
	}
	definition := plan.Objects[newRelationship].Value.Definition
	if definition.From == nil || *definition.From != "node:X" ||
		definition.To == nil || *definition.To != "node:X" {
		t.Fatalf("derived endpoints = from:%v to:%v", definition.From, definition.To)
	}
}
