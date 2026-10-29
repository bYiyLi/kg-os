//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
)

// Published examples are the source of the executable YAML, Cypher and expected rows.
// This intentionally does not duplicate Schema fixtures or execute against user data.
func TestOntologyStandardsPublishedExamples(t *testing.T) {
	for _, key := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(key)); err != nil {
			t.Fatalf("native KG OS/Lithograph test dependency %s: %v", key, err)
		}
	}
	file := "../../plugins/kgos/skills/kgos-ontology-standards/references/modeling-examples.md"
	raw, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}

	sections := regexp.MustCompile("(?m)^## 案例 [ABCD]：[^\\n]+").FindAllStringIndex(string(raw), -1)
	if len(sections) != 4 {
		t.Fatalf("published examples=%d; want four complete scenarios", len(sections))
	}
	expectedNodes := []int{3, 3, 3, 5}
	expectedChecks := []int{2, 2, 2, 3}
	for i, span := range sections {
		start, stop := span[0], len(raw)
		if i+1 < len(sections) {
			stop = sections[i+1][0]
		}
		body := raw[start:stop]
		t.Run(fmt.Sprintf("example-%d", i+1), func(t *testing.T) {
			dir := t.TempDir()
			path := filepath.Join(dir, "example.md")
			if err := os.WriteFile(path, body, 0600); err != nil {
				t.Fatal(err)
			}

			example := readOntologySkillCase(t, path)
			if len(example.models) != expectedNodes[i] || len(example.checks) != expectedChecks[i] || len(example.semanticChecks) != 1 {
				t.Fatalf("model=%d checks=%d semantic=%d", len(example.models), len(example.checks), len(example.semanticChecks))
			}
			runtime, schemaState := loadOntologySkillCase(t, example)
			ctx := context.Background()
			for _, model := range example.models {
				actual, err := runtime.Kernel.ReadObject(ctx, schemaState, model.ref)
				if err != nil {
					t.Fatalf("definition %s not readable: %v", model.ref, err)
				}
				parsed, err := kernel.ParseObjectYAML(model.kind, []byte(model.body))
				if err != nil {
					t.Fatal(err)
				}
				canonical, err := kernel.RenderObjectYAML(parsed)
				if err != nil || string(actual.YAML) != string(canonical) {
					t.Fatalf("definition %s roundtrip: %v", model.ref, err)
				}
			}
			seeded, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.seed})
			if err != nil || seeded.State == schemaState {
				t.Fatalf("seed: %s / %v", seeded.State, err)
			}
			for i, check := range example.checks {
				t.Run(fmt.Sprintf("query-%d", i+1), func(t *testing.T) { checkOntologySkillQuery(t, runtime, seeded.State, check) })
			}
			_, err = runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.reject})
			if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
				t.Fatalf("expected real uniqueness violation, got %v", err)
			}
			head, err := runtime.Database.ResolveState(ctx, "branch/main")
			if err != nil || head != seeded.State {
				t.Fatalf("rejected mutation moved State: %s / %v", head, err)
			}

			semantic, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.semanticSeed})
			if err != nil || semantic.State == seeded.State {
				t.Fatalf("semantic counterexample: %v", err)
			}
			for i, check := range example.semanticChecks {
				t.Run(fmt.Sprintf("semantic-%d", i+1), func(t *testing.T) { checkOntologySkillQuery(t, runtime, semantic.State, check) })
			}
			if i == 3 {
				t.Run("shared-index-scope-and-domain-removal", func(t *testing.T) {
					checkPublishedIndexScopeAndDomainRemoval(t, runtime, semantic.State)
				})
			}
		})
	}
	if !strings.Contains(string(raw), "新增类别") || !strings.Contains(string(raw), "来源") {
		t.Fatal("published examples lost essential ontology decisions")
	}
}

