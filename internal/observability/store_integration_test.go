package observability

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func closeObserverForTest(t *testing.T, observer *Observer) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(ctx); err != nil {
		t.Fatalf("flush observer and diagnostic store: %v", err)
	}
}

func newPrivateStoreForTest(t *testing.T) (*Store, string) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), ".kgos", "logs")
	store, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatalf("open diagnostic store: %v", err)
	}
	return store, dir
}

func TestTraceStorePersistsLinkedRequestAndSafeLogs(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "DEBUG")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	ctx, requestID, err := WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	start := time.Now().UTC()
	ctx, root := StartSpan(ctx, "http.api")
	store.RequestStart(requestRecord{
		Time: start, RunID: observer.runID, RequestID: requestID,
		TraceID: root.SpanContext().TraceID().String(), Route: "api", Method: "POST",
	})
	ctx, operation := StartOperation(ctx, "kernel.graph.execute")
	operationID := OperationID(ctx)
	if !operation.SpanContext().IsValid() || operationID == "" {
		t.Fatal("missing trusted span or operation ID at start")
	}
	observer.Log(ctx, slog.LevelWarn, "kernel", "business.operation.finished",
		slog.String("tool", "kgos_mutate"), slog.String("error", "secret-do-not-store"),
		slog.String("error_code", "SAFE_CODE"), slog.Int64("duration_ms", 3))
	Business(ctx, BusinessResult{Operation: "graph.execute", Outcome: "committed"})
	operation.End()
	SpanOutcome(root, "succeeded")
	root.End()
	store.RequestEnd(requestRecord{
		Time: time.Now(), RunID: observer.runID, RequestID: requestID, Route: "api",
		Status: http.StatusOK, Outcome: "succeeded", DurationMS: 3,
	})
	closeObserverForTest(t, observer)

	persisted, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatalf("reopen committed diagnostic SQLite: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = persisted.Close(ctx)
	}()
	list, err := persisted.List(context.Background(), RequestListInput{Limit: 10})
	if err != nil || list.Availability != "available" || len(list.Items) != 1 {
		t.Fatalf("persistent request list: %#v %v", list, err)
	}
	if list.Items[0].RequestID != requestID || list.Items[0].Outcome != "succeeded" {
		t.Fatalf("request identity/result changed: %+v", list.Items[0])
	}
	details, err := persisted.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	if len(details.Spans) < 2 || len(details.Logs) < 2 {
		t.Fatalf("missing root/operation spans or correlated logs: spans=%+v logs=%+v",
			details.Spans, details.Logs)
	}
	var rootID, childID string
	for _, span := range details.Spans {
		switch span.Name {
		case "http.api":
			rootID = span.SpanID
		case "kernel.graph.execute":
			childID = span.SpanID
			if span.OperationID != operationID {
				t.Errorf("different operation ID at completion: %+v", span)
			}
		}
	}
	if rootID == "" || childID == "" || rootID == childID {
		t.Fatalf("missing distinct OTel root/child: %+v", details.Spans)
	}
	for _, span := range details.Spans {
		if span.SpanID == childID && span.ParentSpanID != rootID {
			t.Fatalf("Span parent association is wrong: %+v", span)
		}
	}
	for _, event := range details.Logs {
		raw, _ := json.Marshal(event)
		if strings.Contains(string(raw), "secret-do-not-store") {
			t.Fatalf("unsafe slog attr leaked to SQLite: %s", raw)
		}
	}
	bySpan, err := persisted.Get(context.Background(), RequestGetInput{
		RequestID: requestID, SpanID: childID,
	})
	if err != nil || len(bySpan.Logs) == 0 {
		t.Fatalf("failed span-scoped log lookup: %+v %v", bySpan, err)
	}
	overview, err := persisted.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || overview.Availability != "available" || overview.Total != 1 {
		t.Fatalf("missing historical metrics: %+v %v", overview, err)
	}
}

