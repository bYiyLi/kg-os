package kernel

import (
	"context"
	"encoding/json"
	"net/url"
	"path/filepath"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) decodeSchemaResources(ctx context.Context, state *snapshot) error {
	return decodeSchemaResourcesWithQuery(state, func(cypher string) (lithograph.Result, error) {
		result, err := service.database.Query(ctx, lithograph.QueryRequest{
			At:     state.State,
			Cypher: cypher,
		})
		if err != nil {
			return lithograph.Result{}, AsPublicError(err)
		}
		return result.Result, nil
	})
}

func decodeSchemaResourcesWithQuery(
	state *snapshot,
	query func(string) (lithograph.Result, error),
) error {
	constraints, err := query(
		"SHOW CONSTRAINTS YIELD name, type, entityType, labelsOrTypes, properties, " +
			"enforcedLabel, classification, ownedIndex, propertyType, options, createStatement RETURN *",
	)
	if err != nil {
		return err
	}
	constraintRows, err := rowsByName(constraints)
	if err != nil {
		return err
	}
	for _, row := range constraintRows {
		if err := decodeConstraintRow(state, row); err != nil {
			return err
		}
	}

	indexes, err := query(
		"SHOW ALL INDEXES YIELD name, type, entityType, labelsOrTypes, properties, " +
			"owningConstraint, options, createStatement RETURN *",
	)
	if err != nil {
		return err
	}
	indexRows, err := rowsByName(indexes)
	if err != nil {
		return err
	}
	for _, row := range indexRows {
		if err := decodeIndexRow(state, row); err != nil {
			return err
		}
	}

	for _, record := range state.Definitions {
		sort.SliceStable(record.Value.Constraints, func(i, j int) bool {
			return record.Value.Constraints[i].Name < record.Value.Constraints[j].Name
		})
		sort.SliceStable(record.Value.Indexes, func(i, j int) bool {
			return record.Value.Indexes[i].Name < record.Value.Indexes[j].Name
		})
		for index := range record.Value.Properties {
			property := &record.Value.Properties[index]
			sort.SliceStable(property.Constraints, func(i, j int) bool {
				return property.Constraints[i].Name < property.Constraints[j].Name
			})
			sort.SliceStable(property.Indexes, func(i, j int) bool {
				return property.Indexes[i].Name < property.Indexes[j].Name
			})
		}
	}
	return nil
}

func decodeConstraintRow(state *snapshot, row resultRow) error {
	name, typeName, entityType, targetNames, properties, err := decodeSchemaResourceTarget(row)
	if err != nil {
		return err
	}
	classification, err := rawString(row, "classification")
	if err != nil {
		return err
	}
	if len(targetNames) != 1 {
		return publicError(CodeConsistency, "Constraint has unsupported target coverage", nil)
	}
	if strings.HasPrefix(targetNames[0], reservedPrefix) {
		if classification != "dependent" {
			return publicError(CodeConsistency, "unexpected standalone Constraint targets KG OS reserved Schema", nil)
		}
		return nil
	}

	kind, err := schemaEntityKind(entityType)
	if err != nil {
		return err
	}
	ref := OntologyRef{Kind: kind, Name: targetNames[0]}
	record := state.Definitions[ref]
	if record == nil {
		return errorWithDetails(CodeConsistency, "Constraint target has no Definition Binding", map[string]any{
			"name":   name,
			"target": ref.String(),
		})
	}
	if classification == "dependent" {
		return decodeDependentConstraint(record, typeName, properties, row)
	}

	constraint := Constraint{Name: name, Properties: append([]string(nil), properties...)}
	switch typeName {
	case "NODE_PROPERTY_UNIQUENESS", "RELATIONSHIP_PROPERTY_UNIQUENESS":
		generated, generatedErr := lithographGraphConstraintName(ref, properties, "unique")
		if generatedErr != nil {
			return generatedErr
		}
		if name == generated {
			if len(properties) != 1 {
				return publicError(CodeConsistency, "Graph Type composite UNIQUE is outside the KG OS source profile", nil)
			}
			property := findProperty(record.Value.Properties, properties[0])
			if property == nil {
				return publicError(CodeConsistency, "Graph Type UNIQUE references an unknown property", nil)
			}
			property.Unique = true
			return nil
		}
		constraint.Type = "unique"
	case "NODE_KEY", "RELATIONSHIP_KEY":
		generated, generatedErr := lithographGraphConstraintName(ref, properties, "key")
		if generatedErr != nil {
			return generatedErr
		}
		if name == generated {
			return publicError(CodeConsistency, "Graph Type KEY is outside the KG OS source profile", nil)
		}
		constraint.Type = "key"
	case "NODE_PROPERTY_EXISTENCE", "RELATIONSHIP_PROPERTY_EXISTENCE":
		return publicError(
			CodeConsistency,
			"standalone property existence Constraint is outside the KG OS Ontology profile",
			nil,
		)
	case "NODE_PROPERTY_TYPE", "RELATIONSHIP_PROPERTY_TYPE":
		return publicError(
			CodeConsistency,
			"standalone property type Constraint is outside the KG OS Ontology profile",
			nil,
		)
	case "NODE_LABEL_EXISTENCE", "RELATIONSHIP_SOURCE_LABEL", "RELATIONSHIP_TARGET_LABEL":
		return publicError(CodeConsistency, "standalone structural Constraint is outside the KG OS Ontology profile", nil)
	default:
		return publicError(CodeConsistency, "unsupported Constraint kind "+typeName, nil)
	}
	if len(properties) == 0 {
		return publicError(CodeConsistency, "Constraint is missing target properties", nil)
	}
	if len(properties) == 1 {
		property := findProperty(record.Value.Properties, properties[0])
		if property == nil {
			return publicError(CodeConsistency, "Constraint references an unknown property", nil)
		}
		constraint.Properties = nil
		property.Constraints = append(property.Constraints, constraint)
		return nil
	}
	for _, propertyName := range properties {
		if findProperty(record.Value.Properties, propertyName) == nil {
			return publicError(CodeConsistency, "Constraint references an unknown property", nil)
		}
	}
	record.Value.Constraints = append(record.Value.Constraints, constraint)
	return nil
}

