package kernel

import (
	"bytes"
	"context"
	"encoding/json"
	"sort"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type mergeConflictProjection struct {
	Public   MergeConflict
	ToNative func(json.RawMessage) (json.RawMessage, error)
}

type mergeOntologyLocation struct {
	Ref          OntologyRef
	Category     string
	PropertyName string
}

type mergeInternalRelationshipLocation struct {
	Ref        OntologyRef
	Path       string
	RelatedRef string
	Type       string
}

func populateMergeConflictSides(
	public *MergeConflict,
	native lithograph.MergeConflict,
	oursRef string,
	oursValue json.RawMessage,
	oursOK bool,
	theirsRef string,
	theirsValue json.RawMessage,
	theirsOK bool,
) error {
	if oursRef != "" {
		public.OursRef = oursRef
	}
	if theirsRef != "" {
		public.TheirsRef = theirsRef
	}
	if nativeMergeValuePresent(native.Ours) {
		if !oursOK || len(oursValue) == 0 {
			return unsafeMergeProjectionError()
		}
		public.Ours = cloneMergeRaw(oursValue)
	}
	if nativeMergeValuePresent(native.Theirs) {
		if !theirsOK || len(theirsValue) == 0 {
			return unsafeMergeProjectionError()
		}
		public.Theirs = cloneMergeRaw(theirsValue)
	}
	return nil
}

func populateOntologyMergeConflictSides(
	public *MergeConflict,
	native lithograph.MergeConflict,
	oursSnapshot *snapshot,
	oursRef OntologyRef,
	oursOK bool,
	theirsSnapshot *snapshot,
	theirsRef OntologyRef,
	theirsOK bool,
	path string,
) (json.RawMessage, json.RawMessage, bool, bool, error) {
	var oursValue, theirsValue json.RawMessage
	oursValueOK := false
	theirsValueOK := false
	oursPublicRef := ""
	theirsPublicRef := ""
	if oursOK {
		oursValue, oursValueOK = publicOntologyMergeValue(oursSnapshot, oursRef, path)
		if mergeOntologyObjectExists(oursSnapshot, oursRef) {
			oursPublicRef = oursRef.String()
		}
	}
	if theirsOK {
		theirsValue, theirsValueOK = publicOntologyMergeValue(theirsSnapshot, theirsRef, path)
		if mergeOntologyObjectExists(theirsSnapshot, theirsRef) {
			theirsPublicRef = theirsRef.String()
		}
	}
	if err := populateMergeConflictSides(
		public,
		native,
		oursPublicRef,
		oursValue,
		oursValueOK,
		theirsPublicRef,
		theirsValue,
		theirsValueOK,
	); err != nil {
		return nil, nil, false, false, err
	}
	return oursValue, theirsValue, oursValueOK, theirsValueOK, nil
}

func (service *Service) populateKnowledgeMergeConflictSides(
	ctx context.Context,
	public *MergeConflict,
	native lithograph.MergeConflict,
	ref ObjectRef,
	path string,
	oursState string,
	theirsState string,
) (json.RawMessage, json.RawMessage, bool, bool, error) {
	oursValue, oursOK, err := service.publicKnowledgeMergeValue(ctx, oursState, ref, path)
	if err != nil {
		return nil, nil, false, false, err
	}
	theirsValue, theirsOK, err := service.publicKnowledgeMergeValue(ctx, theirsState, ref, path)
	if err != nil {
		return nil, nil, false, false, err
	}
	oursRef := ""
	if oursOK {
		oursRef = ref.String()
	}
	theirsRef := ""
	if theirsOK {
		theirsRef = ref.String()
	}
	if err := populateMergeConflictSides(
		public,
		native,
		oursRef,
		oursValue,
		oursOK,
		theirsRef,
		theirsValue,
		theirsOK,
	); err != nil {
		return nil, nil, false, false, err
	}
	return oursValue, theirsValue, oursOK, theirsOK, nil
}

func projectSideMatchingMergeConflict(
	public MergeConflict,
	native lithograph.MergeConflict,
) (mergeConflictProjection, error) {
	convert := sideMatchingNativeToPublic(native, public.Ours, public.Theirs)
	if err := projectNativeMergeResolution(&public, native.Resolution, convert); err != nil {
		return mergeConflictProjection{}, err
	}
	return mergeConflictProjection{
		Public:   public,
		ToNative: sideMatchingPublicToNative(native, public.Ours, public.Theirs, true),
	}, nil
}

func projectKnownNativeMergeSide(
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
	raw json.RawMessage,
) (json.RawMessage, bool) {
	if !nativeMergeValuePresent(raw) {
		return json.RawMessage("null"), true
	}
	if equalMergeJSON(raw, native.Ours) && len(oursPublic) != 0 {
		return cloneMergeRaw(oursPublic), true
	}
	if equalMergeJSON(raw, native.Theirs) && len(theirsPublic) != 0 {
		return cloneMergeRaw(theirsPublic), true
	}
	return nil, false
}

func projectOrDecodeNativeMergeObject(
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
	raw json.RawMessage,
) (json.RawMessage, map[string]json.RawMessage, bool, error) {
	if projected, ok := projectKnownNativeMergeSide(native, oursPublic, theirsPublic, raw); ok {
		return projected, nil, true, nil
	}
	object, err := mergeJSONObject(raw)
	if err != nil {
		return nil, nil, false, unsafeMergeProjectionError()
	}
	return nil, object, false, nil
}

func nativeMergeObjectProjector(
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
	decode func(map[string]json.RawMessage) (json.RawMessage, error),
) func(json.RawMessage) (json.RawMessage, error) {
	return func(raw json.RawMessage) (json.RawMessage, error) {
		projected, object, resolved, err := projectOrDecodeNativeMergeObject(
			native, oursPublic, theirsPublic, raw,
		)
		if err != nil {
			return nil, err
		}
		if resolved {
			return projected, nil
		}
		return decode(object)
	}
}

func (service *Service) loadMergeConflictProjections(
	ctx context.Context,
	session string,
	revision int64,
	oursState string,
	theirsState string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
	wanted map[string]struct{},
) (map[string]mergeConflictProjection, error) {
	result := make(map[string]mergeConflictProjection, len(wanted))
	if len(wanted) == 0 {
		return result, nil
	}
	var cursor *string
	for {
		page, err := service.database.MergeConflicts(ctx, session, maxEvolutionLimit, cursor)
		if err != nil {
			return nil, mergePublicError(err)
		}
		if page.Revision != revision {
			return nil, publicError(CodeMergeSessionChanged, "Merge Session revision changed", nil)
		}
		if page.Ours != oursState || page.Theirs != theirsState {
			return nil, publicError(CodeInternal, "Lithograph Merge Session changed pinned State inputs", nil)
		}
		for _, native := range page.Items {
			if _, ok := wanted[native.ConflictID]; !ok {
				continue
			}
			projection, projectErr := service.projectMergeConflict(
				ctx, native, oursState, theirsState, oursSnapshot, theirsSnapshot,
			)
			if projectErr != nil {
				return nil, projectErr
			}
			result[native.ConflictID] = projection
		}
		if len(result) == len(wanted) || page.Cursor == nil {
			break
		}
		next := *page.Cursor
		cursor = &next
	}
	return result, nil
}

func findMergeOntologyLocation(state *snapshot, elementID string) (mergeOntologyLocation, bool) {
	if state == nil {
		return mergeOntologyLocation{}, false
	}
	for name, record := range state.Domains {
		if record.ElementID == elementID {
			return mergeOntologyLocation{Ref: OntologyRef{Kind: KindDomain, Name: name}, Category: domainLabel}, true
		}
	}
	for ref, record := range state.Definitions {
		if record.ElementID == elementID {
			return mergeOntologyLocation{Ref: ref, Category: definitionBindingLabel}, true
		}
		for property, id := range record.PropertyElementIDs {
			if id == elementID {
				return mergeOntologyLocation{Ref: ref, Category: propertyBindingLabel, PropertyName: property}, true
			}
		}
	}
	return mergeOntologyLocation{}, false
}

func findMergeInternalRelationshipLocation(
	state *snapshot,
	elementID string,
) (mergeInternalRelationshipLocation, bool) {
	if state == nil {
		return mergeInternalRelationshipLocation{}, false
	}
	relationship, ok := state.internalRelationships[elementID]
	if !ok {
		return mergeInternalRelationshipLocation{}, false
	}
	source, sourceOK := findMergeOntologyLocation(state, relationship.Start)
	target, targetOK := findMergeOntologyLocation(state, relationship.End)
	if !sourceOK || !targetOK {
		return mergeInternalRelationshipLocation{}, false
	}
	switch relationship.Type {
	case includesType:
		if source.Category != domainLabel {
			return mergeInternalRelationshipLocation{}, false
		}
		return mergeInternalRelationshipLocation{
			Ref: source.Ref, Path: "/includes", RelatedRef: target.Ref.String(), Type: includesType,
		}, true
	case propertyOfType:
		if source.Category != propertyBindingLabel || target.Category != definitionBindingLabel || source.Ref != target.Ref {
			return mergeInternalRelationshipLocation{}, false
		}
		return mergeInternalRelationshipLocation{Ref: target.Ref, Path: "/properties", Type: propertyOfType}, true
	default:
		return mergeInternalRelationshipLocation{}, false
	}
}

func publicOntologyMergeValue(
	state *snapshot,
	ref OntologyRef,
	path string,
) (json.RawMessage, bool) {
	var value ObjectValue
	switch ref.Kind {
	case KindDomain:
		record := state.Domains[ref.Name]
		if record == nil {
			return nil, false
		}
		domain := cloneDomain(record.Value)
		value = ObjectValue{Kind: KindDomain, Domain: &domain}
	case KindNodeDefinition, KindRelationshipDefinition:
		record := state.Definitions[ref]
		if record == nil {
			return nil, false
		}
		definition := cloneDefinition(record.Value)
		value = ObjectValue{Kind: ref.Kind, Definition: &definition}
	default:
		return nil, false
	}
	if path == "" {
		return cloneMergeRaw(publicObjectRaw(value)), true
	}
	field := strings.TrimPrefix(path, "/")
	if field == path || strings.Contains(field, "/") {
		return nil, false
	}
	raw, ok := publicObjectFields(value)[field]
	if !ok {
		return nil, false
	}
	return cloneMergeRaw(raw), true
}

func mergeOntologyObjectExists(state *snapshot, ref OntologyRef) bool {
	if state == nil {
		return false
	}
	if ref.Kind == KindDomain {
		return state.Domains[ref.Name] != nil
	}
	return state.Definitions[ref] != nil
}

func (service *Service) publicKnowledgeMergeValue(
	ctx context.Context,
	state string,
	ref ObjectRef,
	path string,
) (json.RawMessage, bool, error) {
	value, exists, err := service.readPublicKnowledgeForDiff(ctx, state, ref)
	if err != nil {
		return nil, false, err
	}
	if !exists {
		return nil, false, nil
	}
	if path == "" {
		return publicObjectRaw(value), true, nil
	}
	fields := publicObjectFields(value)
	raw, ok := fields[strings.TrimPrefix(path, "/")]
	if !ok {
		return nil, true, nil
	}
	return cloneMergeRaw(raw), true, nil
}

func projectNativeMergeResolution(
	public *MergeConflict,
	raw json.RawMessage,
	valueProjector func(json.RawMessage) (json.RawMessage, error),
) error {
	if !nativeMergeValuePresent(raw) {
		return nil
	}
	object, err := mergeJSONObject(raw)
	if err != nil {
		return unsafeMergeProjectionError()
	}
	var choice string
	if json.Unmarshal(object["choice"], &choice) != nil {
		return unsafeMergeProjectionError()
	}
	resolution := &MergeConflictResolution{Choice: choice}
	switch choice {
	case "ours", "theirs":
		if _, hasValue := object["value"]; hasValue {
			return unsafeMergeProjectionError()
		}
	case "value":
		value, ok := object["value"]
		if !ok {
			return unsafeMergeProjectionError()
		}
		projected, projectErr := valueProjector(value)
		if projectErr != nil {
			return projectErr
		}
		resolution.Value = projected
	default:
		return unsafeMergeProjectionError()
	}
	public.Resolution = resolution
	return nil
}

func sideMatchingNativeToPublic(
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
) func(json.RawMessage) (json.RawMessage, error) {
	return func(raw json.RawMessage) (json.RawMessage, error) {
		if !nativeMergeValuePresent(raw) {
			return json.RawMessage("null"), nil
		}
		if nativeMergeValuePresent(native.Ours) && equalMergeJSON(raw, native.Ours) && len(oursPublic) != 0 {
			return cloneMergeRaw(oursPublic), nil
		}
		if nativeMergeValuePresent(native.Theirs) && equalMergeJSON(raw, native.Theirs) && len(theirsPublic) != 0 {
			return cloneMergeRaw(theirsPublic), nil
		}
		return nil, unsafeMergeProjectionError()
	}
}

func sideMatchingPublicToNative(
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
	allowNull bool,
) func(json.RawMessage) (json.RawMessage, error) {
	return func(value json.RawMessage) (json.RawMessage, error) {
		return matchPublicValueToNativeSides(value, native, oursPublic, theirsPublic, allowNull)
	}
}

func matchPublicValueToNativeSides(
	value json.RawMessage,
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
	allowNull bool,
) (json.RawMessage, error) {
	if allowNull && isJSONNull(value) {
		return json.RawMessage("null"), nil
	}
	if len(oursPublic) != 0 && equalMergeJSON(value, oursPublic) && nativeMergeValuePresent(native.Ours) {
		return cloneMergeRaw(native.Ours), nil
	}
	if len(theirsPublic) != 0 && equalMergeJSON(value, theirsPublic) && nativeMergeValuePresent(native.Theirs) {
		return cloneMergeRaw(native.Theirs), nil
	}
	return nil, unsafeMergeResolutionValueError()
}

func firstPresentNativeMergeValue(values ...json.RawMessage) (json.RawMessage, error) {
	for _, value := range values {
		if nativeMergeValuePresent(value) {
			return cloneMergeRaw(value), nil
		}
	}
	return nil, unsafeMergeResolutionValueError()
}

func nativeMergeValuePresent(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) != 0 && !bytes.Equal(trimmed, []byte("null"))
}

func isJSONNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

func cloneMergeRaw(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return nil
	}
	return append(json.RawMessage(nil), raw...)
}

func mergeJSONObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if json.Unmarshal(raw, &object) != nil || object == nil {
		return nil, unsafeMergeProjectionError()
	}
	return object, nil
}

func equalMergeJSON(left, right json.RawMessage) bool {
	if len(left) == 0 || len(right) == 0 {
		return len(bytes.TrimSpace(left)) == 0 && len(bytes.TrimSpace(right)) == 0
	}
	var leftValue any
	var rightValue any
	if json.Unmarshal(left, &leftValue) != nil || json.Unmarshal(right, &rightValue) != nil {
		return false
	}
	leftCanonical, _ := json.Marshal(leftValue)
	rightCanonical, _ := json.Marshal(rightValue)
	return bytes.Equal(leftCanonical, rightCanonical)
}

func togglePublicStringSet(base json.RawMessage, value string, present bool) (json.RawMessage, error) {
	var values []string
	if len(base) != 0 && !isJSONNull(base) {
		if json.Unmarshal(base, &values) != nil {
			return nil, unsafeMergeProjectionError()
		}
	}
	set := make(map[string]struct{}, len(values)+1)
	for _, item := range values {
		set[item] = struct{}{}
	}
	if present {
		set[value] = struct{}{}
	} else {
		delete(set, value)
	}
	values = values[:0]
	for item := range set {
		values = append(values, item)
	}
	sort.Strings(values)
	body, _ := json.Marshal(values)
	return body, nil
}

func stringSetContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func knowledgePropertyAggregateMappers(
	native lithograph.MergeConflict,
	property string,
	oursRaw json.RawMessage,
	theirsRaw json.RawMessage,
) (
	func(json.RawMessage) (json.RawMessage, error),
	func(json.RawMessage) (json.RawMessage, error),
	error,
) {
	ours, err := decodeMergeKnowledgeProperties(oursRaw)
	if err != nil {
		return nil, nil, err
	}
	theirs, err := decodeMergeKnowledgeProperties(theirsRaw)
	if err != nil {
		return nil, nil, err
	}
	delete(ours, property)
	delete(theirs, property)
	oursRemainder, _ := json.Marshal(ours)
	theirsRemainder, _ := json.Marshal(theirs)
	if !equalMergeJSON(oursRemainder, theirsRemainder) {
		return nil, nil, unsafeMergeProjectionError()
	}
	common := cloneMergeRawMap(ours)
	toPublic := func(raw json.RawMessage) (json.RawMessage, error) {
		result := cloneMergeRawMap(common)
		if nativeMergeValuePresent(raw) {
			canonical, _, normalizeErr := normalizeKnowledgePropertyRaw(raw)
			if normalizeErr != nil {
				return nil, unsafeMergeProjectionError()
			}
			result[property] = canonical
		}
		return json.Marshal(result)
	}
	toNative := func(value json.RawMessage) (json.RawMessage, error) {
		properties, decodeErr := decodeMergeKnowledgeProperties(value)
		if decodeErr != nil {
			return nil, decodeErr
		}
		selected, present := properties[property]
		delete(properties, property)
		remainder, _ := json.Marshal(properties)
		commonRaw, _ := json.Marshal(common)
		if !equalMergeJSON(remainder, commonRaw) {
			return nil, unsafeMergeResolutionValueError()
		}
		if !present {
			return json.RawMessage("null"), nil
		}
		canonical, _, normalizeErr := normalizeKnowledgePropertyRaw(selected)
		if normalizeErr != nil {
			return nil, normalizeErr
		}
		return canonical, nil
	}
	return toPublic, toNative, nil
}

