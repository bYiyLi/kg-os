package kernel_test

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const ontologyStandardsRoot = "../../plugins/kgos/skills/kgos-ontology-standards"

func TestOntologyStandardsResourceContract(t *testing.T) {
	root, err := filepath.Abs(ontologyStandardsRoot)
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(root, "SKILL.md"))
	if err != nil {
		t.Fatal(err)
	}
	parts := strings.SplitN(string(raw), "---\n", 3)
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
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 {
		t.Fatalf("invalid metadata: %+v", meta)
	}
	if !strings.Contains(string(raw), "[Ontology 变更确认模板](references/model-confirmation-template.md)") || !strings.Contains(string(raw), "未经确认") || !strings.Contains(string(raw), "https://github.com/bYiyLi/kgos-ontologies") {
		t.Fatal("model confirmation and official model discovery must be reachable from Skill")
	}
	for _, expected := range []string{"[KG OS 本体论方法论](references/ontology-methodology.md)", "[本体建模案例](references/modeling-examples.md)", "## 2. 先确定本体语义", "## 5. 用正反例"} {
		if !strings.Contains(string(raw), expected) {
			t.Fatalf("missing ontology method in Skill: %s", expected)
		}
	}
	template, err := os.ReadFile(filepath.Join(root, "references/model-confirmation-template.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, section := range []string{"## 1. 本次改动", "## 2. 数据关系图", "## 3. 数据影响", "## 4. 用户确认", "```mermaid"} {
		if !strings.Contains(string(template), section) {
			t.Fatalf("missing confirmation template section: %s", section)
		}
	}
	method, err := os.ReadFile(filepath.Join(root, "references/ontology-methodology.md"))
	if err != nil {
		t.Fatal(err)
	}
	for _, section := range []string{"## 1. 基本认识", "## 2. 六步决策法", "## 3. 快速评审", "## 4. 外部研究依据"} {
		if !strings.Contains(string(method), section) {
			t.Fatalf("missing methodology section: %s", section)
		}
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	queue, seen := []string{filepath.Join(root, "SKILL.md")}, map[string]bool{}
	for len(queue) > 0 {
		path := queue[0]
		queue = queue[1:]
		if seen[path] {
			continue
		}
		seen[path] = true
		body, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		for _, link := range links.FindAllStringSubmatch(string(body), -1) {
			target := strings.SplitN(link[1], "#", 2)[0]
			if target == "" || strings.Contains(target, "://") || strings.HasPrefix(target, "mailto:") {
				continue
			}
			next := filepath.Clean(filepath.Join(filepath.Dir(path), target))
			if !strings.HasPrefix(next, root+string(os.PathSeparator)) {
				t.Fatalf("resource outside standalone package: %s", next)
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
				return fmt.Errorf("unreachable runtime resource: %s", path)
			}
		}
		return nil
	})
	if err != nil || count != 4 || len(seen) != 4 {
		t.Fatalf("runtime files=%d reachable=%d err=%v; want SKILL.md and three references", count, len(seen), err)
	}
}
