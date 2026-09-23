package kernel

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

type constraintSpec struct {
	Name       string
	Owner      OntologyRef
	Type       string
	Properties []string
}

func buildGraphType(objects map[OntologyRef]*plannedObject) string {
	inner := strings.TrimSuffix(strings.TrimPrefix(reservedGraphType, "{"), "}")
	entries := []string{inner}
	refs := make([]OntologyRef, 0, len(objects))
	for ref, object := range objects {
		if object.Value.Definition != nil {
			refs = append(refs, ref)
		}
	}
	sort.Slice(refs, func(i, j int) bool {
		return string(refs[i].Kind)+"\x00"+refs[i].String() < string(refs[j].Kind)+"\x00"+refs[j].String()
	})
	for _, ref := range refs {
		definition := objects[ref].Value.Definition
		properties := make([]string, 0, len(definition.Properties))
		for _, property := range definition.Properties {
			rule := quoteCypherIdentifier(property.Name) + " :: " + graphPropertyTypeRule(property)
			if property.Unique {
				rule += " IS UNIQUE"
			}
			properties = append(properties, rule)
		}
		propertyMap := "{" + strings.Join(properties, ", ") + "}"
		if ref.Kind == KindNodeDefinition {
			implied := ""
			if len(definition.Labels) != 0 {
				labels := append([]string(nil), definition.Labels...)
				sort.Strings(labels)
				for index, label := range labels {
					if index == 0 {
						implied = " :" + quoteCypherIdentifier(label)
					} else {
						implied += "&" + quoteCypherIdentifier(label)
					}
				}
			}
			entries = append(entries, "(:"+quoteCypherIdentifier(definition.Name)+" =>"+implied+" "+propertyMap+")")
			continue
		}
		entries = append(entries,
			graphTypeEndpoint(definition.From)+"-[:"+quoteCypherIdentifier(definition.Name)+" => "+
				propertyMap+"]->"+graphTypeEndpoint(definition.To),
		)
	}
	return "{" + strings.Join(entries, ", ") + "}"
}

func graphPropertyTypeRule(property Property) string {
	if !property.Required {
		return property.Type
	}
	members, err := splitTopLevelTypeUnion(property.Type)
	if err != nil || len(members) <= 1 {
		return property.Type + " NOT NULL"
	}
	for index := range members {
		members[index] += " NOT NULL"
	}
	return strings.Join(members, " | ")
}

func graphTypeEndpoint(ref *string) string {
	if ref == nil {
		return "()"
	}
	parsed, err := ParseOntologyRef(*ref)
	if err != nil {
		return "()"
	}
	return "(:" + quoteCypherIdentifier(parsed.Name) + " =>)"
}

func quoteCypherIdentifier(value string) string {
	return "`" + strings.ReplaceAll(value, "`", "``") + "`"
}

func cypherString(value string) string {
	body, _ := json.Marshal(value)
	return string(body)
}

func collectBaseConstraints(base *snapshot) (map[string]constraintSpec, error) {
	objects := map[OntologyRef]*plannedObject{}
	for ref, record := range base.Definitions {
		definition := cloneDefinition(record.Value)
		objects[ref] = &plannedObject{Value: ObjectValue{Kind: ref.Kind, Definition: &definition}}
	}
	return collectConstraintSpecs(objects)
}

func collectConstraintSpecs(objects map[OntologyRef]*plannedObject) (map[string]constraintSpec, error) {
	result := map[string]constraintSpec{}
	refs := make([]OntologyRef, 0, len(objects))
	for ref, object := range objects {
		if object.Value.Definition != nil {
			refs = append(refs, ref)
		}
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].String() < refs[j].String() })
	for _, ref := range refs {
		definition := objects[ref].Value.Definition
		for _, constraint := range definition.Constraints {
			spec := constraintSpec{
				Name: constraint.Name, Owner: ref, Type: constraint.Type,
				Properties: append([]string(nil), constraint.Properties...),
			}
			if err := addConstraintSpec(result, spec); err != nil {
				return nil, err
			}
		}
		for _, property := range definition.Properties {
			for _, constraint := range property.Constraints {
				spec := constraintSpec{
					Name: constraint.Name, Owner: ref, Type: constraint.Type,
					Properties: []string{property.Name},
				}
				if err := addConstraintSpec(result, spec); err != nil {
					return nil, err
				}
			}
		}
	}
	return result, nil
}

func addConstraintSpec(result map[string]constraintSpec, spec constraintSpec) error {
	if spec.Name != "" {
		generated, err := lithographGraphConstraintName(spec.Owner, spec.Properties, spec.Type)
		if err != nil {
			return err
		}
		if spec.Name == generated {
			return errorWithDetails(
				CodeReservedIdentifier,
				"Constraint name collides with Lithograph Graph Type generated identity",
				map[string]any{"name": spec.Name},
			)
		}
	}
	if spec.Name == "" {
		spec.Name = anonymousConstraintName(spec)
	}
	if existing, exists := result[spec.Name]; exists {
		if !equalConstraintSpec(existing, spec) {
			return errorWithDetails(CodeObjectConflict,
				"Constraint name is used by different logical resources",
				map[string]any{"name": spec.Name},
			)
		}
		return nil
	}
	result[spec.Name] = spec
	return nil
}

