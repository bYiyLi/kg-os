package kernel

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type ontologyVersionObject struct {
	Ref         OntologyRef
	Value       ObjectValue
	Identity    string
	PropertyIDs map[string]string
}

type sharedIndexVersion struct {
	Index      Index
	Refs       []OntologyRef
	Identities []string
	Paths      map[string]string
}

func (service *Service) EvolutionDiff(ctx context.Context, request EvolutionDiffRequest) (EvolutionDiffResult, error) {
	limit, err := evolutionLimit(request.Limit)
	if err != nil {
		return EvolutionDiffResult{}, err
	}
	if err := validateEvolutionScope(request.Scope, request.Object); err != nil {
		return EvolutionDiffResult{}, err
	}
	if err := validateStateRef(request.Before); err != nil {
		return EvolutionDiffResult{}, err
	}
	if err := validateStateRef(request.After); err != nil {
		return EvolutionDiffResult{}, err
	}
	before := ""
	after := ""
	anchorIdentity := ""
	resolvedAnchor := ""
	lastKey := ""
	offset := 0
	if request.Cursor != "" {
		cursor, decodeErr := decodeEvolutionCursor(request.Cursor)
		if decodeErr != nil {
			return EvolutionDiffResult{}, decodeErr
		}
		expectedAnchorRef := ""
		expectedObjectRef := ""
		if request.Object != nil {
			expectedAnchorRef = request.Object.AnchorState
			expectedObjectRef = request.Object.Ref
		}
		if cursor.Op != "diff" || cursor.BeforeRef != request.Before || cursor.AfterRef != request.After ||
			cursor.Scope != request.Scope || cursor.AnchorRef != expectedAnchorRef || cursor.Ref != expectedObjectRef ||
			cursor.Before == "" || cursor.After == "" || cursor.Offset < 1 || cursor.LastKey == "" {
			return EvolutionDiffResult{}, publicError(CodeInvalidArgument, "cursor does not match Diff inputs", nil)
		}
		before = cursor.Before
		after = cursor.After
		resolvedAnchor = cursor.Anchor
		offset = cursor.Offset
		lastKey = cursor.LastKey
	} else {
		before, err = service.resolveValidEvolutionState(ctx, request.Before)
		if err != nil {
			return EvolutionDiffResult{}, err
		}
		after, err = service.resolveValidEvolutionState(ctx, request.After)
		if err != nil {
			return EvolutionDiffResult{}, err
		}
		if request.Object != nil {
			resolvedAnchor, err = service.resolveValidEvolutionState(ctx, request.Object.AnchorState)
			if err != nil {
				return EvolutionDiffResult{}, err
			}
		}
	}
	if request.Object != nil {
		if resolvedAnchor != before && resolvedAnchor != after {
			return EvolutionDiffResult{}, publicError(CodeInvalidArgument, "Diff object anchorState must resolve to before or after", nil)
		}
		anchorIdentity, err = service.resolvePublicObjectIdentity(ctx, resolvedAnchor, request.Object.Ref)
		if err != nil {
			return EvolutionDiffResult{}, err
		}
	}
	changes, err := service.projectEvolutionDiff(ctx, before, after)
	if err != nil {
		return EvolutionDiffResult{}, err
	}
	changes = filterEvolutionChanges(changes, request.Scope, anchorIdentity)
	sort.Slice(changes, func(i, j int) bool { return changeKey(changes[i]) < changeKey(changes[j]) })

	start := offset
	if start, err = validatedChangeOffset(changes, start, lastKey, "Diff"); err != nil {
		return EvolutionDiffResult{}, err
	}
	end := start + limit
	if end > len(changes) {
		end = len(changes)
	}
	page := append([]Change(nil), changes[start:end]...)
	next := ""
	if end < len(changes) && len(page) > 0 {
		expectedAnchorRef := ""
		expectedObjectRef := ""
		if request.Object != nil {
			expectedAnchorRef = request.Object.AnchorState
			expectedObjectRef = request.Object.Ref
		}
		next, err = encodeEvolutionCursor(evolutionCursor{
			Version: 1, Op: "diff", BeforeRef: request.Before, Before: before,
			AfterRef: request.After, After: after, Scope: request.Scope,
			AnchorRef: expectedAnchorRef, Anchor: resolvedAnchor, Ref: expectedObjectRef,
			Offset: end, LastKey: changeKey(page[len(page)-1]),
		})
		if err != nil {
			return EvolutionDiffResult{}, err
		}
	}
	clearChangeInternals(page)
	return EvolutionDiffResult{Before: before, After: after, Items: page, Cursor: next}, nil
}

