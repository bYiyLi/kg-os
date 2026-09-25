//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestPhase07EvolutionMergeConflictResolveFinalizeAndRecovery(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addRawObjectPatch(
			"new:knowledge-node:first",
			"labels:\n  - \"Item\"\nproperties:\n  \"name\": \"First\"\n",
		) + addRawObjectPatch(
			"new:knowledge-node:second",
			"labels:\n  - \"Item\"\nproperties:\n  \"name\": \"Second\"\n",
		),
	})
	if err != nil || len(seeded.Created) != 2 {
		t.Fatalf("seed merge objects = %#v err=%v", seeded, err)
	}
	firstRef := seeded.Created[0].Ref
	secondRef := seeded.Created[1].Ref
	firstBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, firstRef)
	if err != nil {
		t.Fatalf("read first seed: %v", err)
	}
	secondBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, secondRef)
	if err != nil {
		t.Fatalf("read second seed: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: seeded.State,
	}); err != nil {
		t.Fatalf("create side branch: %v", err)
	}

	ours, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State,
		Branch:    "main",
		Patch: replaceObjectPatch(
			firstRef, string(firstBody.YAML),
			strings.Replace(string(firstBody.YAML), "\"First\"", "\"Ours First\"", 1),
		) + replaceObjectPatch(
			secondRef, string(secondBody.YAML),
			strings.Replace(string(secondBody.YAML), "\"Second\"", "\"Ours Second\"", 1),
		),
	})
	if err != nil {
		t.Fatalf("create ours State: %v", err)
	}
	theirs, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State,
		Branch:    "side",
		Patch: replaceObjectPatch(
			firstRef, string(firstBody.YAML),
			strings.Replace(string(firstBody.YAML), "\"First\"", "\"Theirs First\"", 1),
		) + replaceObjectPatch(
			secondRef, string(secondBody.YAML),
			strings.Replace(string(secondBody.YAML), "\"Second\"", "\"Theirs Second\"", 1),
		),
	})
	if err != nil {
		t.Fatalf("create theirs State: %v", err)
	}

	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil {
		t.Fatalf("start conflicted merge: %v", err)
	}
	if started.TargetState != ours.State || started.SourceState != theirs.State ||
		started.Status != "conflicted" || started.Unresolved < 2 || started.Revision < 1 {
		t.Fatalf("started merge = %#v", started)
	}
	session := started.Session
	revision := started.Revision

	if err := runtime.Close(); err != nil {
		t.Fatalf("close runtime before recovery: %v", err)
	}
	runtime, err = openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("reopen runtime: %v", err)
	}
	defer runtime.Close()
	recovered, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: session})
	if err != nil || recovered.Revision != revision || recovered.TargetState != ours.State ||
		recovered.SourceState != theirs.State {
		t.Fatalf("recovered merge = %#v err=%v", recovered, err)
	}
	listed, err := runtime.Kernel.EvolutionMergeList(ctx, kernel.MergeListRequest{Limit: 10})
	if err != nil || !containsMergeSession(listed.Items, session) {
		t.Fatalf("merge list = %#v err=%v", listed, err)
	}

	pageOne, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: session, Limit: 1,
	})
	if err != nil {
		t.Fatalf("first conflict page: %v", err)
	}
	if pageOne.Revision != revision || len(pageOne.Items) != 1 || pageOne.Cursor == "" {
		t.Fatalf("first conflict page = %#v", pageOne)
	}
	firstConflict := pageOne.Items[0]
	if firstConflict.Kind != kernel.KindKnowledgeNode ||
		firstConflict.Path != "/properties" ||
		firstConflict.BaseRef == "" ||
		firstConflict.OursRef == "" || firstConflict.TheirsRef == "" ||
		strings.Contains(firstConflict.Path, "__kgos") ||
		strings.Contains(firstConflict.Path, "node/") {
		t.Fatalf("public conflict leaked native identity = %#v", firstConflict)
	}
	if _, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: session, ExpectedRevision: revision,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeConflict {
		t.Fatalf("unresolved finalize error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: session, ExpectedRevision: revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: "unknown-conflict", Choice: "ours",
		}},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeInvalidArgument {
		t.Fatalf("unknown conflictId error = %v", err)
	}
	unchanged, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: session})
	if err != nil || unchanged.Revision != revision {
		t.Fatalf("unknown conflict changed Session = %#v err=%v", unchanged, err)
	}
	resolvedOne, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session:          session,
		ExpectedRevision: revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: firstConflict.ConflictID, Choice: "ours",
		}},
	})
	if err != nil {
		t.Fatalf("resolve first conflict: %v", err)
	}
	if resolvedOne.Revision <= revision || resolvedOne.Unresolved != started.Unresolved-1 {
		t.Fatalf("first resolution result = %#v", resolvedOne)
	}
	if _, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: session, Limit: 1, Cursor: pageOne.Cursor,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale conflict cursor error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: session, ExpectedRevision: revision,
		Resolutions: []kernel.MergeResolution{{ConflictID: firstConflict.ConflictID, Choice: "ours"}},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale resolution error = %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: session, ExpectedRevision: revision,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale finalize error = %v", err)
	}

	remaining, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: session, Limit: 10,
	})
	if err != nil {
		t.Fatalf("remaining conflicts: %v", err)
	}
	var unresolved kernel.MergeConflict
	for _, conflict := range remaining.Items {
		if conflict.Resolution == nil {
			unresolved = conflict
			break
		}
	}
	if unresolved.ConflictID == "" {
		t.Fatalf("no unresolved conflict in %#v", remaining.Items)
	}
	var mergedProperties map[string]json.RawMessage
	if err := json.Unmarshal(unresolved.Ours, &mergedProperties); err != nil {
		t.Fatalf("decode unresolved public properties: %v", err)
	}
	mergedProperties["name"] = json.RawMessage(`"Merged"`)
	mergedValue, err := json.Marshal(mergedProperties)
	if err != nil {
		t.Fatalf("encode explicit merge value: %v", err)
	}
	resolvedAll, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session:          session,
		ExpectedRevision: remaining.Revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: unresolved.ConflictID, Choice: "value", Value: mergedValue,
		}},
	})
	if err != nil {
		t.Fatalf("resolve final conflict with explicit value: %v", err)
	}
	if resolvedAll.Status != "ready" || resolvedAll.Unresolved != 0 {
		t.Fatalf("ready merge = %#v", resolvedAll)
	}
	noOp, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session:          session,
		ExpectedRevision: resolvedAll.Revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: unresolved.ConflictID, Choice: "value", Value: mergedValue,
		}},
	})
	if err != nil || noOp.Revision != resolvedAll.Revision {
		t.Fatalf("no-op resolution = %#v err=%v", noOp, err)
	}

	author := "phase07-test"
	message := "resolve merge"
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: session, ExpectedRevision: noOp.Revision, Author: &author, Message: &message,
	})
	if err != nil {
		t.Fatalf("finalize merge: %v", err)
	}
	if finalized.Status != "merged" || finalized.TargetState != ours.State ||
		finalized.SourceState != theirs.State || finalized.State == ours.State ||
		finalized.State == theirs.State {
		t.Fatalf("finalized merge = %#v", finalized)
	}
	detail, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: finalized.State})
	if err != nil || len(detail.Parents) != 2 || detail.Parents[0] != ours.State ||
		detail.Parents[1] != theirs.State || detail.Author == nil || *detail.Author != author ||
		detail.Message == nil || *detail.Message != message {
		t.Fatalf("merge commit detail = %#v err=%v", detail, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: session}); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeMergeSessionNotFound {
		t.Fatalf("finalized session still exists: %v", err)
	}
}

