package kernel

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"testing"
)

func TestPatchPlanTracksPropertyRenameAndDelete(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	definition := Definition{
		Kind:        KindNodeDefinition,
		Name:        "Person",
		Properties:  []Property{{Name: "name", Type: "STRING"}},
		Constraints: []Constraint{},
	}
	base := &snapshot{
		State:   "commit/" + strings.Repeat("a", 64),
		Domains: map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{
			ref: {
				Value:              definition,
				ElementID:          "n/1",
				PropertyElementIDs: map[string]string{"name": "n/2"},
			},
		},
	}
	body, err := RenderObjectYAML(ObjectValue{Kind: KindNodeDefinition, Definition: &definition})
	if err != nil {
		t.Fatalf("render base: %v", err)
	}
	renamed := strings.Replace(
		string(body),
		"  - name: \"name\"\n    type: \"STRING\"",
		"  - name: \"displayName\"\n    type: \"STRING\"\n    renameFrom: \"name\"",
		1,
	)
	plan, err := planOntologyPatch(base, wholeFileUpdatePatch("node:Person", string(body), renamed))
	if err != nil {
		t.Fatalf("plan rename: %v", err)
	}
	object := plan.Objects[ref]
	if object == nil {
		t.Fatal("renamed property removed Definition")
	}
	if got := object.PropertyBase["displayName"]; got != "name" {
		t.Fatalf("displayName base = %q, want name; all=%#v", got, object.PropertyBase)
	}
	if got := plan.PropertyRenames[ref]["name"]; got != "displayName" {
		t.Fatalf("PropertyRenames = %#v", plan.PropertyRenames)
	}

	deleted, err := planOntologyPatch(base, wholeFileDeletePatch("node:Person", string(body)))
	if err != nil {
		t.Fatalf("plan delete: %v", err)
	}
	if _, exists := deleted.Objects[ref]; exists {
		t.Fatalf("delete retained object: %#v", deleted.Objects[ref])
	}
}

func TestPatchPlanPropertySwapIsNotNoOp(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Pair"}
	definition := Definition{
		Kind: KindNodeDefinition,
		Name: "Pair",
		Properties: []Property{
			{Name: "a", Type: "STRING"},
			{Name: "b", Type: "STRING"},
		},
		Constraints: []Constraint{},
	}
	base := &snapshot{
		State:   "commit/" + strings.Repeat("c", 64),
		Domains: map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{
			ref: {
				Value:              definition,
				ElementID:          "n/1",
				PropertyElementIDs: map[string]string{"a": "n/2", "b": "n/3"},
			},
		},
	}
	body, err := RenderObjectYAML(ObjectValue{Kind: KindNodeDefinition, Definition: &definition})
	if err != nil {
		t.Fatalf("render Pair: %v", err)
	}
	target := strings.Replace(
		string(body),
		"  - name: \"a\"\n    type: \"STRING\"",
		"  - name: \"a\"\n    type: \"STRING\"\n    renameFrom: \"b\"",
		1,
	)
	target = strings.Replace(
		target,
		"  - name: \"b\"\n    type: \"STRING\"",
		"  - name: \"b\"\n    type: \"STRING\"\n    renameFrom: \"a\"",
		1,
	)
	plan, err := planOntologyPatch(base, wholeFileUpdatePatch("node:Pair", string(body), target))
	if err != nil {
		t.Fatalf("plan swap: %v", err)
	}
	if got := plan.PropertyRenames[ref]["a"]; got != "b" {
		t.Fatalf("a transition = %q, want b", got)
	}
	if got := plan.PropertyRenames[ref]["b"]; got != "a" {
		t.Fatalf("b transition = %q, want a", got)
	}
	if got := plan.Objects[ref].PropertyBase["a"]; got != "b" {
		t.Fatalf("target a base = %q, want b", got)
	}
	if got := plan.Objects[ref].PropertyBase["b"]; got != "a" {
		t.Fatalf("target b base = %q, want a", got)
	}
	noOp, err := plan.isNoOp()
	if err != nil {
		t.Fatalf("no-op check: %v", err)
	}
	if noOp {
		t.Fatal("Property identity swap must not be treated as no-op")
	}
}

