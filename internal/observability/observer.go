// Package observability provides bounded diagnostic signals that are never
// part of KG OS business state or a durable audit record.
package observability

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"

	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

const RequestIDHeader = "X-KGOS-Request-ID"

type contextKey int

const (
	observerKey contextKey = iota
	requestKey
	surfaceKey
	surfaceTrackerKey
)

// A transport request can be classified only after its authentication
// middleware has run. Share its trusted classification with the outer HTTP
// completion observer; a child context value alone would not propagate back.
type surfaceTracker struct {
	mu              sync.RWMutex
	value           string
	streamOutcome   string
	streamErrorCode string
}

type Observer struct {
	logger         *slog.Logger
	level          slog.Level
	store          *Store
	tracer         trace.Tracer
	tracerProvider *sdktrace.TracerProvider
	metricsStop    chan struct{}
	metricsDone    chan struct{}
	runID          string
	start          time.Time
	mu             sync.Mutex
	http           HTTPMetrics
	mcp            MCPMetrics
	business       BusinessMetrics
	sandboxLimits  uint64
}

func New(output io.Writer, rawLevel string) (*Observer, error) {
	var level slog.Level
	switch strings.ToUpper(rawLevel) {
	case "", "INFO":
		level = slog.LevelInfo
	case "DEBUG":
		level = slog.LevelDebug
	case "WARN":
		level = slog.LevelWarn
	case "ERROR":
		level = slog.LevelError
	default:
		return nil, errors.New("invalid KGOS_LOG_LEVEL")
	}
	id, err := newID("run_")
	if err != nil {
		return nil, err
	}
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{
		Level: level,
		ReplaceAttr: func(_ []string, attr slog.Attr) slog.Attr {
			if attr.Key == slog.TimeKey {
				return slog.String(attr.Key, attr.Value.Time().UTC().Format(time.RFC3339Nano))
			}
			return attr
		},
	})
	return &Observer{logger: slog.New(handler), level: level, runID: id, start: time.Now()}, nil
}

func newID(prefix string) (string, error) {
	var random [16]byte
	if _, err := rand.Read(random[:]); err != nil {
		return "", errors.New("generate diagnostic identifier failed")
	}
	return prefix + hex.EncodeToString(random[:]), nil
}

func WithObserver(ctx context.Context, o *Observer) context.Context {
	if o == nil {
		return ctx
	}
	return context.WithValue(ctx, observerKey, o)
}
func FromContext(ctx context.Context) *Observer {
	observer, _ := ctx.Value(observerKey).(*Observer)
	return observer
}
func WithSurface(ctx context.Context, s string) context.Context {
	switch s {
	case "api", "web", "mcp", "internal":
		if tracker, ok := ctx.Value(surfaceTrackerKey).(*surfaceTracker); ok {
			tracker.mu.Lock()
			tracker.value = s
			tracker.mu.Unlock()
			return ctx
		}
		return context.WithValue(ctx, surfaceKey, s)
	}
	return ctx
}
func Surface(ctx context.Context) string {
	if tracker, ok := ctx.Value(surfaceTrackerKey).(*surfaceTracker); ok {
		tracker.mu.RLock()
		s := tracker.value
		tracker.mu.RUnlock()
		if s != "" {
			return s
		}
	}
	s, _ := ctx.Value(surfaceKey).(string)
	if s == "" {
		return "internal"
	}
	return s
}
func WithRequest(ctx context.Context, o *Observer) (context.Context, string, error) {
	id, err := newID("req_")
	if err != nil {
		return ctx, "", err
	}
	ctx = context.WithValue(WithObserver(ctx, o), requestKey, id)
	return context.WithValue(ctx, surfaceTrackerKey, &surfaceTracker{}), id, nil
}
func RequestID(ctx context.Context) string { id, _ := ctx.Value(requestKey).(string); return id }

// SetStreamResult records a trusted terminal result independently of HTTP
// status. Graph NDJSON may already have sent 200 before its final error.
func SetStreamResult(ctx context.Context, outcome, code string) {
	tracker, ok := ctx.Value(surfaceTrackerKey).(*surfaceTracker)
	if !ok || (outcome != "succeeded" && outcome != "error") {
		return
	}
	tracker.mu.Lock()
	defer tracker.mu.Unlock()
	if tracker.streamOutcome == "error" && outcome == "succeeded" {
		return
	}
	tracker.streamOutcome = outcome
	if outcome == "error" {
		tracker.streamErrorCode = SafeCode(code)
	} else {
		tracker.streamErrorCode = ""
	}
}

