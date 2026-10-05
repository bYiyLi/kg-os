package kernel

import (
	"bytes"
	"encoding/json"
	"io"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	maxYAMLNodes = 100000
	maxYAMLDepth = 128
)

func ParseObjectYAML(kind ObjectKind, body []byte) (ObjectValue, error) {
	value, err := parseObjectYAMLRaw(kind, body)
	if err != nil {
		return ObjectValue{}, err
	}
	if err := normalizeObject(value); err != nil {
		return ObjectValue{}, err
	}
	return value, nil
}

func ParseObjectJSON(kind ObjectKind, body []byte) (ObjectValue, error) {
	decodeStrict := func(target any) error {
		decoder := json.NewDecoder(bytes.NewReader(body))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(target); err != nil {
			return publicError(CodeType, "JSON Object value does not match the Object schema", err)
		}
		var trailing any
		if err := decoder.Decode(&trailing); err != io.EOF {
			return publicError(CodeParse, "Object JSON must contain exactly one value", err)
		}
		return nil
	}
	value, err := decodeObjectValue(kind, decodeStrict)
	if err != nil {
		return ObjectValue{}, err
	}
	if err := normalizeObject(value); err != nil {
		return ObjectValue{}, err
	}
	return value, nil
}

func parseObjectYAMLRaw(kind ObjectKind, body []byte) (ObjectValue, error) {
	var syntax yaml.Node
	decoder := yaml.NewDecoder(bytes.NewReader(body))
	if err := decoder.Decode(&syntax); err != nil {
		return ObjectValue{}, publicError(CodeParse, "invalid YAML object body", err)
	}
	var trailing yaml.Node
	if err := decoder.Decode(&trailing); err != nil && err != io.EOF {
		return ObjectValue{}, publicError(CodeParse, "invalid YAML object body", err)
	} else if err == nil && len(trailing.Content) != 0 {
		return ObjectValue{}, publicError(CodeParse, "object body must contain exactly one YAML document", nil)
	}
	seen := 0
	if err := validateYAMLNode(&syntax, 0, &seen, map[*yaml.Node]bool{}); err != nil {
		return ObjectValue{}, err
	}
	fields, err := topLevelYAMLFields(&syntax)
	if err != nil {
		return ObjectValue{}, err
	}
	if err := validateRequiredFields(kind, fields); err != nil {
		return ObjectValue{}, err
	}
	if err := validatePropertyFieldPresence(&syntax); err != nil {
		return ObjectValue{}, err
	}

	decodeStrict := func(target any) error {
		strict := yaml.NewDecoder(bytes.NewReader(body))
		strict.KnownFields(true)
		if err := strict.Decode(target); err != nil {
			return publicError(CodeType, "YAML object value does not match the Ontology schema", err)
		}
		return nil
	}

	if kind == KindKnowledgeNode || kind == KindKnowledgeRelationship {
		return parseKnowledgeYAML(kind, &syntax)
	}
	return decodeObjectValue(kind, decodeStrict)
}

func decodeObjectValue(
	kind ObjectKind,
	decode func(any) error,
) (ObjectValue, error) {
	value := ObjectValue{Kind: kind}
	switch kind {
	case KindDomain:
		var domain Domain
		if err := decode(&domain); err != nil {
			return ObjectValue{}, err
		}
		value.Domain = &domain
	case KindNodeDefinition, KindRelationshipDefinition:
		var definition Definition
		if err := decode(&definition); err != nil {
			return ObjectValue{}, err
		}
		definition.Kind = kind
		value.Definition = &definition
	case KindKnowledgeNode:
		var node KnowledgeNode
		if err := decode(&node); err != nil {
			return ObjectValue{}, err
		}
		value.KnowledgeNode = &node
	case KindKnowledgeRelationship:
		var relationship KnowledgeRelationship
		if err := decode(&relationship); err != nil {
			return ObjectValue{}, err
		}
		value.KnowledgeRelationship = &relationship
	default:
		return ObjectValue{}, publicError(CodeInvalidArgument, "unsupported Object kind", nil)
	}
	return value, nil
}

