package kernel

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) validateDataSafety(ctx context.Context, plan *plannedState) error {
	continuity := plan.continuityByBaseRef()
	for baseRef, baseRecord := range plan.Base.Definitions {
		entry, survives := continuity[baseRef.String()]
		if !survives {
			count, err := service.countDefinitionElements(ctx, plan.Base.State, baseRef)
			if err != nil {
				return err
			}
			if count != 0 {
				return errorWithDetails(CodeObjectConflict,
					"Definition deletion requires explicit Knowledge mutation",
					map[string]any{"ref": baseRef.String(), "dependentElements": count},
				)
			}
			continue
		}
		targetRef := entry.Ref
		targetObject := entry.Object
		if targetRef != baseRef {
			count, err := service.countDefinitionElements(ctx, plan.Base.State, targetRef)
			if err != nil {
				return err
			}
			if count != 0 {
				return errorWithDetails(CodeObjectConflict,
					"Definition rename target already exists in Knowledge data",
					map[string]any{"from": baseRef.String(), "to": targetRef.String(), "elements": count},
				)
			}
		}
		basePropertyNames := map[string]struct{}{}
		for _, property := range baseRecord.Value.Properties {
			basePropertyNames[property.Name] = struct{}{}
		}
		continuingProperties := map[string]struct{}{}
		for _, baseName := range targetObject.PropertyBase {
			if baseName != "" {
				continuingProperties[baseName] = struct{}{}
			}
		}
		for propertyName := range basePropertyNames {
			if _, ok := continuingProperties[propertyName]; ok {
				continue
			}
			count, err := service.countPropertyValues(ctx, plan.Base.State, baseRef, propertyName)
			if err != nil {
				return err
			}
			if count != 0 {
				return errorWithDetails(CodeObjectConflict,
					"Property deletion requires explicit Knowledge mutation",
					map[string]any{"ref": baseRef.String(), "property": propertyName, "dependentElements": count},
				)
			}
		}
		renameSources := map[string]struct{}{}
		for newName, oldName := range targetObject.PropertyBase {
			if oldName != "" && oldName != newName {
				renameSources[oldName] = struct{}{}
			}
		}
		for newName, oldName := range targetObject.PropertyBase {
			if oldName == "" || newName == oldName {
				continue
			}
			if _, preservedBySameRenameSet := renameSources[newName]; preservedBySameRenameSet {
				continue
			}
			count, err := service.countPropertyTargetValues(ctx, plan.Base.State, baseRef, newName)
			if err != nil {
				return err
			}
			if count != 0 {
				return errorWithDetails(CodeObjectConflict,
					"Property rename would overwrite an existing target Property",
					map[string]any{
						"ref": baseRef.String(), "from": oldName, "to": newName, "conflicts": count,
					},
				)
			}
			if baseRef.Kind == KindNodeDefinition {
				if err := service.validateNodePropertyRenameOverlap(ctx, plan, baseRef, oldName); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (service *Service) validateNodePropertyRenameOverlap(
	ctx context.Context,
	plan *plannedState,
	owner OntologyRef,
	sourceProperty string,
) error {
	continuity := plan.continuityByBaseRef()
	for otherRef, otherRecord := range plan.Base.Definitions {
		if otherRef == owner || otherRef.Kind != KindNodeDefinition {
			continue
		}
		if findProperty(otherRecord.Value.Properties, sourceProperty) == nil {
			continue
		}
		entry, survives := continuity[otherRef.String()]
		if !survives {
			continue
		}
		keepsSource := false
		for targetName, baseName := range entry.Object.PropertyBase {
			if baseName == sourceProperty && targetName == sourceProperty {
				keepsSource = true
				break
			}
		}
		if !keepsSource {
			continue
		}
		count, err := service.queryCount(
			ctx,
			plan.Base.State,
			"MATCH (n:$($owner):$($other)) WHERE n[$property] IS NOT NULL RETURN count(n) AS count",
			map[string]any{
				"owner":    owner.Name,
				"other":    otherRef.Name,
				"property": sourceProperty,
			},
		)
		if err != nil {
			return err
		}
		if count != 0 {
			return errorWithDetails(
				CodeObjectConflict,
				"Property rename would remove data still owned by an overlapping Node Definition",
				map[string]any{
					"ref":        owner.String(),
					"property":   sourceProperty,
					"overlapRef": otherRef.String(),
					"elements":   count,
				},
			)
		}
	}
	return nil
}

func (plan *plannedState) continuityByBaseRef() map[string]struct {
	Ref    OntologyRef
	Object *plannedObject
	OK     bool
} {
	result := map[string]struct {
		Ref    OntologyRef
		Object *plannedObject
		OK     bool
	}{}
	for ref, object := range plan.Objects {
		if object.BaseRef != nil {
			result[object.BaseRef.String()] = struct {
				Ref    OntologyRef
				Object *plannedObject
				OK     bool
			}{Ref: ref, Object: object, OK: true}
		}
	}
	return result
}

func (service *Service) countDefinitionElements(
	ctx context.Context,
	state string,
	ref OntologyRef,
) (int64, error) {
	var cypher string
	params := map[string]any{}
	switch ref.Kind {
	case KindNodeDefinition:
		cypher = "MATCH (n:$($label)) RETURN count(n) AS count"
		params["label"] = ref.Name
	case KindRelationshipDefinition:
		cypher = "MATCH ()-[r:$($type)]-() RETURN count(r) AS count"
		params["type"] = ref.Name
	default:
		return 0, publicError(CodeType, "Definition data count requires a Definition Ref", nil)
	}
	return service.queryCount(ctx, state, cypher, params)
}

func (service *Service) countPropertyValues(
	ctx context.Context,
	state string,
	ref OntologyRef,
	property string,
) (int64, error) {
	var cypher string
	params := map[string]any{"property": property}
	switch ref.Kind {
	case KindNodeDefinition:
		cypher = "MATCH (n:$($label)) WHERE n[$property] IS NOT NULL RETURN count(n) AS count"
		params["label"] = ref.Name
	case KindRelationshipDefinition:
		cypher = "MATCH ()-[r:$($type)]-() WHERE r[$property] IS NOT NULL RETURN count(r) AS count"
		params["type"] = ref.Name
	default:
		return 0, publicError(CodeType, "Property data count requires a Definition Ref", nil)
	}
	return service.queryCount(ctx, state, cypher, params)
}

func (service *Service) countPropertyTargetValues(
	ctx context.Context,
	state string,
	ref OntologyRef,
	newName string,
) (int64, error) {
	var cypher string
	params := map[string]any{"new": newName}
	switch ref.Kind {
	case KindNodeDefinition:
		cypher = "MATCH (n:$($label)) WHERE n[$new] IS NOT NULL RETURN count(n) AS count"
		params["label"] = ref.Name
	case KindRelationshipDefinition:
		cypher = "MATCH ()-[r:$($type)]-() WHERE r[$new] IS NOT NULL RETURN count(r) AS count"
		params["type"] = ref.Name
	default:
		return 0, publicError(CodeType, "Property rename requires a Definition Ref", nil)
	}
	return service.queryCount(ctx, state, cypher, params)
}

func (service *Service) queryCount(
	ctx context.Context,
	state string,
	cypher string,
	params map[string]any,
) (int64, error) {
	result, err := service.database.Query(ctx, lithograph.QueryRequest{
		At:     state,
		Cypher: cypher,
		Params: params,
	})
	if err != nil {
		return 0, AsPublicError(err)
	}
	rows, err := rowsByName(result.Result)
	if err != nil {
		return 0, err
	}
	if len(rows) != 1 {
		return 0, publicError(CodeInternal, "unexpected Lithograph count result", nil)
	}
	var count int64
	if err := json.Unmarshal(rows[0]["count"], &count); err != nil {
		return 0, publicError(CodeInternal, "decode Lithograph count result", err)
	}
	return count, nil
}

func applyKnowledgeRenameMaintenance(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedState,
) error {
	continuity := plan.continuityByBaseRef()
	for _, baseRef := range sortedBaseDefinitionRefs(plan) {
		entry, survives := continuity[baseRef.String()]
		if !survives {
			continue
		}
		propertyRenames := propertyRenameMap(entry.Object)
		if len(propertyRenames) != 0 {
			cypher, params := propertySnapshotRenameCypher(baseRef, propertyRenames)
			if _, err := transaction.Execute(ctx, cypher, params, nil); err != nil {
				return AsPublicError(err)
			}
		}
		if entry.Ref != baseRef {
			cypher, params, err := definitionRenameCypher(baseRef, entry.Ref)
			if err != nil {
				return err
			}
			if _, err := transaction.Execute(ctx, cypher, params, nil); err != nil {
				return AsPublicError(err)
			}
		}
	}
	return nil
}

func sortedBaseDefinitionRefs(plan *plannedState) []OntologyRef {
	baseRefs := make([]OntologyRef, 0, len(plan.Base.Definitions))
	for ref := range plan.Base.Definitions {
		baseRefs = append(baseRefs, ref)
	}
	sort.Slice(baseRefs, func(i, j int) bool { return baseRefs[i].String() < baseRefs[j].String() })
	return baseRefs
}

func removeRenamedSourceProperties(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedState,
) error {
	continuity := plan.continuityByBaseRef()
	baseRefs := make([]string, 0, len(continuity))
	for ref := range continuity {
		baseRefs = append(baseRefs, ref)
	}
	sort.Strings(baseRefs)
	for _, rawBase := range baseRefs {
		entry := continuity[rawBase]
		renames := propertyRenameMap(entry.Object)
		targets := map[string]struct{}{}
		for _, newName := range renames {
			targets[newName] = struct{}{}
		}
		oldNames := make([]string, 0, len(renames))
		for oldName := range renames {
			if _, stillATarget := targets[oldName]; !stillATarget {
				oldNames = append(oldNames, oldName)
			}
		}
		sort.Strings(oldNames)
		for _, oldName := range oldNames {
			cypher, params := propertyRemoveCypher(entry.Ref, oldName)
			if _, err := transaction.Execute(ctx, cypher, params, nil); err != nil {
				return AsPublicError(err)
			}
		}
	}
	return nil
}

func propertyRenameMap(object *plannedObject) map[string]string {
	renamings := map[string]string{}
	for newName, oldName := range object.PropertyBase {
		if oldName != "" && oldName != newName {
			renamings[oldName] = newName
		}
	}
	return renamings
}

func propertySnapshotRenameCypher(owner OntologyRef, renames map[string]string) (string, map[string]any) {
	oldNames := make([]string, 0, len(renames))
	for oldName := range renames {
		oldNames = append(oldNames, oldName)
	}
	sort.Strings(oldNames)
	params := map[string]any{}
	variable := "n"
	match := "MATCH (n:$($label))"
	params["label"] = owner.Name
	if owner.Kind == KindRelationshipDefinition {
		variable = "r"
		match = "MATCH ()-[r]->() WHERE type(r) = $type"
		delete(params, "label")
		params["type"] = owner.Name
	}
	projections := []string{variable}
	assignments := make([]string, 0, len(oldNames))
	for index, oldName := range oldNames {
		oldParam := fmt.Sprintf("old%d", index)
		newParam := fmt.Sprintf("new%d", index)
		alias := fmt.Sprintf("__kgos_rename_%d", index)
		params[oldParam] = oldName
		params[newParam] = renames[oldName]
		projections = append(projections, fmt.Sprintf("%s[$%s] AS %s", variable, oldParam, alias))
		assignments = append(assignments, fmt.Sprintf("%s[$%s] = %s", variable, newParam, alias))
	}
	return match + " WITH " + strings.Join(projections, ", ") +
		" SET " + strings.Join(assignments, ", ") + " FINISH", params
}

func propertyRemoveCypher(owner OntologyRef, oldName string) (string, map[string]any) {
	params := map[string]any{"old": oldName}
	if owner.Kind == KindRelationshipDefinition {
		params["type"] = owner.Name
		return "MATCH ()-[r]->() WHERE type(r) = $type REMOVE r[$old] FINISH", params
	}
	params["label"] = owner.Name
	return "MATCH (n:$($label)) REMOVE n[$old] FINISH", params
}

func definitionRenameCypher(oldRef, newRef OntologyRef) (string, map[string]any, error) {
	if oldRef.Kind != newRef.Kind {
		return "", nil, publicError(CodeUnsupportedOperation, "Definition rename cannot change kind", nil)
	}
	if oldRef.Kind == KindNodeDefinition {
		return "MATCH (n:$($old)) SET n:$($new) FINISH",
			map[string]any{"old": oldRef.Name, "new": newRef.Name}, nil
	}
	if oldRef.Kind == KindRelationshipDefinition {
		return "MATCH (a)-[r]->(b) WHERE type(r) = $oldType " +
				"CREATE (a)-[replacement:$($newType)]->(b) SET replacement = properties(r) DELETE r FINISH",
			map[string]any{"oldType": oldRef.Name, "newType": newRef.Name}, nil
	}
	return "", nil, publicError(CodeUnsupportedOperation, "only Definitions have Knowledge rewrite semantics", nil)
}

func removeRenamedSourceDefinitionLabels(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedState,
) error {
	continuity := plan.continuityByBaseRef()
	for _, baseRef := range sortedBaseDefinitionRefs(plan) {
		entry, survives := continuity[baseRef.String()]
		if !survives || baseRef.Kind != KindNodeDefinition || entry.Ref == baseRef {
			continue
		}
		definition := entry.Object.Value.Definition
		if definition != nil && containsString(definition.Labels, baseRef.Name) {
			continue
		}
		if _, err := transaction.Execute(
			ctx,
			"MATCH (n:$($new)) REMOVE n:$($old) FINISH",
			map[string]any{"old": baseRef.Name, "new": entry.Ref.Name},
			nil,
		); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}
