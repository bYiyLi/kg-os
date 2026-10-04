//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase14ObjectPatchNoFinalLFUsesExactYAMLValue(t *testing.T) {
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	body := "labels: []\nproperties:\n  \"text\": |+\n    one"
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: addRawObjectPatch("new:knowledge-node:eof", body) + "\\ No newline at end of file\n",
	})
	if err != nil || len(created.Created) != 1 {
		t.Fatalf("create exact no-LF YAML: %#v, %v", created, err)
	}
	ref := created.Created[0].Ref
	read, err := runtime.Kernel.ReadObject(ctx, created.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasSuffix(string(read.YAML), "\n") {
		t.Fatalf("read is not canonical: %q", read.YAML)
	}
	assertEOFStringValue(t, read.JSON, "one")
	target := strings.Replace(body, "one", "two", 1)
	updated, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State, Branch: "main", Patch: replaceObjectPatch(ref, string(read.YAML), target) + "\\ No newline at end of file\n",
	})
	if err != nil {
		t.Fatal(err)
	}
	read, err = runtime.Kernel.ReadObject(ctx, updated.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	assertEOFStringValue(t, read.JSON, "two")
	if !strings.Contains(string(read.JSON), `"labels":[]`) {
		t.Fatalf("empty Knowledge labels must be an array: %s", read.JSON)
	}
	ancestryBefore, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: updated.State})
	if err != nil {
		t.Fatal(err)
	}
	identical, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: updated.State, Branch: "main", Patch: replaceObjectPatch(ref, string(read.YAML), string(read.YAML)),
	})
	if err != nil || identical.State != updated.State {
		t.Fatalf("unchanged empty-label Node should be no-op: %#v, %v", identical, err)
	}
	ignoredMessage := "must not create a metadata-only Commit"
	noop, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: updated.State, Branch: "main", Message: &ignoredMessage,
		Patch: replaceObjectPatch(ref, string(read.YAML), strings.TrimSuffix(string(read.YAML), "\n")) + "\\ No newline at end of file\n",
	})
	if err != nil || noop.State != updated.State {
		t.Fatalf("equivalent YAML EOF change should be no-op: %#v, %v", noop, err)
	}
	assertMainState(t, runtime, updated.State)
	ancestryAfter, err := runtime.Kernel.EvolutionAncestry(ctx, kernel.EvolutionAncestryRequest{Root: "branch/main"})
	if err != nil || len(ancestryAfter.Items) != len(ancestryBefore.Items) {
		t.Fatalf("no-op added a Commit: %#v, %v", ancestryAfter, err)
	}

	// The LF inside a |+ scalar is part of the property value, rather than YAML formatting.
	withValueLF := "labels: []\nproperties:\n  \"text\": |+\n    two\n"
	changed, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: updated.State, Branch: "main", Patch: replaceObjectPatch(ref, string(read.YAML), withValueLF),
	})
	if err != nil || changed.State == updated.State {
		t.Fatalf("actual String LF delta must create a State: %#v, %v", changed, err)
	}
	read, err = runtime.Kernel.ReadObject(ctx, changed.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	assertEOFStringValue(t, read.JSON, "two\n")
	withoutValueLF, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: changed.State, Branch: "main", Patch: replaceObjectPatch(ref, string(read.YAML), target) + "\\ No newline at end of file\n",
	})
	if err != nil || withoutValueLF.State == changed.State {
		t.Fatalf("removing actual String LF must create a State: %#v, %v", withoutValueLF, err)
	}
	read, err = runtime.Kernel.ReadObject(ctx, withoutValueLF.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	assertEOFStringValue(t, read.JSON, "two")
}

func assertEOFStringValue(t *testing.T, value json.RawMessage, want string) {
	t.Helper()
	var node kernel.KnowledgeNode
	if err := json.Unmarshal(value, &node); err != nil {
		t.Fatal(err)
	}
	var actual string
	if err := json.Unmarshal(node.Properties["text"], &actual); err != nil || actual != want {
		t.Fatalf("EOF block-string = %q, err=%v; want %q", actual, err, want)
	}
}
