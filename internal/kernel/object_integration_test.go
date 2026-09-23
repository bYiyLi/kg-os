//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
)

func TestPhase04KnowledgeBatchCreateReadAndRelationshipReplacement(t *testing.T) {
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

	patch := addRawObjectPatch(
		"new:knowledge-relationship:knows",
		"type: \"KNOWS\"\nstart: \"new:knowledge-node:alice\"\nend: \"new:knowledge-node:bob\"\nproperties:\n  \"since\": 2026\n",
	) + addRawObjectPatch(
		"new:knowledge-node:bob",
		"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Bob\"\n",
	) + addRawObjectPatch(
		"new:knowledge-node:alice",
		"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Alice\"\n",
	)
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch:     patch,
	})
	if err != nil {
		t.Fatalf("batch create: %v", err)
	}
	if created.State == base {
		t.Fatal("batch create did not advance state")
	}
	if len(created.Created) != 3 {
		t.Fatalf("created = %#v", created.Created)
	}
	refs := map[string]string{}
	for _, item := range created.Created {
		refs[item.Alias] = item.Ref
	}
	if !strings.HasPrefix(refs["alice"], "n:") || !strings.HasPrefix(refs["bob"], "n:") ||
		!strings.HasPrefix(refs["knows"], "r:") {
		t.Fatalf("unexpected created refs: %#v", refs)
	}

	read, err := runtime.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At:   created.State,
		Refs: []string{refs["alice"], refs["knows"], refs["bob"]},
	})
	if err != nil {
		t.Fatalf("batch read: %v", err)
	}
	if read.State != created.State || len(read.Results) != 3 {
		t.Fatalf("read = %#v", read)
	}
	var relationship kernel.KnowledgeRelationship
	if err := json.Unmarshal(read.Results[1].Value, &relationship); err != nil {
		t.Fatalf("decode relationship: %v", err)
	}
	if relationship.Start != refs["alice"] || relationship.End != refs["bob"] || relationship.Type != "KNOWS" {
		t.Fatalf("relationship = %#v", relationship)
	}

	body, err := runtime.Kernel.ReadObject(ctx, created.State, refs["knows"])
	if err != nil {
		t.Fatalf("read relationship body: %v", err)
	}
	target := strings.Replace(string(body.YAML), "type: \"KNOWS\"", "type: \"LIKES\"", 1)
	replaced, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch(refs["knows"], string(body.YAML), target),
	})
	if err != nil {
		t.Fatalf("replace relationship: %v", err)
	}
	if len(replaced.Transitions) != 1 || replaced.Transitions[0].From != refs["knows"] ||
		!strings.HasPrefix(replaced.Transitions[0].To, "r:") {
		t.Fatalf("relationship transitions = %#v", replaced.Transitions)
	}
	newRelationshipRef := replaced.Transitions[0].To
	if newRelationshipRef == refs["knows"] {
		t.Fatalf("relationship replacement retained identity %q", newRelationshipRef)
	}
	readReplacement, err := runtime.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At: replaced.State, Refs: []string{newRelationshipRef},
	})
	if err != nil {
		t.Fatalf("read replacement: %v", err)
	}
	if err := json.Unmarshal(readReplacement.Results[0].Value, &relationship); err != nil {
		t.Fatalf("decode replacement: %v", err)
	}
	if relationship.Type != "LIKES" {
		t.Fatalf("replacement type = %q", relationship.Type)
	}
}

