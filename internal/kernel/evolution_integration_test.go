//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase06StateCreateExpectedParentCAS(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	invalidData := json.RawMessage("{")
	if _, err := runtime.Database.CreateCommit(ctx, "main", base, &invalidData, nil, nil); err == nil {
		t.Fatal("direct State create accepted invalid JSON data")
	}
	assertMainState(t, runtime, base)
	advanced, err := runtime.Database.CreateCommit(ctx, "main", base, nil, nil, nil)
	if err != nil {
		t.Fatalf("advance main: %v", err)
	}
	if advanced == base {
		t.Fatal("direct State create did not advance main")
	}
	if _, err := runtime.Database.CreateCommit(ctx, "main", base, nil, nil, nil); !errors.Is(err, lithograph.ErrBranchHeadMoved) {
		t.Fatalf("stale expected parent error = %v", err)
	}
	assertMainState(t, runtime, advanced)
}

func TestPhase06EvolutionStateDataRefsAndPinnedAncestry(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	overview, err := runtime.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatalf("overview: %v", err)
	}
	base := overview.State
	if overview.DefaultBranch != "main" || !strings.HasPrefix(base, "commit/") {
		t.Fatalf("overview = %#v", overview)
	}
	baseDetail, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: "branch/main"})
	if err != nil {
		t.Fatalf("get base: %v", err)
	}
	if baseDetail.State != base || baseDetail.HasData || string(baseDetail.Data) != "null" ||
		baseDetail.Consistency.Status != "valid" {
		t.Fatalf("base detail = %#v", baseDetail)
	}

	author := "phase06-test"
	message := "explicit empty delta"
	nullData := json.RawMessage("null")
	first, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{
		Branch: "main", Data: nullData, Author: &author, Message: &message,
	})
	if err != nil {
		t.Fatalf("create empty-delta State: %v", err)
	}
	if first.State == base {
		t.Fatal("state create did not create a new Commit")
	}
	firstDetail, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: first.State})
	if err != nil {
		t.Fatalf("get first State: %v", err)
	}
	if len(firstDetail.Parents) != 1 || firstDetail.Parents[0] != base || !firstDetail.HasData ||
		string(firstDetail.Data) != "null" || firstDetail.Author == nil || *firstDetail.Author != author ||
		firstDetail.Message == nil || *firstDetail.Message != message {
		t.Fatalf("first detail = %#v", firstDetail)
	}
	emptyDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: first.State, Scope: "all",
	})
	if err != nil {
		t.Fatalf("empty-delta diff: %v", err)
	}
	if len(emptyDiff.Items) != 0 {
		t.Fatalf("empty-delta diff = %#v", emptyDiff.Items)
	}
	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: first.State, Scope: "all", Limit: 1,
	})
	if err != nil {
		t.Fatalf("empty-delta history: %v", err)
	}
	if len(history.Items) != 1 || history.Items[0].State != first.State || history.Items[0].Change != nil {
		t.Fatalf("empty-delta history = %#v", history)
	}

	set, err := runtime.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{
		State: "branch/main", Data: json.RawMessage(`{"note":"diagnostic"}`),
	})
	if err != nil {
		t.Fatalf("set State Data: %v", err)
	}
	if set.State != first.State || string(set.Data) != `{"note":"diagnostic"}` {
		t.Fatalf("set data = %#v", set)
	}
	assertMainState(t, runtime, first.State)
	if _, err := runtime.Kernel.EvolutionStateClearData(ctx, kernel.StateClearDataRequest{State: "branch/main"}); err != nil {
		t.Fatalf("clear State Data: %v", err)
	}
	assertMainState(t, runtime, first.State)
	cleared, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: first.State})
	if err != nil || cleared.HasData || string(cleared.Data) != "null" {
		t.Fatalf("cleared detail = %#v err=%v", cleared, err)
	}

	branch, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "side", From: first.State})
	if err != nil || branch.State != first.State {
		t.Fatalf("create branch = %#v err=%v", branch, err)
	}
	tag, err := runtime.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "release", Target: base})
	if err != nil || tag.State != base {
		t.Fatalf("create tag = %#v err=%v", tag, err)
	}

	second, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil {
		t.Fatalf("create second State: %v", err)
	}
	moved, err := runtime.Kernel.EvolutionTagMove(ctx, kernel.TagMoveRequest{Name: "release", Target: second.State})
	if err != nil || moved.State != second.State || moved.PreviousState != base {
		t.Fatalf("move tag = %#v err=%v", moved, err)
	}

	pageOne, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: "branch/main", Limit: 1})
	if err != nil {
		t.Fatalf("ancestry first page: %v", err)
	}
	if pageOne.Root != second.State || len(pageOne.Items) != 1 || pageOne.Items[0].State != second.State || pageOne.Cursor == "" {
		t.Fatalf("ancestry page one = %#v", pageOne)
	}
	third, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil {
		t.Fatalf("move main after ancestry page: %v", err)
	}
	pageTwo, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{
		Root: "branch/main", Limit: 1, Cursor: pageOne.Cursor,
	})
	if err != nil {
		t.Fatalf("ancestry pinned continuation: %v", err)
	}
	if pageTwo.Root != second.State || len(pageTwo.Items) != 1 || pageTwo.Items[0].State == third.State {
		t.Fatalf("ancestry continuation followed moved branch: %#v", pageTwo)
	}

	branches, err := runtime.Kernel.EvolutionBranchList(ctx)
	if err != nil || len(branches.Items) < 2 || branches.Items[0].Name != "main" || branches.Items[1].Name != "side" {
		t.Fatalf("branch list = %#v err=%v", branches, err)
	}
	tags, err := runtime.Kernel.EvolutionTagList(ctx)
	if err != nil || len(tags.Items) != 1 || tags.Items[0].Name != "release" || tags.Items[0].State != second.State {
		t.Fatalf("tag list = %#v err=%v", tags, err)
	}
}

