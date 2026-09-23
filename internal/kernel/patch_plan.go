package kernel

import (
	"encoding/json"
	"sort"
	"strings"
)

type plannedObject struct {
	Value            ObjectValue
	BaseRef          *OntologyRef
	PropertyBase     map[string]string
	ExplicitlyEdited bool
}

type plannedState struct {
	Base            *snapshot
	Objects         map[OntologyRef]*plannedObject
	Aliases         map[string]CreatedObject
	Transitions     map[string]string
	PropertyRenames map[OntologyRef]map[string]string
	IndexDeltas     map[string][]indexDelta
}

type indexDeclaration struct {
	Name           string
	Type           string
	Targets        []string
	Properties     []string
	ImplicitTarget bool
}

type indexDelta struct {
	Owner   OntologyRef
	Delete  bool
	Desired *indexDeclaration
}

type logicalIndex struct {
	Name       string
	Type       string
	Targets    []OntologyRef
	Properties []string
	Hidden     map[string]any
}

func planOntologyPatch(base *snapshot, patchText string) (*plannedState, error) {
	document, err := parseGitPatch(patchText)
	if err != nil {
		return nil, err
	}
	return planOntologyEntries(base, document.Entries)
}

func planOntologyEntries(base *snapshot, entries []patchEntry) (*plannedState, error) {
	plan := &plannedState{
		Base:            base,
		Objects:         map[OntologyRef]*plannedObject{},
		Aliases:         map[string]CreatedObject{},
		Transitions:     map[string]string{},
		PropertyRenames: map[OntologyRef]map[string]string{},
		IndexDeltas:     map[string][]indexDelta{},
	}
	for name, record := range base.Domains {
		ref := OntologyRef{Kind: KindDomain, Name: name}
		baseRef := ref
		value := cloneDomain(record.Value)
		plan.Objects[ref] = &plannedObject{
			Value:   ObjectValue{Kind: KindDomain, Domain: &value},
			BaseRef: &baseRef,
		}
	}
	for ref, record := range base.Definitions {
		baseRef := ref
		value := cloneDefinition(record.Value)
		propertyBase := map[string]string{}
		for _, property := range value.Properties {
			propertyBase[property.Name] = property.Name
		}
		plan.Objects[ref] = &plannedObject{
			Value:        ObjectValue{Kind: ref.Kind, Definition: &value},
			BaseRef:      &baseRef,
			PropertyBase: propertyBase,
		}
	}

	usedBaseTargets := map[OntologyRef]struct{}{}
	usedAliases := map[string]struct{}{}
	for _, entry := range entries {
		if err := plan.applyEntry(entry, usedBaseTargets, usedAliases); err != nil {
			return nil, err
		}
	}
	if err := plan.resolveDerivedReferences(); err != nil {
		return nil, err
	}
	if err := plan.rebuildIndexes(); err != nil {
		return nil, err
	}
	for ref, object := range plan.Objects {
		if err := normalizeObject(object.Value); err != nil {
			return nil, errorWithDetails(AsPublicError(err).Code, AsPublicError(err).Message, map[string]any{"ref": ref.String()})
		}
	}
	if err := materializeAnonymousConstraintNames(plan.Objects); err != nil {
		return nil, err
	}
	if err := plan.validateReferences(); err != nil {
		return nil, err
	}
	return plan, nil
}

func materializeAnonymousConstraintNames(objects map[OntologyRef]*plannedObject) error {
	for ref, object := range objects {
		definition := object.Value.Definition
		if definition == nil {
			continue
		}
		for index := range definition.Constraints {
			constraint := &definition.Constraints[index]
			if constraint.Name != "" {
				continue
			}
			constraint.Name = anonymousConstraintName(constraintSpec{
				Owner: ref, Type: constraint.Type,
				Properties: append([]string(nil), constraint.Properties...),
			})
		}
		for propertyIndex := range definition.Properties {
			property := &definition.Properties[propertyIndex]
			for constraintIndex := range property.Constraints {
				constraint := &property.Constraints[constraintIndex]
				if constraint.Name != "" {
					continue
				}
				constraint.Name = anonymousConstraintName(constraintSpec{
					Owner: ref, Type: constraint.Type, Properties: []string{property.Name},
				})
			}
		}
	}
	return nil
}