func TestPhase04MixedOntologyKnowledgeBatchReadSafetyAndAtomicity(t *testing.T) {
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

	domain := kernel.ObjectValue{
		Kind: kernel.KindDomain,
		Domain: &kernel.Domain{
			Name: "Content",
			Includes: []string{
				"new:node-definition:person",
				"new:node-definition:document",
				"new:relationship-definition:authored",
			},
		},
	}
	person := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Person",
			Properties: []kernel.Property{
				{Name: "name", Type: "STRING"},
				{Name: "temporary", Type: "STRING"},
			},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Document",
			Properties:  []kernel.Property{{Name: "title", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindRelationshipDefinition, Name: "AUTHORED", From: &from, To: &to,
			Properties:  []kernel.Property{{Name: "since", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	patch := addObjectPatch(t, "new:domain:content", domain) +
		addObjectPatch(t, "new:node-definition:person", person) +
		addObjectPatch(t, "new:node-definition:document", document) +
		addObjectPatch(t, "new:relationship-definition:authored", authored) +
		addRawObjectPatch(
			"new:knowledge-relationship:authored",
			"type: \"AUTHORED\"\nstart: \"new:knowledge-node:person\"\nend: \"new:knowledge-node:document\"\nproperties:\n  \"since\": \"2026\"\n",
		) +
		addRawObjectPatch(
			"new:knowledge-node:document",
			"labels:\n  - \"Document\"\nproperties:\n  \"title\": \"Design\"\n",
		) +
		addRawObjectPatch(
			"new:knowledge-node:person",
			"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Alice\"\n  \"temporary\": \"remove-me\"\n",
		)
	created, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base, Branch: "main", Patch: patch,
	})
	if err != nil {
		t.Fatalf("mixed create: %v", err)
	}
	if created.State == base {
		t.Fatal("mixed create did not create one new state")
	}
	refs := map[string]string{}
	for _, item := range created.Created {
		if item.Kind == kernel.KindKnowledgeNode || item.Kind == kernel.KindKnowledgeRelationship {
			refs[item.Alias] = item.Ref
		}
	}
	if refs["person"] == "" || refs["document"] == "" || refs["authored"] == "" {
		t.Fatalf("Knowledge refs = %#v", refs)
	}

	read, err := runtime.Kernel.ReadObjects(ctx, kernel.ObjectReadRequest{
		At: created.State,
		Refs: []string{
			"domain:Content",
			"node:Person",
			"relationship:AUTHORED",
			refs["person"],
			refs["authored"],
		},
	})
	if err != nil {
		t.Fatalf("five-kind read: %v", err)
	}
	wantKinds := []kernel.ObjectKind{
		kernel.KindDomain,
		kernel.KindNodeDefinition,
		kernel.KindRelationshipDefinition,
		kernel.KindKnowledgeNode,
		kernel.KindKnowledgeRelationship,
	}
	if read.State != created.State || len(read.Results) != len(wantKinds) {
		t.Fatalf("five-kind read = %#v", read)
	}
	for index, kind := range wantKinds {
		if read.Results[index].Kind != kind {
			t.Fatalf("result %d kind=%q want=%q", index, read.Results[index].Kind, kind)
		}
	}

	personBody, err := runtime.Kernel.ReadObject(ctx, created.State, refs["person"])
	if err != nil {
		t.Fatal(err)
	}
	noOp, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch(refs["person"], string(personBody.YAML), string(personBody.YAML)),
	})
	if err != nil {
		t.Fatalf("Knowledge no-op: %v", err)
	}
	if noOp.State != created.State {
		t.Fatalf("no-op state=%q want=%q", noOp.State, created.State)
	}

	definitionBody, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Person")
	if err != nil {
		t.Fatal(err)
	}
	definitionTarget, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, definitionBody.YAML)
	if err != nil {
		t.Fatal(err)
	}
	definitionTarget.Definition.Properties = []kernel.Property{{Name: "name", Type: "STRING"}}
	definitionTargetYAML, err := kernel.RenderObjectYAML(definitionTarget)
	if err != nil {
		t.Fatal(err)
	}
	personTarget, err := kernel.ParseObjectYAML(kernel.KindKnowledgeNode, personBody.YAML)
	if err != nil {
		t.Fatal(err)
	}
	personTarget.KnowledgeNode.Properties = map[string]json.RawMessage{
		"name": json.RawMessage(`"Alice"`),
	}
	personTargetYAML, err := kernel.RenderObjectYAML(personTarget)
	if err != nil {
		t.Fatal(err)
	}
	mixedUpdate, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch: replaceObjectPatch("node:Person", string(definitionBody.YAML), string(definitionTargetYAML)) +
			replaceObjectPatch(refs["person"], string(personBody.YAML), string(personTargetYAML)),
	})
	if err != nil {
		t.Fatalf("mixed property contraction: %v", err)
	}

	personBody, err = runtime.Kernel.ReadObject(ctx, mixedUpdate.State, refs["person"])
	if err != nil {
		t.Fatal(err)
	}
	_, err = runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: mixedUpdate.State,
		Branch:    "main",
		Patch:     deleteObjectPatch(refs["person"], string(personBody.YAML)),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("incident delete error = %v", err)
	}
	head, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	if head != mixedUpdate.State {
		t.Fatalf("failed delete moved branch head to %q", head)
	}

	relationshipBody, err := runtime.Kernel.ReadObject(ctx, mixedUpdate.State, refs["authored"])
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: mixedUpdate.State,
		Branch:    "main",
		Patch: deleteObjectPatch(refs["authored"], string(relationshipBody.YAML)) +
			deleteObjectPatch(refs["person"], string(personBody.YAML)),
	})
	if err != nil {
		t.Fatalf("explicit relationship + node delete: %v", err)
	}
	if deleted.State == mixedUpdate.State {
		t.Fatal("explicit delete did not advance state")
	}

	_, err = runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: mixedUpdate.State,
		Branch:    "main",
		Patch:     deleteObjectPatch(refs["person"], string(personBody.YAML)),
	})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
		t.Fatalf("stale base error = %v", err)
	}
}