func wholeFileUpdatePatch(target, oldBody, newBody string) string {
	oldLines := strings.Split(strings.TrimSuffix(oldBody, "\n"), "\n")
	newLines := strings.Split(strings.TrimSuffix(newBody, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	fmt.Fprintf(&patch, "--- a/%s\n+++ b/%s\n", target, target)
	fmt.Fprintf(&patch, "@@ -1,%d +1,%d @@\n", len(oldLines), len(newLines))
	for _, line := range oldLines {
		fmt.Fprintf(&patch, "-%s\n", line)
	}
	for _, line := range newLines {
		fmt.Fprintf(&patch, "+%s\n", line)
	}
	return patch.String()
}

func wholeFileDeletePatch(target, body string) string {
	lines := strings.Split(strings.TrimSuffix(body, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	patch.WriteString("deleted file mode 100644\n")
	fmt.Fprintf(&patch, "--- a/%s\n+++ /dev/null\n", target)
	fmt.Fprintf(&patch, "@@ -1,%d +0,0 @@\n", len(lines))
	for _, line := range lines {
		fmt.Fprintf(&patch, "-%s\n", line)
	}
	return patch.String()
}

func wholeFileRenamePatch(oldTarget, newTarget, oldBody, newBody string) string {
	oldLines := strings.Split(strings.TrimSuffix(oldBody, "\n"), "\n")
	newLines := strings.Split(strings.TrimSuffix(newBody, "\n"), "\n")
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", oldTarget, newTarget)
	fmt.Fprintf(&patch, "rename from %s\nrename to %s\n", oldTarget, newTarget)
	fmt.Fprintf(&patch, "--- a/%s\n+++ b/%s\n", oldTarget, newTarget)
	fmt.Fprintf(&patch, "@@ -1,%d +1,%d @@\n", len(oldLines), len(newLines))
	for _, line := range oldLines {
		fmt.Fprintf(&patch, "-%s\n", line)
	}
	for _, line := range newLines {
		fmt.Fprintf(&patch, "+%s\n", line)
	}
	return patch.String()
}

func TestDefinitionRenameConflictsWithExplicitDomainRetarget(t *testing.T) {
	t.Parallel()
	personRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	person := Definition{
		Kind:        KindNodeDefinition,
		Name:        "Person",
		Properties:  []Property{{Name: "name", Type: "STRING"}},
		Constraints: []Constraint{},
	}
	domain := Domain{Name: "Content", Includes: []string{personRef.String()}}
	base := &snapshot{
		State: "commit/" + strings.Repeat("b", 64),
		Domains: map[string]*domainRecord{
			"Content": {Value: domain},
		},
		Definitions: map[OntologyRef]*definitionRecord{
			personRef: {
				Value:              person,
				PropertyElementIDs: map[string]string{"name": "n/2"},
			},
		},
	}
	personBody, err := RenderObjectYAML(ObjectValue{Kind: KindNodeDefinition, Definition: &person})
	if err != nil {
		t.Fatalf("render Person: %v", err)
	}
	humanBody := strings.Replace(string(personBody), "name: \"Person\"", "name: \"Human\"", 1)
	domainBody, err := RenderObjectYAML(ObjectValue{Kind: KindDomain, Domain: &domain})
	if err != nil {
		t.Fatalf("render Domain: %v", err)
	}
	emptyDomain := Domain{Name: "Content", Includes: []string{}}
	emptyDomainBody, err := RenderObjectYAML(ObjectValue{Kind: KindDomain, Domain: &emptyDomain})
	if err != nil {
		t.Fatalf("render empty Domain: %v", err)
	}
	patch := wholeFileRenamePatch("node:Person", "node:Human", string(personBody), humanBody) +
		wholeFileUpdatePatch("domain:Content", string(domainBody), string(emptyDomainBody))
	_, err = planOntologyPatch(base, patch)
	if err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("rename/domain conflict error = %v", err)
	}
}

func TestDefinitionRenameAllowsExplicitSameTargetRef(t *testing.T) {
	t.Parallel()
	personRef := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	person := Definition{
		Kind:        KindNodeDefinition,
		Name:        "Person",
		Properties:  []Property{{Name: "name", Type: "STRING"}},
		Constraints: []Constraint{},
	}
	domain := Domain{Name: "Content", Includes: []string{personRef.String()}}
	base := &snapshot{
		State: "commit/" + strings.Repeat("c", 64),
		Domains: map[string]*domainRecord{
			"Content": {Value: domain},
		},
		Definitions: map[OntologyRef]*definitionRecord{
			personRef: {
				Value:              person,
				PropertyElementIDs: map[string]string{"name": "n/2"},
			},
		},
	}
	personBody, err := RenderObjectYAML(ObjectValue{Kind: KindNodeDefinition, Definition: &person})
	if err != nil {
		t.Fatalf("render Person: %v", err)
	}
	humanBody := strings.Replace(string(personBody), "name: \"Person\"", "name: \"Human\"", 1)
	domainBody, err := RenderObjectYAML(ObjectValue{Kind: KindDomain, Domain: &domain})
	if err != nil {
		t.Fatalf("render Domain: %v", err)
	}
	humanRef := OntologyRef{Kind: KindNodeDefinition, Name: "Human"}.String()
	targetDomain := Domain{Name: "Content", Includes: []string{humanRef}}
	targetDomainBody, err := RenderObjectYAML(ObjectValue{Kind: KindDomain, Domain: &targetDomain})
	if err != nil {
		t.Fatalf("render target Domain: %v", err)
	}
	patch := wholeFileRenamePatch("node:Person", "node:Human", string(personBody), humanBody) +
		wholeFileUpdatePatch("domain:Content", string(domainBody), string(targetDomainBody))
	plan, err := planOntologyPatch(base, patch)
	if err != nil {
		t.Fatalf("same-target derived rename should succeed: %v", err)
	}
	got := plan.Objects[OntologyRef{Kind: KindDomain, Name: "Content"}].Value.Domain.Includes
	if len(got) != 1 || got[0] != humanRef {
		t.Fatalf("Domain includes = %#v, want %q", got, humanRef)
	}
}

func TestDerivedResourceMaintenanceRejectsExplicitDelete(t *testing.T) {
	t.Parallel()
	person := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	human := OntologyRef{Kind: KindNodeDefinition, Name: "Human"}
	plan := &plannedState{
		Transitions: map[string]string{person.String(): human.String()},
		PropertyRenames: map[OntologyRef]map[string]string{
			human: {"name": "displayName"},
		},
	}
	baseConstraints := map[string]constraintSpec{
		"person_name_unique": {
			Name: "person_name_unique", Owner: person, Type: "unique", Properties: []string{"name"},
		},
	}
	err := validateDerivedResourceMaintenance(
		plan,
		baseConstraints,
		map[string]constraintSpec{},
		map[string]logicalIndex{},
		map[string]logicalIndex{},
	)
	if err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("derived Constraint delete error = %v", err)
	}

	baseIndexes := map[string]logicalIndex{
		"person_text": {
			Name: "person_text", Type: "fulltext", Targets: []OntologyRef{person}, Properties: []string{"name"},
		},
	}
	err = validateDerivedResourceMaintenance(
		plan,
		map[string]constraintSpec{},
		map[string]constraintSpec{},
		baseIndexes,
		map[string]logicalIndex{},
	)
	if err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("derived Index delete error = %v", err)
	}
}

func TestDerivedResourceMaintenanceRequiresExactSlots(t *testing.T) {
	t.Parallel()
	person := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	human := OntologyRef{Kind: KindNodeDefinition, Name: "Human"}
	manager := OntologyRef{Kind: KindNodeDefinition, Name: "Manager"}
	plan := &plannedState{
		Transitions: map[string]string{person.String(): human.String()},
		PropertyRenames: map[OntologyRef]map[string]string{
			human: {"name": "displayName"},
		},
	}
	baseConstraints := map[string]constraintSpec{
		"person_unique": {
			Name: "person_unique", Owner: person, Type: "unique", Properties: []string{"name"},
		},
	}
	targetConstraints := map[string]constraintSpec{
		"person_unique": {
			Name: "person_unique", Owner: human, Type: "unique", Properties: []string{"displayName", "extra"},
		},
	}
	if err := validateDerivedResourceMaintenance(
		plan,
		baseConstraints,
		targetConstraints,
		map[string]logicalIndex{},
		map[string]logicalIndex{},
	); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("Constraint extra-property conflict = %v", err)
	}

	baseIndexes := map[string]logicalIndex{
		"people_text": {
			Name: "people_text", Type: "fulltext", Targets: []OntologyRef{person}, Properties: []string{"name"},
		},
	}
	targetIndexes := map[string]logicalIndex{
		"people_text": {
			Name: "people_text", Type: "fulltext", Targets: []OntologyRef{human, manager}, Properties: []string{"displayName"},
		},
	}
	if err := validateDerivedResourceMaintenance(
		plan,
		map[string]constraintSpec{},
		map[string]constraintSpec{},
		baseIndexes,
		targetIndexes,
	); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("Index extra-target conflict = %v", err)
	}
}

