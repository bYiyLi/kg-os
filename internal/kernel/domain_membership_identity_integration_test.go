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

func TestPhase15DomainMembershipDeltaPreservesExistingEdges(t *testing.T) {
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
	def := func(name string) kernel.ObjectValue {
		return kernel.ObjectValue{
			Kind: kernel.KindNodeDefinition,
			Definition: &kernel.Definition{
				Kind: kernel.KindNodeDefinition, Name: name,
				Properties:  []kernel.Property{{Name: "value", Type: "STRING"}},
				Constraints: []kernel.Constraint{},
			},
		}
	}
	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name:     "SdkMatrixDomain",
			Includes: []string{"new:node-definition:first"},
		},
	}
	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main",
		Patch: addObjectPatch(t, "new:node-definition:first", def("SdkFirst")) +
			addObjectPatch(t, "new:node-definition:second", def("SdkSecond")) +
			addObjectPatch(t, "new:domain:matrix", domain),
	})
	if err != nil {
		t.Fatalf("create two Definition targets and Domain: %v", err)
	}
	readEdges := func(state string) map[string]string {
		t.Helper()
		query, queryErr := runtime.Database.Query(ctx, lithograph.QueryRequest{
			At: state,
			Cypher: "MATCH (d:__kgos_domain)-[r:__kgos_includes]->(t:__kgos_definition_binding) " +
				"WHERE d.__kgos_name = 'SdkMatrixDomain' " +
				"RETURN t.__kgos_name AS target, elementId(r) AS edge",
		})
		if queryErr != nil {
			t.Fatal(queryErr)
		}
		result := make(map[string]string)
		for _, row := range query.Result.Rows {
			if len(row) != 2 {
				t.Fatalf("invalid membership row: %v", row)
			}
			var name, id string
			if json.Unmarshal(row[0], &name) != nil || json.Unmarshal(row[1], &id) != nil {
				t.Fatalf("invalid membership cells: %v", row)
			}
			result[name] = id
		}
		return result
	}
	initial := readEdges(seeded.State)
	if len(initial) != 1 || initial["SdkFirst"] == "" {
		t.Fatalf("unexpected initial membership: %v", initial)
	}
	const ref = "domain:SdkMatrixDomain"
	body, err := runtime.Kernel.ReadObject(ctx, seeded.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	original := string(body.YAML)
	addedBody := strings.Replace(
		original, "  - \"node:SdkFirst\"",
		"  - \"node:SdkFirst\"\n  - \"node:SdkSecond\"", 1,
	)
	if addedBody == original {
		t.Fatalf("cannot find includes list in canonical Domain YAML: %s", original)
	}
	added, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State, Branch: "main",
		Patch: replaceObjectPatch(ref, original, addedBody),
	})
	if err != nil {
		t.Fatalf("add second Domain membership: %v", err)
	}
	withBoth := readEdges(added.State)
	if len(withBoth) != 2 || withBoth["SdkSecond"] == "" ||
		withBoth["SdkFirst"] != initial["SdkFirst"] {
		t.Fatalf("added member changed retained edge: before=%v after=%v", initial, withBoth)
	}
	body, err = runtime.Kernel.ReadObject(ctx, added.State, ref)
	if err != nil {
		t.Fatal(err)
	}
	beforeRemoval := string(body.YAML)
	removedBody := strings.Replace(beforeRemoval, "  - \"node:SdkFirst\"\n", "", 1)
	if removedBody == beforeRemoval {
		t.Fatalf("cannot remove first member in canonical Domain YAML: %s", beforeRemoval)
	}
	removed, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: added.State, Branch: "main",
		Patch: replaceObjectPatch(ref, beforeRemoval, removedBody),
	})
	if err != nil {
		t.Fatalf("remove first Domain membership: %v", err)
	}
	final := readEdges(removed.State)
	if len(final) != 1 || final["SdkSecond"] != withBoth["SdkSecond"] {
		t.Fatalf("removed member changed retained edge: before=%v after=%v", withBoth, final)
	}
}