func decodeDependentConstraint(
	record *definitionRecord,
	typeName string,
	properties []string,
	row resultRow,
) error {
	switch typeName {
	case "RELATIONSHIP_SOURCE_LABEL", "RELATIONSHIP_TARGET_LABEL":
		return nil
	}
	if len(properties) != 1 {
		return publicError(CodeConsistency, "dependent Property Constraint has unsupported coverage", nil)
	}
	property := findProperty(record.Value.Properties, properties[0])
	if property == nil {
		return publicError(CodeConsistency, "dependent Property Constraint references an unknown property", nil)
	}
	switch typeName {
	case "NODE_PROPERTY_EXISTENCE", "RELATIONSHIP_PROPERTY_EXISTENCE":
		if !property.Required {
			return publicError(CodeConsistency, "dependent NOT NULL rule disagrees with Graph Type property rule", nil)
		}
		return nil
	case "NODE_PROPERTY_TYPE", "RELATIONSHIP_PROPERTY_TYPE":
		propertyType, err := rawString(row, "propertyType")
		if err != nil {
			return err
		}
		if propertyType != property.Type {
			return errorWithDetails(
				CodeConsistency,
				"dependent Property type disagrees with Graph Type property rule",
				map[string]any{
					"property":   property.Name,
					"graphType":  property.Type,
					"constraint": propertyType,
				},
			)
		}
		return nil
	default:
		return publicError(CodeConsistency, "unexpected dependent Constraint kind "+typeName, nil)
	}
}

