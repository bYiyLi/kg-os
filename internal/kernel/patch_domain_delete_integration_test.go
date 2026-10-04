//go:build lithograph_smoke

package kernel_test

import (
	"bytes"
	"context"
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPhase14DomainDeletePreservesMembersKnowledgeAndHistoricalCycle(t *testing.T) {
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
	patch := addRawObjectPatch("new:domain:research", "name: \"Research\"\nincludes: [\"new:domain:lab\", \"new:node-definition:model\", \"new:node-definition:paper\", \"new:relationship-definition:cites\"]\n") +
		addRawObjectPatch("new:domain:lab", "name: \"Lab\"\nincludes: [\"new:domain:research\", \"new:node-definition:paper\"]\n") +
		addRawObjectPatch("new:domain:parent", "name: \"Parent\"\nincludes: [\"new:domain:research\", \"new:node-definition:model\"]\n") +
		addRawObjectPatch("new:node-definition:model", "name: \"Model\"\nproperties: [{name: \"name\", type: \"STRING\"}]\nconstraints: []\n") +
		addRawObjectPatch("new:node-definition:paper", "name: \"Paper\"\nproperties: [{name: \"title\", type: \"STRING\"}]\nconstraints: []\n") +
		addRawObjectPatch("new:relationship-definition:cites", "name: \"CITES\"\nfrom: \"new:node-definition:model\"\nto: \"new:node-definition:paper\"\nproperties: [{name: \"note\", type: \"STRING\"}]\nconstraints: []\n") +
		addRawObjectPatch("new:knowledge-node:model-object", "labels: [\"Model\"]\nproperties: {\"name\": \"retained model\"}\n") +
		addRawObjectPatch("new:knowledge-node:paper-object", "labels: [\"Paper\"]\nproperties: {\"title\": \"retained paper\"}\n") +
		addRawObjectPatch("new:knowledge-relationship:cites-object", "type: \"CITES\"\nstart: \"new:knowledge-node:model-object\"\nend: \"new:knowledge-node:paper-object\"\nproperties: {\"note\": \"retained link\"}\n")
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{BaseState: base, Branch: "main", Patch: patch})
	if err != nil {
		t.Fatal(err)
	}
	retainedRefs := []string{"node:Model", "node:Paper", "relationship:CITES"}
	for _, object := range created.Created {
		if object.Kind == kernel.KindKnowledgeNode || object.Kind == kernel.KindKnowledgeRelationship {
			retainedRefs = append(retainedRefs, object.Ref)
		}
	}
	if len(retainedRefs) != 6 {
		t.Fatalf("fixture did not create all Knowledge members: %#v", created)
	}
	before, err := runtime.Kernel.ReadObjectTexts(ctx, kernel.ObjectReadRequest{At: created.State, Refs: retainedRefs})
	if err != nil {
		t.Fatal(err)
	}
	research, err := runtime.Kernel.ReadObject(ctx, created.State, "domain:Research")
	if err != nil {
		t.Fatal(err)
	}
	deletePatch := deleteObjectPatch("domain:Research", string(research.YAML))
	lab, err := runtime.Kernel.ReadObject(ctx, created.State, "domain:Lab")
	if err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []struct {
		member string
		code   kernel.ErrorCode
	}{{"domain:Missing", kernel.CodeObjectNotFound}, {"new:domain:missing", kernel.CodeInvalidArgument}} {
		target := strings.Replace(string(lab.YAML), `"domain:Research"`, `"`+invalid.member+`"`, 1)
		_, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
			BaseState: created.State, Branch: "main", Patch: deletePatch + replaceObjectPatch("domain:Lab", string(lab.YAML), target),
		})
		if err == nil || kernel.AsPublicError(err).Code != invalid.code {
			t.Fatalf("unresolved member was not rejected: %v", err)
		}
		assertMainState(t, runtime, created.State)
	}
	deleted, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{BaseState: created.State, Branch: "main", Patch: deletePatch})
	if err != nil || deleted.State == created.State || len(deleted.Created) != 0 || len(deleted.Transitions) != 0 {
		t.Fatalf("delete cyclic Domain: %#v, %v", deleted, err)
	}
	assertMainState(t, runtime, deleted.State)
	if _, err := runtime.Kernel.ReadObject(ctx, deleted.State, "domain:Research"); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("deleted Domain still exists: %v", err)
	}
	for name, want := range map[string][]string{"Lab": {"node:Paper"}, "Parent": {"node:Model"}} {
		read, err := runtime.Kernel.ReadObject(ctx, deleted.State, "domain:"+name)
		if err != nil {
			t.Fatal(err)
		}
		var domain kernel.Domain
		if err := json.Unmarshal(read.JSON, &domain); err != nil || !reflect.DeepEqual(domain.Includes, want) {
			t.Fatalf("surviving %s organization = %#v, %v", name, domain, err)
		}
	}
	after, err := runtime.Kernel.ReadObjectTexts(ctx, kernel.ObjectReadRequest{At: deleted.State, Refs: retainedRefs})
	if err != nil || !reflect.DeepEqual(before.Results, after.Results) {
		t.Fatalf("Domain delete changed member Schema or Knowledge: %#v, %v", after, err)
	}
	oldResearch, err := runtime.Kernel.ReadObject(ctx, created.State, "domain:Research")
	if err != nil || !bytes.Equal(oldResearch.YAML, research.YAML) {
		t.Fatalf("historical outgoing memberships changed: %s, %v", oldResearch.YAML, err)
	}
	oldLab, err := runtime.Kernel.ReadObject(ctx, created.State, "domain:Lab")
	if err != nil || !bytes.Equal(oldLab.YAML, lab.YAML) {
		t.Fatalf("historical incoming cycle changed: %s, %v", oldLab.YAML, err)
	}
	if count := querySingleInt(t, runtime, deleted.State, "MATCH (:Model)-[r:CITES]->(:Paper) RETURN count(r) AS value"); count != 1 {
		t.Fatalf("Knowledge Relationship was lost: %d", count)
	}
}