func validateYAMLNode(node *yaml.Node, depth int, count *int, active map[*yaml.Node]bool) error {
	if node == nil {
		return nil
	}
	*count++
	if *count > maxYAMLNodes || depth > maxYAMLDepth {
		return publicError(CodeResource, "YAML object exceeds parser resource limits", nil)
	}
	if active[node] {
		return publicError(CodeResource, "cyclic YAML aliases are not supported", nil)
	}
	active[node] = true
	defer delete(active, node)
	if node.Tag != "" && node.Tag != "!!map" && node.Tag != "!!seq" && node.Tag != "!!str" &&
		node.Tag != "!!bool" && node.Tag != "!!int" && node.Tag != "!!float" && node.Tag != "!!null" {
		return publicError(CodeType, "unknown YAML tag is not supported", nil)
	}
	if node.Kind == yaml.MappingNode {
		seenKeys := map[string]struct{}{}
		for index := 0; index+1 < len(node.Content); index += 2 {
			key := node.Content[index]
			if key.Kind != yaml.ScalarNode {
				return publicError(CodeType, "YAML object mapping keys must be scalars", nil)
			}
			if _, exists := seenKeys[key.Value]; exists {
				return publicError(CodeParse, "duplicate YAML mapping key", nil)
			}
			seenKeys[key.Value] = struct{}{}
		}
	}
	if node.Kind == yaml.AliasNode {
		if node.Alias == nil {
			return publicError(CodeParse, "invalid YAML alias", nil)
		}
		return validateYAMLNode(node.Alias, depth+1, count, active)
	}
	for _, child := range node.Content {
		if err := validateYAMLNode(child, depth+1, count, active); err != nil {
			return err
		}
	}
	return nil
}

func topLevelYAMLFields(document *yaml.Node) (map[string]struct{}, error) {
	if document.Kind != yaml.DocumentNode || len(document.Content) != 1 ||
		document.Content[0].Kind != yaml.MappingNode {
		return nil, publicError(CodeType, "Object must be a YAML mapping", nil)
	}
	fields := map[string]struct{}{}
	mapping := document.Content[0]
	for index := 0; index+1 < len(mapping.Content); index += 2 {
		fields[mapping.Content[index].Value] = struct{}{}
	}
	return fields, nil
}

func validateRequiredFields(kind ObjectKind, fields map[string]struct{}) error {
	require := func(names ...string) error {
		for _, name := range names {
			if _, exists := fields[name]; !exists {
				return publicError(CodeType, "missing required field "+name, nil)
			}
		}
		return nil
	}
	switch kind {
	case KindDomain:
		return require("name", "includes")
	case KindNodeDefinition:
		if _, exists := fields["from"]; exists {
			return publicError(CodeType, "Node Definition cannot contain from", nil)
		}
		if _, exists := fields["to"]; exists {
			return publicError(CodeType, "Node Definition cannot contain to", nil)
		}
		return require("name", "properties", "constraints")
	case KindRelationshipDefinition:
		return require("name", "from", "to", "properties", "constraints")
	case KindKnowledgeNode:
		return require("labels", "properties")
	case KindKnowledgeRelationship:
		return require("type", "start", "end", "properties")
	default:
		return publicError(CodeInvalidArgument, "unsupported Object kind", nil)
	}
}

func validatePropertyFieldPresence(document *yaml.Node) error {
	if document.Kind != yaml.DocumentNode || len(document.Content) != 1 {
		return nil
	}
	root := dereferenceYAMLNode(document.Content[0])
	if root == nil || root.Kind != yaml.MappingNode {
		return nil
	}
	var properties *yaml.Node
	for index := 0; index+1 < len(root.Content); index += 2 {
		if root.Content[index].Value == "properties" {
			properties = dereferenceYAMLNode(root.Content[index+1])
			break
		}
	}
	if properties == nil || properties.Kind != yaml.SequenceNode {
		return nil
	}
	for _, rawProperty := range properties.Content {
		property := dereferenceYAMLNode(rawProperty)
		if property == nil || property.Kind != yaml.MappingNode {
			continue
		}
		var typeValue string
		var requiredNode *yaml.Node
		for index := 0; index+1 < len(property.Content); index += 2 {
			key := property.Content[index].Value
			value := dereferenceYAMLNode(property.Content[index+1])
			switch key {
			case "type":
				if value != nil && value.Kind == yaml.ScalarNode {
					typeValue = value.Value
				}
			case "required":
				requiredNode = value
			}
		}
		if strings.HasSuffix(strings.ToUpper(strings.TrimSpace(typeValue)), " NOT NULL") &&
			requiredNode != nil &&
			requiredNode.Kind == yaml.ScalarNode &&
			requiredNode.Tag == "!!bool" &&
			strings.EqualFold(requiredNode.Value, "false") {
			return publicError(
				CodeType,
				"required:false conflicts with an outer NOT NULL property type",
				nil,
			)
		}
	}
	return nil
}