func TestPhase06EvolutionInvalidStateBoundaryAndAnnotation(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Person",
			Properties: []kernel.Property{{Name: "name", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:person", person),
	})
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Person' DETACH DELETE d FINISH",
	}); err != nil {
		t.Fatalf("seed invalid binding state: %v", err)
	}
	invalid, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil || invalid == created.State {
		t.Fatalf("invalid state = %q err=%v", invalid, err)
	}
	detail, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: invalid})
	if err != nil {
		t.Fatalf("get invalid State: %v", err)
	}
	if detail.Consistency.Status != "invalid" || len(detail.Consistency.Issues) != 1 ||
		detail.Consistency.Issues[0].Code != "BINDING_MISSING" || strings.Contains(detail.Consistency.Issues[0].Message, "__kgos") {
		t.Fatalf("invalid consistency = %#v", detail.Consistency)
	}
	if _, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: invalid, Limit: 2}); err != nil {
		t.Fatalf("ancestry must navigate invalid State: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: invalid, Scope: "all",
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("diff invalid State error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "invalid-copy", From: invalid}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("branch target invalid State error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("create from invalid head error = %v", err)
	}
	annotation := json.RawMessage(`{"reason":"diagnostic"}`)
	if _, err := runtime.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{State: invalid, Data: annotation}); err != nil {
		t.Fatalf("annotate invalid State: %v", err)
	}
	assertMainState(t, runtime, invalid)
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.branch.create('invalid-cleanup', $from) YIELD name RETURN name",
		Params: map[string]any{"from": invalid},
	}); err != nil {
		t.Fatalf("seed cleanup Branch on invalid State: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchDelete(ctx, kernel.BranchDeleteRequest{Name: "invalid-cleanup"}); err != nil {
		t.Fatalf("cleanup invalid branch: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchDelete(ctx, kernel.BranchDeleteRequest{Name: "main"}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("main Branch deletion error = %v", err)
	}
}

func TestPhase06EvolutionSharedIndexAndChangePagination(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}

	targets := []string{"new:node-definition:employee", "new:node-definition:manager"}
	employee := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Employee",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{
				{Name: "people_text_a", Type: "fulltext", Targets: targets, Properties: []string{"name"}},
				{Name: "people_text_b", Type: "fulltext", Targets: targets, Properties: []string{"team"}},
			},
		},
	}
	manager := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Manager",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addObjectPatch(t, "new:node-definition:employee", employee) +
			addObjectPatch(t, "new:node-definition:manager", manager),
	})
	if err != nil {
		t.Fatalf("create shared-index Ontology: %v", err)
	}
	employeeBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Employee")
	if err != nil {
		t.Fatalf("read Employee: %v", err)
	}
	updatedEmployee := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Employee",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{
				{Name: "people_text_a", Type: "fulltext", Targets: []string{"node:Employee", "node:Manager"}, Properties: []string{"name", "team"}},
				{Name: "people_text_b", Type: "fulltext", Targets: []string{"node:Employee", "node:Manager"}, Properties: []string{"team", "name"}},
			},
		},
	}
	updatedBody, err := kernel.RenderObjectYAML(updatedEmployee)
	if err != nil {
		t.Fatalf("render updated Employee: %v", err)
	}
	updated, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch("node:Employee", string(employeeBody.YAML), string(updatedBody)),
	})
	if err != nil {
		t.Fatalf("update shared indexes: %v", err)
	}

	pageOne, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: updated.State, Scope: "ontology", Limit: 1,
	})
	if err != nil {
		t.Fatalf("shared Index Diff page one: %v", err)
	}
	if len(pageOne.Items) != 1 || pageOne.Cursor == "" {
		t.Fatalf("shared Index page one = %#v", pageOne)
	}
	pageTwo, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: updated.State, Scope: "ontology", Limit: 1, Cursor: pageOne.Cursor,
	})
	if err != nil {
		t.Fatalf("shared Index Diff page two: %v", err)
	}
	if len(pageTwo.Items) != 1 || pageTwo.Cursor != "" {
		t.Fatalf("shared Index page two = %#v", pageTwo)
	}
	for _, change := range append(pageOne.Items, pageTwo.Items...) {
		if change.Path != "/indexes" || change.BeforeRef != "node:Employee" || change.AfterRef != "node:Employee" ||
			len(change.RelatedRefs) != 1 || change.RelatedRefs[0] != "node:Manager" {
			t.Fatalf("shared Index change = %#v", change)
		}
	}
	managerScoped, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: updated.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: updated.State, Ref: "node:Manager"},
	})
	if err != nil || len(managerScoped.Items) != 2 {
		t.Fatalf("Manager-scoped shared Index Diff = %#v err=%v", managerScoped, err)
	}
}

