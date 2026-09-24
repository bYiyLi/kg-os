package kernel

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestMergeConflictJSONPreservesNullVsAbsence(t *testing.T) {
	t.Parallel()
	conflict := MergeConflict{
		ConflictID: "nullable",
		Kind:       KindDomain,
		Path:       "/title",
		BaseRef:    "domain/Content",
		OursRef:    "domain/Content",
		TheirsRef:  "domain/Content",
		Base:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`"Theirs"`),
		Resolution: &MergeConflictResolution{
			Choice: "value",
			Value:  json.RawMessage("null"),
		},
	}
	body, err := json.Marshal(conflict)
	if err != nil {
		t.Fatalf("marshal MergeConflict: %v", err)
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil {
		t.Fatalf("decode MergeConflict JSON: %v", err)
	}
	if raw, ok := object["base"]; !ok || string(raw) != "null" {
		t.Fatalf("explicit null base = %s present=%v", raw, ok)
	}
	if _, ok := object["ours"]; ok {
		t.Fatalf("absent ours side was serialized: %s", body)
	}
	var resolution map[string]json.RawMessage
	if err := json.Unmarshal(object["resolution"], &resolution); err != nil {
		t.Fatalf("decode MergeConflict resolution: %v", err)
	}
	if raw, ok := resolution["value"]; !ok || string(raw) != "null" {
		t.Fatalf("explicit null resolution value = %s present=%v", raw, ok)
	}
}

func TestMergeProjectionAggregateHelpers(t *testing.T) {
	t.Parallel()
	native := lithograph.MergeConflict{
		Base:   json.RawMessage(`"Base"`),
		Ours:   json.RawMessage(`"Ours"`),
		Theirs: json.RawMessage(`"Theirs"`),
	}
	toPublic, toNative, err := knowledgePropertyAggregateMappers(
		native,
		"name",
		json.RawMessage(`{"name":"Ours","stable":1}`),
		json.RawMessage(`{"name":"Theirs","stable":1}`),
	)
	if err != nil {
		t.Fatalf("property mappers: %v", err)
	}
	base, err := toPublic(native.Base)
	if err != nil || !equalMergeJSON(base, json.RawMessage(`{"name":"Base","stable":1}`)) {
		t.Fatalf("project base properties = %s err=%v", base, err)
	}
	missing, err := toPublic(json.RawMessage("null"))
	if err != nil || !equalMergeJSON(missing, json.RawMessage(`{"stable":1}`)) {
		t.Fatalf("project missing property = %s err=%v", missing, err)
	}
	selected, err := toNative(json.RawMessage(`{"name":"Merged","stable":1}`))
	if err != nil || string(selected) != `"Merged"` {
		t.Fatalf("reverse property = %s err=%v", selected, err)
	}
	deleted, err := toNative(json.RawMessage(`{"stable":1}`))
	if err != nil || string(deleted) != "null" {
		t.Fatalf("reverse deleted property = %s err=%v", deleted, err)
	}
	if _, err := toNative(json.RawMessage(`{"name":"Merged","stable":2}`)); err == nil ||
		AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("changed non-conflict property error = %v", err)
	}
	if _, _, err := knowledgePropertyAggregateMappers(
		native,
		"name",
		json.RawMessage(`{"name":"Ours","left":1}`),
		json.RawMessage(`{"name":"Theirs","right":1}`),
	); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("divergent property aggregate error = %v", err)
	}
	if _, _, err := knowledgePropertyAggregateMappers(
		native, "name", json.RawMessage("null"), json.RawMessage(`{"name":"x"}`),
	); err == nil || AsPublicError(err).Code != CodeType {
		t.Fatalf("invalid property aggregate error = %v", err)
	}

	labelNative := lithograph.MergeConflict{
		Base: json.RawMessage("true"), Ours: json.RawMessage("true"), Theirs: json.RawMessage("null"),
	}
	labelsToPublic, labelsToNative, err := knowledgeLabelAggregateMappers(
		labelNative,
		"Shared",
		json.RawMessage(`["Common","Shared"]`),
		json.RawMessage(`["Common"]`),
	)
	if err != nil {
		t.Fatalf("label mappers: %v", err)
	}
	without, err := labelsToPublic(json.RawMessage("null"))
	if err != nil || !equalMergeJSON(without, json.RawMessage(`["Common"]`)) {
		t.Fatalf("project labels without target = %s err=%v", without, err)
	}
	with, err := labelsToPublic(json.RawMessage("true"))
	if err != nil || !equalMergeJSON(with, json.RawMessage(`["Common","Shared"]`)) {
		t.Fatalf("project labels with target = %s err=%v", with, err)
	}
	present, err := labelsToNative(json.RawMessage(`["Common","Shared"]`))
	if err != nil || string(present) != "true" {
		t.Fatalf("reverse present label = %s err=%v", present, err)
	}
	absent, err := labelsToNative(json.RawMessage(`["Common"]`))
	if err != nil || string(absent) != "null" {
		t.Fatalf("reverse absent label = %s err=%v", absent, err)
	}
	if _, err := labelsToNative(json.RawMessage(`["Common","Other"]`)); err == nil ||
		AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("changed non-conflict labels error = %v", err)
	}
	if _, _, err := knowledgeLabelAggregateMappers(
		labelNative,
		"Shared",
		json.RawMessage(`["Left","Shared"]`),
		json.RawMessage(`["Right"]`),
	); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("divergent label aggregate error = %v", err)
	}
}

func TestMergeProjectionSideMatchingAndRawHelpers(t *testing.T) {
	t.Parallel()
	native := lithograph.MergeConflict{
		Ours: json.RawMessage("1"), Theirs: json.RawMessage("2"),
	}
	toPublic := sideMatchingNativeToPublic(
		native, json.RawMessage(`"ours"`), json.RawMessage(`"theirs"`),
	)
	if got, err := toPublic(json.RawMessage("1")); err != nil || string(got) != `"ours"` {
		t.Fatalf("native ours projection = %s err=%v", got, err)
	}
	if got, err := toPublic(json.RawMessage("2")); err != nil || string(got) != `"theirs"` {
		t.Fatalf("native theirs projection = %s err=%v", got, err)
	}
	if got, err := toPublic(json.RawMessage("null")); err != nil || string(got) != "null" {
		t.Fatalf("native null projection = %s err=%v", got, err)
	}
	if _, err := toPublic(json.RawMessage("3")); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("unknown native side error = %v", err)
	}
	toNative := sideMatchingPublicToNative(
		native, json.RawMessage(`"ours"`), json.RawMessage(`"theirs"`), true,
	)
	if got, err := toNative(json.RawMessage(`"ours"`)); err != nil || string(got) != "1" {
		t.Fatalf("public ours reverse = %s err=%v", got, err)
	}
	if got, err := toNative(json.RawMessage("null")); err != nil || string(got) != "null" {
		t.Fatalf("public null reverse = %s err=%v", got, err)
	}
	if _, err := toNative(json.RawMessage(`"other"`)); err == nil || AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("unknown public side error = %v", err)
	}
	if got, err := firstPresentNativeMergeValue(nil, json.RawMessage("null"), json.RawMessage("2")); err != nil ||
		string(got) != "2" {
		t.Fatalf("first present native = %s err=%v", got, err)
	}
	if _, err := firstPresentNativeMergeValue(nil, json.RawMessage("null")); err == nil {
		t.Fatal("missing native value was accepted")
	}
	if nativeMergeValuePresent(nil) || nativeMergeValuePresent(json.RawMessage("null")) ||
		!nativeMergeValuePresent(json.RawMessage("false")) {
		t.Fatal("native merge presence classification failed")
	}
	if !isJSONNull(json.RawMessage(" null ")) || isJSONNull(json.RawMessage("0")) {
		t.Fatal("JSON null classification failed")
	}
	if cloneMergeRaw(nil) != nil || string(cloneMergeRaw(json.RawMessage("1"))) != "1" {
		t.Fatal("raw clone failed")
	}
	if _, err := mergeJSONObject(json.RawMessage("[]")); err == nil {
		t.Fatal("non-object merge JSON accepted")
	}
	if !equalMergeJSON(json.RawMessage(`{"b":2,"a":1}`), json.RawMessage(`{"a":1,"b":2}`)) ||
		equalMergeJSON(json.RawMessage("1"), json.RawMessage("2")) {
		t.Fatal("merge JSON equality failed")
	}
	toggled, err := togglePublicStringSet(json.RawMessage(`["A"]`), "B", true)
	if err != nil || !equalMergeJSON(toggled, json.RawMessage(`["A","B"]`)) {
		t.Fatalf("toggle add = %s err=%v", toggled, err)
	}
	toggled, err = togglePublicStringSet(toggled, "A", false)
	if err != nil || !equalMergeJSON(toggled, json.RawMessage(`["B"]`)) {
		t.Fatalf("toggle remove = %s err=%v", toggled, err)
	}
	if !stringSetContains([]string{"A", "B"}, "B") || stringSetContains([]string{"A"}, "B") {
		t.Fatal("string set membership failed")
	}
}