func TestPhase04RelationshipDefinitionRenameMergesDirectKnowledgeUpdate(t *testing.T) {
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
			Properties:  []kernel.Property{{Name: "name", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	document := kernel.ObjectValue{
		Kind: kernel.KindNodeDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindNodeDefinition, Name: "Document",
			Properties:  []kernel.Property{{Name: "title", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	from := "new:node-definition:person"
	to := "new:node-definition:document"
	authored := kernel.ObjectValue{
		Kind: kernel.KindRelationshipDefinition,
		Definition: &kernel.Definition{
			Kind: kernel.KindRelationshipDefinition, Name: "AUTHORED", From: &from, To: &to,
			Properties:  []kernel.Property{{Name: "since", Type: "STRING"}},
			Constraints: []kernel.Constraint{},
		},
	}
	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addObjectPatch(t, "new:node-definition:person", person) +
			addObjectPatch(t, "new:node-definition:document", document) +
			addObjectPatch(t, "new:relationship-definition:authored", authored) +
			addRawObjectPatch(
				"new:knowledge-node:person",
				"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Alice\"\n",
			) +
			addRawObjectPatch(
				"new:knowledge-node:document",
				"labels:\n  - \"Document\"\nproperties:\n  \"title\": \"Design\"\n",
			) +
			addRawObjectPatch(
				"new:knowledge-relationship:authored",
				"type: \"AUTHORED\"\nstart: \"new:knowledge-node:person\"\nend: \"new:knowledge-node:document\"\nproperties:\n  \"since\": \"2026\"\n",
			),
	})
	if err != nil {
		t.Fatalf("seed mixed graph: %v", err)
	}
	var relationshipRef string
	for _, created := range seeded.Created {
		if created.Kind == kernel.KindKnowledgeRelationship && created.Alias == "authored" {
			relationshipRef = created.Ref
		}
	}
	if relationshipRef == "" {
		t.Fatalf("missing authored Relationship ref: %#v", seeded.Created)
	}

	definitionBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, "relationship:AUTHORED")
	if err != nil {
		t.Fatalf("read AUTHORED Definition: %v", err)
	}
	relationshipBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, relationshipRef)
	if err != nil {
		t.Fatalf("read AUTHORED Relationship: %v", err)
	}
	renamedDefinition := strings.Replace(
		string(definitionBody.YAML),
		"name: \"AUTHORED\"",
		"name: \"WROTE\"",
		1,
	)
	updatedRelationship := strings.Replace(
		string(relationshipBody.YAML),
		"\"2026\"",
		"\"2027\"",
		1,
	)
	result, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State,
		Branch:    "main",
		Patch: renameObjectPatch(
			"relationship:AUTHORED",
			"relationship:WROTE",
			string(definitionBody.YAML),
			renamedDefinition,
		) + replaceObjectPatch(
			relationshipRef,
			string(relationshipBody.YAML),
			updatedRelationship,
		),
	})
	if err != nil {
		t.Fatalf("rename Definition + direct Relationship update: %v", err)
	}
	var transitionedRef string
	for _, transition := range result.Transitions {
		if transition.From == relationshipRef {
			transitionedRef = transition.To
		}
	}
	if transitionedRef == "" {
		t.Fatalf("missing direct Relationship transition: %#v", result.Transitions)
	}
	finalBody, err := runtime.Kernel.ReadObject(ctx, result.State, transitionedRef)
	if err != nil {
		t.Fatalf("read transitioned Relationship: %v", err)
	}
	var relationship kernel.KnowledgeRelationship
	if err := json.Unmarshal(finalBody.JSON, &relationship); err != nil {
		t.Fatalf("decode transitioned Relationship: %v", err)
	}
	if relationship.Type != "WROTE" || string(relationship.Properties["since"]) != "\"2027\"" {
		t.Fatalf("transitioned Relationship = %#v", relationship)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, result.State, "relationship:WROTE"); err != nil {
		t.Fatalf("read renamed Definition: %v", err)
	}
}

