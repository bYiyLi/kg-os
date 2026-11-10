package observability

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	sqlite3 "github.com/mattn/go-sqlite3"
)

// The diagnostic store is deliberately independent of the business database.
// Everything in it is a disposable, bounded cache, not a durable audit ledger.
const (
	DefaultStoreBytes = 64 << 20
	storeQueueSize    = 1024
	storeCriticalSize = 2048
	storeStageSize    = 256
	storeBatchSize    = 64
	storeRetention    = 24 * time.Hour
)

type storeEvent struct {
	kind string
	data any
}

type logRecord struct {
	Time        time.Time
	Level       string
	Component   string
	Event       string
	RunID       string
	RequestID   string
	OperationID string
	TraceID     string
	SpanID      string
	Fields      string
}

type requestRecord struct {
	Time       time.Time
	RunID      string
	RequestID  string
	TraceID    string
	Route      string
	Surface    string
	Method     string
	Tool       string
	Status     int
	DurationMS int64
	Outcome    string
	ErrorCode  string
}

type spanRecord struct {
	TraceID      string
	SpanID       string
	ParentSpanID string
	RequestID    string
	OperationID  string
	Name         string
	Start        time.Time
	End          time.Time
	Outcome      string
	QueryFamily  string
	DBCallSeq    int64
}

type metricRecord struct {
	Time       time.Time
	HeapBytes  uint64
	RSSBytes   *uint64
	CgroupUsed *uint64
	CgroupMax  *uint64
	CPUPercent *float64
	Goroutines int
	GCPauses   uint64
}

type systemRecord struct {
	Time  time.Time
	RunID string
	Event string
}

// Store owns all mutations through two bounded priority queues and one SQLite writer.
// Queries use the same DB's WAL readers with short timeouts. Write failures do
// not enter the business response or retry an already-performed operation.
type Store struct {
	db             *sql.DB
	path           string
	queue          chan storeEvent
	critical       chan storeEvent
	outcomes       chan storeEvent
	stages         chan storeEvent
	wake           chan struct{}
	stop           chan struct{}
	done           chan struct{}
	stopping       atomic.Bool
	closeOnce      sync.Once
	dropped        atomic.Uint64
	persistedDrops atomic.Uint64
	degraded       atomic.Bool
	overBudget     atomic.Bool
	emergency      io.Writer
	emergencyQueue chan string
	mu             sync.Mutex
	lastError      time.Time
	lastStart      time.Time
}

