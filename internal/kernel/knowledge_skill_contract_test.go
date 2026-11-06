package kernel_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

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

// Historical synthetic fixtures exercise engine parsing, not current Skill behavior.
func TestKnowledgeHistoricalFixtures(t *testing.T) {
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
