package kernel

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

const reservedPrefix = "__kgos_"

type ObjectKind string

const (
	KindDomain                 ObjectKind = "domain"
	KindNodeDefinition         ObjectKind = "node-definition"
	KindRelationshipDefinition ObjectKind = "relationship-definition"
	KindKnowledgeNode          ObjectKind = "knowledge-node"
	KindKnowledgeRelationship  ObjectKind = "knowledge-relationship"
)

type ObjectValue struct {
	Kind                  ObjectKind
	Domain                *Domain
	Definition            *Definition
	KnowledgeNode         *KnowledgeNode
	KnowledgeRelationship *KnowledgeRelationship
}

type KnowledgeNode struct {
	Labels     []string                   `json:"labels" yaml:"labels"`
	Properties map[string]json.RawMessage `json:"properties" yaml:"-"`
}

type KnowledgeRelationship struct {
	Type       string                     `json:"type" yaml:"type"`
	Start      string                     `json:"start" yaml:"start"`
	End        string                     `json:"end" yaml:"end"`
	Properties map[string]json.RawMessage `json:"properties" yaml:"-"`
}

type Domain struct {
	Name        string   `json:"name" yaml:"name"`
	Title       *string  `json:"title,omitempty" yaml:"title,omitempty"`
	Description *string  `json:"description,omitempty" yaml:"description,omitempty"`
	Includes    []string `json:"includes" yaml:"includes"`
}

type Definition struct {
	Kind        ObjectKind   `json:"-" yaml:"-"`
	Name        string       `json:"name" yaml:"name"`
	Title       *string      `json:"title,omitempty" yaml:"title,omitempty"`
	Description *string      `json:"description,omitempty" yaml:"description,omitempty"`
	Labels      []string     `json:"labels,omitempty" yaml:"labels,omitempty"`
	From        *string      `json:"from,omitempty" yaml:"from,omitempty"`
	To          *string      `json:"to,omitempty" yaml:"to,omitempty"`
	Properties  []Property   `json:"properties" yaml:"properties"`
	Constraints []Constraint `json:"constraints" yaml:"constraints"`
	Indexes     []Index      `json:"indexes,omitempty" yaml:"indexes,omitempty"`
}

type Property struct {
	Name        string       `json:"name" yaml:"name"`
	Title       *string      `json:"title,omitempty" yaml:"title,omitempty"`
	Description *string      `json:"description,omitempty" yaml:"description,omitempty"`
	Type        string       `json:"type" yaml:"type"`
	Required    bool         `json:"required,omitempty" yaml:"required,omitempty"`
	Unique      bool         `json:"unique,omitempty" yaml:"unique,omitempty"`
	Constraints []Constraint `json:"constraints,omitempty" yaml:"constraints,omitempty"`
	Indexes     []Index      `json:"indexes,omitempty" yaml:"indexes,omitempty"`
	RenameFrom  string       `json:"-" yaml:"renameFrom,omitempty"`
}

type Constraint struct {
	Name       string   `json:"name,omitempty" yaml:"name,omitempty"`
	Type       string   `json:"type" yaml:"type"`
	Properties []string `json:"properties,omitempty" yaml:"properties,omitempty"`
	// LegacyValueType is accepted only so the parser can classify the removed
	// v1 type-Constraint shape as UNSUPPORTED_OPERATION instead of an unknown
	// YAML field. It is never part of a rendered Object Value.
	LegacyValueType string `json:"-" yaml:"valueType,omitempty"`
}

type Index struct {
	Name       string   `json:"name" yaml:"name"`
	Type       string   `json:"type" yaml:"type"`
	Targets    []string `json:"targets,omitempty" yaml:"targets,omitempty"`
	Properties []string `json:"properties,omitempty" yaml:"properties,omitempty"`

	hiddenOptions map[string]any
}

