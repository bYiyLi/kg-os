package kernel

import (
	"reflect"
	"testing"
)

func TestDomainMembershipChangesPreserveBindingIdentity(t *testing.T) {
	t.Parallel()
	base := plannerBaseSnapshot()
	base.Domains = map[string]*domainRecord{
		"Research": {ElementID: "n:1", Value: Domain{Name: "Research", Includes: []string{"domain:Lab", "node:N"}}},
		"Lab":      {ElementID: "n:2", Value: Domain{Name: "Lab", Includes: []string{"domain:Research", "node:N"}}},
	}
	base.internalRelationships = map[string]taggedRelationship{
		"r:1": {ElementID: "r:1", Type: includesType, Start: "n:1", End: "n:2"},
		"r:2": {ElementID: "r:2", Type: includesType, Start: "n:2", End: "n:1"},
		"r:3": {ElementID: "r:3", Type: includesType, Start: "n:1", End: "n:3"},
		"r:4": {ElementID: "r:4", Type: includesType, Start: "n:2", End: "n:3"},
		"r:5": {ElementID: "r:5", Type: propertyOfType, Start: "n:5", End: "n:3"},
	}
	plan, err := planOntologyEntries(base, nil)
	if err != nil {
		t.Fatal(err)
	}
	research := OntologyRef{Kind: KindDomain, Name: "Research"}
	domains := map[OntologyRef]string{research: "n:1", {Kind: KindDomain, Name: "Lab"}: "n:2"}
	definitions := map[OntologyRef]string{{Kind: KindNodeDefinition, Name: "N"}: "n:3", {Kind: KindNodeDefinition, Name: "M"}: "n:4"}
	removed, added, err := plannedDomainMembershipChanges(plan, domains, definitions)
	if err != nil || len(removed) != 0 || len(added) != 0 {
		t.Fatalf("unchanged memberships were rebuilt: %v, %v, %v", removed, added, err)
	}
	plan.Objects[research].Value.Domain.Includes = []string{"domain:Lab", "node:M"}
	removed, added, err = plannedDomainMembershipChanges(plan, domains, definitions)
	if err != nil || !reflect.DeepEqual(removed, []string{"r:3"}) ||
		!reflect.DeepEqual(added, []domainMembership{{DomainID: "n:1", TargetID: "n:4"}}) {
		t.Fatalf("membership delta = %v, %v, %v", removed, added, err)
	}
	plan.Objects = map[OntologyRef]*plannedObject{}
	removed, added, err = plannedDomainMembershipChanges(plan, nil, nil)
	if err != nil || !reflect.DeepEqual(removed, []string{"r:1", "r:2", "r:3", "r:4"}) || len(added) != 0 {
		t.Fatalf("removed memberships touched Property ownership: %v, %v, %v", removed, added, err)
	}
}

func TestDomainMembershipChangesRequireResolvedBindingIdentities(t *testing.T) {
	t.Parallel()
	research := OntologyRef{Kind: KindDomain, Name: "Research"}
	for _, test := range []struct {
		name     string
		includes []string
		domainID string
		code     ErrorCode
	}{
		{"missing Domain identity", []string{}, "", CodeConsistency},
		{"invalid Ref", []string{"invalid"}, "n:1", CodeInvalidArgument},
		{"missing target identity", []string{"node:Missing"}, "n:1", CodeConsistency},
	} {
		t.Run(test.name, func(t *testing.T) {
			plan := &plannedState{Base: &snapshot{}, Objects: map[OntologyRef]*plannedObject{
				research: {Value: ObjectValue{Kind: KindDomain, Domain: &Domain{Name: "Research", Includes: test.includes}}},
			}}
			_, _, err := plannedDomainMembershipChanges(plan, map[OntologyRef]string{research: test.domainID}, nil)
			if err == nil || AsPublicError(err).Code != test.code {
				t.Fatalf("unresolved membership accepted: %v", err)
			}
		})
	}
}