func TestPhase07EvolutionMergeFastForwardUpToDateAndAbort(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: base,
	}); err != nil {
		t.Fatalf("create side: %v", err)
	}
	source, err := runtime.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "side"})
	if err != nil {
		t.Fatalf("advance side: %v", err)
	}
	fastForward, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || fastForward.Status != "fast_forward" || fastForward.Unresolved != 0 {
		t.Fatalf("fast-forward session = %#v err=%v", fastForward, err)
	}
	secondFastForward, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || secondFastForward.Status != "fast_forward" {
		t.Fatalf("second fast-forward session = %#v err=%v", secondFastForward, err)
	}
	firstListPage, err := runtime.Kernel.EvolutionMergeList(ctx, kernel.MergeListRequest{Limit: 1})
	if err != nil || len(firstListPage.Items) != 1 || firstListPage.Cursor == "" {
		t.Fatalf("merge list first page = %#v err=%v", firstListPage, err)
	}
	secondListPage, err := runtime.Kernel.EvolutionMergeList(ctx, kernel.MergeListRequest{
		Limit: 1, Cursor: firstListPage.Cursor,
	})
	if err != nil || len(secondListPage.Items) != 1 {
		t.Fatalf("merge list second page = %#v err=%v", secondListPage, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{
		Session: secondFastForward.Session, ExpectedRevision: secondFastForward.Revision,
	}); err != nil {
		t.Fatalf("abort second fast-forward Session: %v", err)
	}
	empty, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: fastForward.Session, Limit: 1,
	})
	if err != nil || empty.Revision != fastForward.Revision || len(empty.Items) != 0 {
		t.Fatalf("empty conflict page = %#v err=%v", empty, err)
	}
	ffResult, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: fastForward.Session, ExpectedRevision: fastForward.Revision,
	})
	if err != nil || ffResult.Status != "fast_forward" || ffResult.State != source.State {
		t.Fatalf("fast-forward finalize = %#v err=%v", ffResult, err)
	}

	upToDate, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: source.State,
	})
	if err != nil || upToDate.Status != "up_to_date" || upToDate.Unresolved != 0 {
		t.Fatalf("up-to-date session = %#v err=%v", upToDate, err)
	}
	upResult, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: upToDate.Session, ExpectedRevision: upToDate.Revision,
	})
	if err != nil || upResult.Status != "up_to_date" || upResult.State != source.State {
		t.Fatalf("up-to-date finalize = %#v err=%v", upResult, err)
	}

	abortable, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: source.State,
	})
	if err != nil {
		t.Fatalf("start abortable session: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{
		Session: abortable.Session, ExpectedRevision: abortable.Revision + 1,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeMergeSessionChanged {
		t.Fatalf("stale abort error = %v", err)
	}
	aborted, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{
		Session: abortable.Session, ExpectedRevision: abortable.Revision,
	})
	if err != nil || aborted.Session != abortable.Session {
		t.Fatalf("abort = %#v err=%v", aborted, err)
	}
}

