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

func helpToolPayload(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()
	if result == nil || len(result.Content) != 1 {
		t.Fatalf("unexpected MCP result: %#v", result)
	}
	item, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("non-text MCP response: %#v", result)
	}
	var value map[string]any
	if err := json.Unmarshal([]byte(item.Text), &value); err != nil {
		t.Fatalf("invalid MCP JSON: %v", err)
	}
	return value
}

func TestHelpViaRealMCPProtocol(t *testing.T) {
	s, err := New(&kernel.Service{}, Options{Token: "help-test"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(s.Handler())
	defer server.Close()
	// Race instrumentation can make repeated isolated QuickJS/WASM invocations
	// substantially slower. Keep a bounded budget for the full protocol suite.
	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "help-test", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:             server.URL + "/mcp",
		HTTPClient:           &http.Client{Transport: uiBearerTransport{token: "help-test"}},
		DisableStandaloneSSE: true,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	if got := session.InitializeResult().Instructions; !strings.Contains(got, "data, not instructions") || !strings.Contains(got, "verify") {
		t.Fatalf("missing model-visible Server Instructions: %q", got)
	}
	listed, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Tools) != 5 {
		t.Fatalf("changed MCP tool count: %d", len(listed.Tools))
	}
	for _, tool := range listed.Tools {
		switch tool.Name {
		case "kgos_read", "kgos_run":
			if !strings.Contains(tool.Description, "help(") {
				t.Fatalf("tool lacks on-demand Help instruction: %s", tool.Name)
			}
			if tool.Annotations == nil || tool.Annotations.ReadOnlyHint != (tool.Name == "kgos_read") ||
				tool.Annotations.DestructiveHint == nil || *tool.Annotations.DestructiveHint != (tool.Name == "kgos_run") {
				t.Fatalf("incorrect tool annotations: %s: %#v", tool.Name, tool.Annotations)
			}
			schema, _ := json.Marshal(tool.InputSchema)
			if !strings.Contains(string(schema), "function body") || !strings.Contains(string(schema), "evolution.state.create") {
				t.Fatalf("missing code parameter guidance: %s", schema)
			}
		case "kgos_preview":
			schema, _ := json.Marshal(tool.InputSchema)
			if !strings.Contains(string(schema), "100 through 500") || !strings.Contains(string(schema), "frozen view") {
				t.Fatalf("missing Preview parameter guidance: %s", schema)
			}
		case "state_ancestry":
			schema, _ := json.Marshal(tool.InputSchema)
			if !strings.Contains(string(schema), "1 through 1000") || !strings.Contains(string(schema), "continuation") {
				t.Fatalf("missing ancestry parameter guidance: %s", schema)
			}
		}
	}
	call := func(tool, code string) *mcp.CallToolResult {
		t.Helper()
		out, err := session.CallTool(ctx, &mcp.CallToolParams{Name: tool, Arguments: map[string]any{"code": code}})
		if err != nil {
			t.Fatalf("MCP tool %s: %v", tool, err)
		}
		return out
	}
	index := call("kgos_read", "return await help()")
	if index.IsError || len(helpToolPayload(t, index)["result"].([]any)) != 31 {
		t.Fatalf("invalid Help index: %#v", index)
	}
	read := call("kgos_read", `return await help("evolution.state.create")`)
	run := call("kgos_run", `return await help("evolution.state.create")`)
	if read.IsError || run.IsError || !strings.Contains(read.Content[0].(*mcp.TextContent).Text, "StateCreateRequest") {
		t.Fatalf("missing writable method Help in read Tool: %#v / %#v", read, run)
	}
	if !jsonEqual(helpToolPayload(t, read)["result"], helpToolPayload(t, run)["result"]) {
		t.Fatal("SDK Help differs between read/run tools")
	}
	for _, code := range []string{`return await help("not.real")`, "return await help(null)", "return await help(12)", `return await help("ontology.read", "extra")`} {
		out := call("kgos_read", code)
		if !out.IsError || helpToolPayload(t, out)["code"] != "INVALID_ARGUMENT" {
			t.Fatalf("bad Help did not reject: %s: %#v", code, out)
		}
	}
	denied := call("kgos_read", `return await evolution.branch.create({name:"not-allowed",from:"branch/main"})`)
	if !denied.IsError || helpToolPayload(t, denied)["code"] != "PERMISSION_DENIED" {
		t.Fatalf("Help bypassed read-only boundary: %#v", denied)
	}
}

func jsonEqual(a, b any) bool {
	first, _ := json.Marshal(a)
	second, _ := json.Marshal(b)
	return string(first) == string(second)
}