func (plan *plannedState) applyEntry(
	entry patchEntry,
	usedBaseTargets map[OntologyRef]struct{},
	usedAliases map[string]struct{},
) error {
	switch entry.Operation {
	case patchAdd:
		kind, alias, err := parseNewTarget(entry.NewTarget)
		if err != nil {
			return err
		}
		if _, exists := usedAliases[entry.NewTarget]; exists {
			return publicError(CodeInvalidArgument, "duplicate new object alias", nil)
		}
		usedAliases[entry.NewTarget] = struct{}{}
		body, err := applyExactHunks("", entry.Hunks)
		if err != nil {
			return err
		}
		value, err := parseObjectYAMLRaw(kind, []byte(body))
		if err != nil {
			return err
		}
		ref, err := refFromObject(value)
		if err != nil {
			return err
		}
		if _, exists := plan.Objects[ref]; exists {
			return errorWithDetails(CodeObjectConflict, "Add would create an existing Ontology object", map[string]any{"ref": ref.String()})
		}
		beforeIndexes := map[string]indexDeclaration{}
		afterIndexes := objectIndexDeclarations(ref, value)
		plan.recordIndexDeltas(ref, beforeIndexes, afterIndexes)
		propertyBase := map[string]string{}
		if value.Definition != nil {
			for _, property := range value.Definition.Properties {
				propertyBase[property.Name] = ""
			}
		}
		plan.Objects[ref] = &plannedObject{
			Value:            value,
			PropertyBase:     propertyBase,
			ExplicitlyEdited: true,
		}
		plan.Aliases[entry.NewTarget] = CreatedObject{Alias: alias, Kind: kind, Ref: ref.String()}
		return nil

	case patchUpdate, patchDelete, patchRename:
		oldRef, err := ParseOntologyRef(entry.OldTarget)
		if err != nil {
			return err
		}
		if _, exists := usedBaseTargets[oldRef]; exists {
			return publicError(CodeInvalidArgument, "base Object appears in multiple Patch entries", nil)
		}
		usedBaseTargets[oldRef] = struct{}{}
		baseValue, err := plan.Base.objectValue(oldRef)
		if err != nil {
			return err
		}
		baseYAML, err := RenderObjectYAML(baseValue)
		if err != nil {
			return err
		}
		beforeIndexes := objectIndexDeclarations(oldRef, baseValue)
		patchedBody := string(baseYAML)
		if len(entry.Hunks) != 0 {
			patchedBody, err = applyExactHunks(string(baseYAML), entry.Hunks)
			if err != nil {
				return err
			}
		}
		if entry.Operation == patchDelete {
			if patchedBody != "" {
				return publicError(CodePatchBaseMismatch, "Delete Patch did not remove the complete canonical Object body", nil)
			}
			delete(plan.Objects, oldRef)
			return nil
		}

		newRef := oldRef
		if entry.Operation == patchRename {
			newRef, err = ParseOntologyRef(entry.NewTarget)
			if err != nil {
				return err
			}
			if newRef.Kind != oldRef.Kind {
				return publicError(CodeUnsupportedOperation, "Ontology rename cannot change Object kind", nil)
			}
			if existing, exists := plan.Objects[newRef]; exists && existing.BaseRef != nil && *existing.BaseRef != oldRef {
				return errorWithDetails(CodeObjectConflict, "rename target already exists", map[string]any{"ref": newRef.String()})
			}
		}
		value, err := parseObjectYAMLRaw(oldRef.Kind, []byte(patchedBody))
		if err != nil {
			return err
		}
		bodyRef, err := refFromObject(value)
		if err != nil {
			return err
		}
		if entry.Operation == patchRename {
			if bodyRef == oldRef {
				setObjectName(value, newRef.Name)
				bodyRef = newRef
			}
			if bodyRef != newRef {
				return publicError(CodeObjectConflict, "Rename target and Object name do not match", nil)
			}
		} else if bodyRef != oldRef {
			return publicError(CodeObjectConflict, "identifying name change requires a Git Rename entry", nil)
		}
		afterIndexes := objectIndexDeclarations(newRef, value)
		plan.recordIndexDeltas(newRef, beforeIndexes, afterIndexes)
		planned := plan.Objects[oldRef]
		delete(plan.Objects, oldRef)
		planned.Value = value
		planned.ExplicitlyEdited = true
		plan.Objects[newRef] = planned
		if entry.Operation == patchRename {
			plan.Transitions[oldRef.String()] = newRef.String()
		}
		return nil
	default:
		return publicError(CodeUnsupportedOperation, "unsupported Patch operation", nil)
	}
}