func TestPhase07EvolutionMergeInvalidDirectSessionBoundary(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
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
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:node-definition:person", person),
	})
	if err != nil {
		t.Fatalf("create valid merge base: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "invalid-source", From: created.State,
	}); err != nil {
		t.Fatalf("create invalid-source branch: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "invalid-source",
		Cypher: "MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Person' DETACH DELETE d FINISH",
	}); err != nil {
		t.Fatalf("seed invalid source State: %v", err)
	}
	invalid, err := runtime.Database.ResolveState(ctx, "branch/invalid-source")
	if err != nil || invalid == created.State {
		t.Fatalf("invalid source = %q err=%v", invalid, err)
	}

	if _, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/invalid-source",
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("KG OS start accepted invalid source: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "invalid-source", Source: created.State,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("KG OS start accepted invalid target: %v", err)
	}

	direct, err := runtime.Database.StartMerge(ctx, "main", invalid, created.State)
	if err != nil {
		t.Fatalf("create direct Lithograph invalid Session: %v", err)
	}
	listed, err := runtime.Kernel.EvolutionMergeList(ctx, kernel.MergeListRequest{Limit: 100})
	if err != nil || !containsMergeSession(listed.Items, direct.Session) {
		t.Fatalf("list direct invalid Session = %#v err=%v", listed, err)
	}
	got, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: direct.Session})
	if err != nil || got.TargetState != created.State || got.SourceState != invalid {
		t.Fatalf("get direct invalid Session = %#v err=%v", got, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: direct.Session, Limit: 10,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("conflicts accepted invalid pinned State: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: direct.Session, ExpectedRevision: direct.Revision,
		Resolutions: []kernel.MergeResolution{},
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("resolve accepted invalid pinned State: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: direct.Session, ExpectedRevision: direct.Revision,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("finalize accepted invalid pinned State: %v", err)
	}
	aborted, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{
		Session: direct.Session, ExpectedRevision: direct.Revision,
	})
	if err != nil || aborted.Session != direct.Session {
		t.Fatalf("abort direct invalid Session = %#v err=%v", aborted, err)
	}
	assertMainState(t, runtime, created.State)
}

func TestPhase07EvolutionMergeRejectsInvalidRenameCandidate(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
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
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:node-definition:person", person),
	})
	if err != nil {
		t.Fatalf("create Person: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: created.State,
	}); err != nil {
		t.Fatalf("create side branch: %v", err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Person")
	if err != nil {
		t.Fatalf("read Person: %v", err)
	}
	humanBody := strings.Replace(string(body.YAML), "name: \"Person\"", "name: \"Human\"", 1)
	individualBody := strings.Replace(string(body.YAML), "name: \"Person\"", "name: \"Individual\"", 1)
	human, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: renameObjectPatch("node:Person", "node:Human", string(body.YAML), humanBody),
	})
	if err != nil {
		t.Fatalf("rename main Person to Human: %v", err)
	}
	individual, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "side",
		Patch: renameObjectPatch("node:Person", "node:Individual", string(body.YAML), individualBody),
	})
	if err != nil {
		t.Fatalf("rename side Person to Individual: %v", err)
	}

	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || started.Status != "conflicted" || started.Unresolved < 1 {
		t.Fatalf("start rename merge = %#v err=%v", started, err)
	}
	page, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 100,
	})
	if err != nil {
		t.Fatalf("read rename conflicts: %v", err)
	}
	var renameConflict kernel.MergeConflict
	for _, conflict := range page.Items {
		if conflict.Kind == kernel.KindNodeDefinition && conflict.Path == "/name" {
			renameConflict = conflict
			break
		}
	}
	if renameConflict.ConflictID == "" ||
		renameConflict.BaseRef != "node:Person" ||
		renameConflict.OursRef != "node:Human" ||
		renameConflict.TheirsRef != "node:Individual" ||
		string(renameConflict.Ours) != `"Human"` ||
		string(renameConflict.Theirs) != `"Individual"` {
		t.Fatalf("rename conflict = %#v", renameConflict)
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: page.Revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: renameConflict.ConflictID, Choice: "ours",
		}},
	})
	if err != nil {
		t.Fatalf("resolve rename conflict: %v", err)
	}
	if resolved.Status != "ready" || resolved.Unresolved != 0 {
		t.Fatalf("resolved rename Session = %#v", resolved)
	}
	if _, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
		t.Fatalf("invalid rename candidate finalize error = %v", err)
	}
	stillOpen, err := runtime.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: started.Session})
	if err != nil || stillOpen.Revision != resolved.Revision {
		t.Fatalf("invalid candidate did not preserve Session = %#v err=%v", stillOpen, err)
	}
	if _, err := runtime.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	}); err != nil {
		t.Fatalf("abort invalid candidate Session: %v", err)
	}
	assertMainState(t, runtime, human.State)
	if individual.State == human.State {
		t.Fatal("rename branches did not diverge")
	}
}