func TestDerivedSharedIndexRejectsDivergentPropertyRename(t *testing.T) {
	t.Parallel()
	employee := OntologyRef{Kind: KindNodeDefinition, Name: "Employee"}
	manager := OntologyRef{Kind: KindNodeDefinition, Name: "Manager"}
	plan := &plannedState{
		Transitions: map[string]string{},
		PropertyRenames: map[OntologyRef]map[string]string{
			employee: {"name": "displayName"},
		},
	}
	baseIndexes := map[string]logicalIndex{
		"people_text": {
			Name: "people_text", Type: "fulltext", Targets: []OntologyRef{employee, manager}, Properties: []string{"name"},
		},
	}
	targetIndexes := map[string]logicalIndex{
		"people_text": {
			Name: "people_text", Type: "fulltext", Targets: []OntologyRef{employee, manager}, Properties: []string{"displayName"},
		},
	}
	if err := validateDerivedResourceMaintenance(
		plan,
		map[string]constraintSpec{},
		map[string]constraintSpec{},
		baseIndexes,
		targetIndexes,
	); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("divergent shared Index rename conflict = %v", err)
	}
}

func TestOntologyRefCanonicalRoundTrip(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "A/B 中文"}
	encoded := ref.String()
	if encoded != "node:A%2FB%20%E4%B8%AD%E6%96%87" {
		t.Fatalf("encoded ref = %q", encoded)
	}
	decoded, err := ParseOntologyRef(encoded)
	if err != nil {
		t.Fatalf("parse ref: %v", err)
	}
	if decoded != ref {
		t.Fatalf("decoded ref = %#v, want %#v", decoded, ref)
	}
	if _, err := ParseOntologyRef("node:A%2fb"); err == nil {
		t.Fatal("lowercase percent escape must be rejected as non-canonical")
	}
}