func OpenStore(dir string, emergency io.Writer) (*Store, error) {
	if dir == "" || !filepath.IsAbs(dir) {
		return nil, errors.New("diagnostic directory must be absolute")
	}
	// The .kgos Instance directory must not redirect observability outside
	// the chosen workspace. Reject that boundary before creating logs/.
	parent := filepath.Dir(dir)
	if parentInfo, err := os.Lstat(parent); err == nil {
		if !parentInfo.IsDir() || parentInfo.Mode()&os.ModeSymlink != 0 {
			return nil, errors.New("unsafe diagnostic Instance directory")
		}
	} else if !errors.Is(err, os.ErrNotExist) {
		return nil, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, fmt.Errorf("create private diagnostic directory: %w", err)
	}
	if parentInfo, err := os.Lstat(parent); err != nil || !parentInfo.IsDir() ||
		parentInfo.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("unsafe diagnostic Instance directory")
	}
	info, err := os.Lstat(dir)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return nil, errors.New("diagnostic directory is not a private real directory")
	}
	if err := os.Chmod(dir, 0o700); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(dir)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	for _, name := range []string{"observability.sqlite", "observability.sqlite-wal", "observability.sqlite-shm"} {
		if fi, statErr := root.Lstat(name); statErr == nil {
			if !fi.Mode().IsRegular() || fi.Mode()&os.ModeSymlink != 0 {
				return nil, errors.New("unsafe diagnostic SQLite target")
			}
		} else if !errors.Is(statErr, os.ErrNotExist) {
			return nil, statErr
		}
	}
	file, err := root.OpenFile("observability.sqlite", os.O_RDWR|os.O_CREATE, 0o600)
	if err != nil {
		return nil, err
	}
	if err := file.Chmod(0o600); err != nil {
		_ = file.Close()
		return nil, err
	}
	_ = file.Close()
	path := filepath.Join(dir, "observability.sqlite")
	// Use a URI encoder rather than concatenating a file: DSN. User-owned
	// absolute workspace paths can contain '#' or '?' and must not be
	// interpreted as SQLite URI fragments or query parameters.
	dsn := (&url.URL{
		Scheme:   "file",
		Path:     filepath.ToSlash(path),
		RawQuery: "_busy_timeout=250&_foreign_keys=on",
	}).String()
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(3)
	db.SetMaxIdleConns(2)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	// auto_vacuum must be selected before tables are created.
	commands := []string{
		"PRAGMA auto_vacuum=INCREMENTAL",
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA busy_timeout=250",
		"PRAGMA temp_store=MEMORY",
		"PRAGMA cache_size=-1024",
		`CREATE TABLE IF NOT EXISTS requests (
			request_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, trace_id TEXT NOT NULL DEFAULT '',
			route TEXT NOT NULL DEFAULT '', surface TEXT NOT NULL DEFAULT '', method TEXT NOT NULL DEFAULT '',
			tool TEXT NOT NULL DEFAULT '', started_at INTEGER NOT NULL, finished_at INTEGER,
			status INTEGER, duration_ms INTEGER, outcome TEXT NOT NULL DEFAULT 'incomplete',
			error_code TEXT NOT NULL DEFAULT '')`,
		"CREATE INDEX IF NOT EXISTS requests_time ON requests(started_at DESC, request_id)",
		"CREATE INDEX IF NOT EXISTS requests_incomplete ON requests(started_at) WHERE finished_at IS NULL",
		`CREATE TABLE IF NOT EXISTS spans (
			span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT NOT NULL DEFAULT '',
			request_id TEXT NOT NULL DEFAULT '', operation_id TEXT NOT NULL DEFAULT '',
			name TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
			duration_ms INTEGER, outcome TEXT NOT NULL DEFAULT 'incomplete',
			query_family TEXT NOT NULL DEFAULT '', db_call_seq INTEGER NOT NULL DEFAULT 0)`,
		"CREATE INDEX IF NOT EXISTS spans_request ON spans(request_id, started_at)",
		"CREATE INDEX IF NOT EXISTS spans_parent ON spans(parent_span_id)",
		"CREATE INDEX IF NOT EXISTS spans_incomplete ON spans(started_at) WHERE finished_at IS NULL",
		`CREATE TABLE IF NOT EXISTS log_events (
			id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, level TEXT NOT NULL, component TEXT NOT NULL,
			event TEXT NOT NULL, run_id TEXT NOT NULL, request_id TEXT NOT NULL DEFAULT '',
			operation_id TEXT NOT NULL DEFAULT '', trace_id TEXT NOT NULL DEFAULT '',
			span_id TEXT NOT NULL DEFAULT '', fields TEXT NOT NULL DEFAULT '{}')`,
		"CREATE INDEX IF NOT EXISTS log_request ON log_events(request_id, id)",
		"CREATE INDEX IF NOT EXISTS log_span ON log_events(span_id, id)",
		"CREATE INDEX IF NOT EXISTS log_time ON log_events(ts)",
		`CREATE TABLE IF NOT EXISTS metric_buckets (
			ts INTEGER PRIMARY KEY, heap_bytes INTEGER NOT NULL, rss_bytes INTEGER,
			cgroup_used_bytes INTEGER, cgroup_max_bytes INTEGER, cpu_percent REAL,
			goroutines INTEGER NOT NULL, gc_pauses INTEGER NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS system_events (
			id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, run_id TEXT NOT NULL, event TEXT NOT NULL)`,
		"CREATE INDEX IF NOT EXISTS system_time ON system_events(ts DESC)",
		// Loss buckets survive restarts but expire with the 24-hour history.
		// They report observed gaps without becoming an audit ledger.
		`CREATE TABLE IF NOT EXISTS loss_buckets (
			ts INTEGER PRIMARY KEY, dropped INTEGER NOT NULL)`,
	}
	for _, statement := range commands {
		if _, err := db.ExecContext(ctx, statement); err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("initialize diagnostic schema: %w", err)
		}
	}
	// Upgrade previously persisted diagnostic cache without discarding the
	// unfinished spans needed for a restart investigation.
	for _, column := range []struct{ name, ddl string }{
		{"query_family", "ALTER TABLE spans ADD COLUMN query_family TEXT NOT NULL DEFAULT ''"},
		{"db_call_seq", "ALTER TABLE spans ADD COLUMN db_call_seq INTEGER NOT NULL DEFAULT 0"},
	} {
		var found string
		err := db.QueryRowContext(ctx, "SELECT name FROM pragma_table_info('spans') WHERE name=?", column.name).Scan(&found)
		if errors.Is(err, sql.ErrNoRows) {
			_, err = db.ExecContext(ctx, column.ddl)
		}
		if err != nil {
			_ = db.Close()
			return nil, fmt.Errorf("migrate diagnostic span schema: %w", err)
		}
	}
	for _, name := range []string{"observability.sqlite-wal", "observability.sqlite-shm"} {
		if fi, err := root.Lstat(name); err == nil && fi.Mode().IsRegular() {
			_ = os.Chmod(filepath.Join(dir, name), 0o600)
		}
	}
	s := &Store{
		db: db, path: path,
		queue:    make(chan storeEvent, storeQueueSize),
		critical: make(chan storeEvent, storeCriticalSize),
		outcomes: make(chan storeEvent, 512),
		stages:   make(chan storeEvent, storeStageSize),
		wake:     make(chan struct{}, 1),
		stop:     make(chan struct{}), done: make(chan struct{}), emergency: emergency,
	}
	if emergency != nil {
		s.emergencyQueue = make(chan string, 32)
		go s.runEmergency()
	}
	go s.run()
	return s, nil
}

