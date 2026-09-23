package kernel

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestPhase04DefinitionRenameAndCanonicalEqualityBranches(t *testing.T) {
	cypher, params, err := definitionRenameCypher(
		OntologyRef{Kind: KindNodeDefinition, Name: "Person"},
		OntologyRef{Kind: KindNodeDefinition, Name: "Human"},
	)
	if err != nil || !strings.Contains(cypher, "SET n:$($new)") ||
		params["old"] != "Person" || params["new"] != "Human" {
		t.Fatalf("node rename cypher=%q params=%#v err=%v", cypher, params, err)
	}
	cypher, params, err = definitionRenameCypher(
		OntologyRef{Kind: KindRelationshipDefinition, Name: "AUTHORED"},
		OntologyRef{Kind: KindRelationshipDefinition, Name: "WROTE"},
	)
	if err != nil || !strings.Contains(cypher, "CREATE (a)-[replacement") ||
		params["oldType"] != "AUTHORED" || params["newType"] != "WROTE" {
		t.Fatalf("relationship rename cypher=%q params=%#v err=%v", cypher, params, err)
	}
	if _, _, err := definitionRenameCypher(
		OntologyRef{Kind: KindNodeDefinition, Name: "A"},
		OntologyRef{Kind: KindRelationshipDefinition, Name: "B"},
	); err == nil || AsPublicError(err).Code != CodeUnsupportedOperation {
		t.Fatalf("cross-kind rename error=%v", err)
	}
	if _, _, err := definitionRenameCypher(
		OntologyRef{Kind: KindDomain, Name: "A"},
		OntologyRef{Kind: KindDomain, Name: "B"},
	); err == nil || AsPublicError(err).Code != CodeUnsupportedOperation {
		t.Fatalf("domain rename compiler error=%v", err)
	}

	left := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "A", Includes: []string{}}}
	right := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "A", Includes: []string{}}}
	equal, err := CanonicalObjectEqual(left, right)
	if err != nil || !equal {
		t.Fatalf("equal domains equal=%v err=%v", equal, err)
	}
	right.Domain.Name = "B"
	equal, err = CanonicalObjectEqual(left, right)
	if err != nil || equal {
		t.Fatalf("different domains equal=%v err=%v", equal, err)
	}
	if _, err := CanonicalObjectEqual(
		ObjectValue{Kind: KindKnowledgeNode},
		right,
	); err == nil {
		t.Fatal("invalid left Object unexpectedly compared")
	}
	if _, err := CanonicalObjectEqual(
		left,
		ObjectValue{Kind: KindKnowledgeRelationship},
	); err == nil {
		t.Fatal("invalid right Object unexpectedly compared")
	}
}

func TestPhase04RenderAllObjectKindsAndDataSafetyInvalidKinds(t *testing.T) {
	from := "node:Person"
	to := "node:Person"
	values := []ObjectValue{
		{
			Kind:   KindDomain,
			Domain: &Domain{Name: "Core", Includes: []string{}},
		},
		{
			Kind: KindNodeDefinition,
			Definition: &Definition{
				Kind:        KindNodeDefinition,
				Name:        "Person",
				Labels:      []string{"Human"},
				Properties:  []Property{{Name: "name", Type: "STRING"}},
				Constraints: []Constraint{},
			},
		},
		{
			Kind: KindRelationshipDefinition,
			Definition: &Definition{
				Kind:        KindRelationshipDefinition,
				Name:        "KNOWS",
				From:        &from,
				To:          &to,
				Properties:  []Property{{Name: "since", Type: "STRING"}},
				Constraints: []Constraint{},
			},
		},
		{
			Kind: KindKnowledgeNode,
			KnowledgeNode: &KnowledgeNode{
				Labels:     []string{"Person"},
				Properties: map[string]json.RawMessage{"name": json.RawMessage(`"Alice"`)},
			},
		},
		{
			Kind: KindKnowledgeRelationship,
			KnowledgeRelationship: &KnowledgeRelationship{
				Type: "KNOWS", Start: "n:1", End: "n:2",
				Properties: map[string]json.RawMessage{"since": json.RawMessage(`"2026"`)},
			},
		},
	}
	for _, value := range values {
		yamlBody, err := RenderObjectYAML(value)
		if err != nil || len(yamlBody) == 0 {
			t.Fatalf("RenderObjectYAML(%s) body=%q err=%v", value.Kind, yamlBody, err)
		}
		jsonBody, err := RenderObjectJSON(value)
		if err != nil || len(jsonBody) == 0 {
			t.Fatalf("RenderObjectJSON(%s) body=%q err=%v", value.Kind, jsonBody, err)
		}
	}

	service := &Service{}
	transaction := (*lithograph.Transaction)(nil)
	bad := OntologyRef{Kind: KindDomain, Name: "D"}
	if _, err := service.countDefinitionElements(context.Background(), transaction, bad); err == nil {
		t.Fatal("countDefinitionElements accepted Domain")
	}
	if _, err := service.countPropertyValues(context.Background(), transaction, bad, "x"); err == nil {
		t.Fatal("countPropertyValues accepted Domain")
	}
	if _, err := service.countPropertyTargetValues(context.Background(), transaction, bad, "x"); err == nil {
		t.Fatal("countPropertyTargetValues accepted Domain")
	}
}
