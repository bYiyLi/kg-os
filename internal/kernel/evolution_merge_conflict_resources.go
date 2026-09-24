package kernel

import (
	"encoding/json"
	"sort"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

type publicConstraintLocation struct {
	Ref  OntologyRef
	Path string
}

func (service *Service) projectConstraintConflict(
	native lithograph.MergeConflict,
	name string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	oursLocation, oursOK := findPublicConstraintLocation(oursSnapshot, name)
	theirsLocation, theirsOK := findPublicConstraintLocation(theirsSnapshot, name)
	if !oursOK && !theirsOK {
		fallback, ok := inferPropertyConflictLocation(oursSnapshot, theirsSnapshot)
		if !ok {
			return mergeConflictProjection{}, unsafeMergeProjectionError()
		}
		oursLocation, theirsLocation = fallback, fallback
		oursOK = mergeOntologyObjectExists(oursSnapshot, fallback.Ref)
		theirsOK = mergeOntologyObjectExists(theirsSnapshot, fallback.Ref)
	}
	location := oursLocation
	if !oursOK {
		location = theirsLocation
	}
	if oursOK && theirsOK &&
		(oursLocation.Ref.Kind != theirsLocation.Ref.Kind || oursLocation.Path != theirsLocation.Path) {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	public := MergeConflict{
		ConflictID: native.ConflictID,
		Kind:       location.Ref.Kind,
		Path:       location.Path,
		nativeSlot: native.Slot,
	}
	var oursValue, theirsValue json.RawMessage
	oursValueOK := false
	theirsValueOK := false
	oursRef := ""
	theirsRef := ""
	if oursOK {
		oursValue, oursValueOK = publicOntologyMergeValue(oursSnapshot, oursLocation.Ref, location.Path)
		oursRef = oursLocation.Ref.String()
	}
	if theirsOK {
		theirsValue, theirsValueOK = publicOntologyMergeValue(theirsSnapshot, theirsLocation.Ref, location.Path)
		theirsRef = theirsLocation.Ref.String()
	}
	if err := populateMergeConflictSides(
		&public, native,
		oursRef, oursValue, oursValueOK,
		theirsRef, theirsValue, theirsValueOK,
	); err != nil {
		return mergeConflictProjection{}, err
	}
	return projectSideMatchingMergeConflict(public, native)
}

func (service *Service) projectIndexConflict(
	native lithograph.MergeConflict,
	name string,
	oursSnapshot *snapshot,
	theirsSnapshot *snapshot,
) (mergeConflictProjection, error) {
	oursIndexes := sharedIndexes(oursSnapshot)
	theirsIndexes := sharedIndexes(theirsSnapshot)
	oursEntry, oursOK := oursIndexes[name]
	theirsEntry, theirsOK := theirsIndexes[name]
	if !oursOK && !theirsOK {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	refs := unionOntologyRefs(oursEntry.Refs, theirsEntry.Refs)
	if len(refs) == 0 {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	anchor := refs[0]
	path := ""
	if oursOK {
		path = oursEntry.Paths[anchor.String()]
	}
	if path == "" && theirsOK {
		path = theirsEntry.Paths[anchor.String()]
	}
	if path == "" {
		return mergeConflictProjection{}, unsafeMergeProjectionError()
	}
	public := MergeConflict{
		ConflictID: native.ConflictID,
		Kind:       anchor.Kind,
		Path:       path,
		nativeSlot: native.Slot,
	}
	for _, ref := range refs[1:] {
		public.RelatedRefs = append(public.RelatedRefs, ref.String())
	}
	var oursValue, theirsValue json.RawMessage
	oursRef := ""
	theirsRef := ""
	if oursOK {
		oursValue = evolutionIndexRaw(oursEntry.Index)
		if oursEntry.Paths[anchor.String()] != "" {
			oursRef = anchor.String()
		}
	}
	if theirsOK {
		theirsValue = evolutionIndexRaw(theirsEntry.Index)
		if theirsEntry.Paths[anchor.String()] != "" {
			theirsRef = anchor.String()
		}
	}
	if err := populateMergeConflictSides(
		&public, native,
		oursRef, oursValue, oursOK,
		theirsRef, theirsValue, theirsOK,
	); err != nil {
		return mergeConflictProjection{}, err
	}
	return projectSideMatchingMergeConflict(public, native)
}

func findPublicConstraintLocation(state *snapshot, name string) (publicConstraintLocation, bool) {
	refs := make([]OntologyRef, 0, len(state.Definitions))
	for ref := range state.Definitions {
		refs = append(refs, ref)
	}
	sort.Slice(refs, func(i, j int) bool { return refs[i].String() < refs[j].String() })
	for _, ref := range refs {
		definition := state.Definitions[ref].Value
		for _, constraint := range definition.Constraints {
			if constraint.Name == name {
				return publicConstraintLocation{Ref: ref, Path: "/constraints"}, true
			}
		}
		for _, property := range definition.Properties {
			for _, constraint := range property.Constraints {
				if constraint.Name == name {
					return publicConstraintLocation{Ref: ref, Path: "/properties"}, true
				}
			}
			if property.Unique {
				generated, err := lithographGraphConstraintName(
					ref, []string{property.Name}, "unique",
				)
				if err == nil && generated == name {
					return publicConstraintLocation{Ref: ref, Path: "/properties"}, true
				}
			}
		}
	}
	return publicConstraintLocation{}, false
}

func inferPropertyConflictLocation(
	ours *snapshot,
	theirs *snapshot,
) (publicConstraintLocation, bool) {
	refs := map[OntologyRef]struct{}{}
	for ref := range ours.Definitions {
		refs[ref] = struct{}{}
	}
	for ref := range theirs.Definitions {
		refs[ref] = struct{}{}
	}
	candidates := make([]OntologyRef, 0)
	for ref := range refs {
		left := ours.Definitions[ref]
		right := theirs.Definitions[ref]
		if left == nil || right == nil {
			continue
		}
		leftRaw, _ := json.Marshal(left.Value.Properties)
		rightRaw, _ := json.Marshal(right.Value.Properties)
		if !equalMergeJSON(leftRaw, rightRaw) {
			candidates = append(candidates, ref)
		}
	}
	if len(candidates) != 1 {
		return publicConstraintLocation{}, false
	}
	return publicConstraintLocation{Ref: candidates[0], Path: "/properties"}, true
}
