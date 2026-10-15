package observability

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testObserver(t *testing.T, level string) (*Observer, *bytes.Buffer) {
	t.Helper()
	var output bytes.Buffer
	o, err := New(&output, level)
	if err != nil {
		t.Fatal(err)
	}
	return o, &output
}

func parsedLines(t *testing.T, output string) []map[string]any {
	t.Helper()
	var lines []map[string]any
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		var record map[string]any
		if err := json.Unmarshal([]byte(line), &record); err != nil {
			t.Fatalf("not JSON: %q: %v", line, err)
		}
		lines = append(lines, record)
	}
	return lines
}

func TestLoggerLevelIdentifierAndSafeBusinessEvent(t *testing.T) {
	t.Parallel()
	for _, input := range []string{"nonsense", "TRACE", "silent", " "} {
		if _, err := New(&bytes.Buffer{}, input); err == nil {
			t.Fatalf("accepted invalid level %q", input)
		}
	}
	o, output := testObserver(t, "WARN")
	ctx, requestID, err := WithRequest(context.Background(), o)
	if err != nil || !strings.HasPrefix(requestID, "req_") || len(requestID) != 36 {
		t.Fatalf("request ID: %q %v", requestID, err)
	}
	Log(ctx, slog.LevelDebug, "kernel", "kernel.debug")
	Log(ctx, slog.LevelInfo, "kernel", "kernel.info")
	Business(ctx, BusinessResult{
		Operation: "object.patch", Outcome: "unknown",
		State:     "commit/" + strings.Repeat("a", 64),
		ErrorCode: "BAD secret-token", Duration: 13 * time.Millisecond,
	})
	lines := parsedLines(t, output.String())
	if len(lines) != 1 || lines[0]["request_id"] != requestID ||
		lines[0]["error_code"] != "INTERNAL_ERROR" ||
		lines[0]["outcome"] != "unknown" || lines[0]["level"] != "WARN" {
		t.Fatalf("unsafe or incorrect log: %#v", lines)
	}
	if strings.Contains(output.String(), "secret-token") {
		t.Fatal("untrusted error code leaked")
	}
	if o.Snapshot().Business.OperationsTotal != 1 {
		t.Fatal("business metric was not updated")
	}
}

func TestHTTPMiddlewarePreservesStreamingAndServerGeneratedID(t *testing.T) {
	t.Parallel()
	o, output := testObserver(t, "INFO")
	var seenID string
	handler := HTTPMiddleware(o, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seenID = RequestID(r.Context())
		w.Header().Set("Content-Type", "application/x-ndjson")
		_, _ = w.Write([]byte("{\"type\":\"columns\"}\n"))
		if _, ok := w.(http.Flusher); !ok {
			t.Fatal("streaming Flusher missing")
		}
		w.(http.Flusher).Flush()
		_, _ = w.Write([]byte("{\"type\":\"summary\"}\n"))
	}), "/mcp")
	req := httptest.NewRequest(http.MethodPost, "/api/v1/graph/execute?secret=hidden", nil)
	req.Header.Set(RequestIDHeader, "spoofed")
	req.Header.Set("Authorization", "Bearer secret-token")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, req)
	id := response.Header().Get(RequestIDHeader)
	if id != seenID || id == "spoofed" || len(id) != 36 {
		t.Fatalf("untrusted request ID: %q / %q", id, seenID)
	}
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), "summary") || !response.Flushed {
		t.Fatalf("stream framing changed: %+v", response)
	}
	if strings.Contains(output.String(), "hidden") || strings.Contains(output.String(), "secret-token") {
		t.Fatal("query string or credential leaked")
	}
	snapshot := o.Snapshot()
	if snapshot.HTTP.RequestsTotal != 1 || snapshot.HTTP.Non2xxTotal != 0 ||
		snapshot.HTTP.InFlight != 0 || snapshot.HTTP.Latency.LE50 != 1 {
		t.Fatalf("unexpected HTTP metrics: %+v", snapshot.HTTP)
	}
	if parsedLines(t, output.String())[0]["route"] != "api" {
		t.Fatal("untrusted path was used as a metric label")
	}
}

func TestIndependentKernelOutcomesAndToolMetrics(t *testing.T) {
	t.Parallel()
	o, output := testObserver(t, "INFO")
	ctx, _, err := WithRequest(context.Background(), o)
	if err != nil {
		t.Fatal(err)
	}
	ctx = WithSurface(ctx, "mcp")
	Business(ctx, BusinessResult{Operation: "evolution.branch.create", Outcome: "applied"})
	Business(ctx, BusinessResult{Operation: "object.patch", Outcome: "unknown", ErrorCode: "IO_ERROR"})
	o.ToolStart()
	o.Tool(ctx, "kgos_run", "SCRIPT_ERROR", time.Millisecond)
	lines := parsedLines(t, output.String())
	if len(lines) != 3 || lines[0]["operation_id"] == lines[1]["operation_id"] ||
		lines[0]["request_id"] != lines[1]["request_id"] ||
		lines[0]["outcome"] != "applied" || lines[1]["outcome"] != "unknown" {
		t.Fatalf("independent business outcomes lost: %#v", lines)
	}
	stats := o.Snapshot()
	if stats.Business.Outcomes["applied"] != 1 || stats.Business.Outcomes["unknown"] != 1 ||
		stats.MCP.ToolErrorsTotal != 1 || stats.MCP.ToolCallsTotal != 1 || stats.MCP.InFlight != 0 {
		t.Fatalf("unexpected metrics: %+v", stats)
	}
	fresh, _ := testObserver(t, "INFO")
	if fresh.Snapshot().Business.OperationsTotal != 0 {
		t.Fatal("new process metrics must start empty")
	}
}