func TestMergeInternalProjectionRenamePropertyAndMembership(t *testing.T) {
	t.Parallel()
	humanRef := OntologyRef{Kind: KindNodeDefinition, Name: "Human"}
	individualRef := OntologyRef{Kind: KindNodeDefinition, Name: "Individual"}
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	ours.Definitions[humanRef] = mergeDefinitionRecord(humanRef, "n:1", "Name")
	theirs.Definitions[individualRef] = mergeDefinitionRecord(individualRef, "n:1", "Name")
	oursLocation, ok := findMergeOntologyLocation(ours, "n:1")
	if !ok || oursLocation.Ref != humanRef {
		t.Fatalf("ours location = %#v ok=%v", oursLocation, ok)
	}
	theirsLocation, ok := findMergeOntologyLocation(theirs, "n:1")
	if !ok || theirsLocation.Ref != individualRef {
		t.Fatalf("theirs location = %#v ok=%v", theirsLocation, ok)
	}
	native := lithograph.MergeConflict{
		ConflictID: "rename",
		Slot:       "node/1/property/__kgos_name",
		Base:       json.RawMessage(`"Person"`),
		Ours:       json.RawMessage(`"Human"`),
		Theirs:     json.RawMessage(`"Individual"`),
		Resolution: json.RawMessage(`{"choice":"value","value":"People"}`),
	}
	projection, err := (&Service{}).projectInternalNodeConflict(
		native, "/property/__kgos_name",
		oursLocation, true, theirsLocation, true, ours, theirs,
	)
	if err != nil {
		t.Fatalf("project rename conflict: %v", err)
	}
	if projection.Public.Path != "/name" ||
		projection.Public.BaseRef != "node:Person" ||
		projection.Public.OursRef != "node:Human" ||
		projection.Public.TheirsRef != "node:Individual" ||
		projection.Public.Resolution == nil ||
		string(projection.Public.Resolution.Value) != `"People"` {
		t.Fatalf("rename projection = %#v", projection.Public)
	}
	if got, err := projection.ToNative(json.RawMessage(`"Citizen"`)); err != nil ||
		string(got) != `"Citizen"` {
		t.Fatalf("rename reverse = %s err=%v", got, err)
	}
	if _, err := projection.ToNative(json.RawMessage(`"__kgos_bad"`)); err == nil ||
		AsPublicError(err).Code != CodeReservedIdentifier {
		t.Fatalf("reserved rename error = %v", err)
	}

	propertyRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	ours.Definitions[propertyRef] = mergeDefinitionRecord(propertyRef, "n:10", "name")
	theirs.Definitions[propertyRef] = mergeDefinitionRecord(propertyRef, "n:10", "name")
	ours.Definitions[propertyRef].PropertyElementIDs["name"] = "n:11"
	theirs.Definitions[propertyRef].PropertyElementIDs["name"] = "n:11"
	propertyOurs, _ := findMergeOntologyLocation(ours, "n:11")
	propertyTheirs, _ := findMergeOntologyLocation(theirs, "n:11")
	propertyConflict := lithograph.MergeConflict{
		ConflictID: "property-binding",
		Slot:       "node/11/property/__kgos_title",
		Ours:       json.RawMessage(`"Ours title"`),
		Theirs:     json.RawMessage(`"Theirs title"`),
	}
	propertyProjection, err := (&Service{}).projectInternalNodeConflict(
		propertyConflict, "/property/__kgos_title",
		propertyOurs, true, propertyTheirs, true, ours, theirs,
	)
	if err != nil || propertyProjection.Public.Path != "/properties" {
		t.Fatalf("property Binding projection = %#v err=%v", propertyProjection.Public, err)
	}
	if got, err := propertyProjection.ToNative(propertyProjection.Public.Ours); err != nil ||
		string(got) != `"Ours title"` {
		t.Fatalf("property Binding reverse = %s err=%v", got, err)
	}

	domainRef := OntologyRef{Kind: KindDomain, Name: "Content"}
	targetRef := OntologyRef{Kind: KindNodeDefinition, Name: "Document"}
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	ours.Domains["Content"] = &domainRecord{
		ElementID: "n:20",
		Value:     Domain{Name: "Content", Includes: []string{targetRef.String()}},
	}
	theirs.Domains["Content"] = &domainRecord{
		ElementID: "n:20",
		Value:     Domain{Name: "Content", Includes: []string{}},
	}
	ours.Definitions[targetRef] = mergeDefinitionRecord(targetRef, "n:21", "title")
	theirs.Definitions[targetRef] = mergeDefinitionRecord(targetRef, "n:21", "title")
	ours.internalRelationships["r:30"] = taggedRelationship{
		ElementID: "r:30", Type: includesType, Start: "n:20", End: "n:21",
		Properties: map[string]json.RawMessage{},
	}
	location, ok := findMergeInternalRelationshipLocation(ours, "r:30")
	if !ok || location.Ref != domainRef || location.RelatedRef != targetRef.String() {
		t.Fatalf("includes location = %#v ok=%v", location, ok)
	}
	membershipProjection, err := (&Service{}).projectInternalRelationshipConflict(
		lithograph.MergeConflict{
			ConflictID: "membership", Slot: "relationship/30",
			Base: json.RawMessage("true"), Ours: json.RawMessage("true"), Theirs: json.RawMessage("null"),
		},
		"", location, true,
		mergeInternalRelationshipLocation{
			Ref: domainRef, Path: "/includes", RelatedRef: targetRef.String(), Type: includesType,
		}, true,
		ours, theirs,
	)
	if err != nil || membershipProjection.Public.Path != "/includes" {
		t.Fatalf("membership projection = %#v err=%v", membershipProjection.Public, err)
	}
	if got, err := membershipProjection.ToNative(json.RawMessage("[]")); err != nil ||
		string(got) != "null" {
		t.Fatalf("membership remove reverse = %s err=%v", got, err)
	}
	if got, err := membershipProjection.ToNative(
		json.RawMessage(`["node:Document"]`),
	); err != nil || string(got) != "true" {
		t.Fatalf("membership keep reverse = %s err=%v", got, err)
	}
}

