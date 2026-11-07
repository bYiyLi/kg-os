package observability

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestDiagnosticStoreEscapesSpecialCharactersInAbsoluteWorkspacePath(t *testing.T) {
	root := filepath.Join(t.TempDir(), "workspace # query? + percent%")
	logs := filepath.Join(root, ".kgos", "logs")
	store, err := OpenStore(logs, io.Discard)
	if err != nil {
		t.Fatalf("failed to resolve encoded diagnostic SQLite URI: %v", err)
	}
	store.System(systemRecord{Time: time.Now(), RunID: "run_fixture", Event: "runtime.starting"})
	closeDiagnosticStore(t, store)
	expected := filepath.Join(logs, "observability.sqlite")
	if _, err := os.Stat(expected); err != nil {
		t.Fatalf("diagnostic file not stored in selected workspace: %v", err)
	}
	again, err := OpenStore(logs, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, again)
	var count int
	if err := again.db.QueryRow("SELECT COUNT(*) FROM system_events WHERE event='runtime.starting'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("encoded URI did not reopen committed records: %v count=%d", err, count)
	}
}

func TestOverviewKeepsBoundedSamplesAcrossFullDay(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	now := time.Now().UTC().Truncate(time.Minute).Add(-time.Second)
	// More than 400 points spread across 18 hours. The Overview API must
	// preserve old and recent real samples without returning every raw point.
	for i := 0; i < 540; i++ {
		store.Metric(metricRecord{
			Time:      now.Add(-time.Duration(539-i) * 2 * time.Minute),
			HeapBytes: uint64((i + 1) * 1024), Goroutines: 3,
		})
	}
	closeDiagnosticStore(t, store)
	again, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, again)
	res, err := again.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil {
		t.Fatal(err)
	}
	if len(res.Resources) < 100 || len(res.Resources) > 400 {
		t.Fatalf("bounded historical resource coverage lost: %d samples", len(res.Resources))
	}
	first, err := time.Parse(time.RFC3339Nano, res.Resources[0].Time)
	if err != nil {
		t.Fatal(err)
	}
	last, err := time.Parse(time.RFC3339Nano, res.Resources[len(res.Resources)-1].Time)
	if err != nil {
		t.Fatal(err)
	}
	if now.Sub(first) < 17*time.Hour || now.Sub(last) > 5*time.Minute {
		t.Fatalf("resource history only covered recent data: first=%s last=%s", first, last)
	}
	for i := 1; i < len(res.Resources); i++ {
		if res.Resources[i-1].Time >= res.Resources[i].Time {
			t.Fatal("resource bucket ordering was not chronological")
		}
	}
}

func TestPollingNeverPersistsRecursiveObservabilityAccessLogs(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	for _, path := range []string{
		"/api/v1/system/observability/overview",
		"/api/v1/system/observability/requests/list",
		"/api/v1/system/observability/requests/get",
		"/api/v1/system/diagnostics",
	} {
		request := httptest.NewRequest(http.MethodPost, path, nil)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("unexpected internal test response: %d", response.Code)
		}
	}
	if observer.Snapshot().HTTP.RequestsTotal != 4 {
		t.Fatal("transport metrics were changed when excluding observations")
	}
	closeObserverForTest(t, observer)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	var logs, requests int
	if err := reopened.db.QueryRow("SELECT COUNT(*) FROM log_events").Scan(&logs); err != nil {
		t.Fatal(err)
	}
	if err := reopened.db.QueryRow("SELECT COUNT(*) FROM requests").Scan(&requests); err != nil {
		t.Fatal(err)
	}
	if logs != 0 || requests != 0 {
		t.Fatalf("diagnostic polling recursively persisted itself: %d logs, %d requests", logs, requests)
	}
}

func closeDiagnosticStore(t *testing.T, store *Store) {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := store.Close(ctx); err != nil {
		t.Fatal(err)
	}
}

func TestMCPFailureSticksAndExactStageAssociationCannotBeCombinedAcrossSpans(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	now := time.Now()
	requestID := "req_" + strings.Repeat("a", 32)
	op1 := "op_" + strings.Repeat("b", 32)
	op2 := "op_" + strings.Repeat("c", 32)
	store.RequestStart(requestRecord{Time: now, RunID: "run_fixture", RequestID: requestID, Route: "mcp"})
	store.SpanStart(spanRecord{
		TraceID: strings.Repeat("a", 32), SpanID: "aaaaaaaaaaaaaaaa", RequestID: requestID,
		OperationID: op1, Name: "kernel.graph.query", Start: now,
	})
	store.SpanStart(spanRecord{
		TraceID: strings.Repeat("a", 32), SpanID: "bbbbbbbbbbbbbbbb", RequestID: requestID,
		OperationID: op2, Name: "kernel.object.patch", Start: now,
	})
	store.ToolEnd(requestRecord{RequestID: requestID, Tool: "kgos_mutate", Outcome: "error", ErrorCode: "IO_ERROR"})
	store.ToolEnd(requestRecord{RequestID: requestID, Tool: "kgos_query", Outcome: "succeeded"})
	store.RequestEnd(requestRecord{
		Time: now.Add(10 * time.Millisecond), RunID: "run_fixture", RequestID: requestID,
		Status: http.StatusOK, Outcome: "succeeded", DurationMS: 10,
	})
	closeDiagnosticStore(t, store)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	list, err := reopened.List(context.Background(), RequestListInput{})
	if err != nil || len(list.Items) != 1 || list.Items[0].Outcome != "error" ||
		list.Items[0].ErrorCode != "IO_ERROR" || list.Items[0].Tool != "kgos_mutate" {
		t.Fatalf("HTTP 200 or later tool incorrectly erased MCP failure: %+v %v", list, err)
	}
	if _, err := reopened.Get(context.Background(), RequestGetInput{
		RequestID: requestID, SpanID: "aaaaaaaaaaaaaaaa", OperationID: op2,
	}); !errors.Is(err, ErrInvalidQuery) {
		t.Fatalf("cross-span operation filter was accepted: %v", err)
	}
	if _, err := reopened.Get(context.Background(), RequestGetInput{
		RequestID: requestID, SpanID: "aaaaaaaaaaaaaaaa", OperationID: op1,
	}); err != nil {
		t.Fatalf("valid exact stage filter was rejected: %v", err)
	}
}

func TestDiskPressureShedsOptionalEventsWithoutDroppingCriticalResults(t *testing.T) {
	s := &Store{queue: make(chan storeEvent, 2)}
	s.overBudget.Store(true)
	s.Log(logRecord{Time: time.Now(), Event: "lithograph.operation.finished"})
	s.Metric(metricRecord{Time: time.Now()})
	s.SpanStart(spanRecord{SpanID: "aaaaaaaaaaaaaaaa"})
	if s.Dropped() != 3 || len(s.queue) != 0 {
		t.Fatalf("optional stream not shed: dropped=%d queued=%d", s.Dropped(), len(s.queue))
	}
	s.RequestStart(requestRecord{RequestID: "req_" + strings.Repeat("a", 32)})
	s.RequestEnd(requestRecord{RequestID: "req_" + strings.Repeat("a", 32)})
	if len(s.queue) != 2 {
		t.Fatalf("request lifecycle was discarded: %d", len(s.queue))
	}
}