func dereferenceYAMLNode(node *yaml.Node) *yaml.Node {
	seen := map[*yaml.Node]struct{}{}
	for node != nil && node.Kind == yaml.AliasNode {
		if _, exists := seen[node]; exists {
			return nil
		}
		seen[node] = struct{}{}
		node = node.Alias
	}
	return node
}

func RenderObjectYAML(value ObjectValue) ([]byte, error) {
	if err := normalizeObject(value); err != nil {
		return nil, err
	}
	root := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	add := func(key string, node *yaml.Node) {
		root.Content = append(root.Content, scalarKey(key), node)
	}
	switch value.Kind {
	case KindDomain:
		domain := value.Domain
		add("name", stringNode(domain.Name))
		optionalString(add, "title", domain.Title)
		optionalString(add, "description", domain.Description)
		add("includes", stringListNode(domain.Includes))
	case KindNodeDefinition, KindRelationshipDefinition:
		definition := value.Definition
		add("name", stringNode(definition.Name))
		optionalString(add, "title", definition.Title)
		optionalString(add, "description", definition.Description)
		if value.Kind == KindNodeDefinition && len(definition.Labels) != 0 {
			add("labels", stringListNode(definition.Labels))
		}
		if value.Kind == KindRelationshipDefinition {
			add("from", nullableStringNode(definition.From))
			add("to", nullableStringNode(definition.To))
		}
		add("properties", propertiesNode(definition.Properties))
		add("constraints", constraintsNode(definition.Constraints))
		if len(definition.Indexes) != 0 {
			add("indexes", indexesNode(definition.Indexes, false))
		}
	case KindKnowledgeNode:
		node := value.KnowledgeNode
		add("labels", stringListNode(node.Labels))
		properties, err := rawPropertiesYAMLNode(node.Properties)
		if err != nil {
			return nil, err
		}
		add("properties", properties)
	case KindKnowledgeRelationship:
		relationship := value.KnowledgeRelationship
		add("type", stringNode(relationship.Type))
		add("start", stringNode(relationship.Start))
		add("end", stringNode(relationship.End))
		properties, err := rawPropertiesYAMLNode(relationship.Properties)
		if err != nil {
			return nil, err
		}
		add("properties", properties)
	default:
		return nil, publicError(CodeInvalidArgument, "unsupported Object kind", nil)
	}
	document := &yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{root}}
	var output bytes.Buffer
	encoder := yaml.NewEncoder(&output)
	encoder.SetIndent(2)
	if err := encoder.Encode(document); err != nil {
		return nil, publicError(CodeInternal, "render canonical YAML", err)
	}
	if err := encoder.Close(); err != nil {
		return nil, publicError(CodeInternal, "finish canonical YAML", err)
	}
	return bytes.ReplaceAll(output.Bytes(), []byte("\r\n"), []byte("\n")), nil
}

func RenderObjectJSON(value ObjectValue) ([]byte, error) {
	if err := normalizeObject(value); err != nil {
		return nil, err
	}
	var body []byte
	var err error
	switch value.Kind {
	case KindDomain:
		body, err = json.Marshal(value.Domain)
	case KindNodeDefinition, KindRelationshipDefinition:
		body, err = marshalDefinitionJSON(value.Definition)
	case KindKnowledgeNode:
		body, err = json.Marshal(value.KnowledgeNode)
	case KindKnowledgeRelationship:
		body, err = json.Marshal(value.KnowledgeRelationship)
	default:
		return nil, publicError(CodeInvalidArgument, "unsupported Object kind", nil)
	}
	if err != nil {
		return nil, publicError(CodeInternal, "render Object JSON", err)
	}
	return append(body, '\n'), nil
}

