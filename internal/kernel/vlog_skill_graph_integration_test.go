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

// Create the literal Markdown definitions and execute the literal Markdown queries
// against an isolated real Lithograph graph. Historical VLogEntry remains independent.
func TestVLogHistoricalEventOntology(t *testing.T) {
	r, initial := newVLogSkillRuntime(t)
	ctx := context.Background()
	models := vlogGraphModels(t)
	if _, err := r.Kernel.ReadObject(ctx, initial, "node:Event"); err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectNotFound {
		t.Fatalf("Skill installation must not precreate Event: %v", err)
	}
	legacy, err := r.Kernel.ReadObject(ctx, initial, "node:ExampleVLog")
	if err != nil {
		t.Fatal(err)
	}
	sourceBefore, err := r.Database.ResolveState(ctx, "branch/source")
	if err != nil {
		t.Fatal(err)
	}

	aliases := map[string]string{}
	for i, m := range models {
		aliases[m.ref] = fmt.Sprintf("new:%s:graph%d", m.kind, i)
	}
	var patch strings.Builder
	for _, m := range models {
		raw, err := kernel.RenderObjectYAML(m.value)
		if err != nil {
			t.Fatal(err)
		}
		value, err := kernel.ParseObjectYAML(m.kind, raw)
		if err != nil {
			t.Fatal(err)
		}
		if value.Definition != nil {
			for _, endpoint := range []*string{value.Definition.From, value.Definition.To} {
				if endpoint == nil {
					continue
				}
				alias, ok := aliases[*endpoint]
				if !ok {
					t.Fatalf("unresolved VLog endpoint %q", *endpoint)
				}
				*endpoint = alias
			}
		}
		patch.WriteString(addObjectPatch(t, aliases[m.ref], value))
	}
	schema, err := r.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: "vlog", BaseState: initial, Patch: patch.String(),
	})
	if err != nil || len(schema.Created) != len(models) {
		t.Fatalf("create graph schema: got=%d want=%d err=%v", len(schema.Created), len(models), err)
	}
	for _, m := range models {
		want, err := kernel.RenderObjectYAML(m.value)
		if err != nil {
			t.Fatal(err)
		}
		got, err := r.Kernel.ReadObject(ctx, schema.State, m.ref)
		if err != nil || string(got.YAML) != string(want) {
			t.Fatalf("graph Definition roundtrip %s: %v\ngot=%s\nwant=%s", m.ref, err, got.YAML, want)
		}
	}
	existing, err := r.Kernel.ReadObject(ctx, schema.State, "node:ExampleVLog")
	if err != nil || string(existing.YAML) != string(legacy.YAML) {
		t.Fatalf("new model changed unrelated existing Ontology: %v", err)
	}

	seed, err := os.ReadFile(filepath.Join(vlogHistoricalGraphRoot, "seed.cypher"))
	if err != nil {
		t.Fatal(err)
	}
	seeded := graphExecute(t, r, "vlog", string(seed), nil)
	if seeded.State == schema.State {
		t.Fatal("sample Knowledge produced no new State")
	}
	queries := vlogCypherQueries(t)
	for _, sample := range vlogQueryCases(t) {
		t.Run(sample.ID, func(t *testing.T) {
			got := graphQuery(t, r, seeded.State, queries[sample.Query], mustRawParams(t, sample.Params))
			var rows [][]any
			data, err := json.Marshal(got.Rows)
			if err != nil {
				t.Fatal(err)
			}
			if err = json.Unmarshal(data, &rows); err != nil {
				t.Fatal(err)
			}
			if rows == nil {
				rows = [][]any{}
			}
			if got.State != seeded.State || !reflect.DeepEqual(got.Columns, sample.Columns) || !reflect.DeepEqual(rows, sample.Rows) {
				t.Fatalf("query %s columns=%v rows=%v state=%s; want %v %v %s", sample.Query, got.Columns, rows, got.State, sample.Columns, sample.Rows, seeded.State)
			}
		})
	}

	// New category "security-incident" is only Knowledge; the Event schema is unchanged.
	beforeEvent, err := r.Kernel.ReadObject(ctx, schema.State, "node:Event")
	if err != nil {
		t.Fatal(err)
	}
	afterEvent, err := r.Kernel.ReadObject(ctx, seeded.State, "node:Event")
	if err != nil || string(afterEvent.YAML) != string(beforeEvent.YAML) {
		t.Fatalf("new Concept category changed Event Definition: %v", err)
	}
	reject := "CREATE (:Event {eventKey:'run-01',summary:'duplicate event'})"
	_, err = r.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "vlog", Cypher: reject})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("duplicate Event identity must be rejected: %v", err)
	}
	head, err := r.Database.ResolveState(ctx, "branch/vlog")
	if err != nil || head != seeded.State {
		t.Fatalf("rejected creation moved VLog Head: %s %v", head, err)
	}
	sourceAfter, err := r.Database.ResolveState(ctx, "branch/source")
	if err != nil || sourceAfter != sourceBefore {
		t.Fatalf("VLog changed source Branch: %v", err)
	}
	t.Logf("validated %d published Definitions and %d parameterized query scenarios against a real isolated graph", len(models), len(vlogQueryCases(t)))
}
