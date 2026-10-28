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

	sections := regexp.MustCompile("(?m)^## 案例 [ABC]：[^\\n]+").FindAllStringIndex(string(raw), -1)
	if len(sections) != 3 {
		t.Fatalf("published examples=%d; want three complete scenarios", len(sections))
	}
	expectedNodes := []int{3, 3, 3}
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
			if len(example.models) != expectedNodes[i] || len(example.checks) != 2 || len(example.semanticChecks) != 1 {
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
		})
	}
	if !strings.Contains(string(raw), "新增类别") || !strings.Contains(string(raw), "来源") {
		t.Fatal("published examples lost essential ontology decisions")
	}
}
