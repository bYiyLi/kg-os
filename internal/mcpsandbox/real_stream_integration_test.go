//go:build lithograph_smoke

package mcpsandbox

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	runtimehost "github.com/bYiyLi/kg-os/internal/runtime"
	"github.com/bYiyLi/kg-os/internal/runtimeprofile"
)

func realRuntime(t *testing.T) *runtimehost.Runtime {
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
	a, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_LIBRARY"))
	b, _ := filepath.Abs(os.Getenv("KGOS_LITHOGRAPH_PROVIDER_LIBRARY"))
	c, _ := filepath.Abs(os.Getenv("KGOS_JIEBA_LIBRARY"))
	rt, err := runtimehost.OpenWithOfficialExtensions(context.Background(), root, []runtimeprofile.ExtensionConfig{
		{Source: a, Entrypoint: runtimeprofile.LithographEntrypoint},
		{Source: b, Entrypoint: runtimeprofile.ProviderEntrypoint},
		{Source: c, Entrypoint: runtimeprofile.JiebaEntrypoint},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { rt.Close() })
	return rt
}
func TestPhase16TrueGraphStreamFromKernel(t *testing.T) {
	rt := realRuntime(t)
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if _, err := rt.Kernel.ExecuteGraph(ctx, kernel.GraphExecuteRequest{Branch: "main", Cypher: "CREATE (:Phase16 {id:1}), (:Phase16 {id:2}), (:Phase16 {id:3})"}); err != nil {
		t.Fatal(err)
	}
	dispatch := func(ctx context.Context, method string, args []json.RawMessage) (json.RawMessage, error) {
		var req kernel.GraphQueryRequest
		if err := json.Unmarshal(args[0], &req); err != nil {
			return nil, err
		}
		result, err := rt.Kernel.QueryGraph(ctx, req)
		if err != nil {
			return nil, err
		}
		return json.Marshal(result)
	}
	eventCount := 0
	stream := func(ctx context.Context, method string, payload json.RawMessage, consume func(json.RawMessage) error) error {
		var req kernel.GraphQueryRequest
		if err := json.Unmarshal(payload, &req); err != nil {
			return err
		}
		return rt.Kernel.StreamGraphQuery(ctx, req, func(ev kernel.GraphStreamEvent) error {
			eventCount++
			data, err := json.Marshal(ev)
			if err != nil {
				return err
			}
			return consume(data)
		})
	}
	js := `const events=[];for await(const event of graph.streamQuery({at:"branch/main",cypher:"MATCH (n:Phase16) RETURN n.id ORDER BY n.id"})){events.push(event)}return events`
	out, err := Execute(ctx, js, true, dispatch, stream)
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Type string `json:"type"`
	}
	if err = json.Unmarshal(out, &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 5 || rows[0].Type != "columns" || rows[4].Type != "summary" {
		t.Fatalf("wrong stream %s, count=%d", out, eventCount)
	}
	t.Logf("real Lithograph rows streamed via QuickJS/wazero: count=%d output=%s", eventCount, out)
	out, err = Execute(ctx, `let n=0;for await(const event of graph.streamQuery({at:"branch/main",cypher:"MATCH (n:Phase16) RETURN n.id"})){n++;break;}return n`, true, dispatch, stream)
	if err != nil || strings.TrimSpace(string(out)) != "1" {
		t.Fatalf("early break output=%s err=%v", out, err)
	}
}
