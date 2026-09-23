package kernel

import (
	"sort"
	"strings"
)

func validateReservedGraphType(
	nodes map[string]graphTypeNode,
	relationships map[string]graphTypeRelationship,
) error {
	expectedProperties := map[string][]string{
		definitionBindingLabel: {
			internalDescriptionProperty + " :: STRING",
			internalKindProperty + " :: STRING NOT NULL",
			internalNameProperty + " :: STRING NOT NULL",
			internalTitleProperty + " :: STRING",
		},
		propertyBindingLabel: {
			internalDescriptionProperty + " :: STRING",
			internalNameProperty + " :: STRING NOT NULL",
			internalTitleProperty + " :: STRING",
		},
		domainLabel: {
			internalDescriptionProperty + " :: STRING",
			internalNameProperty + " :: STRING NOT NULL",
			internalTitleProperty + " :: STRING",
		},
	}
	byLabel := map[string]graphTypeNode{}
	for _, node := range nodes {
		label := node.Properties.Label
		if !strings.HasPrefix(label, reservedPrefix) {
			continue
		}
		if label == internalLabel {
			if hasLabel(node.Labels, "NodeElementType") {
				return publicError(CodeConsistency, "__kgos_internal must not be a Node Element Type", nil)
			}
			continue
		}
		if label != definitionBindingLabel && label != propertyBindingLabel && label != domainLabel {
			return publicError(CodeConsistency, "unknown reserved Graph Type label", nil)
		}
		if !hasLabel(node.Labels, "NodeElementType") {
			continue
		}
		if _, exists := byLabel[label]; exists {
			return publicError(CodeConsistency, "duplicate reserved Node Element Type", nil)
		}
		actual := append([]string(nil), node.Properties.Properties...)
		sort.Strings(actual)
		expected := append([]string(nil), expectedProperties[label]...)
		sort.Strings(expected)
		if strings.Join(actual, "\x00") != strings.Join(expected, "\x00") {
			return publicError(CodeConsistency, "reserved Graph Type property profile does not match D68", nil)
		}
		byLabel[label] = node
	}
	for label := range expectedProperties {
		if _, ok := byLabel[label]; !ok {
			return publicError(CodeConsistency, "reserved Graph Type is incomplete", nil)
		}
	}
	for _, label := range []string{definitionBindingLabel, propertyBindingLabel, domainLabel} {
		impliedCount := 0
		for _, relationship := range relationships {
			if relationship.Type != "IMPLIES" || relationship.Start != byLabel[label].ElementID {
				continue
			}
			impliedCount++
			end := nodes[relationship.End]
			if !hasLabel(end.Labels, "NodeLabel") || end.Properties.Label != internalLabel {
				return publicError(
					CodeConsistency,
					"reserved Graph Type marker implication has an unexpected target",
					nil,
				)
			}
		}
		if impliedCount != 1 {
			return publicError(
				CodeConsistency,
				"reserved Graph Type marker implication profile does not match D68",
				nil,
			)
		}
	}
	expectedRelationships := map[string][2]string{
		propertyOfType: {propertyBindingLabel, definitionBindingLabel},
		includesType:   {domainLabel, internalLabel},
	}
	seenRelationships := map[string]struct{}{}
	for _, relationship := range relationships {
		if relationship.Type != "RELATIONSHIP_ELEMENT_TYPE" {
			continue
		}
		name := relationship.Properties.RelationshipType
		if !strings.HasPrefix(name, reservedPrefix) {
			continue
		}
		endpoints, expected := expectedRelationships[name]
		if !expected {
			return publicError(CodeConsistency, "unknown reserved Graph Type relationship type", nil)
		}
		if _, duplicate := seenRelationships[name]; duplicate {
			return publicError(CodeConsistency, "duplicate reserved Graph Type relationship type", nil)
		}
		seenRelationships[name] = struct{}{}
		if len(relationship.Properties.Properties) != 0 {
			return publicError(CodeConsistency, "reserved Graph Type relationship unexpectedly declares properties", nil)
		}
		start, startOK := nodes[relationship.Start]
		end, endOK := nodes[relationship.End]
		if !startOK || !endOK ||
			!hasLabel(start.Labels, "NodeLabel") ||
			!hasLabel(end.Labels, "NodeLabel") ||
			start.Properties.Label != endpoints[0] ||
			end.Properties.Label != endpoints[1] {
			return publicError(
				CodeConsistency,
				"reserved Graph Type relationship endpoints do not match the D68 non-identifying profile",
				nil,
			)
		}
	}
	for name := range expectedRelationships {
		if _, found := seenRelationships[name]; !found {
			return publicError(CodeConsistency, "reserved Graph Type relationship profile is incomplete", nil)
		}
	}
	return nil
}