func (service *Service) projectEvolutionDiff(ctx context.Context, before, after string) ([]Change, error) {
	beforeSnapshot, err := service.decodeResolvedSnapshot(ctx, before)
	if err != nil {
		return nil, sanitizedConsistencyError(err)
	}
	afterSnapshot, err := service.decodeResolvedSnapshot(ctx, after)
	if err != nil {
		return nil, sanitizedConsistencyError(err)
	}
	patch, err := service.database.Diff(ctx, before, after)
	if err != nil {
		return nil, AsPublicError(err)
	}
	if patch.From != before || patch.To != after {
		return nil, publicError(CodeInternal, "Lithograph Diff did not preserve pinned State inputs", nil)
	}

	changes := projectOntologyChanges(beforeSnapshot, afterSnapshot)
	knowledge, err := service.projectKnowledgeChanges(ctx, before, after, patch)
	if err != nil {
		return nil, err
	}
	changes = append(changes, knowledge...)
	sort.Slice(changes, func(i, j int) bool { return changeKey(changes[i]) < changeKey(changes[j]) })
	return changes, nil
}

func projectOntologyChanges(before, after *snapshot) []Change {
	left := ontologyObjectsByIdentity(before)
	right := ontologyObjectsByIdentity(after)
	ids := make([]string, 0, len(left)+len(right))
	seen := map[string]struct{}{}
	for id := range left {
		seen[id] = struct{}{}
		ids = append(ids, id)
	}
	for id := range right {
		if _, ok := seen[id]; !ok {
			ids = append(ids, id)
		}
	}
	sort.Strings(ids)
	changes := make([]Change, 0)
	for _, id := range ids {
		beforeObject, hasBefore := left[id]
		afterObject, hasAfter := right[id]
		switch {
		case hasBefore && !hasAfter:
			changes = append(changes, wholeObjectChange("delete", beforeObject, ontologyVersionObject{}))
		case !hasBefore && hasAfter:
			changes = append(changes, wholeObjectChange("add", ontologyVersionObject{}, afterObject))
		case hasBefore && hasAfter:
			if beforeObject.Ref.String() != afterObject.Ref.String() {
				changes = append(changes, wholeObjectChange("rename", beforeObject, afterObject))
				continue
			}
			changes = append(changes, compareOntologyAggregate(beforeObject, afterObject)...)
		}
	}
	changes = append(changes, projectSharedIndexes(before, after)...)
	return changes
}

func ontologyObjectsByIdentity(value *snapshot) map[string]ontologyVersionObject {
	objects := make(map[string]ontologyVersionObject, len(value.Domains)+len(value.Definitions))
	for name, record := range value.Domains {
		ref := OntologyRef{Kind: KindDomain, Name: name}
		copyValue := cloneDomain(record.Value)
		objects[record.ElementID] = ontologyVersionObject{
			Ref: ref, Value: ObjectValue{Kind: KindDomain, Domain: &copyValue}, Identity: record.ElementID,
		}
	}
	for ref, record := range value.Definitions {
		definition := cloneDefinition(record.Value)
		objects[record.ElementID] = ontologyVersionObject{
			Ref: ref, Value: ObjectValue{Kind: ref.Kind, Definition: &definition}, Identity: record.ElementID,
			PropertyIDs: cloneStringMap(record.PropertyElementIDs),
		}
	}
	return objects
}

func cloneStringMap(input map[string]string) map[string]string {
	output := make(map[string]string, len(input))
	for key, value := range input {
		output[key] = value
	}
	return output
}

func wholeObjectChange(kind string, before, after ontologyVersionObject) Change {
	change := Change{Change: kind, Path: ""}
	if before.Identity != "" {
		change.Kind = before.Ref.Kind
		change.BeforeRef = before.Ref.String()
		change.Before = publicObjectRaw(before.Value)
		change.identity = before.Identity
	}
	if after.Identity != "" {
		change.Kind = after.Ref.Kind
		change.AfterRef = after.Ref.String()
		change.After = publicObjectRaw(after.Value)
		change.identity = after.Identity
	}
	return change
}

