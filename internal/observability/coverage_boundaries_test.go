package observability

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestDiagnosticReadBudgetCancellationAndUnavailableResults(t *testing.T) {
	s, _ := newPrivateStoreForTest(t)
	defer closeDiagnosticStore(t, s)
	// Exhaust the bounded SQL connection pool. The next query should wait
	// for a connection, not fail immediately with an artificial read limit.
	connections := make([]*sql.Conn, 0, 3)
	for range 3 {
		conn, err := s.db.Conn(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, conn)
		defer conn.Close()
	}
	result := make(chan error, 1)
	go func() {
		_, err := s.List(context.Background(), RequestListInput{})
		result <- err
	}()
	select {
	case err := <-result:
		t.Fatalf("query completed without an available database connection: %v", err)
	case <-time.After(40 * time.Millisecond):
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.List(canceled, RequestListInput{}); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled database wait was not interrupted: %v", err)
	}
	if err := connections[0].Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("queued diagnostic read failed after connection release: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("queued diagnostic read did not finish")
	}
	var offline *Store
	if offline.Dropped() != 0 {
		t.Fatal("nil diagnostic store counted dropped events")
	}
	if err := offline.Close(context.Background()); err != nil {
		t.Fatal(err)
	}
	overview, err := offline.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || overview.Availability != "unavailable" {
		t.Fatalf("offline Overview: %+v %v", overview, err)
	}
	list, err := offline.List(context.Background(), RequestListInput{})
	if err != nil || list.Availability != "unavailable" {
		t.Fatalf("offline List: %+v %v", list, err)
	}
	detail, err := offline.Get(context.Background(), RequestGetInput{RequestID: "req_" + strings.Repeat("a", 32)})
	if err != nil || detail.Availability != "unavailable" {
		t.Fatalf("offline Get: %+v %v", detail, err)
	}
}

func TestConcurrentDiagnosticQueriesUseTheBoundedConnectionPool(t *testing.T) {
	s, _ := newPrivateStoreForTest(t)
	defer closeDiagnosticStore(t, s)
	id := "req_" + strings.Repeat("a", 32)
	if _, err := s.db.Exec("INSERT INTO requests(request_id,run_id,started_at) VALUES(?,?,?)",
		id, "run_test", time.Now().UTC().UnixMilli()); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var workers sync.WaitGroup
	for i := range 24 {
		workers.Add(1)
		go func() {
			defer workers.Done()
			<-start
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			var availability string
			var err error
			switch i % 4 {
			case 0:
				var r OverviewResult
				r, err = s.Overview(ctx, Window{}, Snapshot{})
				availability = r.Availability
			case 1:
				var r RequestListResult
				r, err = s.List(ctx, RequestListInput{})
				availability = r.Availability
			case 2:
				var r RequestGetResult
				r, err = s.Get(ctx, RequestGetInput{RequestID: id})
				availability = r.Availability
			default:
				var r LogListResult
				r, err = s.ListLogs(ctx, LogListInput{})
				availability = r.Availability
			}
			if err != nil || availability != "available" {
				t.Errorf("parallel diagnostic reader %d: availability=%s error=%v", i, availability, err)
			}
		}()
	}
	close(start)
	workers.Wait()
}

func TestDiagnosticEventBoundsAndSafeEmergencyReporting(t *testing.T) {
	queue := make(chan storeEvent, 3)
	s := &Store{queue: queue}
	s.RequestStart(requestRecord{})
	s.RequestEnd(requestRecord{})
	if len(queue) != 0 {
		t.Fatal("unidentified requests were persisted")
	}
	s.Log(logRecord{Fields: strings.Repeat("sensitive", 1000)})
	if got := (<-queue).data.(logRecord).Fields; got != "{}" {
		t.Fatalf("oversized log attributes persisted: %q", got)
	}
	var emergency bytes.Buffer
	reporter := &Store{emergency: &emergency}
	reporter.errorOnce(os.ErrPermission)
	reporter.errorOnce(os.ErrNotExist)
	if emergency.String() != "kgosd: diagnostic storage unavailable (cause_class=permission); business operation unaffected\n" {
		t.Fatalf("storage failure emitted unsafe/repeated data: %q", emergency.String())
	}
	if value := safeJSON(map[string]any{"password": strings.Repeat("x", 5000)}); value != "{}" {
		t.Fatalf("oversized diagnostic JSON was not suppressed: %q", value)
	}
}

