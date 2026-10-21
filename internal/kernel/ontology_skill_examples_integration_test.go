//go:build lithograph_smoke

package kernel_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	host "github.com/bYiyLi/kg-os/internal/runtime"
	"gopkg.in/yaml.v3"
)

type ontologySkillModel struct {
	ref  string
	kind kernel.ObjectKind
	body string
}

type ontologySkillCheck struct {
	query string
	want  struct {
		Columns []string `json:"columns"`
		Rows    [][]any  `json:"rows"`
	}
}

type ontologySkillCase struct {
	models         []ontologySkillModel
	seed           string
	checks         []ontologySkillCheck
	reject         string
	semanticSeed   string
	semanticChecks []ontologySkillCheck
}

// Exercise the actual shipped examples rather than maintaining a second fixture copy.
func TestOntologySkillExamples(t *testing.T) {
	for _, name := range []string{"KGOS_LITHOGRAPH_LIBRARY", "KGOS_LITHOGRAPH_PROVIDER_LIBRARY", "KGOS_JIEBA_LIBRARY"} {
		if _, err := os.Stat(os.Getenv(name)); err != nil {
			t.Fatalf("required real native fixture %s: %v", name, err)
		}
	}
	paths, err := filepath.Glob("../../plugins/kgos/skills/kgos-ontology-standards/references/cases/*.md")
	if err != nil || len(paths) != 8 {
		t.Fatalf("example coverage: paths=%v err=%v; want eight cases", paths, err)
	}
	for _, path := range paths {
		t.Run(strings.TrimSuffix(filepath.Base(path), ".md"), func(t *testing.T) {
			example := readOntologySkillCase(t, path)
			runtime, schemaState := loadOntologySkillCase(t, example)
			ctx := context.Background()
			for _, model := range example.models {
				want, err := kernel.ParseObjectYAML(model.kind, []byte(model.body))
				if err != nil {
					t.Fatalf("parse source %s: %v", model.ref, err)
				}
				wantYAML, err := kernel.RenderObjectYAML(want)
				if err != nil {
					t.Fatal(err)
				}
				got, err := runtime.Kernel.ReadObject(ctx, schemaState, model.ref)
				if err != nil || string(got.YAML) != string(wantYAML) {
					t.Fatalf("roundtrip %s err=%v\ngot=%s\nwant=%s", model.ref, err, got.YAML, wantYAML)
				}
			}
			seeded, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.seed})
			if err != nil || seeded.State == schemaState {
				t.Fatalf("seed actual examples: state=%q err=%v", seeded.State, err)
			}
			for i, check := range example.checks {
				t.Run(fmt.Sprintf("query%d", i+1), func(t *testing.T) { checkOntologySkillQuery(t, runtime, seeded.State, check) })
			}
			_, err = runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.reject})
			if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
				t.Fatalf("negative example must fail for constraint, not syntax/network: %v", err)
			}
			head, err := runtime.Database.ResolveState(ctx, "branch/main")
			if err != nil || head != seeded.State {
				t.Fatalf("rejected mutation changed head: %q %v", head, err)
			}
			semantic, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.semanticSeed})
			if err != nil || semantic.State == seeded.State {
				t.Fatalf("semantic counterexample must be structurally accepted: %v", err)
			}
			for i, check := range example.semanticChecks {
				t.Run(fmt.Sprintf("semantic%d", i+1), func(t *testing.T) { checkOntologySkillQuery(t, runtime, semantic.State, check) })
			}
			t.Logf("%d model round trips; %d exact queries; constraint rejection preserves State; %d semantic counterexamples detected", len(example.models), len(example.checks), len(example.semanticChecks))
		})
	}
}

func checkOntologySkillQuery(t *testing.T, runtime *host.Runtime, state string, check ontologySkillCheck) {
	t.Helper()
	got, err := runtime.Kernel.QueryGraph(context.Background(), kernel.GraphQueryRequest{At: state, Cypher: check.query})
	if err != nil || got.State != state {
		t.Fatalf("query state=%q err=%v", got.State, err)
	}
	var rows [][]any
	encoded, err := json.Marshal(got.Rows)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(encoded, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) == 0 {
		rows = [][]any{}
	}
	if !reflect.DeepEqual(got.Columns, check.want.Columns) || !reflect.DeepEqual(rows, check.want.Rows) {
		t.Fatalf("got %v %v; want %v %v", got.Columns, rows, check.want.Columns, check.want.Rows)
	}
}

