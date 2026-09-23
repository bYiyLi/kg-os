package kernel

import (
	"bytes"
	"context"
	"encoding/json"
	"sort"
	"strings"
)

type plannedKnowledgeMutation struct {
	Operation   patchOperation
	Ref         ObjectRef
	AliasTarget string
	Alias       string
	Kind        ObjectKind
	Base        *ObjectValue
	Target      *ObjectValue
}

type plannedKnowledgePatch struct {
	Mutations []plannedKnowledgeMutation
	Aliases   map[string]ObjectKind
}

func (plan *plannedKnowledgePatch) isNoOp() bool {
	return plan == nil || len(plan.Mutations) == 0
}

func mergeOntologyDerivedKnowledge(
	ontology *plannedState,
	knowledge *plannedKnowledgePatch,
) error {
	if ontology == nil || knowledge == nil || len(knowledge.Mutations) == 0 {
		return nil
	}
	continuity := ontology.continuityByBaseRef()
	baseRefs := sortedBaseDefinitionRefs(ontology)
	for mutationIndex := range knowledge.Mutations {
		mutation := &knowledge.Mutations[mutationIndex]
		if mutation.Target == nil {
			continue
		}
		switch mutation.Kind {
		case KindKnowledgeNode:
			node := mutation.Target.KnowledgeNode
			if node == nil {
				return publicError(CodeInternal, "planned Knowledge Node target is missing", nil)
			}
			for _, baseRef := range baseRefs {
				if baseRef.Kind != KindNodeDefinition {
					continue
				}
				entry, survives := continuity[baseRef.String()]
				if !survives {
					continue
				}
				if entry.Ref != baseRef && containsString(node.Labels, baseRef.Name) {
					if !containsString(entry.Object.Value.Definition.Labels, baseRef.Name) {
						node.Labels = removeString(node.Labels, baseRef.Name)
					}
					if !containsString(node.Labels, entry.Ref.Name) {
						node.Labels = append(node.Labels, entry.Ref.Name)
					}
				}
				if !containsString(node.Labels, entry.Ref.Name) {
					continue
				}
				if err := applyDerivedPropertyRenames(
					node.Properties,
					propertyRenameMap(entry.Object),
					mutation.Ref.String(),
				); err != nil {
					return err
				}
			}
			sort.Strings(node.Labels)

		case KindKnowledgeRelationship:
			relationship := mutation.Target.KnowledgeRelationship
			if relationship == nil {
				return publicError(CodeInternal, "planned Knowledge Relationship target is missing", nil)
			}
			for _, baseRef := range baseRefs {
				if baseRef.Kind != KindRelationshipDefinition {
					continue
				}
				entry, survives := continuity[baseRef.String()]
				if !survives {
					continue
				}
				if entry.Ref != baseRef && relationship.Type == baseRef.Name {
					relationship.Type = entry.Ref.Name
				}
				if relationship.Type != entry.Ref.Name {
					continue
				}
				if err := applyDerivedPropertyRenames(
					relationship.Properties,
					propertyRenameMap(entry.Object),
					mutation.Ref.String(),
				); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func applyDerivedPropertyRenames(
	properties map[string]json.RawMessage,
	renames map[string]string,
	ref string,
) error {
	if len(renames) == 0 {
		return nil
	}
	oldNames := make([]string, 0, len(renames))
	for oldName := range renames {
		oldNames = append(oldNames, oldName)
	}
	sort.Strings(oldNames)
	for _, oldName := range oldNames {
		newName := renames[oldName]
		oldValue, hasOld := properties[oldName]
		if !hasOld {
			continue
		}
		if newValue, hasNew := properties[newName]; hasNew && !equalRawJSON(oldValue, newValue) {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Knowledge Property target conflicts with mandatory Ontology rename maintenance",
				map[string]any{"ref": ref, "from": oldName, "to": newName},
			)
		}
		properties[newName] = append(json.RawMessage(nil), oldValue...)
		delete(properties, oldName)
	}
	return nil
}

func equalRawJSON(left, right json.RawMessage) bool {
	var leftValue any
	var rightValue any
	leftDecoder := json.NewDecoder(strings.NewReader(string(left)))
	rightDecoder := json.NewDecoder(strings.NewReader(string(right)))
	leftDecoder.UseNumber()
	rightDecoder.UseNumber()
	if leftDecoder.Decode(&leftValue) != nil || rightDecoder.Decode(&rightValue) != nil {
		return false
	}
	leftCanonical, leftErr := json.Marshal(leftValue)
	rightCanonical, rightErr := json.Marshal(rightValue)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftCanonical, rightCanonical)
}

func removeString(values []string, target string) []string {
	result := values[:0]
	for _, value := range values {
		if value != target {
			result = append(result, value)
		}
	}
	return result
}

func partitionObjectPatchEntries(document patchDocument) ([]patchEntry, []patchEntry, error) {
	ontology := make([]patchEntry, 0, len(document.Entries))
	knowledge := make([]patchEntry, 0, len(document.Entries))
	for _, entry := range document.Entries {
		var kind ObjectKind
		var err error
		if entry.Operation == patchAdd {
			kind, _, err = parseNewObjectTarget(entry.NewTarget)
		} else {
			var ref ObjectRef
			ref, err = ParseObjectRef(entry.OldTarget)
			kind = ref.Kind
		}
		if err != nil {
			return nil, nil, err
		}
		switch kind {
		case KindDomain, KindNodeDefinition, KindRelationshipDefinition:
			ontology = append(ontology, entry)
		case KindKnowledgeNode, KindKnowledgeRelationship:
			if entry.Operation == patchRename {
				return nil, nil, publicError(CodeUnsupportedOperation, "Knowledge Object identity cannot be renamed", nil)
			}
			knowledge = append(knowledge, entry)
		default:
			return nil, nil, publicError(CodeInvalidArgument, "unsupported Object kind in Patch", nil)
		}
	}
	return ontology, knowledge, nil
}

func (service *Service) planKnowledgePatch(
	ctx context.Context,
	baseState string,
	entries []patchEntry,
) (*plannedKnowledgePatch, error) {
	plan := &plannedKnowledgePatch{
		Mutations: []plannedKnowledgeMutation{},
		Aliases:   map[string]ObjectKind{},
	}
	usedTargets := map[string]struct{}{}
	for _, entry := range entries {
		if entry.Operation == patchAdd {
			kind, _, err := parseNewObjectTarget(entry.NewTarget)
			if err != nil {
				return nil, err
			}
			if kind != KindKnowledgeNode && kind != KindKnowledgeRelationship {
				return nil, publicError(CodeInvalidArgument, "Knowledge planner received a non-Knowledge Add", nil)
			}
			if _, duplicate := plan.Aliases[entry.NewTarget]; duplicate {
				return nil, publicError(CodeInvalidArgument, "duplicate new object alias", nil)
			}
			plan.Aliases[entry.NewTarget] = kind
			continue
		}
		ref, err := ParseObjectRef(entry.OldTarget)
		if err != nil {
			return nil, err
		}
		if ref.Kind != KindKnowledgeNode && ref.Kind != KindKnowledgeRelationship {
			return nil, publicError(CodeInvalidArgument, "Knowledge planner received a non-Knowledge target", nil)
		}
		if _, duplicate := usedTargets[ref.String()]; duplicate {
			return nil, publicError(CodeInvalidArgument, "base Object appears in multiple Patch entries", nil)
		}
		usedTargets[ref.String()] = struct{}{}
	}

	deleted := map[string]struct{}{}
	for _, entry := range entries {
		mutation, keep, err := service.planKnowledgeEntry(ctx, baseState, entry)
		if err != nil {
			return nil, err
		}
		if !keep {
			continue
		}
		if mutation.Operation == patchDelete {
			deleted[mutation.Ref.String()] = struct{}{}
		}
		plan.Mutations = append(plan.Mutations, mutation)
	}
	for index := range plan.Mutations {
		mutation := &plan.Mutations[index]
		if mutation.Target == nil {
			continue
		}
		if err := service.validatePlannedKnowledgeValue(ctx, baseState, *mutation.Target, plan.Aliases, deleted); err != nil {
			return nil, err
		}
	}
	return plan, nil
}

func (service *Service) planKnowledgeEntry(
	ctx context.Context,
	baseState string,
	entry patchEntry,
) (plannedKnowledgeMutation, bool, error) {
	if entry.Operation == patchAdd {
		kind, alias, err := parseNewObjectTarget(entry.NewTarget)
		if err != nil {
			return plannedKnowledgeMutation{}, false, err
		}
		body, err := applyExactHunks("", entry.Hunks)
		if err != nil {
			return plannedKnowledgeMutation{}, false, err
		}
		value, err := parseObjectYAMLRaw(kind, []byte(body))
		if err != nil {
			return plannedKnowledgeMutation{}, false, err
		}
		return plannedKnowledgeMutation{
			Operation: patchAdd, AliasTarget: entry.NewTarget, Alias: alias, Kind: kind, Target: &value,
		}, true, nil
	}

	ref, err := ParseObjectRef(entry.OldTarget)
	if err != nil {
		return plannedKnowledgeMutation{}, false, err
	}
	base, err := service.readKnowledgeObject(ctx, baseState, ref)
	if err != nil {
		return plannedKnowledgeMutation{}, false, err
	}
	baseYAML, err := RenderObjectYAML(base)
	if err != nil {
		return plannedKnowledgeMutation{}, false, err
	}
	patched := string(baseYAML)
	if len(entry.Hunks) != 0 {
		patched, err = applyExactHunks(string(baseYAML), entry.Hunks)
		if err != nil {
			return plannedKnowledgeMutation{}, false, err
		}
	}
	if entry.Operation == patchDelete {
		if patched != "" {
			return plannedKnowledgeMutation{}, false, publicError(
				CodePatchBaseMismatch,
				"Delete Patch did not remove the complete canonical Object body",
				nil,
			)
		}
		baseCopy := base
		return plannedKnowledgeMutation{
			Operation: patchDelete, Ref: ref, Kind: ref.Kind, Base: &baseCopy,
		}, true, nil
	}
	if entry.Operation != patchUpdate {
		return plannedKnowledgeMutation{}, false, publicError(CodeUnsupportedOperation, "unsupported Knowledge Patch operation", nil)
	}
	target, err := parseObjectYAMLRaw(ref.Kind, []byte(patched))
	if err != nil {
		return plannedKnowledgeMutation{}, false, err
	}
	baseJSON, err := RenderObjectJSON(base)
	if err != nil {
		return plannedKnowledgeMutation{}, false, err
	}
	targetForCompare := target
	hasAlias := knowledgeValueContainsAlias(target)
	if err := service.normalizePlannedKnowledgeValue(ctx, baseState, &targetForCompare, nil, nil, false); err != nil {
		// Alias references are validated after all Add declarations are collected.
		if !hasAlias {
			return plannedKnowledgeMutation{}, false, err
		}
	} else if !hasAlias {
		targetJSON, renderErr := RenderObjectJSON(targetForCompare)
		if renderErr != nil {
			return plannedKnowledgeMutation{}, false, renderErr
		}
		if bytes.Equal(baseJSON, targetJSON) {
			return plannedKnowledgeMutation{}, false, nil
		}
	}
	baseCopy := base
	return plannedKnowledgeMutation{
		Operation: patchUpdate, Ref: ref, Kind: ref.Kind, Base: &baseCopy, Target: &target,
	}, true, nil
}

func knowledgeValueContainsAlias(value ObjectValue) bool {
	if value.KnowledgeRelationship == nil {
		return false
	}
	return strings.HasPrefix(value.KnowledgeRelationship.Start, "new:") ||
		strings.HasPrefix(value.KnowledgeRelationship.End, "new:")
}

func (service *Service) validatePlannedKnowledgeValue(
	ctx context.Context,
	baseState string,
	value ObjectValue,
	aliases map[string]ObjectKind,
	deleted map[string]struct{},
) error {
	return service.normalizePlannedKnowledgeValue(ctx, baseState, &value, aliases, deleted, true)
}

func (service *Service) normalizePlannedKnowledgeValue(
	ctx context.Context,
	baseState string,
	value *ObjectValue,
	aliases map[string]ObjectKind,
	deleted map[string]struct{},
	checkEndpoints bool,
) error {
	switch value.Kind {
	case KindKnowledgeNode:
		return normalizeKnowledgeNode(value.KnowledgeNode)
	case KindKnowledgeRelationship:
		relationship := value.KnowledgeRelationship
		if relationship == nil {
			return publicError(CodeType, "Knowledge Relationship object has invalid shape", nil)
		}
		if err := validateKnowledgeIdentifier(relationship.Type, "Knowledge Relationship type"); err != nil {
			return err
		}
		if err := validateKnowledgeProperties(relationship.Properties); err != nil {
			return err
		}
		for _, endpoint := range []string{relationship.Start, relationship.End} {
			if strings.HasPrefix(endpoint, "new:") {
				if !checkEndpoints {
					continue
				}
				kind, _, err := parseNewObjectTarget(endpoint)
				if err != nil {
					return err
				}
				if kind != KindKnowledgeNode || aliases[endpoint] != KindKnowledgeNode {
					return publicError(CodeInvalidArgument, "Relationship endpoint references an unknown Knowledge Node alias", nil)
				}
				continue
			}
			ref, err := ParseObjectRef(endpoint)
			if err != nil || ref.Kind != KindKnowledgeNode {
				return publicError(CodeType, "Knowledge Relationship endpoint must reference a Knowledge Node", err)
			}
			if _, isDeleted := deleted[ref.String()]; isDeleted {
				return errorWithDetails(CodeObjectConflict, "Relationship endpoint is deleted by the same Patch", map[string]any{"ref": ref.String()})
			}
			if checkEndpoints {
				if _, err := service.readKnowledgeObject(ctx, baseState, ref); err != nil {
					return err
				}
			}
		}
		return nil
	default:
		return publicError(CodeInvalidArgument, "Knowledge planner received an unsupported Object kind", nil)
	}
}
