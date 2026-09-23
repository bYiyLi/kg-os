package kernel

import (
	"bytes"
	"encoding/json"
	"io"
	"math"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

const lithographJSSafeInteger int64 = 9_007_199_254_740_991

type knowledgePropertyFamily uint8

const (
	propertyFamilyInvalid knowledgePropertyFamily = iota
	propertyFamilyBoolean
	propertyFamilyInteger
	propertyFamilyFloat
	propertyFamilyString
	propertyFamilyDate
	propertyFamilyLocalTime
	propertyFamilyTime
	propertyFamilyLocalDateTime
	propertyFamilyZonedDateTime
	propertyFamilyDuration
	propertyFamilyPoint
	propertyFamilyUUID
	propertyFamilyList
)

func normalizeKnowledgePropertyRaw(
	raw json.RawMessage,
) (json.RawMessage, knowledgePropertyFamily, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, propertyFamilyInvalid, publicError(CodeType, "invalid Lithograph JSON Property value", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Lithograph JSON Property value contains trailing data", err)
	}
	return normalizeKnowledgePropertyDecoded(value, true)
}

func normalizeKnowledgePropertyDecoded(
	value any,
	allowList bool,
) (json.RawMessage, knowledgePropertyFamily, error) {
	switch typed := value.(type) {
	case nil:
		return nil, propertyFamilyInvalid, publicError(CodeType, "null is not a persistent Knowledge Property value", nil)
	case bool:
		if typed {
			return json.RawMessage("true"), propertyFamilyBoolean, nil
		}
		return json.RawMessage("false"), propertyFamilyBoolean, nil
	case string:
		encoded, _ := json.Marshal(typed)
		return encoded, propertyFamilyString, nil
	case json.Number:
		return normalizeKnowledgeNumber(typed)
	case []any:
		if !allowList {
			return nil, propertyFamilyInvalid, publicError(CodeType, "nested List is not a persistent Knowledge Property value", nil)
		}
		parts := make([]json.RawMessage, 0, len(typed))
		family := propertyFamilyInvalid
		for _, item := range typed {
			normalized, itemFamily, err := normalizeKnowledgePropertyDecoded(item, false)
			if err != nil {
				return nil, propertyFamilyInvalid, err
			}
			if family == propertyFamilyInvalid {
				family = itemFamily
			} else if family != itemFamily {
				return nil, propertyFamilyInvalid, publicError(CodeType, "Knowledge Property List must contain one property value family", nil)
			}
			parts = append(parts, normalized)
		}
		return joinJSONArray(parts), propertyFamilyList, nil
	case map[string]any:
		return normalizeKnowledgeTaggedValue(typed)
	default:
		return nil, propertyFamilyInvalid, publicError(CodeType, "unsupported Knowledge Property value", nil)
	}
}

func normalizeKnowledgeNumber(
	number json.Number,
) (json.RawMessage, knowledgePropertyFamily, error) {
	text := number.String()
	if !strings.ContainsAny(text, ".eE") {
		value, err := strconv.ParseInt(text, 10, 64)
		if err != nil {
			return nil, propertyFamilyInvalid, publicError(CodeType, "Integer is outside INTEGER64 range", err)
		}
		return canonicalIntegerRaw(value), propertyFamilyInteger, nil
	}
	value, err := strconv.ParseFloat(text, 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Float is outside the finite FLOAT64 range", err)
	}
	return canonicalFloatRaw(value), propertyFamilyFloat, nil
}

func canonicalIntegerRaw(value int64) json.RawMessage {
	if value >= -lithographJSSafeInteger && value <= lithographJSSafeInteger {
		return json.RawMessage(strconv.FormatInt(value, 10))
	}
	return mustMarshalRaw(map[string]string{
		"$type": "Integer",
		"value": strconv.FormatInt(value, 10),
	})
}

func canonicalFloatRaw(value float64) json.RawMessage {
	if math.IsNaN(value) {
		return mustMarshalRaw(map[string]string{"$type": "Float", "value": "NaN"})
	}
	if math.IsInf(value, 1) {
		return mustMarshalRaw(map[string]string{"$type": "Float", "value": "Infinity"})
	}
	if math.IsInf(value, -1) {
		return mustMarshalRaw(map[string]string{"$type": "Float", "value": "-Infinity"})
	}
	text := strconv.FormatFloat(value, 'g', -1, 64)
	if text == "-0" {
		text = "-0.0"
	} else if !strings.ContainsAny(text, ".eE") {
		text += ".0"
	}
	return json.RawMessage(text)
}

func normalizeKnowledgeTaggedValue(
	value map[string]any,
) (json.RawMessage, knowledgePropertyFamily, error) {
	rawTag, ok := value["$type"]
	if !ok {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Map is not a persistent Knowledge Property value", nil)
	}
	tag, ok := rawTag.(string)
	if !ok {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Lithograph JSON $type must be a String", nil)
	}
	switch tag {
	case "Integer":
		if err := requireKnowledgeTaggedFields(value, "$type", "value"); err != nil {
			return nil, propertyFamilyInvalid, err
		}
		text, ok := value["value"].(string)
		if !ok {
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged Integer value must be a decimal String", nil)
		}
		integer, err := strconv.ParseInt(text, 10, 64)
		if err != nil || strconv.FormatInt(integer, 10) != text {
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged Integer is not a canonical INTEGER64 decimal", err)
		}
		return canonicalIntegerRaw(integer), propertyFamilyInteger, nil
	case "Float":
		if err := requireKnowledgeTaggedFields(value, "$type", "value"); err != nil {
			return nil, propertyFamilyInvalid, err
		}
		text, ok := value["value"].(string)
		if !ok {
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged Float value must be a String", nil)
		}
		switch text {
		case "NaN":
			return canonicalFloatRaw(math.NaN()), propertyFamilyFloat, nil
		case "Infinity":
			return canonicalFloatRaw(math.Inf(1)), propertyFamilyFloat, nil
		case "-Infinity":
			return canonicalFloatRaw(math.Inf(-1)), propertyFamilyFloat, nil
		default:
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged Float must be NaN, Infinity, or -Infinity", nil)
		}
	case "Date":
		return normalizeTextTaggedValue(value, tag, propertyFamilyDate)
	case "LocalTime":
		return normalizeTextTaggedValue(value, tag, propertyFamilyLocalTime)
	case "Time":
		return normalizeTextTaggedValue(value, tag, propertyFamilyTime)
	case "LocalDateTime":
		return normalizeTextTaggedValue(value, tag, propertyFamilyLocalDateTime)
	case "Duration":
		return normalizeTextTaggedValue(value, tag, propertyFamilyDuration)
	case "UUID":
		normalized, family, err := normalizeTextTaggedValue(value, tag, propertyFamilyUUID)
		if err != nil {
			return nil, propertyFamilyInvalid, err
		}
		var object map[string]string
		if err := json.Unmarshal(normalized, &object); err != nil {
			return nil, propertyFamilyInvalid, publicError(CodeInternal, "decode normalized UUID", err)
		}
		canonical, ok := canonicalUUID(object["value"])
		if !ok {
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged UUID is invalid", nil)
		}
		return mustMarshalRaw(map[string]string{"$type": "UUID", "value": canonical}), family, nil
	case "ZonedDateTime":
		if err := requireKnowledgeTaggedFields(value, "$type", "value", "zone"); err != nil {
			return nil, propertyFamilyInvalid, err
		}
		text, textOK := value["value"].(string)
		zone, zoneOK := value["zone"].(string)
		if !textOK || !zoneOK || text == "" || zone == "" {
			return nil, propertyFamilyInvalid, publicError(CodeType, "tagged ZonedDateTime requires String value and zone", nil)
		}
		return mustMarshalRaw(map[string]string{
			"$type": "ZonedDateTime",
			"value": text,
			"zone":  zone,
		}), propertyFamilyZonedDateTime, nil
	case "Point":
		return normalizeKnowledgePoint(value)
	case "Vector":
		return nil, propertyFamilyInvalid, publicError(CodeUnsupportedOperation, "caller-owned Vector values are not supported by Object", nil)
	case "Map", "Node", "Relationship", "Path":
		return nil, propertyFamilyInvalid, publicError(CodeType, tag+" is not a persistent Knowledge Property value", nil)
	default:
		return nil, propertyFamilyInvalid, publicError(CodeType, "unknown Lithograph JSON $type", nil)
	}
}

func normalizeTextTaggedValue(
	value map[string]any,
	tag string,
	family knowledgePropertyFamily,
) (json.RawMessage, knowledgePropertyFamily, error) {
	if err := requireKnowledgeTaggedFields(value, "$type", "value"); err != nil {
		return nil, propertyFamilyInvalid, err
	}
	text, ok := value["value"].(string)
	if !ok || text == "" {
		return nil, propertyFamilyInvalid, publicError(CodeType, "tagged "+tag+" value must be a non-empty String", nil)
	}
	return mustMarshalRaw(map[string]string{"$type": tag, "value": text}), family, nil
}

func normalizeKnowledgePoint(
	value map[string]any,
) (json.RawMessage, knowledgePropertyFamily, error) {
	if err := requireKnowledgeTaggedFields(value, "$type", "crs", "coordinates"); err != nil {
		return nil, propertyFamilyInvalid, err
	}
	crs, ok := value["crs"].(string)
	if !ok {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Point crs must be a String", nil)
	}
	crs = strings.ToLower(crs)
	dimension := 0
	geographic := false
	switch crs {
	case "wgs-84":
		dimension, geographic = 2, true
	case "wgs-84-3d":
		dimension, geographic = 3, true
	case "cartesian":
		dimension = 2
	case "cartesian-3d":
		dimension = 3
	default:
		return nil, propertyFamilyInvalid, publicError(CodeType, "Point crs is unsupported", nil)
	}
	coordinates, ok := value["coordinates"].([]any)
	if !ok || len(coordinates) != dimension {
		return nil, propertyFamilyInvalid, publicError(CodeType, "Point coordinates have the wrong dimension", nil)
	}
	parts := make([]json.RawMessage, 0, len(coordinates))
	numeric := make([]float64, 0, len(coordinates))
	for _, coordinate := range coordinates {
		number, ok := coordinate.(json.Number)
		if !ok {
			return nil, propertyFamilyInvalid, publicError(CodeType, "Point coordinates must be finite JSON numbers", nil)
		}
		parsed, err := strconv.ParseFloat(number.String(), 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return nil, propertyFamilyInvalid, publicError(CodeType, "Point coordinates must be finite JSON numbers", err)
		}
		numeric = append(numeric, parsed)
	}
	if geographic {
		if numeric[1] < -90 || numeric[1] > 90 {
			return nil, propertyFamilyInvalid, publicError(CodeType, "WGS-84 latitude is outside its valid range", nil)
		}
		numeric[0] = normalizeLongitude(numeric[0])
	}
	for _, coordinate := range numeric {
		parts = append(parts, canonicalFloatRaw(coordinate))
	}
	return marshalRawObject(map[string]json.RawMessage{
		"$type":       mustMarshalRaw("Point"),
		"crs":         mustMarshalRaw(crs),
		"coordinates": joinJSONArray(parts),
	}), propertyFamilyPoint, nil
}

func normalizeLongitude(value float64) float64 {
	if value >= -180 && value <= 180 {
		return value
	}
	return math.Mod(math.Mod(value+180, 360)+360, 360) - 180
}

func requireKnowledgeTaggedFields(value map[string]any, fields ...string) error {
	if len(value) != len(fields) {
		return publicError(CodeType, "tagged Lithograph JSON has unexpected fields", nil)
	}
	want := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		want[field] = struct{}{}
	}
	for field := range value {
		if _, ok := want[field]; !ok {
			return publicError(CodeType, "tagged Lithograph JSON has unexpected fields", nil)
		}
	}
	return nil
}