func TestMergeGraphDefinitionProjectionAndReverseMapping(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	oursRecord := mergeDefinitionRecord(ref, "n:1", "name")
	theirsRecord := mergeDefinitionRecord(ref, "n:1", "name")
	oursRecord.Value.Labels = []string{"Employee"}
	theirsRecord.Value.Labels = []string{"Manager"}
	ours.Definitions[ref] = oursRecord
	theirs.Definitions[ref] = theirsRecord
	native := lithograph.MergeConflict{
		ConflictID: "graph-node",
		Slot:       "graph/node/Person",
		Ours:       json.RawMessage(`{"label":"Person","implied_labels":["Employee"]}`),
		Theirs:     json.RawMessage(`{"label":"Person","implied_labels":["Manager"]}`),
	}
	projection, err := (&Service{}).projectGraphDefinitionConflict(
		native, KindNodeDefinition, "Person", ours, theirs,
	)
	if err != nil || projection.Public.Path != "/labels" ||
		!equalMergeJSON(projection.Public.Ours, json.RawMessage(`["Employee"]`)) ||
		!equalMergeJSON(projection.Public.Theirs, json.RawMessage(`["Manager"]`)) {
		t.Fatalf("Graph Node projection = %#v err=%v", projection.Public, err)
	}
	reversed, err := projection.ToNative(json.RawMessage(`["Contractor"]`))
	if err != nil || !strings.Contains(string(reversed), "Contractor") {
		t.Fatalf("Graph Node reverse = %s err=%v", reversed, err)
	}
	toPublic := graphDefinitionNativeToPublic(
		"/labels", native, projection.Public.Ours, projection.Public.Theirs,
	)
	if got, err := toPublic(json.RawMessage(`{"implied_labels":["Base"]}`)); err != nil ||
		!equalMergeJSON(got, json.RawMessage(`["Base"]`)) {
		t.Fatalf("Graph Node base projection = %s err=%v", got, err)
	}

	relRef := OntologyRef{Kind: KindRelationshipDefinition, Name: "KNOWS"}
	relOurs := mergeDefinitionRecord(relRef, "n:2", "since")
	relTheirs := mergeDefinitionRecord(relRef, "n:2", "since")
	relOurs.Value.From = mergeStringPointer("node:Person")
	relOurs.Value.To = mergeStringPointer("node:Document")
	relTheirs.Value.From = mergeStringPointer("node:Employee")
	relTheirs.Value.To = mergeStringPointer("node:Document")
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	ours.Definitions[relRef] = relOurs
	theirs.Definitions[relRef] = relTheirs
	relNative := lithograph.MergeConflict{
		ConflictID: "graph-rel", Slot: "graph/relationship/KNOWS",
		Ours:   json.RawMessage(`{"relationship_type":"KNOWS","source_label":"Person","target_label":"Document"}`),
		Theirs: json.RawMessage(`{"relationship_type":"KNOWS","source_label":"Employee","target_label":"Document"}`),
	}
	relProjection, err := (&Service{}).projectGraphDefinitionConflict(
		relNative, KindRelationshipDefinition, "KNOWS", ours, theirs,
	)
	if err != nil || relProjection.Public.Path != "/from" ||
		string(relProjection.Public.Ours) != `"node:Person"` ||
		string(relProjection.Public.Theirs) != `"node:Employee"` {
		t.Fatalf("Graph Relationship projection = %#v err=%v", relProjection.Public, err)
	}
	relReversed, err := relProjection.ToNative(json.RawMessage(`"node:Contractor"`))
	if err != nil || !strings.Contains(string(relReversed), `"source_label":"Contractor"`) {
		t.Fatalf("Graph Relationship reverse = %s err=%v", relReversed, err)
	}
	if _, err := relProjection.ToNative(json.RawMessage(`"relationship:BAD"`)); err == nil ||
		AsPublicError(err).Code != CodeType {
		t.Fatalf("invalid Graph endpoint reverse error = %v", err)
	}
}

func TestMergeConstraintAndIndexProjection(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	oursRecord := mergeDefinitionRecord(ref, "n:1", "name")
	theirsRecord := mergeDefinitionRecord(ref, "n:1", "name")
	oursRecord.Value.Constraints = []Constraint{{
		Name: "person_unique", Type: "unique", Properties: []string{"name"},
	}}
	theirsRecord.Value.Constraints = []Constraint{{
		Name: "person_unique", Type: "key", Properties: []string{"name"},
	}}
	ours.Definitions[ref] = oursRecord
	theirs.Definitions[ref] = theirsRecord
	native := lithograph.MergeConflict{
		ConflictID: "constraint", Slot: "constraint/person_unique",
		Ours: json.RawMessage(`{"kind":"unique"}`), Theirs: json.RawMessage(`{"kind":"key"}`),
	}
	projection, err := (&Service{}).projectConstraintConflict(
		native, "person_unique", ours, theirs,
	)
	if err != nil || projection.Public.Path != "/constraints" {
		t.Fatalf("Constraint projection = %#v err=%v", projection.Public, err)
	}
	if got, err := projection.ToNative(projection.Public.Ours); err != nil ||
		!equalMergeJSON(got, native.Ours) {
		t.Fatalf("Constraint reverse = %s err=%v", got, err)
	}
	location, ok := findPublicConstraintLocation(ours, "person_unique")
	if !ok || location.Path != "/constraints" {
		t.Fatalf("Constraint location = %#v ok=%v", location, ok)
	}

	left := mergeProjectorSnapshot()
	right := mergeProjectorSnapshot()
	leftRecord := mergeDefinitionRecord(ref, "n:2", "name")
	rightRecord := mergeDefinitionRecord(ref, "n:2", "name")
	leftRecord.Value.Properties[0].Required = true
	left.Definitions[ref] = leftRecord
	right.Definitions[ref] = rightRecord
	derived, ok := inferPropertyConflictLocation(left, right)
	if !ok || derived.Ref != ref || derived.Path != "/properties" {
		t.Fatalf("inferred property conflict = %#v ok=%v", derived, ok)
	}

	indexOurs := mergeDefinitionRecord(ref, "n:3", "name")
	indexTheirs := mergeDefinitionRecord(ref, "n:3", "name")
	indexOurs.Value.Indexes = []Index{{Name: "person_text", Type: "fulltext", Properties: []string{"name"}}}
	indexTheirs.Value.Indexes = []Index{{Name: "person_text", Type: "range", Properties: []string{"name"}}}
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	ours.Definitions[ref] = indexOurs
	theirs.Definitions[ref] = indexTheirs
	indexNative := lithograph.MergeConflict{
		ConflictID: "index", Slot: "index/person_text",
		Ours: json.RawMessage(`{"kind":"fulltext"}`), Theirs: json.RawMessage(`{"kind":"range"}`),
	}
	indexProjection, err := (&Service{}).projectIndexConflict(
		indexNative, "person_text", ours, theirs,
	)
	if err != nil || indexProjection.Public.Path != "/indexes" {
		t.Fatalf("Index projection = %#v err=%v", indexProjection.Public, err)
	}

	anchorRef := OntologyRef{Kind: KindNodeDefinition, Name: "A"}
	otherRef := OntologyRef{Kind: KindNodeDefinition, Name: "B"}
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	oursOther := mergeDefinitionRecord(otherRef, "n:20", "name")
	theirsAnchor := mergeDefinitionRecord(anchorRef, "n:21", "name")
	oursOther.Value.Indexes = []Index{{
		Name: "moved_text", Type: "fulltext", Properties: []string{"name"},
	}}
	theirsAnchor.Value.Indexes = []Index{{
		Name: "moved_text", Type: "range", Properties: []string{"name"},
	}}
	ours.Definitions[otherRef] = oursOther
	theirs.Definitions[anchorRef] = theirsAnchor
	movedProjection, err := (&Service{}).projectIndexConflict(
		lithograph.MergeConflict{
			ConflictID: "moved-index", Slot: "index/moved_text",
			Ours:   json.RawMessage(`{"kind":"fulltext"}`),
			Theirs: json.RawMessage(`{"kind":"range"}`),
		},
		"moved_text",
		ours,
		theirs,
	)
	if err != nil {
		t.Fatalf("moved Index projection: %v", err)
	}
	if movedProjection.Public.Path != "/indexes" ||
		movedProjection.Public.OursRef != "" ||
		movedProjection.Public.TheirsRef != "node:A" ||
		len(movedProjection.Public.RelatedRefs) != 1 ||
		movedProjection.Public.RelatedRefs[0] != "node:B" {
		t.Fatalf("moved Index display anchor = %#v", movedProjection.Public)
	}
}