func (s *Store) enqueue(event storeEvent) {
	if s == nil || s.stopping.Load() {
		return
	}
	if s.overBudget.Load() {
		// Keep the small request/result and lifecycle evidence where feasible,
		// but shed high-frequency diagnostic traffic during disk pressure.
		switch event.kind {
		case "log", "stage_log", "span_start", "span_end", "metric":
			s.dropped.Add(1)
			return
		}
	}
	target := s.queue
	// Protect the identity and actual completion outcome before verbose
	// logs/spans/metrics; a saturated optional queue must not erase a real
	// completed request. Both queues remain nonblocking and bounded.
	switch event.kind {
	case "request_end", "tool_end":
		if s.outcomes != nil {
			target = s.outcomes
		} else if s.critical != nil {
			target = s.critical
		}
	case "stage_log":
		if s.stages != nil {
			target = s.stages
		}
	case "request_start", "tool_start", "system", "required_log":
		if s.critical != nil {
			target = s.critical
		}
	}
	select {
	case target <- event:
		s.notify()
	default:
		if event.kind == "stage_log" && s.stages != nil {
			// Under pressure keep the most recent checkpoint rather than a
			// full queue of stale stages; the evicted evidence is counted.
			select {
			case <-s.stages:
				s.dropped.Add(1)
			default:
			}
			select {
			case target <- event:
				s.notify()
				return
			default:
			}
		}
		s.dropped.Add(1)
	}
}

func (s *Store) notify() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

// nextEvent drains one queued record in priority order. A single coalesced
// wake signal lets the writer sleep without duplicating queue selection in
// both its normal and shutdown paths.
func (s *Store) nextEvent() (storeEvent, bool) {
	select {
	case event := <-s.outcomes:
		return event, true
	default:
	}
	select {
	case event := <-s.critical:
		return event, true
	default:
	}
	select {
	case event := <-s.stages:
		return event, true
	default:
	}
	select {
	case event := <-s.queue:
		return event, true
	default:
		return storeEvent{}, false
	}
}

func (s *Store) Dropped() uint64 {
	if s == nil {
		return 0
	}
	return s.dropped.Load()
}

func (s *Store) Available() bool {
	return s != nil && !s.degraded.Load() && !s.stopping.Load()
}

func (s *Store) Log(e logRecord) {
	if len(e.Fields) > 4096 {
		e.Fields = "{}"
	}
	kind := "log"
	if e.Event == "business.operation.stage" {
		kind = "stage_log"
	} else if requiredDiagnosticEvent(e.Event) {
		kind = "required_log"
	}
	s.enqueue(storeEvent{kind: kind, data: e})
}

func (s *Store) RequestStart(e requestRecord) {
	if e.RequestID == "" {
		return
	}
	s.enqueue(storeEvent{kind: "request_start", data: e})
}