type Summary struct {
	Kind        ObjectKind `json:"kind"`
	Ref         string     `json:"ref"`
	Name        string     `json:"name"`
	Title       *string    `json:"title,omitempty"`
	Description *string    `json:"description,omitempty"`
	From        *string    `json:"from,omitempty"`
	To          *string    `json:"to,omitempty"`
}

type OntologyReadRequest struct {
	At     string   `json:"at"`
	Refs   []string `json:"refs,omitempty"`
	Limit  int      `json:"limit,omitempty"`
	Cursor string   `json:"cursor,omitempty"`
}

type OntologyReadItem struct {
	Ref         string    `json:"ref,omitempty"`
	Kind        string    `json:"kind"`
	Title       *string   `json:"title,omitempty"`
	Description *string   `json:"description,omitempty"`
	Items       []Summary `json:"items"`
	Total       int       `json:"total"`
	Cursor      string    `json:"cursor,omitempty"`
	Markdown    string    `json:"markdown"`
}

type OntologyReadResult struct {
	State   string             `json:"state"`
	Results []OntologyReadItem `json:"results"`
}

type ObjectReadRequest struct {
	At   string   `json:"at"`
	Refs []string `json:"refs"`
}

type ObjectReadItem struct {
	Kind  ObjectKind      `json:"kind"`
	Ref   string          `json:"ref"`
	Value json.RawMessage `json:"value"`
}

type ObjectReadResult struct {
	State   string           `json:"state"`
	Results []ObjectReadItem `json:"results"`
}

type ObjectTextReadItem struct {
	Kind ObjectKind `json:"kind"`
	Ref  string     `json:"ref"`
	Body string     `json:"body"`
}

type ObjectTextReadResult struct {
	State   string               `json:"state"`
	Results []ObjectTextReadItem `json:"results"`
}

type ObjectBody struct {
	State string
	Ref   string
	Kind  ObjectKind
	Value ObjectValue
	YAML  []byte
	JSON  []byte
}

type PatchRequest struct {
	BaseState string  `json:"baseState"`
	Branch    string  `json:"branch"`
	Patch     string  `json:"patch"`
	Author    *string `json:"author,omitempty"`
	Message   *string `json:"message,omitempty"`
}

type CreatedObject struct {
	Alias string     `json:"alias"`
	Kind  ObjectKind `json:"kind"`
	Ref   string     `json:"ref"`
}

type RefTransition struct {
	From string `json:"from"`
	To   string `json:"to"`
}

type PatchResult struct {
	State       string          `json:"state"`
	Created     []CreatedObject `json:"created"`
	Transitions []RefTransition `json:"transitions"`
}

func normalizeObject(value ObjectValue) error {
	switch value.Kind {
	case KindDomain:
		if value.Domain == nil || value.Definition != nil || value.KnowledgeNode != nil ||
			value.KnowledgeRelationship != nil {
			return publicError(CodeType, "domain object has invalid shape", nil)
		}
		return normalizeDomain(value.Domain)
	case KindNodeDefinition, KindRelationshipDefinition:
		if value.Definition == nil || value.Domain != nil || value.KnowledgeNode != nil ||
			value.KnowledgeRelationship != nil {
			return publicError(CodeType, "definition object has invalid shape", nil)
		}
		value.Definition.Kind = value.Kind
		return normalizeDefinition(value.Definition)
	case KindKnowledgeNode:
		if value.KnowledgeNode == nil || value.Domain != nil || value.Definition != nil ||
			value.KnowledgeRelationship != nil {
			return publicError(CodeType, "Knowledge Node object has invalid shape", nil)
		}
		return normalizeKnowledgeNode(value.KnowledgeNode)
	case KindKnowledgeRelationship:
		if value.KnowledgeRelationship == nil || value.Domain != nil || value.Definition != nil ||
			value.KnowledgeNode != nil {
			return publicError(CodeType, "Knowledge Relationship object has invalid shape", nil)
		}
		return normalizeKnowledgeRelationship(value.KnowledgeRelationship)
	default:
		return publicError(CodeInvalidArgument, "unsupported Object kind", nil)
	}
}

