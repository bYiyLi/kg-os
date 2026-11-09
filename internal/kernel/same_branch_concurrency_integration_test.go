//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase37ConcurrentObjectPatchesOnSameBranchUseStrictBaseState(t *testing.T) {
	const workers = 8
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, root)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	defer runtime.Close()

	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve base: %v", err)
	}
	definition := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind:        kernel.KindNodeDefinition,
			Name:        "ConcurrentKnowledge",
			Properties:  []kernel.Property{{Name: "value", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     addObjectPatch(t, "new:node-definition:ConcurrentKnowledge", definition),
	})
	if err != nil {
		t.Fatalf("seed Definition: %v", err)
	}
	if got := querySingleInt(t, runtime, seeded.State,
		"MATCH (n:ConcurrentKnowledge) RETURN count(n) AS count"); got != 0 {
		t.Fatalf("seed State already contains %d Knowledge nodes", got)
	}

	type attempt struct {
		worker int
		result kernel.PatchResult
		err    error
	}
	ready := make(chan struct{}, workers)
	start := make(chan struct{})
	results := make(chan attempt, workers)
	var wait sync.WaitGroup
	for worker := 0; worker < workers; worker++ {
		alias := fmt.Sprintf("same-branch-worker-%d", worker)
		text, marshalErr := json.Marshal(fmt.Sprintf("worker-%d", worker))
		if marshalErr != nil {
			t.Fatalf("marshal worker value: %v", marshalErr)
		}
		value := kernel.ObjectValue{
			Kind: kernel.KindKnowledgeNode,
			KnowledgeNode: &kernel.KnowledgeNode{
				Labels: []string{"ConcurrentKnowledge"},
				Properties: map[string]json.RawMessage{
					"value": text,
				},
			},
		}
		patch := addObjectPatch(t, "new:knowledge-node:"+alias, value)
		wait.Add(1)
		go func(worker int, patch string) {
			defer wait.Done()
			ready <- struct{}{}
			<-start
			result, patchErr := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
				BaseState: seeded.State,
				Branch:    "main",
				Patch:     patch,
			})
			results <- attempt{worker: worker, result: result, err: patchErr}
		}(worker, patch)
	}
	for worker := 0; worker < workers; worker++ {
		<-ready
	}
	close(start)
	wait.Wait()
	close(results)

	var winner *attempt
	stale := 0
	for outcome := range results {
		if outcome.err != nil {
			if code := kernel.AsPublicError(outcome.err).Code; code != kernel.CodeStaleBaseState {
				t.Errorf("worker %d failed with %s, want STALE_BASE_STATE: %v", outcome.worker, code, outcome.err)
				continue
			}
			stale++
			continue
		}
		if winner != nil {
			t.Errorf("workers %d and %d both committed from the same base State", winner.worker, outcome.worker)
			continue
		}
		if len(outcome.result.Created) != 1 || outcome.result.Created[0].Alias != fmt.Sprintf("same-branch-worker-%d", outcome.worker) {
			t.Errorf("worker %d returned unexpected created mapping: %#v", outcome.worker, outcome.result.Created)
			continue
		}
		winner = &outcome
	}
	if winner == nil {
		t.Fatal("no same-Branch contender committed")
	}
	if stale != workers-1 {
		t.Fatalf("stale contenders = %d, want %d", stale, workers-1)
	}
	if winner.result.State == seeded.State {
		t.Fatalf("winning Patch did not advance State: %s", winner.result.State)
	}

	head, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatalf("resolve final Branch head: %v", err)
	}
	if head != winner.result.State {
		t.Fatalf("final Branch head = %s, want sole winning Commit %s", head, winner.result.State)
	}
	if got := querySingleInt(t, runtime, head,
		"MATCH (n:ConcurrentKnowledge) RETURN count(n) AS count"); got != 1 {
		t.Fatalf("final State contains %d Knowledge nodes, want exactly one committed winner", got)
	}
	if got := querySingleInt(t, runtime, seeded.State,
		"MATCH (n:ConcurrentKnowledge) RETURN count(n) AS count"); got != 0 {
		t.Fatalf("immutable base State now contains %d Knowledge nodes", got)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, head, winner.result.Created[0].Ref); err != nil {
		t.Fatalf("read winning Knowledge %s: %v", winner.result.Created[0].Ref, err)
	}
}