func TestStoreRejectsUnsafePathsAndInvalidQueries(t *testing.T) {
	dir := t.TempDir()
	if _, err := OpenStore("relative/logs", io.Discard); err == nil {
		t.Fatal("relative diagnostic directory allowed")
	}
	symlink := filepath.Join(dir, "symlink")
	if err := os.Symlink(dir, symlink); err == nil {
		if _, err := OpenStore(symlink, io.Discard); err == nil {
			t.Fatal("symbolic diagnostic directory allowed")
		}
	}
	logs := filepath.Join(dir, "logs")
	if err := os.MkdirAll(logs, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(dir, "private"), filepath.Join(logs, "observability.sqlite")); err == nil {
		if _, err := OpenStore(logs, io.Discard); err == nil {
			t.Fatal("symbolic database target allowed")
		}
	}

	store, _ := newPrivateStoreForTest(t)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = store.Close(ctx)
	}()
	for _, input := range []Window{
		{From: time.Now().Add(-48 * time.Hour).Format(time.RFC3339), To: time.Now().Format(time.RFC3339)},
		{From: "not-a-time"},
		{From: time.Now().Add(time.Hour).Format(time.RFC3339)},
	} {
		if _, err := store.Overview(context.Background(), input, Snapshot{}); !errors.Is(err, ErrInvalidQuery) {
			t.Fatalf("invalid historical time range was accepted: %+v %v", input, err)
		}
	}
	if _, err := store.List(context.Background(), RequestListInput{Limit: 1001}); !errors.Is(err, ErrInvalidQuery) {
		t.Fatal("unbounded request pagination accepted")
	}
	if _, err := store.List(context.Background(), RequestListInput{Cursor: "1:garbage"}); !errors.Is(err, ErrInvalidQuery) {
		t.Fatal("invalid cursor accepted")
	}
	if _, err := store.Get(context.Background(), RequestGetInput{RequestID: "req_../../secret"}); !errors.Is(err, ErrInvalidQuery) {
		t.Fatal("untrusted request ID passed SQL")
	}
}

func TestDiagnosticQueueIsBoundedAndNeverBlocksBusiness(t *testing.T) {
	store, _ := newPrivateStoreForTest(t)
	start := time.Now()
	for i := 0; i < 10000; i++ {
		store.Log(logRecord{Time: time.Now(), RunID: "run_fixture", Component: "runtime",
			Event: "runtime.started", Fields: "{}"})
	}
	if time.Since(start) > 2*time.Second {
		t.Fatal("diagnostic producer was blocked by database I/O")
	}
	if got := len(store.queue); got > storeQueueSize {
		t.Fatalf("diagnostic queue exceeded bound: %d", got)
	}
	if store.Dropped() == 0 {
		t.Log("writer kept pace with synthetic workload; buffer bound still held")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := store.Close(ctx); err != nil {
		t.Fatalf("bounded shutdown: %v", err)
	}
}

func TestHTTPTraceCannotUseUntrustedClientTraceParent(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, span := StartSpan(r.Context(), "kernel.graph.query")
		span.End()
		w.WriteHeader(http.StatusOK)
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/v1/graph/query", nil)
	request.Header.Set("traceparent", "00-11111111111111111111111111111111-2222222222222222-01")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	requestID := response.Header().Get(RequestIDHeader)
	closeObserverForTest(t, observer)
	persisted, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = persisted.Close(ctx)
	}()
	details, err := persisted.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil || len(details.Spans) < 2 {
		t.Fatalf("missing server-generated trace: %+v %v", details, err)
	}
	for _, item := range details.Spans {
		if item.TraceID == "11111111111111111111111111111111" ||
			item.ParentSpanID == "2222222222222222" {
			t.Fatalf("client-owned trace identity was trusted: %+v", item)
		}
	}
}

// This assertion documents the diagnostic database boundary, not an arbitrary
// sqlite-schema contract for the business database.
func TestStoreFileIsPrivateAndSeparate(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = store.Close(ctx)
	}()
	if fi, err := os.Stat(filepath.Join(dir, "observability.sqlite")); err != nil {
		t.Fatal(err)
	} else if fi.Mode().Perm() != 0o600 && os.PathSeparator == '/' {
		t.Fatalf("diagnostic database permissions too open: %v", fi.Mode())
	}
	var count int
	if err := store.db.QueryRow("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('requests','spans','log_events','metric_buckets','system_events')").Scan(&count); err != nil || count != 5 {
		t.Fatalf("required query structures missing: %v count=%d", err, count)
	}
	if _, err := os.Stat(filepath.Join(dir, "kgos.db")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("diagnostic persistence touched the business database: %v", err)
	}
}
