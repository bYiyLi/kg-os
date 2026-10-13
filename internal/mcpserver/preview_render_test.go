package mcpserver

import (
	"encoding/json"
	"github.com/bYiyLi/kg-os/internal/kernel"
	"strings"
	"testing"
)

func previewTestString(s string) *string { return &s }

func TestPreviewSummaryAndNavigationSafety(t *testing.T) {
	samples := []struct {
		value *string
		want  string
	}{
		{nil, "无规范简介"},
		{previewTestString("Historical message"), "无规范简介"},
		{previewTestString("## 改动\n- first\n## 简介\nlate"), "无规范简介"},
		{previewTestString("## 简介\n\nFull model\n## 改动\n- updated"), "Full model"},
		{previewTestString("## 简介\r\n\r\nReal-world model\r\n## 改动\r\n- updated"), "Real-world model"},
		{previewTestString("## 简介\n\n## 改动"), "无规范简介"},
		{previewTestString("## 简介\nfirst\nsecond\n## 改动\n- updated"), "first"},
	}
	for i, entry := range samples {
		if got := summaryFromMessage(entry.value); got != entry.want {
			t.Errorf("%d: %q != %q", i, got, entry.want)
		}
	}
	for _, unsafe := range []string{"<h1>untrusted</h1>", "pipe|cell", "inject\n## false heading",
		"a\\b", "*bullet*", "& ampersand", "[link](evil)"} {
		escaped := navigation(unsafe)
		if strings.Contains(escaped, "<h1>") || strings.Contains(escaped, "\n") || strings.Contains(escaped, "|") {
			t.Errorf("unsafe rendered navigation: %q", escaped)
		}
	}
	tick := string(rune(96))
	var fenced []string
	appendFence(&fenced, tick+tick+tick+"\nData\n"+strings.Repeat(tick, 5), "markdown")
	if fenced[0] != strings.Repeat(tick, 6)+"markdown" || fenced[len(fenced)-1] != strings.Repeat(tick, 6) {
		t.Fatalf("fenced Markdown injection: %#v", fenced)
	}
}

func TestPreviewRegistrationAndGraphValidation(t *testing.T) {
	items := map[string]kernel.Summary{}
	domain := kernel.Summary{Kind: kernel.KindDomain, Ref: "domain:Example", Name: "Example"}
	added, err := registerSummary(items, domain, 2)
	if err != nil || !added {
		t.Fatal("new Domain rejected")
	}
	added, err = registerSummary(items, domain, 2)
	if err != nil || added {
		t.Fatal("duplicate Domain was not idempotent")
	}
	changed := domain
	changed.Name = "changed"
	if _, err = registerSummary(items, changed, 2); err == nil {
		t.Fatal("mismatched Domain name accepted")
	}
	changed = domain
	changed.Kind = kernel.KindNodeDefinition
	if _, err = registerSummary(items, changed, 2); err == nil {
		t.Fatal("mismatched Domain kind accepted")
	}
	node := kernel.Summary{Kind: kernel.KindNodeDefinition, Ref: "node:Alpha", Name: "Alpha"}
	if _, err = registerSummary(items, node, 2); err != nil {
		t.Fatal(err)
	}
	if _, err = registerSummary(items, kernel.Summary{Ref: "node:Beta", Name: "Beta"}, 2); err == nil {
		t.Fatal("Ontology item budget exceeded without error")
	}
	refs := sortedRefs(items)
	if len(refs) != 2 || refs[0] != "domain:Example" || refs[1] != "node:Alpha" {
		t.Fatalf("nondeterministic refs: %v", refs)
	}

	nodeA := previewDefinition{summary: kernel.Summary{Kind: kernel.KindNodeDefinition, Ref: "node:Person", Name: "Person"}}
	nodeB := previewDefinition{summary: kernel.Summary{Kind: kernel.KindNodeDefinition, Ref: "node:Company", Name: "Company"}}
	edge := previewDefinition{
		summary: kernel.Summary{Kind: kernel.KindRelationshipDefinition, Ref: "relationship:WORKS_AT", Name: "WORKS_AT"},
		value:   json.RawMessage("{\"from\":\"node:Person\",\"to\":\"node:Company\"}"),
	}
	graph, err := definitionGraph([]previewDefinition{nodeA, nodeB, edge})
	if err != nil || !strings.Contains(graph, "d0 -->|") || !strings.Contains(graph, "| d1") {
		t.Fatalf("endpoint type edge missing: %s %v", graph, err)
	}
	edge.value = json.RawMessage("{\"from\":null,\"to\":null}")
	graph, err = definitionGraph([]previewDefinition{nodeA, nodeB, edge})
	if err != nil || !strings.Contains(graph, "端点无类型约束") {
		t.Fatalf("unconstrained relation falsely typed: %s %v", graph, err)
	}
	edge.value = json.RawMessage("{\"from\":\"node:Ghost\",\"to\":\"node:Company\"}")
	graph, err = definitionGraph([]previewDefinition{nodeA, nodeB, edge})
	if err != nil || strings.Contains(graph, " -->|") {
		t.Fatalf("phantom endpoint edge: %s %v", graph, err)
	}
	for _, invalid := range []string{"not-json", "null", "[]",
		"{\"from\":42,\"to\":\"node:Company\"}", "{\"from\":{},\"to\":\"node:Company\"}"} {
		edge.value = json.RawMessage(invalid)
		if _, err = definitionGraph([]previewDefinition{nodeA, nodeB, edge}); err == nil {
			t.Errorf("invalid Relationship Definition accepted: %s", invalid)
		}
	}
}
