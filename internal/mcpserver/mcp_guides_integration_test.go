//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"encoding/json"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func documentedJavaScript(t *testing.T, guide string, example int) string {
	t.Helper()
	data, err := fs.ReadFile(embeddedDocs, "docs/guides/"+guide+".md")
	if err != nil {
		t.Fatal(err)
	}
	blocks := strings.Split(string(data), "```js\n")
	if example+1 >= len(blocks) {
		t.Fatalf("missing example %d in %s", example, guide)
	}
	code, _, found := strings.Cut(blocks[example+1], "\n```")
	if !found {
		t.Fatalf("unfinished example %d in %s", example, guide)
	}
	return code
}

// Every mutation runs on phase16Runtime's disposable database, never Dev.
// These are the verbatim scripts that KG OS publishes to MCP clients.
func TestDocumentedOntologyAndObjectLifecycle(t *testing.T) {
	runtime := phase16Runtime(t)
	svc, err := New(runtime.Kernel, Options{Token: "guide-integration-secret"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(svc.Handler())
	defer server.Close()
	// Under -race on Ubuntu the seven real MCP/QuickJS/Lithograph writes and
	// independent Branch checks can exceed 90 seconds in aggregate. Keep a
	// bounded suite deadline without coupling it to a fast local run.
	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "guide-integration", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint:             server.URL + "/mcp",
		DisableStandaloneSSE: true,
		HTTPClient:           &http.Client{Transport: bearerRoundTripper{token: "guide-integration-secret", transport: http.DefaultTransport}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	initial, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "kgos_query", Arguments: map[string]any{
		"code": "return await evolution.overview();",
	}})
	if err != nil || initial.IsError {
		t.Fatalf("cannot read default Branch baseline: %v %#v", err, initial)
	}
	defaultHead := mcpText(t, initial)["result"].(map[string]any)["state"].(string)
	steps := []struct {
		guide string
		index int
		title string
	}{
		{"ontology", 0, "new models and indexes"},
		{"objects", 0, "add domain"},
		{"objects", 1, "batch update"},
		{"objects", 2, "remove unused domain"},
		{"objects", 3, "rename node definition"},
		{"objects", 4, "recover exact Patch mismatch"},
		{"objects", 5, "recover stale Branch base"},
	}
	for _, step := range steps {
		t.Run(step.title, func(t *testing.T) {
			result, err := session.CallTool(ctx, &mcp.CallToolParams{
				Name: "kgos_mutate", Arguments: map[string]any{"code": documentedJavaScript(t, step.guide, step.index)},
			})
			if err != nil {
				t.Fatal(err)
			}
			if result.IsError {
				t.Fatalf("published example failed: %#v", mcpText(t, result))
			}
			// The real published examples must never accidentally advance the
			// default Branch, even after recovery of a stale test Branch.
			check, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "kgos_query", Arguments: map[string]any{
				"code": `return {main:(await evolution.overview()).state,
test:(await evolution.get({state:"branch/kgos-guide-demo"})).state};`,
			}})
			if err != nil || check.IsError {
				t.Fatalf("cannot verify Branch isolation: %v %#v", err, check)
			}
			state := mcpText(t, check)["result"].(map[string]any)
			if state["main"] != defaultHead {
				t.Fatalf("example modified default Branch: initial=%s actual=%v", defaultHead, state["main"])
			}
			if state["test"] == defaultHead {
				t.Fatalf("example failed to advance isolated Branch: %v", state)
			}
		})
	}
	result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: "kgos_query", Arguments: map[string]any{
		"code": `const s=(await evolution.get({state:"branch/kgos-guide-demo"})).state;
return await object.read({at:s,refs:["node:Product","node:Note","relationship:HAS_NOTE"]});`,
	}})
	if err != nil || result.IsError {
		t.Fatalf("final persisted models not readable: %v %#v", err, result)
	}
	value := mcpText(t, result)["result"].(map[string]any)
	if len(value["results"].([]any)) != 3 {
		t.Fatalf("wrong persisted models %#v", value)
	}
	for _, raw := range value["results"].([]any) {
		item := raw.(map[string]any)
		encoded, err := json.Marshal(item["value"])
		if err != nil {
			t.Fatal(err)
		}
		switch item["ref"] {
		case "node:Product":
			if !strings.Contains(string(encoded), "project_title_text") ||
				!strings.Contains(string(encoded), "\"key\"") ||
				!strings.Contains(string(encoded), "\"title\"") {
				t.Fatalf("lost Property/Constraint/Text Index after the published rename: %s", encoded)
			}
		case "relationship:HAS_NOTE":
			if !strings.Contains(string(encoded), "node:Product") ||
				!strings.Contains(string(encoded), "node:Note") {
				t.Fatalf("Relationship endpoints not retained through rename: %s", encoded)
			}
		}
	}
}