func compareOntologyAggregate(before, after ontologyVersionObject) []Change {
	left := publicObjectFieldsWithoutIndexes(before.Value)
	right := publicObjectFieldsWithoutIndexes(after.Value)
	fieldSet := map[string]struct{}{}
	for key := range left {
		if key != "name" {
			fieldSet[key] = struct{}{}
		}
	}
	for key := range right {
		if key != "name" {
			fieldSet[key] = struct{}{}
		}
	}
	fields := make([]string, 0, len(fieldSet))
	for key := range fieldSet {
		fields = append(fields, key)
	}
	sort.Strings(fields)
	changes := make([]Change, 0)
	for _, field := range fields {
		leftValue, leftOK := left[field]
		rightValue, rightOK := right[field]
		if leftOK && rightOK && bytes.Equal(leftValue, rightValue) {
			continue
		}
		kind := "update"
		if field == "labels" || field == "from" || field == "to" || field == "includes" {
			kind = "restructure"
		}
		if field == "properties" && propertyNamesByIdentityChanged(before.PropertyIDs, after.PropertyIDs) {
			kind = "rename"
		}
		change := Change{
			Change: kind, Kind: before.Ref.Kind, Path: "/" + escapeJSONPointer(field),
			BeforeRef: before.Ref.String(), AfterRef: after.Ref.String(), identity: before.Identity,
		}
		if leftOK {
			change.Before = append(json.RawMessage(nil), leftValue...)
		}
		if rightOK {
			change.After = append(json.RawMessage(nil), rightValue...)
		}
		changes = append(changes, change)
	}
	return changes
}

func propertyNamesByIdentityChanged(left, right map[string]string) bool {
	reverse := func(values map[string]string) map[string]string {
		out := make(map[string]string, len(values))
		for name, id := range values {
			out[id] = name
		}
		return out
	}
	a, b := reverse(left), reverse(right)
	for id, leftName := range a {
		if rightName, ok := b[id]; ok && rightName != leftName {
			return true
		}
	}
	return false
}

func projectSharedIndexes(before, after *snapshot) []Change {
	left := sharedIndexes(before)
	right := sharedIndexes(after)
	nameSet := map[string]struct{}{}
	for name := range left {
		nameSet[name] = struct{}{}
	}
	for name := range right {
		nameSet[name] = struct{}{}
	}
	names := make([]string, 0, len(nameSet))
	for name := range nameSet {
		names = append(names, name)
	}
	sort.Strings(names)
	changes := make([]Change, 0)
	for _, name := range names {
		beforeIndex, hasBefore := left[name]
		afterIndex, hasAfter := right[name]
		beforeRaw := evolutionIndexRaw(beforeIndex.Index)
		afterRaw := evolutionIndexRaw(afterIndex.Index)
		if hasBefore && hasAfter && bytes.Equal(beforeRaw, afterRaw) && sameOntologyRefs(beforeIndex.Refs, afterIndex.Refs) {
			continue
		}
		refs := unionOntologyRefs(beforeIndex.Refs, afterIndex.Refs)
		if len(refs) == 0 {
			continue
		}
		anchor := refs[0]
		path := ""
		if hasAfter {
			path = afterIndex.Paths[anchor.String()]
		}
		if path == "" && hasBefore {
			path = beforeIndex.Paths[anchor.String()]
		}
		if path == "" {
			path = "/indexes"
		}
		changeKind := "update"
		if hasBefore && hasAfter {
			beforePath := beforeIndex.Paths[anchor.String()]
			afterPath := afterIndex.Paths[anchor.String()]
			if beforePath != "" && afterPath != "" && beforePath != afterPath {
				changeKind = "restructure"
			}
		}
		change := Change{Change: changeKind, Kind: anchor.Kind, Path: path}
		if hasBefore && containsEvolutionOntologyRef(beforeIndex.Refs, anchor) {
			change.BeforeRef = anchor.String()
			change.Before = beforeRaw
		}
		if hasAfter && containsEvolutionOntologyRef(afterIndex.Refs, anchor) {
			change.AfterRef = anchor.String()
			change.After = afterRaw
		}
		for _, ref := range refs[1:] {
			change.RelatedRefs = append(change.RelatedRefs, ref.String())
		}
		identities := append([]string(nil), beforeIndex.Identities...)
		identities = append(identities, afterIndex.Identities...)
		sort.Strings(identities)
		change.identity = strings.Join(uniqueStrings(identities), "\x00")
		changes = append(changes, change)
	}
	return changes
}

