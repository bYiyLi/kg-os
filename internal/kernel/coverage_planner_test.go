package kernel

import (
	"strings"
	"testing"
)

func plannerBaseSnapshot() *snapshot {
	n := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	m := OntologyRef{Kind: KindNodeDefinition, Name: "M"}
	r := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}
	from := n.String()
	to := m.String()
	return &snapshot{
		State: "commit/" + strings.Repeat("a", 64),
		Domains: map[string]*domainRecord{
			"D": {Value: Domain{Name: "D", Includes: []string{n.String()}}},
		},
		Definitions: map[OntologyRef]*definitionRecord{
			n: {
				Value: Definition{
					Kind: KindNodeDefinition, Name: "N",
					Properties: []Property{
						{Name: "p", Type: "STRING"},
						{Name: "q", Type: "STRING"},
					},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
			m: {
				Value: Definition{
					Kind: KindNodeDefinition, Name: "M",
					Properties:  []Property{{Name: "p", Type: "STRING"}},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
			r: {
				Value: Definition{
					Kind: KindRelationshipDefinition, Name: "R", From: &from, To: &to,
					Properties:  []Property{{Name: "x", Type: "STRING"}},
					Constraints: []Constraint{},
				},
				PropertyElementIDs: map[string]string{},
			},
		},
	}
}

func plannedFromBaseForTest(base *snapshot) *plannedState {
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
			Value: ObjectValue{Kind: KindDomain, Domain: &value}, BaseRef: &baseRef,
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
			Value:   ObjectValue{Kind: ref.Kind, Definition: &value},
			BaseRef: &baseRef, PropertyBase: propertyBase,
		}
	}
	return plan
}

func addEntryForTest(t *testing.T, target string, value ObjectValue) patchEntry {
	t.Helper()
	body, err := RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	lines := documentLines(string(body))
	hunkLines := make([]string, 0, len(lines))
	for _, line := range lines {
		hunkLines = append(hunkLines, "+"+line)
	}
	return patchEntry{
		Operation: patchAdd,
		NewTarget: target,
		Hunks: []patchHunk{{
			OldStart: 0, OldCount: 0, NewStart: 1, NewCount: len(lines), Lines: hunkLines,
		}},
	}
}

func replaceHunksForTest(t *testing.T, oldValue, newValue ObjectValue) []patchHunk {
	t.Helper()
	oldBody, err := RenderObjectYAML(oldValue)
	if err != nil {
		t.Fatal(err)
	}
	newBody, err := RenderObjectYAML(newValue)
	if err != nil {
		t.Fatal(err)
	}
	oldLines := documentLines(string(oldBody))
	newLines := documentLines(string(newBody))
	lines := make([]string, 0, len(oldLines)+len(newLines))
	for _, line := range oldLines {
		lines = append(lines, "-"+line)
	}
	for _, line := range newLines {
		lines = append(lines, "+"+line)
	}
	return []patchHunk{{
		OldStart: 1, OldCount: len(oldLines), NewStart: 1, NewCount: len(newLines), Lines: lines,
	}}
}

func TestApplyEntryBoundaryCoverage(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	nRef := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	mRef := OntologyRef{Kind: KindNodeDefinition, Name: "M"}
	baseN, _ := base.objectValue(nRef)

	tests := []struct {
		name  string
		entry func(t *testing.T) patchEntry
		prep  func(*plannedState, map[OntologyRef]struct{}, map[string]struct{})
	}{
		{"bad add target", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchAdd, NewTarget: "bad"}
		}, nil},
		{"duplicate alias", func(t *testing.T) patchEntry {
			return addEntryForTest(t, "new:node-definition:x", ObjectValue{
				Kind: KindNodeDefinition,
				Definition: &Definition{
					Kind: KindNodeDefinition, Name: "X",
					Properties: []Property{{Name: "p", Type: "STRING"}}, Constraints: []Constraint{},
				},
			})
		}, func(_ *plannedState, _ map[OntologyRef]struct{}, aliases map[string]struct{}) {
			aliases["new:node-definition:x"] = struct{}{}
		}},
		{"invalid add yaml", func(*testing.T) patchEntry {
			return patchEntry{
				Operation: patchAdd, NewTarget: "new:domain:x",
				Hunks: []patchHunk{{OldStart: 0, NewStart: 1, NewCount: 1, Lines: []string{"+["}}},
			}
		}, nil},
		{"add existing object", func(t *testing.T) patchEntry {
			return addEntryForTest(t, "new:node-definition:n", baseN)
		}, nil},
		{"bad old ref", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchUpdate, OldTarget: "bad"}
		}, nil},
		{"duplicate base target", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchUpdate, OldTarget: nRef.String(), NewTarget: nRef.String()}
		}, func(_ *plannedState, used map[OntologyRef]struct{}, _ map[string]struct{}) {
			used[nRef] = struct{}{}
		}},
		{"missing base object", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchUpdate, OldTarget: "node:Missing", NewTarget: "node:Missing"}
		}, nil},
		{"delete without full removal", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchDelete, OldTarget: nRef.String(), NewTarget: nRef.String()}
		}, nil},
		{"bad rename target", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchRename, OldTarget: nRef.String(), NewTarget: "bad"}
		}, nil},
		{"rename changes kind", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchRename, OldTarget: nRef.String(), NewTarget: "domain:X"}
		}, nil},
		{"rename target exists", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchRename, OldTarget: nRef.String(), NewTarget: mRef.String()}
		}, nil},
		{"unsupported operation", func(*testing.T) patchEntry {
			return patchEntry{Operation: patchOperation(255)}
		}, nil},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			plan := plannedFromBaseForTest(base)
			used := map[OntologyRef]struct{}{}
			aliases := map[string]struct{}{}
			if test.prep != nil {
				test.prep(plan, used, aliases)
			}
			if err := plan.applyEntry(test.entry(t), used, aliases); err == nil {
				t.Fatal("expected failure")
			}
		})
	}

	plan := plannedFromBaseForTest(base)
	pureRename := patchEntry{Operation: patchRename, OldTarget: nRef.String(), NewTarget: "node:X"}
	if err := plan.applyEntry(pureRename, map[OntologyRef]struct{}{}, map[string]struct{}{}); err != nil {
		t.Fatalf("pure rename: %v", err)
	}
	if _, ok := plan.Objects[OntologyRef{Kind: KindNodeDefinition, Name: "X"}]; !ok ||
		plan.Transitions[nRef.String()] != "node:X" {
		t.Fatalf("pure rename plan = %#v", plan.Transitions)
	}

	plan = plannedFromBaseForTest(base)
	changedName := cloneDefinition(base.Definitions[nRef].Value)
	changedName.Name = "X"
	if err := plan.applyEntry(patchEntry{
		Operation: patchUpdate, OldTarget: nRef.String(), NewTarget: nRef.String(),
		Hunks: replaceHunksForTest(t, baseN, ObjectValue{Kind: KindNodeDefinition, Definition: &changedName}),
	}, map[OntologyRef]struct{}{}, map[string]struct{}{}); err == nil {
		t.Fatal("identifying name update without rename accepted")
	}

	plan = plannedFromBaseForTest(base)
	mismatched := cloneDefinition(base.Definitions[nRef].Value)
	mismatched.Name = "Y"
	if err := plan.applyEntry(patchEntry{
		Operation: patchRename, OldTarget: nRef.String(), NewTarget: "node:X",
		Hunks: replaceHunksForTest(t, baseN, ObjectValue{Kind: KindNodeDefinition, Definition: &mismatched}),
	}, map[OntologyRef]struct{}{}, map[string]struct{}{}); err == nil {
		t.Fatal("rename target/body mismatch accepted")
	}
}