func TestPhase14DefinitionDeleteCleansMembershipAndRequiresExplicitKnowledgeMutation(t *testing.T) {
	runtime, seeded, nodeRef := createDomainMembershipFixture(t, false)
	ctx := context.Background()
	research, err := runtime.Kernel.ReadObject(ctx, seeded.State, "domain:Research")
	if err != nil {
		t.Fatal(err)
	}
	withUnused, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State, Branch: "main",
		Patch: addRawObjectPatch("new:node-definition:unused", "name: \"Unused\"\nproperties: [{name: \"text\", type: \"STRING\"}]\nconstraints: []\n") +
			replaceObjectPatch("domain:Research", string(research.YAML), "name: \"Research\"\nincludes: [\"node:Model\", \"new:node-definition:unused\"]\n"),
	})
	if err != nil {
		t.Fatal(err)
	}
	unused, err := runtime.Kernel.ReadObject(ctx, withUnused.State, "node:Unused")
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: withUnused.State, Branch: "main", Patch: deleteObjectPatch("node:Unused", string(unused.YAML)),
	})
	if err != nil {
		t.Fatalf("delete unused member Definition: %v", err)
	}
	research, err = runtime.Kernel.ReadObject(ctx, deleted.State, "domain:Research")
	if err != nil || !strings.Contains(string(research.JSON), `"includes":["node:Model"]`) {
		t.Fatalf("unused Definition membership retained: %s, %v", research.JSON, err)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, deleted.State, "node:Unused"); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("unused Definition was not deleted: %v", err)
	}
	if old, err := runtime.Kernel.ReadObject(ctx, withUnused.State, "node:Unused"); err != nil || !bytes.Equal(old.YAML, unused.YAML) {
		t.Fatalf("historical Definition changed: %s, %v", old.YAML, err)
	}
	model, err := runtime.Kernel.ReadObject(ctx, deleted.State, "node:Model")
	if err != nil {
		t.Fatal(err)
	}
	deleteModel := deleteObjectPatch("node:Model", string(model.YAML))
	if _, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: deleted.State, Branch: "main", Patch: deleteModel,
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("used Definition deletion did not require explicit Knowledge mutation: %v", err)
	}
	assertMainState(t, runtime, deleted.State)
	node, err := runtime.Kernel.ReadObject(ctx, deleted.State, nodeRef)
	if err != nil || !strings.Contains(string(node.JSON), `"name":"Base"`) {
		t.Fatalf("failed Definition deletion changed Knowledge: %s, %v", node.JSON, err)
	}
	explicit, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: deleted.State, Branch: "main", Patch: deleteModel + deleteObjectPatch(nodeRef, string(node.YAML)),
	})
	if err != nil {
		t.Fatalf("explicit same-Patch Knowledge deletion failed: %v", err)
	}
	assertMainState(t, runtime, explicit.State)
	research, err = runtime.Kernel.ReadObject(ctx, explicit.State, "domain:Research")
	if err != nil || !strings.Contains(string(research.JSON), `"includes":[]`) {
		t.Fatalf("deleted Definition left organization edge: %s, %v", research.JSON, err)
	}
	noOp, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: explicit.State, Branch: "main",
		Patch: replaceObjectPatch("domain:Research", string(research.YAML), string(research.YAML)),
	})
	if err != nil || noOp.State != explicit.State {
		t.Fatalf("canonical empty Domain read/Patch was not a no-op: %#v, %v", noOp, err)
	}
	for _, ref := range []string{"node:Model", nodeRef} {
		if _, err := runtime.Kernel.ReadObject(ctx, explicit.State, ref); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
			t.Fatalf("explicitly deleted %s remains: %v", ref, err)
		}
		if _, err := runtime.Kernel.ReadObject(ctx, deleted.State, ref); err != nil {
			t.Fatalf("historical %s was lost: %v", ref, err)
		}
	}
}
