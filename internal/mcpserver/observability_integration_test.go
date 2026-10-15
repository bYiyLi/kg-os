//go:build lithograph_smoke

package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type protectedLog struct {
	mu   sync.Mutex
	body bytes.Buffer
}

func (l *protectedLog) Write(data []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.body.Write(data)
}
func (l *protectedLog) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.body.String()
}

func TestMCPPartialWritesHaveIndependentBusinessEvents(t *testing.T) {
	runtime := phase16Runtime(t)
	svc, err := New(runtime.Kernel, Options{Token: "mcp-secret"})
	if err != nil {
		t.Fatal(err)
	}
	var log protectedLog
	observer, err := observability.New(&log, "")
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(observability.HTTPMiddleware(observer, svc.Handler(), "/mcp"))
	defer server.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client := mcp.NewClient(&mcp.Implementation{Name: "observability-test", Version: "1.0.0"}, nil)
	transport := &mcp.StreamableClientTransport{
		Endpoint: server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: bearerRoundTripper{token: "mcp-secret", transport: http.DefaultTransport}},
	}
	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()

	// No Tool-level transaction: two writes succeed even when a later script
	// expression fails, and each success must be independently observable.
	script := `const v = await evolution.overview();
await evolution.branch.create({name:"obs-private-branch",from:v.state});
await evolution.tag.create({name:"obs-private-tag",target:v.state});
throw new Error("private-javascript-body");
`
	result, err := session.CallTool(ctx, &mcp.CallToolParams{
		Name: "kgos_run", Arguments: map[string]any{"code": script},
	})
	if err != nil || result == nil || !result.IsError {
		t.Fatalf("expected a script failure after confirmed writes: %+v %v", result, err)
	}
	if branches, err := runtime.Kernel.EvolutionBranchList(ctx); err != nil || len(branches.Items) < 2 {
		t.Fatalf("committed Branch absent: %+v %v", branches, err)
	}
	if tags, err := runtime.Kernel.EvolutionTagList(ctx); err != nil || len(tags.Items) != 1 {
		t.Fatalf("committed Tag absent: %+v %v", tags, err)
	}
	metrics := observer.Snapshot()
	if metrics.MCP.ToolCallsTotal != 1 || metrics.MCP.ToolErrorsTotal != 1 ||
		metrics.Business.OperationsTotal != 2 || metrics.Business.Outcomes["applied"] != 2 {
		t.Fatalf("MCP Tool error overwrote confirmed Kernel writes: %+v", metrics)
	}
	if strings.Contains(log.String(), "private-javascript-body") ||
		strings.Contains(log.String(), "obs-private-branch") || strings.Contains(log.String(), "obs-private-tag") ||
		strings.Contains(log.String(), "mcp-secret") {
		t.Fatal("MCP diagnostics leaked JavaScript, business names or token")
	}
	var eventIDs []string
	var toolID string
	for _, line := range strings.Split(strings.TrimSpace(log.String()), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatal(err)
		}
		switch record["event"] {
		case "business.operation.finished":
			if record["outcome"] != "applied" || record["surface"] != "mcp" {
				t.Fatalf("incorrect Kernel event: %+v", record)
			}
			eventIDs = append(eventIDs, record["request_id"].(string))
		case "mcp.tool.finished":
			if record["tool"] == "kgos_run" {
				toolID = record["request_id"].(string)
				if record["outcome"] != "error" {
					t.Fatalf("MCP Tool logical error lost: %+v", record)
				}
			}
		}
	}
	if len(eventIDs) != 2 || toolID == "" || eventIDs[0] != toolID || eventIDs[1] != toolID {
		t.Fatalf("Tool/Kernel request correlation broken: %v %s", eventIDs, toolID)
	}
}