func loadOntologySkillCase(t *testing.T, example ontologySkillCase) (*host.Runtime, string) {
	t.Helper()
	home := t.TempDir()
	writeKernelIntegrationConfig(t, home)
	ctx := context.Background()
	runtime, err := openKernelIntegrationRuntime(ctx, home)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Error(err)
		}
	})
	base, err := runtime.Database.ResolveState(ctx, "branch/main")
	if err != nil {
		t.Fatal(err)
	}
	aliases := map[string]string{}
	for i, model := range example.models {
		if _, exists := aliases[model.ref]; exists {
			t.Fatalf("duplicate example model %s", model.ref)
		}
		aliases[model.ref] = fmt.Sprintf("new:%s:m%d", model.kind, i)
	}
	var patch strings.Builder
	for _, model := range example.models {
		value, err := kernel.ParseObjectYAML(model.kind, []byte(model.body))
		if err != nil {
			t.Fatalf("parse %s: %v", model.ref, err)
		}
		if value.Definition != nil {
			for _, ptr := range []*string{value.Definition.From, value.Definition.To} {
				if ptr != nil {
					alias, ok := aliases[*ptr]
					if !ok {
						t.Fatalf("unresolved example endpoint %s", *ptr)
					}
					*ptr = alias
				}
			}
		}
		if value.Domain != nil {
			for i, ref := range value.Domain.Includes {
				alias, ok := aliases[ref]
				if !ok {
					t.Fatalf("unresolved example Domain member %s", ref)
				}
				value.Domain.Includes[i] = alias
			}
		}
		patch.WriteString(addObjectPatch(t, aliases[model.ref], value))
	}
	created, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: base, Patch: patch.String()})
	if err != nil || len(created.Created) != len(example.models) {
		t.Fatalf("create example schema: created=%d err=%v", len(created.Created), err)
	}
	return runtime, created.State
}

func readOntologySkillCase(t *testing.T, path string) ontologySkillCase {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(data), "\n")
	var result ontologySkillCase
	var section, ref, query string
	for i := 0; i < len(lines); i++ {
		line := lines[i]
		if strings.HasPrefix(line, "## ") {
			section = strings.TrimPrefix(line, "## ")
		}
		if strings.HasPrefix(line, "### node:") || strings.HasPrefix(line, "### relationship:") || strings.HasPrefix(line, "### domain:") {
			ref = strings.TrimPrefix(line, "### ")
		}
		if !strings.HasPrefix(line, "```") || line == "```" {
			continue
		}
		language := strings.TrimPrefix(line, "```")
		start := i + 1
		for i++; i < len(lines) && lines[i] != "```"; i++ {
		}
		if i == len(lines) {
			t.Fatalf("unclosed code block in %s", path)
		}
		body := strings.Join(lines[start:i], "\n") + "\n"
		switch language {
		case "yaml":
			kind := kernel.KindNodeDefinition
			switch {
			case strings.HasPrefix(ref, "relationship:"):
				kind = kernel.KindRelationshipDefinition
			case strings.HasPrefix(ref, "domain:"):
				kind = kernel.KindDomain
			case !strings.HasPrefix(ref, "node:"):
				t.Fatalf("missing typed heading for YAML in %s", path)
			}
			result.models = append(result.models, ontologySkillModel{ref: ref, kind: kind, body: body})
			ref = ""
		case "cypher":
			switch {
			case strings.HasPrefix(section, "语义反例"):
				if result.semanticSeed != "" {
					t.Fatal("duplicate semantic seed")
				}
				result.semanticSeed = body
			case strings.HasPrefix(section, "合成实例"):
				if result.seed != "" {
					t.Fatal("duplicate seed")
				}
				result.seed = body
			case section == "数据库反例":
				if result.reject != "" {
					t.Fatal("duplicate rejection")
				}
				result.reject = body
			case section == "验证问题" || section == "语义检查":
				if query != "" {
					t.Fatal("query lacks expected result")
				}
				query = body
			default:
				t.Fatalf("unclassified Cypher block: %s / %s", path, section)
			}
		case "json":
			if query == "" {
				t.Fatal("expected result without query")
			}
			check := ontologySkillCheck{query: query}
			if err := json.Unmarshal([]byte(body), &check.want); err != nil {
				t.Fatal(err)
			}
			if len(check.want.Columns) == 0 || check.want.Rows == nil {
				t.Fatal("expected result must explicitly provide columns and rows")
			}
			if section == "语义检查" {
				if len(check.want.Rows) == 0 {
					t.Fatal("semantic example must be detected, not vacuously pass")
				}
				result.semanticChecks = append(result.semanticChecks, check)
			} else {
				result.checks = append(result.checks, check)
			}
			query = ""
		default:
			t.Fatalf("example code language not validated %q", language)
		}
	}
	if len(result.models) == 0 || result.seed == "" || len(result.checks) < 2 || result.reject == "" || query != "" || result.semanticSeed == "" || len(result.semanticChecks) == 0 {
		t.Fatalf("incomplete case %s", path)
	}
	return result
}

