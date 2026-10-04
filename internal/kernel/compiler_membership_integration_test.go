//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase14KnowledgeMergePreservesDomainMembershipIdentities(t *testing.T) {
	runtime, seeded, nodeRef := createDomainMembershipFixture(t, false)
	ctx := context.Background()
	baseMemberships := readDomainMembershipIdentities(t, runtime, seeded.State)
	if len(baseMemberships) != 1 {
		t.Fatalf("minimal fixture memberships = %v", baseMemberships)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{Name: "side", From: seeded.State}); err != nil {
		t.Fatal(err)
	}
	read, err := runtime.Kernel.ReadObject(ctx, seeded.State, nodeRef)
	if err != nil {
		t.Fatal(err)
	}
	states := map[string]string{}
	for _, branch := range []string{"main", "side"} {
		value := "Ours"
		if branch == "side" {
			value = "Theirs"
		}
		updated, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
			BaseState: seeded.State, Branch: branch,
			Patch: replaceObjectPatch(nodeRef, string(read.YAML), strings.Replace(string(read.YAML), `"Base"`, `"`+value+`"`, 1)),
		})
		if err != nil {
			t.Fatal(err)
		}
		states[branch] = updated.State
		if actual := readDomainMembershipIdentities(t, runtime, updated.State); !reflect.DeepEqual(actual, baseMemberships) {
			t.Fatalf("Knowledge-only %s Patch replaced organization identities: %v; want %v", branch, actual, baseMemberships)
		}
	}
	started, err := runtime.Kernel.EvolutionMergeStart(ctx, kernel.MergeStartRequest{Branch: "main", Source: "branch/side"})
	if err != nil || started.Status != "conflicted" || started.Unresolved != 1 ||
		started.TargetState != states["main"] || started.SourceState != states["side"] {
		t.Fatalf("start Knowledge conflict = %#v, %v", started, err)
	}
	conflicts, err := runtime.Kernel.EvolutionMergeConflicts(ctx, kernel.MergeConflictsRequest{Session: started.Session})
	if err != nil || len(conflicts.Items) != 1 || conflicts.Items[0].Kind != kernel.KindKnowledgeNode || conflicts.Items[0].Path != "/properties" {
		t.Fatalf("Knowledge conflict = %#v, %v", conflicts, err)
	}
	resolved, err := runtime.Kernel.EvolutionMergeResolve(ctx, kernel.MergeResolveRequest{
		Session: started.Session, ExpectedRevision: conflicts.Revision,
		Resolutions: []kernel.MergeResolution{{ConflictID: conflicts.Items[0].ConflictID, Choice: "theirs"}},
	})
	if err != nil || resolved.Unresolved != 0 || resolved.Status != "ready" || resolved.Revision <= started.Revision {
		t.Fatalf("resolve Knowledge conflict = %#v, %v", resolved, err)
	}
	finalized, err := runtime.Kernel.EvolutionMergeFinalize(ctx, kernel.MergeFinalizeRequest{Session: started.Session, ExpectedRevision: resolved.Revision})
	if err != nil || finalized.Status != "merged" || finalized.TargetState != states["main"] || finalized.SourceState != states["side"] {
		t.Fatalf("finalize valid Knowledge merge = %#v, %v", finalized, err)
	}
	assertMainState(t, runtime, finalized.State)
	get, err := runtime.Kernel.EvolutionGet(ctx, kernel.EvolutionGetRequest{State: finalized.State})
	if err != nil || get.Consistency.Status != "valid" || !reflect.DeepEqual(get.Parents, []string{states["main"], states["side"]}) {
		t.Fatalf("two-parent valid merge = %#v, %v", get, err)
	}
	merged, err := runtime.Kernel.ReadObject(ctx, finalized.State, nodeRef)
	if err != nil || !strings.Contains(string(merged.JSON), `"name":"Theirs"`) {
		t.Fatalf("selected Knowledge value = %s, %v", merged.JSON, err)
	}
	if actual := readDomainMembershipIdentities(t, runtime, finalized.State); !reflect.DeepEqual(actual, baseMemberships) {
		t.Fatalf("merged memberships = %v; want %v", actual, baseMemberships)
	}
}