func anonymousConstraintName(spec constraintSpec) string {
	kind := "node"
	if spec.Owner.Kind == KindRelationshipDefinition {
		kind = "relationship"
	}
	payload := struct {
		Kind       string   `json:"kind"`
		TargetRefs []string `json:"targetRefs"`
		Type       string   `json:"type"`
		Properties []string `json:"properties"`
	}{
		Kind:       kind,
		TargetRefs: []string{spec.Owner.String()},
		Type:       spec.Type,
		Properties: append([]string(nil), spec.Properties...),
	}
	var buffer bytes.Buffer
	encoder := json.NewEncoder(&buffer)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(payload)
	body := bytes.TrimSuffix(buffer.Bytes(), []byte{'\n'})
	hash := sha256.Sum256(body)
	return "kgos_c_" + hex.EncodeToString(hash[:])
}

func equalConstraintSpec(left, right constraintSpec) bool {
	return left.Owner == right.Owner &&
		left.Type == right.Type &&
		strings.Join(left.Properties, "\x00") == strings.Join(right.Properties, "\x00")
}

func createConstraintCypher(spec constraintSpec) (string, error) {
	if len(spec.Properties) == 0 {
		return "", publicError(CodeType, "Constraint requires at least one Property", nil)
	}
	variable := "n"
	pattern := "(" + variable + ":" + quoteCypherIdentifier(spec.Owner.Name) + ")"
	keyQualifier := " NODE"
	if spec.Owner.Kind == KindRelationshipDefinition {
		variable = "r"
		pattern = "()-[" + variable + ":" + quoteCypherIdentifier(spec.Owner.Name) + "]-()"
		keyQualifier = " RELATIONSHIP"
	} else if spec.Owner.Kind != KindNodeDefinition {
		return "", publicError(CodeType, "Constraint owner must be a Definition", nil)
	}
	properties := make([]string, 0, len(spec.Properties))
	for _, property := range spec.Properties {
		properties = append(properties, variable+"."+quoteCypherIdentifier(property))
	}
	expression := properties[0]
	if len(properties) > 1 || spec.Type == "key" || spec.Type == "unique" {
		expression = "(" + strings.Join(properties, ", ") + ")"
	}
	var requirement string
	switch spec.Type {
	case "unique":
		requirement = expression + " IS UNIQUE"
	case "key":
		requirement = expression + " IS" + keyQualifier + " KEY"
	default:
		return "", publicError(CodeType, "unsupported Constraint type", nil)
	}
	return "CREATE CONSTRAINT " + quoteCypherIdentifier(spec.Name) +
		" FOR " + pattern + " REQUIRE " + requirement, nil
}

func dropConstraintCypher(name string) string {
	return "DROP CONSTRAINT " + quoteCypherIdentifier(name)
}

func collectPlannedIndexes(plan *plannedState) (map[string]logicalIndex, error) {
	result := map[string]logicalIndex{}
	for ref, object := range plan.Objects {
		if object.Value.Definition == nil {
			continue
		}
		declarations := objectIndexDeclarations(ref, object.Value)
		for name, declaration := range declarations {
			logical, err := plan.logicalIndexFromDeclaration(ref, declaration)
			if err != nil {
				return nil, err
			}
			logical.Hidden = indexHiddenOptions(*object.Value.Definition, name)
			if existing, exists := result[name]; exists {
				if !equalLogicalIndex(existing, logical, true) {
					return nil, publicError(CodeObjectConflict, "shared Index projections disagree", nil)
				}
				continue
			}
			result[name] = logical
		}
	}
	return result, nil
}

func validateConstraintIndexCoexistence(
	plan *plannedState,
	constraints map[string]constraintSpec,
	indexes map[string]logicalIndex,
) error {
	for name := range constraints {
		if _, exists := indexes[name]; exists {
			return errorWithDetails(
				CodeObjectConflict,
				"Constraint and Index cannot share the same Schema name",
				map[string]any{"name": name},
			)
		}
	}

	type schema struct {
		owner      OntologyRef
		properties string
	}
	backingRanges := map[schema]string{}
	for name, constraint := range constraints {
		if constraint.Type != "unique" && constraint.Type != "key" {
			continue
		}
		backingRanges[schema{
			owner:      constraint.Owner,
			properties: string(mustJSON(constraint.Properties)),
		}] = name
	}
	for ref, object := range plan.Objects {
		if object.Value.Definition == nil {
			continue
		}
		for _, property := range object.Value.Definition.Properties {
			if property.Unique {
				backingRanges[schema{
					owner:      ref,
					properties: string(mustJSON([]string{property.Name})),
				}] = "Graph Type unique"
			}
		}
	}
	for name, index := range indexes {
		if index.Type != "range" || len(index.Targets) != 1 {
			continue
		}
		key := schema{
			owner:      index.Targets[0],
			properties: string(mustJSON(index.Properties)),
		}
		if constraintName, exists := backingRanges[key]; exists {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Range Index duplicates a UNIQUE/KEY backing Range Index",
				map[string]any{
					"index":      name,
					"constraint": constraintName,
					"target":     key.owner.String(),
				},
			)
		}
	}
	return nil
}

