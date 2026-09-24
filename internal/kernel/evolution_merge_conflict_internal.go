package kernel

import (
	"encoding/json"
	"strings"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) projectInternalNodeConflict(
	native lithograph.MergeConflict,
	tail string,
	ours mergeOntologyLocation,
	oursOK bool,
	theirs mergeOntologyLocation,
	theirsOK bool,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	location := ours
	if !oursOK {
		location = theirs
	}
	if oursOK && theirsOK && (ours.Ref.Kind != theirs.Ref.Kind || ours.Category != theirs.Category) {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	path := ""
	directScalar := false
	switch {
	case tail == "":
		if location.Category == propertyBindingLabel {
			path = "/properties"
		}
	case strings.HasPrefix(tail, "/label/"):
		if location.Category == propertyBindingLabel {
			path = "/properties"
		}
	case strings.HasPrefix(tail, "/property/"):
		key := strings.TrimPrefix(tail, "/property/")
		switch location.Category {
		case domainLabel, definitionBindingLabel:
			switch key {
			case internalNameProperty:
				path = "/name"
				directScalar = true
			case internalTitleProperty:
				path = "/title"
				directScalar = true
			case internalDescriptionProperty:
				path = "/description"
				directScalar = true
			default:
				return mergeConflictProjection{}, unsafeMergeProjectionError()
			}
		case propertyBindingLabel:
			if key != internalNameProperty && key != internalTitleProperty && key != internalDescriptionProperty {
				return mergeConflictProjection{}, unsafeMergeProjectionError()
			}
			path = "/properties"
		default:
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
	default:
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	public := MergeConflict{
		ConflictID: native.ConflictID, Kind: location.Ref.Kind, Path: path, nativeSlot: native.Slot,
	}
	_, _, _, _, err := populateOntologyMergeConflictSides(
		&public,
		native,
		oursSnapshot,
		ours.Ref,
		oursOK,
		theirsSnapshot,
		theirs.Ref,
		theirsOK,
		path,
	)
	if err != nil {
		return mergeConflictProjection{}, err
	}
	if directScalar {
		if nativeMergeValuePresent(native.Base) {
			public.Base = cloneMergeRaw(native.Base)
			if path == "/name" {
				var baseName string
				if json.Unmarshal(native.Base, &baseName) == nil &&
					validatePublicName(baseName, "name") == nil {
					public.BaseRef = OntologyRef{Kind: location.Ref.Kind, Name: baseName}.String()
				}
			}
		}
		if err := projectNativeMergeResolution(
			&public,
			native.Resolution,
			func(raw json.RawMessage) (json.RawMessage, error) { return cloneMergeRaw(raw), nil },
		); err != nil {
			return mergeConflictProjection{}, err
		}
		return mergeConflictProjection{
			Public: public,
			ToNative: func(value json.RawMessage) (json.RawMessage, error) {
				if path == "/title" || path == "/description" {
					if isJSONNull(value) {
						return json.RawMessage("null"), nil
					}
					var text string
					if json.Unmarshal(value, &text) != nil {
						return nil, publicError(CodeType, "merge resolution value must be a String or null", nil)
					}
					body, _ := json.Marshal(text)
					return body, nil
				}
				var name string
				if json.Unmarshal(value, &name) != nil {
					return nil, publicError(CodeType, "merge resolution name must be a String", nil)
				}
				if err := validatePublicName(name, "name"); err != nil {
					return nil, err
				}
				body, _ := json.Marshal(name)
				return body, nil
			},
		}, nil
	}
	return projectSideMatchingMergeConflict(public, native)
}

func (service *Service) projectInternalRelationshipConflict(
	native lithograph.MergeConflict,
	tail string,
	ours mergeInternalRelationshipLocation,
	oursOK bool,
	theirs mergeInternalRelationshipLocation,
	theirsOK bool,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	if tail != "" {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	location := ours
	if !oursOK {
		location = theirs
	}
	if oursOK && theirsOK && (ours.Ref != theirs.Ref || ours.Path != theirs.Path || ours.Type != theirs.Type) {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	public := MergeConflict{
		ConflictID: native.ConflictID, Kind: location.Ref.Kind, Path: location.Path, nativeSlot: native.Slot,
	}
	if location.RelatedRef != "" {
		public.RelatedRefs = []string{location.RelatedRef}
	}
	_, _, _, _, err := populateOntologyMergeConflictSides(
		&public,
		native,
		oursSnapshot,
		ours.Ref,
		oursOK,
		theirsSnapshot,
		theirs.Ref,
		theirsOK,
		location.Path,
	)
	if err != nil {
		return mergeConflictProjection{}, err
	}
	if location.Type == includesType && location.RelatedRef != "" {
		baseSet := cloneMergeRaw(public.Ours)
		if len(baseSet) == 0 {
			baseSet = cloneMergeRaw(public.Theirs)
		}
		convert := func(raw json.RawMessage) (json.RawMessage, error) {
			return togglePublicStringSet(baseSet, location.RelatedRef, nativeMergeValuePresent(raw))
		}
		if err := projectNativeMergeResolution(&public, native.Resolution, convert); err != nil {
			return mergeConflictProjection{}, err
		}
		return mergeConflictProjection{
			Public: public,
			ToNative: func(value json.RawMessage) (json.RawMessage, error) {
				var includes []string
				if json.Unmarshal(value, &includes) != nil {
					return nil, publicError(CodeType, "merge resolution includes must be a String array", nil)
				}
				if err := normalizeSet(&includes, "includes"); err != nil {
					return nil, err
				}
				if !stringSetContains(includes, location.RelatedRef) {
					return json.RawMessage("null"), nil
				}
				return firstPresentNativeMergeValue(native.Ours, native.Theirs)
			},
		}, nil
	}
	return projectSideMatchingMergeConflict(public, native)
}