func TestDiagnosticFailedBatchAndNegativeSpanDuration(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	now := time.Now().UTC().Add(-time.Minute)
	id := "req_" + strings.Repeat("a", 32)
	spanID := strings.Repeat("b", 16)
	store.RequestStart(requestRecord{Time: now, RunID: "run", RequestID: id, Route: "api"})
	store.SpanStart(spanRecord{TraceID: strings.Repeat("c", 32), SpanID: spanID,
		RequestID: id, Name: "kernel.graph.query", Start: now})
	store.SpanEnd(spanRecord{TraceID: strings.Repeat("c", 32), SpanID: spanID,
		RequestID: id, Name: "kernel.graph.query", Start: now, End: now.Add(-time.Second)})
	closeDiagnosticStore(t, store)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: id})
	if err != nil || len(detail.Spans) != 1 || detail.Spans[0].DurationMS != 0 {
		t.Fatalf("negative span duration was not clamped: %+v %v", detail.Spans, err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	if err := reopened.writeBatch(canceled, []storeEvent{{kind: "system", data: systemRecord{Time: now, RunID: "run", Event: "runtime.started"}}}); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled diagnostic write was accepted: %v", err)
	}
}

func TestDiagnosticMaintenanceEvictsOldRowsWhenStoreAtCapacity(t *testing.T) {
	// A separate sparse sentinel file simulates the physical disk budget
	// without truncating or corrupting an actual diagnostic SQLite database.
	dir := t.TempDir()
	big := filepath.Join(dir, "capacity-sentinel")
	f, err := os.Create(big)
	if err != nil {
		t.Fatal(err)
	}
	if err := f.Truncate(DefaultStoreBytes + 4096); err != nil {
		f.Close()
		t.Fatal(err)
	}
	if err := f.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, statement := range []string{
		"CREATE TABLE requests (started_at INTEGER)",
		"CREATE TABLE spans (started_at INTEGER)",
		"CREATE TABLE log_events (ts INTEGER)",
		"CREATE TABLE metric_buckets (ts INTEGER)",
		"CREATE TABLE system_events (ts INTEGER)",
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}
	now := time.Now().UnixMilli()
	for _, table := range []string{"requests", "spans", "log_events", "metric_buckets", "system_events"} {
		column := "ts"
		if table == "requests" || table == "spans" {
			column = "started_at"
		}
		if _, err := db.Exec("INSERT INTO "+table+"("+column+") VALUES (?)", now); err != nil {
			t.Fatal(err)
		}
	}
	store := &Store{db: db, path: big}
	store.maintain()
	if !store.overBudget.Load() {
		t.Fatal("physical storage budget was ignored")
	}
	for _, table := range []string{"requests", "spans", "log_events", "metric_buckets", "system_events"} {
		var count int
		if err := db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil || count != 0 {
			t.Fatalf("oversized diagnostic storage did not evict %s: %d %v", table, count, err)
		}
	}
}

func TestDiagnosticRotatorClosedAndInvalidOutputDirectory(t *testing.T) {
	if _, err := NewRotatingWriter(t.TempDir(), 0, 2); err == nil {
		t.Fatal("invalid byte budget accepted")
	}
	path := filepath.Join(t.TempDir(), "not-a-directory")
	if err := os.WriteFile(path, []byte("unchanged"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewRotatingWriter(path, 20, 2); err == nil {
		t.Fatal("non-directory accepted as log directory")
	}
	writer, err := NewRotatingWriter(filepath.Join(t.TempDir(), "logs"), 20, 2)
	if err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if _, err := writer.Write([]byte("after-close")); !errors.Is(err, io.ErrClosedPipe) {
		t.Fatalf("closed rotating writer accepted new diagnostics: %v", err)
	}
}
