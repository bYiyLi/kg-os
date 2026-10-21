//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"os"
	"reflect"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

// Exercise the public state/ref behaviors taught by the Skill, not an AI world classifier.
func TestBranchSkillWorlds(t *testing.T) {
	t.Run("long-lived-worlds-and-full-inheritance", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		for _, name := range []string{"novel-writing", "personal-learning", "vlog"} {
			createBranchSkillRef(t, r, name, base)
		}
		novel := seedBranchSkillWorld(t, r, "novel-writing", base, "WritingTip", "Novel evidence")
		learning := seedBranchSkillWorld(t, r, "personal-learning", base, "LearningNote", "Learning evidence")
		assertBranchSkillHead(t, r, "main", base)
		assertBranchSkillHead(t, r, "vlog", base)
		assertBranchSkillRows(t, r, novel, "MATCH (n:WritingTip) RETURN n.text", [][]any{{"Novel evidence"}})
		assertBranchSkillRows(t, r, novel, "MATCH (n:LearningNote) RETURN count(n)", [][]any{{float64(0)}})
		if _, err := r.Kernel.ReadObject(context.Background(), novel, "node:LearningNote"); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
			t.Fatalf("unrelated model inherited: %v", err)
		}
		createBranchSkillRef(t, r, "novel-experiment", novel)
		before, err := r.Kernel.ReadObject(context.Background(), novel, "node:WritingTip")
		if err != nil {
			t.Fatal(err)
		}
		copy, err := r.Kernel.ReadObject(context.Background(), "branch/novel-experiment", "node:WritingTip")
		if err != nil || string(copy.YAML) != string(before.YAML) {
			t.Fatalf("complete schema inheritance: %v", err)
		}
		advanced := graphExecute(t, r, "novel-writing", "MATCH (n:WritingTip) SET n.text='New novel evidence'", nil)
		assertBranchSkillHead(t, r, "novel-experiment", novel)
		assertBranchSkillHead(t, r, "personal-learning", learning)
		assertBranchSkillRows(t, r, novel, "MATCH (n:WritingTip) RETURN n.text", [][]any{{"Novel evidence"}})
		assertBranchSkillRows(t, r, advanced.State, "MATCH (n:WritingTip) RETURN n.text", [][]any{{"New novel evidence"}})
		_, err = r.Kernel.EvolutionBranchCreate(context.Background(), kernel.BranchCreateRequest{Name: "novel-writing", From: base})
		if err == nil {
			t.Fatal("duplicate branch name overwritten")
		}
		assertBranchSkillHead(t, r, "novel-writing", advanced.State)
	})
	t.Run("valid-clean-base-is-not-raw-root", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		ctx := context.Background()
		detail, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: base})
		if err != nil || detail.Consistency.Status != "valid" || len(detail.Parents) != 1 {
			t.Fatalf("bootstrap prerequisite: %+v %v", detail, err)
		}
		// Validity alone does not establish a clean origin: verify the complete empty fixture.
		model, err := r.Kernel.ReadOntology(ctx, kernel.OntologyReadRequest{At: base})
		if err != nil || model.State != base || len(model.Results) != 1 || model.Results[0].Total != 0 || model.Results[0].Cursor != "" || len(model.Results[0].Items) != 0 {
			t.Fatalf("bootstrap model not fully empty: %+v %v", model, err)
		}
		assertBranchSkillRows(t, r, base, "MATCH (n) RETURN count(n)", [][]any{{float64(0)}})
		assertBranchSkillRows(t, r, base, "MATCH ()-[r]->() RETURN count(r)", [][]any{{float64(0)}})
		_, err = r.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "invalid-origin", From: detail.Parents[0]})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConsistency {
			t.Fatalf("raw pre-KGOS root accepted: %v", err)
		}
		refs, err := r.Kernel.EvolutionBranchList(ctx)
		if err != nil {
			t.Fatal(err)
		}
		for _, ref := range refs.Items {
			if ref.Name == "invalid-origin" {
				t.Fatal("invalid create left a branch")
			}
		}
		createBranchSkillRef(t, r, "clean-world", base)
		assertBranchSkillHead(t, r, "main", base)
	})
	t.Run("shared-state-data-is-not-branch-metadata", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		ctx := context.Background()
		createBranchSkillRef(t, r, "one", base)
		createBranchSkillRef(t, r, "two", base)
		data := json.RawMessage(`{"note":"shared annotation"}`)
		changed, err := r.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{State: "branch/one", Data: data})
		if err != nil || changed.State != base {
			t.Fatalf("sidecar changed State: %+v %v", changed, err)
		}
		for _, name := range []string{"main", "one", "two"} {
			got, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: "branch/" + name})
			if err != nil || got.State != base || !got.HasData || string(got.Data) != string(data) {
				t.Fatalf("shared annotation via %s: %+v %v", name, got, err)
			}
		}
		unique, err := r.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "two"})
		if err != nil {
			t.Fatal(err)
		}
		_, err = r.Kernel.EvolutionStateSetData(ctx, kernel.StateSetDataRequest{State: unique.State, Data: json.RawMessage(`{"note":"unique annotation"}`)})
		if err != nil {
			t.Fatal(err)
		}
		original, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: base})
		if err != nil || string(original.Data) != string(data) {
			t.Fatalf("unique commit annotation changed original: %v", err)
		}
		diff, err := r.Kernel.EvolutionDiff(ctx, kernel.EvolutionDiffRequest{Before: base, After: unique.State, Scope: "all"})
		if err != nil || len(diff.Items) != 0 {
			t.Fatalf("sidecar/empty-delta not empty: %+v %v", diff, err)
		}
		assertBranchSkillHead(t, r, "one", base)
		assertBranchSkillHead(t, r, "two", unique.State)
	})
	t.Run("combine-complete-worlds-without-moving-sources", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		ctx := context.Background()
		createBranchSkillRef(t, r, "novel", base)
		createBranchSkillRef(t, r, "learning", base)
		novel := seedBranchSkillWorld(t, r, "novel", base, "WritingTip", "A writing method")
		learning := seedBranchSkillWorld(t, r, "learning", base, "LearningNote", "A learning method")
		createBranchSkillRef(t, r, "combined", learning)
		session, err := r.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "combined", Source: novel})
		if err != nil || session.Status != "ready" || session.Unresolved != 0 || session.TargetState != learning || session.SourceState != novel {
			t.Fatalf("whole state merge start: %+v %v", session, err)
		}
		assertBranchSkillHead(t, r, "combined", learning)
		result, err := r.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: session.Session, ExpectedRevision: session.Revision})
		if err != nil || result.Status != "merged" {
			t.Fatalf("whole state finalize: %+v %v", result, err)
		}
		for _, pair := range [][2]string{{"WritingTip", novel}, {"LearningNote", learning}} {
			old, err := r.Kernel.ReadObject(ctx, pair[1], "node:"+pair[0])
			if err != nil {
				t.Fatal(err)
			}
			got, err := r.Kernel.ReadObject(ctx, result.State, "node:"+pair[0])
			if err != nil || string(got.YAML) != string(old.YAML) {
				t.Fatalf("merged model %s: %v", pair[0], err)
			}
		}
		assertBranchSkillRows(t, r, result.State, "MATCH (n:WritingTip) RETURN n.text", [][]any{{"A writing method"}})
		assertBranchSkillRows(t, r, result.State, "MATCH (n:LearningNote) RETURN n.text", [][]any{{"A learning method"}})
		detail, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: result.State})
		if err != nil || len(detail.Parents) != 2 {
			t.Fatalf("merged topology: %+v %v", detail, err)
		}
		assertBranchSkillHead(t, r, "novel", novel)
		assertBranchSkillHead(t, r, "learning", learning)
		assertBranchSkillHead(t, r, "main", base)
	})
	t.Run("merge-propagates-deletion-not-set-union", func(t *testing.T) {
		r, _ := newBranchSkillRuntime(t)
		ctx := context.Background()
		seed := graphExecute(t, r, "main", "CREATE (:BranchExample {key:'A'}),(:BranchExample {key:'B'})", nil)
		createBranchSkillRef(t, r, "source", seed.State)
		removed := graphExecute(t, r, "source", "MATCH (n:BranchExample {key:'A'}) DELETE n", nil)
		target := graphExecute(t, r, "main", "CREATE (:BranchExample {key:'C'})", nil)
		session, err := r.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: removed.State})
		if err != nil || session.Status != "ready" {
			t.Fatalf("deletion scenario: %+v %v", session, err)
		}
		assertMainState(t, r, target.State)
		merged, err := r.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: session.Session, ExpectedRevision: session.Revision})
		if err != nil || merged.Status != "merged" {
			t.Fatalf("deletion merge: %+v %v", merged, err)
		}
		assertBranchSkillRows(t, r, merged.State, "MATCH (n:BranchExample) RETURN n.key ORDER BY n.key", [][]any{{"B"}, {"C"}})
		assertBranchSkillRows(t, r, seed.State, "MATCH (n:BranchExample) RETURN n.key ORDER BY n.key", [][]any{{"A"}, {"B"}})
		assertBranchSkillHead(t, r, "source", removed.State)
	})
	t.Run("fast-forward-message-and-reference-retention", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		ctx := context.Background()
		createBranchSkillRef(t, r, "source", base)
		message := "## 简介\n\n一个明确阶段的知识世界。\n\n## 改动\n\n显式创建阶段State，未改变图内容。"
		source, err := r.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "source", Message: &message})
		if err != nil {
			t.Fatal(err)
		}
		session, err := r.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: source.State})
		if err != nil || session.Status != "fast_forward" {
			t.Fatalf("FF start: %+v %v", session, err)
		}
		assertMainState(t, r, base)
		ignored := "not a new commit"
		result, err := r.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: session.Session, ExpectedRevision: session.Revision, Message: &ignored})
		if err != nil || result.State != source.State || result.Status != "fast_forward" {
			t.Fatalf("FF created incorrect State: %+v %v", result, err)
		}
		actual, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: result.State})
		if err != nil || actual.Message == nil || *actual.Message != message {
			t.Fatalf("FF rewrote immutable message: %+v %v", actual, err)
		}
		createBranchSkillRef(t, r, "old-world", source.State)
		if _, err := r.Kernel.EvolutionTagCreate(ctx, kernel.TagCreateRequest{Name: "archive", Target: source.State}); err != nil {
			t.Fatal(err)
		}
		deleted, err := r.Kernel.EvolutionBranchDelete(ctx, kernel.BranchDeleteRequest{Name: "old-world"})
		if err != nil || deleted.PreviousState != source.State {
			t.Fatalf("ref deletion: %+v %v", deleted, err)
		}
		if _, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: "branch/old-world"}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeBranchNotFound {
			t.Fatalf("deleted ref still resolves: %v", err)
		}
		retained, err := r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: "tag/archive"})
		if err != nil || retained.State != source.State {
			t.Fatalf("retained state erased: %+v %v", retained, err)
		}
		assertBranchSkillHead(t, r, "source", source.State)
		advanced, err := r.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
		if err != nil {
			t.Fatal(err)
		}
		retained, err = r.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: "tag/archive"})
		if err != nil || retained.State != source.State {
			t.Fatal("Tag moved on ordinary write")
		}
		moved, err := r.Kernel.EvolutionTagMove(ctx, kernel.TagMoveRequest{Name: "archive", Target: advanced.State})
		if err != nil || moved.PreviousState != source.State || moved.State != advanced.State {
			t.Fatalf("explicit Tag move: %+v %v", moved, err)
		}
	})
	t.Run("stale-head-cannot-finalize-pinned-candidate", func(t *testing.T) {
		r, base := newBranchSkillRuntime(t)
		ctx := context.Background()
		createBranchSkillRef(t, r, "source", base)
		first := graphExecute(t, r, "source", "CREATE (:BranchExample {key:'first'})", nil)
		session, err := r.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: first.State})
		if err != nil {
			t.Fatal(err)
		}
		second := graphExecute(t, r, "source", "CREATE (:BranchExample {key:'second'})", nil)
		observed, err := r.Kernel.EvolutionMergeGet(ctx, kernel.MergeGetRequest{Session: session.Session})
		if err != nil || observed.SourceState != first.State {
			t.Fatal("Session followed moving source")
		}
		advanced, err := r.Kernel.EvolutionStateCreate(ctx, kernel.StateCreateRequest{Branch: "main"})
		if err != nil {
			t.Fatal(err)
		}
		_, err = r.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: session.Session, ExpectedRevision: session.Revision})
		if err == nil || kernel.AsPublicError(err).Code != kernel.CodeBranchHeadMoved {
			t.Fatalf("moving target accepted: %v", err)
		}
		assertMainState(t, r, advanced.State)
		assertBranchSkillHead(t, r, "source", second.State)
		if _, err := r.Kernel.EvolutionMergeAbort(ctx, kernel.MergeAbortRequest{Session: session.Session, ExpectedRevision: session.Revision}); err != nil {
			t.Fatal(err)
		}
		assertMainState(t, r, advanced.State)
	})
}