func TestObjectYAMLRejectsDuplicateAndMissingRequiredFields(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name string
		body string
		code ErrorCode
	}{
		{
			name: "duplicate mapping key",
			body: "name: A\nname: B\nincludes: []\n",
			code: CodeParse,
		},
		{
			name: "missing includes",
			body: "name: A\n",
			code: CodeType,
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			_, err := ParseObjectYAML(KindDomain, []byte(test.body))
			if err == nil {
				t.Fatal("expected error")
			}
			if got := AsPublicError(err).Code; got != test.code {
				t.Fatalf("code = %s, want %s (%v)", got, test.code, err)
			}
		})
	}
}

func TestCanonicalYAMLRoundTrip(t *testing.T) {
	t.Parallel()
	title := "文档"
	description := "first line\nsecond line"
	value := ObjectValue{
		Kind: KindNodeDefinition,
		Definition: &Definition{
			Kind:        KindNodeDefinition,
			Name:        "Document",
			Title:       &title,
			Description: &description,
			Labels:      []string{"Searchable"},
			Properties: []Property{
				{Name: "content", Type: "STRING"},
			},
			Constraints: []Constraint{},
		},
	}
	body, err := RenderObjectYAML(value)
	if err != nil {
		t.Fatalf("render: %v", err)
	}
	parsed, err := ParseObjectYAML(KindNodeDefinition, body)
	if err != nil {
		t.Fatalf("parse rendered YAML: %v\n%s", err, body)
	}
	equal, err := CanonicalObjectEqual(value, parsed)
	if err != nil {
		t.Fatalf("compare: %v", err)
	}
	if !equal {
		t.Fatalf("round trip changed value\n%s", body)
	}
}

func TestGitPatchExactApply(t *testing.T) {
	t.Parallel()
	patch := strings.Join([]string{
		"diff --git a/domain:Content b/domain:Content",
		"--- a/domain:Content",
		"+++ b/domain:Content",
		"@@ -1,2 +1,3 @@",
		" name: \"Content\"",
		"+description: \"content domain\"",
		" includes: []",
	}, "\n") + "\n"
	document, err := parseGitPatch(patch)
	if err != nil {
		t.Fatalf("parse patch: %v", err)
	}
	if len(document.Entries) != 1 {
		t.Fatalf("entries = %d", len(document.Entries))
	}
	result, err := applyExactHunks("name: \"Content\"\nincludes: []\n", document.Entries[0].Hunks)
	if err != nil {
		t.Fatalf("apply: %v", err)
	}
	want := "name: \"Content\"\ndescription: \"content domain\"\nincludes: []\n"
	if result != want {
		t.Fatalf("result = %q, want %q", result, want)
	}
	_, err = applyExactHunks("name: \"Other\"\nincludes: []\n", document.Entries[0].Hunks)
	if err == nil {
		t.Fatal("mismatched base must fail")
	}
	var public *PublicError
	if !errors.As(err, &public) || public.Code != CodePatchBaseMismatch {
		t.Fatalf("mismatch error = %v", err)
	}
}