func (plan *plannedState) recordIndexDeltas(
	owner OntologyRef,
	before map[string]indexDeclaration,
	after map[string]indexDeclaration,
) {
	names := map[string]struct{}{}
	for name := range before {
		names[name] = struct{}{}
	}
	for name := range after {
		names[name] = struct{}{}
	}
	for name := range names {
		left, leftOK := before[name]
		right, rightOK := after[name]
		if leftOK && rightOK && equalIndexDeclaration(left, right) {
			continue
		}
		if !rightOK {
			plan.IndexDeltas[name] = append(plan.IndexDeltas[name], indexDelta{Owner: owner, Delete: true})
			continue
		}
		copyRight := right
		plan.IndexDeltas[name] = append(plan.IndexDeltas[name], indexDelta{Owner: owner, Desired: &copyRight})
	}
}

func (plan *plannedState) resolveDerivedReferences() error {
	renameMap := map[string]string{}
	renameTargets := map[string]struct{}{}
	for oldRef, newRef := range plan.Transitions {
		renameMap[oldRef] = newRef
		renameTargets[newRef] = struct{}{}
	}
	aliasMap := map[string]string{}
	for target, created := range plan.Aliases {
		aliasMap[target] = created.Ref
	}
	resolveAlias := func(raw string) (string, error) {
		if replacement, ok := aliasMap[raw]; ok {
			return replacement, nil
		}
		if strings.HasPrefix(raw, "new:") {
			return "", publicError(CodeInvalidArgument, "unknown request-local alias", nil)
		}
		ref, err := ParseOntologyRef(raw)
		if err != nil {
			return "", err
		}
		if _, err := plan.Base.objectValue(ref); err != nil {
			if _, declaredRenameTarget := renameTargets[raw]; declaredRenameTarget {
				return raw, nil
			}
			return "", errorWithDetails(
				CodeObjectNotFound,
				"Patch reference must resolve in baseState or use a request-local alias",
				map[string]any{"ref": raw},
			)
		}
		return raw, nil
	}

	for ref, object := range plan.Objects {
		switch object.Value.Kind {
		case KindDomain:
			for index, raw := range object.Value.Domain.Includes {
				resolved, err := resolveAlias(raw)
				if err != nil {
					return err
				}
				object.Value.Domain.Includes[index] = resolved
			}
			var baseIncludes []string
			if object.BaseRef != nil {
				if base := plan.Base.Domains[object.BaseRef.Name]; base != nil {
					baseIncludes = base.Value.Includes
				}
			}
			for oldRef, newRef := range renameMap {
				if containsString(baseIncludes, oldRef) &&
					!containsString(object.Value.Domain.Includes, oldRef) &&
					!containsString(object.Value.Domain.Includes, newRef) &&
					object.ExplicitlyEdited {
					return errorWithDetails(
						CodeObjectConflict,
						"explicit Domain membership change conflicts with mandatory Definition rename maintenance",
						map[string]any{"ref": ref.String(), "from": oldRef, "to": newRef},
					)
				}
				for index, raw := range object.Value.Domain.Includes {
					if raw == oldRef {
						object.Value.Domain.Includes[index] = newRef
					}
				}
			}

		case KindNodeDefinition, KindRelationshipDefinition:
			definition := object.Value.Definition
			renames := map[string]string{}
			if object.BaseRef != nil {
				baseRecord := plan.Base.Definitions[*object.BaseRef]
				if baseRecord == nil {
					return publicError(CodeConsistency, "Definition base record is missing", nil)
				}
				propertyBase := make(map[string]string, len(definition.Properties))
				consumed := map[string]string{}
				for propertyIndex := range definition.Properties {
					property := &definition.Properties[propertyIndex]
					source := ""
					if property.RenameFrom != "" {
						if property.RenameFrom == property.Name {
							return publicError(CodeType, "renameFrom must name a different Property", nil)
						}
						if findProperty(baseRecord.Value.Properties, property.RenameFrom) == nil {
							return publicError(CodeObjectNotFound, "renameFrom Property does not exist in baseState", nil)
						}
						source = property.RenameFrom
						renames[source] = property.Name
						property.RenameFrom = ""
					} else if findProperty(baseRecord.Value.Properties, property.Name) != nil {
						source = property.Name
					}
					if source != "" {
						if previous, duplicate := consumed[source]; duplicate {
							return errorWithDetails(
								CodeObjectConflict,
								"base Property is consumed by multiple target Properties",
								map[string]any{"property": source, "first": previous, "second": property.Name},
							)
						}
						consumed[source] = property.Name
					}
					propertyBase[property.Name] = source
				}
				object.PropertyBase = propertyBase
			}
			if len(renames) != 0 {
				plan.PropertyRenames[ref] = renames
				for constraintIndex := range definition.Constraints {
					for propertyIndex, name := range definition.Constraints[constraintIndex].Properties {
						if next, ok := renames[name]; ok {
							definition.Constraints[constraintIndex].Properties[propertyIndex] = next
						}
					}
				}
				for indexIndex := range definition.Indexes {
					for propertyIndex, name := range definition.Indexes[indexIndex].Properties {
						if next, ok := renames[name]; ok {
							definition.Indexes[indexIndex].Properties[propertyIndex] = next
						}
					}
				}
			}

			if definition.From != nil {
				resolved, err := resolveAlias(*definition.From)
				if err != nil {
					return err
				}
				definition.From = &resolved
			}
			if definition.To != nil {
				resolved, err := resolveAlias(*definition.To)
				if err != nil {
					return err
				}
				definition.To = &resolved
			}
			if definition.Kind == KindRelationshipDefinition && object.BaseRef != nil {
				base := plan.Base.Definitions[*object.BaseRef]
				if base == nil {
					return publicError(CodeConsistency, "Relationship base Definition is missing", nil)
				}
				if err := applyEndpointTransitions(
					ref,
					"from",
					base.Value.From,
					&definition.From,
					renameMap,
					object.ExplicitlyEdited,
				); err != nil {
					return err
				}
				if err := applyEndpointTransitions(
					ref,
					"to",
					base.Value.To,
					&definition.To,
					renameMap,
					object.ExplicitlyEdited,
				); err != nil {
					return err
				}
			} else {
				if definition.From != nil {
					if replacement, ok := renameMap[*definition.From]; ok {
						value := replacement
						definition.From = &value
					}
				}
				if definition.To != nil {
					if replacement, ok := renameMap[*definition.To]; ok {
						value := replacement
						definition.To = &value
					}
				}
			}

			for propertyIndex := range definition.Properties {
				for indexIndex := range definition.Properties[propertyIndex].Indexes {
					index := &definition.Properties[propertyIndex].Indexes[indexIndex]
					for targetIndex, raw := range index.Targets {
						resolved, err := resolveAlias(raw)
						if err != nil {
							return err
						}
						if replacement, ok := renameMap[resolved]; ok {
							resolved = replacement
						}
						index.Targets[targetIndex] = resolved
					}
				}
			}
			for indexIndex := range definition.Indexes {
				index := &definition.Indexes[indexIndex]
				for targetIndex, raw := range index.Targets {
					resolved, err := resolveAlias(raw)
					if err != nil {
						return err
					}
					if replacement, ok := renameMap[resolved]; ok {
						resolved = replacement
					}
					index.Targets[targetIndex] = resolved
				}
			}
		}
	}
	return nil
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func applyEndpointTransitions(
	owner OntologyRef,
	field string,
	base *string,
	current **string,
	transitions map[string]string,
	explicit bool,
) error {
	if current == nil {
		return publicError(CodeInternal, "Relationship endpoint pointer is missing", nil)
	}
	for oldRef, newRef := range transitions {
		if base != nil && *base == oldRef {
			if *current == nil {
				if explicit {
					return errorWithDetails(
						CodeObjectConflict,
						"explicit Relationship endpoint change conflicts with mandatory Definition rename maintenance",
						map[string]any{"ref": owner.String(), "field": field, "from": oldRef, "to": newRef},
					)
				}
				continue
			}
			switch **current {
			case oldRef:
				value := newRef
				*current = &value
			case newRef:
				// The caller already expressed the mandatory final target.
			default:
				if explicit {
					return errorWithDetails(
						CodeObjectConflict,
						"explicit Relationship endpoint change conflicts with mandatory Definition rename maintenance",
						map[string]any{"ref": owner.String(), "field": field, "from": oldRef, "to": newRef},
					)
				}
			}
			continue
		}
		if *current != nil && **current == oldRef {
			value := newRef
			*current = &value
		}
	}
	return nil
}

func (plan *plannedState) rebuildIndexes() error {
	indexes, err := collectSnapshotIndexes(plan.Base)
	if err != nil {
		return err
	}
	// Renames are mandatory derived maintenance. A rebuilt search definition
	// intentionally loses hidden config so current daemon defaults are used.
	for name, index := range indexes {
		changed := false
		for targetIndex := range index.Targets {
			old := index.Targets[targetIndex]
			if next, ok := plan.Transitions[old.String()]; ok {
				resolved, err := ParseOntologyRef(next)
				if err != nil {
					return err
				}
				index.Targets[targetIndex] = resolved
				changed = true
			}
		}
		for targetRef, renames := range plan.PropertyRenames {
			if !containsOntologyRef(index.Targets, targetRef) {
				continue
			}
			for propertyIndex, property := range index.Properties {
				if next, ok := renames[property]; ok {
					index.Properties[propertyIndex] = next
					changed = true
				}
			}
		}
		if changed {
			index.Hidden = nil
		}
		indexes[name] = index
	}
	for name, deltas := range plan.IndexDeltas {
		var selected *logicalIndex
		deleteRequested := false
		for _, delta := range deltas {
			if delta.Delete {
				if selected != nil {
					return publicError(CodeObjectConflict, "Index delete conflicts with another explicit Index update", nil)
				}
				deleteRequested = true
				continue
			}
			logical, err := plan.logicalIndexFromDeclaration(delta.Owner, *delta.Desired)
			if err != nil {
				return err
			}
			if deleteRequested {
				return publicError(CodeObjectConflict, "Index delete conflicts with another explicit Index update", nil)
			}
			if selected == nil {
				copyLogical := logical
				selected = &copyLogical
			} else if !equalLogicalIndex(*selected, logical, false) {
				return publicError(CodeObjectConflict, "shared Index has conflicting explicit target states", nil)
			}
		}
		if deleteRequested {
			delete(indexes, name)
			continue
		}
		if selected != nil {
			if existing, ok := indexes[name]; ok && equalLogicalIndex(existing, *selected, false) {
				selected.Hidden = existing.Hidden
			}
			indexes[name] = *selected
		}
	}

	for name, index := range indexes {
		survivingTargets := 0
		for _, target := range index.Targets {
			if _, ok := plan.Objects[target]; ok {
				survivingTargets++
			}
		}
		if survivingTargets == 0 {
			delete(indexes, name)
			continue
		}
		if survivingTargets != len(index.Targets) {
			return errorWithDetails(CodeObjectConflict, "shared Index still depends on a deleted Definition", map[string]any{"name": name})
		}
		for _, target := range index.Targets {
			object := plan.Objects[target]
			if object == nil || object.Value.Definition == nil {
				return publicError(CodeConsistency, "Index target is not a Definition", nil)
			}
			for _, property := range index.Properties {
				if findProperty(object.Value.Definition.Properties, property) == nil {
					return errorWithDetails(CodeObjectConflict, "Index still depends on a removed Property", map[string]any{
						"name": name, "ref": target.String(), "property": property,
					})
				}
			}
		}
	}

	for _, object := range plan.Objects {
		if object.Value.Definition == nil {
			continue
		}
		object.Value.Definition.Indexes = nil
		for propertyIndex := range object.Value.Definition.Properties {
			object.Value.Definition.Properties[propertyIndex].Indexes = nil
		}
	}
	for _, index := range indexes {
		for _, target := range index.Targets {
			object := plan.Objects[target]
			if object == nil || object.Value.Definition == nil {
				continue
			}
			value := Index{
				Name: index.Name, Type: index.Type,
				Properties:    append([]string(nil), index.Properties...),
				hiddenOptions: cloneAnyMap(index.Hidden),
			}
			if len(index.Targets) > 1 {
				for _, ref := range index.Targets {
					value.Targets = append(value.Targets, ref.String())
				}
			}
			if len(index.Targets) == 1 && len(index.Properties) == 1 {
				property := findProperty(object.Value.Definition.Properties, index.Properties[0])
				value.Properties = nil
				property.Indexes = append(property.Indexes, value)
			} else {
				object.Value.Definition.Indexes = append(object.Value.Definition.Indexes, value)
			}
		}
	}
	return nil
}

func (plan *plannedState) logicalIndexFromDeclaration(owner OntologyRef, declaration indexDeclaration) (logicalIndex, error) {
	targets := []OntologyRef{owner}
	if !declaration.ImplicitTarget {
		targets = nil
		for _, raw := range declaration.Targets {
			if replacement, ok := plan.Transitions[raw]; ok {
				raw = replacement
			}
			if created, ok := plan.Aliases[raw]; ok {
				raw = created.Ref
			}
			ref, err := ParseOntologyRef(raw)
			if err != nil {
				return logicalIndex{}, err
			}
			targets = append(targets, ref)
		}
	}
	properties := append([]string(nil), declaration.Properties...)
	if renames := plan.PropertyRenames[owner]; len(renames) != 0 {
		for index, property := range properties {
			if next, ok := renames[property]; ok {
				properties[index] = next
			}
		}
	}
	sort.Slice(targets, func(i, j int) bool { return targets[i].String() < targets[j].String() })
	return logicalIndex{Name: declaration.Name, Type: declaration.Type, Targets: targets, Properties: properties}, nil
}

func (plan *plannedState) validateReferences() error {
	for ref, object := range plan.Objects {
		if object.Value.Domain != nil {
			for _, raw := range object.Value.Domain.Includes {
				member, err := ParseOntologyRef(raw)
				if err != nil {
					return err
				}
				if _, ok := plan.Objects[member]; !ok {
					return errorWithDetails(CodeObjectConflict, "Domain includes a missing target", map[string]any{"ref": ref.String(), "target": raw})
				}
			}
			continue
		}
		definition := object.Value.Definition
		if definition.Kind == KindRelationshipDefinition {
			for _, endpoint := range []*string{definition.From, definition.To} {
				if endpoint == nil {
					continue
				}
				target, err := ParseOntologyRef(*endpoint)
				if err != nil || target.Kind != KindNodeDefinition {
					return publicError(CodeType, "Relationship endpoint is not a Node Definition Ref", err)
				}
				if _, ok := plan.Objects[target]; !ok {
					return errorWithDetails(CodeObjectConflict, "Relationship endpoint Definition is missing", map[string]any{"ref": ref.String(), "target": *endpoint})
				}
			}
		}
	}
	return nil
}

func (plan *plannedState) isNoOp() (bool, error) {
	baseCount := len(plan.Base.Domains) + len(plan.Base.Definitions)
	if len(plan.Objects) != baseCount ||
		len(plan.Transitions) != 0 ||
		len(plan.Aliases) != 0 ||
		len(plan.PropertyRenames) != 0 {
		return false, nil
	}
	for ref, object := range plan.Objects {
		baseValue, err := plan.Base.objectValue(ref)
		if err != nil {
			return false, nil
		}
		equal, err := CanonicalObjectEqual(baseValue, object.Value)
		if err != nil {
			return false, err
		}
		if !equal {
			return false, nil
		}
	}
	return true, nil
}

func refFromObject(value ObjectValue) (OntologyRef, error) {
	switch value.Kind {
	case KindDomain:
		if value.Domain == nil {
			return OntologyRef{}, publicError(CodeType, "Domain body is missing", nil)
		}
		if err := validatePublicName(value.Domain.Name, "domain name"); err != nil {
			return OntologyRef{}, err
		}
		return OntologyRef{Kind: KindDomain, Name: value.Domain.Name}, nil
	case KindNodeDefinition, KindRelationshipDefinition:
		if value.Definition == nil {
			return OntologyRef{}, publicError(CodeType, "Definition body is missing", nil)
		}
		if err := validatePublicName(value.Definition.Name, "definition name"); err != nil {
			return OntologyRef{}, err
		}
		return OntologyRef{Kind: value.Kind, Name: value.Definition.Name}, nil
	default:
		return OntologyRef{}, publicError(CodeInvalidArgument, "unsupported Ontology object kind", nil)
	}
}

func setObjectName(value ObjectValue, name string) {
	if value.Domain != nil {
		value.Domain.Name = name
	}
	if value.Definition != nil {
		value.Definition.Name = name
	}
}

func objectIndexDeclarations(owner OntologyRef, value ObjectValue) map[string]indexDeclaration {
	result := map[string]indexDeclaration{}
	if value.Definition == nil {
		return result
	}
	for _, property := range value.Definition.Properties {
		for _, index := range property.Indexes {
			result[index.Name] = indexDeclaration{
				Name: index.Name, Type: index.Type,
				Targets:        append([]string(nil), index.Targets...),
				Properties:     []string{property.Name},
				ImplicitTarget: len(index.Targets) == 0,
			}
		}
	}
	for _, index := range value.Definition.Indexes {
		result[index.Name] = indexDeclaration{
			Name: index.Name, Type: index.Type,
			Targets:        append([]string(nil), index.Targets...),
			Properties:     append([]string(nil), index.Properties...),
			ImplicitTarget: len(index.Targets) == 0,
		}
	}
	_ = owner
	return result
}

func equalIndexDeclaration(left, right indexDeclaration) bool {
	leftJSON, _ := json.Marshal(left)
	rightJSON, _ := json.Marshal(right)
	return string(leftJSON) == string(rightJSON)
}

func collectSnapshotIndexes(base *snapshot) (map[string]logicalIndex, error) {
	result := map[string]logicalIndex{}
	for ref, record := range base.Definitions {
		declarations := objectIndexDeclarations(ref, ObjectValue{Kind: ref.Kind, Definition: &record.Value})
		for name, declaration := range declarations {
			logical := logicalIndex{
				Name: name, Type: declaration.Type,
				Properties: append([]string(nil), declaration.Properties...),
			}
			if declaration.ImplicitTarget {
				logical.Targets = []OntologyRef{ref}
			} else {
				for _, raw := range declaration.Targets {
					target, err := ParseOntologyRef(raw)
					if err != nil {
						return nil, consistencyWrap("decode shared Index target", err)
					}
					logical.Targets = append(logical.Targets, target)
				}
			}
			sort.Slice(logical.Targets, func(i, j int) bool { return logical.Targets[i].String() < logical.Targets[j].String() })
			logical.Hidden = indexHiddenOptions(record.Value, name)
			if existing, ok := result[name]; ok {
				if !equalLogicalIndex(existing, logical, true) {
					return nil, publicError(CodeConsistency, "shared Index projections disagree", nil)
				}
				continue
			}
			result[name] = logical
		}
	}
	return result, nil
}

func indexHiddenOptions(definition Definition, name string) map[string]any {
	for _, property := range definition.Properties {
		for _, index := range property.Indexes {
			if index.Name == name {
				return cloneAnyMap(index.hiddenOptions)
			}
		}
	}
	for _, index := range definition.Indexes {
		if index.Name == name {
			return cloneAnyMap(index.hiddenOptions)
		}
	}
	return nil
}

func equalLogicalIndex(left, right logicalIndex, includeHidden bool) bool {
	if left.Name != right.Name || left.Type != right.Type || strings.Join(left.Properties, "\x00") != strings.Join(right.Properties, "\x00") {
		return false
	}
	if len(left.Targets) != len(right.Targets) {
		return false
	}
	for index := range left.Targets {
		if left.Targets[index] != right.Targets[index] {
			return false
		}
	}
	if includeHidden {
		leftJSON, _ := json.Marshal(left.Hidden)
		rightJSON, _ := json.Marshal(right.Hidden)
		return string(leftJSON) == string(rightJSON)
	}
	return true
}

func containsOntologyRef(values []OntologyRef, target OntologyRef) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func (plan *plannedState) sortedObjects() []OntologyRef {
	refs := make([]OntologyRef, 0, len(plan.Objects))
	for ref := range plan.Objects {
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool {
		return string(refs[i].Kind)+"\x00"+refs[i].String() < string(refs[j].Kind)+"\x00"+refs[j].String()
	})
	return refs
}