func sharedIndexes(value *snapshot) map[string]sharedIndexVersion {
	result := map[string]sharedIndexVersion{}
	for ref, record := range value.Definitions {
		for _, index := range record.Value.Indexes {
			appendIndexVersion(result, ref, record.ElementID, index, "/indexes")
		}
		for _, property := range record.Value.Properties {
			for _, index := range property.Indexes {
				appendIndexVersion(result, ref, record.ElementID, index, "/properties")
			}
		}
	}
	for name, entry := range result {
		sort.Slice(entry.Refs, func(i, j int) bool { return entry.Refs[i].String() < entry.Refs[j].String() })
		entry.Refs = uniqueOntologyRefs(entry.Refs)
		sort.Strings(entry.Identities)
		entry.Identities = uniqueStrings(entry.Identities)
		result[name] = entry
	}
	return result
}

func appendIndexVersion(
	result map[string]sharedIndexVersion,
	ref OntologyRef,
	identity string,
	index Index,
	path string,
) {
	entry := result[index.Name]
	if len(entry.Refs) == 0 {
		entry.Index = index
	}
	if entry.Paths == nil {
		entry.Paths = map[string]string{}
	}
	entry.Refs = append(entry.Refs, ref)
	entry.Identities = append(entry.Identities, identity)
	entry.Paths[ref.String()] = path
	result[index.Name] = entry
}

func (service *Service) projectKnowledgeChanges(ctx context.Context, before, after string, patch lithograph.Patch) ([]Change, error) {
	refs, err := changedKnowledgeRefs(patch)
	if err != nil {
		return nil, err
	}
	changes := make([]Change, 0)
	for _, ref := range refs {
		parsed, err := ParseObjectRef(ref)
		if err != nil {
			return nil, publicError(CodeInternal, "Lithograph Diff returned an invalid element identity", err)
		}
		left, leftOK, err := service.readPublicKnowledgeForDiff(ctx, before, parsed)
		if err != nil {
			return nil, err
		}
		right, rightOK, err := service.readPublicKnowledgeForDiff(ctx, after, parsed)
		if err != nil {
			return nil, err
		}
		switch {
		case leftOK && !rightOK:
			changes = append(changes, Change{
				Change: "delete", Kind: parsed.Kind, Path: "", BeforeRef: ref,
				Before: publicObjectRaw(left), identity: ref,
			})
		case !leftOK && rightOK:
			changes = append(changes, Change{
				Change: "add", Kind: parsed.Kind, Path: "", AfterRef: ref,
				After: publicObjectRaw(right), identity: ref,
			})
		case leftOK && rightOK:
			changes = append(changes, compareKnowledgeObject(ref, parsed.Kind, left, right)...)
		}
	}
	return changes, nil
}

