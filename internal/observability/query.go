package observability

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var ErrInvalidQuery = errors.New("invalid observability query")

var (
	requestPattern   = regexp.MustCompile(`^req_[0-9a-f]{32}$`)
	operationPattern = regexp.MustCompile(`^op_[0-9a-f]{32}$`)
	spanPattern      = regexp.MustCompile(`^[0-9a-f]{16}$`)
)

type Window struct {
	From string `json:"from,omitempty"`
	To   string `json:"to,omitempty"`
}

type Coverage struct {
	From      string `json:"from,omitempty"`
	To        string `json:"to,omitempty"`
	Dropped   uint64 `json:"dropped"`
	Truncated bool   `json:"truncated"`
}

type RequestSummary struct {
	RequestID  string `json:"request_id"`
	RunID      string `json:"run_id"`
	TraceID    string `json:"trace_id,omitempty"`
	Route      string `json:"route"`
	Surface    string `json:"surface"`
	Method     string `json:"method"`
	Tool       string `json:"tool,omitempty"`
	StartedAt  string `json:"started_at"`
	FinishedAt string `json:"finished_at,omitempty"`
	Status     int    `json:"status,omitempty"`
	DurationMS int64  `json:"duration_ms,omitempty"`
	Outcome    string `json:"outcome"`
	ErrorCode  string `json:"error_code,omitempty"`
}

type SpanSummary struct {
	TraceID      string `json:"trace_id"`
	SpanID       string `json:"span_id"`
	ParentSpanID string `json:"parent_span_id,omitempty"`
	RequestID    string `json:"request_id,omitempty"`
	OperationID  string `json:"operation_id,omitempty"`
	Name         string `json:"name"`
	StartedAt    string `json:"started_at"`
	FinishedAt   string `json:"finished_at,omitempty"`
	DurationMS   int64  `json:"duration_ms,omitempty"`
	Outcome      string `json:"outcome"`
	QueryFamily  string `json:"query_family,omitempty"`
	DBCallSeq    int64  `json:"db_call_seq,omitempty"`
}

type LogSummary struct {
	ID          int64          `json:"id"`
	Time        string         `json:"time"`
	Level       string         `json:"level"`
	Component   string         `json:"component"`
	Event       string         `json:"event"`
	RequestID   string         `json:"request_id,omitempty"`
	OperationID string         `json:"operation_id,omitempty"`
	SpanID      string         `json:"span_id,omitempty"`
	Fields      map[string]any `json:"fields"`
}

// LogListInput queries a bounded, authenticated history across requests.
// It does not infer a parent Request from timestamps or expose raw files.
type LogListInput struct {
	Window
	Cursor string `json:"cursor,omitempty"`
	Limit  int    `json:"limit,omitempty"`
	Level  string `json:"level,omitempty"`
}

type LogListResult struct {
	Availability string       `json:"availability"`
	Coverage     Coverage     `json:"coverage"`
	Items        []LogSummary `json:"items"`
	NextCursor   string       `json:"next_cursor,omitempty"`
}

type TrendPoint struct {
	Time    string `json:"time"`
	Total   int64  `json:"total"`
	Success int64  `json:"success"`
	Errors  int64  `json:"errors"`
	Slow    int64  `json:"slow"`
}

type ResourcePoint struct {
	Time       string   `json:"time"`
	HeapBytes  uint64   `json:"heap_bytes"`
	RSSBytes   *uint64  `json:"rss_bytes"`
	CgroupUsed *uint64  `json:"cgroup_used_bytes"`
	CgroupMax  *uint64  `json:"cgroup_max_bytes"`
	CPUPercent *float64 `json:"cpu_percent"`
	Goroutines int      `json:"goroutines"`
	GCPausesNS uint64   `json:"gc_pauses_ns"`
}

type SystemEvent struct {
	Time  string `json:"time"`
	RunID string `json:"run_id"`
	Event string `json:"event"`
}

type OverviewResult struct {
	Availability string          `json:"availability"`
	Version      string          `json:"version"`
	Coverage     Coverage        `json:"coverage"`
	Total        int64           `json:"total"`
	Success      int64           `json:"success"`
	Errors       int64           `json:"errors"`
	Slow         int64           `json:"slow"`
	Incomplete   int64           `json:"incomplete"`
	Trend        []TrendPoint    `json:"trend"`
	Resources    []ResourcePoint `json:"resources"`
	Events       []SystemEvent   `json:"events"`
	Snapshot     Snapshot        `json:"snapshot"`
}