func TestResolveDerivedReferenceBoundaryCoverage(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	nRef := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	rRef := OntologyRef{Kind: KindRelationshipDefinition, Name: "R"}

	for _, include := range []string{"new:node-definition:missing", "bad:x", "node:Future"} {
		plan := plannedFromBaseForTest(base)
		plan.Objects[OntologyRef{Kind: KindDomain, Name: "D"}].Value.Domain.Includes = []string{include}
		if err := plan.resolveDerivedReferences(); err == nil {
			t.Fatalf("invalid Domain include accepted: %q", include)
		}
	}

	plan := plannedFromBaseForTest(base)
	plan.Transitions[nRef.String()] = "node:X"
	domain := plan.Objects[OntologyRef{Kind: KindDomain, Name: "D"}]
	domain.ExplicitlyEdited = true
	domain.Value.Domain.Includes = nil
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("explicit Domain membership conflict accepted")
	}

	plan = plannedFromBaseForTest(base)
	badBase := OntologyRef{Kind: KindNodeDefinition, Name: "Missing"}
	plan.Objects[nRef].BaseRef = &badBase
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("missing Definition base record accepted")
	}

	plan = plannedFromBaseForTest(base)
	plan.Objects[nRef].Value.Definition.Properties[0].RenameFrom = "p"
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("renameFrom same Property accepted")
	}

	plan = plannedFromBaseForTest(base)
	plan.Objects[nRef].Value.Definition.Properties[0].RenameFrom = "missing"
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("renameFrom missing Property accepted")
	}

	plan = plannedFromBaseForTest(base)
	plan.Objects[nRef].Value.Definition.Properties[1].RenameFrom = "p"
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("duplicate base Property consumption accepted")
	}

	plan = plannedFromBaseForTest(base)
	badRelationshipBase := OntologyRef{Kind: KindRelationshipDefinition, Name: "Missing"}
	plan.Objects[rRef].BaseRef = &badRelationshipBase
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("missing Relationship base accepted")
	}

	plan = plannedFromBaseForTest(base)
	plan.Transitions[nRef.String()] = "node:X"
	plan.Objects[rRef].ExplicitlyEdited = true
	other := "node:M"
	plan.Objects[rRef].Value.Definition.From = &other
	if err := plan.resolveDerivedReferences(); err == nil {
		t.Fatal("explicit Relationship endpoint conflict accepted")
	}
}