func knowledgeLabelAggregateMappers(
	native lithograph.MergeConflict,
	label string,
	oursRaw json.RawMessage,
	theirsRaw json.RawMessage,
) (
	func(json.RawMessage) (json.RawMessage, error),
	func(json.RawMessage) (json.RawMessage, error),
	error,
) {
	ours, err := decodeMergeLabels(oursRaw)
	if err != nil {
		return nil, nil, err
	}
	theirs, err := decodeMergeLabels(theirsRaw)
	if err != nil {
		return nil, nil, err
	}
	ours = withoutMergeString(ours, label)
	theirs = withoutMergeString(theirs, label)
	if !sameMergeStrings(ours, theirs) {
		return nil, nil, unsafeMergeProjectionError()
	}
	common := append([]string(nil), ours...)
	toPublic := func(raw json.RawMessage) (json.RawMessage, error) {
		values := append([]string(nil), common...)
		if nativeMergeValuePresent(raw) {
			values = append(values, label)
			sort.Strings(values)
		}
		return json.Marshal(values)
	}
	toNative := func(value json.RawMessage) (json.RawMessage, error) {
		labels, decodeErr := decodeMergeLabels(value)
		if decodeErr != nil {
			return nil, decodeErr
		}
		present := stringSetContains(labels, label)
		if !sameMergeStrings(withoutMergeString(labels, label), common) {
			return nil, unsafeMergeResolutionValueError()
		}
		if present {
			return json.RawMessage("true"), nil
		}
		return json.RawMessage("null"), nil
	}
	return toPublic, toNative, nil
}