func normalizeKnowledgeNode(node *KnowledgeNode) error {
	if node.Properties == nil {
		node.Properties = map[string]json.RawMessage{}
	}
	if err := normalizeSet(&node.Labels, "labels"); err != nil {
		return err
	}
	for _, label := range node.Labels {
		if err := validateKnowledgeIdentifier(label, "Knowledge Node label"); err != nil {
			return err
		}
	}
	return validateKnowledgeProperties(node.Properties)
}

func normalizeKnowledgeRelationship(relationship *KnowledgeRelationship) error {
	if relationship.Properties == nil {
		relationship.Properties = map[string]json.RawMessage{}
	}
	if err := validateKnowledgeIdentifier(relationship.Type, "Knowledge Relationship type"); err != nil {
		return err
	}
	for _, endpoint := range []struct {
		name string
		ref  string
	}{{"start", relationship.Start}, {"end", relationship.End}} {
		ref, err := ParseObjectRef(endpoint.ref)
		if err != nil || ref.Kind != KindKnowledgeNode {
			return publicError(CodeType, "Knowledge Relationship "+endpoint.name+" must reference a Knowledge Node", err)
		}
	}
	return validateKnowledgeProperties(relationship.Properties)
}

func validateKnowledgeIdentifier(value, field string) error {
	if value == "" {
		return publicError(CodeType, field+" must not be empty", nil)
	}
	if strings.HasPrefix(value, reservedPrefix) {
		return publicError(CodeReservedIdentifier, field+" uses the reserved KG OS namespace", nil)
	}
	if strings.IndexByte(value, 0) >= 0 {
		return publicError(CodeType, field+" must not contain NUL", nil)
	}
	return nil
}

func validateKnowledgeProperties(properties map[string]json.RawMessage) error {
	for name, raw := range properties {
		if err := validateKnowledgeIdentifier(name, "Knowledge Property name"); err != nil {
			return err
		}
		canonical, _, err := normalizeKnowledgePropertyRaw(raw)
		if err != nil {
			return err
		}
		properties[name] = canonical
	}
	return nil
}

func normalizeDomain(domain *Domain) error {
	if err := validatePublicName(domain.Name, "domain name"); err != nil {
		return err
	}
	if err := normalizeSet(&domain.Includes, "includes"); err != nil {
		return err
	}
	for _, ref := range domain.Includes {
		if strings.HasPrefix(ref, "new:") {
			continue
		}
		if _, err := ParseOntologyRef(ref); err != nil {
			return err
		}
	}
	return nil
}

