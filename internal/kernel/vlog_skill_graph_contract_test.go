package kernel_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

type vlogGraphModel struct {
	ref   string
	kind  kernel.ObjectKind
	value kernel.ObjectValue
}

type vlogQueryCase struct {
	ID      string         `json:"id"`
	Query   string         `json:"query"`
	Params  map[string]any `json:"params"`
	Columns []string       `json:"columns"`
	Rows    [][]any        `json:"rows"`
}

// The Markdown code fences are the sole authored definitions; no duplicate YAML fixtures.
func vlogGraphModels(t *testing.T) []vlogGraphModel {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vlogSkillRoot, "references", "ontology.md"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(raw)
	blocks := regexp.MustCompile("(?ms)^### (node|relationship):([A-Za-z][A-Za-z0-9_]*)\\n\\n```yaml\\n(.*?)\\n```").FindAllStringSubmatch(text, -1)
	if len(blocks) != 13 || strings.Count(text, "```yaml") != 13 {
		t.Fatalf("ontology has %d YAML blocks; want 6 Nodes + 7 Relationships", len(blocks))
	}
	want := map[string]bool{
		"node:Event": true, "node:Entity": true, "node:Time": true, "node:Place": true,
		"node:Concept": true, "node:Source": true,
		"relationship:HAS_TYPE": true, "relationship:INVOLVES": true,
		"relationship:OCCURRED_DURING": true, "relationship:OCCURRED_AT": true,
		"relationship:DOCUMENTED_BY": true, "relationship:VERIFIES": true,
		"relationship:FOLLOWS": true,
	}
	var models []vlogGraphModel
	for _, match := range blocks {
		ref := match[1] + ":" + match[2]
		if !want[ref] {
			t.Fatalf("unexpected or repeated model %s", ref)
		}
		delete(want, ref)
		kind := kernel.KindNodeDefinition
		if match[1] == "relationship" {
			kind = kernel.KindRelationshipDefinition
		}
		value, err := kernel.ParseObjectYAML(kind, []byte(match[3]+"\n"))
		if err != nil {
			t.Fatalf("%s invalid YAML: %v", ref, err)
		}
		if value.Definition == nil || value.Definition.Name != match[2] {
			t.Fatalf("%s does not match its actual Definition", ref)
		}
		models = append(models, vlogGraphModel{ref: ref, kind: kind, value: value})
	}
	if len(want) != 0 {
		t.Fatalf("missing published definitions: %v", want)
	}
	nodes := map[string]bool{}
	for _, m := range models {
		if m.kind == kernel.KindNodeDefinition {
			nodes[m.ref] = true
		}
	}
	for _, m := range models {
		if m.kind != kernel.KindRelationshipDefinition {
			continue
		}
		for _, endpoint := range []*string{m.value.Definition.From, m.value.Definition.To} {
			if endpoint == nil || !nodes[*endpoint] {
				t.Fatalf("%s has invalid endpoint %v", m.ref, endpoint)
			}
		}
	}
	return models
}

func vlogCypherQueries(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vlogSkillRoot, "references", "cypher.md"))
	if err != nil {
		t.Fatal(err)
	}
	blocks := regexp.MustCompile("(?ms)^## (Q[1-9][0-9]*)[^\\n]*\\n.*?^```cypher\\n(.*?)\\n```").FindAllStringSubmatch(string(raw), -1)
	if len(blocks) != 6 || strings.Count(string(raw), "```cypher") != 6 {
		t.Fatalf("published Cypher has %d queries; want 6", len(blocks))
	}
	queries := map[string]string{}
	for _, m := range blocks {
		id, query := m[1], m[2]
		if _, found := queries[id]; found || !strings.HasPrefix(strings.TrimSpace(query), "MATCH") {
			t.Fatalf("duplicate or non-read-only Cypher %s", id)
		}
		queries[id] = query
	}
	for _, id := range []string{"Q1", "Q2", "Q3", "Q4", "Q5", "Q6"} {
		if queries[id] == "" {
			t.Fatalf("missing Cypher %s", id)
		}
	}
	return queries
}

func vlogQueryCases(t *testing.T) []vlogQueryCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vlogSkillRoot, "tests", "expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var data struct {
		Purpose string          `json:"purpose"`
		Cases   []vlogQueryCase `json:"cases"`
	}
	if err = json.Unmarshal(raw, &data); err != nil {
		t.Fatal(err)
	}
	queries := vlogCypherQueries(t)
	if len(data.Cases) != 7 || data.Purpose == "" {
		t.Fatalf("invalid query fixtures (%d)", len(data.Cases))
	}
	seen := map[string]bool{}
	for _, item := range data.Cases {
		if item.ID == "" || seen[item.ID] || queries[item.Query] == "" || item.Params == nil || len(item.Columns) == 0 || item.Rows == nil {
			t.Fatalf("incomplete query case %+v", item)
		}
		for _, row := range item.Rows {
			if len(row) != len(item.Columns) {
				t.Fatalf("row width for %s", item.ID)
			}
		}
		seen[item.ID] = true
	}
	return data.Cases
}
