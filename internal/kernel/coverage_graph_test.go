package kernel

import (
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func graphResultForTest(nodes []graphTypeNode, relationships []graphTypeRelationship) lithograph.Result {
	return lithograph.Result{
		Columns: []string{"nodes", "relationships"},
		Rows:    [][]json.RawMessage{{mustJSON(nodes), mustJSON(relationships)}},
	}
}

func TestDecodeGraphTypeResultBoundaryCoverage(t *testing.T) {
	t.Parallel()
	if _, _, err := decodeGraphTypeResult(lithograph.Result{Columns: []string{"nodes"}}); err == nil {
		t.Fatal("missing Graph Type row accepted")
	}
	if _, _, err := decodeGraphTypeResult(lithograph.Result{
		Columns: []string{"nodes", "relationships"},
		Rows:    [][]json.RawMessage{{[]byte("{"), mustJSON([]graphTypeRelationship{})}},
	}); err == nil {
		t.Fatal("invalid Graph Type nodes JSON accepted")
	}
	if _, _, err := decodeGraphTypeResult(lithograph.Result{
		Columns: []string{"nodes", "relationships"},
		Rows:    [][]json.RawMessage{{mustJSON([]graphTypeNode{}), []byte("{")}},
	}); err == nil {
		t.Fatal("invalid Graph Type relationships JSON accepted")
	}
	if _, _, err := decodeGraphTypeResult(graphResultForTest(
		[]graphTypeNode{{}}, nil,
	)); err == nil {
		t.Fatal("empty Graph Type node identity accepted")
	}
	if _, _, err := decodeGraphTypeResult(graphResultForTest(
		[]graphTypeNode{{ElementID: "n"}, {ElementID: "n"}}, nil,
	)); err == nil {
		t.Fatal("duplicate Graph Type node identity accepted")
	}
	if _, _, err := decodeGraphTypeResult(graphResultForTest(
		nil, []graphTypeRelationship{{}},
	)); err == nil {
		t.Fatal("empty Graph Type relationship identity accepted")
	}
	if _, _, err := decodeGraphTypeResult(graphResultForTest(
		nil,
		[]graphTypeRelationship{{ElementID: "r"}, {ElementID: "r"}},
	)); err == nil {
		t.Fatal("duplicate Graph Type relationship identity accepted")
	}
	nodes, relationships, err := decodeGraphTypeResult(graphResultForTest(
		[]graphTypeNode{{ElementID: "n"}}, []graphTypeRelationship{{ElementID: "r"}},
	))
	if err != nil || len(nodes) != 1 || len(relationships) != 1 {
		t.Fatalf("valid Graph Type result = %#v %#v err=%v", nodes, relationships, err)
	}
}

func nodeElementTypeForTest(id, name string, properties ...string) graphTypeNode {
	var node graphTypeNode
	node.ElementID = id
	node.Labels = []string{"NodeElementType"}
	node.Properties.Label = name
	node.Properties.Properties = properties
	return node
}

func nodeLabelForTest(id, name string) graphTypeNode {
	var node graphTypeNode
	node.ElementID = id
	node.Labels = []string{"NodeLabel"}
	node.Properties.Label = name
	return node
}

func anyNodeForTest(id string) graphTypeNode {
	return graphTypeNode{ElementID: id, Labels: []string{"AnyNode"}}
}

func relationshipElementTypeForTest(id, name, start, end string, properties ...string) graphTypeRelationship {
	var relationship graphTypeRelationship
	relationship.ElementID = id
	relationship.Type = "RELATIONSHIP_ELEMENT_TYPE"
	relationship.Start = start
	relationship.End = end
	relationship.Properties.RelationshipType = name
	relationship.Properties.Properties = properties
	return relationship
}

func TestDecodeDefinitionsBoundaryCoverage(t *testing.T) {
	t.Parallel()
	baseNodes := map[string]graphTypeNode{
		"n": nodeElementTypeForTest("n", "N", "p :: STRING"),
		"m": nodeElementTypeForTest("m", "M", "p :: STRING"),
		"a": anyNodeForTest("a"),
	}
	if _, _, err := decodeDefinitions(baseNodes, map[string]graphTypeRelationship{
		"i": {ElementID: "i", Type: "IMPLIES", Start: "missing", End: "m"},
	}); err == nil {
		t.Fatal("invalid IMPLIES endpoint accepted")
	}
	reservedLabel := nodeLabelForTest("l", "__kgos_extra")
	nodes := cloneGraphNodesForTest(baseNodes)
	nodes["l"] = reservedLabel
	if _, _, err := decodeDefinitions(nodes, map[string]graphTypeRelationship{
		"i": {ElementID: "i", Type: "IMPLIES", Start: "n", End: "l"},
	}); err == nil {
		t.Fatal("reserved additional label accepted")
	}
	duplicateNodes := cloneGraphNodesForTest(baseNodes)
	duplicateNodes["n2"] = nodeElementTypeForTest("n2", "N", "p :: STRING")
	if _, _, err := decodeDefinitions(duplicateNodes, nil); err == nil {
		t.Fatal("duplicate Node Definition locator accepted")
	}

	badSource := map[string]graphTypeNode{"a": anyNodeForTest("a"), "m": baseNodes["m"]}
	if _, _, err := decodeDefinitions(badSource, map[string]graphTypeRelationship{
		"r": relationshipElementTypeForTest("r", "R", "missing", "m", "p :: STRING"),
	}); err == nil {
		t.Fatal("invalid Relationship source accepted")
	}
	badTarget := map[string]graphTypeNode{"a": anyNodeForTest("a"), "n": baseNodes["n"]}
	if _, _, err := decodeDefinitions(badTarget, map[string]graphTypeRelationship{
		"r": relationshipElementTypeForTest("r", "R", "n", "missing", "p :: STRING"),
	}); err == nil {
		t.Fatal("invalid Relationship target accepted")
	}
	duplicateRelationships := map[string]graphTypeRelationship{
		"r1": relationshipElementTypeForTest("r1", "R", "n", "m", "p :: STRING"),
		"r2": relationshipElementTypeForTest("r2", "R", "n", "m", "p :: STRING"),
	}
	if _, _, err := decodeDefinitions(baseNodes, duplicateRelationships); err == nil {
		t.Fatal("duplicate Relationship Definition locator accepted")
	}
	definitions, nodeRefs, err := decodeDefinitions(baseNodes, map[string]graphTypeRelationship{
		"r": relationshipElementTypeForTest("r", "R", "a", "m", "p :: STRING"),
	})
	if err != nil || len(definitions) != 3 || len(nodeRefs) != 2 {
		t.Fatalf("valid Definitions = %#v refs=%#v err=%v", definitions, nodeRefs, err)
	}
	if !isAnyNodeEndpoint(baseNodes["a"]) {
		t.Fatal("AnyNode endpoint not recognized")
	}
	if isAnyNodeEndpoint(baseNodes["n"]) || isAnyNodeEndpoint(graphTypeNode{}) {
		t.Fatal("ordinary/empty node recognized as AnyNode")
	}
}

func cloneGraphNodesForTest(input map[string]graphTypeNode) map[string]graphTypeNode {
	output := make(map[string]graphTypeNode, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func validInternalBindingFixture() (*snapshot, map[string]internalNode, map[string]taggedRelationship) {
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	result := &snapshot{
		Domains: map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{
			ref: {
				Value: Definition{
					Kind: KindNodeDefinition, Name: "N",
					Properties:  []Property{{Name: "p", Type: "STRING"}},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
		},
	}
	nodes := map[string]internalNode{
		"n": {
			Node: taggedNode{ElementID: "n"}, Category: definitionBindingLabel, Kind: "node", Name: "N",
		},
		"p": {
			Node: taggedNode{ElementID: "p"}, Category: propertyBindingLabel, Name: "p",
		},
		"d": {
			Node: taggedNode{ElementID: "d"}, Category: domainLabel, Name: "D",
		},
	}
	relationships := map[string]taggedRelationship{
		"owner":   {ElementID: "owner", Type: propertyOfType, Start: "p", End: "n", Properties: map[string]json.RawMessage{}},
		"include": {ElementID: "include", Type: includesType, Start: "d", End: "n", Properties: map[string]json.RawMessage{}},
	}
	return result, nodes, relationships
}

func TestBindInternalGraphBoundaryCoverage(t *testing.T) {
	t.Parallel()
	result, nodes, relationships := validInternalBindingFixture()
	if err := bindInternalGraph(result, nodes, relationships, nil); err != nil {
		t.Fatalf("valid internal graph: %v", err)
	}
	if len(result.Domains["D"].Value.Includes) != 1 ||
		result.Definitions[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].PropertyElementIDs["p"] != "p" {
		t.Fatalf("bound internal graph = %#v", result)
	}

	mutateAndFail := func(t *testing.T, mutate func(*snapshot, map[string]internalNode, map[string]taggedRelationship)) {
		t.Helper()
		candidate, candidateNodes, candidateRelationships := validInternalBindingFixture()
		mutate(candidate, candidateNodes, candidateRelationships)
		if err := bindInternalGraph(candidate, candidateNodes, candidateRelationships, nil); err == nil {
			t.Fatal("invalid internal graph accepted")
		}
	}
	mutateAndFail(t, func(_ *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		nodes["p"] = internalNode{Node: taggedNode{ElementID: "p"}, Category: domainLabel, Name: "P"}
	})
	mutateAndFail(t, func(_ *snapshot, _ map[string]internalNode, relationships map[string]taggedRelationship) {
		relationship := relationships["include"]
		relationship.End = "p"
		relationships["include"] = relationship
	})
	mutateAndFail(t, func(_ *snapshot, _ map[string]internalNode, relationships map[string]taggedRelationship) {
		relationships["include2"] = taggedRelationship{
			ElementID: "include2", Type: includesType, Start: "d", End: "n", Properties: map[string]json.RawMessage{},
		}
	})
	mutateAndFail(t, func(_ *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		nodes["n2"] = internalNode{
			Node: taggedNode{ElementID: "n2"}, Category: definitionBindingLabel, Kind: "node", Name: "N",
		}
	})
	mutateAndFail(t, func(_ *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		nodes["d2"] = internalNode{Node: taggedNode{ElementID: "d2"}, Category: domainLabel, Name: "D"}
	})
	mutateAndFail(t, func(_ *snapshot, _ map[string]internalNode, relationships map[string]taggedRelationship) {
		delete(relationships, "owner")
	})
	mutateAndFail(t, func(_ *snapshot, _ map[string]internalNode, relationships map[string]taggedRelationship) {
		relationships["owner2"] = taggedRelationship{
			ElementID: "owner2", Type: propertyOfType, Start: "p", End: "n", Properties: map[string]json.RawMessage{},
		}
	})
	mutateAndFail(t, func(result *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		delete(nodes, "n")
		_ = result
	})
	mutateAndFail(t, func(_ *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		node := nodes["n"]
		node.Name = "M"
		nodes["n"] = node
	})
	mutateAndFail(t, func(_ *snapshot, nodes map[string]internalNode, _ map[string]taggedRelationship) {
		node := nodes["p"]
		node.Name = "missing"
		nodes["p"] = node
	})
	mutateAndFail(t, func(result *snapshot, nodes map[string]internalNode, relationships map[string]taggedRelationship) {
		nodes["p2"] = internalNode{Node: taggedNode{ElementID: "p2"}, Category: propertyBindingLabel, Name: "p"}
		relationships["owner2"] = taggedRelationship{
			ElementID: "owner2", Type: propertyOfType, Start: "p2", End: "n", Properties: map[string]json.RawMessage{},
		}
		_ = result
	})
	mutateAndFail(t, func(result *snapshot, _ map[string]internalNode, _ map[string]taggedRelationship) {
		ref := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
		result.Definitions[ref].Value.Properties = append(
			result.Definitions[ref].Value.Properties,
			Property{Name: "q", Type: "STRING"},
		)
	})
}