func (s *Store) RequestEnd(e requestRecord) {
	if e.RequestID == "" {
		return
	}
	s.enqueue(storeEvent{kind: "request_end", data: e})
}

func (s *Store) ToolEnd(e requestRecord) {
	if e.RequestID != "" && e.Tool != "" {
		if e.Time.IsZero() {
			e.Time = time.Now()
		}
		s.enqueue(storeEvent{kind: "tool_end", data: e})
	}
}

func (s *Store) ToolStart(e requestRecord) {
	if e.RequestID != "" && e.Tool != "" {
		if e.Time.IsZero() {
			e.Time = time.Now()
		}
		s.enqueue(storeEvent{kind: "tool_start", data: e})
	}
}

func (s *Store) SpanStart(e spanRecord) {
	if e.SpanID != "" {
		s.enqueue(storeEvent{kind: "span_start", data: e})
	}
}

func (s *Store) SpanEnd(e spanRecord) {
	if e.SpanID != "" {
		s.enqueue(storeEvent{kind: "span_end", data: e})
	}
}

func (s *Store) Metric(e metricRecord) { s.enqueue(storeEvent{kind: "metric", data: e}) }
func (s *Store) System(e systemRecord) { s.enqueue(storeEvent{kind: "system", data: e}) }

func (s *Store) run() {
	defer close(s.done)
	tick := time.NewTicker(125 * time.Millisecond)
	defer tick.Stop()
	housekeep := time.NewTicker(30 * time.Second)
	defer housekeep.Stop()
	batch := make([]storeEvent, 0, storeBatchSize)
	lastCapacityCheck := time.Now()
	// Reconcile stale diagnostic data on startup without delaying business
	// initialization. The maintenance loop owns the SQLite writer.
	s.maintain()
	flush := func() {
		if len(batch) == 0 {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		err := s.writeBatch(ctx, batch)
		cancel()
		if err != nil {
			s.dropped.Add(uint64(len(batch)))
			s.degraded.Store(true)
			s.errorOnce(err)
		} else {
			s.degraded.Store(false)
		}
		batch = batch[:0]
		if time.Since(lastCapacityCheck) >= time.Second {
			s.overBudget.Store(s.fileBytes() > DefaultStoreBytes)
			lastCapacityCheck = time.Now()
		}
	}
	appendEvent := func(event storeEvent) {
		batch = append(batch, event)
		if len(batch) >= storeBatchSize {
			flush()
		}
	}
	for {
		if event, ok := s.nextEvent(); ok {
			appendEvent(event)
			continue
		}
		select {
		case <-s.wake:
		case <-tick.C:
			flush()
		case <-housekeep.C:
			flush()
			s.maintain()
		case <-s.stop:
			for {
				event, ok := s.nextEvent()
				if !ok {
					flush()
					if s.dropped.Load() > s.persistedDrops.Load() {
						ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
						if err := s.writeBatch(ctx, nil); err != nil {
							s.degraded.Store(true)
							s.errorOnce(err)
						}
						cancel()
					}
					return
				}
				appendEvent(event)
			}
		}
	}
}

// StorageCause exposes only fixed classes derived from structured errors,
// never SQLite or filesystem error messages that may contain private paths.
func StorageCause(err error) string {
	switch {
	case err == nil:
		return "none"
	case errors.Is(err, context.Canceled):
		return "cancelled"
	case errors.Is(err, context.DeadlineExceeded):
		return "deadline_exceeded"
	case errors.Is(err, os.ErrPermission):
		return "permission"
	case errors.Is(err, os.ErrNotExist):
		return "not_found"
	}
	var sqlErr sqlite3.Error
	if errors.As(err, &sqlErr) {
		switch sqlErr.Code {
		case sqlite3.ErrBusy, sqlite3.ErrLocked:
			return "busy"
		case sqlite3.ErrFull:
			return "disk_full"
		case sqlite3.ErrReadonly, sqlite3.ErrPerm:
			return "permission"
		case sqlite3.ErrCorrupt, sqlite3.ErrNotADB:
			return "corrupt"
		case sqlite3.ErrCantOpen:
			return "open_failed"
		case sqlite3.ErrIoErr:
			return "io_error"
		}
	}
	return "storage_error"
}

// No raw underlying error text is emitted to stderr; it can contain secrets.
// This worker is deliberately independent of the business and SQLite writers.
// A blocked Docker stderr pipe can stall this one goroutine, but can never
// backpressure Kernel operations or allocate an unbounded backlog.
func (s *Store) runEmergency() {
	for {
		select {
		case <-s.stop:
			return
		case line := <-s.emergencyQueue:
			_, _ = io.WriteString(s.emergency, line)
		}
	}
}

func (s *Store) emergencyLine(line string) {
	if s == nil || s.emergencyQueue == nil {
		return
	}
	select {
	case s.emergencyQueue <- line:
	default:
		s.dropped.Add(1)
	}
}

func diagnosticID(id, prefix string) bool {
	if len(id) != len(prefix)+32 || id[:len(prefix)] != prefix {
		return false
	}
	for _, c := range id[len(prefix):] {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// A bounded, rate-limited, one-line hint for Docker operators. Only
// server-generated opaque IDs and fixed enums are ever formatted.
func (s *Store) EmergencyStart(run, request, operation, tool, name string) {
	if s == nil || s.emergencyQueue == nil ||
		!diagnosticID(run, "run_") || !diagnosticID(operation, "op_") ||
		(request != "" && !diagnosticID(request, "req_")) {
		return
	}
	if name != "object.patch" && name != "ontology.patch" {
		return
	}
	if safeToolName(tool) == "" {
		tool = "none"
	}
	s.mu.Lock()
	allowed := time.Since(s.lastStart) >= 100*time.Millisecond
	if allowed {
		s.lastStart = time.Now()
	}
	s.mu.Unlock()
	if !allowed {
		return
	}
	s.emergencyLine(fmt.Sprintf("kgosd: write started run_id=%s request_id=%s operation_id=%s tool=%s operation=%s\n",
		run, request, operation, tool, name))
}

func (s *Store) errorOnce(err error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.emergency != nil && time.Since(s.lastError) >= time.Minute {
		s.lastError = time.Now()
		line := fmt.Sprintf(
			"kgosd: diagnostic storage unavailable (cause_class=%s); business operation unaffected\n",
			StorageCause(err))
		if s.emergencyQueue != nil {
			s.emergencyLine(line)
		} else {
			// Store's normal constructor always has an emergency worker.
			// The synchronous path preserves the pre-existing test-only
			// standalone reporter behavior, never a business request path.
			_, _ = io.WriteString(s.emergency, line)
		}
	}
}

func (s *Store) writeBatch(ctx context.Context, batch []storeEvent) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, event := range batch {
		switch event.kind {
		case "log", "required_log", "stage_log":
			e := event.data.(logRecord)
			_, err = tx.ExecContext(ctx, `INSERT INTO log_events(ts,level,component,event,run_id,request_id,operation_id,trace_id,span_id,fields) VALUES(?,?,?,?,?,?,?,?,?,?)`,
				e.Time.UnixMilli(), e.Level, e.Component, e.Event, e.RunID, e.RequestID, e.OperationID, e.TraceID, e.SpanID, e.Fields)
		case "request_start":
			e := event.data.(requestRecord)
			_, err = tx.ExecContext(ctx, `INSERT INTO requests(request_id,run_id,trace_id,route,surface,method,started_at) VALUES(?,?,?,?,?,?,?)
				ON CONFLICT(request_id) DO UPDATE SET
				trace_id=excluded.trace_id,route=excluded.route,method=excluded.method,
				run_id=CASE WHEN requests.run_id='' THEN excluded.run_id ELSE requests.run_id END,
				started_at=MIN(requests.started_at,excluded.started_at),
				surface=CASE WHEN requests.finished_at IS NULL AND requests.surface<> 'mcp' THEN excluded.surface ELSE requests.surface END`,
				e.RequestID, e.RunID, e.TraceID, e.Route, e.Surface, e.Method, e.Time.UnixMilli())
		case "tool_start":
			e := event.data.(requestRecord)
			_, err = tx.ExecContext(ctx, `INSERT INTO requests(request_id,run_id,trace_id,route,surface,method,tool,started_at)
				VALUES(?,?,?,'mcp','mcp','POST',?,?)
				ON CONFLICT(request_id) DO UPDATE SET
				tool=CASE WHEN requests.tool='' THEN excluded.tool ELSE requests.tool END,
				trace_id=CASE WHEN requests.trace_id='' THEN excluded.trace_id ELSE requests.trace_id END,
				surface=CASE WHEN requests.finished_at IS NULL THEN 'mcp' ELSE requests.surface END,
				started_at=MIN(requests.started_at,excluded.started_at)`,
				e.RequestID, e.RunID, e.TraceID, e.Tool, e.Time.UnixMilli())
		case "request_end":
			e := event.data.(requestRecord)
			_, err = tx.ExecContext(ctx, `INSERT INTO requests(request_id,run_id,trace_id,route,surface,method,started_at,finished_at,status,duration_ms,outcome,error_code)
				VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(request_id) DO UPDATE SET finished_at=excluded.finished_at,status=excluded.status,duration_ms=excluded.duration_ms,
				surface=excluded.surface,
				outcome=CASE WHEN requests.tool<>'' THEN requests.outcome ELSE excluded.outcome END,
				error_code=CASE WHEN requests.tool<>'' THEN requests.error_code ELSE excluded.error_code END`,
				e.RequestID, e.RunID, e.TraceID, e.Route, e.Surface, e.Method, e.Time.Add(-time.Duration(e.DurationMS)*time.Millisecond).UnixMilli(), e.Time.UnixMilli(), e.Status, e.DurationMS, e.Outcome, e.ErrorCode)
		case "tool_end":
			e := event.data.(requestRecord)
			// A single MCP transport request can execute multiple tools. A
			// later successful tool cannot erase an earlier real tool error.
			_, err = tx.ExecContext(ctx, `INSERT INTO requests(request_id,run_id,trace_id,route,surface,method,tool,started_at,outcome,error_code)
				VALUES(?,?,?,'mcp','mcp','POST',?,?,?,?)
				ON CONFLICT(request_id) DO UPDATE SET
				tool=CASE WHEN requests.tool='' THEN excluded.tool ELSE requests.tool END,
				outcome=CASE WHEN requests.outcome='error' THEN 'error' ELSE excluded.outcome END,
				error_code=CASE WHEN requests.outcome='error' THEN requests.error_code ELSE excluded.error_code END`,
				e.RequestID, e.RunID, e.TraceID, e.Tool, e.Time.UnixMilli(), e.Outcome, e.ErrorCode)
		case "span_start":
			e := event.data.(spanRecord)
			_, err = tx.ExecContext(ctx, `INSERT INTO spans(span_id,trace_id,parent_span_id,request_id,operation_id,name,started_at,query_family,db_call_seq)
				VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(span_id) DO UPDATE SET
				request_id=CASE WHEN spans.request_id='' THEN excluded.request_id ELSE spans.request_id END,
				operation_id=CASE WHEN spans.operation_id='' THEN excluded.operation_id ELSE spans.operation_id END,
				query_family=CASE WHEN spans.query_family='' THEN excluded.query_family ELSE spans.query_family END,
				db_call_seq=CASE WHEN spans.db_call_seq=0 THEN excluded.db_call_seq ELSE spans.db_call_seq END`,
				e.SpanID, e.TraceID, e.ParentSpanID, e.RequestID, e.OperationID, e.Name, e.Start.UnixMilli(), e.QueryFamily, e.DBCallSeq)
		case "span_end":
			e := event.data.(spanRecord)
			duration := e.End.Sub(e.Start).Milliseconds()
			if duration < 0 {
				duration = 0
			}
			_, err = tx.ExecContext(ctx, `INSERT INTO spans(span_id,trace_id,parent_span_id,request_id,operation_id,name,started_at,finished_at,duration_ms,outcome,query_family,db_call_seq)
				VALUES(?,?,?,?,?,?,?,?,?,?,?,?)
				ON CONFLICT(span_id) DO UPDATE SET finished_at=excluded.finished_at,duration_ms=excluded.duration_ms,
				outcome=excluded.outcome,query_family=excluded.query_family,db_call_seq=excluded.db_call_seq`,
				e.SpanID, e.TraceID, e.ParentSpanID, e.RequestID, e.OperationID, e.Name, e.Start.UnixMilli(), e.End.UnixMilli(), duration, e.Outcome, e.QueryFamily, e.DBCallSeq)
		case "metric":
			e := event.data.(metricRecord)
			_, err = tx.ExecContext(ctx, `INSERT OR REPLACE INTO metric_buckets(ts,heap_bytes,rss_bytes,cgroup_used_bytes,cgroup_max_bytes,cpu_percent,goroutines,gc_pauses)
				VALUES(?,?,?,?,?,?,?,?)`,
				e.Time.UnixMilli(), e.HeapBytes, e.RSSBytes, e.CgroupUsed, e.CgroupMax, e.CPUPercent, e.Goroutines, e.GCPauses)
		case "system":
			e := event.data.(systemRecord)
			_, err = tx.ExecContext(ctx, "INSERT INTO system_events(ts,run_id,event) VALUES(?,?,?)", e.Time.UnixMilli(), e.RunID, e.Event)
		}
		if err != nil {
			return err
		}
	}
	// A per-minute loss bucket survives normal restarts and expires alongside
	// its real observation window. One extra row per saturated minute, not
	// one row per failed event or a new unbounded log source.
	observed := s.dropped.Load()
	persisted := s.persistedDrops.Load()
	if observed > persisted {
		delta := observed - persisted
		minute := (time.Now().UTC().UnixMilli() / 60000) * 60000
		_, err = tx.ExecContext(ctx, `INSERT INTO loss_buckets(ts,dropped) VALUES(?,?)
			ON CONFLICT(ts) DO UPDATE SET dropped=dropped+excluded.dropped`, minute, int64(delta))
		if err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	if observed > persisted {
		s.persistedDrops.Store(observed)
	}
	return nil
}

func (s *Store) maintain() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	cutoff := time.Now().Add(-storeRetention).UnixMilli()
	for _, table := range []struct{ name, column string }{
		{"requests", "started_at"}, {"spans", "started_at"}, {"log_events", "ts"},
		{"metric_buckets", "ts"}, {"system_events", "ts"},
		{"loss_buckets", "ts"},
	} {
		_, _ = s.db.ExecContext(ctx, "DELETE FROM "+table.name+" WHERE "+table.column+" < ? AND rowid IN (SELECT rowid FROM "+table.name+" WHERE "+table.column+" < ? LIMIT 256)", cutoff, cutoff)
	}
	if s.fileBytes() > DefaultStoreBytes {
		// Bounded oldest-first eviction. SQLite can retain allocated pages,
		// so this is an engineering budget, not an absolute physical cap.
		// Producers shed optional records while storage is under pressure.
		s.overBudget.Store(true)
		for cycle := 0; cycle < 16 && ctx.Err() == nil; cycle++ {
			affected := int64(0)
			for _, table := range []struct{ name, column string }{
				{"log_events", "ts"}, {"spans", "started_at"}, {"requests", "started_at"},
				{"metric_buckets", "ts"}, {"system_events", "ts"},
				{"loss_buckets", "ts"},
			} {
				result, err := s.db.ExecContext(ctx,
					"DELETE FROM "+table.name+" WHERE rowid IN (SELECT rowid FROM "+table.name+" ORDER BY "+table.column+" ASC LIMIT 512)")
				if err != nil {
					break
				}
				if count, err := result.RowsAffected(); err == nil {
					affected += count
				}
			}
			if affected == 0 {
				break
			}
		}
	}
	_, _ = s.db.ExecContext(ctx, "PRAGMA incremental_vacuum(256)")
	_, _ = s.db.ExecContext(ctx, "PRAGMA wal_checkpoint(PASSIVE)")
	s.overBudget.Store(s.fileBytes() > DefaultStoreBytes)
}

func (s *Store) fileBytes() int64 {
	var size int64
	for _, path := range []string{s.path, s.path + "-wal", s.path + "-shm"} {
		if info, err := os.Stat(path); err == nil {
			size += info.Size()
		}
	}
	return size
}

func (s *Store) Close(ctx context.Context) error {
	if s == nil {
		return nil
	}
	s.closeOnce.Do(func() {
		s.stopping.Store(true)
		close(s.stop)
	})
	select {
	case <-s.done:
		return s.db.Close()
	case <-ctx.Done():
		return ctx.Err()
	}
}

func safeJSON(fields map[string]any) string {
	encoded, err := json.Marshal(fields)
	if err != nil || len(encoded) > 4096 {
		return "{}"
	}
	return string(encoded)
}