func TestPhase04ObjectCancellationDoesNotMoveBranch(t *testing.T) {
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
			"new:knowledge-node:alice",
			"labels: []\nproperties:\n  \"name\": \"Alice\"\n",
		),
	})
	if err != nil {
		t.Fatalf("seed Knowledge Node: %v", err)
	}
	var ref string
	for _, item := range created.Created {
		if item.Alias == "alice" {
			ref = item.Ref
		}
	}
	if ref == "" {
		t.Fatalf("missing Alice Ref: %#v", created.Created)
	}
	body, err := runtime.Kernel.ReadObject(ctx, created.State, ref)
	if err != nil {
		t.Fatalf("read Alice: %v", err)
	}
	target := strings.Replace(string(body.YAML), "\"Alice\"", "\"Alicia\"", 1)

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := runtime.Kernel.ReadObjects(canceled, kernel.ObjectReadRequest{
		At: created.State, Refs: []string{ref},
	}); err == nil {
		t.Fatal("canceled Object read unexpectedly succeeded")
	}
	if _, err := runtime.Kernel.PatchObjects(canceled, kernel.PatchRequest{
		BaseState: created.State,
		Branch:    "main",
		Patch:     replaceObjectPatch(ref, string(body.YAML), target),
	}); err == nil {
		t.Fatal("canceled Object Patch unexpectedly succeeded")
	}
	assertMainState(t, runtime, created.State)
}