func TestPhase06EvolutionKnowledgeReplacementAndPinnedHistory(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	knowledgePatch := addRawObjectPatch(
		"new:knowledge-relationship:knows",
		`type: "KNOWS"
start: "new:knowledge-node:alice"
end: "new:knowledge-node:bob"
properties:
  "since": 2026
`,
	) + addRawObjectPatch(
		"new:knowledge-node:bob",
		`labels:
  - "Person"
properties:
  "name": "Bob"
`,
	) + addRawObjectPatch(
		"new:knowledge-node:alice",
		`labels:
  - "Person"
properties:
  "name": "Alice"
`,
	)
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: knowledgePatch,
	})
	if err != nil {
		t.Fatalf("create Knowledge fixture: %v", err)
	}
	refs := map[string]string{}
	for _, item := range created.Created {
		refs[item.Alias] = item.Ref
	}
	historyOne, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: "branch/main", Scope: "knowledge", Limit: 1,
	})
	if err != nil {
		t.Fatalf("Knowledge History page one: %v", err)
	}
	if historyOne.Root != created.State || len(historyOne.Items) != 1 || historyOne.Cursor == "" || historyOne.Items[0].Change == nil {
		t.Fatalf("Knowledge History page one = %#v", historyOne)
	}
	marker, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil {
		t.Fatalf("advance main after History page one: %v", err)
	}
	historyTwo, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: "branch/main", Scope: "knowledge", Limit: 1, Cursor: historyOne.Cursor,
	})
	if err != nil {
		t.Fatalf("Knowledge History pinned page two: %v", err)
	}
	if historyTwo.Root != created.State || len(historyTwo.Items) != 1 || historyTwo.Items[0].State != created.State ||
		historyTwo.Items[0].Change == nil || historyTwo.Items[0].State == marker.State {
		t.Fatalf("Knowledge History page two followed moved Branch: %#v", historyTwo)
	}

	relationshipBody, err := runtime.Kernel.ReadObject(ctx, marker.State, refs["knows"])
	if err != nil {
		t.Fatalf("read relationship before replacement: %v", err)
	}
	replacementBody := strings.Replace(string(relationshipBody.YAML), `type: "KNOWS"`, `type: "LIKES"`, 1)
	replaced, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: marker.State, Branch: "main",
		Patch: replaceObjectPatch(refs["knows"], string(relationshipBody.YAML), replacementBody),
	})
	if err != nil {
		t.Fatalf("replace relationship: %v", err)
	}
	if len(replaced.Transitions) != 1 {
		t.Fatalf("relationship transitions = %#v", replaced.Transitions)
	}
	newRelationship := replaced.Transitions[0].To
	replacementDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: marker.State, After: replaced.State, Scope: "knowledge",
	})
	if err != nil {
		t.Fatalf("relationship replacement Diff: %v", err)
	}
	if len(replacementDiff.Items) != 2 {
		t.Fatalf("relationship replacement changes = %#v", replacementDiff.Items)
	}
	foundDelete := false
	foundAdd := false
	for _, change := range replacementDiff.Items {
		if change.Change == "delete" && change.BeforeRef == refs["knows"] && change.AfterRef == "" {
			foundDelete = true
		}
		if change.Change == "add" && change.AfterRef == newRelationship && change.BeforeRef == "" {
			foundAdd = true
		}
	}
	if !foundDelete || !foundAdd {
		t.Fatalf("replacement did not project Delete + Add: %#v", replacementDiff.Items)
	}
	encoded, err := json.Marshal(replacementDiff)
	if err != nil {
		t.Fatalf("marshal replacement Diff: %v", err)
	}
	if strings.Contains(string(encoded), "__kgos_") || strings.Contains(string(encoded), "_lithograph_") {
		t.Fatalf("replacement Diff leaked internal identity: %s", encoded)
	}
	newObjectDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: marker.State, After: replaced.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: replaced.State, Ref: newRelationship},
	})
	if err != nil || len(newObjectDiff.Items) != 1 || newObjectDiff.Items[0].Change != "add" {
		t.Fatalf("new Relationship scoped Diff = %#v err=%v", newObjectDiff, err)
	}
}

