package kernel

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type snapshot struct {
	State                 string
	Domains               map[string]*domainRecord
	Definitions           map[OntologyRef]*definitionRecord
	internalNodes         map[string]internalNode
	internalRelationships map[string]taggedRelationship
}

type snapshotQuery func(string) (lithograph.Result, error)

type domainRecord struct {
	Value     Domain
	ElementID string
}

type definitionRecord struct {
	Value              Definition
	ElementID          string
	PropertyElementIDs map[string]string
}

type taggedNode struct {
	ElementID  string
	Labels     []string
	Properties map[string]json.RawMessage
}

type taggedRelationship struct {
	ElementID  string
	Type       string
	Start      string
	End        string
	Properties map[string]json.RawMessage
}

type graphTypeNode struct {
	ElementID  string
	Labels     []string
	Properties struct {
		Label       string
		Properties  []string
		Constraints []string
	}
}

type graphTypeRelationship struct {
	ElementID  string
	Type       string
	Start      string
	End        string
	Properties struct {
		RelationshipType string
		Properties       []string
		Constraints      []string
	}
}

func (service *Service) decodeSnapshot(ctx context.Context, stateRef string) (*snapshot, error) {
	state, err := service.database.ResolveState(ctx, stateRef)
	if err != nil {
		return nil, AsPublicError(err)
	}
	return service.decodeResolvedSnapshot(ctx, state)
}

func (service *Service) decodeResolvedSnapshot(ctx context.Context, state string) (*snapshot, error) {
	return service.decodeSnapshotWithQuery(state, func(cypher string) (lithograph.Result, error) {
		query, err := service.database.Query(ctx, lithograph.QueryRequest{At: state, Cypher: cypher})
		if err != nil {
			return lithograph.Result{}, AsPublicError(err)
		}
		return query.Result, nil
	})
}

func (service *Service) decodeMergeCandidateSnapshot(
	ctx context.Context,
	session string,
	revision int64,
) (*snapshot, error) {
	return service.decodeSnapshotWithQuery("", func(cypher string) (lithograph.Result, error) {
		result, err := service.database.QueryMergeCandidate(ctx, session, revision, cypher)
		if err != nil {
			return lithograph.Result{}, graphPublicError(err)
		}
		return result, nil
	})
}

func (service *Service) decodeSnapshotWithQuery(state string, query snapshotQuery) (*snapshot, error) {
	graphNodes, graphRelationships, err := readGraphTypeWithQuery(query)
	if err != nil {
		return nil, err
	}
	definitions, nodeElementIDs, err := decodeDefinitions(graphNodes, graphRelationships)
	if err != nil {
		return nil, err
	}
	if err := validateReservedGraphType(graphNodes, graphRelationships); err != nil {
		return nil, err
	}
	internalNodes, internalRelationships, err := readInternalGraphWithQuery(query)
	if err != nil {
		return nil, err
	}
	result := &snapshot{
		State:                 state,
		Domains:               map[string]*domainRecord{},
		Definitions:           definitions,
		internalNodes:         internalNodes,
		internalRelationships: internalRelationships,
	}
	if err := bindInternalGraph(result, internalNodes, internalRelationships, nodeElementIDs); err != nil {
		return nil, err
	}
	if err := decodeSchemaResourcesWithQuery(result, query); err != nil {
		return nil, err
	}
	for _, record := range result.Definitions {
		value := ObjectValue{Kind: record.Value.Kind, Definition: &record.Value}
		if err := normalizeObject(value); err != nil {
			return nil, errorWithDetails(CodeConsistency, "stored Definition is outside the KG OS Ontology profile", map[string]any{
				"definition": record.Value.Name,
				"cause":      AsPublicError(err).Message,
			})
		}
	}
	for _, record := range result.Domains {
		value := ObjectValue{Kind: KindDomain, Domain: &record.Value}
		if err := normalizeObject(value); err != nil {
			return nil, errorWithDetails(CodeConsistency, "stored Domain is outside the KG OS Ontology profile", map[string]any{
				"domain": record.Value.Name,
				"cause":  AsPublicError(err).Message,
			})
		}
	}
	return result, nil
}

func readGraphTypeWithQuery(
	query snapshotQuery,
) (map[string]graphTypeNode, map[string]graphTypeRelationship, error) {
	result, err := query("SHOW CURRENT GRAPH TYPE AS GRAPH")
	if err != nil {
		return nil, nil, err
	}
	return decodeGraphTypeResult(result)
}

