//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase37SameNameDefinitionRecreationUpdatesDomainEndpoint(t *testing.T) {
	root := t.TempDir()
	writeKernelIntegrationConfig(t, root)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, root)
	if err != nil {
		t.Fatal(err)
	}
	defer runtime.Close()
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	definition := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{Kind: kernel.KindNodeDefinition, Name: "Reused",
			Properties:  []kernel.Property{{Name: "value", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	domain := kernel.ObjectValue{
		Kind:   kernel.KindDomain,
		Domain: &kernel.Domain{Name: "OwningDomain", Includes: []string{"new:node-definition:original"}},
	}
	seed, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		Branch: "main", BaseState: base,
		Patch: addObjectPatch(t, "new:node-definition:original", definition) +
			addObjectPatch(t, "new:domain:owning", domain),
	})
	if err != nil {
		t.Fatal(err)
	}
	oldDefinition := querySingleString(t, runtime, seed.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Reused' RETURN elementId(d) AS id")
	oldEdge := querySingleString(t, runtime, seed.State,
		"MATCH (d:__kgos_domain)-[r:__kgos_includes]->(t:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='OwningDomain' AND t.__kgos_name='Reused' RETURN elementId(r) AS edge")
	body, err := runtime.Kernel.ReadObject(ctx, seed.State, "node:Reused")
	if err != nil {
		t.Fatal(err)
	}
	replaced, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seed.State, Branch: "main",
		Patch: deleteObjectPatch("node:Reused", string(body.YAML)) +
			addObjectPatch(t, "new:node-definition:replacement", definition),
	})
	if err != nil {
		t.Fatalf("same-name delete/recreate Patch: %v", err)
	}
	newDefinition := querySingleString(t, runtime, replaced.State,
		"MATCH (d:__kgos_definition_binding) WHERE d.__kgos_name='Reused' RETURN elementId(d) AS id")
	newEdge := querySingleString(t, runtime, replaced.State,
		"MATCH (d:__kgos_domain)-[r:__kgos_includes]->(t:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='OwningDomain' AND t.__kgos_name='Reused' RETURN elementId(r) AS edge")
	if newDefinition == oldDefinition || newEdge == oldEdge {
		t.Fatalf("recreated Binding/Domain membership unexpectedly retained old identity: definition %q/%q, edge %q/%q",
			oldDefinition, newDefinition, oldEdge, newEdge)
	}
	if got := querySingleInt(t, runtime, replaced.State,
		"MATCH (d:__kgos_domain)-[r:__kgos_includes]->(t:__kgos_definition_binding) "+
			"WHERE d.__kgos_name='OwningDomain' RETURN count(r) AS count"); got != 1 {
		t.Fatalf("same-name replacement lost or duplicated domain membership: %d", got)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, replaced.State, "domain:OwningDomain"); err != nil {
		t.Fatalf("replaced Domain state is not decodable: %v", err)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, seed.State, "domain:OwningDomain"); err != nil {
		t.Fatalf("original immutable Domain history changed: %v", err)
	}
}