type RequestListInput struct {
	Window
	Cursor  string `json:"cursor,omitempty"`
	Limit   int    `json:"limit,omitempty"`
	Route   string `json:"route,omitempty"`
	Outcome string `json:"outcome,omitempty"`
	Slow    bool   `json:"slow,omitempty"`
}

type RequestListResult struct {
	Availability string           `json:"availability"`
	Coverage     Coverage         `json:"coverage"`
	Items        []RequestSummary `json:"items"`
	NextCursor   string           `json:"next_cursor,omitempty"`
}

type RequestGetInput struct {
	RequestID   string `json:"request_id"`
	OperationID string `json:"operation_id,omitempty"`
	SpanID      string `json:"span_id,omitempty"`
	Cursor      string `json:"cursor,omitempty"`
	Limit       int    `json:"limit,omitempty"`
}

type RequestGetResult struct {
	Availability string               `json:"availability"`
	Coverage     Coverage             `json:"coverage"`
	Request      RequestSummary       `json:"request"`
	Spans        []SpanSummary        `json:"spans"`
	Logs         []LogSummary         `json:"logs"`
	LastStages   []OperationLastStage `json:"last_stages,omitempty"`
	NextCursor   string               `json:"next_cursor,omitempty"`
}

// LastStages reports the latest *persisted* evidence for each operation, not
// the latest executed instruction nor the cause of a crash.
type OperationLastStage struct {
	OperationID string `json:"operation_id"`
	Stage       string `json:"stage"`
	ObservedAt  string `json:"observed_at"`
}

func parseWindow(input Window) (int64, int64, error) {
	to := time.Now().UTC()
	from := to.Add(-24 * time.Hour)
	if input.To != "" {
		parsed, err := time.Parse(time.RFC3339, input.To)
		if err != nil {
			return 0, 0, ErrInvalidQuery
		}
		to = parsed
	}
	if input.From != "" {
		parsed, err := time.Parse(time.RFC3339, input.From)
		if err != nil {
			return 0, 0, ErrInvalidQuery
		}
		from = parsed
	} else if input.To != "" {
		from = to.Add(-24 * time.Hour)
	}
	if !to.After(from) || to.Sub(from) > 24*time.Hour || to.After(time.Now().Add(time.Minute)) {
		return 0, 0, ErrInvalidQuery
	}
	return from.UnixMilli(), to.UnixMilli(), nil
}

func timeISO(ms int64) string {
	return time.UnixMilli(ms).UTC().Format(time.RFC3339Nano)
}

func pageLimit(n int) (int, error) {
	if n == 0 {
		return 50, nil
	}
	if n < 1 || n > 100 {
		return 0, ErrInvalidQuery
	}
	return n, nil
}

func (s *Store) coverage(ctx context.Context) Coverage {
	result := Coverage{}
	var persisted uint64
	_ = s.db.QueryRowContext(ctx, "SELECT COALESCE(SUM(dropped), 0) FROM loss_buckets WHERE ts >= ?",
		time.Now().UTC().Add(-storeRetention).UnixMilli()).Scan(&persisted)
	// The writer publishes the acknowledged drop count only after committing
	// the loss bucket. Count uncommitted losses once, not both here and in the
	// persisted history; this also retains prior-run gaps after a restart.
	result.Dropped = persisted
	if pending, acknowledged := s.Dropped(), s.persistedDrops.Load(); pending > acknowledged {
		result.Dropped += pending - acknowledged
	}
	var oldest, newest sql.NullInt64
	_ = s.db.QueryRowContext(ctx, `SELECT MIN(ts),MAX(ts) FROM (
		SELECT started_at AS ts FROM requests UNION ALL SELECT ts FROM log_events
		UNION ALL SELECT ts FROM metric_buckets UNION ALL SELECT ts FROM system_events)`).Scan(&oldest, &newest)
	if oldest.Valid {
		result.From = timeISO(oldest.Int64)
		result.To = timeISO(newest.Int64)
	}
	result.Truncated = result.Dropped > 0
	return result
}

// SQLite's bounded connection pool queues readers; the deadline also bounds
// time spent waiting for a connection under concurrent diagnostic requests.
func (s *Store) readContext(ctx context.Context, timeout time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(ctx, timeout)
}