func changedKnowledgeRefs(patch lithograph.Patch) ([]string, error) {
	set := map[string]struct{}{}
	for _, raw := range patch.Operations {
		var operation map[string]json.RawMessage
		if err := json.Unmarshal(raw, &operation); err != nil {
			return nil, publicError(CodeInternal, "decode Lithograph Diff operation", err)
		}
		var op string
		if err := json.Unmarshal(operation["op"], &op); err != nil || op == "" {
			return nil, publicError(CodeInternal, "Lithograph Diff operation is missing op", err)
		}
		switch op {
		case "SetSchema", "CreateIndex", "DropIndex", "SetIndex":
			continue
		}
		var elementID string
		switch op {
		case "AddNode", "DeleteNode", "AddLabel", "RemoveLabel":
			value := operation["elementId"]
			if len(value) == 0 || json.Unmarshal(value, &elementID) != nil || !strings.HasPrefix(elementID, "n:") {
				return nil, publicError(CodeInternal, "Lithograph Diff node operation has invalid elementId", nil)
			}
		case "AddRelationship", "DeleteRelationship":
			value := operation["elementId"]
			if len(value) == 0 || json.Unmarshal(value, &elementID) != nil || !strings.HasPrefix(elementID, "r:") {
				return nil, publicError(CodeInternal, "Lithograph Diff graph operation has invalid elementId", nil)
			}
		case "SetProperty", "RemoveProperty":
			var owner string
			if err := json.Unmarshal(operation["owner"], &owner); err != nil || owner == "" {
				return nil, publicError(CodeInternal, "Lithograph Diff property operation has invalid owner", err)
			}
			switch {
			case strings.HasPrefix(owner, "node/"):
				elementID = "n:" + strings.TrimPrefix(owner, "node/")
			case strings.HasPrefix(owner, "relationship/"):
				elementID = "r:" + strings.TrimPrefix(owner, "relationship/")
			default:
				return nil, publicError(CodeInternal, "Lithograph Diff property operation has invalid owner", nil)
			}
		default:
			return nil, publicError(CodeInternal, "Lithograph Diff returned an unknown operation family", nil)
		}
		if !strings.HasPrefix(elementID, "n:") && !strings.HasPrefix(elementID, "r:") {
			return nil, publicError(CodeInternal, "Lithograph Diff graph operation has invalid element identity", nil)
		}
		if _, err := ParseObjectRef(elementID); err != nil {
			return nil, publicError(CodeInternal, "Lithograph Diff graph operation has invalid element identity", err)
		}
		set[elementID] = struct{}{}
	}
	refs := make([]string, 0, len(set))
	for ref := range set {
		refs = append(refs, ref)
	}
	sort.Strings(refs)
	return refs, nil
}

func (service *Service) readPublicKnowledgeForDiff(ctx context.Context, state string, ref ObjectRef) (ObjectValue, bool, error) {
	value, err := service.readKnowledgeObject(ctx, state, ref)
	if err == nil {
		return value, true, nil
	}
	public := AsPublicError(err)
	if public.Code == CodeObjectNotFound || errors.Is(err, errInternalKnowledgeObject) {
		return ObjectValue{}, false, nil
	}
	return ObjectValue{}, false, err
}

func compareKnowledgeObject(ref string, kind ObjectKind, before, after ObjectValue) []Change {
	left := publicObjectFields(before)
	right := publicObjectFields(after)
	fieldSet := map[string]struct{}{}
	for key := range left {
		fieldSet[key] = struct{}{}
	}
	for key := range right {
		fieldSet[key] = struct{}{}
	}
	fields := make([]string, 0, len(fieldSet))
	for key := range fieldSet {
		fields = append(fields, key)
	}
	sort.Strings(fields)
	changes := make([]Change, 0)
	for _, field := range fields {
		leftRaw, leftOK := left[field]
		rightRaw, rightOK := right[field]
		if leftOK && rightOK && bytes.Equal(leftRaw, rightRaw) {
			continue
		}
		changeKind := "update"
		if field == "labels" || field == "type" || field == "start" || field == "end" {
			changeKind = "restructure"
		}
		change := Change{
			Change: changeKind, Kind: kind, Path: "/" + escapeJSONPointer(field),
			BeforeRef: ref, AfterRef: ref, identity: ref,
		}
		if leftOK {
			change.Before = append(json.RawMessage(nil), leftRaw...)
		}
		if rightOK {
			change.After = append(json.RawMessage(nil), rightRaw...)
		}
		changes = append(changes, change)
	}
	return changes
}

func (service *Service) resolvePublicObjectIdentity(ctx context.Context, state, rawRef string) (string, error) {
	ref, err := ParseObjectRef(rawRef)
	if err != nil {
		return "", err
	}
	if ontologyRef, ok := ref.Ontology(); ok {
		snapshot, decodeErr := service.decodeResolvedSnapshot(ctx, state)
		if decodeErr != nil {
			return "", sanitizedConsistencyError(decodeErr)
		}
		switch ontologyRef.Kind {
		case KindDomain:
			record := snapshot.Domains[ontologyRef.Name]
			if record == nil {
				return "", objectNotFound(ontologyRef)
			}
			return record.ElementID, nil
		case KindNodeDefinition, KindRelationshipDefinition:
			record := snapshot.Definitions[ontologyRef]
			if record == nil {
				return "", objectNotFound(ontologyRef)
			}
			return record.ElementID, nil
		}
	}
	if _, err := service.readKnowledgeObject(ctx, state, ref); err != nil {
		return "", err
	}
	return ref.String(), nil
}