func TestPhase06EvolutionRenameContinuityAndNameReuse(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	doc := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Doc",
			Properties: []kernel.Property{{Name: "title", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:doc", doc),
	})
	if err != nil {
		t.Fatalf("create Doc: %v", err)
	}
	docBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Doc")
	if err != nil {
		t.Fatalf("read Doc: %v", err)
	}
	article := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Article",
			Properties: []kernel.Property{{Name: "title", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	articleBody, err := kernel.RenderObjectYAML(article)
	if err != nil {
		t.Fatalf("render Article: %v", err)
	}
	renamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: renameObjectPatch("node:Doc", "node:Article", string(docBody.YAML), string(articleBody)),
	})
	if err != nil {
		t.Fatalf("rename Doc: %v", err)
	}
	renameDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: created.State, After: renamed.State, Scope: "ontology",
	})
	if err != nil || len(renameDiff.Items) != 1 {
		t.Fatalf("rename Diff = %#v err=%v", renameDiff, err)
	}
	renameChange := renameDiff.Items[0]
	if renameChange.Change != "rename" || renameChange.BeforeRef != "node:Doc" || renameChange.AfterRef != "node:Article" {
		t.Fatalf("rename change = %#v", renameChange)
	}

	currentArticle, err := runtime.Kernel.ReadObject(ctx, renamed.State, "node:Article")
	if err != nil {
		t.Fatalf("read Article: %v", err)
	}
	deleted, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: renamed.State, Branch: "main", Patch: deleteObjectPatch("node:Article", string(currentArticle.YAML)),
	})
	if err != nil {
		t.Fatalf("delete Article: %v", err)
	}
	newDoc := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Doc",
			Properties: []kernel.Property{{Name: "body", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	recreated, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: deleted.State, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:new-doc", newDoc),
	})
	if err != nil {
		t.Fatalf("recreate Doc: %v", err)
	}
	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: recreated.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: recreated.State, Ref: "node:Doc"},
	})
	if err != nil {
		t.Fatalf("new Doc History: %v", err)
	}
	nonNull := make([]kernel.Change, 0)
	for _, item := range history.Items {
		if item.Change != nil {
			nonNull = append(nonNull, *item.Change)
		}
	}
	if len(nonNull) != 1 || nonNull[0].Change != "add" || nonNull[0].AfterRef != "node:Doc" {
		t.Fatalf("name-reused Doc history stitched old identity: %#v", history.Items)
	}
}

