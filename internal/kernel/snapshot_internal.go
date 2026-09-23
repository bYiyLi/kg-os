package kernel

import (
	"context"
	"encoding/json"
	"sort"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type internalNode struct {
	Node        taggedNode
	Category    string
	Kind        string
	Name        string
	Title       *string
	Description *string
}

func (service *Service) readInternalGraph(
	ctx context.Context,
	state string,
) (map[string]internalNode, map[string]taggedRelationship, error) {
	nodeQuery, err := service.database.Query(ctx, lithograph.QueryRequest{
		At:     state,
		Cypher: "MATCH (n:" + internalLabel + ") RETURN n",
	})
	if err != nil {
		return nil, nil, AsPublicError(err)
	}
	relationshipQueries := []string{
		"MATCH (a:" + internalLabel + ")-[r]->(b) RETURN r",
		"MATCH (a)-[r]->(b:" + internalLabel + ") RETURN r",
	}
	relationshipResults := make([]lithograph.Result, 0, len(relationshipQueries))
	for _, cypher := range relationshipQueries {
		query, queryErr := service.database.Query(ctx, lithograph.QueryRequest{At: state, Cypher: cypher})
		if queryErr != nil {
			return nil, nil, AsPublicError(queryErr)
		}
		relationshipResults = append(relationshipResults, query.Result)
	}
	return decodeInternalGraphResults(nodeQuery.Result, relationshipResults)
}

func decodeInternalGraphResults(
	nodeResult lithograph.Result,
	relationshipResults []lithograph.Result,
) (map[string]internalNode, map[string]taggedRelationship, error) {
	nodeRows, err := rowsByName(nodeResult)
	if err != nil {
		return nil, nil, err
	}
	nodes := make(map[string]internalNode, len(nodeRows))
	for _, row := range nodeRows {
		var node taggedNode
		if err := json.Unmarshal(row["n"], &node); err != nil {
			return nil, nil, publicError(CodeInternal, "decode internal node", err)
		}
		decoded, err := decodeInternalNode(node)
		if err != nil {
			return nil, nil, err
		}
		if _, exists := nodes[node.ElementID]; exists {
			return nil, nil, publicError(CodeConsistency, "duplicate internal node identity", nil)
		}
		nodes[node.ElementID] = decoded
	}
	relationships := map[string]taggedRelationship{}
	for _, result := range relationshipResults {
		rows, rowErr := rowsByName(result)
		if rowErr != nil {
			return nil, nil, rowErr
		}
		for _, row := range rows {
			var relationship taggedRelationship
			if err := json.Unmarshal(row["r"], &relationship); err != nil {
				return nil, nil, publicError(CodeInternal, "decode internal relationship", err)
			}
			if _, exists := relationships[relationship.ElementID]; exists {
				continue
			}
			relationships[relationship.ElementID] = relationship
		}
	}
	for _, relationship := range relationships {
		if _, ok := nodes[relationship.Start]; !ok {
			return nil, nil, publicError(CodeConsistency, "internal relationship crosses into Knowledge graph", nil)
		}
		if _, ok := nodes[relationship.End]; !ok {
			return nil, nil, publicError(CodeConsistency, "internal relationship crosses into Knowledge graph", nil)
		}
		if len(relationship.Properties) != 0 {
			return nil, nil, publicError(CodeConsistency, "internal relationship has unexpected properties", nil)
		}
		if relationship.Type != propertyOfType && relationship.Type != includesType {
			return nil, nil, publicError(CodeConsistency, "unknown internal relationship type", nil)
		}
	}
	return nodes, relationships, nil
}

func decodeInternalNode(node taggedNode) (internalNode, error) {
	if node.ElementID == "" {
		return internalNode{}, publicError(CodeConsistency, "invalid internal node encoding", nil)
	}
	labelSet := map[string]struct{}{}
	for _, label := range node.Labels {
		labelSet[label] = struct{}{}
	}
	if _, ok := labelSet[internalLabel]; !ok {
		return internalNode{}, publicError(CodeConsistency, "internal node is missing marker label", nil)
	}
	categories := []string{}
	for _, label := range []string{definitionBindingLabel, propertyBindingLabel, domainLabel} {
		if _, ok := labelSet[label]; ok {
			categories = append(categories, label)
		}
	}
	if len(categories) != 1 || len(labelSet) != 2 {
		return internalNode{}, publicError(CodeConsistency, "internal node label profile is invalid", nil)
	}
	allowed := map[string]bool{
		internalNameProperty: true, internalTitleProperty: true, internalDescriptionProperty: true,
	}
	if categories[0] == definitionBindingLabel {
		allowed[internalKindProperty] = true
	}
	for key := range node.Properties {
		if !allowed[key] {
			return internalNode{}, publicError(CodeConsistency, "internal node has unexpected payload", nil)
		}
	}
	name, err := taggedStringProperty(node.Properties, internalNameProperty, true)
	if err != nil {
		return internalNode{}, err
	}
	title, err := taggedOptionalStringProperty(node.Properties, internalTitleProperty)
	if err != nil {
		return internalNode{}, err
	}
	description, err := taggedOptionalStringProperty(node.Properties, internalDescriptionProperty)
	if err != nil {
		return internalNode{}, err
	}
	kind := ""
	if categories[0] == definitionBindingLabel {
		kind, err = taggedStringProperty(node.Properties, internalKindProperty, true)
		if err != nil {
			return internalNode{}, err
		}
		if kind != "node" && kind != "relationship" {
			return internalNode{}, publicError(CodeConsistency, "Definition Binding has invalid kind", nil)
		}
	}
	return internalNode{
		Node: node, Category: categories[0], Kind: kind, Name: name, Title: title, Description: description,
	}, nil
}

func taggedStringProperty(properties map[string]json.RawMessage, name string, required bool) (string, error) {
	raw, ok := properties[name]
	if !ok {
		if required {
			return "", publicError(CodeConsistency, "internal node is missing "+name, nil)
		}
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil || value == "" {
		return "", publicError(CodeConsistency, "internal node has invalid "+name, err)
	}
	return value, nil
}

func taggedOptionalStringProperty(properties map[string]json.RawMessage, name string) (*string, error) {
	raw, ok := properties[name]
	if !ok || string(raw) == "null" {
		return nil, nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, publicError(CodeConsistency, "internal node has invalid "+name, err)
	}
	return &value, nil
}

func bindInternalGraph(
	result *snapshot,
	nodes map[string]internalNode,
	relationships map[string]taggedRelationship,
	nodeElementIDs map[string]OntologyRef,
) error {
	definitionBindings := map[OntologyRef]internalNode{}
	propertyOwner := map[string]string{}
	propertyOwnerCount := map[string]int{}
	includeTargets := map[string][]string{}
	includePairs := map[string]struct{}{}
	for _, relationship := range relationships {
		source := nodes[relationship.Start]
		target := nodes[relationship.End]
		switch relationship.Type {
		case propertyOfType:
			if source.Category != propertyBindingLabel || target.Category != definitionBindingLabel {
				return publicError(CodeConsistency, "invalid Property Binding owner edge", nil)
			}
			propertyOwner[source.Node.ElementID] = target.Node.ElementID
			propertyOwnerCount[source.Node.ElementID]++
		case includesType:
			if source.Category != domainLabel ||
				(target.Category != domainLabel && target.Category != definitionBindingLabel) {
				return publicError(CodeConsistency, "invalid Domain includes edge", nil)
			}
			key := source.Node.ElementID + "\x00" + target.Node.ElementID
			if _, exists := includePairs[key]; exists {
				return publicError(CodeConsistency, "duplicate Domain includes edge", nil)
			}
			includePairs[key] = struct{}{}
			includeTargets[source.Node.ElementID] = append(includeTargets[source.Node.ElementID], target.Node.ElementID)
		}
	}
	for _, node := range nodes {
		switch node.Category {
		case definitionBindingLabel:
			kind := KindNodeDefinition
			if node.Kind == "relationship" {
				kind = KindRelationshipDefinition
			}
			ref := OntologyRef{Kind: kind, Name: node.Name}
			if _, exists := definitionBindings[ref]; exists {
				return publicError(CodeConsistency, "duplicate Definition Binding locator", nil)
			}
			definitionBindings[ref] = node
		case propertyBindingLabel:
			if propertyOwnerCount[node.Node.ElementID] != 1 {
				return publicError(CodeConsistency, "Property Binding must have exactly one owner", nil)
			}
		case domainLabel:
			if _, exists := result.Domains[node.Name]; exists {
				return publicError(CodeConsistency, "duplicate Domain name", nil)
			}
			result.Domains[node.Name] = &domainRecord{
				ElementID: node.Node.ElementID,
				Value:     Domain{Name: node.Name, Title: node.Title, Description: node.Description, Includes: []string{}},
			}
		}
	}
	if len(definitionBindings) != len(result.Definitions) {
		return publicError(CodeConsistency, "Definition Binding coverage does not match caller Schema", nil)
	}
	definitionByID := map[string]OntologyRef{}
	for ref, record := range result.Definitions {
		binding, ok := definitionBindings[ref]
		if !ok {
			return publicError(CodeConsistency, "Definition is missing its Binding Record", nil)
		}
		record.ElementID = binding.Node.ElementID
		record.Value.Title = binding.Title
		record.Value.Description = binding.Description
		definitionByID[binding.Node.ElementID] = ref
	}
	for _, node := range nodes {
		if node.Category != propertyBindingLabel {
			continue
		}
		ownerRef, ok := definitionByID[propertyOwner[node.Node.ElementID]]
		if !ok {
			return publicError(CodeConsistency, "Property Binding owner cannot be resolved", nil)
		}
		record := result.Definitions[ownerRef]
		property := findProperty(record.Value.Properties, node.Name)
		if property == nil {
			return publicError(CodeConsistency, "Property Binding locator does not resolve to Schema", nil)
		}
		if _, exists := record.PropertyElementIDs[node.Name]; exists {
			return publicError(CodeConsistency, "duplicate Property Binding locator", nil)
		}
		property.Title = node.Title
		property.Description = node.Description
		record.PropertyElementIDs[node.Name] = node.Node.ElementID
	}
	for _, record := range result.Definitions {
		if len(record.PropertyElementIDs) != len(record.Value.Properties) {
			return publicError(CodeConsistency, "Property Binding coverage does not match caller Schema", nil)
		}
	}
	for _, domain := range result.Domains {
		for _, targetID := range includeTargets[domain.ElementID] {
			if target, ok := nodes[targetID]; ok && target.Category == domainLabel {
				domain.Value.Includes = append(domain.Value.Includes, OntologyRef{Kind: KindDomain, Name: target.Name}.String())
				continue
			}
			if ref, ok := definitionByID[targetID]; ok {
				domain.Value.Includes = append(domain.Value.Includes, ref.String())
				continue
			}
			return publicError(CodeConsistency, "Domain membership target cannot be resolved", nil)
		}
		sort.Strings(domain.Value.Includes)
	}
	_ = nodeElementIDs
	return nil
}

func findProperty(properties []Property, name string) *Property {
	for index := range properties {
		if properties[index].Name == name {
			return &properties[index]
		}
	}
	return nil
}
