package kernel_test

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

const retrievalSkillRoot = "../../plugins/kgos/skills/kgos-retrieval-standards"

type retrievalSkillExample struct {
	name    string
	query   string
	columns []string
	rows    [][]any
}

// Use the shipped query text, not a second fixture copy that can drift from the Skill.
func readRetrievalSkillExamples(t *testing.T) []retrievalSkillExample {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(retrievalSkillRoot, "references", "cases", "*.md"))
	if err != nil || len(paths) != 5 {
		t.Fatalf("case paths=%v err=%v", paths, err)
	}
	var result []retrievalSkillExample
	seen := map[string]bool{}
	for _, path := range paths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		lines := strings.Split(string(raw), "\n")
		var heading, query string
		for i := 0; i < len(lines); i++ {
			line := lines[i]
			if strings.HasPrefix(line, "### ") {
				heading = strings.TrimPrefix(line, "### ")
			}
			if !strings.HasPrefix(line, "```") || line == "```" {
				continue
			}
			language, start := strings.TrimPrefix(line, "```"), i+1
			for i++; i < len(lines) && lines[i] != "```"; i++ {
			}
			if i == len(lines) {
				t.Fatalf("unclosed block in %s", path)
			}
			body := strings.Join(lines[start:i], "\n")
			switch language {
			case "cypher":
				if query != "" || heading == "" {
					t.Fatalf("query lacks paired heading/result in %s", path)
				}
				query = body
			case "json":
				if query == "" || seen[heading] {
					t.Fatalf("missing query or duplicate name %s", heading)
				}
				var expected struct {
					Columns []string `json:"columns"`
					Rows    [][]any  `json:"rows"`
				}
				decoder := json.NewDecoder(strings.NewReader(body))
				decoder.DisallowUnknownFields()
				if err := decoder.Decode(&expected); err != nil {
					t.Fatal(err)
				}
				if len(expected.Columns) == 0 || expected.Rows == nil {
					t.Fatal("explicit columns and rows required")
				}
				for _, row := range expected.Rows {
					if len(row) != len(expected.Columns) {
						t.Fatalf("invalid row shape for %s", heading)
					}
				}
				seen[heading] = true
				result = append(result, retrievalSkillExample{heading, query, expected.Columns, expected.Rows})
				query, heading = "", ""
			default:
				t.Fatalf("case block language not validated %s", language)
			}
		}
		if query != "" {
			t.Fatalf("unpaired query in %s", path)
		}
	}
	if len(result) != 17 {
		t.Fatalf("want all 17 shipped queries, got %d", len(result))
	}
	return result
}

func TestRetrievalSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(retrievalSkillRoot)
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
	if meta.Name != filepath.Base(root) || len(meta.Description) == 0 || len(meta.Description) > 1024 || meta.Metadata["version"] != "1.1.0" {
		t.Fatalf("invalid metadata: %+v", meta)
	}
	links := regexp.MustCompile(`\[[^\]]+\]\(([^)]+)\)`)
	seen := map[string]bool{}
	queue := []string{filepath.Join(root, "SKILL.md")}
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
				t.Fatalf("runtime resource escapes standalone package: %s", next)
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
				return fmt.Errorf("unreachable resource %s", path)
			}
		}
		return nil
	})
	if err != nil || count != 10 {
		t.Fatalf("resource graph: files=%d err=%v", count, err)
	}
	readRetrievalSkillExamples(t)
}