func TestPhase06EvolutionMultiParentHistoryPreservesTopology(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "side", From: base}); err != nil {
		t.Fatalf("create side Branch: %v", err)
	}
	mainWrite, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main", Cypher: "CREATE (:MainOnly {value: 1}) FINISH",
	})
	if err != nil {
		t.Fatalf("write main: %v", err)
	}
	sideWrite, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "side", Cypher: "CREATE (:SideOnly {value: 2}) FINISH",
	})
	if err != nil {
		t.Fatalf("write side: %v", err)
	}
	start, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.merge.start($source) YIELD session, revision, status RETURN session, revision, status",
		Params: json.RawMessage("{\"source\":\"branch/side\"}"),
	})
	if err != nil {
		t.Fatalf("start merge: %v", err)
	}
	session := graphResultString(t, start, "session")
	revision := graphResultInt64(t, start, "revision")
	status := graphResultString(t, start, "status")
	if status != "ready" {
		t.Fatalf("merge start status = %q, want ready", status)
	}
	params, err := json.Marshal(map[string]any{"session": session, "revision": revision})
	if err != nil {
		t.Fatalf("marshal finalize params: %v", err)
	}
	finalized, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{
		Branch: "main",
		Cypher: "CALL lithograph.merge.finalize($session, $revision) YIELD status, commit RETURN status, commit",
		Params: params,
	})
	if err != nil {
		t.Fatalf("finalize merge: %v", err)
	}
	if status := graphResultString(t, finalized, "status"); status != "merged" {
		t.Fatalf("merge finalize status = %q", status)
	}
	merged := graphResultString(t, finalized, "commit")
	detail, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: merged})
	if err != nil {
		t.Fatalf("get merged State: %v", err)
	}
	if len(detail.Parents) != 2 || detail.Parents[0] != mainWrite.State || detail.Parents[1] != sideWrite.State {
		t.Fatalf("merged parents = %#v, main=%s side=%s", detail.Parents, mainWrite.State, sideWrite.State)
	}
	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: merged, Scope: "knowledge", Limit: 10,
	})
	if err != nil {
		t.Fatalf("merged History: %v", err)
	}
	foundMergedEntry := false
	for _, item := range history.Items {
		if item.State != merged {
			continue
		}
		if len(item.Parents) != 2 {
			t.Fatalf("merged History lost second parent: %#v", item)
		}
		if item.Change != nil && item.Change.Change == "add" && item.Change.Kind == kernel.KindKnowledgeNode {
			foundMergedEntry = true
		}
	}
	if !foundMergedEntry {
		t.Fatalf("merged History did not interpret first-parent delta: %#v", history.Items)
	}
}

