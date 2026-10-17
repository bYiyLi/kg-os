package mcpserver

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/webui"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type uiBearerTransport struct {
	token string
}

func (tr uiBearerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	copy := request.Clone(request.Context())
	copy.Header.Set("Authorization", "Bearer "+tr.token)
	return http.DefaultTransport.RoundTrip(copy)
}

func TestWorkspaceMCPToolAndResource(t *testing.T) {
	if _, err := webui.EmbeddedMCPApp(); err != nil {
		t.Skipf("requires built MCP Web resource: %v", err)
	}
	server, err := New(&kernel.Service{}, Options{Token: "test-root-secret"})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(server.Handler())
	defer httpServer.Close()

	request, err := http.NewRequest(http.MethodPost, httpServer.URL+"/mcp", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("unauthenticated MCP = %d", response.StatusCode)
	}

	client := mcp.NewClient(&mcp.Implementation{Name: "ui-test", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint:             httpServer.URL + "/mcp",
		DisableStandaloneSSE: true,
		HTTPClient:           &http.Client{Transport: uiBearerTransport{token: "test-root-secret"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	tools, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(tools.Tools) != 6 {
		t.Fatalf("expected five AI-facing tools and one UI entry, got %d", len(tools.Tools))
	}
	var workspace *mcp.Tool
	for _, tool := range tools.Tools {
		if tool.Name == "kgos_workspace" {
			workspace = tool
		}
	}
	if workspace == nil || workspace.Meta["ui"] == nil || workspace.Meta["openai/ui"] == nil {
		t.Fatalf("missing UI Tool metadata: %#v", workspace)
	}
	ui := workspace.Meta["ui"].(map[string]any)
	if ui["resourceUri"] != workspaceResourceURI {
		t.Fatalf("wrong UI URI: %#v", ui)
	}
	visibility := ui["visibility"].([]any)
	if len(visibility) != 1 || visibility[0] != "app" {
		t.Fatalf("unexpected Tool visibility: %#v", visibility)
	}
	openai := workspace.Meta["openai/ui"].(map[string]any)
	entrypoints := openai["entrypoints"].([]any)
	if len(entrypoints) != 2 || entrypoints[0].(map[string]any)["type"] != "global" || entrypoints[1].(map[string]any)["type"] != "thread" {
		t.Fatalf("missing sidebar or thread entrypoint: %#v", entrypoints)
	}
	if !workspace.Annotations.ReadOnlyHint || len(workspace.Icons) != 1 {
		t.Fatalf("missing UI annotations or icon: %#v", workspace)
	}
	opened, err := session.CallTool(context.Background(), &mcp.CallToolParams{
		Name: "kgos_workspace", Arguments: map[string]any{},
	})
	if err != nil || opened.IsError {
		t.Fatalf("open UI: %#v / %v", opened, err)
	}
	if opened.StructuredContent == nil {
		t.Fatalf("missing initial UI result: %#v", opened)
	}

	resources, err := session.ListResources(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(resources.Resources) != 1 || resources.Resources[0].URI != workspaceResourceURI {
		t.Fatalf("wrong Resource inventory: %#v", resources.Resources)
	}
	loaded, err := session.ReadResource(context.Background(), &mcp.ReadResourceParams{URI: workspaceResourceURI})
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Contents) != 1 {
		t.Fatalf("bad Resource response: %#v", loaded.Contents)
	}
	content := loaded.Contents[0]
	if content.MIMEType != workspaceMIMEType || !strings.Contains(content.Text, "<script type=\"module\">") ||
		!strings.Contains(content.Text, "<style>") || strings.Contains(content.Text, "src=\"/assets/") {
		t.Fatalf("resource isn't self-contained HTML: %s", content.Text[:min(256, len(content.Text))])
	}
	if content.Meta["ui"] == nil {
		t.Fatal("MCP App CSP metadata missing")
	}
}