func TestRebuildIndexesConflictCoverage(t *testing.T) {
	t.Parallel()
	nRef := OntologyRef{Kind: KindNodeDefinition, Name: "N"}
	mRef := OntologyRef{Kind: KindNodeDefinition, Name: "M"}
	withShared := plannerBaseSnapshot()
	shared := Index{
		Name: "shared", Type: "fulltext",
		Targets:    []string{nRef.String(), mRef.String()},
		Properties: []string{"p"},
		hiddenOptions: map[string]any{"indexConfig": map[string]any{
			"fulltext.analyzer": "unicode61", "fulltext.eventually_consistent": false,
		}},
	}
	withShared.Definitions[nRef].Value.Indexes = []Index{shared}
	withShared.Definitions[mRef].Value.Indexes = []Index{shared}

	plan := plannedFromBaseForTest(withShared)
	plan.IndexDeltas["shared"] = []indexDelta{
		{Owner: nRef, Desired: &indexDeclaration{Name: "shared", Type: "fulltext", Properties: []string{"p"}, ImplicitTarget: true}},
		{Owner: nRef, Delete: true},
	}
	if err := plan.rebuildIndexes(); err == nil {
		t.Fatal("Index update/delete conflict accepted")
	}

	plan = plannedFromBaseForTest(withShared)
	plan.IndexDeltas["shared"] = []indexDelta{
		{Owner: nRef, Delete: true},
		{Owner: nRef, Desired: &indexDeclaration{Name: "shared", Type: "fulltext", Properties: []string{"p"}, ImplicitTarget: true}},
	}
	if err := plan.rebuildIndexes(); err == nil {
		t.Fatal("Index delete/update conflict accepted")
	}

	plan = plannedFromBaseForTest(withShared)
	one := indexDeclaration{Name: "shared", Type: "fulltext", Properties: []string{"p"}, ImplicitTarget: true}
	two := indexDeclaration{Name: "shared", Type: "fulltext", Properties: []string{"q"}, ImplicitTarget: true}
	plan.IndexDeltas["shared"] = []indexDelta{{Owner: nRef, Desired: &one}, {Owner: nRef, Desired: &two}}
	if err := plan.rebuildIndexes(); err == nil {
		t.Fatal("conflicting shared Index states accepted")
	}

	plan = plannedFromBaseForTest(withShared)
	delete(plan.Objects, mRef)
	if err := plan.rebuildIndexes(); err == nil {
		t.Fatal("partially deleted shared Index target accepted")
	}

	plan = plannedFromBaseForTest(withShared)
	delete(plan.Objects, nRef)
	delete(plan.Objects, mRef)
	if err := plan.rebuildIndexes(); err != nil {
		t.Fatalf("fully deleted shared Index targets should remove resource: %v", err)
	}

	plan = plannedFromBaseForTest(withShared)
	plan.Objects[nRef].Value.Definition.Properties = []Property{{Name: "q", Type: "STRING"}}
	if err := plan.rebuildIndexes(); err == nil {
		t.Fatal("Index source Property removal accepted")
	}
}