func TestPhase06EvolutionObjectHistoryAnchorAncestryAndRefFailures(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}

	doc := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Doc",
			Properties: []kernel.Property{{Name: "title", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:doc", doc),
	})
	if err != nil {
		t.Fatalf("create Doc: %v", err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Doc")
	if err != nil {
		t.Fatalf("read Doc: %v", err)
	}
	updatedValue := doc
	description := "history anchor"
	updatedValue.Definition = &kernel.Definition{
		Kind: kernel.KindNodeDefinition, Name: "Doc", Description: &description,
		Properties: []kernel.Property{{Name: "title", Type: "STRING"}}, Constraints: []kernel.Constraint{},
	}
	updatedBody, err := kernel.RenderObjectYAML(updatedValue)
	if err != nil {
		t.Fatalf("render updated Doc: %v", err)
	}
	updated, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: replaceObjectPatch("node:Doc", string(body.YAML), string(updatedBody)),
	})
	if err != nil {
		t.Fatalf("update Doc: %v", err)
	}
	marker, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil {
		t.Fatalf("create marker: %v", err)
	}
	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: marker.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: updated.State, Ref: "node:Doc"},
		Limit:  10,
	})
	if err != nil {
		t.Fatalf("object History with ancestral anchor: %v", err)
	}
	if history.Root != marker.State || len(history.Items) == 0 {
		t.Fatalf("object History = %#v", history)
	}
	foundUpdate := false
	for _, item := range history.Items {
		if item.Change != nil && item.Change.AfterRef == "node:Doc" {
			foundUpdate = true
		}
	}
	if !foundUpdate {
		t.Fatalf("object History omitted Doc continuity: %#v", history.Items)
	}

	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "side", From: created.State}); err != nil {
		t.Fatalf("create side: %v", err)
	}
	side, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "side"})
	if err != nil {
		t.Fatalf("advance side: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: marker.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: side.State, Ref: "node:Doc"},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("non-ancestral History anchor error = %v", err)
	}

	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "bad/../name", From: marker.State}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("invalid Branch name error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "release", Target: "commit/" + strings.Repeat("0", 64)}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeStateNotFound {
		t.Fatalf("missing Tag target error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionTagMove(ctx, kernel.TagMoveRequest{Name: "missing", Target: marker.State}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeTagNotFound {
		t.Fatalf("missing Tag move error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionTagDelete(ctx, kernel.TagDeleteRequest{Name: "missing"}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeTagNotFound {
		t.Fatalf("missing Tag delete error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{State: marker.State}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("nil State Data error = %v", err)
	}
}

func TestPhase06EvolutionKnowledgeAndDomainObjectContinuity(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}

	createdKnowledge, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addRawObjectPatch(
			"new:knowledge-node:alice",
			"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Alice\"\n",
		),
	})
	if err != nil {
		t.Fatalf("create Knowledge node: %v", err)
	}
	if len(createdKnowledge.Created) != 1 {
		t.Fatalf("created Knowledge refs = %#v", createdKnowledge.Created)
	}
	nodeRef := createdKnowledge.Created[0].Ref
	nodeBody, err := runtime.Kernel.ReadObject(ctx, createdKnowledge.State, nodeRef)
	if err != nil {
		t.Fatalf("read Knowledge node: %v", err)
	}
	updatedNodeBody := strings.Replace(string(nodeBody.YAML), "\"Alice\"", "\"Alicia\"", 1)
	updatedKnowledge, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: createdKnowledge.State,
		Branch:    "main",
		Patch:     replaceObjectPatch(nodeRef, string(nodeBody.YAML), updatedNodeBody),
	})
	if err != nil {
		t.Fatalf("update Knowledge node: %v", err)
	}
	nodeDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: createdKnowledge.State, After: updatedKnowledge.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: updatedKnowledge.State, Ref: nodeRef},
	})
	if err != nil {
		t.Fatalf("Knowledge object Diff: %v", err)
	}
	if len(nodeDiff.Items) != 1 || nodeDiff.Items[0].Change != "update" ||
		nodeDiff.Items[0].BeforeRef != nodeRef || nodeDiff.Items[0].AfterRef != nodeRef ||
		nodeDiff.Items[0].Path != "/properties" {
		t.Fatalf("Knowledge object Diff = %#v", nodeDiff.Items)
	}
	nodeHistory, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: updatedKnowledge.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: updatedKnowledge.State, Ref: nodeRef},
	})
	if err != nil {
		t.Fatalf("Knowledge object History: %v", err)
	}
	if len(nodeHistory.Items) < 2 {
		t.Fatalf("Knowledge object History = %#v", nodeHistory.Items)
	}

	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name:     "Content",
			Includes: []string{"new:node-definition:topic"},
		},
	}
	topic := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Topic",
			Properties: []kernel.Property{{Name: "name", Type: "STRING"}}, Constraints: []kernel.Constraint{},
		},
	}
	createdDomain, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: updatedKnowledge.State,
		Branch:    "main",
		Patch: addObjectPatch(t, "new:domain:content", domain) +
			addObjectPatch(t, "new:node-definition:topic", topic),
	})
	if err != nil {
		t.Fatalf("create Domain: %v", err)
	}
	domainBody, err := runtime.Kernel.ReadObject(ctx, createdDomain.State, "domain:Content")
	if err != nil {
		t.Fatalf("read Domain: %v", err)
	}
	title := "Content domain"
	updatedDomainValue := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name:     "Content",
			Title:    &title,
			Includes: []string{"node:Topic"},
		},
	}
	updatedDomainBody, err := kernel.RenderObjectYAML(updatedDomainValue)
	if err != nil {
		t.Fatalf("render updated Domain: %v", err)
	}
	updatedDomain, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: createdDomain.State,
		Branch:    "main",
		Patch:     replaceObjectPatch("domain:Content", string(domainBody.YAML), string(updatedDomainBody)),
	})
	if err != nil {
		t.Fatalf("update Domain: %v", err)
	}
	domainDiff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: createdDomain.State, After: updatedDomain.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: createdDomain.State, Ref: "domain:Content"},
	})
	if err != nil {
		t.Fatalf("Domain object Diff: %v", err)
	}
	if len(domainDiff.Items) != 1 || domainDiff.Items[0].Path != "/title" ||
		domainDiff.Items[0].BeforeRef != "domain:Content" || domainDiff.Items[0].AfterRef != "domain:Content" {
		t.Fatalf("Domain object Diff = %#v", domainDiff.Items)
	}

	if _, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: createdDomain.State, After: updatedDomain.State, Scope: "knowledge",
		Object: &kernel.EvolutionObjectFilter{AnchorState: updatedDomain.State, Ref: "domain:Content"},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("non-object scope with object filter error = %v", err)
	}
}