func TestPhase07EvolutionMergeSharedIndexProjectsOneConflict(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	newTargets := []string{"new:node-definition:employee", "new:node-definition:manager"}
	employee := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Employee",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{{
				Name: "people_text", Type: "fulltext",
				Targets: newTargets, Properties: []string{"name"},
			}},
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
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:node-definition:employee", employee) +
			addObjectPatch(t, "new:node-definition:manager", manager),
	})
	if err != nil {
		t.Fatalf("create shared Index fixture: %v", err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: created.State,
	}); err != nil {
		t.Fatalf("create side branch: %v", err)
	}
	employeeBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Employee")
	if err != nil {
		t.Fatalf("read Employee: %v", err)
	}
	managerBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Manager")
	if err != nil {
		t.Fatalf("read Manager: %v", err)
	}
	targets := []string{"node:Employee", "node:Manager"}
	employeeOurs := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Employee",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{{
				Name: "people_text", Type: "fulltext",
				Targets: targets, Properties: []string{"name", "team"},
			}},
		},
	}
	managerTheirs := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Manager",
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}, {Name: "team", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
			Indexes: []kernel.Index{{
				Name: "people_text", Type: "fulltext",
				Targets: targets, Properties: []string{"team"},
			}},
		},
	}
	employeeOursYAML, err := kernel.RenderObjectYAML(employeeOurs)
	if err != nil {
		t.Fatalf("render Employee ours: %v", err)
	}
	managerTheirsYAML, err := kernel.RenderObjectYAML(managerTheirs)
	if err != nil {
		t.Fatalf("render Manager theirs: %v", err)
	}
	ours, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main",
		Patch: replaceObjectPatch(
			"node:Employee", string(employeeBody.YAML), string(employeeOursYAML),
		),
	})
	if err != nil {
		t.Fatalf("update shared Index on main: %v", err)
	}
	theirs, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "side",
		Patch: replaceObjectPatch(
			"node:Manager", string(managerBody.YAML), string(managerTheirsYAML),
		),
	})
	if err != nil {
		t.Fatalf("update shared Index on side: %v", err)
	}

	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || started.Status != "conflicted" {
		t.Fatalf("start shared Index merge = %#v err=%v", started, err)
	}
	page, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 100,
	})
	if err != nil {
		t.Fatalf("read shared Index conflicts: %v", err)
	}
	if len(page.Items) != 1 {
		t.Fatalf("shared Index conflicts = %#v", page.Items)
	}
	conflict := page.Items[0]
	if conflict.Kind != kernel.KindNodeDefinition ||
		conflict.Path != "/indexes" ||
		conflict.OursRef != "node:Employee" ||
		conflict.TheirsRef != "node:Employee" ||
		len(conflict.RelatedRefs) != 1 ||
		conflict.RelatedRefs[0] != "node:Manager" {
		t.Fatalf("shared Index public conflict = %#v", conflict)
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: page.Revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: conflict.ConflictID, Choice: "ours",
		}},
	})
	if err != nil || resolved.Status != "ready" || resolved.Unresolved != 0 {
		t.Fatalf("resolve shared Index conflict = %#v err=%v", resolved, err)
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	})
	if err != nil || finalized.Status != "merged" ||
		finalized.TargetState != ours.State || finalized.SourceState != theirs.State {
		t.Fatalf("finalize shared Index merge = %#v err=%v", finalized, err)
	}
	for _, ref := range []string{"node:Employee", "node:Manager"} {
		body, readErr := runtime.Kernel.ReadObject(ctx, finalized.State, ref)
		if readErr != nil ||
			!strings.Contains(string(body.YAML), "people_text") ||
			!strings.Contains(string(body.YAML), "- \"name\"") ||
			!strings.Contains(string(body.YAML), "- \"team\"") {
			t.Fatalf("merged shared Index %s = %q err=%v", ref, body.YAML, readErr)
		}
	}
}

