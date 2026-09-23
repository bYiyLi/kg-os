package kernel

import (
	"fmt"
	"strconv"
	"strings"
	"unicode/utf8"
)

type OntologyRef struct {
	Kind ObjectKind
	Name string
}

type ObjectRef struct {
	Kind ObjectKind
	Name string
	ID   string
}

func (ref ObjectRef) String() string {
	switch ref.Kind {
	case KindDomain, KindNodeDefinition, KindRelationshipDefinition:
		return OntologyRef{Kind: ref.Kind, Name: ref.Name}.String()
	case KindKnowledgeNode:
		return "n:" + ref.ID
	case KindKnowledgeRelationship:
		return "r:" + ref.ID
	default:
		return ""
	}
}

func (ref ObjectRef) Ontology() (OntologyRef, bool) {
	switch ref.Kind {
	case KindDomain, KindNodeDefinition, KindRelationshipDefinition:
		return OntologyRef{Kind: ref.Kind, Name: ref.Name}, true
	default:
		return OntologyRef{}, false
	}
}

func ParseObjectRef(value string) (ObjectRef, error) {
	if strings.HasPrefix(value, "n:") || strings.HasPrefix(value, "r:") {
		prefix := value[:2]
		id := value[2:]
		if id == "" || (len(id) > 1 && id[0] == '0') {
			return ObjectRef{}, publicError(CodeInvalidArgument, "invalid Knowledge Object Ref", nil)
		}
		parsed, err := strconv.ParseUint(id, 10, 64)
		if err != nil || strconv.FormatUint(parsed, 10) != id {
			return ObjectRef{}, publicError(CodeInvalidArgument, "invalid Knowledge Object Ref", err)
		}
		kind := KindKnowledgeNode
		if prefix == "r:" {
			kind = KindKnowledgeRelationship
		}
		return ObjectRef{Kind: kind, ID: id}, nil
	}
	ref, err := ParseOntologyRef(value)
	if err != nil {
		return ObjectRef{}, publicError(CodeInvalidArgument, "invalid Object Ref", err)
	}
	return ObjectRef{Kind: ref.Kind, Name: ref.Name}, nil
}

func (ref OntologyRef) String() string {
	prefix := ""
	switch ref.Kind {
	case KindDomain:
		prefix = "domain:"
	case KindNodeDefinition:
		prefix = "node:"
	case KindRelationshipDefinition:
		prefix = "relationship:"
	}
	return prefix + encodeRefComponent(ref.Name)
}

func ParseOntologyRef(value string) (OntologyRef, error) {
	var kind ObjectKind
	var encoded string
	switch {
	case strings.HasPrefix(value, "domain:"):
		kind, encoded = KindDomain, strings.TrimPrefix(value, "domain:")
	case strings.HasPrefix(value, "node:"):
		kind, encoded = KindNodeDefinition, strings.TrimPrefix(value, "node:")
	case strings.HasPrefix(value, "relationship:"):
		kind, encoded = KindRelationshipDefinition, strings.TrimPrefix(value, "relationship:")
	default:
		return OntologyRef{}, publicError(CodeInvalidArgument, "invalid Ontology Ref", nil)
	}
	name, err := decodeRefComponent(encoded)
	if err != nil || name == "" {
		return OntologyRef{}, publicError(CodeInvalidArgument, "invalid Ontology Ref", err)
	}
	if encodeRefComponent(name) != encoded {
		return OntologyRef{}, publicError(CodeInvalidArgument, "Ontology Ref is not canonical", nil)
	}
	return OntologyRef{Kind: kind, Name: name}, nil
}

func encodeRefComponent(value string) string {
	const hex = "0123456789ABCDEF"
	var output strings.Builder
	for _, b := range []byte(value) {
		if (b >= 'a' && b <= 'z') || (b >= 'A' && b <= 'Z') || (b >= '0' && b <= '9') ||
			b == '-' || b == '.' || b == '_' || b == '~' {
			output.WriteByte(b)
			continue
		}
		output.WriteByte('%')
		output.WriteByte(hex[b>>4])
		output.WriteByte(hex[b&0x0f])
	}
	return output.String()
}

func decodeRefComponent(value string) (string, error) {
	decoded := make([]byte, 0, len(value))
	for index := 0; index < len(value); {
		if value[index] != '%' {
			decoded = append(decoded, value[index])
			index++
			continue
		}
		if index+2 >= len(value) {
			return "", fmt.Errorf("short percent escape")
		}
		hi, okHi := fromHex(value[index+1])
		lo, okLo := fromHex(value[index+2])
		if !okHi || !okLo || (value[index+1] >= 'a' && value[index+1] <= 'f') ||
			(value[index+2] >= 'a' && value[index+2] <= 'f') {
			return "", fmt.Errorf("invalid percent escape")
		}
		decoded = append(decoded, hi<<4|lo)
		index += 3
	}
	if !utf8.Valid(decoded) {
		return "", fmt.Errorf("ref component is not UTF-8")
	}
	return string(decoded), nil
}

func fromHex(value byte) (byte, bool) {
	switch {
	case value >= '0' && value <= '9':
		return value - '0', true
	case value >= 'A' && value <= 'F':
		return value - 'A' + 10, true
	case value >= 'a' && value <= 'f':
		return value - 'a' + 10, true
	default:
		return 0, false
	}
}

func parseNewTarget(value string) (ObjectKind, string, error) {
	kind, alias, err := parseNewObjectTarget(value)
	if err != nil {
		return "", "", err
	}
	if kind != KindDomain && kind != KindNodeDefinition && kind != KindRelationshipDefinition {
		return "", "", publicError(CodeInvalidArgument, "ontology patch contains non-Ontology object kind", nil)
	}
	return kind, alias, nil
}

func parseNewObjectTarget(value string) (ObjectKind, string, error) {
	if !strings.HasPrefix(value, "new:") {
		return "", "", publicError(CodeInvalidArgument, "new object target must start with new:", nil)
	}
	rest := strings.TrimPrefix(value, "new:")
	separator := strings.IndexByte(rest, ':')
	if separator < 1 {
		return "", "", publicError(CodeInvalidArgument, "invalid new object target", nil)
	}
	kind := ObjectKind(rest[:separator])
	if kind != KindDomain && kind != KindNodeDefinition && kind != KindRelationshipDefinition &&
		kind != KindKnowledgeNode && kind != KindKnowledgeRelationship {
		return "", "", publicError(CodeInvalidArgument, "invalid new object kind", nil)
	}
	alias, err := decodeRefComponent(rest[separator+1:])
	if err != nil || len(alias) == 0 || len([]byte(alias)) > 255 {
		return "", "", publicError(CodeInvalidArgument, "invalid new object alias", err)
	}
	for _, r := range alias {
		if r == 0 || r < 0x20 || r == 0x7f {
			return "", "", publicError(CodeInvalidArgument, "new object alias contains a control character", nil)
		}
	}
	if encodeRefComponent(alias) != rest[separator+1:] {
		return "", "", publicError(CodeInvalidArgument, "new object alias is not canonical", nil)
	}
	return kind, alias, nil
}
