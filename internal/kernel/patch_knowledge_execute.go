package kernel

import (
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type knowledgeExecutionResult struct {
	Created     []CreatedObject
	Transitions []RefTransition
	AliasRefs   map[string]string
	FinalRefs   map[string]string
}

func newKnowledgeExecutionResult() knowledgeExecutionResult {
	return knowledgeExecutionResult{
		Created:     []CreatedObject{},
		Transitions: []RefTransition{},
		AliasRefs:   map[string]string{},
		FinalRefs:   map[string]string{},
	}
}

func applyKnowledgePreSchema(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedKnowledgePatch,
) error {
	if plan == nil {
		return nil
	}
	mutations := sortedKnowledgeMutations(plan.Mutations)

	// Relationships that disappear or require identity replacement must be
	// removed before a target Graph Type can stop accepting their old shape.
	for _, mutation := range mutations {
		if mutation.Kind != KindKnowledgeRelationship || mutation.Ref.String() == "" {
			continue
		}
		if mutation.Operation != patchDelete && !knowledgeRelationshipNeedsReplacement(mutation) {
			continue
		}
		if _, err := transaction.Execute(
			ctx,
			"MATCH ()-[r]->() WHERE elementId(r) = $id DELETE r FINISH",
			map[string]any{"id": mutation.Ref.String()},
			nil,
		); err != nil {
			return AsPublicError(err)
		}
	}

	// Remove fields/labels that are absent from the target before schema
	// contraction. Additions and final property assignment happen afterwards.
	for _, mutation := range mutations {
		if mutation.Operation != patchUpdate || mutation.Base == nil || mutation.Target == nil {
			continue
		}
		switch mutation.Kind {
		case KindKnowledgeNode:
			base := mutation.Base.KnowledgeNode
			target := mutation.Target.KnowledgeNode
			for _, label := range stringDifference(base.Labels, target.Labels) {
				if _, err := transaction.Execute(
					ctx,
					"MATCH (n) WHERE elementId(n) = $id REMOVE n:$($label) FINISH",
					map[string]any{"id": mutation.Ref.String(), "label": label},
					nil,
				); err != nil {
					return AsPublicError(err)
				}
			}
			for _, property := range rawPropertyDifference(base.Properties, target.Properties) {
				if _, err := transaction.Execute(
					ctx,
					"MATCH (n) WHERE elementId(n) = $id REMOVE n[$property] FINISH",
					map[string]any{"id": mutation.Ref.String(), "property": property},
					nil,
				); err != nil {
					return AsPublicError(err)
				}
			}
		case KindKnowledgeRelationship:
			if knowledgeRelationshipNeedsReplacement(mutation) {
				continue
			}
			for _, property := range rawPropertyDifference(
				mutation.Base.KnowledgeRelationship.Properties,
				mutation.Target.KnowledgeRelationship.Properties,
			) {
				if _, err := transaction.Execute(
					ctx,
					"MATCH ()-[r]->() WHERE elementId(r) = $id REMOVE r[$property] FINISH",
					map[string]any{"id": mutation.Ref.String(), "property": property},
					nil,
				); err != nil {
					return AsPublicError(err)
				}
			}
		}
	}

	// Node deletion is deliberately non-DETACH. Explicit relationship deletes /
	// replacements above are the only incident edges removed on behalf of the
	// caller.
	for _, mutation := range mutations {
		if mutation.Kind != KindKnowledgeNode || mutation.Operation != patchDelete {
			continue
		}
		result, err := transaction.Execute(
			ctx,
			"MATCH (n) WHERE elementId(n) = $id OPTIONAL MATCH (n)-[r]-() RETURN count(r) AS count",
			map[string]any{"id": mutation.Ref.String()},
			nil,
		)
		if err != nil {
			return AsPublicError(err)
		}
		rows, err := rowsByName(result)
		if err != nil {
			return err
		}
		if len(rows) != 1 {
			return publicError(CodeConsistency, "Knowledge Node disappeared while applying Patch", nil)
		}
		var count int64
		if err := json.Unmarshal(rows[0]["count"], &count); err != nil {
			return publicError(CodeInternal, "decode incident Relationship count", err)
		}
		if count != 0 {
			return errorWithDetails(
				CodeObjectConflict,
				"Knowledge Node deletion requires explicit incident Relationship mutation",
				map[string]any{"ref": mutation.Ref.String(), "incidentRelationships": count},
			)
		}
		if _, err := transaction.Execute(
			ctx,
			"MATCH (n) WHERE elementId(n) = $id DELETE n FINISH",
			map[string]any{"id": mutation.Ref.String()},
			nil,
		); err != nil {
			return AsPublicError(err)
		}
	}
	return nil
}

func applyKnowledgePostSchema(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedKnowledgePatch,
	result knowledgeExecutionResult,
) (knowledgeExecutionResult, error) {
	if plan == nil {
		return result, nil
	}
	mutations := sortedKnowledgeMutations(plan.Mutations)

	// New nodes must exist before any relationship endpoint aliases are resolved.
	for _, mutation := range mutations {
		if mutation.Kind != KindKnowledgeNode || mutation.Operation != patchAdd {
			continue
		}
		ref, err := createKnowledgeNode(ctx, transaction, mutation.Target.KnowledgeNode)
		if err != nil {
			return result, err
		}
		result.AliasRefs[mutation.AliasTarget] = ref
		result.FinalRefs[mutation.AliasTarget] = ref
		result.Created = append(result.Created, CreatedObject{
			Alias: mutation.Alias, Kind: KindKnowledgeNode, Ref: ref,
		})
	}

	for _, mutation := range mutations {
		if mutation.Kind != KindKnowledgeRelationship ||
			(mutation.Operation != patchAdd && mutation.Operation != patchUpdate) {
			continue
		}
		if mutation.Operation == patchUpdate && !relationshipUsesAlias(mutation) {
			continue
		}
		target := cloneKnowledgeRelationship(*mutation.Target.KnowledgeRelationship)
		var err error
		target.Start, err = resolveKnowledgeEndpoint(target.Start, result.AliasRefs)
		if err != nil {
			return result, err
		}
		target.End, err = resolveKnowledgeEndpoint(target.End, result.AliasRefs)
		if err != nil {
			return result, err
		}
		if mutation.Operation == patchAdd || knowledgeRelationshipNeedsReplacement(mutation) {
			ref, createErr := createKnowledgeRelationship(ctx, transaction, &target)
			if createErr != nil {
				return result, createErr
			}
			key := mutation.AliasTarget
			if mutation.Operation == patchAdd {
				result.AliasRefs[key] = ref
				result.Created = append(result.Created, CreatedObject{
					Alias: mutation.Alias, Kind: KindKnowledgeRelationship, Ref: ref,
				})
			} else {
				key = mutation.Ref.String()
				result.Transitions = append(result.Transitions, RefTransition{From: key, To: ref})
			}
			result.FinalRefs[key] = ref
			continue
		}
		if err := updateKnowledgeRelationshipProperties(
			ctx,
			transaction,
			mutation.Ref.String(),
			target.Properties,
		); err != nil {
			return result, err
		}
		result.FinalRefs[mutation.Ref.String()] = mutation.Ref.String()
	}
	return result, nil
}

func applyKnowledgeExistingBeforeSchema(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedKnowledgePatch,
) (knowledgeExecutionResult, error) {
	result := newKnowledgeExecutionResult()
	if plan == nil {
		return result, nil
	}
	for _, mutation := range sortedKnowledgeMutations(plan.Mutations) {
		if mutation.Operation != patchUpdate {
			continue
		}
		switch mutation.Kind {
		case KindKnowledgeNode:
			if err := updateKnowledgeNode(ctx, transaction, mutation); err != nil {
				return result, err
			}
			result.FinalRefs[mutation.Ref.String()] = mutation.Ref.String()
		case KindKnowledgeRelationship:
			if relationshipUsesAlias(mutation) {
				continue
			}
			target := cloneKnowledgeRelationship(*mutation.Target.KnowledgeRelationship)
			if knowledgeRelationshipNeedsReplacement(mutation) {
				ref, err := createKnowledgeRelationship(ctx, transaction, &target)
				if err != nil {
					return result, err
				}
				result.Transitions = append(result.Transitions, RefTransition{
					From: mutation.Ref.String(),
					To:   ref,
				})
				result.FinalRefs[mutation.Ref.String()] = ref
				continue
			}
			if err := updateKnowledgeRelationshipProperties(
				ctx,
				transaction,
				mutation.Ref.String(),
				target.Properties,
			); err != nil {
				return result, err
			}
			result.FinalRefs[mutation.Ref.String()] = mutation.Ref.String()
		}
	}
	return result, nil
}

func updateKnowledgeRelationshipProperties(
	ctx context.Context,
	transaction *lithograph.Transaction,
	ref string,
	properties map[string]json.RawMessage,
) error {
	if _, err := transaction.Execute(
		ctx,
		"MATCH ()-[r]->() WHERE elementId(r) = $id SET r = $properties FINISH",
		map[string]any{"id": ref, "properties": properties},
		nil,
	); err != nil {
		return AsPublicError(err)
	}
	return nil
}

func relationshipUsesAlias(mutation plannedKnowledgeMutation) bool {
	if mutation.Kind != KindKnowledgeRelationship || mutation.Target == nil ||
		mutation.Target.KnowledgeRelationship == nil {
		return false
	}
	relationship := mutation.Target.KnowledgeRelationship
	return strings.HasPrefix(relationship.Start, "new:") ||
		strings.HasPrefix(relationship.End, "new:")
}

func createKnowledgeNode(
	ctx context.Context,
	transaction *lithograph.Transaction,
	node *KnowledgeNode,
) (string, error) {
	if node == nil {
		return "", publicError(CodeInternal, "planned Knowledge Node is missing", nil)
	}
	cypher := "CREATE (n) SET n = $properties RETURN elementId(n) AS id"
	params := map[string]any{"properties": node.Properties}
	if len(node.Labels) != 0 {
		cypher = "CREATE (n:$($label)) SET n = $properties RETURN elementId(n) AS id"
		params["label"] = node.Labels[0]
	}
	result, err := transaction.Execute(ctx, cypher, params, nil)
	if err != nil {
		return "", AsPublicError(err)
	}
	ref, err := singleCreatedKnowledgeRef(result, KindKnowledgeNode)
	if err != nil {
		return "", err
	}
	additionalLabels := node.Labels
	if len(node.Labels) != 0 {
		additionalLabels = node.Labels[1:]
	}
	for _, label := range additionalLabels {
		if _, err := transaction.Execute(
			ctx,
			"MATCH (n) WHERE elementId(n) = $id SET n:$($label) FINISH",
			map[string]any{"id": ref, "label": label},
			nil,
		); err != nil {
			return "", AsPublicError(err)
		}
	}
	return ref, nil
}

func updateKnowledgeNode(
	ctx context.Context,
	transaction *lithograph.Transaction,
	mutation plannedKnowledgeMutation,
) error {
	base := mutation.Base.KnowledgeNode
	target := mutation.Target.KnowledgeNode
	for _, label := range stringDifference(target.Labels, base.Labels) {
		if _, err := transaction.Execute(
			ctx,
			"MATCH (n) WHERE elementId(n) = $id SET n:$($label) FINISH",
			map[string]any{"id": mutation.Ref.String(), "label": label},
			nil,
		); err != nil {
			return AsPublicError(err)
		}
	}
	if _, err := transaction.Execute(
		ctx,
		"MATCH (n) WHERE elementId(n) = $id SET n = $properties FINISH",
		map[string]any{"id": mutation.Ref.String(), "properties": target.Properties},
		nil,
	); err != nil {
		return AsPublicError(err)
	}
	return nil
}

func createKnowledgeRelationship(
	ctx context.Context,
	transaction *lithograph.Transaction,
	relationship *KnowledgeRelationship,
) (string, error) {
	result, err := transaction.Execute(
		ctx,
		"MATCH (a), (b) WHERE elementId(a) = $start AND elementId(b) = $end "+
			"CREATE (a)-[r:$($type)]->(b) SET r = $properties RETURN elementId(r) AS id",
		map[string]any{
			"start": relationship.Start, "end": relationship.End, "type": relationship.Type,
			"properties": relationship.Properties,
		},
		nil,
	)
	if err != nil {
		return "", AsPublicError(err)
	}
	rows, rowErr := rowsByName(result)
	if rowErr != nil {
		return "", rowErr
	}
	if len(rows) == 0 {
		return "", publicError(CodeObjectNotFound, "Knowledge Relationship endpoint was not found", nil)
	}
	return singleCreatedKnowledgeRef(result, KindKnowledgeRelationship)
}

func singleCreatedKnowledgeRef(result lithograph.Result, kind ObjectKind) (string, error) {
	rows, err := rowsByName(result)
	if err != nil {
		return "", err
	}
	if len(rows) != 1 {
		return "", publicError(CodeConsistency, "Knowledge create returned an unexpected result count", nil)
	}
	ref, err := rawString(rows[0], "id")
	if err != nil {
		return "", err
	}
	parsed, err := ParseObjectRef(ref)
	if err != nil || parsed.Kind != kind {
		return "", publicError(CodeConsistency, "Lithograph returned an invalid Knowledge elementId", err)
	}
	return ref, nil
}

func validateStagedKnowledge(
	ctx context.Context,
	transaction *lithograph.Transaction,
	plan *plannedKnowledgePatch,
	execution knowledgeExecutionResult,
) error {
	if plan == nil {
		return nil
	}
	for _, mutation := range plan.Mutations {
		if mutation.Operation == patchDelete {
			value, found, err := readStagedKnowledgeObject(ctx, transaction, mutation.Ref)
			_ = value
			if err != nil {
				return err
			}
			if found {
				return errorWithDetails(CodeConsistency, "deleted Knowledge Object still exists in staged state", map[string]any{"ref": mutation.Ref.String()})
			}
			continue
		}
		key := mutation.Ref.String()
		if mutation.Operation == patchAdd {
			key = mutation.AliasTarget
		}
		finalRef := execution.FinalRefs[key]
		if finalRef == "" {
			return publicError(CodeConsistency, "Knowledge mutation did not produce a final Ref", nil)
		}
		parsed, err := ParseObjectRef(finalRef)
		if err != nil {
			return err
		}
		actual, found, err := readStagedKnowledgeObject(ctx, transaction, parsed)
		if err != nil {
			return err
		}
		if !found {
			return errorWithDetails(CodeConsistency, "planned Knowledge Object is missing from staged state", map[string]any{"ref": finalRef})
		}
		expected := cloneObjectValue(*mutation.Target)
		if expected.KnowledgeRelationship != nil {
			expected.KnowledgeRelationship.Start, err = resolveKnowledgeEndpoint(expected.KnowledgeRelationship.Start, execution.AliasRefs)
			if err != nil {
				return err
			}
			expected.KnowledgeRelationship.End, err = resolveKnowledgeEndpoint(expected.KnowledgeRelationship.End, execution.AliasRefs)
			if err != nil {
				return err
			}
		}
		if err := normalizeObject(expected); err != nil {
			return err
		}
		equal, err := CanonicalObjectEqual(expected, actual)
		if err != nil {
			return err
		}
		if !equal {
			return errorWithDetails(CodeConsistency, "staged Knowledge Object differs from planned target", map[string]any{"ref": finalRef})
		}
	}
	return nil
}

func readStagedKnowledgeObject(
	ctx context.Context,
	transaction *lithograph.Transaction,
	ref ObjectRef,
) (ObjectValue, bool, error) {
	switch ref.Kind {
	case KindKnowledgeNode:
		result, err := transaction.Execute(
			ctx,
			"MATCH (n) WHERE elementId(n) = $id RETURN n",
			map[string]any{"id": ref.String()},
			nil,
		)
		if err != nil {
			return ObjectValue{}, false, AsPublicError(err)
		}
		row, found, err := singleStagedKnowledgeRow(result, "Node")
		if err != nil || !found {
			return ObjectValue{}, found, err
		}
		var node taggedNode
		if err := json.Unmarshal(row["n"], &node); err != nil {
			return ObjectValue{}, false, publicError(CodeInternal, "decode staged Knowledge Node", err)
		}
		if hasLabel(node.Labels, internalLabel) {
			return ObjectValue{}, false, publicError(CodeConsistency, "staged Knowledge Node resolves to internal KG OS data", nil)
		}
		value := ObjectValue{
			Kind: KindKnowledgeNode,
			KnowledgeNode: &KnowledgeNode{
				Labels: append([]string(nil), node.Labels...), Properties: cloneRawProperties(node.Properties),
			},
		}
		if err := normalizeObject(value); err != nil {
			return ObjectValue{}, false, err
		}
		return value, true, nil
	case KindKnowledgeRelationship:
		result, err := transaction.Execute(
			ctx,
			"MATCH (a)-[r]->(b) WHERE elementId(r) = $id RETURN r, a, b",
			map[string]any{"id": ref.String()},
			nil,
		)
		if err != nil {
			return ObjectValue{}, false, AsPublicError(err)
		}
		row, found, err := singleStagedKnowledgeRow(result, "Relationship")
		if err != nil || !found {
			return ObjectValue{}, found, err
		}
		var relationship taggedRelationship
		var start taggedNode
		var end taggedNode
		if err := json.Unmarshal(row["r"], &relationship); err != nil {
			return ObjectValue{}, false, publicError(CodeInternal, "decode staged Knowledge Relationship", err)
		}
		if err := json.Unmarshal(row["a"], &start); err != nil {
			return ObjectValue{}, false, publicError(CodeInternal, "decode staged Relationship start", err)
		}
		if err := json.Unmarshal(row["b"], &end); err != nil {
			return ObjectValue{}, false, publicError(CodeInternal, "decode staged Relationship end", err)
		}
		if hasLabel(start.Labels, internalLabel) || hasLabel(end.Labels, internalLabel) {
			return ObjectValue{}, false, publicError(CodeConsistency, "staged Knowledge Relationship touches internal KG OS data", nil)
		}
		value := ObjectValue{
			Kind: KindKnowledgeRelationship,
			KnowledgeRelationship: &KnowledgeRelationship{
				Type: relationship.Type, Start: relationship.Start, End: relationship.End,
				Properties: cloneRawProperties(relationship.Properties),
			},
		}
		if err := normalizeObject(value); err != nil {
			return ObjectValue{}, false, err
		}
		return value, true, nil
	default:
		return ObjectValue{}, false, publicError(CodeInternal, "staged Knowledge read received a non-Knowledge Ref", nil)
	}
}

func singleStagedKnowledgeRow(
	result lithograph.Result,
	kind string,
) (map[string]json.RawMessage, bool, error) {
	rows, err := rowsByName(result)
	if err != nil || len(rows) == 0 {
		return nil, false, err
	}
	if len(rows) != 1 {
		return nil, false, publicError(
			CodeConsistency,
			"staged Knowledge "+kind+" identity is not unique",
			nil,
		)
	}
	return rows[0], true, nil
}

func knowledgeRelationshipNeedsReplacement(mutation plannedKnowledgeMutation) bool {
	if mutation.Kind != KindKnowledgeRelationship || mutation.Operation != patchUpdate ||
		mutation.Base == nil || mutation.Target == nil {
		return false
	}
	base := mutation.Base.KnowledgeRelationship
	target := mutation.Target.KnowledgeRelationship
	return base.Type != target.Type || base.Start != target.Start || base.End != target.End
}

func resolveKnowledgeEndpoint(value string, aliases map[string]string) (string, error) {
	if resolved, ok := aliases[value]; ok {
		return resolved, nil
	}
	ref, err := ParseObjectRef(value)
	if err != nil || ref.Kind != KindKnowledgeNode {
		return "", publicError(CodeInvalidArgument, "Relationship endpoint alias is unresolved", err)
	}
	return ref.String(), nil
}

func stringDifference(left, right []string) []string {
	rightSet := make(map[string]struct{}, len(right))
	for _, value := range right {
		rightSet[value] = struct{}{}
	}
	result := []string{}
	for _, value := range left {
		if _, found := rightSet[value]; !found {
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func rawPropertyDifference(left, right map[string]json.RawMessage) []string {
	result := []string{}
	for key := range left {
		if _, found := right[key]; !found {
			result = append(result, key)
		}
	}
	sort.Strings(result)
	return result
}

func sortedKnowledgeMutations(input []plannedKnowledgeMutation) []plannedKnowledgeMutation {
	result := append([]plannedKnowledgeMutation(nil), input...)
	sort.SliceStable(result, func(i, j int) bool {
		left := result[i].Ref.String()
		if left == "" {
			left = result[i].AliasTarget
		}
		right := result[j].Ref.String()
		if right == "" {
			right = result[j].AliasTarget
		}
		return string(result[i].Kind)+"\x00"+left < string(result[j].Kind)+"\x00"+right
	})
	return result
}

func cloneKnowledgeRelationship(value KnowledgeRelationship) KnowledgeRelationship {
	value.Properties = cloneRawProperties(value.Properties)
	return value
}

func cloneObjectValue(value ObjectValue) ObjectValue {
	switch value.Kind {
	case KindKnowledgeNode:
		copyNode := *value.KnowledgeNode
		copyNode.Labels = append([]string(nil), copyNode.Labels...)
		copyNode.Properties = cloneRawProperties(copyNode.Properties)
		return ObjectValue{Kind: value.Kind, KnowledgeNode: &copyNode}
	case KindKnowledgeRelationship:
		copyRelationship := cloneKnowledgeRelationship(*value.KnowledgeRelationship)
		return ObjectValue{Kind: value.Kind, KnowledgeRelationship: &copyRelationship}
	case KindDomain:
		copyDomain := cloneDomain(*value.Domain)
		return ObjectValue{Kind: value.Kind, Domain: &copyDomain}
	case KindNodeDefinition, KindRelationshipDefinition:
		copyDefinition := cloneDefinition(*value.Definition)
		return ObjectValue{Kind: value.Kind, Definition: &copyDefinition}
	default:
		return value
	}
}