func canonicalUUID(value string) (string, bool) {
	if len(value) != 36 || value[8] != '-' || value[13] != '-' || value[18] != '-' || value[23] != '-' {
		return "", false
	}
	for index, char := range value {
		if index == 8 || index == 13 || index == 18 || index == 23 {
			continue
		}
		if !((char >= '0' && char <= '9') || (char >= 'a' && char <= 'f') || (char >= 'A' && char <= 'F')) {
			return "", false
		}
	}
	return strings.ToLower(value), true
}

func normalizeYAMLKnowledgeProperty(
	node *yaml.Node,
	allowList bool,
) (json.RawMessage, knowledgePropertyFamily, error) {
	node = dereferenceYAMLNode(node)
	if node == nil {
		return nil, propertyFamilyInvalid, publicError(CodeParse, "invalid YAML alias", nil)
	}
	switch node.Kind {
	case yaml.ScalarNode:
		switch node.Tag {
		case "!!null":
			return nil, propertyFamilyInvalid, publicError(CodeType, "null is not a persistent Knowledge Property value", nil)
		case "!!str":
			return normalizeKnowledgePropertyDecoded(node.Value, allowList)
		case "!!bool":
			value, err := strconv.ParseBool(strings.ToLower(node.Value))
			if err != nil {
				return nil, propertyFamilyInvalid, publicError(CodeType, "invalid Boolean Property value", err)
			}
			return normalizeKnowledgePropertyDecoded(value, allowList)
		case "!!int":
			var value int64
			if err := node.Decode(&value); err != nil {
				return nil, propertyFamilyInvalid, publicError(CodeType, "Integer is outside INTEGER64 range", err)
			}
			return canonicalIntegerRaw(value), propertyFamilyInteger, nil
		case "!!float":
			var value float64
			if err := node.Decode(&value); err != nil {
				return nil, propertyFamilyInvalid, publicError(CodeType, "invalid Float Property value", err)
			}
			return canonicalFloatRaw(value), propertyFamilyFloat, nil
		default:
			return nil, propertyFamilyInvalid, publicError(CodeType, "unsupported YAML scalar Property value", nil)
		}
	case yaml.SequenceNode:
		if !allowList {
			return nil, propertyFamilyInvalid, publicError(CodeType, "nested List is not a persistent Knowledge Property value", nil)
		}
		parts := make([]json.RawMessage, 0, len(node.Content))
		family := propertyFamilyInvalid
		for _, child := range node.Content {
			normalized, childFamily, err := normalizeYAMLKnowledgeProperty(child, false)
			if err != nil {
				return nil, propertyFamilyInvalid, err
			}
			if family == propertyFamilyInvalid {
				family = childFamily
			} else if family != childFamily {
				return nil, propertyFamilyInvalid, publicError(CodeType, "Knowledge Property List must contain one property value family", nil)
			}
			parts = append(parts, normalized)
		}
		return joinJSONArray(parts), propertyFamilyList, nil
	case yaml.MappingNode:
		jsonRaw, err := yamlMappingJSON(node)
		if err != nil {
			return nil, propertyFamilyInvalid, err
		}
		return normalizeKnowledgePropertyRaw(jsonRaw)
	default:
		return nil, propertyFamilyInvalid, publicError(CodeType, "unsupported YAML Property value", nil)
	}
}