func TestGitPatchAddDeleteRequireDevNullHeaders(t *testing.T) {
	t.Parallel()
	invalidAdd := strings.Join([]string{
		"diff --git a/new:node-definition:doc b/new:node-definition:doc",
		"new file mode 100644",
		"--- a/new:node-definition:doc",
		"+++ b/new:node-definition:doc",
		"@@ -0,0 +1,1 @@",
		"+name: \"Doc\"",
	}, "\n") + "\n"
	if _, err := parseGitPatch(invalidAdd); err == nil || AsPublicError(err).Code != CodeParse {
		t.Fatalf("invalid Add header error = %v", err)
	}
	invalidDelete := strings.Join([]string{
		"diff --git a/node:Doc b/node:Doc",
		"deleted file mode 100644",
		"--- a/node:Doc",
		"+++ b/node:Doc",
		"@@ -1,1 +0,0 @@",
		"-name: \"Doc\"",
	}, "\n") + "\n"
	if _, err := parseGitPatch(invalidDelete); err == nil || AsPublicError(err).Code != CodeParse {
		t.Fatalf("invalid Delete header error = %v", err)
	}
}

func TestAnonymousConstraintNameStable(t *testing.T) {
	t.Parallel()
	spec := constraintSpec{
		Owner:      OntologyRef{Kind: KindNodeDefinition, Name: "Document"},
		Type:       "key",
		Properties: []string{"tenant", "id"},
	}
	first := anonymousConstraintName(spec)
	second := anonymousConstraintName(spec)
	if first != second || !strings.HasPrefix(first, "kgos_c_") || len(first) != len("kgos_c_")+64 {
		t.Fatalf("anonymous name = %q / %q", first, second)
	}
}

func TestAnonymousConstraintNameUsesCanonicalUTF8JSON(t *testing.T) {
	t.Parallel()
	spec := constraintSpec{
		Owner:      OntologyRef{Kind: KindNodeDefinition, Name: "Doc"},
		Type:       "unique",
		Properties: []string{"na<me中文"},
	}
	payload := []byte(`{"kind":"node","targetRefs":["node:Doc"],"type":"unique","properties":["na<me中文"]}`)
	hash := sha256.Sum256(payload)
	want := "kgos_c_" + hex.EncodeToString(hash[:])
	if got := anonymousConstraintName(spec); got != want {
		t.Fatalf("anonymous name = %q, want %q", got, want)
	}
}

func TestPropertyLocalConstraintOmitsProperties(t *testing.T) {
	t.Parallel()
	body := []byte("name: \"Doc\"\nproperties:\n  - name: \"title\"\n    type: \"STRING\"\n    constraints:\n      - name: \"doc_title_unique\"\n        type: \"unique\"\nconstraints: []\n")
	value, err := ParseObjectYAML(KindNodeDefinition, body)
	if err != nil {
		t.Fatalf("parse property-local constraint: %v", err)
	}
	if got := value.Definition.Properties[0].Constraints[0].Properties; len(got) != 0 {
		t.Fatalf("property-local constraint properties = %#v", got)
	}
	rendered, err := RenderObjectYAML(value)
	if err != nil {
		t.Fatalf("render property-local constraint: %v", err)
	}
	if strings.Contains(string(rendered), "properties: [") {
		t.Fatalf("property-local constraint repeated properties:\n%s", rendered)
	}
}

func TestRequiredFalseConflictsWithOuterNotNullType(t *testing.T) {
	t.Parallel()
	body := []byte("name: \"Doc\"\nproperties:\n  - name: \"title\"\n    type: \"STRING NOT NULL\"\n    required: false\nconstraints: []\n")
	_, err := ParseObjectYAML(KindNodeDefinition, body)
	if err == nil {
		t.Fatal("expected required:false conflict")
	}
	if got := AsPublicError(err).Code; got != CodeType {
		t.Fatalf("code = %s, want %s (%v)", got, CodeType, err)
	}
}

func TestPropertyOuterNotNullUnionNormalizesToRequired(t *testing.T) {
	t.Parallel()
	body := []byte(
		"name: \"Doc\"\nproperties:\n" +
			"  - name: \"value\"\n" +
			"    type: \"INTEGER NOT NULL | FLOAT NOT NULL\"\n" +
			"constraints: []\n",
	)
	value, err := ParseObjectYAML(KindNodeDefinition, body)
	if err != nil {
		t.Fatalf("parse required union: %v", err)
	}
	property := value.Definition.Properties[0]
	if property.Type != "INTEGER | FLOAT" || !property.Required {
		t.Fatalf("normalized property = %#v", property)
	}
	list := Property{Type: "LIST<STRING NOT NULL>"}
	if err := normalizePropertyNullability(&list); err != nil {
		t.Fatalf("normalize list: %v", err)
	}
	if list.Type != "LIST<STRING NOT NULL>" || list.Required {
		t.Fatalf("nested list nullability changed: %#v", list)
	}
}