func TestPhase07EvolutionMergeKnowledgeRelationshipPropertyConflict(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (a:Item {name:'A'}), (b:Item {name:'B'}), " +
			"(a)-[:LINK {note:'Base'}]->(b) FINISH",
	}); err != nil {
		t.Fatalf("seed Relationship conflict fixture: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded State: %v", err)
	}
	query, err := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
		At:     "branch/main",
		Cypher: "MATCH ()-[r:LINK]->() RETURN elementId(r) AS id",
	})
	if err != nil || len(query.Rows) != 1 || len(query.Rows[0]) != 1 {
		t.Fatalf("read Relationship identity = %#v err=%v", query, err)
	}
	var relationshipRef string
	if err := json.Unmarshal(query.Rows[0][0], &relationshipRef); err != nil ||
		!strings.HasPrefix(relationshipRef, "r:") {
		t.Fatalf("Relationship Ref = %q err=%v", relationshipRef, err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: seeded,
	}); err != nil {
		t.Fatalf("create side branch: %v", err)
	}
	oursResult, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "MATCH ()-[r:LINK]->() SET r.note='Ours' FINISH",
	})
	if err != nil {
		t.Fatalf("update Relationship on main: %v", err)
	}
	_ = oursResult
	ours, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve ours: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "side",
		Cypher: "MATCH ()-[r:LINK]->() SET r.note='Theirs' FINISH",
	}); err != nil {
		t.Fatalf("update Relationship on side: %v", err)
	}
	theirs, err := runtime.Database.ResolveState(ctx, "branch/side")
	if err != nil {
		t.Fatalf("resolve theirs: %v", err)
	}

	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil || started.Status != "conflicted" || started.Unresolved != 1 {
		t.Fatalf("start Relationship merge = %#v err=%v", started, err)
	}
	page, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 10,
	})
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("Relationship conflicts = %#v err=%v", page, err)
	}
	conflict := page.Items[0]
	if conflict.Kind != kernel.KindKnowledgeRelationship ||
		conflict.Path != "/properties" ||
		conflict.BaseRef != relationshipRef ||
		conflict.OursRef != relationshipRef ||
		conflict.TheirsRef != relationshipRef {
		t.Fatalf("Relationship public conflict = %#v", conflict)
	}
	var properties map[string]json.RawMessage
	if err := json.Unmarshal(conflict.Theirs, &properties); err != nil {
		t.Fatalf("decode Relationship properties: %v", err)
	}
	properties["note"] = json.RawMessage(`"Merged"`)
	value, err := json.Marshal(properties)
	if err != nil {
		t.Fatalf("encode Relationship resolution: %v", err)
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: page.Revision,
		Resolutions: []kernel.MergeResolution{{
			ConflictID: conflict.ConflictID, Choice: "value", Value: value,
		}},
	})
	if err != nil || resolved.Status != "ready" || resolved.Unresolved != 0 {
		t.Fatalf("resolve Relationship conflict = %#v err=%v", resolved, err)
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	})
	if err != nil || finalized.Status != "merged" ||
		finalized.TargetState != ours || finalized.SourceState != theirs {
		t.Fatalf("finalize Relationship merge = %#v err=%v", finalized, err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, finalized.State, relationshipRef)
	if err != nil || !strings.Contains(string(body.YAML), "Merged") {
		t.Fatalf("merged Relationship = %q err=%v", body.YAML, err)
	}
}