func (s *Store) Overview(ctx context.Context, input Window, snapshot Snapshot) (OverviewResult, error) {
	result := OverviewResult{
		Availability: "unavailable", Trend: []TrendPoint{}, Resources: []ResourcePoint{},
		Events: []SystemEvent{}, Snapshot: snapshot,
	}
	from, to, err := parseWindow(input)
	if err != nil {
		return result, err
	}
	if s == nil || !s.Available() {
		return result, nil
	}
	readCtx, finishRead := s.readContext(ctx, 3*time.Second)
	defer finishRead()
	ctx = readCtx
	result.Availability = "available"
	result.Coverage = s.coverage(ctx)
	err = s.db.QueryRowContext(ctx, `SELECT COUNT(*),
		COALESCE(SUM(CASE WHEN outcome='succeeded' THEN 1 ELSE 0 END),0),
		COALESCE(SUM(CASE WHEN outcome='error' THEN 1 ELSE 0 END),0),
		COALESCE(SUM(CASE WHEN finished_at IS NOT NULL AND duration_ms > 2000 THEN 1 ELSE 0 END),0),
		COALESCE(SUM(CASE WHEN outcome='incomplete' THEN 1 ELSE 0 END),0)
		FROM requests WHERE started_at BETWEEN ? AND ?`, from, to).Scan(
		&result.Total, &result.Success, &result.Errors, &result.Slow, &result.Incomplete)
	if err != nil {
		return result, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT (started_at/60000)*60000,COUNT(*),
		SUM(CASE WHEN outcome='succeeded' THEN 1 ELSE 0 END),
		SUM(CASE WHEN outcome='error' THEN 1 ELSE 0 END),
		SUM(CASE WHEN finished_at IS NOT NULL AND duration_ms > 2000 THEN 1 ELSE 0 END)
		FROM requests WHERE started_at BETWEEN ? AND ?
		GROUP BY (started_at/60000) ORDER BY 1 ASC LIMIT 1441`, from, to)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var ms int64
		var point TrendPoint
		if scanErr := rows.Scan(&ms, &point.Total, &point.Success, &point.Errors, &point.Slow); scanErr != nil {
			_ = rows.Close()
			return result, scanErr
		}
		point.Time = timeISO(ms)
		result.Trend = append(result.Trend, point)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return result, err
	}
	_ = rows.Close()
	// A 24-hour window contains up to 5,760 samples at the 15-second
	// sampling cadence. Read one *real* sample per five-minute bucket,
	// rather than accidentally limiting history to the newest 100 minutes.
	rows, err = s.db.QueryContext(ctx, `SELECT m.ts,m.heap_bytes,m.rss_bytes,m.cgroup_used_bytes,
		m.cgroup_max_bytes,m.cpu_percent,m.goroutines,m.gc_pauses
		FROM metric_buckets AS m JOIN (
			SELECT MAX(ts) AS ts FROM metric_buckets
			WHERE ts BETWEEN ? AND ? GROUP BY ts / 300000
		) AS sample ON sample.ts=m.ts
		ORDER BY m.ts ASC LIMIT 400`, from, to)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var ms, heap, pauses int64
		var r, used, max sql.NullInt64
		var cpu sql.NullFloat64
		var point ResourcePoint
		if scanErr := rows.Scan(&ms, &heap, &r, &used, &max, &cpu, &point.Goroutines, &pauses); scanErr != nil {
			_ = rows.Close()
			return result, scanErr
		}
		point.Time, point.HeapBytes, point.GCPausesNS = timeISO(ms), uint64(heap), uint64(pauses)
		if r.Valid {
			val := uint64(r.Int64)
			point.RSSBytes = &val
		}
		if used.Valid {
			val := uint64(used.Int64)
			point.CgroupUsed = &val
		}
		if max.Valid {
			val := uint64(max.Int64)
			point.CgroupMax = &val
		}
		if cpu.Valid {
			val := cpu.Float64
			point.CPUPercent = &val
		}
		result.Resources = append(result.Resources, point)
	}
	_ = rows.Close()
	rows, err = s.db.QueryContext(ctx,
		"SELECT ts,run_id,event FROM system_events WHERE ts BETWEEN ? AND ? ORDER BY ts DESC LIMIT 50", from, to)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var ms int64
		var e SystemEvent
		if scanErr := rows.Scan(&ms, &e.RunID, &e.Event); scanErr != nil {
			_ = rows.Close()
			return result, scanErr
		}
		e.Time = timeISO(ms)
		result.Events = append(result.Events, e)
	}
	err = rows.Err()
	_ = rows.Close()
	return result, err
}

func (s *Store) List(ctx context.Context, input RequestListInput) (RequestListResult, error) {
	result := RequestListResult{Availability: "unavailable", Items: []RequestSummary{}}
	from, to, err := parseWindow(input.Window)
	if err != nil {
		return result, err
	}
	limit, err := pageLimit(input.Limit)
	if err != nil {
		return result, err
	}
	if input.Route != "" && input.Route != "api" && input.Route != "mcp" && input.Route != "web_auth" && input.Route != "oauth" {
		return result, ErrInvalidQuery
	}
	if input.Outcome != "" && input.Outcome != "succeeded" && input.Outcome != "error" && input.Outcome != "incomplete" {
		return result, ErrInvalidQuery
	}
	cursorTime := to + 1
	cursorID := ""
	if input.Cursor != "" {
		pair := strings.Split(input.Cursor, ":")
		if len(pair) != 2 || !requestPattern.MatchString(pair[1]) {
			return result, ErrInvalidQuery
		}
		cursorTime, err = strconv.ParseInt(pair[0], 10, 64)
		if err != nil || cursorTime > to || cursorTime < from {
			return result, ErrInvalidQuery
		}
		cursorID = pair[1]
	}
	if s == nil || !s.Available() {
		return result, nil
	}
	readCtx, finishRead := s.readContext(ctx, 2*time.Second)
	defer finishRead()
	ctx = readCtx
	result.Availability = "available"
	result.Coverage = s.coverage(ctx)
	query := `SELECT request_id,run_id,trace_id,route,surface,method,tool,started_at,finished_at,
		status,duration_ms,outcome,error_code FROM requests
		WHERE started_at BETWEEN ? AND ? AND (started_at < ? OR (started_at=? AND request_id < ?))`
	args := []any{from, to, cursorTime, cursorTime, cursorID}
	if input.Route != "" {
		query += " AND route=?"
		args = append(args, input.Route)
	}
	if input.Outcome != "" {
		query += " AND outcome=?"
		args = append(args, input.Outcome)
	}
	if input.Slow {
		query += " AND finished_at IS NOT NULL AND duration_ms>2000"
	}
	query += " ORDER BY started_at DESC, request_id DESC LIMIT ?"
	args = append(args, limit+1)
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		item, scanErr := scanRequest(rows)
		if scanErr != nil {
			return result, scanErr
		}
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if len(result.Items) > limit {
		result.Items = result.Items[:limit]
		last := result.Items[len(result.Items)-1]
		ms, _ := time.Parse(time.RFC3339Nano, last.StartedAt)
		result.NextCursor = strconv.FormatInt(ms.UnixMilli(), 10) + ":" + last.RequestID
	}
	return result, nil
}

func scanRequest(rows interface{ Scan(...any) error }) (RequestSummary, error) {
	var item RequestSummary
	var start int64
	var end, status, duration sql.NullInt64
	err := rows.Scan(&item.RequestID, &item.RunID, &item.TraceID,
		&item.Route, &item.Surface, &item.Method, &item.Tool,
		&start, &end, &status, &duration, &item.Outcome, &item.ErrorCode)
	if err != nil {
		return item, err
	}
	item.StartedAt = timeISO(start)
	if end.Valid {
		item.FinishedAt = timeISO(end.Int64)
	}
	if status.Valid {
		item.Status = int(status.Int64)
	}
	if duration.Valid {
		item.DurationMS = duration.Int64
	}
	return item, nil
}

// ListLogs returns a bounded chronological snapshot across requests, ordered
// by most recent persisted event. Only previously sanitized fields are read.
func (s *Store) ListLogs(ctx context.Context, input LogListInput) (LogListResult, error) {
	result := LogListResult{Availability: "unavailable", Items: []LogSummary{}}
	from, to, err := parseWindow(input.Window)
	if err != nil {
		return result, err
	}
	limit, err := pageLimit(input.Limit)
	if err != nil {
		return result, err
	}
	if input.Level != "" && input.Level != "DEBUG" && input.Level != "INFO" &&
		input.Level != "WARN" && input.Level != "ERROR" {
		return result, ErrInvalidQuery
	}
	var cursor int64
	if input.Cursor != "" {
		cursor, err = strconv.ParseInt(input.Cursor, 10, 64)
		if err != nil || cursor <= 0 {
			return result, ErrInvalidQuery
		}
	}
	if s == nil || !s.Available() {
		return result, nil
	}
	readCtx, finishRead := s.readContext(ctx, 2*time.Second)
	defer finishRead()
	result.Availability = "available"
	result.Coverage = s.coverage(readCtx)
	query := `SELECT id,ts,level,component,event,request_id,operation_id,span_id,fields
		FROM log_events WHERE ts BETWEEN ? AND ?`
	args := []any{from, to}
	if cursor > 0 {
		query += " AND id < ?"
		args = append(args, cursor)
	}
	if input.Level != "" {
		query += " AND level=?"
		args = append(args, input.Level)
	}
	query += " ORDER BY id DESC LIMIT ?"
	args = append(args, limit+1)
	rows, err := s.db.QueryContext(readCtx, query, args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		item, scanErr := scanLog(rows)
		if scanErr != nil {
			return result, scanErr
		}
		result.Items = append(result.Items, item)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if len(result.Items) > limit {
		result.Items = result.Items[:limit]
		result.NextCursor = strconv.FormatInt(result.Items[len(result.Items)-1].ID, 10)
	}
	return result, nil
}

func scanLog(row interface{ Scan(...any) error }) (LogSummary, error) {
	var e LogSummary
	var ms int64
	var fields string
	err := row.Scan(&e.ID, &ms, &e.Level, &e.Component, &e.Event,
		&e.RequestID, &e.OperationID, &e.SpanID, &fields)
	if err != nil {
		return e, err
	}
	e.Time = timeISO(ms)
	e.Fields = map[string]any{}
	_ = json.Unmarshal([]byte(fields), &e.Fields)
	return e, nil
}

func (s *Store) Get(ctx context.Context, input RequestGetInput) (RequestGetResult, error) {
	result := RequestGetResult{Availability: "unavailable", Spans: []SpanSummary{}, Logs: []LogSummary{}}
	if !requestPattern.MatchString(input.RequestID) {
		return result, ErrInvalidQuery
	}
	if input.OperationID != "" && !operationPattern.MatchString(input.OperationID) {
		return result, ErrInvalidQuery
	}
	if input.SpanID != "" && !spanPattern.MatchString(input.SpanID) {
		return result, ErrInvalidQuery
	}
	limit, err := pageLimit(input.Limit)
	if err != nil {
		return result, err
	}
	var cursor int64
	if input.Cursor != "" {
		cursor, err = strconv.ParseInt(input.Cursor, 10, 64)
		if err != nil || cursor < 0 {
			return result, ErrInvalidQuery
		}
	}
	if s == nil || !s.Available() {
		return result, nil
	}
	readCtx, finishRead := s.readContext(ctx, 2*time.Second)
	defer finishRead()
	ctx = readCtx
	result.Availability = "available"
	result.Coverage = s.coverage(ctx)
	var started int64
	var finished, status, duration sql.NullInt64
	err = s.db.QueryRowContext(ctx, `SELECT request_id,run_id,trace_id,route,surface,method,tool,started_at,finished_at,
		status,duration_ms,outcome,error_code FROM requests WHERE request_id=?`, input.RequestID).Scan(
		&result.Request.RequestID, &result.Request.RunID, &result.Request.TraceID,
		&result.Request.Route, &result.Request.Surface, &result.Request.Method, &result.Request.Tool,
		&started, &finished, &status, &duration,
		&result.Request.Outcome, &result.Request.ErrorCode)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return result, err
	}
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrInvalidQuery
	}
	result.Request.StartedAt = timeISO(started)
	if finished.Valid {
		result.Request.FinishedAt = timeISO(finished.Int64)
	}
	if status.Valid {
		result.Request.Status = int(status.Int64)
	}
	if duration.Valid {
		result.Request.DurationMS = duration.Int64
	}
	rows, err := s.db.QueryContext(ctx, `SELECT span_id,trace_id,parent_span_id,request_id,operation_id,name,
		started_at,finished_at,duration_ms,outcome,query_family,db_call_seq FROM spans WHERE request_id=? ORDER BY started_at,span_id LIMIT 201`, input.RequestID)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var x SpanSummary
		var start int64
		var finish, duration sql.NullInt64
		if scanErr := rows.Scan(&x.SpanID, &x.TraceID, &x.ParentSpanID, &x.RequestID, &x.OperationID, &x.Name,
			&start, &finish, &duration, &x.Outcome, &x.QueryFamily, &x.DBCallSeq); scanErr != nil {
			_ = rows.Close()
			return result, scanErr
		}
		x.StartedAt = timeISO(start)
		if finish.Valid {
			x.FinishedAt = timeISO(finish.Int64)
		}
		if duration.Valid {
			x.DurationMS = duration.Int64
		}
		result.Spans = append(result.Spans, x)
	}
	_ = rows.Close()
	// One extra row detects a truncated tree without disclosing unbounded
	// trace data. The UI must show the limited coverage truthfully.
	if len(result.Spans) > 200 {
		result.Spans = result.Spans[:200]
		result.Coverage.Truncated = true
	}
	if input.SpanID != "" || input.OperationID != "" {
		matched := false
		for _, span := range result.Spans {
			if (input.SpanID == "" || span.SpanID == input.SpanID) &&
				(input.OperationID == "" || span.OperationID == input.OperationID) {
				matched = true
				break
			}
		}
		if !matched {
			return result, ErrInvalidQuery
		}
	}
	where := " WHERE request_id=? AND id>?"
	args := []any{input.RequestID, cursor}
	if input.SpanID != "" {
		where += " AND span_id=?"
		args = append(args, input.SpanID)
	}
	if input.OperationID != "" {
		where += " AND operation_id=?"
		args = append(args, input.OperationID)
	}
	args = append(args, limit+1)
	rows, err = s.db.QueryContext(ctx, "SELECT id,ts,level,component,event,request_id,operation_id,span_id,fields FROM log_events"+
		where+" ORDER BY id LIMIT ?", args...)
	if err != nil {
		return result, err
	}
	defer rows.Close()
	for rows.Next() {
		e, scanErr := scanLog(rows)
		if scanErr != nil {
			return result, scanErr
		}
		result.Logs = append(result.Logs, e)
	}
	if err := rows.Err(); err != nil {
		return result, err
	}
	if len(result.Logs) > limit {
		result.Logs = result.Logs[:limit]
		result.NextCursor = strconv.FormatInt(result.Logs[limit-1].ID, 10)
	}
	// Do not infer the last stage from a paginated log window: the most
	// recent persisted checkpoint may be on a different page.
	if err := rows.Close(); err != nil {
		return result, err
	}
	stageRows, err := s.db.QueryContext(ctx, `SELECT e.operation_id,e.ts,e.fields FROM log_events e
		JOIN (SELECT MAX(id) AS latest FROM log_events
			WHERE request_id=? AND event='business.operation.stage' AND operation_id<>''
			GROUP BY operation_id) latest ON latest.latest=e.id
		ORDER BY e.id DESC LIMIT 201`, input.RequestID)
	if err != nil {
		return result, err
	}
	defer stageRows.Close()
	for stageRows.Next() {
		var stage OperationLastStage
		var when int64
		var raw string
		if err := stageRows.Scan(&stage.OperationID, &when, &raw); err != nil {
			return result, err
		}
		var fields struct {
			Stage string `json:"stage"`
		}
		if !operationPattern.MatchString(stage.OperationID) || json.Unmarshal([]byte(raw), &fields) != nil ||
			!safePatchStage(fields.Stage) {
			continue
		}
		stage.Stage, stage.ObservedAt = fields.Stage, timeISO(when)
		result.LastStages = append(result.LastStages, stage)
	}
	if err := stageRows.Err(); err != nil {
		return result, err
	}
	if len(result.LastStages) > 200 {
		result.LastStages = result.LastStages[:200]
		result.Coverage.Truncated = true
	}
	return result, nil
}

func safePatchStage(stage string) bool {
	switch stage {
	case "base_read", "parse_plan", "tx_begin", "pre_schema", "staged_safety",
		"post_schema_nodes", "post_schema_relationships", "read_back", "commit":
		return true
	}
	return false
}