func TestPropertyMixedTopLevelNullabilityIsRejected(t *testing.T) {
	t.Parallel()
	property := Property{Type: "INTEGER NOT NULL | FLOAT"}
	if err := normalizePropertyNullability(&property); err == nil ||
		AsPublicError(err).Code != CodeType {
		t.Fatalf("mixed top-level nullability error = %v", err)
	}
}

func TestStandaloneNotNullAndTypeConstraintsAreRejected(t *testing.T) {
	t.Parallel()
	for _, constraint := range []string{
		"      - name: \"title_present\"\n        type: \"not_null\"\n",
		"      - name: \"title_type\"\n        type: \"type\"\n        valueType: \"STRING\"\n",
	} {
		body := []byte(
			"name: \"Doc\"\nproperties:\n  - name: \"title\"\n    type: \"STRING\"\n    constraints:\n" +
				constraint +
				"constraints: []\n",
		)
		_, err := ParseObjectYAML(KindNodeDefinition, body)
		if err == nil {
			t.Fatalf("expected unsupported Constraint for:\n%s", body)
		}
		if got := AsPublicError(err).Code; got != CodeUnsupportedOperation {
			t.Fatalf("code = %s, want %s (%v)", got, CodeUnsupportedOperation, err)
		}
	}
}

func TestEquivalentRangeAndUniqueBackingIndexConflict(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Account"}
	definition := Definition{
		Kind: KindNodeDefinition,
		Name: "Account",
		Properties: []Property{
			{Name: "tenant", Type: "STRING"},
			{Name: "username", Type: "STRING"},
		},
		Constraints: []Constraint{{
			Name:       "account_unique",
			Type:       "unique",
			Properties: []string{"tenant", "username"},
		}},
		Indexes: []Index{{
			Name:       "account_range",
			Type:       "range",
			Properties: []string{"tenant", "username"},
		}},
	}
	plan := &plannedState{Objects: map[OntologyRef]*plannedObject{
		ref: {Value: ObjectValue{Kind: KindNodeDefinition, Definition: &definition}},
	}}
	constraints, err := collectConstraintSpecs(plan.Objects)
	if err != nil {
		t.Fatalf("collect constraints: %v", err)
	}
	indexes, err := collectPlannedIndexes(plan)
	if err != nil {
		t.Fatalf("collect indexes: %v", err)
	}
	err = validateConstraintIndexCoexistence(plan, constraints, indexes)
	if err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("coexistence error = %v", err)
	}
}

func TestGraphPropertySpecRoundTripProfile(t *testing.T) {
	t.Parallel()
	for _, test := range []struct {
		name     string
		spec     string
		wantName string
		wantType string
		wantReq  bool
	}{
		{
			name:     "simple",
			spec:     "title :: STRING",
			wantName: "title",
			wantType: "STRING",
		},
		{
			name:     "quoted required union",
			spec:     "`display name` :: INTEGER NOT NULL | FLOAT NOT NULL",
			wantName: "display name",
			wantType: "INTEGER | FLOAT",
			wantReq:  true,
		},
		{
			name:     "escaped backtick list",
			spec:     "`tick``name` :: LIST<STRING NOT NULL> NOT NULL",
			wantName: "tick`name",
			wantType: "LIST<STRING NOT NULL>",
			wantReq:  true,
		},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			name, propertyType, required, err := parseGraphPropertySpec(test.spec)
			if err != nil {
				t.Fatalf("parse %q: %v", test.spec, err)
			}
			if name != test.wantName || propertyType != test.wantType || required != test.wantReq {
				t.Fatalf(
					"parse %q = (%q, %q, %v), want (%q, %q, %v)",
					test.spec, name, propertyType, required,
					test.wantName, test.wantType, test.wantReq,
				)
			}
		})
	}
	if _, _, _, err := parseGraphPropertySpec("value :: INTEGER NOT NULL | FLOAT"); err == nil {
		t.Fatal("mixed union nullability must be rejected")
	}
}

func TestGraphPropertyTypeRuleRequiredUnion(t *testing.T) {
	t.Parallel()
	property := Property{Name: "value", Type: "INTEGER | FLOAT", Required: true}
	if got := graphPropertyTypeRule(property); got != "INTEGER NOT NULL | FLOAT NOT NULL" {
		t.Fatalf("required union rule = %q", got)
	}
}