func normalizeDefinition(definition *Definition) error {
	if definition.Kind != KindNodeDefinition && definition.Kind != KindRelationshipDefinition {
		return publicError(CodeType, "invalid Definition kind", nil)
	}
	if err := validatePublicName(definition.Name, "definition name"); err != nil {
		return err
	}
	if len(definition.Properties) == 0 {
		return publicError(CodeInvalidArgument, "Definition must contain at least one property", nil)
	}
	if definition.Kind == KindNodeDefinition {
		if definition.From != nil || definition.To != nil {
			return publicError(CodeType, "Node Definition cannot contain from/to", nil)
		}
		if err := normalizeSet(&definition.Labels, "labels"); err != nil {
			return err
		}
		for _, label := range definition.Labels {
			if err := validatePublicName(label, "label"); err != nil {
				return err
			}
			if label == definition.Name {
				return publicError(CodeType, "labels must not repeat the identifying label", nil)
			}
		}
	} else {
		if len(definition.Labels) != 0 {
			return publicError(CodeType, "Relationship Definition cannot contain labels", nil)
		}
		for _, endpoint := range []*string{definition.From, definition.To} {
			if endpoint == nil {
				continue
			}
			if strings.HasPrefix(*endpoint, "new:") {
				continue
			}
			ref, err := ParseOntologyRef(*endpoint)
			if err != nil || ref.Kind != KindNodeDefinition {
				return publicError(CodeType, "Relationship from/to must reference a Node Definition or null", err)
			}
		}
	}

	propertyNames := make(map[string]struct{}, len(definition.Properties))
	propertyTypes := make(map[string]string, len(definition.Properties))
	for index := range definition.Properties {
		property := &definition.Properties[index]
		if err := validatePublicName(property.Name, "property name"); err != nil {
			return err
		}
		if _, exists := propertyNames[property.Name]; exists {
			return publicError(CodeType, "duplicate property name", nil)
		}
		propertyNames[property.Name] = struct{}{}
		property.Type = strings.TrimSpace(property.Type)
		if property.Type == "" {
			return publicError(CodeType, "property type must be non-empty", nil)
		}
		if err := normalizePropertyNullability(property); err != nil {
			return err
		}
		if strings.Contains(strings.ToUpper(property.Type), "VECTOR") {
			return publicError(CodeUnsupportedOperation, "caller-owned Vector Property is not supported by Ontology", nil)
		}
		propertyTypes[property.Name] = strings.ToUpper(property.Type)
		if property.RenameFrom != "" {
			if err := validatePublicName(property.RenameFrom, "renameFrom"); err != nil {
				return err
			}
		}
	}
	for index := range definition.Properties {
		property := &definition.Properties[index]
		if err := normalizeConstraints(property.Constraints, propertyNames, property.Name); err != nil {
			return err
		}
		if err := normalizeIndexes(property.Indexes, propertyNames, propertyTypes, property.Name); err != nil {
			return err
		}
	}
	if err := normalizeConstraints(definition.Constraints, propertyNames, ""); err != nil {
		return err
	}
	if err := normalizeIndexes(definition.Indexes, propertyNames, propertyTypes, ""); err != nil {
		return err
	}
	canonicalizeDefinitionMembers(definition)
	for index := range definition.Properties {
		property := &definition.Properties[index]
		if err := rejectBooleanConstraintDuplicates(*property); err != nil {
			return err
		}
		sort.SliceStable(property.Constraints, func(i, j int) bool {
			return constraintSortKey(property.Constraints[i]) < constraintSortKey(property.Constraints[j])
		})
		sort.SliceStable(property.Indexes, func(i, j int) bool {
			return property.Indexes[i].Name < property.Indexes[j].Name
		})
	}
	if err := validateResourceNames(definition); err != nil {
		return err
	}
	if err := validateConstraintDuplicates(definition); err != nil {
		return err
	}
	sort.SliceStable(definition.Properties, func(i, j int) bool {
		return definition.Properties[i].Name < definition.Properties[j].Name
	})
	sort.SliceStable(definition.Constraints, func(i, j int) bool {
		return constraintSortKey(definition.Constraints[i]) < constraintSortKey(definition.Constraints[j])
	})
	sort.SliceStable(definition.Indexes, func(i, j int) bool {
		return definition.Indexes[i].Name < definition.Indexes[j].Name
	})
	return nil
}

func normalizePropertyNullability(property *Property) error {
	members, err := splitTopLevelTypeUnion(property.Type)
	if err != nil {
		return publicError(CodeType, "invalid property type expression", err)
	}
	anyOuterNotNull := false
	allOuterNotNull := true
	for index, member := range members {
		stripped, nonNull := trimTopLevelNotNull(member)
		anyOuterNotNull = anyOuterNotNull || nonNull
		allOuterNotNull = allOuterNotNull && nonNull
		if nonNull {
			members[index] = stripped
		}
	}
	if anyOuterNotNull && !allOuterNotNull {
		return publicError(
			CodeType,
			"top-level union nullability must be expressed uniformly through required",
			nil,
		)
	}
	if allOuterNotNull {
		property.Required = true
		property.Type = strings.Join(members, " | ")
	}
	return nil
}

