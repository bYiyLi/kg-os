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

const vlogSkillRoot = "../../plugins/kgos/skills/kgos-vlog-standards"

// Read the shipped instance examples, not a second expected-fixture copy.
func vlogSkillExamples(t *testing.T) map[string]kernel.ObjectValue {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vlogSkillRoot, "references/cases/execution.md"))
	if err != nil {
		t.Fatal(err)
	}
	blocks := regexp.MustCompile("(?s)### ([a-z-]+)\\n\\n```json\\n(.*?)\\n```").FindAllSubmatch(raw, -1)
	values := map[string]kernel.ObjectValue{}
	for _, block := range blocks {
		name := string(block[1])
		if _, exists := values[name]; exists {
			t.Fatalf("duplicate example %s", name)
		}
		value, err := kernel.ParseObjectJSON(kernel.KindKnowledgeNode, block[2])
		if err != nil {
			t.Fatalf("parse example %s: %v", name, err)
		}
		values[name] = value
	}
	for _, name := range []string{"first-attempt", "second-attempt", "verified-followup"} {
		if _, ok := values[name]; !ok {
			t.Fatalf("missing shipped example %s", name)
		}
	}
	if len(values) != 3 {
		t.Fatalf("unexpected example count %d", len(values))
	}
	return values
}

func TestVLogSkillResourceContract(t *testing.T) {
	root, err := filepath.Abs(vlogSkillRoot)
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
				t.Fatalf("external runtime resource: %s", next)
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
	if err != nil || count != 9 {
		t.Fatalf("files=%d err=%v; want entry, five references and three case groups", count, err)
	}
	vlogSkillExamples(t)
	vlogSkillRecommendedModel(t)
}

// Parse the one model shipped to the agent, not a second copy kept in the test.
func vlogSkillRecommendedModel(t *testing.T) kernel.ObjectValue {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join(vlogSkillRoot, "references/model-examples.md"))
	if err != nil {
		t.Fatal(err)
	}
	matches := regexp.MustCompile("(?s)```yaml\\n(.*?)\\n```").FindAllSubmatch(raw, -1)
	if len(matches) != 1 {
		t.Fatalf("expected exactly one recommended YAML Node Definition, found %d", len(matches))
	}
	model, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, matches[0][1])
	if err != nil {
		t.Fatalf("invalid shipped VLog Ontology: %v", err)
	}
	if model.Definition == nil || model.Definition.Name != "VLogEntry" ||
		len(model.Definition.Properties) != 18 || len(model.Definition.Constraints) != 0 || len(model.Definition.Indexes) != 0 {
		t.Fatalf("recommended model structure changed: %+v", model.Definition)
	}
	required := map[string]bool{"entryKey": true, "kind": true, "summary": true}
	gotNames := map[string]bool{}
	for _, property := range model.Definition.Properties {
		if gotNames[property.Name] {
			t.Fatalf("duplicate property: %s", property.Name)
		}
		gotNames[property.Name] = true
		if property.Required != required[property.Name] {
			t.Fatalf("unexpected required flag on %s: %v", property.Name, property.Required)
		}
		if property.Unique != (property.Name == "entryKey") {
			t.Fatalf("unexpected uniqueness rule on %s: %v", property.Name, property.Unique)
		}
		wantType := "STRING"
		switch property.Name {
		case "occurredAt", "recordedAt", "verifiedAt":
			wantType = "ZONED DATETIME"
		}
		if property.Type != wantType {
			t.Fatalf("unexpected type for %s: got=%q want=%q", property.Name, property.Type, wantType)
		}
	}
	for _, name := range []string{
		"entryKey", "kind", "summary", "details", "occurredAt", "recordedAt", "verifiedAt",
		"eventKey", "taskKey", "runKey", "scope", "executionStatus", "executionResult",
		"verificationStatus", "verificationResult", "evidence", "pending", "provenance",
	} {
		if !gotNames[name] {
			t.Fatalf("missing recommended field %s", name)
		}
	}
	return model
}
