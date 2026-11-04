package mcpserver

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
	"github.com/google/jsonschema-go/jsonschema"
	"github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestUnifiedToolResultPreservesJSONValues(t *testing.T) {
	for _, raw := range []string{`null`, `false`, `42`, `"text"`, `[1,null,"value"]`, `{"code":"client-value","message":"user data"}`} {
		t.Run(raw, func(t *testing.T) {
			result, err := toolResult(json.RawMessage(raw), nil)
			if err != nil {
				t.Fatal(err)
			}
			var want any
			if err := json.Unmarshal([]byte(raw), &want); err != nil {
				t.Fatal(err)
			}
			if got := toolData(t, result); !reflect.DeepEqual(got, want) {
				t.Fatalf("script JSON value changed: got %#v want %#v", got, want)
			}
			assertToolSchema(t, resultSchema(map[string]any{}), result)
		})
	}
}

type panicMarshaler struct{}

func (panicMarshaler) MarshalJSON() ([]byte, error) { panic("private serializer diagnostic") }

func TestToolResultBudgetAndSerializationFailure(t *testing.T) {
	good, err := toolResult(strings.Repeat("x", 1<<20), nil)
	if err != nil || toolData(t, good) == nil {
		t.Fatalf("bounded response failed: %v", err)
	}
	for _, value := range []any{strings.Repeat("x", maxToolResponseBytes/2+100), strings.Repeat("\"", maxToolResponseBytes/3), panicMarshaler{}, func() {}} {
		result, err := toolResult(value, nil)
		if err != nil {
			t.Fatal(err)
		}
		code := toolErrorCode(t, result)
		if code != "RESOURCE_ERROR" && code != "INTERNAL_ERROR" {
			t.Fatalf("unexpected response failure code %s", code)
		}
		wire, err := json.Marshal(result)
		if err != nil || len(wire) > maxToolResponseBytes || strings.Contains(string(wire), "private serializer") {
			t.Fatalf("unsafe response fallback: bytes=%d err=%v", len(wire), err)
		}
		assertToolSchema(t, resultSchema(map[string]any{}), result)
	}
}

func TestMutatingToolFailuresForbidBlindRetry(t *testing.T) {
	for _, err := range []error{context.DeadlineExceeded, context.Canceled, errors.New("private internal error"), &kernel.PublicError{Code: "IO_ERROR", Message: "Provider temporarily unavailable"}} {
		result, _ := buildToolResult(nil, err, true, true)
		failure := toolEnvelope(t, result)
		if failure["retryable"] != false || !strings.Contains(failure["message"].(string), "writes may have completed") {
			t.Fatalf("mutating failure lost uncertainty: %#v", failure)
		}
	}
	for _, code := range []string{"TIMEOUT", "IO_ERROR", "CANCELLED", "RESOURCE_ERROR", "INVALID_ARGUMENT"} {
		result, _ := buildToolResult(nil, &kernel.PublicError{Code: kernel.ErrorCode(code), Message: "public"}, false, true)
		failure := toolEnvelope(t, result)
		if failure["retryable"] != (code == "TIMEOUT" || code == "IO_ERROR") {
			t.Fatalf("incorrect read retryability: %#v", failure)
		}
	}
}

