//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// Validate the exact pinned public AIMemory and reused VLog definitions in a real,
// isolated KG OS/Lithograph State. Public Python CI only validates static shape.
func TestAIMemoryOntologyRuntime(t *testing.T) {
	runtime, initial := newVLogSkillRuntime(t)
	ctx := context.Background()
	initialSource, err := runtime.Database.ResolveState(ctx, "branch/source")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Kernel.ReadObject(ctx, initial, "node:Memory"); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("Skill must not install the Ontology implicitly: %v", err)
	}

	shared := vlogGraphModels(t)
	memory := memoryGraphModels(t)
	models := append(shared, memory...)
	aliases := map[string]string{}
	for i, m := range models {
		aliases[m.ref] = fmt.Sprintf("new:%s:memory%d", m.kind, i)
	}

	var patch strings.Builder
	add := func(m vlogGraphModel) {
		t.Helper()
		original, err := kernel.RenderObjectYAML(m.value)
		if err != nil {
			t.Fatal(err)
		}
		value, err := kernel.ParseObjectYAML(m.kind, original)
		if err != nil {
			t.Fatal(err)
		}
		if value.Definition != nil {
			for _, endpoint := range []*string{value.Definition.From, value.Definition.To} {
				if endpoint == nil {
					continue
				}
				ref, ok := aliases[*endpoint]
				if !ok {
					t.Fatalf("unresolved endpoint %s", *endpoint)
				}
				*endpoint = ref
			}
		}
		if value.Domain != nil {
			for i, ref := range value.Domain.Includes {
				alias, ok := aliases[ref]
				if !ok {
					t.Fatalf("unresolved Domain member %s", ref)
				}
				value.Domain.Includes[i] = alias
			}
		}
		patch.WriteString(addObjectPatch(t, aliases[m.ref], value))
	}
	// Definitions first, the optional Domain last.
	for _, m := range models {
		if m.kind != kernel.KindDomain {
			add(m)
		}
	}
	for _, m := range models {
		if m.kind == kernel.KindDomain {
			add(m)
		}
	}
	schema, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: "vlog", BaseState: initial, Patch: patch.String(),
	})
	if err != nil {
		t.Fatalf("AIMemory + shared VLog Ontology not accepted: %v", err)
	}
	if len(schema.Created) != len(models) {
		t.Fatalf("created %d Definitions, want %d", len(schema.Created), len(models))
	}
	for _, m := range memory {
		want, err := kernel.RenderObjectYAML(m.value)
		if err != nil {
			t.Fatal(err)
		}
		got, err := runtime.Kernel.ReadObject(ctx, schema.State, m.ref)
		if err != nil || string(got.YAML) != string(want) {
			t.Fatalf("Definition roundtrip %s: %v\ngot: %s\nwant: %s", m.ref, err, got.YAML, want)
		}
	}
	seed, err := os.ReadFile(filepath.Join(memorySkillRoot, "tests", "seed.cypher"))
	if err != nil {
		t.Fatal(err)
	}
	seeded := graphExecute(t, runtime, "vlog", string(seed), nil)
	if seeded.State == schema.State {
		t.Fatal("synthetic Knowledge did not create a new State")
	}

	queries := memoryCypherQueries(t)
	for _, c := range memoryQueryCases(t) {
		t.Run(c.ID, func(t *testing.T) {
			got := graphQuery(t, runtime, seeded.State, queries[c.Query], mustRawParams(t, c.Params))
			data, err := json.Marshal(got.Rows)
			if err != nil {
				t.Fatal(err)
			}
			var rows [][]any
			if err = json.Unmarshal(data, &rows); err != nil {
				t.Fatal(err)
			}
			if rows == nil {
				rows = [][]any{}
			}
			if got.State != seeded.State || !reflect.DeepEqual(got.Columns, c.Columns) || !reflect.DeepEqual(rows, c.Rows) {
				t.Fatalf("%s rows=%v columns=%v state=%s; want rows=%v cols=%v state=%s",
					c.Query, rows, got.Columns, got.State, c.Rows, c.Columns, seeded.State)
			}
		})
	}
	// A fifth kind is ordinary Knowledge; the MemoryKind Definition stays identical.
	pre, err := runtime.Kernel.ReadObject(ctx, schema.State, "node:MemoryKind")
	if err != nil {
		t.Fatal(err)
	}
	post, err := runtime.Kernel.ReadObject(ctx, seeded.State, "node:MemoryKind")
	if err != nil || string(pre.YAML) != string(post.YAML) {
		t.Fatalf("new MemoryKind changed Schema: %v", err)
	}

	// Database KEY/UNIQUE is enforced independently of the Skill.
	_, err = runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "vlog",
		Cypher: "CREATE (:Memory {memoryKey:'owner-a:focus-new',ownerKey:'owner-a',summary:'duplicate'})"})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("duplicate memory key must be rejected: %v", err)
	}
	head, err := runtime.Database.ResolveState(ctx, "branch/vlog")
	if err != nil || head != seeded.State {
		t.Fatalf("rejected mutation moved memory State: %s %v", head, err)
	}
	sourceNow, err := runtime.Database.ResolveState(ctx, "branch/source")
	if err != nil || sourceNow != initialSource {
		t.Fatalf("AIMemory modified unrelated Branch: %v", err)
	}
	t.Logf("AIMemory model: %d own Definitions + %d reused VLog Definitions, 11 cases", len(memory), len(shared))
}