func StreamResult(ctx context.Context) (string, string) {
	tracker, ok := ctx.Value(surfaceTrackerKey).(*surfaceTracker)
	if !ok {
		return "", ""
	}
	tracker.mu.RLock()
	defer tracker.mu.RUnlock()
	return tracker.streamOutcome, tracker.streamErrorCode
}

// Required diagnostic events survive KGOS_LOG_LEVEL filtering. This list is
// intentionally narrow: successful static/health/polling traffic stays quiet.
func requiredDiagnosticEvent(event string) bool {
	switch event {
	case "http.request.finished", "mcp.tool.started", "mcp.tool.finished",
		"business.operation.started", "business.operation.stage", "business.operation.finished",
		"security.authorization.decided", "runtime.starting", "runtime.started",
		"runtime.stopped", "runtime.initialized", "runtime.init.failed",
		"runtime.serve.failed", "runtime.open.failed", "runtime.close.failed":
		return true
	}
	return false
}

// Tool names are supplied by registered handlers, not by MCP arguments.
func safeToolName(name string) string {
	switch name {
	case "kgos_docs", "kgos_query", "kgos_mutate", "kgos_ontology_overview",
		"kgos_commit_ancestry", "kgos_workspace":
		return name
	}
	return ""
}

// BusinessStarted records entry before any Patch parsing or side effects.
func BusinessStarted(ctx context.Context, operation string) {
	o := FromContext(ctx)
	if o == nil || o.store == nil {
		return
	}
	if operation != "object.patch" && operation != "ontology.patch" {
		return
	}
	o.Log(ctx, slog.LevelInfo, "kernel", "business.operation.started",
		slog.String("operation", operation), slog.String("surface", Surface(ctx)))
	o.store.EmergencyStart(o.runID, RequestID(ctx), OperationID(ctx), trustedTool(ctx), operation)
}

// BusinessStage accepts only a closed list of real execution checkpoints.
func BusinessStage(ctx context.Context, stage string, baseState string, nodeCount, relationshipCount int) {
	o := FromContext(ctx)
	if o == nil || o.store == nil {
		return
	}
	switch stage {
	case "base_read", "parse_plan", "tx_begin", "pre_schema", "staged_safety",
		"post_schema_nodes", "post_schema_relationships", "read_back", "commit":
	default:
		return
	}
	attrs := []slog.Attr{slog.String("stage", stage)}
	if statePattern.MatchString(baseState) {
		attrs = append(attrs, slog.String("base_state", baseState))
	}
	if stage == "parse_plan" {
		if nodeCount >= 0 && nodeCount <= 1000000 {
			attrs = append(attrs, slog.Int("node_count", nodeCount))
		}
		if relationshipCount >= 0 && relationshipCount <= 1000000 {
			attrs = append(attrs, slog.Int("relationship_count", relationshipCount))
		}
	}
	o.Log(ctx, slog.LevelInfo, "kernel", "business.operation.stage", attrs...)
}

func (o *Observer) Log(ctx context.Context, level slog.Level, component, event string, fields ...slog.Attr) {
	if o == nil {
		return
	}
	attrs := []slog.Attr{slog.String("component", component), slog.String("event", event), slog.String("run_id", o.runID)}
	if id := RequestID(ctx); id != "" {
		attrs = append(attrs, slog.String("request_id", id))
	}
	if id := OperationID(ctx); id != "" {
		attrs = append(attrs, slog.String("operation_id", id))
	}
	if traceID, spanID := activeSpanID(ctx); traceID != "" {
		attrs = append(attrs, slog.String("trace_id", traceID), slog.String("span_id", spanID))
	}
	attrs = append(attrs, fields...)
	if o.store != nil && level < o.level && requiredDiagnosticEvent(event) {
		// slog.Logger checks Handler.Enabled before calling Handle. Required
		// records bypass only that level gate; storeHandler still applies its
		// strict field allowlist before queueing.
		record := slog.NewRecord(time.Now(), level, event, 0)
		record.AddAttrs(attrs...)
		_ = o.logger.Handler().Handle(ctx, record)
	} else {
		o.logger.LogAttrs(ctx, level, event, attrs...)
	}
	if o.store != nil && component == "runtime" {
		switch event {
		case "runtime.starting", "runtime.started", "runtime.stopped", "runtime.initialized", "runtime.init.failed",
			"runtime.serve.failed", "runtime.open.failed", "runtime.close.failed":
			o.store.System(systemRecord{Time: time.Now(), RunID: o.runID, Event: event})
		}
	}
}
func Log(ctx context.Context, level slog.Level, component, event string, fields ...slog.Attr) {
	if o := FromContext(ctx); o != nil {
		o.Log(ctx, level, component, event, fields...)
	}
}