// These checks guard model-changing operations taught by the skill on its own examples.
func TestOntologySkillEvolution(t *testing.T) {
	example := readOntologySkillCase(t, "../../plugins/kgos/skills/kgos-ontology-standards/references/cases/documents.md")
	runtime, _ := loadOntologySkillCase(t, example)
	ctx := context.Background()
	seeded, err := runtime.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: example.seed})
	if err != nil {
		t.Fatal(err)
	}
	before, err := runtime.Kernel.ReadObject(ctx, seeded.State, "node:ResearchNote")
	if err != nil {
		t.Fatal(err)
	}
	noop, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: seeded.State, Patch: replaceObjectPatch("node:ResearchNote", string(before.YAML), string(before.YAML))})
	if err != nil || noop.State != seeded.State {
		t.Fatalf("no-op created state or failed: %v %v", noop, err)
	}
	source, err := runtime.Kernel.ReadObject(ctx, seeded.State, "node:SourceSnapshot")
	if err != nil {
		t.Fatal(err)
	}
	sourceValue, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, source.YAML)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for i := range sourceValue.Definition.Properties {
		if sourceValue.Definition.Properties[i].Name == "publishedOn" {
			sourceValue.Definition.Properties[i].Required = true
			found = true
		}
	}
	if !found {
		t.Fatal("publishedOn prerequisite absent")
	}
	tightened, err := kernel.RenderObjectYAML(sourceValue)
	if err != nil {
		t.Fatal(err)
	}
	_, err = runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: seeded.State, Patch: replaceObjectPatch("node:SourceSnapshot", string(source.YAML), string(tightened))})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeConstraint {
		t.Fatalf("missing values must prevent required tightening: %v", err)
	}
	assertMainState(t, runtime, seeded.State)
	target := strings.Replace(string(before.YAML), "name: \"body\"", "name: \"content\"\n    renameFrom: \"body\"", 1)
	if target == string(before.YAML) {
		t.Fatal("rename did not change body")
	}
	renamed, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: seeded.State, Patch: replaceObjectPatch("node:ResearchNote", string(before.YAML), target)})
	if err != nil {
		t.Fatalf("meaning-preserving rename: %v", err)
	}
	after, err := runtime.Kernel.ReadObject(ctx, renamed.State, "node:ResearchNote")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(after.YAML), "renameFrom") || !strings.Contains(string(after.YAML), "research_note_body_fulltext") || !strings.Contains(string(after.YAML), "research_note_body_semantic") {
		t.Fatalf("rename changed stable indexes or retained input-only marker: %s", after.YAML)
	}
	current := ontologySkillCheck{query: "MATCH (n:ResearchNote {noteKey:'N1'}) RETURN n.content AS content, n.body IS NULL AS oldAbsent"}
	current.want.Columns = []string{"content", "oldAbsent"}
	current.want.Rows = [][]any{{"Cache behavior changed", true}}
	checkOntologySkillQuery(t, runtime, renamed.State, current)
	historic := ontologySkillCheck{query: "MATCH (n:ResearchNote {noteKey:'N1'}) RETURN n.body AS body"}
	historic.want.Columns = []string{"body"}
	historic.want.Rows = [][]any{{"Cache behavior changed"}}
	checkOntologySkillQuery(t, runtime, seeded.State, historic)
	_, err = runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: seeded.State, Patch: replaceObjectPatch("node:ResearchNote", string(before.YAML), target)})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeStaleBaseState {
		t.Fatalf("stale replay must not succeed: %v", err)
	}
	_, err = runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{Branch: "main", BaseState: renamed.State, Patch: deleteObjectPatch("node:ResearchNote", string(after.YAML))})
	if err == nil || kernel.AsPublicError(err).Code != kernel.CodeObjectConflict {
		t.Fatalf("used Definition deletion must not cascade: %v", err)
	}
	assertMainState(t, runtime, renamed.State)
	checkOntologySkillQuery(t, runtime, renamed.State, current)
}

func TestOntologySkillResourceContract(t *testing.T) {
	root, err := filepath.Abs("../../plugins/kgos/skills/kgos-ontology-standards")
	if err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(filepath.Join(root, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(string(data), "---\n", 3)
	if len(parts) != 3 || parts[0] != "" {
		t.Fatal("missing YAML metadata")
	}
	var meta struct {
		Name        string            `yaml:"name"`
		Description string            `yaml:"description"`
		Metadata    map[string]string `yaml:"metadata"`
	}
	decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
	decoder.KnownFields(true)
	if err := decoder.Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 || meta.Metadata["version"] == "" {
		t.Fatalf("invalid metadata: %+v", meta)
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	reached := map[string]bool{}
	queue := []string{filepath.Join(root, "SKILL.md")}
	for len(queue) > 0 {
		path := queue[0]
		queue = queue[1:]
		if reached[path] {
			continue
		}
		reached[path] = true
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, match := range links.FindAllStringSubmatch(string(raw), -1) {
			target := match[1]
			if strings.HasPrefix(target, "https://") {
				continue
			}
			target = strings.SplitN(target, "#", 2)[0]
			next := filepath.Clean(filepath.Join(filepath.Dir(path), target))
			if !strings.HasPrefix(next, root+string(os.PathSeparator)) {
				t.Fatalf("runtime reference escapes standalone package: %s", next)
			}
			queue = append(queue, next)
		}
	}
	count := 0
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			count++
			if !reached[path] {
				return fmt.Errorf("unreachable runtime resource: %s", path)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if count != 13 {
		t.Fatalf("want entrypoint plus 4 focused references plus 8 cases, got %d", count)
	}
	t.Logf("valid versioned metadata; %d reachable, package-local runtime files", count)
}
