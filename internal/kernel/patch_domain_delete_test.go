package kernel

import (
	"reflect"
	"testing"
)

func TestPatchPlanDomainDeleteRemovesCyclicIncomingMemberships(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	base.Domains = map[string]*domainRecord{
		"Research": {Value: Domain{Name: "Research", Includes: []string{"domain:Lab", "node:N", "node:M", "relationship:R"}}},
		"Lab":      {Value: Domain{Name: "Lab", Includes: []string{"domain:Research", "node:N"}}},
		"Parent":   {Value: Domain{Name: "Parent", Includes: []string{"domain:Research", "domain:Lab", "node:M"}}},
	}
	research, _ := base.objectValue(OntologyRef{Kind: KindDomain, Name: "Research"})
	body, err := RenderObjectYAML(research)
	if err != nil {
		t.Fatal(err)
	}
	deletePatch := wholeFileDeletePatch("domain:Research", string(body))
	lab, _ := base.objectValue(OntologyRef{Kind: KindDomain, Name: "Lab"})
	labBody, err := RenderObjectYAML(lab)
	if err != nil {
		t.Fatal(err)
	}
	updatedLab := string(labBody) + "description: \"edited with deletion\"\n"
	updatePatch := wholeFileUpdatePatch("domain:Lab", string(labBody), updatedLab)
	for _, patch := range []string{deletePatch, updatePatch + deletePatch, deletePatch + updatePatch} {
		plan, err := planOntologyPatch(base, patch)
		if err != nil {
			t.Fatal(err)
		}
		if plan.Objects[OntologyRef{Kind: KindDomain, Name: "Research"}] != nil {
			t.Fatal("deleted Domain remained in the target")
		}
		for name, want := range map[string][]string{"Lab": {"node:N"}, "Parent": {"domain:Lab", "node:M"}} {
			actual := plan.Objects[OntologyRef{Kind: KindDomain, Name: name}].Value.Domain.Includes
			if !reflect.DeepEqual(actual, want) {
				t.Fatalf("surviving %s membership = %v; want %v", name, actual, want)
			}
		}
		if len(plan.Objects) != len(base.Definitions)+2 {
			t.Fatalf("Domain deletion removed members: %#v", plan.Objects)
		}
		if !containsString(base.Domains["Lab"].Value.Includes, "domain:Research") || len(base.Domains["Research"].Value.Includes) != 4 {
			t.Fatal("derived cleanup mutated the base Snapshot")
		}
	}
	for _, invalid := range []struct {
		includes string
		code     ErrorCode
	}{
		{`["domain:Research", "domain:Missing"]`, CodeObjectNotFound},
		{`["domain:Research", "new:domain:missing"]`, CodeInvalidArgument},
		{`["domain:Research", "domain:Research"]`, CodeType},
	} {
		target := "name: \"Lab\"\nincludes: " + invalid.includes + "\n"
		_, err := planOntologyPatch(base, deletePatch+wholeFileUpdatePatch("domain:Lab", string(labBody), target))
		if err == nil || AsPublicError(err).Code != invalid.code {
			t.Fatalf("invalid membership %s was silently removed: %v", invalid.includes, err)
		}
	}
}

func TestPatchPlanDefinitionDeleteClearsMembershipButKeepsEndpointDependencies(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	base.Domains["Research"] = &domainRecord{Value: Domain{Name: "Research", Includes: []string{"node:N", "relationship:R"}}}
	deletion := func(ref OntologyRef) string {
		value, err := base.objectValue(ref)
		if err != nil {
			t.Fatal(err)
		}
		body, err := RenderObjectYAML(value)
		if err != nil {
			t.Fatal(err)
		}
		return wholeFileDeletePatch(ref.String(), string(body))
	}
	deleteRelationship := deletion(OntologyRef{Kind: KindRelationshipDefinition, Name: "R"})
	deleteNode := deletion(OntologyRef{Kind: KindNodeDefinition, Name: "N"})
	plan, err := planOntologyPatch(base, deleteRelationship)
	if err != nil || !reflect.DeepEqual(plan.Objects[OntologyRef{Kind: KindDomain, Name: "Research"}].Value.Domain.Includes, []string{"node:N"}) {
		t.Fatalf("unused Relationship Definition membership was not cleared: %#v, %v", plan, err)
	}
	if _, err := planOntologyPatch(base, deleteNode); err == nil || AsPublicError(err).Code != CodeObjectConflict {
		t.Fatalf("membership cleanup erased surviving endpoint dependency: %v", err)
	}
	plan, err = planOntologyPatch(base, deleteNode+deleteRelationship)
	if err != nil || len(plan.Objects[OntologyRef{Kind: KindDomain, Name: "Research"}].Value.Domain.Includes) != 0 || len(plan.Objects) != len(base.Domains)+1 {
		t.Fatalf("explicit same-Patch dependency deletion failed: %#v, %v", plan, err)
	}
	if len(base.Domains["Research"].Value.Includes) != 2 {
		t.Fatal("membership cleanup changed historical base")
	}
}
