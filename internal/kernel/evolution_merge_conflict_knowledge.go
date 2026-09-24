package kernel

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) projectMergeConflict(
	ctx context.Context,
	native lithograph.MergeConflict,
	oursState string,
	theirsState string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	switch {
	case strings.HasPrefix(native.Slot, "graph/node/"):
		return service.projectGraphDefinitionConflict(
			native, KindNodeDefinition, strings.TrimPrefix(native.Slot, "graph/node/"),
			oursSnapshot, theirsSnapshot,
		)
	case strings.HasPrefix(native.Slot, "graph/relationship/"):
		return service.projectGraphDefinitionConflict(
			native, KindRelationshipDefinition, strings.TrimPrefix(native.Slot, "graph/relationship/"),
			oursSnapshot, theirsSnapshot,
		)
	case strings.HasPrefix(native.Slot, "constraint/"):
		return service.projectConstraintConflict(
			native, strings.TrimPrefix(native.Slot, "constraint/"), oursSnapshot, theirsSnapshot,
		)
	case strings.HasPrefix(native.Slot, "index/"):
		return service.projectIndexConflict(
			native, strings.TrimPrefix(native.Slot, "index/"), oursSnapshot, theirsSnapshot,
		)
	case strings.HasPrefix(native.Slot, "node/"):
		return service.projectNodeConflict(ctx, native, oursState, theirsState, oursSnapshot, theirsSnapshot)
	case strings.HasPrefix(native.Slot, "relationship/"):
		return service.projectRelationshipConflict(ctx, native, oursState, theirsState, oursSnapshot, theirsSnapshot)
	default:
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
}

func (service *Service) projectNodeConflict(
	ctx context.Context,
	native lithograph.MergeConflict,
	oursState string,
	theirsState string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	rest := strings.TrimPrefix(native.Slot, "node/")
	id := rest
	tail := ""
	if separator := strings.IndexByte(rest, '/'); separator >= 0 {
		id, tail = rest[:separator], rest[separator:]
	}
	if id == "" {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	elementID := "n:" + id
	oursInternal, oursInternalOK := findMergeOntologyLocation(oursSnapshot, elementID)
	theirsInternal, theirsInternalOK := findMergeOntologyLocation(theirsSnapshot, elementID)
	if oursInternalOK || theirsInternalOK {
		return service.projectInternalNodeConflict(
			native, tail, oursInternal, oursInternalOK, theirsInternal, theirsInternalOK,
			oursSnapshot, theirsSnapshot,
		)
	}
	ref, err := ParseObjectRef(elementID)
	if err != nil || ref.Kind != KindKnowledgeNode {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	return service.projectKnowledgeNodeConflict(ctx, native, ref, tail, oursState, theirsState)
}

func (service *Service) projectRelationshipConflict(
	ctx context.Context,
	native lithograph.MergeConflict,
	oursState string,
	theirsState string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	rest := strings.TrimPrefix(native.Slot, "relationship/")
	id := rest
	tail := ""
	if separator := strings.IndexByte(rest, '/'); separator >= 0 {
		id, tail = rest[:separator], rest[separator:]
	}
	if id == "" {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	elementID := "r:" + id
	oursInternal, oursInternalOK := findMergeInternalRelationshipLocation(oursSnapshot, elementID)
	theirsInternal, theirsInternalOK := findMergeInternalRelationshipLocation(theirsSnapshot, elementID)
	if oursInternalOK || theirsInternalOK {
		return service.projectInternalRelationshipConflict(
			native, tail, oursInternal, oursInternalOK, theirsInternal, theirsInternalOK,
			oursSnapshot, theirsSnapshot,
		)
	}
	ref, err := ParseObjectRef(elementID)
	if err != nil || ref.Kind != KindKnowledgeRelationship {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	return service.projectKnowledgeRelationshipConflict(ctx, native, ref, tail, oursState, theirsState)
}

func (service *Service) projectKnowledgeNodeConflict(
	ctx context.Context,
	native lithograph.MergeConflict,
	ref ObjectRef,
	tail string,
	oursState string,
	theirsState string,
) (mergeConflictProjection, error) {
	path := ""
	property := ""
	label := ""
	switch {
	case tail == "":
	case strings.HasPrefix(tail, "/property/"):
		property = strings.TrimPrefix(tail, "/property/")
		if property == "" {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		path = "/properties"
	case strings.HasPrefix(tail, "/label/"):
		label = strings.TrimPrefix(tail, "/label/")
		if label == "" {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		path = "/labels"
	default:
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	public := MergeConflict{
		ConflictID: native.ConflictID, Kind: KindKnowledgeNode, Path: path, nativeSlot: native.Slot,
	}
	oursValue, theirsValue, oursObject, theirsObject, err := service.populateKnowledgeMergeConflictSides(
		ctx,
		&public,
		native,
		ref,
		path,
		oursState,
		theirsState,
	)
	if err != nil {
		return mergeConflictProjection{}, err
	}

	var nativeToPublic func(json.RawMessage) (json.RawMessage, error)
	var toNative func(json.RawMessage) (json.RawMessage, error)
	switch {
	case property != "":
		if !oursObject || !theirsObject {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		nativeToPublic, toNative, err = knowledgePropertyAggregateMappers(
			native, property, oursValue, theirsValue,
		)
		if err != nil {
			return mergeConflictProjection{}, err
		}
		base, convertErr := nativeToPublic(native.Base)
		if convertErr != nil {
			return mergeConflictProjection{}, convertErr
		}
		public.BaseRef = ref.String()
		public.Base = base
	case label != "":
		if !oursObject || !theirsObject {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		nativeToPublic, toNative, err = knowledgeLabelAggregateMappers(
			native, label, oursValue, theirsValue,
		)
		if err != nil {
			return mergeConflictProjection{}, err
		}
		base, convertErr := nativeToPublic(native.Base)
		if convertErr != nil {
			return mergeConflictProjection{}, convertErr
		}
		public.BaseRef = ref.String()
		public.Base = base
	default:
		nativeToPublic = sideMatchingNativeToPublic(native, public.Ours, public.Theirs)
		toNative = sideMatchingPublicToNative(native, public.Ours, public.Theirs, true)
	}
	if err := projectNativeMergeResolution(&public, native.Resolution, nativeToPublic); err != nil {
		return mergeConflictProjection{}, err
	}
	return mergeConflictProjection{Public: public, ToNative: toNative}, nil
}

func (service *Service) projectKnowledgeRelationshipConflict(
	ctx context.Context,
	native lithograph.MergeConflict,
	ref ObjectRef,
	tail string,
	oursState string,
	theirsState string,
) (mergeConflictProjection, error) {
	property := ""
	path := ""
	if strings.HasPrefix(tail, "/property/") {
		property = strings.TrimPrefix(tail, "/property/")
		if property == "" {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		path = "/properties"
	} else if tail != "" {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	} else {
		path = nativeRelationshipPublicPath(native.Ours, native.Theirs)
	}
	public := MergeConflict{
		ConflictID: native.ConflictID, Kind: KindKnowledgeRelationship, Path: path, nativeSlot: native.Slot,
	}
	oursValue, theirsValue, oursObject, theirsObject, err := service.populateKnowledgeMergeConflictSides(
		ctx,
		&public,
		native,
		ref,
		path,
		oursState,
		theirsState,
	)
	if err != nil {
		return mergeConflictProjection{}, err
	}

	if property != "" {
		if !oursObject || !theirsObject {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		convert, toNative, mapErr := knowledgePropertyAggregateMappers(
			native, property, oursValue, theirsValue,
		)
		if mapErr != nil {
			return mergeConflictProjection{}, mapErr
		}
		base, convertErr := convert(native.Base)
		if convertErr != nil {
			return mergeConflictProjection{}, convertErr
		}
		public.BaseRef = ref.String()
		public.Base = base
		if err := projectNativeMergeResolution(&public, native.Resolution, convert); err != nil {
			return mergeConflictProjection{}, err
		}
		return mergeConflictProjection{Public: public, ToNative: toNative}, nil
	}

	nativeToPublic := relationshipNativeToPublic(path, native, public.Ours, public.Theirs)
	if nativeMergeValuePresent(native.Base) {
		if base, convertErr := nativeToPublic(native.Base); convertErr == nil {
			public.Base = base
		}
	}
	if err := projectNativeMergeResolution(&public, native.Resolution, nativeToPublic); err != nil {
		return mergeConflictProjection{}, err
	}
	return mergeConflictProjection{
		Public:   public,
		ToNative: relationshipPublicToNative(path, native, public.Ours, public.Theirs),
	}, nil
}

func nativeRelationshipPublicPath(ours, theirs json.RawMessage) string {
	if !nativeMergeValuePresent(ours) || !nativeMergeValuePresent(theirs) {
		return ""
	}
	left, leftErr := mergeJSONObject(ours)
	right, rightErr := mergeJSONObject(theirs)
	if leftErr != nil || rightErr != nil {
		return ""
	}
	paths := make([]string, 0, 3)
	for _, entry := range []struct {
		native string
		public string
	}{{"type", "/type"}, {"source", "/start"}, {"target", "/end"}} {
		if !equalMergeJSON(left[entry.native], right[entry.native]) {
			paths = append(paths, entry.public)
		}
	}
	if len(paths) == 1 {
		return paths[0]
	}
	return ""
}

func relationshipNativeToPublic(
	path string,
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
) func(json.RawMessage) (json.RawMessage, error) {
	return nativeMergeObjectProjector(native, oursPublic, theirsPublic, func(
		object map[string]json.RawMessage,
	) (json.RawMessage, error) {
		field := ""
		switch path {
		case "/type":
			field = "type"
		case "/start":
			field = "source"
		case "/end":
			field = "target"
		default:
			return nil, unsafeMergeProjectionError()
		}
		value := object[field]
		if len(value) == 0 {
			return nil, unsafeMergeProjectionError()
		}
		return cloneMergeRaw(value), nil
	})
}

func relationshipPublicToNative(
	path string,
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
) func(json.RawMessage) (json.RawMessage, error) {
	return func(value json.RawMessage) (json.RawMessage, error) {
		if isJSONNull(value) && path == "" {
			return json.RawMessage("null"), nil
		}
		if matched, err := matchPublicValueToNativeSides(value, native, oursPublic, theirsPublic, path == ""); err == nil {
			return matched, nil
		}
		if path == "" {
			return nil, unsafeMergeResolutionValueError()
		}
		template, err := firstPresentNativeMergeValue(native.Ours, native.Theirs)
		if err != nil {
			return nil, unsafeMergeResolutionValueError()
		}
		object, err := mergeJSONObject(template)
		if err != nil {
			return nil, unsafeMergeResolutionValueError()
		}
		var text string
		if json.Unmarshal(value, &text) != nil || text == "" {
			return nil, publicError(CodeType, "Knowledge Relationship structural merge resolution must be a non-empty String", nil)
		}
		switch path {
		case "/type":
			if err := validateKnowledgeIdentifier(text, "Knowledge Relationship type"); err != nil {
				return nil, err
			}
			object["type"], _ = json.Marshal(text)
		case "/start", "/end":
			ref, parseErr := ParseObjectRef(text)
			if parseErr != nil || ref.Kind != KindKnowledgeNode {
				return nil, publicError(CodeType, "Knowledge Relationship endpoint merge resolution must reference a Knowledge Node", parseErr)
			}
			field := "source"
			if path == "/end" {
				field = "target"
			}
			object[field], _ = json.Marshal(text)
		default:
			return nil, unsafeMergeResolutionValueError()
		}
		return json.Marshal(object)
	}
}
