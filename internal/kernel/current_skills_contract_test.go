package kernel_test

import (
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

// This validates authored resources with the real parser. It does not run an
// agent, initialize a live VLog branch, or prove production model adoption.
func TestCurrentVLogDefinitionResources(t *testing.T) {
	root := "../../plugins/kgos/skills/kgos-record-vlog/references"
	raw, err := os.ReadFile(filepath.Join(root, "ontology.md"))
	if err != nil {
		t.Fatal(err)
	}
	blocks := regexp.MustCompile(`(?ms)^### (domain|node|relationship):([^\n]+)\n\n~~~yaml\n(.*?)\n~~~`).FindAllStringSubmatch(string(raw), -1)
	if len(blocks) != 10 || strings.Count(string(raw), "~~~yaml") != 10 {
		t.Fatalf("want one Domain, four Nodes and five Relationships; got %d blocks", len(blocks))
	}
	want := map[string]bool{
		"domain:实际活动与验证记录":    true,
		"node:实际事件":           true,
		"node:事件类别":           true,
		"node:持续对象":           true,
		"node:来源":             true,
		"relationship:事件归属类别": true,
		"relationship:事件涉及对象": true,
		"relationship:事件引用来源": true,
		"relationship:事件后于事件": true,
		"relationship:事件验证事件": true,
	}
	nodes := map[string]bool{}
	values := []kernel.ObjectValue{}
	for _, block := range blocks {
		name, err := url.PathUnescape(block[2])
		if err != nil {
			t.Fatal(err)
		}
		ref := block[1] + ":" + name
		if !want[ref] {
			t.Fatalf("unexpected or duplicate definition: %s", ref)
		}
		delete(want, ref)
		kind := kernel.KindNodeDefinition
		switch block[1] {
		case "domain":
			kind = kernel.KindDomain
		case "relationship":
			kind = kernel.KindRelationshipDefinition
		case "node":
			nodes[block[1]+":"+block[2]] = true
		}
		value, err := kernel.ParseObjectYAML(kind, []byte(block[3]+"\n"))
		if err != nil {
			t.Fatalf("invalid current definition %s: %v", ref, err)
		}
		if block[1] != "domain" && (value.Definition == nil || value.Definition.Name != name) {
			t.Fatalf("heading differs from definition: %s", ref)
		}
		values = append(values, value)
	}
	if len(want) != 0 {
		t.Fatalf("missing definitions: %v", want)
	}
	for _, value := range values {
		if value.Definition == nil || value.Definition.From == nil {
			continue
		}
		for _, endpoint := range []*string{value.Definition.From, value.Definition.To} {
			if endpoint == nil || !nodes[*endpoint] {
				t.Fatalf("unresolved relationship endpoint: %v", endpoint)
			}
		}
	}
	raw, err = os.ReadFile(filepath.Join(root, "cypher.md"))
	if err != nil {
		t.Fatal(err)
	}
	queries := regexp.MustCompile(`(?ms)^## (Q[1-8]) [^\n]+\n.*?^~~~cypher\n(.*?)\n~~~`).FindAllStringSubmatch(string(raw), -1)
	if len(queries) != 8 || strings.Count(string(raw), "~~~cypher") != 8 {
		t.Fatalf("want eight current business queries; got %d", len(queries))
	}
	seen := map[string]bool{}
	for _, query := range queries {
		if seen[query[1]] || !strings.HasPrefix(strings.TrimSpace(query[2]), "MATCH") {
			t.Fatalf("duplicate query or unexpected query shape: %s", query[1])
		}
		seen[query[1]] = true
	}
}