func TestPhase04KnowledgeUpdateRestructureAndMissingEndpointRollback(t *testing.T) {
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

	seeded, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: base,
		Branch:    "main",
		Patch: addRawObjectPatch(
			"new:knowledge-node:left",
			"labels:\n  - \"Person\"\n  - \"Member\"\nproperties:\n  \"name\": \"Alice\"\n",
		) + addRawObjectPatch(
			"new:knowledge-node:right",
			"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Bob\"\n",
		) + addRawObjectPatch(
			"new:knowledge-relationship:knows",
			"type: \"KNOWS\"\nstart: \"new:knowledge-node:left\"\nend: \"new:knowledge-node:right\"\nproperties:\n  \"since\": \"2026\"\n",
		),
	})
	if err != nil {
		t.Fatalf("seed Knowledge graph: %v", err)
	}
	refs := map[string]string{}
	for _, item := range seeded.Created {
		refs[item.Alias] = item.Ref
	}
	if refs["left"] == "" || refs["right"] == "" || refs["knows"] == "" {
		t.Fatalf("seed refs = %#v", refs)
	}

	leftBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, refs["left"])
	if err != nil {
		t.Fatal(err)
	}
	leftValue, err := kernel.ParseObjectYAML(kernel.KindKnowledgeNode, leftBody.YAML)
	if err != nil {
		t.Fatal(err)
	}
	leftValue.KnowledgeNode.Labels = append(leftValue.KnowledgeNode.Labels, "VIP")
	leftValue.KnowledgeNode.Properties["age"] = json.RawMessage("30")
	leftTarget, err := kernel.RenderObjectYAML(leftValue)
	if err != nil {
		t.Fatal(err)
	}

	relationshipBody, err := runtime.Kernel.ReadObject(ctx, seeded.State, refs["knows"])
	if err != nil {
		t.Fatal(err)
	}
	relationshipValue, err := kernel.ParseObjectYAML(kernel.KindKnowledgeRelationship, relationshipBody.YAML)
	if err != nil {
		t.Fatal(err)
	}
	relationshipValue.KnowledgeRelationship.Properties["since"] = json.RawMessage(`"2027"`)
	relationshipTarget, err := kernel.RenderObjectYAML(relationshipValue)
	if err != nil {
		t.Fatal(err)
	}
	updated, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: seeded.State,
		Branch:    "main",
		Patch: replaceObjectPatch(refs["left"], string(leftBody.YAML), string(leftTarget)) +
			replaceObjectPatch(refs["knows"], string(relationshipBody.YAML), string(relationshipTarget)),
	})
	if err != nil {
		t.Fatalf("update Node + Relationship properties: %v", err)
	}
	if len(updated.Transitions) != 0 {
		t.Fatalf("property-only update transitions = %#v", updated.Transitions)
	}
	leftBody, err = runtime.Kernel.ReadObject(ctx, updated.State, refs["left"])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(leftBody.YAML), "- \"VIP\"") ||
		!strings.Contains(string(leftBody.YAML), "\"age\": 30") {
		t.Fatalf("updated Node body:\n%s", leftBody.YAML)
	}
	relationshipBody, err = runtime.Kernel.ReadObject(ctx, updated.State, refs["knows"])
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(relationshipBody.YAML), "\"since\": \"2027\"") {
		t.Fatalf("updated Relationship body:\n%s", relationshipBody.YAML)
	}

	restructuredTarget := strings.Replace(
		string(relationshipBody.YAML),
		"end: \""+refs["right"]+"\"",
		"end: \"new:knowledge-node:charlie\"",
		1,
	)
	restructured, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: updated.State,
		Branch:    "main",
		Patch: addRawObjectPatch(
			"new:knowledge-node:charlie",
			"labels:\n  - \"Person\"\nproperties:\n  \"name\": \"Charlie\"\n",
		) + replaceObjectPatch(refs["knows"], string(relationshipBody.YAML), restructuredTarget),
	})
	if err != nil {
		t.Fatalf("restructure Relationship endpoint to new alias: %v", err)
	}
	var charlieRef, replacementRef string
	for _, item := range restructured.Created {
		if item.Alias == "charlie" {
			charlieRef = item.Ref
		}
	}
	for _, transition := range restructured.Transitions {
		if transition.From == refs["knows"] {
			replacementRef = transition.To
		}
	}
	if charlieRef == "" || replacementRef == "" {
		t.Fatalf("restructure result created=%#v transitions=%#v", restructured.Created, restructured.Transitions)
	}
	replacementBody, err := runtime.Kernel.ReadObject(ctx, restructured.State, replacementRef)
	if err != nil {
		t.Fatal(err)
	}
	var replacement kernel.KnowledgeRelationship
	if err := json.Unmarshal(replacementBody.JSON, &replacement); err != nil {
		t.Fatal(err)
	}
	if replacement.End != charlieRef || replacement.Start != refs["left"] {
		t.Fatalf("replacement Relationship = %#v", replacement)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, restructured.State, refs["knows"]); err == nil ||
		kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("old Relationship read error = %v", err)
	}

	missingEndpointTarget := strings.Replace(
		string(replacementBody.YAML),
		"end: \""+charlieRef+"\"",
		"end: \"n:999999999\"",
		1,
	)
	if _, err := runtime.Kernel.PatchObjects(ctx, kernel.PatchRequest{
		BaseState: restructured.State,
		Branch:    "main",
		Patch:     replaceObjectPatch(replacementRef, string(replacementBody.YAML), missingEndpointTarget),
	}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("missing endpoint error = %v", err)
	}
	assertMainState(t, runtime, restructured.State)
}

func addRawObjectPatch(target, body string) string {
	lines := objectBodyLines(body)
	var patch strings.Builder
	fmt.Fprintf(&patch, "diff --git a/%s b/%s\n", target, target)
	patch.WriteString("new file mode 100644\n")
	patch.WriteString("--- /dev/null\n")
	fmt.Fprintf(&patch, "+++ b/%s\n", target)
	fmt.Fprintf(&patch, "@@ -0,0 +1,%d @@\n", len(lines))
	for _, line := range lines {
		patch.WriteByte('+')
		patch.WriteString(line)
		patch.WriteByte('\n')
	}
	return patch.String()
}

func objectBodyLines(body string) []string {
	body = strings.TrimSuffix(body, "\n")
	if body == "" {
		return nil
	}
	return strings.Split(body, "\n")
}
