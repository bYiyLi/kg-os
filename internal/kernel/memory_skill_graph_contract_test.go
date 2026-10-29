//go:build lithograph_smoke

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

const memorySkillRoot = "../../plugins/kgos/skills/kgos-memory-standards"

// The published ontology Markdown is the only model source; there are no hand-maintained Go fixtures.
func memoryGraphModels(t *testing.T) []vlogGraphModel {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(memorySkillRoot, "references", "ontology.md"))
	if err != nil {
		t.Fatal(err)
	}
	s := string(raw)
	pattern := regexp.MustCompile("(?ms)^### (domain|node|relationship):([A-Za-z][A-Za-z0-9_]*)\\n\\n" + "```yaml\\n(.*?)\\n```")
	blocks := pattern.FindAllStringSubmatch(s, -1)
	if len(blocks) != 13 || strings.Count(s, "```yaml") != 13 {
		t.Fatalf("expected 1 Domain + 4 Nodes + 8 Relationships; blocks=%d", len(blocks))
	}
	models := make([]vlogGraphModel, 0, len(blocks))
	found := map[string]bool{}
	expected := map[string]bool{}
	for _, name := range []string{"node:Memory", "node:MemoryKind", "node:MemoryTopic", "node:MemoryCue",
		"relationship:HAS_KIND", "relationship:IN_TOPIC", "relationship:SUBTOPIC_OF",
		"relationship:RECALLED_WHEN", "relationship:EVIDENCED_BY", "relationship:ABOUT",
		"relationship:FORMED_DURING", "relationship:SUPERSEDES", "domain:AIMemory"} {
		expected[name] = true
	}
	for _, m := range blocks {
		ref := m[1] + ":" + m[2]
		if !expected[ref] || found[ref] {
			t.Fatalf("unexpected/duplicate %q", ref)
		}
		found[ref] = true
		kind := kernel.KindNodeDefinition
		if m[1] == "domain" {
			kind = kernel.KindDomain
		}
		if m[1] == "relationship" {
			kind = kernel.KindRelationshipDefinition
		}
		value, err := kernel.ParseObjectYAML(kind, []byte(m[3]+"\n"))
		if err != nil {
			t.Fatalf("parse %s: %v", ref, err)
		}
		if kind == kernel.KindDomain {
			if value.Domain == nil || value.Domain.Name != m[2] || len(value.Domain.Includes) != 12 {
				t.Fatalf("bad Domain %s: %+v", ref, value.Domain)
			}
		} else if value.Definition == nil || value.Definition.Name != m[2] {
			t.Fatalf("Definition mismatch %s", ref)
		}
		models = append(models, vlogGraphModel{ref: ref, kind: kind, value: value})
	}
	if len(found) != len(expected) {
		t.Fatalf("missing model: found=%v", found)
	}
	return models
}

func memoryCypherQueries(t *testing.T) map[string]string {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(memorySkillRoot, "references", "cypher.md"))
	if err != nil {
		t.Fatal(err)
	}
	source := string(raw)
	blocks := regexp.MustCompile("(?ms)^## (Q[1-9][0-9]*)[^\\n]*\\n.*?^```cypher\\n(.*?)\\n```").FindAllStringSubmatch(source, -1)
	if len(blocks) != 9 || strings.Count(source, "```cypher") != 9 {
		t.Fatalf("expected nine queries; %d", len(blocks))
	}
	result := map[string]string{}
	for _, m := range blocks {
		if result[m[1]] != "" || !strings.HasPrefix(strings.TrimSpace(m[2]), "MATCH ") {
			t.Fatalf("unexpected Cypher %q", m[1])
		}
		result[m[1]] = strings.TrimSpace(m[2])
	}
	for i := 1; i <= 9; i++ {
		if result["Q"+string(rune('0'+i))] == "" {
			t.Fatalf("missing query Q%d", i)
		}
	}
	return result
}

func memoryQueryCases(t *testing.T) []vlogQueryCase {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(memorySkillRoot, "tests", "expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Purpose string          `json:"purpose"`
		Cases   []vlogQueryCase `json:"cases"`
	}
	if err = json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	if fixture.Purpose == "" || len(fixture.Cases) != 11 {
		t.Fatalf("invalid expected cases %d", len(fixture.Cases))
	}
	queries := memoryCypherQueries(t)
	seen := map[string]bool{}
	for _, c := range fixture.Cases {
		if c.ID == "" || seen[c.ID] || queries[c.Query] == "" || c.Params == nil || len(c.Columns) == 0 || c.Rows == nil {
			t.Fatalf("bad case: %+v", c)
		}
		seen[c.ID] = true
		for _, row := range c.Rows {
			if len(row) != len(c.Columns) {
				t.Fatalf("bad row width in %s", c.ID)
			}
		}
	}
	return fixture.Cases
}