func canonicalizeDefinitionMembers(definition *Definition) {
	remainingConstraints := make([]Constraint, 0, len(definition.Constraints))
	for _, constraint := range definition.Constraints {
		if len(constraint.Properties) == 1 {
			if property := findProperty(definition.Properties, constraint.Properties[0]); property != nil {
				constraint.Properties = nil
				property.Constraints = append(property.Constraints, constraint)
				continue
			}
		}
		remainingConstraints = append(remainingConstraints, constraint)
	}
	definition.Constraints = remainingConstraints

	remainingIndexes := make([]Index, 0, len(definition.Indexes))
	for _, index := range definition.Indexes {
		if len(index.Targets) == 0 && len(index.Properties) == 1 {
			if property := findProperty(definition.Properties, index.Properties[0]); property != nil {
				index.Properties = nil
				property.Indexes = append(property.Indexes, index)
				continue
			}
		}
		remainingIndexes = append(remainingIndexes, index)
	}
	definition.Indexes = remainingIndexes
}

func normalizeConstraints(constraints []Constraint, properties map[string]struct{}, localProperty string) error {
	for _, constraint := range constraints {
		switch constraint.Type {
		case "unique", "key":
		case "not_null", "type":
			return publicError(
				CodeUnsupportedOperation,
				"Ontology constraints support unique/key; use Property required/type for existence and type rules",
				nil,
			)
		default:
			return publicError(CodeType, "unsupported constraint type", nil)
		}
		if constraint.Name != "" {
			if err := validatePublicName(constraint.Name, "constraint name"); err != nil {
				return err
			}
		}
		if localProperty != "" && len(constraint.Properties) != 0 {
			return publicError(CodeType, "property-local constraint must not repeat properties", nil)
		}
		effectiveProperties := constraint.Properties
		if localProperty != "" {
			effectiveProperties = []string{localProperty}
		}
		for _, property := range effectiveProperties {
			if _, exists := properties[property]; !exists {
				return publicError(CodeType, fmt.Sprintf("constraint references unknown property %q", property), nil)
			}
		}
		if len(effectiveProperties) == 0 {
			return publicError(CodeType, "constraint requires properties", nil)
		}
		if constraint.LegacyValueType != "" {
			return publicError(CodeType, "valueType is not valid for the v1 Constraint profile", nil)
		}
	}
	return nil
}

func normalizeIndexes(
	indexes []Index,
	properties map[string]struct{},
	propertyTypes map[string]string,
	localProperty string,
) error {
	for indexPosition := range indexes {
		index := &indexes[indexPosition]
		if err := validatePublicName(index.Name, "index name"); err != nil {
			return err
		}
		switch index.Type {
		case "range", "text", "point", "fulltext", "vector":
		default:
			return publicError(CodeType, "unsupported index type", nil)
		}
		if err := normalizeSet(&index.Targets, "targets"); err != nil {
			return err
		}
		for _, target := range index.Targets {
			if strings.HasPrefix(target, "new:") {
				continue
			}
			if _, err := ParseOntologyRef(target); err != nil {
				return err
			}
		}
		if localProperty != "" {
			if len(index.Properties) != 0 {
				return publicError(CodeType, "property-local index must not repeat properties", nil)
			}
			if len(index.Targets) != 0 {
				return publicError(
					CodeType,
					"shared Index targets must be declared at Definition level",
					nil,
				)
			}
		}
		effectiveProperties := index.Properties
		if localProperty != "" {
			effectiveProperties = []string{localProperty}
		}
		if len(effectiveProperties) == 0 {
			return publicError(CodeType, "index requires properties", nil)
		}
		for _, property := range effectiveProperties {
			if _, exists := properties[property]; !exists {
				return publicError(CodeType, fmt.Sprintf("index references unknown property %q", property), nil)
			}
		}
		if (index.Type == "text" || index.Type == "point" || index.Type == "vector") && len(effectiveProperties) != 1 {
			return publicError(CodeType, index.Type+" index requires exactly one property", nil)
		}
		if index.Type == "vector" && propertyTypes[effectiveProperties[0]] != "STRING" {
			return publicError(CodeType, "Managed Semantic index source must be STRING", nil)
		}
		if index.Type == "fulltext" {
			for _, property := range effectiveProperties {
				if propertyTypes[property] != "STRING" {
					return publicError(CodeType, "fulltext index properties must be STRING", nil)
				}
			}
		}
		if index.Type == "range" || index.Type == "text" || index.Type == "point" {
			if len(index.Targets) != 0 {
				return publicError(CodeType, "standard index cannot target multiple Definitions", nil)
			}
		}
	}
	return nil
}