func TestMergeKnowledgeRelationshipMappingHelpers(t *testing.T) {
	t.Parallel()
	oursNative := json.RawMessage(`{"type":"LINK","source":"n:1","target":"n:2"}`)
	theirsNative := json.RawMessage(`{"type":"OTHER","source":"n:1","target":"n:2"}`)
	if got := nativeRelationshipPublicPath(oursNative, theirsNative); got != "/type" {
		t.Fatalf("relationship public path = %q", got)
	}
	native := lithograph.MergeConflict{Ours: oursNative, Theirs: theirsNative}
	toPublic := relationshipNativeToPublic(
		"/type", native, json.RawMessage(`"LINK"`), json.RawMessage(`"OTHER"`),
	)
	if got, err := toPublic(json.RawMessage(`{"type":"BASE","source":"n:1","target":"n:2"}`)); err != nil ||
		string(got) != `"BASE"` {
		t.Fatalf("relationship type projection = %s err=%v", got, err)
	}
	toNative := relationshipPublicToNative(
		"/type", native, json.RawMessage(`"LINK"`), json.RawMessage(`"OTHER"`),
	)
	if got, err := toNative(json.RawMessage(`"CUSTOM"`)); err != nil ||
		!strings.Contains(string(got), `"type":"CUSTOM"`) {
		t.Fatalf("relationship type reverse = %s err=%v", got, err)
	}
	startNative := relationshipPublicToNative(
		"/start", native, json.RawMessage(`"n:1"`), json.RawMessage(`"n:1"`),
	)
	if got, err := startNative(json.RawMessage(`"n:3"`)); err != nil ||
		!strings.Contains(string(got), `"source":"n:3"`) {
		t.Fatalf("relationship start reverse = %s err=%v", got, err)
	}
	if _, err := startNative(json.RawMessage(`"r:3"`)); err == nil ||
		AsPublicError(err).Code != CodeType {
		t.Fatalf("invalid relationship endpoint error = %v", err)
	}
	public := MergeConflict{}
	if err := projectNativeMergeResolution(
		&public,
		json.RawMessage(`{"choice":"value","value":"BASE"}`),
		func(raw json.RawMessage) (json.RawMessage, error) { return cloneMergeRaw(raw), nil },
	); err != nil || public.Resolution == nil || string(public.Resolution.Value) != `"BASE"` {
		t.Fatalf("project stored resolution = %#v err=%v", public.Resolution, err)
	}
	if err := projectNativeMergeResolution(
		&public, json.RawMessage(`{"choice":"ours","value":1}`), toPublic,
	); err == nil {
		t.Fatal("invalid stored ours resolution accepted")
	}
}