func filterEvolutionChanges(changes []Change, scope, anchorIdentity string) []Change {
	if scope == "all" && anchorIdentity == "" {
		return changes
	}
	filtered := make([]Change, 0, len(changes))
	for _, change := range changes {
		include := false
		switch scope {
		case "all":
			include = true
		case "ontology":
			include = change.Kind == KindDomain || change.Kind == KindNodeDefinition || change.Kind == KindRelationshipDefinition
		case "knowledge":
			include = change.Kind == KindKnowledgeNode || change.Kind == KindKnowledgeRelationship
		case "object":
			if change.identity == anchorIdentity {
				include = true
			} else if strings.Contains(change.identity, "\x00") {
				for _, identity := range strings.Split(change.identity, "\x00") {
					if identity == anchorIdentity {
						include = true
						break
					}
				}
			}
		}
		if include {
			filtered = append(filtered, change)
		}
	}
	return filtered
}

func publicObjectRaw(value ObjectValue) json.RawMessage {
	body, err := RenderObjectJSON(value)
	if err != nil {
		return nil
	}
	return append(json.RawMessage(nil), bytes.TrimSpace(body)...)
}

func publicObjectFields(value ObjectValue) map[string]json.RawMessage {
	body := publicObjectRaw(value)
	fields := map[string]json.RawMessage{}
	_ = json.Unmarshal(body, &fields)
	return fields
}

func publicObjectFieldsWithoutIndexes(value ObjectValue) map[string]json.RawMessage {
	if value.Definition == nil {
		return publicObjectFields(value)
	}
	definition := cloneDefinition(*value.Definition)
	definition.Indexes = nil
	for index := range definition.Properties {
		definition.Properties[index].Indexes = nil
	}
	return publicObjectFields(ObjectValue{Kind: value.Kind, Definition: &definition})
}

func evolutionIndexRaw(value Index) json.RawMessage {
	body, _ := json.Marshal(value)
	var object map[string]any
	if json.Unmarshal(body, &object) != nil {
		return body
	}
	if configuration := evolutionIndexConfiguration(value); len(configuration) != 0 {
		object["configuration"] = configuration
	}
	body, _ = json.Marshal(object)
	return body
}

func evolutionIndexConfiguration(value Index) map[string]any {
	indexConfig, ok := value.hiddenOptions["indexConfig"].(map[string]any)
	if !ok {
		return nil
	}
	switch value.Type {
	case "fulltext":
		analyzer, ok := indexConfig["fulltext.analyzer"].(string)
		if !ok || analyzer == "" {
			return nil
		}
		return map[string]any{"analyzer": analyzer}
	case "vector":
		return cloneAnyMap(indexConfig)
	default:
		return nil
	}
}

func sameOntologyRefs(left, right []OntologyRef) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func unionOntologyRefs(left, right []OntologyRef) []OntologyRef {
	byString := map[string]OntologyRef{}
	for _, ref := range left {
		byString[ref.String()] = ref
	}
	for _, ref := range right {
		byString[ref.String()] = ref
	}
	keys := make([]string, 0, len(byString))
	for key := range byString {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	refs := make([]OntologyRef, 0, len(keys))
	for _, key := range keys {
		refs = append(refs, byString[key])
	}
	return refs
}

func uniqueOntologyRefs(values []OntologyRef) []OntologyRef {
	if len(values) == 0 {
		return values
	}
	output := values[:1]
	for _, value := range values[1:] {
		if value != output[len(output)-1] {
			output = append(output, value)
		}
	}
	return output
}

func containsEvolutionOntologyRef(refs []OntologyRef, target OntologyRef) bool {
	for _, ref := range refs {
		if ref == target {
			return true
		}
	}
	return false
}

func uniqueStrings(values []string) []string {
	if len(values) == 0 {
		return values
	}
	output := values[:1]
	for _, value := range values[1:] {
		if value != output[len(output)-1] {
			output = append(output, value)
		}
	}
	return output
}

func escapeJSONPointer(value string) string {
	value = strings.ReplaceAll(value, "~", "~0")
	return strings.ReplaceAll(value, "/", "~1")
}

func clearChangeInternals(changes []Change) {
	for index := range changes {
		changes[index].identity = ""
	}
}
