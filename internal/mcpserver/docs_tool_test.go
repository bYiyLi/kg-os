package mcpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
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
	serverHandler, err := New(&kernel.Service{}, Options{Token: "docs-test"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(serverHandler.Handler())
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
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
	if len(listed.Tools) != 5 {
		t.Fatalf("wrong tool count %d", len(listed.Tools))
	}
	for _, tool := range listed.Tools {
		if tool.Name == "kgos_read" || tool.Name == "kgos_run" {
			if !strings.Contains(tool.Description, "docs.read('index.md')") {
				t.Errorf("missing model discoverability on %s", tool.Name)
			}
			schema, _ := json.Marshal(tool.InputSchema)
			if !strings.Contains(string(schema), "docs.read") {
				t.Errorf("missing code schema discovery %s", tool.Name)
			}
		}
	}
	call := func(tool, code string) *mcp.CallToolResult {
		t.Helper()
		got, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: map[string]any{"code": code}})
		if err != nil {
			t.Fatal(err)
		}
		return got
	}
	root := call("kgos_read", `return await docs.read("index.md")`)
	if root.IsError || !strings.Contains(docToolPayload(t, root)["result"].(string), "sdk/index.md") {
		t.Fatalf("missing root index %#v", root)
	}
	read := call("kgos_read", `return await docs.read("sdk/evolution/branch/create.md")`)
	run := call("kgos_run", `return await docs.read("sdk/evolution/branch/create.md")`)
	if read.IsError || run.IsError || docToolPayload(t, read)["result"] != docToolPayload(t, run)["result"] {
		t.Fatal("docs differ between read/run")
	}
	cypher := call("kgos_read", `return await docs.read("cypher/reading.md")`)
	if cypher.IsError || !strings.Contains(docToolPayload(t, cypher)["result"].(string), "MATCH") {
		t.Fatal("Cypher manual unavailable")
	}
	functions := call("kgos_read", `return await docs.read("cypher/functions-reference.md")`)
	if functions.IsError || !strings.Contains(docToolPayload(t, functions)["result"].(string), "elementId(input") {
		t.Fatal("full pinned function reference could not be returned without truncation")
	}
	for _, code := range []string{`return await docs.read("../index.md")`, `return await docs.read("/etc/passwd")`, `return await docs.read(null)`, `return await docs.read("index.md","other")`} {
		got := call("kgos_read", code)
		if !got.IsError || docToolPayload(t, got)["code"] != "INVALID_ARGUMENT" {
			t.Fatalf("bad path %s: %#v", code, got)
		}
	}
	denied := call("kgos_read", `return await evolution.branch.create({name:"unauthorized",from:"branch/main"})`)
	if !denied.IsError || docToolPayload(t, denied)["code"] != "PERMISSION_DENIED" {
		t.Fatal("read-only privilege regression")
	}
	removed := call("kgos_read", `return await help()`)
	if !removed.IsError {
		t.Fatal("removed Help unexpectedly available")
	}
}