func decodeGraphTypeResult(
	result lithograph.Result,
) (map[string]graphTypeNode, map[string]graphTypeRelationship, error) {
	rows, err := rowsByName(result)
	if err != nil {
		return nil, nil, err
	}
	if len(rows) != 1 {
		return nil, nil, publicError(CodeConsistency, "current Graph Type is missing", nil)
	}
	var nodes []graphTypeNode
	var relationships []graphTypeRelationship
	if err := json.Unmarshal(rows[0]["nodes"], &nodes); err != nil {
		return nil, nil, publicError(CodeInternal, "decode Graph Type nodes", err)
	}
	if err := json.Unmarshal(rows[0]["relationships"], &relationships); err != nil {
		return nil, nil, publicError(CodeInternal, "decode Graph Type relationships", err)
	}
	nodeMap := make(map[string]graphTypeNode, len(nodes))
	for _, node := range nodes {
		if node.ElementID == "" {
			return nil, nil, publicError(CodeConsistency, "invalid Graph Type node encoding", nil)
		}
		if _, exists := nodeMap[node.ElementID]; exists {
			return nil, nil, publicError(CodeConsistency, "duplicate Graph Type node identity", nil)
		}
		nodeMap[node.ElementID] = node
	}
	relationshipMap := make(map[string]graphTypeRelationship, len(relationships))
	for _, relationship := range relationships {
		if relationship.ElementID == "" {
			return nil, nil, publicError(CodeConsistency, "invalid Graph Type relationship encoding", nil)
		}
		if _, exists := relationshipMap[relationship.ElementID]; exists {
			return nil, nil, publicError(CodeConsistency, "duplicate Graph Type relationship identity", nil)
		}
		relationshipMap[relationship.ElementID] = relationship
	}
	return nodeMap, relationshipMap, nil
}

func decodeDefinitions(
	nodes map[string]graphTypeNode,
	relationships map[string]graphTypeRelationship,
) (map[OntologyRef]*definitionRecord, map[string]OntologyRef, error) {
	definitions := map[OntologyRef]*definitionRecord{}
	nodeRefs := map[string]OntologyRef{}
	additionalLabels := map[string][]string{}
	for _, relationship := range relationships {
		if relationship.Type != "IMPLIES" {
			continue
		}
		from, fromOK := nodes[relationship.Start]
		to, toOK := nodes[relationship.End]
		if !fromOK || !toOK || !hasLabel(from.Labels, "NodeElementType") || !hasLabel(to.Labels, "NodeLabel") {
			return nil, nil, publicError(CodeConsistency, "invalid Graph Type IMPLIES edge", nil)
		}
		additionalLabels[from.ElementID] = append(additionalLabels[from.ElementID], to.Properties.Label)
	}
	for _, node := range nodes {
		if !hasLabel(node.Labels, "NodeElementType") {
			continue
		}
		name := node.Properties.Label
		if strings.HasPrefix(name, reservedPrefix) {
			continue
		}
		properties, err := parseGraphProperties(node.Properties.Properties)
		if err != nil {
			return nil, nil, consistencyWrap("decode Node Definition "+name, err)
		}
		labels := append([]string(nil), additionalLabels[node.ElementID]...)
		for _, label := range labels {
			if strings.HasPrefix(label, reservedPrefix) {
				return nil, nil, publicError(CodeConsistency, "caller Node Definition implies reserved label", nil)
			}
		}
		sort.Strings(labels)
		ref := OntologyRef{Kind: KindNodeDefinition, Name: name}
		if _, exists := definitions[ref]; exists {
			return nil, nil, publicError(CodeConsistency, "duplicate Node Definition locator", nil)
		}
		definitions[ref] = &definitionRecord{
			Value: Definition{
				Kind:        KindNodeDefinition,
				Name:        name,
				Labels:      labels,
				Properties:  properties,
				Constraints: []Constraint{},
			},
			PropertyElementIDs: map[string]string{},
		}
		nodeRefs[node.ElementID] = ref
	}
	for _, relationship := range relationships {
		if relationship.Type != "RELATIONSHIP_ELEMENT_TYPE" {
			continue
		}
		name := relationship.Properties.RelationshipType
		if strings.HasPrefix(name, reservedPrefix) {
			continue
		}
		properties, err := parseGraphProperties(relationship.Properties.Properties)
		if err != nil {
			return nil, nil, consistencyWrap("decode Relationship Definition "+name, err)
		}
		var from *string
		var to *string
		if ref, ok := nodeRefs[relationship.Start]; ok {
			value := ref.String()
			from = &value
		} else if endpoint := nodes[relationship.Start]; !isAnyNodeEndpoint(endpoint) {
			return nil, nil, publicError(CodeConsistency, "Relationship source is not a Node Definition endpoint", nil)
		}
		if ref, ok := nodeRefs[relationship.End]; ok {
			value := ref.String()
			to = &value
		} else if endpoint := nodes[relationship.End]; !isAnyNodeEndpoint(endpoint) {
			return nil, nil, publicError(CodeConsistency, "Relationship target is not a Node Definition endpoint", nil)
		}
		ref := OntologyRef{Kind: KindRelationshipDefinition, Name: name}
		if _, exists := definitions[ref]; exists {
			return nil, nil, publicError(CodeConsistency, "duplicate Relationship Definition locator", nil)
		}
		definitions[ref] = &definitionRecord{
			Value: Definition{
				Kind:        KindRelationshipDefinition,
				Name:        name,
				From:        from,
				To:          to,
				Properties:  properties,
				Constraints: []Constraint{},
			},
			PropertyElementIDs: map[string]string{},
		}
	}
	return definitions, nodeRefs, nil
}

