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
	body, err := os.ReadFile(filepath.Join(knowledgeSkillRoot, "references", "cases", filename))
	if err != nil {
		t.Fatal(err)
	}
	blocks := regexp.MustCompile("(?s)```json\\n(.*?)\\n```").FindAllSubmatch(body, -1)
	values := make([]kernel.ObjectValue, 0, len(blocks))
	for _, block := range blocks {
		value, err := kernel.ParseObjectJSON(kernel.KindKnowledgeNode, block[1])
		if err != nil {
			t.Fatalf("invalid shipped instance in %s: %v", filename, err)
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
		Name        string            `yaml:"name"`
		Description string            `yaml:"description"`
		Metadata    map[string]string `yaml:"metadata"`
	}
	decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
	decoder.KnownFields(true)
	if err := decoder.Decode(&meta); err != nil {
		t.Fatal(err)
	}
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 || meta.Metadata["version"] != "1.1.0" {
		t.Fatalf("invalid declared metadata: %+v", meta)
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	queue := []string{filepath.Join(root, "SKILL.md")}
	seen := map[string]bool{}
	for len(queue) > 0 {
		path := queue[0]
		queue = queue[1:]
		if seen[path] {
			continue
		}
		seen[path] = true
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, link := range links.FindAllStringSubmatch(string(raw), -1) {
			target := strings.SplitN(link[1], "#", 2)[0]
			next := filepath.Clean(filepath.Join(filepath.Dir(path), target))
			if !strings.HasPrefix(next, root+string(os.PathSeparator)) {
				t.Fatalf("reference requires resources outside the standalone Skill: %s", target)
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
			if !seen[path] {
				return fmt.Errorf("runtime resource is not reachable: %s", path)
			}
		}
		return nil
	})
	if err != nil || count != 9 {
		t.Fatalf("resource graph: files=%d err=%v; want entrypoint, four rules and four cases", count, err)
	}
	for file, expected := range map[string]int{
		"evidence-decisions.md": 2, "identity-decisions.md": 1,
		"update-decisions.md": 1, "write-decisions.md": 1,
	} {
		if got := len(knowledgeSkillExamples(t, file)); got != expected {
			t.Fatalf("%s: %d valid JSON examples; want %d", file, got, expected)
		}
	}
}