func yamlMappingJSON(node *yaml.Node) (json.RawMessage, error) {
	fields := make(map[string]json.RawMessage, len(node.Content)/2)
	for index := 0; index+1 < len(node.Content); index += 2 {
		key := dereferenceYAMLNode(node.Content[index])
		if key == nil || key.Kind != yaml.ScalarNode || key.Tag != "!!str" {
			return nil, publicError(CodeType, "typed value mapping keys must be Strings", nil)
		}
		value, err := yamlNodeJSONRaw(node.Content[index+1])
		if err != nil {
			return nil, err
		}
		fields[key.Value] = value
	}
	return marshalRawObject(fields), nil
}

func yamlNodeJSONRaw(node *yaml.Node) (json.RawMessage, error) {
	node = dereferenceYAMLNode(node)
	if node == nil {
		return nil, publicError(CodeParse, "invalid YAML alias", nil)
	}
	switch node.Kind {
	case yaml.ScalarNode:
		switch node.Tag {
		case "!!null":
			return json.RawMessage("null"), nil
		case "!!str":
			return mustMarshalRaw(node.Value), nil
		case "!!bool":
			value, err := strconv.ParseBool(strings.ToLower(node.Value))
			if err != nil {
				return nil, publicError(CodeType, "invalid Boolean value", err)
			}
			return mustMarshalRaw(value), nil
		case "!!int":
			var value int64
			if err := node.Decode(&value); err != nil {
				return nil, publicError(CodeType, "Integer is outside INTEGER64 range", err)
			}
			return json.RawMessage(strconv.FormatInt(value, 10)), nil
		case "!!float":
			var value float64
			if err := node.Decode(&value); err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
				return nil, publicError(CodeType, "tagged value contains a non-JSON Float", err)
			}
			return canonicalFloatRaw(value), nil
		default:
			return nil, publicError(CodeType, "unsupported YAML scalar value", nil)
		}
	case yaml.SequenceNode:
		parts := make([]json.RawMessage, 0, len(node.Content))
		for _, child := range node.Content {
			raw, err := yamlNodeJSONRaw(child)
			if err != nil {
				return nil, err
			}
			parts = append(parts, raw)
		}
		return joinJSONArray(parts), nil
	case yaml.MappingNode:
		return yamlMappingJSON(node)
	default:
		return nil, publicError(CodeType, "unsupported YAML value", nil)
	}
}

func joinJSONArray(values []json.RawMessage) json.RawMessage {
	var output bytes.Buffer
	output.WriteByte('[')
	for index, value := range values {
		if index != 0 {
			output.WriteByte(',')
		}
		output.Write(value)
	}
	output.WriteByte(']')
	return output.Bytes()
}

func marshalRawObject(values map[string]json.RawMessage) json.RawMessage {
	encoded, _ := json.Marshal(values)
	return encoded
}

func mustMarshalRaw(value any) json.RawMessage {
	encoded, _ := json.Marshal(value)
	return encoded
}
