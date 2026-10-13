//go:build lithograph_smoke

package mcpserver

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func phase16Runtime(t *testing.T) *runtimehost.Runtime {
	t.Helper()
	root := t.TempDir()
	paths, err := runtimeprofile.ResolvePaths(root)
	if err != nil {
		t.Fatal(err)
	}
	if err = runtimeprofile.EnsureDirectories(paths); err != nil {
		t.Fatal(err)
	}
	config := "[cache]\npath = \"cache/openai-compatible.db\"\nmax_size_mb = 16\n\n" +
		"[fulltext]\nanalyzer = \"unicode61\"\n\n" +
		"[embedding]\nbase_url = \"https://example.invalid/v1\"\nmodel = \"phase16-fixture\"\ndimensions = 3\nsimilarity = \"cosine\"\napi_key_env = \"\"\n"
	if err = os.WriteFile(paths.Config, []byte(config), 0600); err != nil {
		t.Fatal(err)
	}
	lib, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_LIBRARY"))
	provider, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY"))
	jieba, _ := filepath.Abs(os.Getenv("KGOS_JIEBA_LIBRARY"))
	runtime, err := runtimehost.OpenWithOfficialExtensions(context.Background(), root, []runtimeprofile.ExtensionConfig{
		{Source: lib, Entrypoint: runtimeprofile.LithographEntrypoint},
		{Source: provider, Entrypoint: runtimeprofile.ProviderEntrypoint},
		{Source: jieba, Entrypoint: runtimeprofile.JiebaEntrypoint},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = runtime.Close() })
	return runtime
}

type bearerRoundTripper struct {
	token     string
	transport http.RoundTripper
}

func (r bearerRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	copy := req.Clone(req.Context())
	copy.Header.Set("Authorization", "Bearer "+r.token)
	return r.transport.RoundTrip(copy)
}
func mcpText(t *testing.T, result *mcp.CallToolResult) map[string]any {
	t.Helper()
	if result == nil || len(result.Content) != 1 {
		t.Fatalf("unexpected content %#v", result)
	}
	item, ok := result.Content[0].(*mcp.TextContent)
	if !ok {
		t.Fatalf("expected text content, got %T", result.Content[0])
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(item.Text), &payload); err != nil {
		t.Fatalf("not JSON: %s: %v", item.Text, err)
	}
	return payload
}
func TestRealKernelMCPToolsAndAuthentication(t *testing.T) {
	runtime := phase16Runtime(t)
	svc, err := New(runtime.Kernel, Options{Token: "phase16-secret", Path: "/mcp"})
	if err != nil {
		t.Fatal(err)
	}
	httpServer := httptest.NewServer(svc.Handler())
	defer httpServer.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 35*time.Second)
	defer cancel()
	denied, err := http.Post(httpServer.URL+"/mcp", "application/json", strings.NewReader("{}"))
	if err != nil {
		t.Fatal(err)
	}
	denied.Body.Close()
	if denied.StatusCode != 401 {
		t.Fatalf("no bearer response=%d", denied.StatusCode)
	}
	client := mcp.NewClient(&mcp.Implementation{Name: "phase16-test", Version: "1.0.0"}, nil)
	transport := &mcp.StreamableClientTransport{
		Endpoint: httpServer.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: bearerRoundTripper{token: "phase16-secret", transport: http.DefaultTransport}},
	}
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listed, err := session.ListTools(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	names := make(map[string]bool)
	for _, tool := range listed.Tools {
		names[tool.Name] = true
	}
	for _, name := range []string{"kgos_read", "kgos_run", "kgos_preview", "state_ancestry"} {
		if !names[name] {
			t.Fatalf("Tool %s absent: %#v", name, names)
		}
	}
	if len(names) != 4 {
		t.Fatalf("wrong tool inventory %#v", names)
	}
	call := func(name string, args map[string]any) *mcp.CallToolResult {
		t.Helper()
		result, err := session.CallTool(ctx, &mcp.CallToolParams{Name: name, Arguments: args})
		if err != nil {
			t.Fatalf("call %s: %v", name, err)
		}
		return result
	}
	read := call("kgos_read", map[string]any{"code": "const v=await evolution.overview();return v"})
	if read.IsError {
		t.Fatalf("read failed: %#v", mcpText(t, read))
	}
	if mcpText(t, read)["result"] == nil {
		t.Fatalf("missing result %#v", read)
	}
	forged := call("kgos_read", map[string]any{"code": "return await evolution.branch.create({name:'illegal',from:'branch/main'})"})
	if !forged.IsError {
		t.Fatalf("read tool permitted write %#v", forged)
	}
	create := call("kgos_run", map[string]any{"code": "const v=await evolution.overview();return await evolution.branch.create({name:'sandbox-proof',from:v.state})"})
	if create.IsError {
		t.Fatalf("write tool failed %#v", mcpText(t, create))
	}
	preview := call("kgos_preview", map[string]any{"offset": 0, "limit": 100})
	if preview.IsError {
		t.Fatalf("preview error %#v", mcpText(t, preview))
	}
	page := mcpText(t, preview)
	if page["viewRevision"] == nil || !strings.Contains(page["preview"].(string), "sandbox-proof") {
		t.Fatalf("preview incomplete %#v", page)
	}
	ancestry := call("state_ancestry", map[string]any{"root": "branch/main", "limit": 10})
	if ancestry.IsError {
		t.Fatalf("ancestry error %#v", mcpText(t, ancestry))
	}
	if !strings.Contains(mcpText(t, ancestry)["markdown"].(string), "Commit DAG") {
		t.Fatalf("missing ancestry DAG")
	}
}
