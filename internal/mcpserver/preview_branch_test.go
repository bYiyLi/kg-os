package mcpserver

import (
	"encoding/json"
	"strconv"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
)

func TestPreviewBranchAbsoluteIndexAndLosslessYAML(t *testing.T) {
	marker := "node:Example|Injection"
	codeFence := strings.Repeat(string(rune(96)), 3)
	message := "## 简介\nModel with | and user message\n## 改动\n" +
		codeFence + "markdown\n## attacker heading\n" + codeFence + "\n"
	snapshot := branchSnapshot{
		name: "branch-<html>", head: "commit/pinned-state",
		commit: kernel.EvolutionGetResult{
			State: "commit/pinned-state", Parents: []string{"commit/first", "commit/second"},
			Author: previewTestString("Author|Name"), Message: &message, CommittedAt: 1760000012345678,
		},
		domains: []previewDomain{{
			summary: kernel.Summary{
				Kind: kernel.KindDomain, Ref: "domain:Model", Name: "Model",
				Title: previewTestString("Model|Title"), Description: previewTestString("Two\nlines"),
			},
			members: []kernel.Summary{{Kind: kernel.KindNodeDefinition, Ref: marker, Name: "Example"}},
			body:    "name: Model\nincludes:\n  - node:Example|Injection\n",
		}},
		definitions: []previewDefinition{{
			summary: kernel.Summary{Kind: kernel.KindNodeDefinition, Ref: marker, Name: "Example",
				Title: previewTestString("Example|Title"), Description: previewTestString("This is user data")},
			body:  "name: Example|Injection\nproperties:\n  - name: detail\n",
			value: json.RawMessage("{\"name\":\"Example|Injection\",\"properties\":[]}"),
		}},
	}
	doc := newViewDoc()
	id := doc.reserve()
	if err := renderBranch(doc, snapshot, id); err != nil {
		t.Fatal(err)
	}
	lines, err := doc.finish()
	if err != nil {
		t.Fatal(err)
	}
	text := strings.Join(lines, "\n")
	for _, part := range []string{
		"branch-&lt;html&gt;", "commit/pinned-state", "commit/first", "commit/second",
		"Author&#124;Name", "Model with | and user message", codeFence + "markdown",
		"node:Example&#124;Injection", "#### Definition 详情", "name: Example|Injection",
	} {
		if !strings.Contains(text, part) {
			t.Errorf("lossless renderer dropped %q", part)
		}
	}
	for index, line := range lines {
		if !strings.HasPrefix(line, "| ") {
			continue
		}
		if !strings.Contains(line, "| Definition 详情 |") && !strings.Contains(line, "| Domain 组织 |") {
			continue
		}
		cells := strings.Split(line, " | ")
		if len(cells) < 3 {
			t.Fatalf("index lacks offset: %q", line)
		}
		offset, error := strconv.Atoi(strings.Trim(cells[len(cells)-2], " |"))
		if error != nil || offset < 0 || offset >= len(lines) {
			t.Fatalf("bad preview anchor at line %d: %s", index, line)
		}
		if strings.Contains(line, "Definition 详情") && lines[offset] != "#### Definition 详情" {
			t.Errorf("Definition index points at %q", lines[offset])
		}
		if strings.Contains(line, "Domain 组织") && lines[offset] != "#### Domain 组织" {
			t.Errorf("Domain index points at %q", lines[offset])
		}
	}
	if len(lines) == 0 || doc.anchors[id].start != 0 || doc.anchors[id].end < len(lines) {
		t.Fatalf("Branch anchor not pinned to full range: %#v", doc.anchors[id])
	}
}

func TestPreviewAnchorAndResourceBudgetFailures(t *testing.T) {
	doc := newViewDoc()
	id := doc.reserve()
	if _, err := doc.finish(); err == nil {
		t.Fatal("unclosed anchor accepted")
	}
	if err := doc.begin(id); err != nil {
		t.Fatal(err)
	}
	if err := doc.begin(id); err == nil {
		t.Fatal("double begin accepted")
	}
	if err := doc.end(id); err != nil {
		t.Fatal(err)
	}
	if err := doc.end(id); err == nil {
		t.Fatal("double end accepted")
	}
	if err := doc.end(99); err == nil {
		t.Fatal("unknown anchor accepted")
	}
	oversized := newViewDoc()
	oversized.lines = []string{"# Result", strings.Repeat("x", maxMarkdownBytes)}
	if _, err := oversized.finish(); err == nil || !strings.Contains(err.Error(), "RESOURCE_ERROR") {
		t.Fatalf("huge Markdown silently truncated: %v", err)
	}
	if previewString(nil) != "—" || previewString(previewTestString("title")) != "title" {
		t.Fatal("nil/available Summary projections incorrect")
	}
	revision, err := newPreviewRevision()
	if err != nil || len(revision) != 32 {
		t.Fatalf("nonrandom/invalid viewRevision: %q %v", revision, err)
	}
}