var statePattern = regexp.MustCompile(`^commit/[0-9a-fA-F]{64}$`)
var codePattern = regexp.MustCompile(`^[A-Z][A-Z_0-9]{1,47}$`)

func SafeCode(code string) string {
	if codePattern.MatchString(code) {
		return code
	}
	return "INTERNAL_ERROR"
}

type BusinessResult struct {
	Operation  string
	Outcome    string
	ErrorCode  string
	State      string
	Count      int
	TargetKind string
	Duration   time.Duration
}

func Business(ctx context.Context, result BusinessResult) {
	o := FromContext(ctx)
	if o == nil {
		return
	}
	switch result.Outcome {
	case "committed", "applied", "no_change", "rejected", "failed", "unknown":
	default:
		result.Outcome = "unknown"
	}
	id := OperationID(ctx)
	if id == "" {
		var err error
		id, err = newID("op_")
		if err != nil {
			return
		}
	}
	fields := []slog.Attr{
		slog.String("operation_id", id), slog.String("surface", Surface(ctx)),
		slog.String("operation", result.Operation), slog.String("outcome", result.Outcome),
		slog.Int64("duration_ms", result.Duration.Milliseconds()),
	}
	if result.ErrorCode != "" {
		fields = append(fields, slog.String("error_code", SafeCode(result.ErrorCode)))
	}
	if statePattern.MatchString(result.State) {
		fields = append(fields, slog.String("result_state", result.State))
	}
	if result.Count > 0 {
		fields = append(fields, slog.Int("affected_count", result.Count))
	}
	if result.TargetKind != "" {
		fields = append(fields, slog.String("target_kind", result.TargetKind))
	}
	SpanOutcome(trace.SpanFromContext(ctx), result.Outcome)
	level := slog.LevelInfo
	if result.Outcome == "unknown" {
		level = slog.LevelWarn
	}
	o.Log(ctx, level, "kernel", "business.operation.finished", fields...)
	o.mu.Lock()
	o.business.OperationsTotal++
	if o.business.Outcomes == nil {
		o.business.Outcomes = make(map[string]uint64, 6)
	}
	o.business.Outcomes[result.Outcome]++
	o.mu.Unlock()
}

// Only a known pre-side-effect rejection may be called rejected; all other
// errors stay unknown because a write could have committed before transport failed.
func ErrorOutcome(err error, preWriteRejected bool) string {
	if err == nil {
		return "applied"
	}
	if preWriteRejected {
		return "rejected"
	}
	return "unknown"
}
func (o *Observer) ToolStart() {
	if o == nil {
		return
	}
	o.mu.Lock()
	o.mcp.InFlight++
	o.mu.Unlock()
}
func (o *Observer) ToolStarted(ctx context.Context, name string) {
	o.ToolStart()
	name = safeToolName(name)
	if o == nil || o.store == nil || name == "" {
		return
	}
	traceID, _ := activeSpanID(ctx)
	o.store.ToolStart(requestRecord{
		Time: time.Now(), RunID: o.runID, RequestID: RequestID(ctx),
		TraceID: traceID, Tool: name,
	})
	o.Log(ctx, slog.LevelInfo, "mcp", "mcp.tool.started", slog.String("tool", name))
}
func (o *Observer) Tool(ctx context.Context, name, code string, elapsed time.Duration) {
	if o == nil {
		return
	}
	outcome := "succeeded"
	level := slog.LevelInfo
	if code != "" {
		outcome = "error"
		level = slog.LevelWarn
		code = SafeCode(code)
	}
	fields := []slog.Attr{slog.String("tool", name), slog.String("outcome", outcome), slog.Int64("duration_ms", elapsed.Milliseconds())}
	if code != "" {
		fields = append(fields, slog.String("error_code", code))
	}
	o.Log(ctx, level, "mcp", "mcp.tool.finished", fields...)
	SpanOutcome(trace.SpanFromContext(ctx), outcome)
	if o.store != nil {
		traceID, _ := activeSpanID(ctx)
		o.store.ToolEnd(requestRecord{
			Time: time.Now(), RunID: o.runID, TraceID: traceID,
			RequestID: RequestID(ctx), Tool: safeToolName(name), Outcome: outcome, ErrorCode: code,
		})
	}
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.mcp.InFlight > 0 {
		o.mcp.InFlight--
	}
	o.mcp.ToolCallsTotal++
	if code != "" {
		o.mcp.ToolErrorsTotal++
	}
	if code == "TIMEOUT" || code == "DEADLINE_EXCEEDED" {
		o.mcp.ToolTimeoutsTotal++
	}
}

