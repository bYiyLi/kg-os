package kernel_test

import (
	"os"
	"path/filepath"
	"regexp"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

const vlogHistoricalGraphRoot = "testdata/vlog/graph"

// Read original synthetic VLog instance regression fixtures, not published Skill resources.
func vlogSkillExamples(t *testing.T) map[string]kernel.ObjectValue {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata/vlog/cases/execution.md"))
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

// These fixtures protect historical engine behavior, not the current VLog Skill.
func TestVLogHistoricalFixtures(t *testing.T) {
	vlogSkillExamples(t)
	vlogLegacyModelFixture(t)
	vlogGraphModels(t)
	vlogCypherQueries(t)
	vlogQueryCases(t)
}

// Keep the historical single-node example tested without publishing it as the new ontology.
func vlogLegacyModelFixture(t *testing.T) kernel.ObjectValue {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata/vlog/legacy-vlogentry.md"))
	if err != nil {
		t.Fatal(err)
	}
	matches := regexp.MustCompile("(?s)```yaml\\n(.*?)\\n```").FindAllSubmatch(raw, -1)
	if len(matches) != 1 {
		t.Fatalf("expected one legacy VLogEntry Node Definition, found %d", len(matches))
	}
	model, err := kernel.ParseObjectYAML(kernel.KindNodeDefinition, matches[0][1])
	if err != nil {
		t.Fatalf("invalid historical VLog Ontology: %v", err)
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