func TestLithographGraphConstraintNameIsExactNotPrefixBased(t *testing.T) {
	t.Parallel()
	ref := OntologyRef{Kind: KindNodeDefinition, Name: "Person"}
	name, err := lithographGraphConstraintName(ref, []string{"name"}, "unique")
	if err != nil {
		t.Fatalf("generated name: %v", err)
	}
	if !strings.HasPrefix(name, "graph_constraint_") || len(name) != len("graph_constraint_")+16 {
		t.Fatalf("generated name = %q", name)
	}
	spec := constraintSpec{
		Name:       name,
		Owner:      ref,
		Type:       "unique",
		Properties: []string{"name"},
	}
	if err := addConstraintSpec(map[string]constraintSpec{}, spec); err == nil ||
		AsPublicError(err).Code != CodeReservedIdentifier {
		t.Fatalf("exact generated-name collision error = %v", err)
	}
	other := spec
	other.Name = "graph_constraint_user_named"
	if err := addConstraintSpec(map[string]constraintSpec{}, other); err != nil {
		t.Fatalf("prefix-only user name must remain legal: %v", err)
	}
}

func TestOntologyReadRejectsPreDatabaseInputErrors(t *testing.T) {
	t.Parallel()
	service := &Service{}
	for _, request := range []OntologyReadRequest{
		{At: "branch/main", Refs: []string{"node:A", "node:A"}},
		{At: "branch/main", Refs: make([]string, maxBatchRefs+1)},
		{At: "branch/main", Refs: []string{"node:A"}, Cursor: "unused"},
	} {
		_, err := service.ReadOntology(context.Background(), request)
		if err == nil || AsPublicError(err).Code != CodeInvalidArgument {
			t.Fatalf("request %#v error = %v", request, err)
		}
	}
	if _, err := service.ReadObject(context.Background(), "", "node:A"); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("empty ReadObject at error = %v", err)
	}
}

func TestOntologyPaginationCursorPinsStateAndScope(t *testing.T) {
	t.Parallel()
	state := "commit/" + strings.Repeat("a", 64)
	items := []Summary{
		{Kind: KindDomain, Ref: "domain:A", Name: "A"},
		{Kind: KindNodeDefinition, Ref: "node:B", Name: "B"},
		{Kind: KindRelationshipDefinition, Ref: "relationship:C", Name: "C"},
	}
	first, cursor, err := paginateSummaries(state, "overview", items, 2, "")
	if err != nil {
		t.Fatalf("first page: %v", err)
	}
	if len(first) != 2 || cursor == "" {
		t.Fatalf("first page len=%d cursor=%q", len(first), cursor)
	}
	second, next, err := paginateSummaries(state, "overview", items, 2, cursor)
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if len(second) != 1 || next != "" || second[0].Ref != "relationship:C" {
		t.Fatalf("second page = %#v next=%q", second, next)
	}
	if _, _, err := paginateSummaries("commit/"+strings.Repeat("b", 64), "overview", items, 2, cursor); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("cross-state cursor error = %v", err)
	}
	if _, _, err := paginateSummaries(state, "domain:A", items, 2, cursor); err == nil ||
		AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("cross-scope cursor error = %v", err)
	}
	trailing := base64.RawURLEncoding.EncodeToString([]byte(
		`{"v":1,"state":"` + state + `","scope":"overview","offset":2}{}`,
	))
	if _, err := decodeReadCursor(trailing); err == nil || AsPublicError(err).Code != CodeInvalidArgument {
		t.Fatalf("trailing cursor error = %v", err)
	}
}

func TestSemanticHiddenConfigClosedProfile(t *testing.T) {
	t.Parallel()
	valid := func() map[string]any {
		return map[string]any{
			"provider": "openai-compatible",
			"providerConfig": map[string]any{
				"base_url":        "https://example.invalid/v1",
				"model":           "embedding-model",
				"send_dimensions": false,
				"encoding_format": "float",
				"cache": map[string]any{
					"enabled":   false,
					"path":      "/tmp/kgos-semantic-cache.db",
					"max_bytes": float64(1024),
				},
			},
			"dimensions": float64(3),
			"similarity": "cosine",
		}
	}
	if err := validateSemanticIndexConfig(valid()); err != nil {
		t.Fatalf("valid Semantic config rejected: %v", err)
	}
	for _, mutate := range []func(map[string]any){
		func(config map[string]any) {
			config["providerConfig"].(map[string]any)["base_url"] = "https://example.invalid/v1?secret=1"
		},
		func(config map[string]any) {
			config["providerConfig"].(map[string]any)["model"] = " "
		},
		func(config map[string]any) {
			config["providerConfig"].(map[string]any)["cache"].(map[string]any)["path"] = "relative.db"
		},
		func(config map[string]any) {
			config["providerConfig"].(map[string]any)["cache"].(map[string]any)["max_bytes"] = float64(0)
		},
	} {
		config := valid()
		mutate(config)
		if err := validateSemanticIndexConfig(config); err == nil ||
			AsPublicError(err).Code != CodeConsistency {
			t.Fatalf("invalid Semantic hidden config error = %v", err)
		}
	}
}

