//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/lithograph"
)

func TestPhase32IncrementalDefinitionKeepsExistingConstraints(t *testing.T) {
	cases := []struct {
		name        string
		constraints []kernel.Constraint
		inline      bool
		hasData     bool
		withIndex   bool
	}{
		{name: "no constraint"},
		{name: "single unique", constraints: []kernel.Constraint{{Type: "unique", Properties: []string{"id"}}}},
		{name: "single key", constraints: []kernel.Constraint{{Type: "key", Properties: []string{"id"}}}},
		{name: "named key", constraints: []kernel.Constraint{{Name: "person_key", Type: "key", Properties: []string{"id"}}}},
		{name: "named unique", constraints: []kernel.Constraint{{Name: "person_unique_id", Type: "unique", Properties: []string{"id"}}}},
		{name: "inline key", inline: true},
		{name: "composite key", constraints: []kernel.Constraint{{Type: "key", Properties: []string{"id", "name"}}}},
		{name: "named composite key", constraints: []kernel.Constraint{{Name: "person_composite_key", Type: "key", Properties: []string{"id", "name"}}}},
		{name: "named key with existing data", constraints: []kernel.Constraint{{Name: "person_unique_id", Type: "key", Properties: []string{"id"}}}, hasData: true},
		{name: "unique with range index", constraints: []kernel.Constraint{{Type: "unique", Properties: []string{"id"}}}, withIndex: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx := context.Background()
			home := t.TempDir()
			writeKernelIntegrationConfig(t, home)
			runtime, err := openKernelIntegrationRuntime(ctx, home)
			if err != nil {
				t.Fatal(err)
			}
			defer runtime.Close()
			base, err := runtime.Database.ResolveState(ctx, "branch/main")
			if err != nil {
				t.Fatal(err)
			}
			person := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{
				Kind: kernel.KindNodeDefinition, Name: "Person",
				Properties:  []kernel.Property{{Name: "id", Type: "STRING"}, {Name: "name", Type: "STRING"}},
				Constraints: tc.constraints,
			}}
			if tc.inline {
				person.Definition.Properties[0].Constraints = []kernel.Constraint{{Type: "key"}}
			}
			if tc.withIndex {
				person.Definition.Properties[1].Indexes = []kernel.Index{{Name: "person_name_range", Type: "range"}}
			}
			created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
				BaseState: base, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:person", person),
			})
			if err != nil {
				t.Fatalf("create Person: %v", err)
			}
			if tc.hasData {
				if _, err := runtime.Database.Execute(ctx, lithograph.ExecuteRequest{
					Branch: "main", Cypher: "CREATE (:Person {id: 'p1', name: 'Alice'}) FINISH",
				}); err != nil {
					t.Fatalf("create existing Person Knowledge: %v", err)
				}
				created.State, err = runtime.Database.ResolveState(ctx, "branch/main")
				if err != nil {
					t.Fatal(err)
				}
			}
			before, err := runtime.Kernel.ReadObject(ctx, created.State, "node:Person")
			if err != nil {
				t.Fatal(err)
			}
			note := kernel.ObjectValue{Kind: kernel.KindNodeDefinition, Definition: &kernel.Definition{
				Kind: kernel.KindNodeDefinition, Name: "Note",
				Properties:  []kernel.Property{{Name: "id", Type: "STRING"}, {Name: "text", Type: "STRING"}},
				Constraints: []kernel.Constraint{{Type: "key", Properties: []string{"id"}}},
			}}
			added, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
				BaseState: created.State, Branch: "main", Patch: addObjectPatch(t, "new:node-definition:note", note),
			})
			if err != nil {
				t.Fatalf("add independent Note after Person: %v", err)
			}
			after, err := runtime.Kernel.ReadObject(ctx, added.State, "node:Person")
			if err != nil {
				t.Fatal(err)
			}
			if string(before.YAML) != string(after.YAML) {
				t.Fatalf("unmodified Person changed:\nBEFORE:\n%s\nAFTER:\n%s", before.YAML, after.YAML)
			}
			if _, err := runtime.Kernel.ReadObject(ctx, added.State, "node:Note"); err != nil {
				t.Fatalf("read Note: %v", err)
			}
			if tc.hasData && querySingleInt(t, runtime, added.State, "MATCH (p:Person {id: 'p1'}) RETURN count(p) AS count") != 1 {
				t.Fatal("existing Person Knowledge was changed")
			}
			if tc.name == "single key" {
				invalidBody := "name: Invalid\nproperties:\n  - name: id\n    type: STRING\n    constraints:\n      - type: key\n        properties: [id, another]\n  - name: another\n    type: STRING\nconstraints: []\n"
				if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
					BaseState: added.State, Branch: "main", Patch: addRawObjectPatch("new:node-definition:invalid", invalidBody),
				}); err == nil {
					t.Fatal("invalid inline composite KEY was accepted")
				}
				if _, err := runtime.Kernel.ReadObject(ctx, added.State, "node:Invalid"); err == nil {
					t.Fatal("invalid candidate appeared in preceding State")
				}
				noOp, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
					BaseState: added.State, Branch: "main", Patch: replaceObjectPatch("node:Person", string(after.YAML), string(after.YAML)),
				})
				if err != nil || noOp.State != added.State {
					t.Fatalf("no-op changed state: %v (%s)", err, noOp.State)
				}
				if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
					BaseState: created.State, Branch: "main", Patch: replaceObjectPatch("node:Person", string(before.YAML), string(before.YAML)),
				}); err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
					t.Fatalf("stale base not rejected: %v", err)
				}
				head, err := runtime.Database.ResolveState(ctx, "branch/main")
				if err != nil || head != added.State {
					t.Fatalf("rejected/no-op patch moved main: %v (%s)", err, head)
				}
				from, to := "node:Person", "node:Note"
				link := kernel.ObjectValue{Kind: kernel.KindRelationshipDefinition, Definition: &kernel.Definition{
					Kind: kernel.KindRelationshipDefinition, Name: "LINK", From: &from, To: &to,
					Properties: []kernel.Property{{Name: "role", Type: "STRING"}}, Constraints: []kernel.Constraint{},
				}}
				linked, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
					BaseState: added.State, Branch: "main", Patch: addObjectPatch(t, "new:relationship-definition:link", link),
				})
				if err != nil {
					t.Fatalf("create relationship after constrained node: %v", err)
				}
				if _, err := runtime.Kernel.ReadObject(ctx, linked.State, "relationship:LINK"); err != nil {
					t.Fatalf("read relationship: %v", err)
				}
				linkedPerson, err := runtime.Kernel.ReadObject(ctx, linked.State, "node:Person")
				if err != nil || string(linkedPerson.YAML) != string(after.YAML) {
					t.Fatalf("relationship changed existing Person: %v", err)
				}
			}
		})
	}
}