func isAnyNodeEndpoint(node graphTypeNode) bool {
	return node.ElementID != "" && (hasLabel(node.Labels, "AnyNode") || node.Properties.Label == "")
}

func parseGraphProperties(specs []string) ([]Property, error) {
	properties := make([]Property, 0, len(specs))
	seen := map[string]struct{}{}
	for _, spec := range specs {
		name, typeSpec, required, err := parseGraphPropertySpec(spec)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[name]; exists {
			return nil, publicError(CodeConsistency, "duplicate Graph Type property", nil)
		}
		seen[name] = struct{}{}
		property := Property{
			Name:     name,
			Type:     typeSpec,
			Required: required,
		}
		properties = append(properties, property)
	}
	sort.Slice(properties, func(i, j int) bool { return properties[i].Name < properties[j].Name })
	return properties, nil
}

func parseGraphPropertySpec(spec string) (string, string, bool, error) {
	name, rest, err := splitDisplayedIdentifier(spec)
	if err != nil || !strings.HasPrefix(rest, " :: ") {
		return "", "", false, publicError(CodeConsistency, "invalid Graph Type property specification", err)
	}
	typeRule := strings.TrimSpace(strings.TrimPrefix(rest, " :: "))
	if typeRule == "" {
		return "", "", false, publicError(CodeConsistency, "Graph Type property type is empty", nil)
	}
	members, err := splitTopLevelTypeUnion(typeRule)
	if err != nil {
		return "", "", false, err
	}
	required := false
	if len(members) == 1 {
		if stripped, ok := trimTopLevelNotNull(members[0]); ok {
			required = true
			members[0] = stripped
		}
	} else {
		allRequired := true
		anyRequired := false
		for index, member := range members {
			stripped, ok := trimTopLevelNotNull(member)
			allRequired = allRequired && ok
			anyRequired = anyRequired || ok
			if ok {
				members[index] = stripped
			}
		}
		if anyRequired && !allRequired {
			return "", "", false, publicError(CodeConsistency, "Graph Type union nullability is inconsistent", nil)
		}
		required = allRequired
	}
	return name, strings.Join(members, " | "), required, nil
}

func splitDisplayedIdentifier(input string) (string, string, error) {
	if input == "" {
		return "", "", publicError(CodeConsistency, "empty displayed identifier", nil)
	}
	if input[0] != '`' {
		separator := strings.Index(input, " :: ")
		if separator <= 0 {
			return "", "", publicError(CodeConsistency, "invalid displayed identifier", nil)
		}
		return input[:separator], input[separator:], nil
	}
	var builder strings.Builder
	for index := 1; index < len(input); index++ {
		if input[index] != '`' {
			builder.WriteByte(input[index])
			continue
		}
		if index+1 < len(input) && input[index+1] == '`' {
			builder.WriteByte('`')
			index++
			continue
		}
		if builder.Len() == 0 {
			return "", "", publicError(CodeConsistency, "empty displayed identifier", nil)
		}
		return builder.String(), input[index+1:], nil
	}
	return "", "", publicError(CodeConsistency, "unterminated displayed identifier", nil)
}

func splitTopLevelTypeUnion(rule string) ([]string, error) {
	var members []string
	depth := 0
	start := 0
	for index := 0; index < len(rule); index++ {
		switch rule[index] {
		case '<':
			depth++
		case '>':
			depth--
			if depth < 0 {
				return nil, publicError(CodeConsistency, "Graph Type property type has unbalanced brackets", nil)
			}
		case '|':
			if depth == 0 {
				member := strings.TrimSpace(rule[start:index])
				if member == "" {
					return nil, publicError(CodeConsistency, "Graph Type union contains an empty type", nil)
				}
				members = append(members, member)
				start = index + 1
			}
		}
	}
	if depth != 0 {
		return nil, publicError(CodeConsistency, "Graph Type property type has unbalanced brackets", nil)
	}
	last := strings.TrimSpace(rule[start:])
	if last == "" {
		return nil, publicError(CodeConsistency, "Graph Type property type is empty", nil)
	}
	members = append(members, last)
	return members, nil
}

func trimTopLevelNotNull(member string) (string, bool) {
	const suffix = " NOT NULL"
	if !strings.HasSuffix(strings.ToUpper(member), suffix) {
		return member, false
	}
	return strings.TrimSpace(member[:len(member)-len(suffix)]), true
}

func hasLabel(labels []string, target string) bool {
	for _, label := range labels {
		if label == target {
			return true
		}
	}
	return false
}

func consistencyWrap(message string, err error) error {
	return &PublicError{Code: CodeConsistency, Message: message, Cause: err}
}
