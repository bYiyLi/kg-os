package kernel

import (
	"encoding/json"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func (service *Service) projectGraphDefinitionConflict(
	native lithograph.MergeConflict,
	kind ObjectKind,
	name string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	if name == "" || len(name) >= len(reservedPrefix) && name[:len(reservedPrefix)] == reservedPrefix {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	ref := OntologyRef{Kind: kind, Name: name}
	oursRecord := oursSnapshot.Definitions[ref]
	theirsRecord := theirsSnapshot.Definitions[ref]
	if oursRecord == nil && theirsRecord == nil {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	path := graphDefinitionConflictPath(oursRecord, theirsRecord)
	public := MergeConflict{
		ConflictID: native.ConflictID,
		Kind:       kind,
		Path:       path,
		nativeSlot: native.Slot,
	}
	oursValue, oursOK := publicOntologyMergeValue(oursSnapshot, ref, path)
	theirsValue, theirsOK := publicOntologyMergeValue(theirsSnapshot, ref, path)
	if oursRecord != nil {
		public.OursRef = ref.String()
	}
	if theirsRecord != nil {
		public.TheirsRef = ref.String()
	}
	if nativeMergeValuePresent(native.Ours) {
		if !oursOK {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		public.Ours = oursValue
	}
	if nativeMergeValuePresent(native.Theirs) {
		if !theirsOK {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		public.Theirs = theirsValue
	}
	convert := graphDefinitionNativeToPublic(path, native, public.Ours, public.Theirs)
	if nativeMergeValuePresent(native.Base) {
		if base, err := convert(native.Base); err == nil {
			public.Base = base
		}
	}
	if err := projectNativeMergeResolution(&public, native.Resolution, convert); err != nil {
		return mergeConflictProjection{}, err
	}
	return mergeConflictProjection{
		Public: public,
		ToNative: graphDefinitionPublicToNative(
			path, kind, name, native, public.Ours, public.Theirs,
		),
	}, nil
}

func graphDefinitionConflictPath(left, right *definitionRecord) string {
	if left == nil || right == nil {
		return ""
	}
	paths := make([]string, 0, 3)
	if left.Value.Kind == KindNodeDefinition {
		leftLabels, _ := json.Marshal(left.Value.Labels)
		rightLabels, _ := json.Marshal(right.Value.Labels)
		if !equalMergeJSON(leftLabels, rightLabels) {
			paths = append(paths, "/labels")
		}
	} else {
		leftFrom, _ := json.Marshal(left.Value.From)
		rightFrom, _ := json.Marshal(right.Value.From)
		if !equalMergeJSON(leftFrom, rightFrom) {
			paths = append(paths, "/from")
		}
		leftTo, _ := json.Marshal(left.Value.To)
		rightTo, _ := json.Marshal(right.Value.To)
		if !equalMergeJSON(leftTo, rightTo) {
			paths = append(paths, "/to")
		}
	}
	if !equalMergeJSON(
		graphPropertySignature(left.Value.Properties),
		graphPropertySignature(right.Value.Properties),
	) {
		paths = append(paths, "/properties")
	}
	if len(paths) == 1 {
		return paths[0]
	}
	return ""
}

func graphPropertySignature(properties []Property) json.RawMessage {
	type signature struct {
		Name     string `json:"name"`
		Type     string `json:"type"`
		Required bool   `json:"required"`
	}
	values := make([]signature, 0, len(properties))
	for _, property := range properties {
		values = append(values, signature{
			Name: property.Name, Type: property.Type, Required: property.Required,
		})
	}
	body, _ := json.Marshal(values)
	return body
}

func graphDefinitionNativeToPublic(
	path string,
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
) func(json.RawMessage) (json.RawMessage, error) {
	return nativeMergeObjectProjector(native, oursPublic, theirsPublic, func(
		object map[string]json.RawMessage,
	) (json.RawMessage, error) {
		switch path {
		case "/labels":
			labels := object["implied_labels"]
			if len(labels) == 0 || !json.Valid(labels) {
				return nil, unsafeMergeProjectionError()
			}
			var values []string
			if json.Unmarshal(labels, &values) != nil {
				return nil, unsafeMergeProjectionError()
			}
			body, _ := json.Marshal(values)
			return body, nil
		case "/from", "/to":
			field := "source_label"
			if path == "/to" {
				field = "target_label"
			}
			label := object[field]
			if len(label) == 0 {
				return nil, unsafeMergeProjectionError()
			}
			if isJSONNull(label) {
				return json.RawMessage("null"), nil
			}
			var target string
			if json.Unmarshal(label, &target) != nil || target == "" {
				return nil, unsafeMergeProjectionError()
			}
			body, _ := json.Marshal(OntologyRef{
				Kind: KindNodeDefinition, Name: target,
			}.String())
			return body, nil
		default:
			return nil, unsafeMergeProjectionError()
		}
	})
}

func graphDefinitionPublicToNative(
	path string,
	kind ObjectKind,
	name string,
	native lithograph.MergeConflict,
	oursPublic json.RawMessage,
	theirsPublic json.RawMessage,
) func(json.RawMessage) (json.RawMessage, error) {
	return func(value json.RawMessage) (json.RawMessage, error) {
		if matched, err := matchPublicValueToNativeSides(
			value, native, oursPublic, theirsPublic, path == "",
		); err == nil {
			return matched, nil
		}
		template, err := firstPresentNativeMergeValue(native.Ours, native.Theirs)
		if err != nil {
			return nil, unsafeMergeResolutionValueError()
		}
		object, err := mergeJSONObject(template)
		if err != nil {
			return nil, unsafeMergeResolutionValueError()
		}
		switch path {
		case "/labels":
			if kind != KindNodeDefinition {
				return nil, unsafeMergeResolutionValueError()
			}
			var labels []string
			if json.Unmarshal(value, &labels) != nil {
				return nil, publicError(
					CodeType, "merge resolution labels must be a String array", nil,
				)
			}
			if err := normalizeSet(&labels, "labels"); err != nil {
				return nil, err
			}
			for _, label := range labels {
				if err := validatePublicName(label, "label"); err != nil {
					return nil, err
				}
				if label == name {
					return nil, publicError(
						CodeType,
						"labels must not repeat the identifying label",
						nil,
					)
				}
			}
			object["implied_labels"], _ = json.Marshal(labels)
		case "/from", "/to":
			if kind != KindRelationshipDefinition {
				return nil, unsafeMergeResolutionValueError()
			}
			field := "source_label"
			if path == "/to" {
				field = "target_label"
			}
			if isJSONNull(value) {
				object[field] = json.RawMessage("null")
				break
			}
			var rawRef string
			if json.Unmarshal(value, &rawRef) != nil {
				return nil, publicError(
					CodeType,
					"Relationship endpoint merge resolution must be a Node Definition Ref or null",
					nil,
				)
			}
			ref, parseErr := ParseOntologyRef(rawRef)
			if parseErr != nil || ref.Kind != KindNodeDefinition {
				return nil, publicError(
					CodeType,
					"Relationship endpoint merge resolution must be a Node Definition Ref or null",
					parseErr,
				)
			}
			object[field], _ = json.Marshal(ref.Name)
		default:
			return nil, unsafeMergeResolutionValueError()
		}
		return json.Marshal(object)
	}
}