func TestMergeProjectorFailureAndAlternateBranches(t *testing.T) {
	t.Parallel()
	service := &Service{}
	nodeRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	relRef := OntologyRef{Kind: KindRelationshipDefinition, Name: "KNOWS"}

	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	ours.Definitions[nodeRef] = mergeDefinitionRecord(nodeRef, "n:1", "name")
	theirs.Definitions[nodeRef] = mergeDefinitionRecord(nodeRef, "n:1", "name")
	if _, err := service.projectGraphDefinitionConflict(
		lithograph.MergeConflict{ConflictID: "reserved", Slot: "graph/node/__kgos_bad"},
		KindNodeDefinition, "__kgos_bad", ours, theirs,
	); err == nil {
		t.Fatal("reserved Graph Definition conflict was accepted")
	}
	if _, err := service.projectGraphDefinitionConflict(
		lithograph.MergeConflict{ConflictID: "missing", Slot: "graph/node/Missing"},
		KindNodeDefinition, "Missing", ours, theirs,
	); err == nil {
		t.Fatal("missing Graph Definition conflict was accepted")
	}

	left := mergeDefinitionRecord(nodeRef, "n:1", "name")
	right := mergeDefinitionRecord(nodeRef, "n:1", "title")
	left.Value.Labels = []string{"A"}
	right.Value.Labels = []string{"B"}
	if got := graphDefinitionConflictPath(left, right); got != "" {
		t.Fatalf("multi-field Graph Definition path = %q", got)
	}
	if got := graphDefinitionConflictPath(nil, right); got != "" {
		t.Fatalf("missing-side Graph Definition path = %q", got)
	}

	native := lithograph.MergeConflict{
		Ours:   json.RawMessage(`{"source_label":"Person","target_label":"Document"}`),
		Theirs: json.RawMessage(`{"source_label":"Employee","target_label":"Article"}`),
	}
	fromProjector := graphDefinitionNativeToPublic("/from", native, nil, nil)
	if got, err := fromProjector(json.RawMessage(`{"source_label":null,"target_label":"Document"}`)); err != nil ||
		string(got) != "null" {
		t.Fatalf("nullable Graph source = %s err=%v", got, err)
	}
	toProjector := graphDefinitionNativeToPublic("/to", native, nil, nil)
	if got, err := toProjector(json.RawMessage(`{"source_label":"Person","target_label":"Document"}`)); err != nil ||
		string(got) != `"node:Document"` {
		t.Fatalf("Graph target projection = %s err=%v", got, err)
	}
	for _, bad := range []struct {
		path string
		raw  json.RawMessage
	}{
		{"/bad", json.RawMessage(`{"source_label":"Person"}`)},
		{"/from", json.RawMessage("[]")},
		{"/from", json.RawMessage(`{"target_label":"Document"}`)},
		{"/from", json.RawMessage(`{"source_label":1}`)},
	} {
		if _, err := graphDefinitionNativeToPublic(bad.path, native, nil, nil)(bad.raw); err == nil {
			t.Fatalf("invalid Graph projection accepted path=%q raw=%s", bad.path, bad.raw)
		}
	}
	labelsReverse := graphDefinitionPublicToNative(
		"/labels", KindNodeDefinition, "Person",
		lithograph.MergeConflict{Ours: json.RawMessage(`{"implied_labels":[]}`)},
		nil, nil,
	)
	for _, invalid := range []json.RawMessage{
		json.RawMessage(`"bad"`),
		json.RawMessage(`["Person"]`),
		json.RawMessage(`["__kgos_bad"]`),
	} {
		if _, err := labelsReverse(invalid); err == nil {
			t.Fatalf("invalid Graph labels reverse accepted: %s", invalid)
		}
	}
	endpointReverse := graphDefinitionPublicToNative(
		"/to", KindRelationshipDefinition, "KNOWS",
		lithograph.MergeConflict{Ours: json.RawMessage(`{"target_label":"Document"}`)},
		nil, nil,
	)
	if got, err := endpointReverse(json.RawMessage("null")); err != nil ||
		!strings.Contains(string(got), `"target_label":null`) {
		t.Fatalf("null Graph target reverse = %s err=%v", got, err)
	}
	if _, err := graphDefinitionPublicToNative(
		"/labels", KindRelationshipDefinition, "KNOWS",
		lithograph.MergeConflict{Ours: json.RawMessage(`{"implied_labels":[]}`)},
		nil, nil,
	)(json.RawMessage("[]")); err == nil {
		t.Fatal("Relationship Definition accepted labels reverse")
	}
	if _, err := graphDefinitionPublicToNative(
		"/bad", KindNodeDefinition, "Person",
		lithograph.MergeConflict{Ours: json.RawMessage(`{"implied_labels":[]}`)},
		nil, nil,
	)(json.RawMessage("[]")); err == nil {
		t.Fatal("unknown Graph reverse path accepted")
	}

	relOurs := mergeDefinitionRecord(relRef, "n:5", "since")
	relTheirs := mergeDefinitionRecord(relRef, "n:5", "since")
	relOurs.Value.From, relOurs.Value.To = mergeStringPointer("node:Person"), mergeStringPointer("node:Document")
	relTheirs.Value.From, relTheirs.Value.To = mergeStringPointer("node:Person"), mergeStringPointer("node:Article")
	if got := graphDefinitionConflictPath(relOurs, relTheirs); got != "/to" {
		t.Fatalf("Relationship target conflict path = %q", got)
	}

	if got := nativeRelationshipPublicPath(
		json.RawMessage(`{"type":"A","source":"n:1","target":"n:2"}`),
		json.RawMessage(`{"type":"B","source":"n:3","target":"n:2"}`),
	); got != "" {
		t.Fatalf("multi-field Relationship public path = %q", got)
	}
	if got := nativeRelationshipPublicPath(json.RawMessage("null"), native.Ours); got != "" {
		t.Fatalf("missing-side Relationship public path = %q", got)
	}
	if got := nativeRelationshipPublicPath(json.RawMessage("[]"), native.Ours); got != "" {
		t.Fatalf("invalid Relationship public path = %q", got)
	}
	relNative := lithograph.MergeConflict{
		Ours:   json.RawMessage(`{"type":"LINK","source":"n:1","target":"n:2"}`),
		Theirs: json.RawMessage(`{"type":"LINK","source":"n:3","target":"n:4"}`),
	}
	for path, want := range map[string]string{"/start": `"n:1"`, "/end": `"n:2"`} {
		got, err := relationshipNativeToPublic(path, relNative, nil, nil)(relNative.Ours)
		if err != nil || string(got) != want {
			t.Fatalf("Relationship %s projection = %s err=%v", path, got, err)
		}
	}
	if _, err := relationshipNativeToPublic("/bad", relNative, nil, nil)(relNative.Ours); err == nil {
		t.Fatal("unknown Relationship projection path accepted")
	}
	endReverse := relationshipPublicToNative("/end", relNative, nil, nil)
	if got, err := endReverse(json.RawMessage(`"n:9"`)); err != nil ||
		!strings.Contains(string(got), `"target":"n:9"`) {
		t.Fatalf("Relationship end reverse = %s err=%v", got, err)
	}
	wholeReverse := relationshipPublicToNative("", relNative, json.RawMessage(`{"x":1}`), nil)
	if got, err := wholeReverse(json.RawMessage("null")); err != nil || string(got) != "null" {
		t.Fatalf("Relationship delete reverse = %s err=%v", got, err)
	}
	if _, err := wholeReverse(json.RawMessage(`{"x":2}`)); err == nil {
		t.Fatal("unknown whole Relationship replacement accepted")
	}

	propertySnapshot := mergeProjectorSnapshot()
	propertySnapshot.Definitions[nodeRef] = mergeDefinitionRecord(nodeRef, "n:10", "name")
	propertySnapshot.Definitions[nodeRef].PropertyElementIDs["name"] = "n:11"
	propertyLocation, _ := findMergeOntologyLocation(propertySnapshot, "n:11")
	if _, err := service.projectInternalNodeConflict(
		lithograph.MergeConflict{}, "/bad",
		propertyLocation, true, propertyLocation, true,
		propertySnapshot, propertySnapshot,
	); err == nil {
		t.Fatal("invalid internal Node tail accepted")
	}
	if _, err := service.projectInternalNodeConflict(
		lithograph.MergeConflict{}, "/property/unknown",
		propertyLocation, true, propertyLocation, true,
		propertySnapshot, propertySnapshot,
	); err == nil {
		t.Fatal("invalid Property Binding field accepted")
	}
	if _, err := service.projectInternalRelationshipConflict(
		lithograph.MergeConflict{}, "/property/x",
		mergeInternalRelationshipLocation{Ref: nodeRef, Path: "/properties", Type: propertyOfType}, true,
		mergeInternalRelationshipLocation{Ref: nodeRef, Path: "/properties", Type: propertyOfType}, true,
		propertySnapshot, propertySnapshot,
	); err == nil {
		t.Fatal("internal Relationship property tail accepted")
	}

	propertyConstraintRecord := mergeDefinitionRecord(nodeRef, "n:20", "name")
	propertyConstraintRecord.Value.Properties[0].Constraints = []Constraint{{
		Name: "property_unique", Type: "unique",
	}}
	propertyConstraintRecord.Value.Properties[0].Unique = true
	constraintSnapshot := mergeProjectorSnapshot()
	constraintSnapshot.Definitions[nodeRef] = propertyConstraintRecord
	if location, ok := findPublicConstraintLocation(constraintSnapshot, "property_unique"); !ok ||
		location.Path != "/properties" {
		t.Fatalf("Property Constraint location = %#v ok=%v", location, ok)
	}
	generated, err := lithographGraphConstraintName(nodeRef, []string{"name"}, "unique")
	if err != nil {
		t.Fatalf("generated constraint name: %v", err)
	}
	if location, ok := findPublicConstraintLocation(constraintSnapshot, generated); !ok ||
		location.Path != "/properties" {
		t.Fatalf("generated unique location = %#v ok=%v", location, ok)
	}
	if _, ok := findPublicConstraintLocation(constraintSnapshot, "missing"); ok {
		t.Fatal("missing Constraint unexpectedly resolved")
	}
	if _, ok := inferPropertyConflictLocation(
		mergeProjectorSnapshot(), mergeProjectorSnapshot(),
	); ok {
		t.Fatal("empty snapshots inferred a Property conflict")
	}
}

func TestMergeDecodeLabelAndPropertyFailures(t *testing.T) {
	t.Parallel()
	for _, raw := range []json.RawMessage{
		json.RawMessage("null"),
		json.RawMessage("[]"),
		json.RawMessage(`{"bad":null}`),
		json.RawMessage(`{"__kgos_bad":"x"}`),
	} {
		if _, err := decodeMergeKnowledgeProperties(raw); err == nil {
			t.Fatalf("invalid Knowledge properties accepted: %s", raw)
		}
	}
	for _, raw := range []json.RawMessage{
		json.RawMessage("null"),
		json.RawMessage(`"bad"`),
		json.RawMessage(`["A","A"]`),
		json.RawMessage(`["__kgos_bad"]`),
	} {
		if _, err := decodeMergeLabels(raw); err == nil {
			t.Fatalf("invalid Knowledge labels accepted: %s", raw)
		}
	}
	if _, err := togglePublicStringSet(json.RawMessage(`"bad"`), "A", true); err == nil {
		t.Fatal("invalid public string set accepted")
	}
	if sameMergeStrings([]string{"A"}, []string{"A", "B"}) ||
		sameMergeStrings([]string{"A"}, []string{"B"}) {
		t.Fatal("unequal string slices were treated as equal")
	}
}

