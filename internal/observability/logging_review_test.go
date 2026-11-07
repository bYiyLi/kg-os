package observability

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
)

func TestRequiredDiagnosticEventsSurviveErrorLevelAndPersistWithCorrectSource(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	ctx, _, err := WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	WithSurface(ctx, "mcp")
	Business(ctx, BusinessResult{Operation: "object.patch", Outcome: "applied"})
	observer.ToolStart()
	observer.Tool(ctx, "kgos_query", "", time.Millisecond)
	Security(ctx, "oauth.token.exchange", "applied")
	Log(ctx, slog.LevelInfo, "runtime", "runtime.started")
	Log(ctx, slog.LevelInfo, "lithograph_host", "lithograph.operation.finished")

	handler := HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		WithSurface(r.Context(), "web")
		w.WriteHeader(http.StatusNoContent)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/graph/query?token=do-not-log", nil))
	if response.Code != http.StatusNoContent {
		t.Fatalf("request status: %d", response.Code)
	}
	requestID := response.Header().Get(RequestIDHeader)
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(shutdown); err != nil {
		t.Fatal(err)
	}
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	logs, err := reopened.ListLogs(context.Background(), LogListInput{})
	if err != nil {
		t.Fatal(err)
	}
	events := map[string]bool{}
	for _, record := range logs.Items {
		events[record.Event] = true
		if record.Event == "business.operation.finished" && record.Fields["surface"] != "mcp" {
			t.Fatalf("trusted MCP source missing: %+v", record.Fields)
		}
		if record.Event == "http.request.finished" {
			if record.Fields["surface"] != "web" || record.Fields["operation"] != "graph.query" {
				t.Fatalf("wrong authenticated HTTP log: %+v", record.Fields)
			}
		}
	}
	for _, event := range []string{
		"business.operation.finished", "mcp.tool.finished", "security.authorization.decided",
		"runtime.started", "http.request.finished",
	} {
		if !events[event] {
			t.Fatalf("required event %q was filtered by ERROR level: %+v", event, events)
		}
	}
	if events["lithograph.operation.finished"] {
		t.Fatal("optional INFO log bypassed ERROR level")
	}
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil || detail.Request.Surface != "web" {
		t.Fatalf("request finish did not retain authenticated Web source: %+v %v", detail.Request, err)
	}
}

func TestLogOperationNamesAndStorageFailureClassesAreSafe(t *testing.T) {
	if got := routeOperation("/api/v1/graph/query?token=secret", "api"); got != "api.unmapped" {
		t.Fatalf("untrusted route became a log operation: %q", got)
	}
	if got := routeOperation("/api/v1/graph/query", "api"); got != "graph.query" {
		t.Fatalf("registered route missing: %q", got)
	}
	for path, name := range map[string]string{
		"/api/v1/setup/status":             "setup.status",
		"/api/v1/setup/rotate-token":       "setup.rotate-token",
		"/api/v1/setup/initialize":         "setup.initialize",
		"/api/v1/setup/validate-embedding": "setup.validate-embedding",
	} {
		if got := routeOperation(path, "api"); got != name {
			t.Fatalf("Setup operation %q was not classified: %q", path, got)
		}
	}
	if got := routeOperation("/mcp", "mcp"); got != "mcp.transport" {
		t.Fatalf("MCP transport class: %q", got)
	}
	if got := routeClass("/oauth/register", nil); got != "oauth" {
		t.Fatalf("OAuth registration was treated as static traffic: %q", got)
	}
	if got := routeOperation("/oauth/register", "oauth"); got != "oauth/register" {
		t.Fatalf("OAuth registration lost its fixed operation: %q", got)
	}
	for _, test := range []struct {
		err  error
		want string
	}{
		{os.ErrPermission, "permission"},
		{context.DeadlineExceeded, "deadline_exceeded"},
		{sqlite3.Error{Code: sqlite3.ErrBusy}, "busy"},
		{sqlite3.Error{Code: sqlite3.ErrLocked}, "busy"},
		{sqlite3.Error{Code: sqlite3.ErrFull}, "disk_full"},
		{sqlite3.Error{Code: sqlite3.ErrReadonly}, "permission"},
		{sqlite3.Error{Code: sqlite3.ErrCorrupt}, "corrupt"},
		{sqlite3.Error{Code: sqlite3.ErrIoErr}, "io_error"},
		{errors.New("secret-path/credentials"), "storage_error"},
	} {
		cause := StorageCause(test.err)
		if cause != test.want || strings.Contains(cause, "secret") {
			t.Fatalf("unsafe cause %q for %T, expected %q", cause, test.err, test.want)
		}
	}
}

func TestStreamTerminalErrorCannotBeOverwrittenByLaterSuccess(t *testing.T) {
	ctx, _, err := WithRequest(context.Background(), nil)
	if err != nil {
		t.Fatal(err)
	}
	SetStreamResult(ctx, "error", "IO_ERROR")
	SetStreamResult(ctx, "succeeded", "")
	if outcome, code := StreamResult(ctx); outcome != "error" || code != "IO_ERROR" {
		t.Fatalf("stream failure was overwritten: %s %s", outcome, code)
	}
}