func decodeIndexRow(state *snapshot, row resultRow) error {
	if !isNull(row, "owningConstraint") {
		return nil
	}
	name, typeName, entityType, targetNames, properties, err := decodeSchemaResourceTarget(row)
	if err != nil {
		return err
	}
	for _, target := range targetNames {
		if strings.HasPrefix(target, reservedPrefix) {
			return publicError(CodeConsistency, "unexpected Index targets KG OS reserved Schema", nil)
		}
	}
	if len(targetNames) == 0 {
		return publicError(CodeConsistency, "Index has unsupported target coverage", nil)
	}
	kind, err := schemaEntityKind(entityType)
	if err != nil {
		return err
	}
	refs := make([]OntologyRef, 0, len(targetNames))
	for _, target := range targetNames {
		ref := OntologyRef{Kind: kind, Name: target}
		if state.Definitions[ref] == nil {
			return errorWithDetails(CodeConsistency, "Index target has no Definition Binding", map[string]any{
				"name":   name,
				"target": ref.String(),
			})
		}
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].String() < refs[j].String() })

	publicType := ""
	switch typeName {
	case "RANGE":
		publicType = "range"
	case "TEXT":
		publicType = "text"
	case "POINT":
		publicType = "point"
	case "FULLTEXT":
		publicType = "fulltext"
	case "SEMANTIC":
		publicType = "vector"
	case "LOOKUP", "VECTOR":
		return publicError(CodeConsistency, typeName+" Index is outside the KG OS Ontology profile", nil)
	default:
		return publicError(CodeConsistency, "unsupported Index kind "+typeName, nil)
	}
	if len(properties) == 0 {
		return publicError(CodeConsistency, "Index is missing properties", nil)
	}
	if (publicType == "text" || publicType == "point" || publicType == "vector") && len(properties) != 1 {
		return publicError(CodeConsistency, "stored Index has unsupported property cardinality", nil)
	}
	if (publicType == "range" || publicType == "text" || publicType == "point") && len(refs) != 1 {
		return publicError(CodeConsistency, "standard Index spans multiple Definitions", nil)
	}

	hidden, err := decodeIndexOptions(row, publicType)
	if err != nil {
		return err
	}
	targetStrings := make([]string, 0, len(refs))
	if len(refs) > 1 {
		for _, ref := range refs {
			targetStrings = append(targetStrings, ref.String())
		}
	}
	for _, ref := range refs {
		record := state.Definitions[ref]
		for _, propertyName := range properties {
			property := findProperty(record.Value.Properties, propertyName)
			if property == nil {
				return publicError(CodeConsistency, "Index references an unknown property", nil)
			}
			if (publicType == "fulltext" || publicType == "vector") && strings.ToUpper(property.Type) != "STRING" {
				return publicError(CodeConsistency, "search Index source is not STRING", nil)
			}
		}
		index := Index{
			Name:          name,
			Type:          publicType,
			Targets:       append([]string(nil), targetStrings...),
			Properties:    append([]string(nil), properties...),
			hiddenOptions: cloneAnyMap(hidden),
		}
		if len(refs) == 1 && len(properties) == 1 {
			property := findProperty(record.Value.Properties, properties[0])
			index.Properties = nil
			property.Indexes = append(property.Indexes, index)
		} else {
			record.Value.Indexes = append(record.Value.Indexes, index)
		}
	}
	return nil
}

func decodeSchemaResourceTarget(
	row resultRow,
) (string, string, string, []string, []string, error) {
	name, err := rawString(row, "name")
	if err != nil {
		return "", "", "", nil, nil, err
	}
	typeName, err := rawString(row, "type")
	if err != nil {
		return "", "", "", nil, nil, err
	}
	entityType, err := rawString(row, "entityType")
	if err != nil {
		return "", "", "", nil, nil, err
	}
	targetNames, err := rawStringList(row, "labelsOrTypes")
	if err != nil {
		return "", "", "", nil, nil, err
	}
	properties, err := rawStringList(row, "properties")
	if err != nil {
		return "", "", "", nil, nil, err
	}
	return name, typeName, entityType, targetNames, properties, nil
}

func schemaEntityKind(entityType string) (ObjectKind, error) {
	switch entityType {
	case "NODE":
		return KindNodeDefinition, nil
	case "RELATIONSHIP":
		return KindRelationshipDefinition, nil
	default:
		return "", publicError(CodeConsistency, "unsupported Schema entity type "+entityType, nil)
	}
}

func decodeIndexOptions(row resultRow, publicType string) (map[string]any, error) {
	raw := row["options"]
	if len(raw) == 0 || string(raw) == "null" {
		raw = json.RawMessage("{}")
	}
	var options map[string]any
	if err := json.Unmarshal(raw, &options); err != nil {
		return nil, publicError(CodeInternal, "decode Index options", err)
	}
	if publicType == "range" || publicType == "text" || publicType == "point" {
		if len(options) != 0 {
			return nil, publicError(CodeConsistency, "standard Index has unsupported options", nil)
		}
		return options, nil
	}
	configRaw, ok := options["indexConfig"]
	if !ok || len(options) != 1 {
		return nil, publicError(CodeConsistency, "search Index has unsupported options", nil)
	}
	config, ok := configRaw.(map[string]any)
	if !ok {
		return nil, publicError(CodeConsistency, "search Index has invalid indexConfig", nil)
	}
	if publicType == "fulltext" {
		if len(config) != 2 {
			return nil, publicError(CodeConsistency, "Full-text Index has unsupported hidden configuration", nil)
		}
		analyzer, analyzerOK := config["fulltext.analyzer"].(string)
		eventually, eventuallyOK := config["fulltext.eventually_consistent"].(bool)
		if !analyzerOK || analyzer == "" || !eventuallyOK || eventually {
			return nil, publicError(CodeConsistency, "Full-text Index has unsupported hidden configuration", nil)
		}
		return options, nil
	}
	if err := validateSemanticIndexConfig(config); err != nil {
		return nil, err
	}
	return options, nil
}

