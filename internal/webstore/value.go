package webstore

import (
	"bytes"
	"encoding/json"
	"math"
	"strconv"
	"strings"
)

const safeInteger = int64(9007199254740991)

// Validation never re-encodes a cell: Integer decimal strings, floating point
// spelling, typed values, and escaped business maps retain their original bytes.
func validLithographValue(raw json.RawMessage) bool {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	return json.Valid(raw) && decoder.Decode(&value) == nil && validValue(value)
}

func validValue(value any) bool {
	switch value := value.(type) {
	case nil, bool, string:
		return true
	case json.Number:
		if !strings.ContainsAny(value.String(), ".eE") {
			integer, err := value.Int64()
			return err == nil && integer >= -safeInteger && integer <= safeInteger
		}
		_, valid := finiteNumber(value)
		return valid
	case []any:
		for _, child := range value {
			if !validValue(child) {
				return false
			}
		}
		return true
	case map[string]any:
		if tag, tagged := value["$type"]; tagged {
			name, ok := tag.(string)
			return ok && validTaggedValue(name, value)
		}
		return validPlainMap(value)
	default:
		return false
	}
}

func validPlainMap(object map[string]any) bool {
	if object == nil {
		return false
	}
	for _, child := range object {
		if !validValue(child) {
			return false
		}
	}
	return true
}

func fields(object map[string]any, names ...string) bool {
	if len(object) != len(names) {
		return false
	}
	for _, name := range names {
		if _, exists := object[name]; !exists {
			return false
		}
	}
	return true
}

func text(object map[string]any, name string) (string, bool) {
	value, valid := object[name].(string)
	return value, valid
}

func integerValue(value any) (int64, bool) {
	if number, ok := value.(json.Number); ok {
		integer, err := number.Int64()
		return integer, err == nil && integer >= -safeInteger && integer <= safeInteger
	}
	object, ok := value.(map[string]any)
	if !ok || object["$type"] != "Integer" || !fields(object, "$type", "value") {
		return 0, false
	}
	valueText, ok := text(object, "value")
	if !ok {
		return 0, false
	}
	integer, err := strconv.ParseInt(valueText, 10, 64)
	return integer, err == nil && strconv.FormatInt(integer, 10) == valueText
}

func finiteNumber(value any) (float64, bool) {
	if number, ok := value.(json.Number); ok {
		if !strings.ContainsAny(number.String(), ".eE") {
			if _, valid := integerValue(number); !valid {
				return 0, false
			}
		}
		parsed, err := number.Float64()
		return parsed, err == nil && !math.IsNaN(parsed) && !math.IsInf(parsed, 0)
	}
	integer, ok := integerValue(value)
	return float64(integer), ok
}

func validTaggedValue(tag string, object map[string]any) bool {
	switch tag {
	case "Integer":
		_, valid := integerValue(object)
		return valid
	case "Float":
		value, ok := text(object, "value")
		return fields(object, "$type", "value") && ok && (value == "NaN" || value == "Infinity" || value == "-Infinity")
	case "Map":
		entries, ok := object["entries"].(map[string]any)
		return fields(object, "$type", "entries") && ok && validPlainMap(entries)
	case "Node":
		return validNode(object)
	case "Relationship":
		return validRelationship(object)
	case "Path":
		return validPath(object)
	case "Point":
		return validPoint(object)
	case "Vector":
		return validVector(object)
	case "UUID":
		value, ok := text(object, "value")
		return fields(object, "$type", "value") && ok && validID(value)
	case "Date", "LocalTime", "Time", "LocalDateTime", "Duration":
		value, ok := text(object, "value")
		return fields(object, "$type", "value") && ok && value != ""
	case "ZonedDateTime":
		value, valueOK := text(object, "value")
		zone, zoneOK := text(object, "zone")
		return fields(object, "$type", "value", "zone") && valueOK && zoneOK && value != "" && zone != ""
	default:
		return false
	}
}