func TestGitPatchQuotedPaths(t *testing.T) {
	t.Parallel()
	patch := strings.Join([]string{
		"diff --git \"a/domain:Content\" \"b/domain:Content\"",
		"--- \"a/domain:Content\"",
		"+++ \"b/domain:Content\"",
		"@@ -1,2 +1,3 @@",
		" name: \"Content\"",
		"+description: \"quoted path\"",
		" includes: []",
	}, "\n") + "\n"
	document, err := parseGitPatch(patch)
	if err != nil {
		t.Fatalf("parse quoted Git paths: %v", err)
	}
	if len(document.Entries) != 1 ||
		document.Entries[0].OldTarget != "domain:Content" ||
		document.Entries[0].NewTarget != "domain:Content" {
		t.Fatalf("quoted entry = %#v", document.Entries)
	}
}

func TestPatchPlanResolvesOrderIndependentAliasesAndDomainCycle(t *testing.T) {
	t.Parallel()
	addDomain := func(alias, name, include string) string {
		return strings.Join([]string{
			"diff --git a/new:domain:" + alias + " b/new:domain:" + alias,
			"new file mode 100644",
			"--- /dev/null",
			"+++ b/new:domain:" + alias,
			"@@ -0,0 +1,3 @@",
			"+name: \"" + name + "\"",
			"+includes:",
			"+  - \"" + include + "\"",
		}, "\n") + "\n"
	}
	base := &snapshot{
		State:       "commit/" + strings.Repeat("a", 64),
		Domains:     map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{},
	}
	patch := addDomain("beta", "Beta", "new:domain:alpha") +
		addDomain("alpha", "Alpha", "new:domain:beta")
	plan, err := planOntologyPatch(base, patch)
	if err != nil {
		t.Fatalf("plan cyclic aliases: %v\n%s", err, patch)
	}
	alpha := plan.Objects[OntologyRef{Kind: KindDomain, Name: "Alpha"}]
	beta := plan.Objects[OntologyRef{Kind: KindDomain, Name: "Beta"}]
	if alpha == nil || beta == nil ||
		!containsString(alpha.Value.Domain.Includes, "domain:Beta") ||
		!containsString(beta.Value.Domain.Includes, "domain:Alpha") {
		t.Fatalf("resolved cycle: alpha=%#v beta=%#v", alpha, beta)
	}
}

func TestPatchPlanRejectsDirectFutureRefWithoutAlias(t *testing.T) {
	t.Parallel()
	base := &snapshot{
		State:       "commit/" + strings.Repeat("a", 64),
		Domains:     map[string]*domainRecord{},
		Definitions: map[OntologyRef]*definitionRecord{},
	}
	patch := strings.Join([]string{
		"diff --git a/new:domain:content b/new:domain:content",
		"new file mode 100644",
		"--- /dev/null",
		"+++ b/new:domain:content",
		"@@ -0,0 +1,3 @@",
		"+name: \"Content\"",
		"+includes:",
		"+  - \"node:Document\"",
		"diff --git a/new:node-definition:doc b/new:node-definition:doc",
		"new file mode 100644",
		"--- /dev/null",
		"+++ b/new:node-definition:doc",
		"@@ -0,0 +1,5 @@",
		"+name: \"Document\"",
		"+properties:",
		"+  - name: \"id\"",
		"+    type: \"STRING\"",
		"+constraints: []",
	}, "\n") + "\n"
	_, err := planOntologyPatch(base, patch)
	if err == nil || AsPublicError(err).Code != CodeObjectNotFound {
		t.Fatalf("direct future Ref error = %v", err)
	}
}

func TestDomainNameProfile(t *testing.T) {
	t.Parallel()
	valid := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "内容", Includes: []string{}}}
	if err := normalizeObject(valid); err != nil {
		t.Fatalf("valid Domain name rejected: %v", err)
	}
	tooLong := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: strings.Repeat("x", 256), Includes: []string{}}}
	if err := normalizeObject(tooLong); err == nil || AsPublicError(err).Code != CodeType {
		t.Fatalf("overlong Domain name error = %v", err)
	}
	control := ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "bad\nname", Includes: []string{}}}
	if err := normalizeObject(control); err == nil || AsPublicError(err).Code != CodeType {
		t.Fatalf("control-character Domain name error = %v", err)
	}
}