func TestPhase06EvolutionValidationAndCursorMisuse(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addRawObjectPatch(
			"new:knowledge-node:a",
			"labels:\n  - \"Item\"\nproperties:\n  \"name\": \"A\"\n",
		) + addRawObjectPatch(
			"new:knowledge-node:b",
			"labels:\n  - \"Item\"\nproperties:\n  \"name\": \"B\"\n",
		),
	})
	if err != nil {
		t.Fatalf("create cursor fixture: %v", err)
	}

	for _, request := range []kernel.EvolutionGetRequest{
		{State: "bad"},
		{State: "commit/" + strings.Repeat("0", 64)},
	} {
		if _, err := runtime.Kernel.EvolutionGet(ctx, request); err == nil {
			t.Fatalf("EvolutionGet(%q) succeeded", request.State)
		}
	}
	if _, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: "bad"}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("invalid Ancestry root error = %v", err)
	}
	ancestry, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{
		Root: "branch/main", Limit: 1,
	})
	if err != nil || ancestry.Cursor == "" {
		t.Fatalf("Ancestry page = %#v err=%v", ancestry, err)
	}
	if _, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{
		Root: "tag/missing", Limit: 1, Cursor: ancestry.Cursor,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("Ancestry cursor mismatch error = %v", err)
	}

	diff, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "knowledge", Limit: 1,
	})
	if err != nil || diff.Cursor == "" || len(diff.Items) != 1 {
		t.Fatalf("Diff page = %#v err=%v", diff, err)
	}
	if _, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "all", Limit: 1, Cursor: diff.Cursor,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("Diff cursor scope mismatch error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: base, Ref: "n:999999"},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("Diff missing object error = %v", err)
	}
	marker, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	if err != nil {
		t.Fatalf("create non-endpoint anchor marker: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{
		Before: base, After: created.State, Scope: "object",
		Object: &kernel.EvolutionObjectFilter{AnchorState: marker.State, Ref: created.Created[0].Ref},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("Diff non-endpoint anchor error = %v", err)
	}

	history, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: created.State, Scope: "knowledge", Limit: 1,
	})
	if err != nil || history.Cursor == "" || len(history.Items) != 1 {
		t.Fatalf("History page = %#v err=%v", history, err)
	}
	if _, err := runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{
		Root: created.State, Scope: "all", Limit: 1, Cursor: history.Cursor,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("History cursor scope mismatch error = %v", err)
	}

	if _, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{
		Branch: "main", Data: json.RawMessage("{"),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("invalid State create data error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "missing"}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeBranchNotFound {
		t.Fatalf("missing State create Branch error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{
		State: "commit/" + strings.Repeat("0", 64), Data: json.RawMessage("null"),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeStateNotFound {
		t.Fatalf("missing set-data State error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionStateClearData(ctx, kernel.StateClearDataRequest{
		State: "commit/" + strings.Repeat("0", 64),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeStateNotFound {
		t.Fatalf("missing clear-data State error = %v", err)
	}

	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "copy", From: created.State}); err != nil {
		t.Fatalf("create copy Branch: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "copy", From: created.State}); err == nil {
		t.Fatal("duplicate Branch create succeeded")
	}
	if _, err := runtime.Kernel.EvolutionBranchDelete(ctx, kernel.BranchDeleteRequest{Name: "missing"}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeBranchNotFound {
		t.Fatalf("missing Branch delete error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "release", Target: created.State}); err != nil {
		t.Fatalf("create release Tag: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "release", Target: created.State}); err == nil {
		t.Fatal("duplicate Tag create succeeded")
	}
}

func TestPhase06EvolutionClosedHostFailsCleanly(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := runtimehost.Open(ctx, home, nil)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	state, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve State: %v", err)
	}
	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime: %v", err)
	}

	assertError := func(name string, err error) {
		t.Helper()
		if err == nil {
			t.Fatalf("%s unexpectedly succeeded on closed Host", name)
		}
	}
	_, err = runtime.Kernel.EvolutionOverview(ctx)
	assertError("overview", err)
	_, err = runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: state})
	assertError("get", err)
	_, err = runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: state})
	assertError("ancestry", err)
	_, err = runtime.Kernel.EvolutionHistory(ctx, kernel.EvolutionHistoryRequest{Root: state, Scope: "all"})
	assertError("history", err)
	_, err = runtime.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{Before: state, After: state, Scope: "all"})
	assertError("diff", err)
	_, err = runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
	assertError("state.create", err)
	_, err = runtime.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{State: state, Data: json.RawMessage("null")})
	assertError("state.set-data", err)
	_, err = runtime.Kernel.EvolutionStateClearData(ctx, kernel.StateClearDataRequest{State: state})
	assertError("state.clear-data", err)
	_, err = runtime.Kernel.EvolutionBranchList(ctx)
	assertError("branch.list", err)
	_, err = runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "copy", From: state})
	assertError("branch.create", err)
	_, err = runtime.Kernel.EvolutionBranchDelete(ctx, kernel.BranchDeleteRequest{Name: "copy"})
	assertError("branch.delete", err)
	_, err = runtime.Kernel.EvolutionTagList(ctx)
	assertError("tag.list", err)
	_, err = runtime.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "release", Target: state})
	assertError("tag.create", err)
	_, err = runtime.Kernel.EvolutionTagMove(ctx, kernel.TagMoveRequest{Name: "release", Target: state})
	assertError("tag.move", err)
	_, err = runtime.Kernel.EvolutionTagDelete(ctx, kernel.TagDeleteRequest{Name: "release"})
	assertError("tag.delete", err)
}

func graphResultString(t *testing.T, result kernel.GraphExecuteResult, column string) string {
	t.Helper()
	index := graphResultColumn(t, result.Columns, column)
	if len(result.Rows) != 1 || index >= len(result.Rows[0]) {
		t.Fatalf("Graph result %q row shape = %#v", column, result.Rows)
	}
	var value string
	if err := json.Unmarshal(result.Rows[0][index], &value); err != nil {
		t.Fatalf("decode Graph result %q: %v", column, err)
	}
	return value
}

func graphResultInt64(t *testing.T, result kernel.GraphExecuteResult, column string) int64 {
	t.Helper()
	index := graphResultColumn(t, result.Columns, column)
	if len(result.Rows) != 1 || index >= len(result.Rows[0]) {
		t.Fatalf("Graph result %q row shape = %#v", column, result.Rows)
	}
	var value int64
	if err := json.Unmarshal(result.Rows[0][index], &value); err != nil {
		t.Fatalf("decode Graph result %q: %v", column, err)
	}
	return value
}

func graphResultColumn(t *testing.T, columns []string, name string) int {
	t.Helper()
	for index, column := range columns {
		if column == name {
			return index
		}
	}
	t.Fatalf("Graph result is missing column %q in %#v", name, columns)
	return -1
}