// The public example remains the fixture; this tests the important distinction
// between changing shared Index targets and deleting the Index itself.
func checkPublishedIndexScopeAndDomainRemoval(t *testing.T, runtime *host.Runtime, state string) {
	t.Helper()
	ctx := context.Background()
	read := func(at, ref string) string {
		t.Helper()
		body, err := runtime.Kernel.ReadObject(ctx, at, ref)
		if err != nil {
			t.Fatalf("read %s: %v", ref, err)
		}
		return string(body.YAML)
	}
	check := func(at, query string, columns []string, rows [][]any) {
		t.Helper()
		item := ontologySkillCheck{query: query}
		item.want.Columns = columns
		item.want.Rows = rows
		checkOntologySkillQuery(t, runtime, at, item)
	}
	const docRef = "node:ResearchDocument"
	const otherRef = "node:ProjectRecord"
	before := read(state, docRef)
	value, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, []byte(before))
	if err != nil || len(value.Definition.Indexes) != 1 {
		t.Fatalf("shared Index missing in source: %v", err)
	}
	value.Definition.Indexes[0].Targets = []string{docRef}
	scopedBody, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	scoped, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: "main", BaseState: state,
		Patch: replaceObjectPatch(docRef, before, string(scopedBody)),
	})
	if err != nil || scoped.State == state {
		t.Fatalf("narrow shared Index targets: %v", err)
	}
	if strings.Contains(read(scoped.State, otherRef), "shared_titles") ||
		!strings.Contains(read(scoped.State, docRef), "shared_titles") {
		t.Fatal("narrowing targets changed the wrong Index coverage")
	}
	check(scoped.State,
		"CALL db.index.fulltext.queryNodes('shared_titles','graph',{limit:10}) YIELD node RETURN node.title AS title ORDER BY title",
		[]string{"title"}, [][]any{{"graph search"}})
	check(scoped.State, "SHOW ALL INDEXES YIELD name WHERE name='shared_titles' RETURN count(name) AS count",
		[]string{"count"}, [][]any{{float64(1)}})

	// Removing an organizational Domain must not delete its Definition or Knowledge.
	domainBody := read(scoped.State, "domain:Research")
	removedDomain, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: "main", BaseState: scoped.State,
		Patch: deleteObjectPatch("domain:Research", domainBody),
	})
	if err != nil {
		t.Fatalf("remove Domain: %v", err)
	}
	read(removedDomain.State, docRef)
	read(removedDomain.State, "domain:Projects")
	check(removedDomain.State, "MATCH (r:ResearchDocument) RETURN count(r) AS documents",
		[]string{"documents"}, [][]any{{float64(1)}})
	check(removedDomain.State,
		"MATCH (:ResearchDocument {docKey:'R1'})-[:USED_IN]->(p:ProjectRecord) RETURN p.recordKey AS key",
		[]string{"key"}, [][]any{{"P1"}})

	// After narrowing to one Definition and field, canonical read may project
	// this Index to Property-local instead of Definition-level indexes.
	current := read(removedDomain.State, docRef)
	value, err = kernel.ParseObjectYAML(kernel.KindNodeDefinition, []byte(current))
	if err != nil {
		t.Fatal(err)
	}
	removedDeclarations := 0
	kept := value.Definition.Indexes[:0]
	for _, index := range value.Definition.Indexes {
		if index.Name == "shared_titles" {
			removedDeclarations++
			continue
		}
		kept = append(kept, index)
	}
	value.Definition.Indexes = kept
	for i := range value.Definition.Properties {
		property := &value.Definition.Properties[i]
		kept := property.Indexes[:0]
		for _, index := range property.Indexes {
			if index.Name == "shared_titles" {
				removedDeclarations++
				continue
			}
			kept = append(kept, index)
		}
		property.Indexes = kept
	}
	if removedDeclarations != 1 {
		t.Fatalf("expected one current Index declaration, found %d", removedDeclarations)
	}
	withoutIndex, err := kernel.RenderObjectYAML(value)
	if err != nil {
		t.Fatal(err)
	}
	deleted, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: "main", BaseState: removedDomain.State,
		Patch: replaceObjectPatch(docRef, current, string(withoutIndex)),
	})
	if err != nil {
		t.Fatalf("delete shared Index: %v", err)
	}
	check(deleted.State, "SHOW ALL INDEXES YIELD name WHERE name='shared_titles' RETURN count(name) AS count",
		[]string{"count"}, [][]any{{float64(0)}})
}
