//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// The historical VLogEntry fixture remains a compatible example, not the published graph ontology.
// This test verifies the historical fixture definition against real isolated KG OS/Lithograph.
func TestVLogLegacyModelFixture(t *testing.T) {
	r, initial := newVLogSkillRuntime(t)
	ctx := context.Background()
	if _, err := r.Kernel.ReadObject(ctx, initial, "node:VLogEntry"); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("model must not be automatically installed: %v", err)
	}
	existing, err := r.Kernel.ReadObject(ctx, initial, "node:ExampleVLog")
	if err != nil {
		t.Fatal(err)
	}

	model := vlogLegacyModelFixture(t)
	schema, err := r.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch:    "vlog",
		BaseState: initial,
		Patch:     addObjectPatch(t, "new:node-definition:entry", model),
	})
	if err != nil {
		t.Fatalf("literal recommended model rejected: %v", err)
	}
	wantDefinition, err := kernel.RenderObjectYAML(model)
	if err != nil {
		t.Fatal(err)
	}
	gotDefinition, err := r.Kernel.ReadObject(ctx, schema.State, "node:VLogEntry")
	if err != nil || string(gotDefinition.YAML) != string(wantDefinition) {
		t.Fatalf("literal model roundtrip failed: %v\ngot: %s\nwant: %s", err, gotDefinition.YAML, wantDefinition)
	}
	gotExisting, err := r.Kernel.ReadObject(ctx, schema.State, "node:ExampleVLog")
	if err != nil || string(gotExisting.YAML) != string(existing.YAML) {
		t.Fatalf("adding optional model changed existing VLog schema: %v", err)
	}

	decision := vlogSuggestedEntry(t, "decision-1", "decision", "Retain the independent knowledge world.", map[string]string{
		"details": "Decision reason and impact recorded; no execution or validation is claimed.",
	})
	first := applyVLogSkillPatch(t, r, schema.State, addObjectPatch(t, "new:knowledge-node:decision", decision))
	firstRef := vlogCreatedRef(t, first, "decision")
	assertVLogSkillValue(t, r, first.State, firstRef, decision)

	// Execution and independent validation intentionally disagree; do not coerce
	// the successful operation into a successful overall verification.
	run1 := vlogSuggestedEntry(t, "run-1", "maintenance_run", "Review completed with an unresolved check.", map[string]string{
		"taskKey":            "learning-review",
		"runKey":             "RUN-1",
		"eventKey":           "REVIEW-ISSUE-1",
		"scope":              "Reviewed 20 objects; another range was not accessible.",
		"executionStatus":    "succeeded",
		"executionResult":    "The requested limited review completed.",
		"verificationStatus": "failed",
		"verificationResult": "One targeted validation failed.",
		"pending":            "Investigate the failing check.",
		"evidence":           "Actual source check in scope; no full-library claim.",
		"provenance":         "source Instance=test; Branch=source; source and record States are distinct.",
	})
	second := applyVLogSkillPatch(t, r, first.State, addObjectPatch(t, "new:knowledge-node:run1", run1))
	secondRef := vlogCreatedRef(t, second, "run1")
	assertVLogSkillValue(t, r, second.State, secondRef, run1)

	run2 := vlogSuggestedEntry(t, "run-2", "maintenance_run", "Next review could not confirm execution outcome.", map[string]string{
		"taskKey":         "learning-review",
		"runKey":          "RUN-2",
		"executionStatus": "unknown",
		"evidence":        "Execution request sent; completion receipt missing.",
	})
	third := applyVLogSkillPatch(t, r, second.State, addObjectPatch(t, "new:knowledge-node:run2", run2))
	thirdRef := vlogCreatedRef(t, third, "run2")
	assertVLogSkillValue(t, r, third.State, thirdRef, run2)
	assertVLogSkillRows(t, r, third.State,
		"MATCH (v:VLogEntry) RETURN v.entryKey, v.kind, v.taskKey, v.runKey, v.executionStatus, v.verificationStatus ORDER BY v.entryKey",
		[][]any{
			{"decision-1", "decision", nil, nil, nil, nil},
			{"run-1", "maintenance_run", "learning-review", "RUN-1", "succeeded", "failed"},
			{"run-2", "maintenance_run", "learning-review", "RUN-2", "unknown", nil},
		},
	)

	duplicate := vlogSuggestedEntry(t, "run-1", "maintenance_run", "Duplicate key", nil)
	_, err = r.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		Branch: "vlog", BaseState: third.State,
		Patch: addObjectPatch(t, "new:knowledge-node:duplicate", duplicate),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("duplicate entryKey must be rejected: %v", err)
	}
	invalid := vlogSuggestedEntry(t, "missing-summary", "decision", "To be removed", nil)
	delete(invalid.KnowledgeNode.Properties, "summary")
	_, err = r.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		Branch: "vlog", BaseState: third.State,
		Patch: addObjectPatch(t, "new:knowledge-node:invalid", invalid),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("missing one of three required fields must be rejected: %v", err)
	}
	assertVLogHead(t, r, third.State)
	assertVLogSkillRows(t, r, second.State,
		"MATCH (v:VLogEntry) RETURN count(v)", [][]any{{float64(2)}})
	assertVLogSkillRows(t, r, initial,
		"MATCH (v:ExampleVLog) RETURN count(v)", [][]any{{float64(0)}})

	// Verify the example's zoned temporal fields are usable, not just YAML text.
	timed := graphExecute(t, r, "vlog", "CREATE (:VLogEntry {"+
		"entryKey:'timed-run',kind:'maintenance_run',summary:'Observed time values',"+
		"occurredAt:datetime('2026-10-20T09:00:00+08:00'),"+
		"recordedAt:datetime('2026-10-20T10:00:00+08:00'),"+
		"verifiedAt:datetime('2026-10-20T11:00:00+08:00')"+
		"})", nil)
	assertVLogSkillRows(t, r, timed.State,
		"MATCH (v:VLogEntry {entryKey:'timed-run'}) RETURN "+
			"v.occurredAt = datetime('2026-10-20T09:00:00+08:00'), "+
			"v.recordedAt = datetime('2026-10-20T10:00:00+08:00'), "+
			"v.verifiedAt = datetime('2026-10-20T11:00:00+08:00')",
		[][]any{{true, true, true}},
	)
	assertVLogSkillValue(t, r, third.State, firstRef, decision)
}

func vlogSuggestedEntry(t *testing.T, key, kind, summary string, optional map[string]string) kernel.ObjectValue {
	t.Helper()
	entry := kernel.ObjectValue{
		Kind: kernel.KindKnowledgeNode,
		KnowledgeNode: &kernel.KnowledgeNode{
			Labels:     []string{"VLogEntry"},
			Properties: map[string]json.RawMessage{},
		},
	}
	for k, v := range map[string]string{"entryKey": key, "kind": kind, "summary": summary} {
		vlogSetString(t, &entry, k, v)
	}
	for k, v := range optional {
		vlogSetString(t, &entry, k, v)
	}
	return entry
}