func TestPhase07EvolutionMergeKnowledgeNodeDeleteVersusUpdate(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main",
		Cypher: "CREATE (:Item {name:'Base', stable:'keep'}) FINISH",
	}); err != nil {
		t.Fatalf("seed Node delete/update fixture: %v", err)
	}
	seeded, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve seeded State: %v", err)
	}
	query, err := runtime.Kernel.QueryGraph(ctx, kernel.GraphQueryRequest{
		At: "branch/main", Cypher: "MATCH (n:Item) RETURN elementId(n) AS id",
	})
	if err != nil || len(query.Rows) != 1 || len(query.Rows[0]) != 1 {
		t.Fatalf("read Node identity = %#v err=%v", query, err)
	}
	var nodeRef string
	if err := json.Unmarshal(query.Rows[0][0], &nodeRef); err != nil ||
		!strings.HasPrefix(nodeRef, "n:") {
		t.Fatalf("Node Ref = %q err=%v", nodeRef, err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "side", From: seeded,
	}); err != nil {
		t.Fatalf("create side branch: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "main", Cypher: "MATCH (n:Item) DETACH DELETE n FINISH",
	}); err != nil {
		t.Fatalf("delete Node on main: %v", err)
	}
	ours, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve ours: %v", err)
	}
	if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
		Branch: "side", Cypher: "MATCH (n:Item) SET n.name='Theirs' FINISH",
	}); err != nil {
		t.Fatalf("update Node on side: %v", err)
	}
	theirs, err := runtime.Database.ResolveState(ctx, "branch/side")
	if err != nil {
		t.Fatalf("resolve theirs: %v", err)
	}

	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{
		Branch: "main", Source: "branch/side",
	})
	if err != nil {
		t.Fatalf("start Node delete/update merge: %v", err)
	}
	if started.Status != "conflicted" || started.Unresolved == 0 {
		t.Fatalf("Node delete/update session = %#v", started)
	}
	page, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{
		Session: started.Session, Limit: 100,
	})
	if err != nil {
		t.Fatalf("Node delete/update conflicts: %v", err)
	}
	var whole *kernel.MergeConflict
	for index := range page.Items {
		conflict := &page.Items[index]
		if conflict.Kind == kernel.KindKnowledgeNode &&
			conflict.Path == "" &&
			(conflict.OursRef == "" || conflict.TheirsRef == "") {
			whole = conflict
			break
		}
	}
	if whole == nil {
		t.Fatalf("whole Node conflict missing: %#v", page.Items)
	}
	if whole.TheirsRef != nodeRef || whole.OursRef != "" ||
		len(whole.Theirs) == 0 || len(whole.Ours) != 0 {
		t.Fatalf("whole Node conflict = %#v", *whole)
	}
	resolutions := make([]kernel.MergeResolution, 0, len(page.Items))
	for _, conflict := range page.Items {
		if conflict.Resolution == nil {
			resolutions = append(resolutions, kernel.MergeResolution{
				ConflictID: conflict.ConflictID, Choice: "theirs",
			})
		}
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: page.Revision, Resolutions: resolutions,
	})
	if err != nil || resolved.Status != "ready" || resolved.Unresolved != 0 {
		t.Fatalf("resolve Node delete/update merge = %#v err=%v", resolved, err)
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{
		Session: started.Session, ExpectedRevision: resolved.Revision,
	})
	if err != nil || finalized.Status != "merged" ||
		finalized.TargetState != ours || finalized.SourceState != theirs {
		t.Fatalf("finalize Node delete/update merge = %#v err=%v", finalized, err)
	}
	body, err := runtime.Kernel.ReadObject(ctx, finalized.State, nodeRef)
	if err != nil || !strings.Contains(string(body.YAML), "Theirs") ||
		!strings.Contains(string(body.YAML), "keep") {
		t.Fatalf("merged Node = %q err=%v", body.YAML, err)
	}
}

func containsMergeSession(items []kernel.MergeSessionSummary, session string) bool {
	for _, item := range items {
		if item.Session == session {
			return true
		}
	}
	return false
}
