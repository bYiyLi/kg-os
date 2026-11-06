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

// Text/resource checks do not claim real model selection or execution.
func TestCurrentOntologySkillsResourceContract(t *testing.T) {
	cases := []struct {
		name     string
		count    int
		required []string
	}{
		{"design-ontology", 8, []string{
			"assets/ontology-definition.md", "assets/user-confirmation.md",
			"references/bfo.md", "references/ufo.md", "references/dolce.md", "references/sumo.md", "references/gfo.md",
			"预期结果及依据", "不通过迁就模型改写预期", "自检清单",
		}},
		{"kgos-ontology-implementation", 3, []string{
			"assets/ontology-definition.md", "references/kgos-conversion-rules.md",
			"核验写入许可", "不在转换时擅自补设计", "信息一致性",
			"不以写入成功代替验收通过",
		}},
		{"kgos-review-ontology", 8, []string{
			"references/modeling-quality-checks.md", "assets/ontology-review-report.md",
			"references/bfo.md", "references/ufo.md", "references/dolce.md", "references/sumo.md", "references/gfo.md",
			"仅使用只读接口", "不提供替代模型、修复步骤、修改方案或补丁",
			"相关真实知识", "无法确认",
		}},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			root, err := filepath.Abs(filepath.Join("../../plugins/kgos/skills", item.name))
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
				Name        string `yaml:"name"`
				Description string `yaml:"description"`
			}
			decoder := yaml.NewDecoder(strings.NewReader(parts[1]))
			decoder.KnownFields(true)
			if err := decoder.Decode(&meta); err != nil {
				t.Fatal(err)
			}
			if meta.Name != item.name || strings.TrimSpace(meta.Description) == "" || len(meta.Description) > 1024 {
				t.Fatalf("invalid unversioned source metadata: %+v", meta)
			}
			for _, expected := range item.required {
				if !strings.Contains(string(raw), expected) {
					t.Fatalf("missing current responsibility or resource: %s", expected)
				}
			}
			links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
			plain := regexp.MustCompile(`(?:references|assets)/[A-Za-z0-9_.-]+\.md`)
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
				targets := []string{}
				for _, link := range links.FindAllStringSubmatch(string(body), -1) {
					target := strings.SplitN(strings.Trim(link[1], "<>"), "#", 2)[0]
					if target == "" || strings.Contains(target, "://") || strings.HasPrefix(target, "mailto:") {
						continue
					}
					targets = append(targets, filepath.Join(filepath.Dir(path), target))
				}
				// Approved design navigation also uses explicit plain root-relative paths.
				for _, target := range plain.FindAllString(string(body), -1) {
					targets = append(targets, filepath.Join(root, target))
				}
				for _, target := range targets {
					next := filepath.Clean(target)
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
			if err != nil || count != item.count || len(seen) != count {
				t.Fatalf("runtime files=%d reachable=%d error=%v; want %d", count, len(seen), err, item.count)
			}
		})
	}
}
