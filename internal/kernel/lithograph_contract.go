package kernel

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"

	"github.com/zeebo/blake3"
)

// lithographGraphConstraintName mirrors the frozen Lithograph v0.3.0
// automatic name for KEY/UNIQUE constraints originating from a Graph Type.
// Matching is exact; the graph_constraint_* prefix is not KG OS-reserved.
func lithographGraphConstraintName(
	owner OntologyRef,
	properties []string,
	constraintType string,
) (string, error) {
	var origin string
	var target string
	switch owner.Kind {
	case KindNodeDefinition:
		origin = "graph/node/" + owner.Name
		target = "Node { label: " + rustDebugString(owner.Name) + " }"
	case KindRelationshipDefinition:
		origin = "graph/relationship/" + owner.Name
		target = "Relationship { relationship_type: " + rustDebugString(owner.Name) + " }"
	default:
		return "", publicError(CodeInternal, "Graph Type Constraint owner is not a Definition", nil)
	}

	mapped := ""
	switch constraintType {
	case "unique":
		mapped = "Unique"
	case "key":
		mapped = "Key"
	default:
		return "", publicError(CodeInternal, "unsupported Graph Type generated Constraint kind", nil)
	}

	quoted := make([]string, len(properties))
	for index, property := range properties {
		quoted[index] = rustDebugString(property)
	}
	canonical := fmt.Sprintf(
		"%s|%s|[%s]|%s",
		origin,
		target,
		strings.Join(quoted, ", "),
		mapped,
	)
	digest := blake3.Sum256([]byte(canonical))
	return "graph_constraint_" + hex.EncodeToString(digest[:8]), nil
}

func rustDebugString(value string) string {
	return strconv.Quote(value)
}
