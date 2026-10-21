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

const branchSkillRoot = "../../plugins/kgos/skills/kgos-branch-standards"

func TestBranchSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(branchSkillRoot)
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
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 || meta.Metadata["version"] != "1.0.0" {
		t.Fatalf("invalid metadata: %+v", meta)
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
			next := filepath.Clean(filepath.Join(filepath.Dir(path), strings.SplitN(link[1], "#", 2)[0]))
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
	if err != nil || count != 9 {
		t.Fatalf("runtime files=%d err=%v; want entry, four decision references and four case groups", count, err)
	}
}