func TestMergeInternalAndResourceProjectionVariants(t *testing.T) {
	t.Parallel()
	service := &Service{}

	domainRef := OntologyRef{Kind: KindDomain, Name: "Content"}
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	ours.Domains["Content"] = &domainRecord{
		ElementID: "n:1",
		Value:     Domain{Name: "Content", Title: mergeStringPointer("Ours"), Includes: []string{}},
	}
	theirs.Domains["Content"] = &domainRecord{
		ElementID: "n:1",
		Value:     Domain{Name: "Content", Title: mergeStringPointer("Theirs"), Includes: []string{}},
	}
	oursLocation, _ := findMergeOntologyLocation(ours, "n:1")
	theirsLocation, _ := findMergeOntologyLocation(theirs, "n:1")
	titleProjection, err := service.projectInternalNodeConflict(
		lithograph.MergeConflict{
			ConflictID: "title", Slot: "node/1/property/__kgos_title",
			Ours: json.RawMessage(`"Ours"`), Theirs: json.RawMessage(`"Theirs"`),
			Base: json.RawMessage("null"),
		},
		"/property/__kgos_title",
		oursLocation, true, theirsLocation, true,
		ours, theirs,
	)
	if err != nil || titleProjection.Public.Kind != KindDomain ||
		titleProjection.Public.Path != "/title" ||
		titleProjection.Public.OursRef != domainRef.String() {
		t.Fatalf("Domain title projection = %#v err=%v", titleProjection.Public, err)
	}
	if got, err := titleProjection.ToNative(json.RawMessage("null")); err != nil ||
		string(got) != "null" {
		t.Fatalf("Domain title null reverse = %s err=%v", got, err)
	}
	if got, err := titleProjection.ToNative(json.RawMessage(`"Merged"`)); err != nil ||
		string(got) != `"Merged"` {
		t.Fatalf("Domain title reverse = %s err=%v", got, err)
	}
	if _, err := titleProjection.ToNative(json.RawMessage("1")); err == nil ||
		AsPublicError(err).Code != CodeType {
		t.Fatalf("Domain title type error = %v", err)
	}

	definitionRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	ours = mergeProjectorSnapshot()
	theirs = mergeProjectorSnapshot()
	ours.Definitions[definitionRef] = mergeDefinitionRecord(definitionRef, "n:10", "name")
	theirs.Definitions[definitionRef] = mergeDefinitionRecord(definitionRef, "n:10", "name")
	ours.Definitions[definitionRef].PropertyElementIDs["name"] = "n:11"
	theirs.Definitions[definitionRef].PropertyElementIDs["name"] = "n:11"
	propertyEdge := mergeInternalRelationshipLocation{
		Ref: definitionRef, Path: "/properties", Type: propertyOfType,
	}
	propertyEdgeProjection, err := service.projectInternalRelationshipConflict(
		lithograph.MergeConflict{
			ConflictID: "owner", Slot: "relationship/12",
			Ours:   json.RawMessage(`{"type":"__kgos_property_of","source":"n:11","target":"n:10"}`),
			Theirs: json.RawMessage("null"),
		},
		"", propertyEdge, true, propertyEdge, true, ours, theirs,
	)
	if err != nil || propertyEdgeProjection.Public.Path != "/properties" {
		t.Fatalf("Property owner edge projection = %#v err=%v", propertyEdgeProjection.Public, err)
	}
	if got, err := propertyEdgeProjection.ToNative(propertyEdgeProjection.Public.Ours); err != nil ||
		!nativeMergeValuePresent(got) {
		t.Fatalf("Property owner edge reverse = %s err=%v", got, err)
	}
	if _, err := service.projectInternalRelationshipConflict(
		lithograph.MergeConflict{},
		"",
		mergeInternalRelationshipLocation{Ref: definitionRef, Path: "/properties", Type: propertyOfType}, true,
		mergeInternalRelationshipLocation{Ref: definitionRef, Path: "/includes", Type: includesType}, true,
		ours, theirs,
	); err == nil {
		t.Fatal("mismatched internal Relationship locations accepted")
	}

	locationSnapshot := mergeProjectorSnapshot()
	locationSnapshot.Definitions[definitionRef] = mergeDefinitionRecord(definitionRef, "n:10", "name")
	locationSnapshot.Definitions[definitionRef].PropertyElementIDs["name"] = "n:11"
	locationSnapshot.internalRelationships["r:12"] = taggedRelationship{
		ElementID: "r:12", Type: propertyOfType, Start: "n:11", End: "n:10",
		Properties: map[string]json.RawMessage{},
	}
	location, ok := findMergeInternalRelationshipLocation(locationSnapshot, "r:12")
	if !ok || location.Ref != definitionRef || location.Type != propertyOfType {
		t.Fatalf("Property owner location = %#v ok=%v", location, ok)
	}
	if _, ok := findMergeInternalRelationshipLocation(mergeProjectorSnapshot(), "r:missing"); ok {
		t.Fatal("missing internal Relationship unexpectedly resolved")
	}

	left := mergeProjectorSnapshot()
	right := mergeProjectorSnapshot()
	leftRecord := mergeDefinitionRecord(definitionRef, "n:20", "name")
	rightRecord := mergeDefinitionRecord(definitionRef, "n:20", "name")
	leftRecord.Value.Properties[0].Required = true
	left.Definitions[definitionRef] = leftRecord
	right.Definitions[definitionRef] = rightRecord
	fallbackProjection, err := service.projectConstraintConflict(
		lithograph.MergeConflict{
			ConflictID: "generated", Slot: "constraint/generated",
			Ours:   json.RawMessage(`{"required":true}`),
			Theirs: json.RawMessage(`{"required":false}`),
		},
		"generated", left, right,
	)
	if err != nil || fallbackProjection.Public.Path != "/properties" {
		t.Fatalf("Constraint fallback projection = %#v err=%v", fallbackProjection.Public, err)
	}
	if _, err := service.projectConstraintConflict(
		lithograph.MergeConflict{ConflictID: "missing", Slot: "constraint/missing"},
		"missing", mergeProjectorSnapshot(), mergeProjectorSnapshot(),
	); err == nil {
		t.Fatal("unlocatable Constraint conflict was accepted")
	}

	indexLeft := mergeProjectorSnapshot()
	indexRecord := mergeDefinitionRecord(definitionRef, "n:30", "name")
	indexRecord.Value.Indexes = []Index{{
		Name: "person_text", Type: "fulltext", Properties: []string{"name"},
	}}
	indexLeft.Definitions[definitionRef] = indexRecord
	indexProjection, err := service.projectIndexConflict(
		lithograph.MergeConflict{
			ConflictID: "index-add", Slot: "index/person_text",
			Ours: json.RawMessage(`{"kind":"fulltext"}`), Theirs: json.RawMessage("null"),
		},
		"person_text", indexLeft, mergeProjectorSnapshot(),
	)
	if err != nil || indexProjection.Public.OursRef != definitionRef.String() ||
		indexProjection.Public.TheirsRef != "" {
		t.Fatalf("single-side Index projection = %#v err=%v", indexProjection.Public, err)
	}
	if _, err := service.projectIndexConflict(
		lithograph.MergeConflict{ConflictID: "missing-index", Slot: "index/missing"},
		"missing", mergeProjectorSnapshot(), mergeProjectorSnapshot(),
	); err == nil {
		t.Fatal("missing Index conflict was accepted")
	}
}

