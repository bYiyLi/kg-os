package kernel_test

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"gopkg.in/yaml.v3"
)

const knowledgeSkillRoot = "../../plugins/kgos/skills/kgos-knowledge-standards"

func knowledgeSkillExamples(t *testing.T, filename string) []kernel.ObjectValue {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", "knowledge", "instance-cases", filename))
	if err != nil {
		t.Fatal(err)
	}
	blocks := regexp.MustCompile("(?s)```json\\n(.*?)\\n```").FindAllSubmatch(body, -1)
	values := make([]kernel.ObjectValue, 0, len(blocks))
	for _, block := range blocks {
		value, err := kernel.ParseObjectJSON(kernel.KindKnowledgeNode, block[1])
		if err != nil {
			t.Fatalf("invalid isolated Knowledge fixture in %s: %v", filename, err)
		}
		values = append(values, value)
	}
	return values
}

func TestKnowledgeSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(knowledgeSkillRoot)
	if err != nil {
		t.Fatal(err)
	}
	body, err := os.ReadFile(filepath.Join(root, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(string(body), "---\n", 3)
	if len(parts) != 3 || parts[0] != "" {
		t.Fatal("missing metadata")
	}
	var meta struct {
		Name        string `yaml:"name"`
		Description string `yaml:"description"`
	}
	decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
	decoder.KnownFields(true)
	if err := decoder.Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 {
		t.Fatalf("invalid declared metadata: %+v", meta)
	}
	for _, expected := range []string{"## 2. 检索与理解", "## 3. 提炼、编写与更新 Knowledge", "## 4. 维护与审计知识质量", "## 5. 执行与核实", "独立质量审计", "references/quality-audit.md", "kgos-ontology-standards", "kgos_docs"} {
		if !strings.Contains(string(body), expected) {
			t.Fatalf("unified Knowledge Skill lacks %q", expected)
		}
	}
	methodPath := filepath.Join(root, "references", "quality-audit.md")
	method, err := os.ReadFile(methodPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{
		"## 1. 确定范围和证据边界",
		"## 3. 审计步骤与问题验收",
		"## 4. 容易误判的场景",
		"已证实问题",
		"待核实风险",
		"未检查/证据不足",
		"全量审计",
		"W3C Data Quality Vocabulary",
		"W3C PROV-O",
	} {
		if !strings.Contains(string(method), expected) {
			t.Fatalf("quality-audit reference lacks %q", expected)
		}
	}
	allowed := map[string]bool{filepath.Join(root, "SKILL.md"): true, methodPath: true}
	count := 0
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			count++
			if !allowed[path] {
				return fmt.Errorf("unexpected runtime Knowledge resource: %s", path)
			}
		}
		return nil
	})
	if err != nil || count != len(allowed) {
		t.Fatalf("resource graph: files=%d err=%v; want SKILL.md and quality-audit.md", count, err)
	}
	for file, expected := range map[string]int{
		"evidence-decisions.md": 2, "identity-decisions.md": 1,
		"update-decisions.md": 1, "write-decisions.md": 1,
	} {
		if got := len(knowledgeSkillExamples(t, file)); got != expected {
			t.Fatalf("%s: %d valid JSON examples; want %d", file, got, expected)
		}
	}
	if examples := readRetrievalSkillExamples(t); len(examples) != 17 {
		t.Fatalf("retrieval fixtures=%d, want 17", len(examples))
	}
	for _, name := range []string{"duplicates-identity.md", "conflicts-freshness.md", "scope-recovery.md"} {
		if data, err := os.ReadFile(filepath.Join("testdata", "knowledge", "maintenance-cases", name)); err != nil || len(data) == 0 {
			t.Fatalf("maintenance case %s: %v", name, err)
		}
	}
}
