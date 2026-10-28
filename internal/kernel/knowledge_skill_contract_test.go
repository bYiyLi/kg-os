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
	for _, expected := range []string{"## 2. 检索与理解", "## 3. 创建与更新 Knowledge", "## 4. 维护知识质量", "## 5. 执行与核实", "kgos-ontology-standards", "kgos_docs"} {
		if !strings.Contains(string(body), expected) {
			t.Fatalf("unified Knowledge Skill lacks %q", expected)
		}
	}
	count := 0
	err = filepath.WalkDir(root, func(path string, entry os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() {
			count++
			if path != filepath.Join(root, "SKILL.md") {
				return fmt.Errorf("unexpected runtime Knowledge resource: %s", path)
			}
		}
		return nil
	})
	if err != nil || count != 1 {
		t.Fatalf("resource graph: files=%d err=%v; want only SKILL.md", count, err)
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