func TestMergeProjectorSingleSideAndStoredResolutionVariants(t *testing.T) {
	t.Parallel()
	service := &Service{}
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}

	// A whole Graph Definition that exists only on theirs must remain a public
	// whole-object conflict and round-trip only through the one native side.
	ours := mergeProjectorSnapshot()
	theirs := mergeProjectorSnapshot()
	theirs.Definitions[ref] = mergeDefinitionRecord(ref, "n:1", "name")
	nativeGraph := lithograph.MergeConflict{
		ConflictID: "graph-add",
		Slot:       "graph/node/Person",
		Ours:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`{"label":"Person","implied_labels":[],"properties":{"name":{"property_type":{"type":"string"},"required":false}}}`),
		Resolution: json.RawMessage(`{"choice":"theirs"}`),
	}
	graphProjection, err := service.projectGraphDefinitionConflict(
		nativeGraph, KindNodeDefinition, "Person", ours, theirs,
	)
	if err != nil || graphProjection.Public.Path != "" ||
		graphProjection.Public.OursRef != "" ||
		graphProjection.Public.TheirsRef != ref.String() ||
		graphProjection.Public.Resolution == nil ||
		graphProjection.Public.Resolution.Choice != "theirs" {
		t.Fatalf("single-side Graph Definition = %#v err=%v", graphProjection.Public, err)
	}
	if got, err := graphProjection.ToNative(graphProjection.Public.Theirs); err != nil ||
		!equalMergeJSON(got, nativeGraph.Theirs) {
		t.Fatalf("single-side Graph reverse = %s err=%v", got, err)
	}
	if got, err := graphProjection.ToNative(json.RawMessage("null")); err != nil ||
		string(got) != "null" {
		t.Fatalf("single-side Graph delete reverse = %s err=%v", got, err)
	}

	// Definition Binding node and PROPERTY_OF edge can also appear only on one
	// side during add/delete. Their internal identity must still project to the
	// public Definition aggregate rather than leak Binding locators.
	theirs.Definitions[ref].PropertyElementIDs["name"] = "n:2"
	bindingLocation, ok := findMergeOntologyLocation(theirs, "n:2")
	if !ok {
		t.Fatal("single-side Property Binding was not located")
	}
	bindingNative := lithograph.MergeConflict{
		ConflictID: "binding-add",
		Slot:       "node/2",
		Ours:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`{"element_id":"n:2"}`),
		Resolution: json.RawMessage(`{"choice":"theirs"}`),
	}
	bindingProjection, err := service.projectInternalNodeConflict(
		bindingNative, "", mergeOntologyLocation{}, false, bindingLocation, true, ours, theirs,
	)
	if err != nil || bindingProjection.Public.Path != "/properties" ||
		bindingProjection.Public.OursRef != "" ||
		bindingProjection.Public.TheirsRef != ref.String() {
		t.Fatalf("single-side Binding projection = %#v err=%v", bindingProjection.Public, err)
	}
	if got, err := bindingProjection.ToNative(bindingProjection.Public.Theirs); err != nil ||
		!equalMergeJSON(got, bindingNative.Theirs) {
		t.Fatalf("single-side Binding reverse = %s err=%v", got, err)
	}

	edgeLocation := mergeInternalRelationshipLocation{
		Ref: ref, Path: "/properties", Type: propertyOfType,
	}
	edgeNative := lithograph.MergeConflict{
		ConflictID: "owner-add",
		Slot:       "relationship/9",
		Ours:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`{"type":"__kgos_property_of","source":"n:2","target":"n:1"}`),
	}
	edgeProjection, err := service.projectInternalRelationshipConflict(
		edgeNative, "", mergeInternalRelationshipLocation{}, false, edgeLocation, true, ours, theirs,
	)
	if err != nil || edgeProjection.Public.Path != "/properties" ||
		edgeProjection.Public.TheirsRef != ref.String() {
		t.Fatalf("single-side Property owner edge = %#v err=%v", edgeProjection.Public, err)
	}
	if got, err := edgeProjection.ToNative(edgeProjection.Public.Theirs); err != nil ||
		!equalMergeJSON(got, edgeNative.Theirs) {
		t.Fatalf("single-side owner edge reverse = %s err=%v", got, err)
	}

	// Single-side named resources exercise the same public aggregate mapping.
	theirs.Definitions[ref].Value.Constraints = []Constraint{{
		Name: "person_unique", Type: "unique", Properties: []string{"name"},
	}}
	constraintNative := lithograph.MergeConflict{
		ConflictID: "constraint-add",
		Slot:       "constraint/person_unique",
		Ours:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`{"kind":"unique"}`),
	}
	constraintProjection, err := service.projectConstraintConflict(
		constraintNative, "person_unique", ours, theirs,
	)
	if err != nil || constraintProjection.Public.OursRef != "" ||
		constraintProjection.Public.TheirsRef != ref.String() {
		t.Fatalf("single-side Constraint = %#v err=%v", constraintProjection.Public, err)
	}
	if got, err := constraintProjection.ToNative(constraintProjection.Public.Theirs); err != nil ||
		!equalMergeJSON(got, constraintNative.Theirs) {
		t.Fatalf("single-side Constraint reverse = %s err=%v", got, err)
	}

	theirs.Definitions[ref].Value.Indexes = []Index{{
		Name: "person_text", Type: "fulltext", Properties: []string{"name"},
	}}
	indexNative := lithograph.MergeConflict{
		ConflictID: "index-add-theirs",
		Slot:       "index/person_text",
		Ours:       json.RawMessage("null"),
		Theirs:     json.RawMessage(`{"kind":"fulltext"}`),
	}
	indexProjection, err := service.projectIndexConflict(
		indexNative, "person_text", ours, theirs,
	)
	if err != nil || indexProjection.Public.OursRef != "" ||
		indexProjection.Public.TheirsRef != ref.String() {
		t.Fatalf("single-side Index = %#v err=%v", indexProjection.Public, err)
	}
	if got, err := indexProjection.ToNative(indexProjection.Public.Theirs); err != nil ||
		!equalMergeJSON(got, indexNative.Theirs) {
		t.Fatalf("single-side Index reverse = %s err=%v", got, err)
	}

	// Stored side-choice resolutions carry no value and must not invoke the
	// value projector.
	for _, choice := range []string{"ours", "theirs"} {
		public := MergeConflict{}
		called := false
		err := projectNativeMergeResolution(
			&public,
			json.RawMessage(`{"choice":"`+choice+`"}`),
			func(json.RawMessage) (json.RawMessage, error) {
				called = true
				return nil, nil
			},
		)
		if err != nil || public.Resolution == nil ||
			public.Resolution.Choice != choice || len(public.Resolution.Value) != 0 || called {
			t.Fatalf("stored %s resolution = %#v called=%v err=%v", choice, public.Resolution, called, err)
		}
	}

	// Public snapshot helpers must distinguish absent objects from present
	// aggregates without inventing a locator.
	if _, ok := publicOntologyMergeValue(ours, ref, ""); ok {
		t.Fatal("missing Ontology object unexpectedly projected")
	}
	if value, ok := publicOntologyMergeValue(theirs, ref, "/properties"); !ok || len(value) == 0 {
		t.Fatalf("present Ontology properties not projected: %s ok=%v", value, ok)
	}
	if _, ok := publicOntologyMergeValue(theirs, ref, "/missing"); ok {
		t.Fatal("missing Ontology field unexpectedly projected")
	}
}