func validNode(object map[string]any) bool {
	if !fields(object, "$type", "elementId", "labels", "properties") {
		return false
	}
	if _, valid := text(object, "elementId"); !valid {
		return false
	}
	labels, ok := object["labels"].([]any)
	if !ok {
		return false
	}
	for _, label := range labels {
		if _, ok := label.(string); !ok {
			return false
		}
	}
	properties, ok := object["properties"].(map[string]any)
	return ok && validPlainMap(properties)
}

func validRelationship(object map[string]any) bool {
	if !fields(object, "$type", "elementId", "type", "start", "end", "properties") {
		return false
	}
	for _, name := range []string{"elementId", "type", "start", "end"} {
		if _, valid := text(object, name); !valid {
			return false
		}
	}
	properties, ok := object["properties"].(map[string]any)
	return ok && validPlainMap(properties)
}

func validPath(object map[string]any) bool {
	if !fields(object, "$type", "nodes", "relationships") {
		return false
	}
	nodes, nodeOK := object["nodes"].([]any)
	relationships, relationshipOK := object["relationships"].([]any)
	if !nodeOK || !relationshipOK || len(nodes) != len(relationships)+1 {
		return false
	}
	for _, node := range nodes {
		object, ok := node.(map[string]any)
		if !ok || object["$type"] != "Node" || !validNode(object) {
			return false
		}
	}
	for _, relationship := range relationships {
		object, ok := relationship.(map[string]any)
		if !ok || object["$type"] != "Relationship" || !validRelationship(object) {
			return false
		}
	}
	return true
}

func validPoint(object map[string]any) bool {
	if !fields(object, "$type", "crs", "coordinates") {
		return false
	}
	crs, crsOK := text(object, "crs")
	coordinates, coordinatesOK := object["coordinates"].([]any)
	if !crsOK || !coordinatesOK {
		return false
	}
	dimension := 0
	geographic := false
	switch strings.ToLower(crs) {
	case "cartesian":
		dimension = 2
	case "cartesian-3d":
		dimension = 3
	case "wgs-84":
		dimension = 2
		geographic = true
	case "wgs-84-3d":
		dimension = 3
		geographic = true
	default:
		return false
	}
	if len(coordinates) != dimension {
		return false
	}
	for index, coordinate := range coordinates {
		if _, ok := coordinate.(json.Number); !ok {
			return false
		}
		number, valid := finiteNumber(coordinate)
		if !valid || geographic && index == 1 && (number < -90 || number > 90) {
			return false
		}
	}
	return true
}

func validVector(object map[string]any) bool {
	if !fields(object, "$type", "coordinateType", "dimension", "values") {
		return false
	}
	coordinateType, typeOK := text(object, "coordinateType")
	dimensionNumber, dimensionNumberOK := object["dimension"].(json.Number)
	dimension, dimensionOK := integerValue(dimensionNumber)
	values, valuesOK := object["values"].([]any)
	if !typeOK || !dimensionNumberOK || !dimensionOK || dimension < 1 || dimension > 4096 || !valuesOK || int64(len(values)) != dimension {
		return false
	}
	typeName := strings.ToUpper(coordinateType)
	var minInteger, maxInteger int64
	switch typeName {
	case "I8", "INTEGER8":
		minInteger, maxInteger = math.MinInt8, math.MaxInt8
	case "I16", "INTEGER16":
		minInteger, maxInteger = math.MinInt16, math.MaxInt16
	case "I32", "INTEGER32":
		minInteger, maxInteger = math.MinInt32, math.MaxInt32
	case "I64", "INTEGER64", "INTEGER":
		minInteger, maxInteger = math.MinInt64, math.MaxInt64
	case "F32", "FLOAT32", "F64", "FLOAT64", "FLOAT":
		for _, coordinate := range values {
			value, valid := finiteNumber(coordinate)
			if !valid || (typeName == "F32" || typeName == "FLOAT32") && math.Abs(value) > math.MaxFloat32 {
				return false
			}
		}
		return true
	default:
		return false
	}
	for _, coordinate := range values {
		value, valid := integerValue(coordinate)
		if !valid || value < minInteger || value > maxInteger {
			return false
		}
	}
	return true
}