func mustJSON(value any) []byte {
	body, _ := json.Marshal(value)
	return body
}

func createIndexCypher(
	index logicalIndex,
	analyzer string,
	semantic map[string]any,
) (string, map[string]any, error) {
	if len(index.Targets) == 0 || len(index.Properties) == 0 {
		return "", nil, publicError(CodeType, "Index target and properties are required", nil)
	}
	kind := index.Targets[0].Kind
	for _, target := range index.Targets {
		if target.Kind != kind {
			return "", nil, publicError(CodeType, "shared Index targets must have the same Definition kind", nil)
		}
	}
	if index.Type == "vector" {
		if len(index.Properties) != 1 {
			return "", nil, publicError(CodeType, "Semantic Index requires one source Property", nil)
		}
		procedure := "db.index.semantic.createNodeIndex"
		if kind == KindRelationshipDefinition {
			procedure = "db.index.semantic.createRelationshipIndex"
		}
		targets := make([]string, len(index.Targets))
		for i, target := range index.Targets {
			targets[i] = target.Name
		}
		options := semantic
		if index.Hidden != nil {
			preserved, err := semanticOptionsFromHidden(index.Hidden)
			if err != nil {
				return "", nil, err
			}
			options = preserved
		}
		return "CALL " + procedure + "($name, $targets, $property, $options)",
			map[string]any{
				"name":     index.Name,
				"targets":  targets,
				"property": index.Properties[0],
				"options":  options,
			}, nil
	}

	variable := "n"
	var pattern string
	if kind == KindNodeDefinition {
		labels := make([]string, len(index.Targets))
		for i, target := range index.Targets {
			labels[i] = quoteCypherIdentifier(target.Name)
		}
		pattern = "(" + variable + ":" + strings.Join(labels, "|") + ")"
	} else if kind == KindRelationshipDefinition {
		variable = "r"
		types := make([]string, len(index.Targets))
		for i, target := range index.Targets {
			types[i] = quoteCypherIdentifier(target.Name)
		}
		pattern = "()-[" + variable + ":" + strings.Join(types, "|") + "]-()"
	} else {
		return "", nil, publicError(CodeType, "Index target must be a Definition", nil)
	}
	properties := make([]string, len(index.Properties))
	for i, property := range index.Properties {
		properties[i] = variable + "." + quoteCypherIdentifier(property)
	}
	name := quoteCypherIdentifier(index.Name)
	switch index.Type {
	case "range", "text", "point":
		return "CREATE " + strings.ToUpper(index.Type) + " INDEX " + name +
			" FOR " + pattern + " ON (" + strings.Join(properties, ", ") + ")", nil, nil
	case "fulltext":
		effectiveAnalyzer := analyzer
		if index.Hidden != nil {
			preserved, err := fullTextAnalyzerFromHidden(index.Hidden)
			if err != nil {
				return "", nil, err
			}
			effectiveAnalyzer = preserved
		}
		return "CREATE FULLTEXT INDEX " + name + " FOR " + pattern +
			" ON EACH [" + strings.Join(properties, ", ") + "] OPTIONS {indexConfig:{" +
			quoteCypherIdentifier("fulltext.analyzer") + ": " + cypherString(effectiveAnalyzer) + ", " +
			quoteCypherIdentifier("fulltext.eventually_consistent") + ": false}}", nil, nil
	default:
		return "", nil, publicError(CodeType, "unsupported Index type", nil)
	}
}

func dropIndexCypher(name string) string {
	return "DROP INDEX " + quoteCypherIdentifier(name)
}

func fullTextAnalyzerFromHidden(hidden map[string]any) (string, error) {
	config, ok := hidden["indexConfig"].(map[string]any)
	if !ok {
		return "", publicError(CodeConsistency, "Full-text hidden configuration is invalid", nil)
	}
	analyzer, ok := config["fulltext.analyzer"].(string)
	if !ok || analyzer == "" {
		return "", publicError(CodeConsistency, "Full-text analyzer is invalid", nil)
	}
	return analyzer, nil
}

func semanticOptionsFromHidden(hidden map[string]any) (map[string]any, error) {
	config, ok := hidden["indexConfig"].(map[string]any)
	if !ok {
		return nil, publicError(CodeConsistency, "Semantic hidden configuration is invalid", nil)
	}
	result := cloneAnyMap(config)
	if result == nil {
		return nil, publicError(CodeConsistency, "Semantic hidden configuration is invalid", nil)
	}
	return result, nil
}