func newBranchSkillRuntime(t *testing.T) (*host.Runtime, string) {
	t.Helper()
	for _, name := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(name)); err != nil {
			t.Fatalf("required real native fixture %s: %v", name, err)
		}
	}
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	r, err := openKernelIntegrationRuntime(context.Background(), home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := r.Close(); err != nil {
			t.Error(err)
		}
	})
	base, err := r.Database.ResolveState(context.Background(), "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	return r, base
}

func createBranchSkillRef(t *testing.T, r *host.Runtime, name, state string) {
	t.Helper()
	created, err := r.Kernel.EvolutionBranchCreate(context.Background(), kernel.BranchCreateRequest{Name: name, From: state})
	if err != nil || created.Name != name || created.State != state {
		t.Fatalf("create %s from exact State: %+v %v", name, created, err)
	}
}

func seedBranchSkillWorld(t *testing.T, r *host.Runtime, branch, base, label, text string) string {
	t.Helper()
	model := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: label, Properties: []kernel.Property{{Name: "text", Type: "STRING", Required: true}}, Constraints: []kernel.Constraint{}}}
	created, err := r.Kernel.PatchOntology(context.Background(), kernel.PatchRequest{Branch: branch, BaseState: base, Patch: addObjectPatch(t, "new:node-definition:model", model)})
	if err != nil {
		t.Fatal(err)
	}
	assertBranchSkillHead(t, r, branch, created.State)
	params, err := json.Marshal(map[string]string{"text": text})
	if err != nil {
		t.Fatal(err)
	}
	return graphExecute(t, r, branch, "CREATE (:"+label+" {text:$text})", params).State
}

func assertBranchSkillHead(t *testing.T, r *host.Runtime, branch, want string) {
	t.Helper()
	got, err := r.Database.ResolveState(context.Background(), "branch/"+branch)
	if err != nil || got != want {
		t.Fatalf("head %s=%s want %s err=%v", branch, got, want, err)
	}
}

func assertBranchSkillRows(t *testing.T, r *host.Runtime, state, query string, want [][]any) {
	t.Helper()
	got := graphQuery(t, r, state, query, nil)
	if got.State != state {
		t.Fatalf("query changed State: %s", got.State)
	}
	raw, err := json.Marshal(got.Rows)
	if err != nil {
		t.Fatal(err)
	}
	var rows [][]any
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(rows, want) {
		t.Fatalf("query %s rows=%v want=%v", query, rows, want)
	}
}