func TestToolWrapperRecoversAndSameClientContinues(t *testing.T) {
	service := &Server{}
	server := mcp.NewServer(&mcp.Implementation{Name: "wrapper-test", Version: "1"}, nil)
	type input struct {
		Value string `json:"value"`
	}
	registerTypedTool(service, server, &mcp.Tool{Name: "example", Annotations: &mcp.ToolAnnotations{ReadOnlyHint: true}}, map[string]any{}, func(_ context.Context, value input) (any, error) {
		if value.Value == "panic" {
			panic("private panic value")
		}
		return value.Value, nil
	})
	var logs contractLog
	observer, err := observability.New(&logs, "")
	if err != nil {
		t.Fatal(err)
	}
	handler := mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return server }, &mcp.StreamableHTTPOptions{Stateless: true, JSONResponse: true})
	httpServer := httptest.NewServer(observability.HTTPMiddleware(observer, handler, "/mcp"))
	defer httpServer.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "wrapper-client", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{Endpoint: httpServer.URL + "/mcp", DisableStandaloneSSE: true}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	for _, arguments := range []any{map[string]any{}, map[string]any{"value": 42}, map[string]any{"value": "ok", "extra": true}, map[string]any{"value": "panic"}} {
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "example", Arguments: arguments})
		if err != nil {
			t.Fatal(err)
		}
		code := toolErrorCode(t, result)
		if code != "INVALID_ARGUMENT" && code != "INTERNAL_ERROR" {
			t.Fatalf("wrong failure %s", code)
		}
		assertToolSchema(t, resultSchema(map[string]any{}), result)
	}
	result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: "example", Arguments: map[string]any{"value": "still connected"}})
	if err != nil || toolData(t, result) != "still connected" {
		t.Fatalf("subsequent call failed: %v", err)
	}
	snapshot := observer.Snapshot()
	if snapshot.MCP.ToolCallsTotal != 5 || snapshot.MCP.ToolErrorsTotal != 4 || snapshot.MCP.InFlight != 0 {
		t.Fatalf("logical outcomes or cleanup lost: %+v", snapshot.MCP)
	}
	if strings.Contains(logs.String(), "private panic value") {
		t.Fatal("panic diagnostic leaked")
	}
}

func assertToolSchema(t *testing.T, schema any, result *mcp.CallToolResult) {
	t.Helper()
	encoded, err := json.Marshal(schema)
	if err != nil {
		t.Fatal(err)
	}
	var output jsonschema.Schema
	if err := json.Unmarshal(encoded, &output); err != nil {
		t.Fatal(err)
	}
	resolved, err := output.Resolve(nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := resolved.Validate(toolEnvelope(t, result)); err != nil {
		t.Fatalf("output schema rejected result: %v", err)
	}
}

type contractLog struct {
	mu     sync.Mutex
	buffer bytes.Buffer
}

func (l *contractLog) Write(value []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buffer.Write(value)
}
func (l *contractLog) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buffer.String()
}

func TestAllToolSchemasDescribeActualBusinessResults(t *testing.T) {
	service, err := New(&kernel.Service{}, Options{Token: "contract-secret"})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(service.Handler())
	defer server.Close()
	client := mcp.NewClient(&mcp.Implementation{Name: "contract-client", Version: "1"}, nil)
	session, err := client.Connect(context.Background(), &mcp.StreamableClientTransport{
		Endpoint: server.URL + "/mcp", DisableStandaloneSSE: true,
		HTTPClient: &http.Client{Transport: uiBearerTransport{token: "contract-secret"}},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close()
	listed, err := session.ListTools(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(listed.Tools) != 6 {
		t.Fatalf("expected six tools, got %d", len(listed.Tools))
	}
	for _, tool := range listed.Tools {
		if tool.OutputSchema == nil {
			t.Fatalf("missing output schema for %s", tool.Name)
		}
		result, err := session.CallTool(context.Background(), &mcp.CallToolParams{Name: tool.Name, Arguments: map[string]any{"unknown": true}})
		if err != nil {
			t.Fatal(err)
		}
		if code := toolErrorCode(t, result); code != "INVALID_ARGUMENT" {
			t.Fatalf("%s returned %s", tool.Name, code)
		}
		assertToolSchema(t, tool.OutputSchema, result)
		var arguments map[string]any
		switch tool.Name {
		case "kgos_query", "kgos_mutate":
			arguments = map[string]any{"code": "return null"}
		case "kgos_docs", "kgos_workspace":
			arguments = map[string]any{}
		default:
			continue
		}
		result, err = session.CallTool(context.Background(), &mcp.CallToolParams{Name: tool.Name, Arguments: arguments})
		if err != nil {
			t.Fatal(err)
		}
		toolData(t, result)
		assertToolSchema(t, tool.OutputSchema, result)
	}
}