func TestPlannerComparisonAndNoOpCoverage(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	plan := plannedFromBaseForTest(base)
	if noOp, err := plan.isNoOp(); err != nil || !noOp {
		t.Fatalf("unchanged plan no-op = %v err=%v", noOp, err)
	}
	plan.Objects[OntologyRef{Kind: KindNodeDefinition, Name: "N"}].Value.Definition.Description = stringPointerForTest("changed")
	if noOp, err := plan.isNoOp(); err != nil || noOp {
		t.Fatalf("changed plan no-op = %v err=%v", noOp, err)
	}
	for _, mutate := range []func(*plannedState){
		func(p *plannedState) { delete(p.Objects, OntologyRef{Kind: KindDomain, Name: "D"}) },
		func(p *plannedState) { p.Transitions["node:N"] = "node:X" },
		func(p *plannedState) { p.Aliases["new:node-definition:x"] = CreatedObject{Ref: "node:X"} },
		func(p *plannedState) {
			p.PropertyRenames[OntologyRef{Kind: KindNodeDefinition, Name: "N"}] = map[string]string{"p": "q"}
		},
	} {
		candidate := plannedFromBaseForTest(base)
		mutate(candidate)
		if noOp, err := candidate.isNoOp(); err != nil || noOp {
			t.Fatalf("semantic change reported no-op: %v err=%v", noOp, err)
		}
	}

	left := logicalIndex{Name: "i", Type: "range", Targets: []OntologyRef{{Kind: KindNodeDefinition, Name: "N"}}, Properties: []string{"p"}}
	if !equalLogicalIndex(left, left, false) {
		t.Fatal("equal logical Index mismatch")
	}
	for _, right := range []logicalIndex{
		{Name: "j", Type: "range", Targets: left.Targets, Properties: left.Properties},
		{Name: "i", Type: "text", Targets: left.Targets, Properties: left.Properties},
		{Name: "i", Type: "range", Targets: left.Targets, Properties: []string{"q"}},
		{Name: "i", Type: "range", Targets: nil, Properties: left.Properties},
		{Name: "i", Type: "range", Targets: []OntologyRef{{Kind: KindNodeDefinition, Name: "M"}}, Properties: left.Properties},
	} {
		if equalLogicalIndex(left, right, false) {
			t.Fatalf("different logical Index reported equal: %#v", right)
		}
	}
	left.Hidden = map[string]any{"x": "a"}
	right := left
	right.Hidden = map[string]any{"x": "b"}
	if equalLogicalIndex(left, right, true) || !equalLogicalIndex(left, right, false) {
		t.Fatal("hidden Index equality mismatch")
	}
}

func stringPointerForTest(value string) *string { return &value }
