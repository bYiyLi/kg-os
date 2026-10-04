package kernel

import (
	"encoding/json"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func projectKnowledgePropertyMergeConflict(
	public MergeConflict,
	native lithograph.MergeConflict,
	property string,
	oursRaw json.RawMessage,
	theirsRaw json.RawMessage,
) (mergeConflictProjection, error) {
	if err := validateKnowledgeIdentifier(property, "Knowledge Property name"); err != nil {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	ours, err := decodeMergeKnowledgeProperties(oursRaw)
	if err != nil {
		return mergeConflictProjection{}, err
	}
	theirs, err := decodeMergeKnowledgeProperties(theirsRaw)
	if err != nil {
		return mergeConflictProjection{}, err
	}
	oursProperty, oursPresent := ours[property]
	theirsProperty, theirsPresent := theirs[property]
	delete(ours, property)
	delete(theirs, property)
	oursRemainder, _ := json.Marshal(ours)
	theirsRemainder, _ := json.Marshal(theirs)

	var toPublic func(json.RawMessage) (json.RawMessage, error)
	var toNative func(json.RawMessage) (json.RawMessage, error)
	if equalMergeJSON(oursRemainder, theirsRemainder) {
		toPublic, toNative, err = knowledgePropertyAggregateMappers(native, property, oursRaw, theirsRaw)
		if err != nil {
			return mergeConflictProjection{}, err
		}
		public.Base, err = toPublic(native.Base)
	} else {
		// Independent changes outside this slot cannot be represented by one
		// shared aggregate. Address only the exact public Property instead.
		public.Path = "/properties/" + escapeJSONPointer(property)
		public.Ours, err = projectKnowledgePropertySide(native.Ours, oursProperty, oursPresent)
		if err != nil {
			return mergeConflictProjection{}, err
		}
		public.Theirs, err = projectKnowledgePropertySide(native.Theirs, theirsProperty, theirsPresent)
		if err != nil {
			return mergeConflictProjection{}, err
		}
		toPublic = projectKnowledgePropertyScalar
		toNative = knowledgePropertyScalarResolution
		public.Base = nil
		if nativeMergeValuePresent(native.Base) {
			public.Base, err = toPublic(native.Base)
		}
	}
	if err != nil {
		return mergeConflictProjection{}, err
	}
	if err := projectNativeMergeResolution(&public, native.Resolution, toPublic); err != nil {
		return mergeConflictProjection{}, err
	}
	return mergeConflictProjection{Public: public, ToNative: toNative}, nil
}

func projectKnowledgePropertySide(
	native json.RawMessage,
	actual json.RawMessage,
	present bool,
) (json.RawMessage, error) {
	if nativeMergeValuePresent(native) != present {
		return nil, unsafeMergeProjectionError()
	}
	if !present {
		return nil, nil
	}
	return cloneMergeRaw(actual), nil
}

func projectKnowledgePropertyScalar(raw json.RawMessage) (json.RawMessage, error) {
	if isJSONNull(raw) {
		return json.RawMessage("null"), nil
	}
	canonical, _, err := normalizeKnowledgePropertyRaw(raw)
	if err != nil {
		return nil, unsafeMergeProjectionError()
	}
	return canonical, nil
}

func knowledgePropertyScalarResolution(value json.RawMessage) (json.RawMessage, error) {
	if isJSONNull(value) {
		return json.RawMessage("null"), nil
	}
	canonical, _, err := normalizeKnowledgePropertyRaw(value)
	return canonical, err
}