func marshalDefinitionJSON(definition *Definition) ([]byte, error) {
	object := make(map[string]any)
	object["name"] = definition.Name
	if definition.Title != nil {
		object["title"] = *definition.Title
	}
	if definition.Description != nil {
		object["description"] = *definition.Description
	}
	if definition.Kind == KindNodeDefinition && len(definition.Labels) != 0 {
		object["labels"] = definition.Labels
	}
	if definition.Kind == KindRelationshipDefinition {
		object["from"] = definition.From
		object["to"] = definition.To
	}
	object["properties"] = definition.Properties
	object["constraints"] = definition.Constraints
	if len(definition.Indexes) != 0 {
		object["indexes"] = definition.Indexes
	}
	return json.Marshal(object)
}

func scalarKey(value string) *yaml.Node {
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: value}
}

func stringNode(value string) *yaml.Node {
	style := yaml.DoubleQuotedStyle
	if strings.Contains(value, "\n") && !strings.Contains(value, "\r") && !containsControl(value) {
		style = yaml.LiteralStyle
	}
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: value, Style: style}
}

func containsControl(value string) bool {
	for _, r := range value {
		if r < 0x20 && r != '\n' && r != '\t' {
			return true
		}
	}
	return false
}

func nullableStringNode(value *string) *yaml.Node {
	if value == nil {
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}
	}
	return stringNode(*value)
}

func optionalString(add func(string, *yaml.Node), key string, value *string) {
	if value != nil {
		add(key, stringNode(*value))
	}
}

func stringListNode(values []string) *yaml.Node {
	node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	for _, value := range values {
		node.Content = append(node.Content, stringNode(value))
	}
	return node
}

func propertiesNode(properties []Property) *yaml.Node {
	node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	for _, property := range properties {
		mapping := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		put := func(key string, value *yaml.Node) {
			mapping.Content = append(mapping.Content, scalarKey(key), value)
		}
		put("name", stringNode(property.Name))
		optionalString(put, "title", property.Title)
		optionalString(put, "description", property.Description)
		put("type", stringNode(property.Type))
		if property.Required {
			put("required", boolNode(true))
		}
		if property.Unique {
			put("unique", boolNode(true))
		}
		if len(property.Constraints) != 0 {
			put("constraints", constraintsNode(property.Constraints))
		}
		if len(property.Indexes) != 0 {
			put("indexes", indexesNode(property.Indexes, true))
		}
		node.Content = append(node.Content, mapping)
	}
	return node
}

func constraintsNode(constraints []Constraint) *yaml.Node {
	node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	copyConstraints := append([]Constraint(nil), constraints...)
	sort.SliceStable(copyConstraints, func(i, j int) bool {
		if copyConstraints[i].Name == copyConstraints[j].Name {
			return copyConstraints[i].Type < copyConstraints[j].Type
		}
		return copyConstraints[i].Name < copyConstraints[j].Name
	})
	for _, constraint := range copyConstraints {
		mapping := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		put := func(key string, value *yaml.Node) {
			mapping.Content = append(mapping.Content, scalarKey(key), value)
		}
		if constraint.Name != "" {
			put("name", stringNode(constraint.Name))
		}
		put("type", stringNode(constraint.Type))
		if len(constraint.Properties) != 0 {
			put("properties", stringListNode(constraint.Properties))
		}
		node.Content = append(node.Content, mapping)
	}
	return node
}

func indexesNode(indexes []Index, propertyLocal bool) *yaml.Node {
	node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
	copyIndexes := append([]Index(nil), indexes...)
	sort.SliceStable(copyIndexes, func(i, j int) bool { return copyIndexes[i].Name < copyIndexes[j].Name })
	for _, index := range copyIndexes {
		mapping := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		put := func(key string, value *yaml.Node) {
			mapping.Content = append(mapping.Content, scalarKey(key), value)
		}
		put("name", stringNode(index.Name))
		put("type", stringNode(index.Type))
		if len(index.Targets) != 0 {
			put("targets", stringListNode(index.Targets))
		}
		if !propertyLocal && len(index.Properties) != 0 {
			put("properties", stringListNode(index.Properties))
		}
		node.Content = append(node.Content, mapping)
	}
	return node
}

func boolNode(value bool) *yaml.Node {
	text := "false"
	if value {
		text = "true"
	}
	return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!bool", Value: text}
}

func CanonicalObjectEqual(left, right ObjectValue) (bool, error) {
	leftJSON, err := RenderObjectJSON(left)
	if err != nil {
		return false, err
	}
	rightJSON, err := RenderObjectJSON(right)
	if err != nil {
		return false, err
	}
	return bytes.Equal(leftJSON, rightJSON), nil
}
