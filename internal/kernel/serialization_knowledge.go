package kernel

import (
	"bytes"
	"encoding/json"
	"io"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

func parseKnowledgeYAML(kind ObjectKind, document *yaml.Node) (ObjectValue, error) {
	root := dereferenceYAMLNode(document)
	if root != nil && root.Kind == yaml.DocumentNode && len(root.Content) == 1 {
		root = dereferenceYAMLNode(root.Content[0])
	}
	if root == nil || root.Kind != yaml.MappingNode {
		return ObjectValue{}, publicError(CodeType, "Knowledge Object must be a YAML mapping", nil)
	}
	fields := map[string]*yaml.Node{}
	for index := 0; index+1 < len(root.Content); index += 2 {
		fields[root.Content[index].Value] = dereferenceYAMLNode(root.Content[index+1])
	}
	require := func(name string) (*yaml.Node, error) {
		node, ok := fields[name]
		if !ok {
			return nil, publicError(CodeType, "missing required field "+name, nil)
		}
		return node, nil
	}
	stringField := func(name string) (string, error) {
		node, err := require(name)
		if err != nil {
			return "", err
		}
		if node == nil || node.Kind != yaml.ScalarNode || node.Tag != "!!str" {
			return "", publicError(CodeType, name+" must be a String", nil)
		}
		return node.Value, nil
	}
	propertiesField := func() (map[string]json.RawMessage, error) {
		node, err := require("properties")
		if err != nil {
			return nil, err
		}
		return rawPropertiesFromYAML(node)
	}

	switch kind {
	case KindKnowledgeNode:
		for name := range fields {
			if name != "labels" && name != "properties" {
				return ObjectValue{}, publicError(CodeType, "unknown Knowledge Node field "+name, nil)
			}
		}
		labelsNode, err := require("labels")
		if err != nil {
			return ObjectValue{}, err
		}
		labels, err := stringsFromYAMLSequence(labelsNode, "labels")
		if err != nil {
			return ObjectValue{}, err
		}
		properties, err := propertiesField()
		if err != nil {
			return ObjectValue{}, err
		}
		return ObjectValue{
			Kind:          KindKnowledgeNode,
			KnowledgeNode: &KnowledgeNode{Labels: labels, Properties: properties},
		}, nil
	case KindKnowledgeRelationship:
		for name := range fields {
			if name != "type" && name != "start" && name != "end" && name != "properties" {
				return ObjectValue{}, publicError(CodeType, "unknown Knowledge Relationship field "+name, nil)
			}
		}
		typeName, err := stringField("type")
		if err != nil {
			return ObjectValue{}, err
		}
		start, err := stringField("start")
		if err != nil {
			return ObjectValue{}, err
		}
		end, err := stringField("end")
		if err != nil {
			return ObjectValue{}, err
		}
		properties, err := propertiesField()
		if err != nil {
			return ObjectValue{}, err
		}
		return ObjectValue{
			Kind: KindKnowledgeRelationship,
			KnowledgeRelationship: &KnowledgeRelationship{
				Type: typeName, Start: start, End: end, Properties: properties,
			},
		}, nil
	default:
		return ObjectValue{}, publicError(CodeInvalidArgument, "unsupported Knowledge Object kind", nil)
	}
}

func stringsFromYAMLSequence(node *yaml.Node, field string) ([]string, error) {
	node = dereferenceYAMLNode(node)
	if node == nil || node.Kind != yaml.SequenceNode {
		return nil, publicError(CodeType, field+" must be a sequence", nil)
	}
	values := make([]string, 0, len(node.Content))
	for _, item := range node.Content {
		item = dereferenceYAMLNode(item)
		if item == nil || item.Kind != yaml.ScalarNode || item.Tag != "!!str" {
			return nil, publicError(CodeType, field+" entries must be Strings", nil)
		}
		values = append(values, item.Value)
	}
	return values, nil
}

func rawPropertiesFromYAML(node *yaml.Node) (map[string]json.RawMessage, error) {
	node = dereferenceYAMLNode(node)
	if node == nil || node.Kind != yaml.MappingNode {
		return nil, publicError(CodeType, "properties must be a mapping", nil)
	}
	properties := make(map[string]json.RawMessage, len(node.Content)/2)
	for index := 0; index+1 < len(node.Content); index += 2 {
		key := dereferenceYAMLNode(node.Content[index])
		if key == nil || key.Kind != yaml.ScalarNode || key.Tag != "!!str" {
			return nil, publicError(CodeType, "Knowledge Property names must be Strings", nil)
		}
		encoded, _, err := normalizeYAMLKnowledgeProperty(node.Content[index+1], true)
		if err != nil {
			return nil, err
		}
		properties[key.Value] = encoded
	}
	return properties, nil
}

func rawPropertiesYAMLNode(properties map[string]json.RawMessage) (*yaml.Node, error) {
	node := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
	keys := make([]string, 0, len(properties))
	for key := range properties {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value, err := jsonRawYAMLNode(properties[key])
		if err != nil {
			return nil, err
		}
		keyNode := stringNode(key)
		keyNode.Style = yaml.DoubleQuotedStyle
		node.Content = append(node.Content, keyNode, value)
	}
	return node, nil
}

func jsonRawYAMLNode(raw json.RawMessage) (*yaml.Node, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, publicError(CodeType, "decode Lithograph JSON Property value", err)
	}
	if err := decoder.Decode(new(any)); err != io.EOF {
		return nil, publicError(CodeType, "Lithograph JSON Property value contains trailing data", err)
	}
	return jsonValueYAMLNode(value)
}

func jsonValueYAMLNode(value any) (*yaml.Node, error) {
	switch typed := value.(type) {
	case nil:
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: "!!null", Value: "null"}, nil
	case bool:
		return boolNode(typed), nil
	case string:
		return stringNode(typed), nil
	case json.Number:
		text := typed.String()
		tag := "!!int"
		if strings.ContainsAny(text, ".eE") {
			tag = "!!float"
		}
		return &yaml.Node{Kind: yaml.ScalarNode, Tag: tag, Value: text}, nil
	case []any:
		node := &yaml.Node{Kind: yaml.SequenceNode, Tag: "!!seq"}
		for _, item := range typed {
			child, err := jsonValueYAMLNode(item)
			if err != nil {
				return nil, err
			}
			node.Content = append(node.Content, child)
		}
		return node, nil
	case map[string]any:
		node := &yaml.Node{Kind: yaml.MappingNode, Tag: "!!map"}
		_, tagged := typed["$type"].(string)
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			child, err := jsonValueYAMLNode(typed[key])
			if err != nil {
				return nil, err
			}
			keyNode := scalarKey(key)
			if !tagged {
				keyNode = stringNode(key)
				keyNode.Style = yaml.DoubleQuotedStyle
			}
			node.Content = append(node.Content, keyNode, child)
		}
		return node, nil
	default:
		return nil, publicError(CodeInternal, "unsupported decoded JSON Property value", nil)
	}
}
