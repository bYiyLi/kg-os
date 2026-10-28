package kernel_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const retrievalFixtureRoot = "testdata/knowledge/retrieval-cases"

type retrievalSkillExample struct {
	name    string
	query   string
	columns []string
	rows    [][]any
}

// Parse the isolated historical query cases; they are not distributed in the unified Skill.
func readRetrievalSkillExamples(t *testing.T) []retrievalSkillExample {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join(retrievalFixtureRoot, "*.md"))
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