// Execute the published reading example on distinct snapshots. A restricted
// target must not silently fall back to the default Branch or change either.
func TestDocumentedPinnedReadingBoundaries(t *testing.T) {
	runtime := phase16Runtime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	initial, err := runtime.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Kernel.EvolutionBranchCreate(ctx, kernel.BranchCreateRequest{
		Name: "allowed-read", From: initial.State,
	}); err != nil {
		t.Fatal(err)
	}
	if _, err := runtime.Kernel.PatchOntology(ctx, kernel.PatchRequest{
		Branch: initial.DefaultBranch, BaseState: initial.State,
		Patch: addMatrixPatch("new:node-definition:ReadFixture", "name: ReadFixture\nproperties:\n  - name: key\n    type: STRING\nconstraints: []\n"),
	}); err != nil {
		t.Fatal(err)
	}
	defaultHead, err := runtime.Kernel.EvolutionOverview(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if defaultHead.State == initial.State {
		t.Fatal("fixture did not separate snapshots")
	}
	before, err := runtime.Kernel.EvolutionBranchList(ctx)
	if err != nil {
		t.Fatal(err)
	}
	svc, err := New(runtime.Kernel, Options{Token: "reading-example-test"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(svc.Handler())
	defer server.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "reading-example", Version: "1"}, nil)
	session, err := client.Connect(ctx, &mcp.StreamableClientTransport{
		Endpoint: server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: bearerRoundTripper{token: "reading-example-test", transport: http.DefaultTransport}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	for _, target := range []struct{ name, state string }{
		{initial.DefaultBranch, defaultHead.State}, {"allowed-read", initial.State},
	} {
		t.Run(target.name, func(t *testing.T) {
			code := strings.ReplaceAll(documentedJavaScript(t, "reading", 0), "branch/main", "branch/"+target.name)
			reply, err := session.CallTool(ctx, &mcp.CallToolParams{
				Name: "kgos_query", Arguments: map[string]any{"code": code},
			})
			if err != nil || reply == nil || reply.IsError {
				t.Fatalf("reading example failed: %v %#v", err, reply)
			}
			result := object(t, mcpText(t, reply)["result"])
			models := object(t, result["ontology"])
			if result["state"] != target.state || models["state"] != target.state {
				t.Fatalf("reading example mixed target snapshots: %#v", result)
			}
			if object(t, result["consistency"])["status"] != "valid" {
				t.Fatalf("reading example returned invalid State: %#v", result)
			}
		})
	}
	after, err := runtime.Kernel.EvolutionBranchList(ctx)
	if err != nil {
		t.Fatal(err)
	}
	beforeJSON, err := json.Marshal(before)
	if err != nil {
		t.Fatal(err)
	}
	afterJSON, err := json.Marshal(after)
	if err != nil {
		t.Fatal(err)
	}
	if string(beforeJSON) != string(afterJSON) {
		t.Fatal("reading example changed Branches")
	}
}