func TestMergeProjectorDefensiveBoundaryMatrix(t *testing.T) {
	t.Parallel()

	// Raw/public JSON helpers must fail closed on malformed values rather than
	// silently treating them as equivalent or as an absent side.
	if equalMergeJSON(json.RawMessage("{"), json.RawMessage("{}")) ||
		equalMergeJSON(json.RawMessage("{}"), json.RawMessage("{")) ||
		!equalMergeJSON(nil, json.RawMessage{}) {
		t.Fatal("malformed/empty JSON equality classification failed")
	}
	public := MergeConflict{}
	for name, raw := range map[string]json.RawMessage{
		"malformed object": json.RawMessage("["),
		"missing choice":   json.RawMessage(`{"value":1}`),
		"missing value":    json.RawMessage(`{"choice":"value"}`),
		"unknown choice":   json.RawMessage(`{"choice":"custom"}`),
	} {
		if err := projectNativeMergeResolution(
			&public, raw,
			func(value json.RawMessage) (json.RawMessage, error) { return value, nil },
		); err == nil || AsPublicError(err).Code != CodeConsistency {
			t.Fatalf("%s stored resolution error = %v", name, err)
		}
	}
	projectorFailure := publicError(CodeType, "project", nil)
	if err := projectNativeMergeResolution(
		&public,
		json.RawMessage(`{"choice":"value","value":1}`),
		func(json.RawMessage) (json.RawMessage, error) { return nil, projectorFailure },
	); err != projectorFailure {
		t.Fatalf("stored value projector error = %v", err)
	}
	if err := projectNativeMergeResolution(
		&public, json.RawMessage("null"),
		func(json.RawMessage) (json.RawMessage, error) {
			t.Fatal("null resolution invoked projector")
			return nil, nil
		},
	); err != nil {
		t.Fatalf("null stored resolution error = %v", err)
	}

	// Relationship helpers cover side matching, malformed structural payloads,
	// invalid identifiers and unsupported public paths.
	nativeRelationship := lithograph.MergeConflict{
		Ours:   json.RawMessage(`{"type":"LINK","source":"n:1","target":"n:2"}`),
		Theirs: json.RawMessage(`{"type":"OTHER","source":"n:3","target":"n:4"}`),
	}
	for _, test := range []struct {
		name string
		path string
		raw  json.RawMessage
	}{
		{"null", "/type", json.RawMessage("null")},
		{"malformed", "/type", json.RawMessage("[]")},
		{"missing field", "/type", json.RawMessage(`{"source":"n:1"}`)},
		{"unsupported path", "/bad", json.RawMessage(`{"type":"LINK"}`)},
	} {
		got, err := relationshipNativeToPublic(test.path, nativeRelationship, nil, nil)(test.raw)
		if test.name == "null" {
			if err != nil || string(got) != "null" {
				t.Fatalf("Relationship null projection = %s err=%v", got, err)
			}
			continue
		}
		if err == nil || AsPublicError(err).Code != CodeConsistency {
			t.Fatalf("%s Relationship projection error = %v", test.name, err)
		}
	}
	badTemplate := relationshipPublicToNative(
		"/type",
		lithograph.MergeConflict{Ours: json.RawMessage("[]")},
		nil,
		nil,
	)
	if _, err := badTemplate(json.RawMessage(`"CUSTOM"`)); err == nil ||
		AsPublicError(err).Code != CodeConsistency {
		t.Fatalf("malformed Relationship template error = %v", err)
	}
	for _, test := range []struct {
		name  string
		path  string
		value json.RawMessage
		code  ErrorCode
	}{
		{"empty type", "/type", json.RawMessage(`""`), CodeType},
		{"reserved type", "/type", json.RawMessage(`"__kgos_bad"`), CodeReservedIdentifier},
		{"non-string", "/type", json.RawMessage("1"), CodeType},
		{"bad endpoint", "/start", json.RawMessage(`"bad"`), CodeType},
		{"unsupported reverse path", "/bad", json.RawMessage(`"x"`), CodeConsistency},
	} {
		_, err := relationshipPublicToNative(
			test.path, nativeRelationship, nil, nil,
		)(test.value)
		if err == nil || AsPublicError(err).Code != test.code {
			t.Fatalf("%s Relationship reverse error = %v", test.name, err)
		}
	}

	// Location helpers reject dangling, mismatched, and unknown internal edges.
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	state := mergeProjectorSnapshot()
	state.Definitions[ref] = mergeDefinitionRecord(ref, "n:1", "name")
	state.Definitions[ref].PropertyElementIDs["name"] = "n:2"
	if _, ok := findMergeOntologyLocation(nil, "n:1"); ok {
		t.Fatal("nil snapshot resolved an Ontology location")
	}
	if _, ok := findMergeOntologyLocation(state, "n:missing"); ok {
		t.Fatal("missing Ontology identity resolved")
	}
	if mergeOntologyObjectExists(nil, ref) ||
		mergeOntologyObjectExists(state, OntologyRef{Kind: KindNodeDefinition, Name: "Missing"}) {
		t.Fatal("missing Ontology object reported present")
	}
	state.internalRelationships["r:dangling"] = taggedRelationship{
		ElementID: "r:dangling", Type: propertyOfType, Start: "n:missing", End: "n:1",
	}
	state.internalRelationships["r:unknown"] = taggedRelationship{
		ElementID: "r:unknown", Type: "UNKNOWN", Start: "n:2", End: "n:1",
	}
	state.internalRelationships["r:wrong-owner"] = taggedRelationship{
		ElementID: "r:wrong-owner", Type: propertyOfType, Start: "n:1", End: "n:2",
	}
	for _, id := range []string{"r:dangling", "r:unknown", "r:wrong-owner"} {
		if _, ok := findMergeInternalRelationshipLocation(state, id); ok {
			t.Fatalf("invalid internal Relationship %s resolved", id)
		}
	}

	// Domain projection covers the other public Ontology aggregate family and
	// unsupported kinds/paths remain unrepresentable.
	domainRef := OntologyRef{Kind: KindDomain, Name: "Content"}
	state.Domains["Content"] = &domainRecord{
		ElementID: "n:10",
		Value:     Domain{Name: "Content", Includes: []string{ref.String()}},
	}
	if value, ok := publicOntologyMergeValue(state, domainRef, ""); !ok || len(value) == 0 {
		t.Fatalf("Domain whole-object projection = %s ok=%v", value, ok)
	}
	if value, ok := publicOntologyMergeValue(state, domainRef, "/includes"); !ok ||
		!equalMergeJSON(value, json.RawMessage(`["node:Person"]`)) {
		t.Fatalf("Domain includes projection = %s ok=%v", value, ok)
	}
	if _, ok := publicOntologyMergeValue(
		state, OntologyRef{Kind: KindKnowledgeNode, Name: "x"}, "",
	); ok {
		t.Fatal("Knowledge kind projected as Ontology")
	}
	if _, ok := publicOntologyMergeValue(state, domainRef, "/includes/nested"); ok {
		t.Fatal("nested Ontology path unexpectedly projected")
	}

	// Aggregate reverse mapping rejects malformed and unrelated values while
	// still preserving explicit property deletion and label membership.
	nativeProperty := lithograph.MergeConflict{
		Base: json.RawMessage(`"Base"`), Ours: json.RawMessage(`"Ours"`), Theirs: json.RawMessage(`"Theirs"`),
	}
	_, propertyToNative, err := knowledgePropertyAggregateMappers(
		nativeProperty,
		"name",
		json.RawMessage(`{"name":"Ours","stable":1}`),
		json.RawMessage(`{"name":"Theirs","stable":1}`),
	)
	if err != nil {
		t.Fatalf("property aggregate mapper: %v", err)
	}
	for _, value := range []json.RawMessage{
		json.RawMessage("null"),
		json.RawMessage(`{"name":"Merged","other":1}`),
	} {
		if _, err := propertyToNative(value); err == nil {
			t.Fatalf("unsafe property aggregate accepted: %s", value)
		}
	}
	_, labelsToNative, err := knowledgeLabelAggregateMappers(
		lithograph.MergeConflict{Ours: json.RawMessage("true"), Theirs: json.RawMessage("null")},
		"Shared",
		json.RawMessage(`["Common","Shared"]`),
		json.RawMessage(`["Common"]`),
	)
	if err != nil {
		t.Fatalf("label aggregate mapper: %v", err)
	}
	for _, value := range []json.RawMessage{
		json.RawMessage("null"),
		json.RawMessage(`["Common","Other"]`),
	} {
		if _, err := labelsToNative(value); err == nil {
			t.Fatalf("unsafe label aggregate accepted: %s", value)
		}
	}
}

func mergeProjectorSnapshot() *snapshot {
	return &snapshot{
		Domains:               map[string]*domainRecord{},
		Definitions:           map[OntologyRef]*definitionRecord{},
		internalNodes:         map[string]internalNode{},
		internalRelationships: map[string]taggedRelationship{},
	}
}

func mergeDefinitionRecord(ref OntologyRef, elementID string, propertyName string) *definitionRecord {
	return &definitionRecord{
		ElementID: elementID,
		Value: Definition{
			Kind: ref.Kind, Name: ref.Name,
			Properties:  []Property{{Name: propertyName, Type: "STRING"}},
			Constraints: []Constraint{},
		},
		PropertyElementIDs: map[string]string{},
	}
}

func mergeStringPointer(value string) *string {
	return &value
}