func decodeMergeKnowledgeProperties(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var properties map[string]json.RawMessage
	if json.Unmarshal(raw, &properties) != nil || properties == nil {
		return nil, publicError(CodeType, "merge resolution properties must be a JSON object", nil)
	}
	if err := validateKnowledgeProperties(properties); err != nil {
		return nil, err
	}
	return properties, nil
}

func decodeMergeLabels(raw json.RawMessage) ([]string, error) {
	var labels []string
	if json.Unmarshal(raw, &labels) != nil || labels == nil {
		return nil, publicError(CodeType, "merge resolution labels must be a String array", nil)
	}
	if err := normalizeSet(&labels, "labels"); err != nil {
		return nil, err
	}
	for _, item := range labels {
		if err := validateKnowledgeIdentifier(item, "Knowledge Node label"); err != nil {
			return nil, err
		}
	}
	return labels, nil
}

func cloneMergeRawMap(input map[string]json.RawMessage) map[string]json.RawMessage {
	output := make(map[string]json.RawMessage, len(input))
	for key, value := range input {
		output[key] = cloneMergeRaw(value)
	}
	return output
}

func withoutMergeString(values []string, target string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if value != target {
			result = append(result, value)
		}
	}
	return result
}

func sameMergeStrings(left, right []string) bool {
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
