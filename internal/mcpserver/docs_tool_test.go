package mcpserver

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func docToolPayload(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()
	if result == nil || len(result.Content) != 1 {
		t.Fatalf("unexpected MCP response %#v", result)
	}
	item, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("not a text result: %#v", result)
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(item.Text), &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestDocsViaRealMCPProtocolNoSkill(t *testing.T) {
	svc, err := New(&kernel.Service{}, Options{Token: "docs-test"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(svc.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "no-skill-client", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:             server.URL + "/mcp",
		HTTPClient:           &http.Client{Transport: uiBearerTransport{token: "docs-test"}},
		DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listed, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	want := map[string]bool{"kgos_docs": true, "kgos_ontology_overview": true, "kgos_query": true, "kgos_mutate": true, "kgos_commit_ancestry": true, "kgos_workspace": true}
	if len(listed.Tools) != len(want) {
		t.Fatalf("wrong tool count %d", len(listed.Tools))
	}
	for _, tool := range listed.Tools {
		if !want[tool.Name] {
			t.Fatalf("unexpected Tool %s", tool.Name)
		}
		if tool.Name == "kgos_docs" {
			schema, _ := json.Marshal(tool.InputSchema)
			if !strings.Contains(string(schema), "paths") || !strings.Contains(string(schema), "additionalProperties") {
				t.Fatalf("incomplete Docs schema %s", schema)
			}
		}
		if tool.Name == "kgos_query" || tool.Name == "kgos_mutate" {
			if !strings.Contains(tool.Description, "kgos_docs") || strings.Contains(tool.Description, "docs.read") {
				t.Errorf("incorrect script tool description on %s", tool.Name)
			}
		}
		if tool.Name != "kgos_mutate" && !tool.Annotations.ReadOnlyHint {
			t.Errorf("unexpected write annotation on %s", tool.Name)
		}
	}
	call := func(name string, args map[string]any) *mcp.CallToolResult {
		t.Helper()
		got, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil {
			t.Fatalf("call %s: %v", name, err)
		}
		return got
	}
	page := func(result *mcp.CallToolResult) []any {
		t.Helper()
		if result.IsError {
			t.Fatalf("documents error %#v", docToolPayload(t, result))
		}
		docs, ok := docToolPayload(t, result)["documents"].([]any)
		if !ok {
			t.Fatalf("missing documents array: %#v", result)
		}
		return docs
	}
	root := page(call("kgos_docs", map[string]any{}))
	if len(root) != 1 || root[0].(map[string]any)["path"] != "index.md" || !strings.Contains(root[0].(map[string]any)["content"].(string), "guides/ontology.md") {
		t.Fatalf("missing task-oriented directory %#v", root)
	}
	for _, paths := range []any{[]string{}, []string{"index.md"}} {
		got := page(call("kgos_docs", map[string]any{"paths": paths}))
		if len(got) != 1 || got[0].(map[string]any)["content"] != root[0].(map[string]any)["content"] {
			t.Fatalf("default docs differ: %#v", got)
		}
	}
	selected := []string{"sdk/evolution/branch/create.md", "cypher/functions-reference.md"}
	batch := page(call("kgos_docs", map[string]any{"paths": selected}))
	if len(batch) != 2 || batch[0].(map[string]any)["path"] != selected[0] || batch[1].(map[string]any)["path"] != selected[1] || !strings.Contains(batch[1].(map[string]any)["content"].(string), "elementId(input") {
		t.Fatalf("out of order or incomplete batch %#v", batch)
	}
	var first32 []string
	err = fs.WalkDir(embeddedDocs, "docs", func(path string, entry fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !entry.IsDir() && strings.HasSuffix(path, ".md") && len(first32) < 32 {
			first32 = append(first32, strings.TrimPrefix(path, "docs/"))
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got := page(call("kgos_docs", map[string]any{"paths": first32})); len(got) != 32 {
		t.Fatalf("32-document batch returned %d", len(got))
	}
	invalid := []map[string]any{
		{"paths": nil}, {"paths": "index.md"}, {"path": "index.md"}, {"extra": true},
		{"paths": []string{"index.md"}, "other": true}, {"paths": []any{nil}}, {"paths": []any{55}},
		{"paths": []string{""}}, {"paths": []string{"../index.md"}}, {"paths": []string{"/etc/passwd"}},
		{"paths": []string{"sdk/../index.md"}}, {"paths": []string{"sdk\\index.md"}},
		{"paths": []string{"https://example.com/a.md"}}, {"paths": []string{"index.md?x=1"}},
		{"paths": []string{"SDK/INDEX.md"}}, {"paths": []string{"unknown.md"}},
		{"paths": []string{"index.md", "index.md"}}, {"paths": []string{"index.md", "unknown.md"}},
		{"paths": append(first32, "index.md")},
	}
	for _, args := range invalid {
		got := call("kgos_docs", args)
		if !got.IsError || docToolPayload(t, got)["code"] != "INVALID_ARGUMENT" {
			t.Fatalf("accepted invalid docs input %#v: %#v", args, got)
		}
		if _, ok := docToolPayload(t, got)["documents"]; ok {
			t.Fatal("partial batch leaked in error response")
		}
	}
	for _, old := range []string{"kgos_preview", "state_ancestry", "kgos_read", "kgos_run"} {
		if _, err := session.CallTool(ctx, &mcp.CallToolParams{Name: old, Arguments: map[string]any{}}); err == nil {
			t.Errorf("old Tool alias accepted: %s", old)
		}
	}
	unknown := call("kgos_query", map[string]any{"code": "return typeof docs"})
	if unknown.IsError || docToolPayload(t, unknown)["result"] != "undefined" {
		t.Fatalf("old docs global still visible: %#v", unknown)
	}
	denied := call("kgos_query", map[string]any{"code": `return await evolution.branch.create({name:"unauthorized",from:"branch/main"})`})
	if !denied.IsError || docToolPayload(t, denied)["code"] != "PERMISSION_DENIED" {
		t.Fatal("read-only privilege regression")
	}
	missing := call("kgos_query", map[string]any{"code": "return await docs.read('index.md')"})
	if !missing.IsError {
		t.Fatal("old sandbox docs method unexpectedly available")
	}
}

func TestDocsStrictInputAndResourceBoundary(t *testing.T) {
	for _, args := range []any{nil, map[string]any{}, map[string]any{"paths": []string{}}} {
		paths, err := docsPaths(args)
		if err != nil || len(paths) != 0 {
			t.Fatalf("empty argument mismatch: %#v %v", paths, err)
		}
	}
	for _, args := range []any{"index.md", []string{"index.md"}, map[string]any{"paths": nil},
		map[string]any{"paths": []any{true}}, map[string]any{"paths": []string{"index.md"}, "extra": true}} {
		if _, err := docsPaths(args); err == nil {
			t.Fatalf("accepted bad docs params: %#v", args)
		}
	}
	fixture := fstest.MapFS{"docs/index.md": &fstest.MapFile{Data: []byte("index")}, "docs/huge.md": &fstest.MapFile{Data: []byte(strings.Repeat("x", maxDocsResponseBytes))}}
	if _, err := readDocuments(context.Background(), fixture, []string{"index.md", "missing.md"}); err == nil || !strings.HasPrefix(err.Error(), "INVALID_ARGUMENT:") {
		t.Fatalf("partial read accepted: %v", err)
	}
	if _, err := readDocuments(context.Background(), fixture, []string{"huge.md"}); err == nil || !strings.HasPrefix(err.Error(), "RESOURCE_ERROR:") {
		t.Fatalf("oversize document accepted: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := readDocuments(ctx, fixture, nil); err != context.Canceled {
		t.Fatalf("cancelled read accepted: %v", err)
	}
	deadline, stop := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer stop()
	if _, err := readDocuments(deadline, fixture, nil); err != context.DeadlineExceeded {
		t.Fatalf("expired documentation call returned %v, want deadline exceeded", err)
	}
}
