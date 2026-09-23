package kernel

import (
	"sort"
	"strings"
)

func validateDerivedResourceMaintenance(
	plan *plannedState,
	baseConstraints map[string]constraintSpec,
	targetConstraints map[string]constraintSpec,
	baseIndexes map[string]logicalIndex,
	targetIndexes map[string]logicalIndex,
) error {
	for name, base := range baseConstraints {
		expectedOwner, ownerChanged, err := transitionedOntologyRef(plan, base.Owner)
		if err != nil {
			return err
		}
		renames := plan.PropertyRenames[expectedOwner]
		expectedProperties := applyPropertyRenameList(base.Properties, renames)
		propertyChanged := strings.Join(expectedProperties, "\x00") != strings.Join(base.Properties, "\x00")
		if !ownerChanged && !propertyChanged {
			continue
		}
		target, exists := targetConstraints[name]
		if !exists {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Constraint deletion conflicts with mandatory rename maintenance",
				map[string]any{"name": name},
			)
		}
		if target.Owner != expectedOwner {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Constraint target change conflicts with mandatory Definition rename maintenance",
				map[string]any{"name": name, "target": expectedOwner.String()},
			)
		}
		if strings.Join(target.Properties, "\x00") != strings.Join(expectedProperties, "\x00") {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Constraint property change conflicts with mandatory Property rename maintenance",
				map[string]any{"name": name},
			)
		}
	}

	for name, base := range baseIndexes {
		derived := false
		expectedTargets := make([]OntologyRef, 0, len(base.Targets))
		for _, target := range base.Targets {
			expected, changed, err := transitionedOntologyRef(plan, target)
			if err != nil {
				return err
			}
			if changed {
				derived = true
			}
			expectedTargets = append(expectedTargets, expected)
		}
		expectedProperties, propertyChanged, err := expectedSharedIndexProperties(plan, base)
		if err != nil {
			return errorWithDetails(
				CodeObjectConflict,
				"shared Index Property rename diverges across targets",
				map[string]any{"name": name},
			)
		}
		if propertyChanged {
			derived = true
		}
		if !derived {
			continue
		}
		target, exists := targetIndexes[name]
		if !exists {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Index deletion conflicts with mandatory rename maintenance",
				map[string]any{"name": name},
			)
		}
		if !sameOntologyRefSet(target.Targets, expectedTargets) {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Index target change conflicts with mandatory Definition rename maintenance",
				map[string]any{"name": name},
			)
		}
		if strings.Join(target.Properties, "\x00") != strings.Join(expectedProperties, "\x00") {
			return errorWithDetails(
				CodeObjectConflict,
				"explicit Index property change conflicts with mandatory Property rename maintenance",
				map[string]any{"name": name},
			)
		}
	}
	return nil
}

func expectedSharedIndexProperties(
	plan *plannedState,
	base logicalIndex,
) ([]string, bool, error) {
	result := make([]string, 0, len(base.Properties))
	changed := false
	for _, property := range base.Properties {
		resolvedName := ""
		for _, target := range base.Targets {
			expectedTarget, _, err := transitionedOntologyRef(plan, target)
			if err != nil {
				return nil, false, err
			}
			candidate := property
			if next, ok := plan.PropertyRenames[expectedTarget][property]; ok {
				candidate = next
			}
			if resolvedName == "" {
				resolvedName = candidate
				continue
			}
			if candidate != resolvedName {
				return nil, false, publicError(
					CodeObjectConflict,
					"shared Index cannot preserve divergent Property rename targets",
					nil,
				)
			}
		}
		if resolvedName == "" {
			resolvedName = property
		}
		if resolvedName != property {
			changed = true
		}
		result = append(result, resolvedName)
	}
	return result, changed, nil
}

func applyPropertyRenameList(properties []string, renames map[string]string) []string {
	result := append([]string(nil), properties...)
	for index, property := range result {
		if next, ok := renames[property]; ok {
			result[index] = next
		}
	}
	return result
}

func sameOntologyRefSet(left, right []OntologyRef) bool {
	if len(left) != len(right) {
		return false
	}
	leftCopy := append([]OntologyRef(nil), left...)
	rightCopy := append([]OntologyRef(nil), right...)
	sort.Slice(leftCopy, func(i, j int) bool { return leftCopy[i].String() < leftCopy[j].String() })
	sort.Slice(rightCopy, func(i, j int) bool { return rightCopy[i].String() < rightCopy[j].String() })
	for index := range leftCopy {
		if leftCopy[index] != rightCopy[index] {
			return false
		}
	}
	return true
}

func transitionedOntologyRef(plan *plannedState, ref OntologyRef) (OntologyRef, bool, error) {
	raw, exists := plan.Transitions[ref.String()]
	if !exists {
		return ref, false, nil
	}
	transitioned, err := ParseOntologyRef(raw)
	if err != nil {
		return OntologyRef{}, false, consistencyWrap("invalid planned Ref transition", err)
	}
	return transitioned, true, nil
}