func TestPhase14DomainMembershipDeltaAndRenamePreserveUnchangedEdges(t *testing.T) {
	runtime, seeded, nodeRef := createDomainMembershipFixture(t, true)
	ctx := context.Background()
	before := readDomainMembershipIdentities(t, runtime, seeded.State)
	if len(before) != 4 {
		t.Fatalf("cyclic fixture memberships = %v", before)
	}
	var relationshipRef string
	for _, object := range seeded.Created {
		if object.Kind == kernel.KindKnowledgeRelationship {
			relationshipRef = object.Ref
		}
	}
	link, err := runtime.Kernel.ReadObject(ctx, seeded.State, relationshipRef)
	if err != nil {
		t.Fatal(err)
	}
	research, err := runtime.Kernel.ReadObject(ctx, seeded.State, "domain:Research")
	if err != nil {
		t.Fatal(err)
	}
	changed, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State, Branch: "main",
		Patch: replaceObjectPatch("domain:Research", string(research.YAML), strings.Replace(string(research.YAML), `"node:Model"`, `"node:Paper"`, 1)),
	})
	if err != nil {
		t.Fatal(err)
	}
	after := readDomainMembershipIdentities(t, runtime, changed.State)
	retained, added, removed := 0, 0, 0
	for pair, id := range before {
		if actual, exists := after[pair]; exists {
			if actual != id {
				t.Fatalf("unchanged pair %v replaced %s with %s", pair, id, actual)
			}
			retained++
		} else {
			removed++
		}
	}
	for pair := range after {
		if _, exists := before[pair]; !exists {
			added++
		}
	}
	if retained != 3 || added != 1 || removed != 1 || len(after) != 4 {
		t.Fatalf("membership delta retained=%d added=%d removed=%d: %v -> %v", retained, added, removed, before, after)
	}
	research, err = runtime.Kernel.ReadObject(ctx, changed.State, "domain:Research")
	if err != nil {
		t.Fatal(err)
	}
	model, err := runtime.Kernel.ReadObject(ctx, changed.State, "node:Model")
	if err != nil {
		t.Fatal(err)
	}
	renamed, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: changed.State, Branch: "main",
		Patch: renameObjectPatch("domain:Research", "domain:Workspace", string(research.YAML), strings.Replace(string(research.YAML), `name: "Research"`, `name: "Workspace"`, 1)) +
			renameObjectPatch("node:Model", "node:Artifact", string(model.YAML), strings.Replace(string(model.YAML), `name: "Model"`, `name: "Artifact"`, 1)),
	})
	if err != nil {
		t.Fatal(err)
	}
	if actual := readDomainMembershipIdentities(t, runtime, renamed.State); !reflect.DeepEqual(actual, after) {
		t.Fatalf("Domain/Definition rename rebuilt physical pairs: %v; want %v", actual, after)
	}
	for ref, want := range map[string][]string{
		"domain:Workspace": {"domain:Lab", "node:Paper"},
		"domain:Lab":       {"domain:Workspace", "node:Artifact"},
	} {
		read, err := runtime.Kernel.ReadObject(ctx, renamed.State, ref)
		var domain kernel.Domain
		if err != nil || json.Unmarshal(read.JSON, &domain) != nil || !reflect.DeepEqual(domain.Includes, want) {
			t.Fatalf("renamed organization %s = %s, %v", ref, read.JSON, err)
		}
	}
	remainingLink, err := runtime.Kernel.ReadObject(ctx, renamed.State, relationshipRef)
	if err != nil || !reflect.DeepEqual(remainingLink.JSON, link.JSON) {
		t.Fatalf("organization maintenance changed Knowledge self-loop: %s, %v", remainingLink.JSON, err)
	}
	node, err := runtime.Kernel.ReadObject(ctx, renamed.State, nodeRef)
	if err != nil || !strings.Contains(string(node.JSON), `"labels":["Artifact"]`) {
		t.Fatalf("Definition rename lost Knowledge continuity: %s, %v", node.JSON, err)
	}
	if actual := readDomainMembershipIdentities(t, runtime, seeded.State); !reflect.DeepEqual(actual, before) {
		t.Fatalf("historical memberships changed: %v; want %v", actual, before)
	}
}

func createDomainMembershipFixture(t *testing.T, cycle bool) (*runtimehost.Runtime, kernel.PatchResult, string) {
	t.Helper()
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	members := []string{"new:node-definition:model"}
	if cycle {
		members = append(members, "new:domain:lab")
	}
	includes, err := json.Marshal(members)
	if err != nil {
		t.Fatal(err)
	}
	patch := addRawObjectPatch("new:domain:research", "name: \"Research\"\nincludes: "+string(includes)+"\n") +
		addRawObjectPatch("new:node-definition:model", "name: \"Model\"\nproperties: [{name: \"name\", type: \"STRING\"}]\nconstraints: []\n") +
		addRawObjectPatch("new:knowledge-node:model", "labels: [\"Model\"]\nproperties: {\"name\": \"Base\"}\n")
	if cycle {
		patch += addRawObjectPatch("new:domain:lab", "name: \"Lab\"\nincludes: [\"new:domain:research\", \"new:node-definition:model\"]\n") +
			addRawObjectPatch("new:node-definition:paper", "name: \"Paper\"\nproperties: [{name: \"title\", type: \"STRING\"}]\nconstraints: []\n") +
			addRawObjectPatch("new:knowledge-relationship:link", "type: \"LINKS\"\nstart: \"new:knowledge-node:model\"\nend: \"new:knowledge-node:model\"\nproperties: {\"note\": \"retained self-loop\"}\n")
	}
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{BaseState: base, Branch: "main", Patch: patch})
	if err != nil {
		t.Fatal(err)
	}
	for _, object := range created.Created {
		if object.Kind == kernel.KindKnowledgeNode {
			return runtime, created, object.Ref
		}
	}
	t.Fatal("fixture did not create a Knowledge Node")
	return nil, kernel.PatchResult{}, ""
}

func readDomainMembershipIdentities(t *testing.T, runtime *runtimehost.Runtime, state string) map[[2]string]string {
	t.Helper()
	result, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{
		At: state,
		Cypher: "MATCH (d:__kgos_domain)-[r:__kgos_includes]->(t) " +
			"RETURN elementId(d) AS source, elementId(t) AS target, elementId(r) AS id",
	})
	if err != nil {
		t.Fatal(err)
	}
	identities := map[[2]string]string{}
	for _, row := range result.Rows {
		if len(row) != 3 {
			t.Fatalf("membership row shape = %v", row)
		}
		pair := [2]string{graphString(t, row[0]), graphString(t, row[1])}
		if _, duplicate := identities[pair]; duplicate {
			t.Fatalf("duplicate Domain membership pair: %v", pair)
		}
		identities[pair] = graphString(t, row[2])
	}
	return identities
}