func validateSemanticIndexConfig(config map[string]any) error {
	allowed := map[string]bool{
		"provider": true, "providerConfig": true, "dimensions": true, "similarity": true,
	}
	for key := range config {
		if !allowed[key] {
			return publicError(CodeConsistency, "Semantic Index has unsupported hidden configuration", nil)
		}
	}
	provider, ok := config["provider"].(string)
	if !ok || provider != "openai-compatible" {
		return publicError(CodeConsistency, "Semantic Index uses an unsupported Provider", nil)
	}
	providerConfig, ok := config["providerConfig"].(map[string]any)
	if !ok {
		return publicError(CodeConsistency, "Semantic Index has invalid providerConfig", nil)
	}
	providerAllowed := map[string]bool{
		"base_url": true, "model": true, "api_key_env": true, "send_dimensions": true,
		"encoding_format": true, "cache": true,
	}
	for key := range providerConfig {
		if !providerAllowed[key] {
			return publicError(CodeConsistency, "Semantic Index has unsupported providerConfig", nil)
		}
	}
	baseURL, ok := providerConfig["base_url"].(string)
	if !ok {
		return publicError(CodeConsistency, "Semantic Index providerConfig.base_url is invalid", nil)
	}
	parsedURL, err := url.Parse(baseURL)
	if err != nil ||
		!parsedURL.IsAbs() ||
		parsedURL.Host == "" ||
		(parsedURL.Scheme != "http" && parsedURL.Scheme != "https") ||
		parsedURL.RawQuery != "" ||
		parsedURL.Fragment != "" {
		return publicError(CodeConsistency, "Semantic Index providerConfig.base_url is invalid", nil)
	}
	model, ok := providerConfig["model"].(string)
	if !ok || strings.TrimSpace(model) == "" || strings.ContainsRune(model, 0) {
		return publicError(CodeConsistency, "Semantic Index providerConfig.model is invalid", nil)
	}
	if send, ok := providerConfig["send_dimensions"].(bool); !ok || send {
		return publicError(CodeConsistency, "Semantic Index providerConfig.send_dimensions is unsupported", nil)
	}
	if encoding, ok := providerConfig["encoding_format"].(string); !ok || encoding != "float" {
		return publicError(CodeConsistency, "Semantic Index providerConfig.encoding_format is unsupported", nil)
	}
	if apiEnv, exists := providerConfig["api_key_env"]; exists {
		if value, ok := apiEnv.(string); !ok || value == "" {
			return publicError(CodeConsistency, "Semantic Index providerConfig.api_key_env is invalid", nil)
		}
	}
	cache, ok := providerConfig["cache"].(map[string]any)
	if !ok {
		return publicError(CodeConsistency, "Semantic Index providerConfig.cache is invalid", nil)
	}
	cacheAllowed := map[string]bool{"enabled": true, "path": true, "max_bytes": true}
	for key := range cache {
		if !cacheAllowed[key] {
			return publicError(CodeConsistency, "Semantic Index cache configuration is unsupported", nil)
		}
	}
	if _, ok := cache["enabled"].(bool); !ok {
		return publicError(CodeConsistency, "Semantic Index cache.enabled is invalid", nil)
	}
	path, ok := cache["path"].(string)
	if !ok || path == "" || !filepath.IsAbs(path) {
		return publicError(CodeConsistency, "Semantic Index cache.path is invalid", nil)
	}
	maxBytes, ok := jsonNumber(cache["max_bytes"])
	if !ok || maxBytes <= 0 {
		return publicError(CodeConsistency, "Semantic Index cache.max_bytes is invalid", nil)
	}
	if dimensions, ok := jsonNumber(config["dimensions"]); !ok || dimensions < 1 || dimensions > 4096 {
		return publicError(CodeConsistency, "Semantic Index dimensions are invalid", nil)
	}
	if similarity, ok := config["similarity"].(string); !ok || (similarity != "cosine" && similarity != "euclidean") {
		return publicError(CodeConsistency, "Semantic Index similarity is invalid", nil)
	}
	return nil
}

func jsonNumber(value any) (int64, bool) {
	switch number := value.(type) {
	case float64:
		if number != float64(int64(number)) {
			return 0, false
		}
		return int64(number), true
	case json.Number:
		parsed, err := number.Int64()
		return parsed, err == nil
	default:
		return 0, false
	}
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	raw, err := json.Marshal(input)
	if err != nil {
		return nil
	}
	var output map[string]any
	_ = json.Unmarshal(raw, &output)
	return output
}