// SandboxLimit counts an actual resource-budget violation observed by the
// sandbox owner, not a generic RESOURCE_ERROR returned by the Kernel or MCP.
func (o *Observer) SandboxLimit(ctx context.Context) {
	if o == nil {
		return
	}
	o.mu.Lock()
	o.sandboxLimits++
	o.mu.Unlock()
	o.Log(ctx, slog.LevelWarn, "sandbox", "sandbox.resource.limit",
		slog.String("cause_class", "budget"))
}
func Security(ctx context.Context, operation, decision string) {
	level := slog.LevelInfo
	if decision == "rejected" || decision == "unknown" {
		level = slog.LevelWarn
	}
	Log(ctx, level, "security", "security.authorization.decided", slog.String("operation", operation), slog.String("decision", decision))
}

type Buckets struct {
	LE50     uint64 `json:"le_50"`
	LE250    uint64 `json:"le_250"`
	LE1000   uint64 `json:"le_1000"`
	Over1000 uint64 `json:"over_1000"`
}
type HTTPMetrics struct {
	RequestsTotal uint64  `json:"requests_total"`
	Non2xxTotal   uint64  `json:"non_2xx_total"`
	InFlight      uint64  `json:"in_flight"`
	Latency       Buckets `json:"latency_ms_buckets"`
}
type MCPMetrics struct {
	ToolCallsTotal    uint64 `json:"tool_calls_total"`
	ToolErrorsTotal   uint64 `json:"tool_errors_total"`
	ToolTimeoutsTotal uint64 `json:"tool_timeouts_total"`
	InFlight          uint64 `json:"in_flight"`
}
type BusinessMetrics struct {
	OperationsTotal uint64            `json:"operations_total"`
	Outcomes        map[string]uint64 `json:"outcomes"`
}
type ProcessMetrics struct {
	HeapAllocBytes uint64 `json:"heap_alloc_bytes"`
	Goroutines     int    `json:"goroutines"`
}
type Snapshot struct {
	UptimeSeconds int64           `json:"uptime_seconds"`
	Process       ProcessMetrics  `json:"process"`
	HTTP          HTTPMetrics     `json:"http"`
	MCP           MCPMetrics      `json:"mcp"`
	Business      BusinessMetrics `json:"business"`
	Sandbox       struct {
		ResourceLimitsTotal uint64 `json:"resource_limits_total"`
	} `json:"sandbox"`
}

func (o *Observer) HTTPStart() { o.mu.Lock(); o.http.InFlight++; o.mu.Unlock() }

// HTTPProbeEnd releases a known GET /mcp 401 Docker healthcheck without
// inflating the user-facing HTTP error rate.
func (o *Observer) HTTPProbeEnd() {
	o.mu.Lock()
	if o.http.InFlight > 0 {
		o.http.InFlight--
	}
	o.mu.Unlock()
}
func (o *Observer) HTTPEnd(status int, elapsed time.Duration) {
	o.mu.Lock()
	defer o.mu.Unlock()
	if o.http.InFlight > 0 {
		o.http.InFlight--
	}
	o.http.RequestsTotal++
	if status < 200 || status >= 300 {
		o.http.Non2xxTotal++
	}
	ms := elapsed.Milliseconds()
	if ms <= 50 {
		o.http.Latency.LE50++
	}
	if ms <= 250 {
		o.http.Latency.LE250++
	}
	if ms <= 1000 {
		o.http.Latency.LE1000++
	}
	if ms > 1000 {
		o.http.Latency.Over1000++
	}
}
func (o *Observer) Snapshot() Snapshot {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)
	o.mu.Lock()
	defer o.mu.Unlock()
	outcomes := make(map[string]uint64, 6)
	for _, k := range []string{"committed", "applied", "no_change", "rejected", "failed", "unknown"} {
		outcomes[k] = o.business.Outcomes[k]
	}
	result := Snapshot{
		UptimeSeconds: int64(time.Since(o.start).Seconds()),
		Process:       ProcessMetrics{HeapAllocBytes: mem.HeapAlloc, Goroutines: runtime.NumGoroutine()},
		HTTP:          o.http, MCP: o.mcp,
		Business: BusinessMetrics{OperationsTotal: o.business.OperationsTotal, Outcomes: outcomes},
	}
	result.Sandbox.ResourceLimitsTotal = o.sandboxLimits
	return result
}