func rejectBooleanConstraintDuplicates(property Property) error {
	for _, constraint := range property.Constraints {
		if property.Unique && constraint.Type == "unique" {
			return publicError(CodeType, "unique duplicates a unique constraint", nil)
		}
	}
	return nil
}

func constraintSortKey(constraint Constraint) string {
	if constraint.Name != "" {
		return "0\x00" + constraint.Name
	}
	return "1\x00" + constraint.Type + "\x00" + strings.Join(constraint.Properties, "\x00")
}

func validateConstraintDuplicates(definition *Definition) error {
	seen := map[string]struct{}{}
	add := func(constraint Constraint, localProperty string) error {
		properties := constraint.Properties
		if localProperty != "" {
			properties = []string{localProperty}
		}
		key := constraint.Type + "\x00" + strings.Join(properties, "\x00")
		if _, exists := seen[key]; exists {
			return publicError(CodeType, "duplicate constraint rule for the same property coverage", nil)
		}
		seen[key] = struct{}{}
		return nil
	}
	for _, constraint := range definition.Constraints {
		if err := add(constraint, ""); err != nil {
			return err
		}
	}
	for _, property := range definition.Properties {
		for _, constraint := range property.Constraints {
			if err := add(constraint, property.Name); err != nil {
				return err
			}
		}
	}
	return nil
}

func validateResourceNames(definition *Definition) error {
	constraintNames := map[string]struct{}{}
	indexNames := map[string]struct{}{}
	addConstraint := func(constraint Constraint) error {
		if constraint.Name == "" {
			return nil
		}
		if _, exists := constraintNames[constraint.Name]; exists {
			return publicError(CodeType, "duplicate constraint name", nil)
		}
		constraintNames[constraint.Name] = struct{}{}
		return nil
	}
	addIndex := func(index Index) error {
		if _, exists := indexNames[index.Name]; exists {
			return publicError(CodeType, "duplicate index name", nil)
		}
		indexNames[index.Name] = struct{}{}
		return nil
	}
	for _, constraint := range definition.Constraints {
		if err := addConstraint(constraint); err != nil {
			return err
		}
	}
	for _, index := range definition.Indexes {
		if err := addIndex(index); err != nil {
			return err
		}
	}
	for _, property := range definition.Properties {
		for _, constraint := range property.Constraints {
			if err := addConstraint(constraint); err != nil {
				return err
			}
		}
		for _, index := range property.Indexes {
			if err := addIndex(index); err != nil {
				return err
			}
		}
	}
	return nil
}

func normalizeSet(values *[]string, field string) error {
	seen := make(map[string]struct{}, len(*values))
	for _, value := range *values {
		if _, exists := seen[value]; exists {
			return publicError(CodeType, "duplicate "+field+" member", nil)
		}
		seen[value] = struct{}{}
	}
	sort.Strings(*values)
	return nil
}

func validatePublicName(name, field string) error {
	if name == "" || len([]byte(name)) > 255 {
		return publicError(CodeType, field+" must be 1..255 UTF-8 bytes", nil)
	}
	for _, r := range name {
		if r == 0 || r < 0x20 || r == 0x7f {
			return publicError(CodeType, field+" contains an ASCII control character", nil)
		}
	}
	if strings.HasPrefix(name, reservedPrefix) {
		return publicError(CodeReservedIdentifier, field+" uses the reserved __kgos_ prefix", nil)
	}
	return nil
}
