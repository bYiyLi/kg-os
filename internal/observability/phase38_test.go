package observability

import (
	"context"
	"database/sql"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPhase38LegacyDiagnosticSchemaPreservesIncompleteEvidence(t *testing.T) {
	dir := filepath.Join(t.TempDir(), ".kgos", "logs")
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	database, err := sql.Open("sqlite3", filepath.Join(dir, "observability.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	// This is the actual pre-Phase-38 span layout, not a new-schema fixture.
	_, err = database.Exec(`CREATE TABLE spans (
		span_id TEXT PRIMARY KEY, trace_id TEXT NOT NULL, parent_span_id TEXT NOT NULL DEFAULT '',
		request_id TEXT NOT NULL DEFAULT '', operation_id TEXT NOT NULL DEFAULT '',
		name TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
		duration_ms INTEGER, outcome TEXT NOT NULL DEFAULT 'incomplete')`)
	if err != nil {
		t.Fatal(err)
	}
	requestID := "req_" + strings.Repeat("a", 32)
	operationID := "op_" + strings.Repeat("b", 32)
	spanID := strings.Repeat("c", 16)
	_, err = database.Exec(`INSERT INTO spans(span_id,trace_id,request_id,operation_id,name,started_at)
		VALUES(?,?,?,?,?,?)`, spanID, strings.Repeat("d", 32), requestID, operationID,
		"lithograph.execute", time.Now().UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	store.RequestStart(requestRecord{
		Time: time.Now(), RunID: "run_legacy", RequestID: requestID,
		TraceID: strings.Repeat("d", 32), Route: "mcp", Surface: "mcp", Method: "POST",
	})
	closeDiagnosticStore(t, store)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Request.Outcome != "incomplete" || len(detail.Spans) != 1 {
		t.Fatalf("legacy incomplete evidence discarded: %+v", detail)
	}
	old := detail.Spans[0]
	if old.SpanID != spanID || old.OperationID != operationID ||
		old.QueryFamily != "" || old.DBCallSeq != 0 || old.Outcome != "incomplete" ||
		old.FinishedAt != "" {
		t.Fatalf("legacy record modified or invented: %+v", old)
	}
}

func TestPhase38SequenceResetAndStagesStayWithinTheirOperations(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	ctx, requestID, err := WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	ctx, root := StartSpan(ctx, "http.mcp")
	store.RequestStart(requestRecord{
		Time: time.Now(), RunID: observer.runID, RequestID: requestID,
		TraceID: root.SpanContext().TraceID().String(), Route: "mcp", Surface: "mcp", Method: "POST",
	})
	firstCtx, first := StartOperation(ctx, "kernel.object.patch")
	firstID := OperationID(firstCtx)
	BusinessStage(firstCtx, "pre_schema", "", -1, -1)
	_, firstDB := StartSpan(WithQueryFamily(firstCtx, "knowledge.node.create"), "lithograph.execute")
	firstDB.End()
	_, secondDB := StartSpan(WithQueryFamily(firstCtx, "knowledge.relationship.create"), "lithograph.execute")
	secondDB.End()
	first.End()
	secondCtx, second := StartOperation(ctx, "kernel.object.patch")
	secondID := OperationID(secondCtx)
	BusinessStage(secondCtx, "post_schema_relationships", "", -1, -1)
	_, thirdDB := StartSpan(WithQueryFamily(secondCtx, "untrusted.statement.contents"), "lithograph.execute")
	thirdDB.End()
	second.End()
	root.End()
	closeObserverForTest(t, observer)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if firstID == secondID || len(detail.LastStages) != 2 {
		t.Fatalf("independent operations coalesced into one: %+v", detail.LastStages)
	}
	last := map[string]string{}
	for _, stage := range detail.LastStages {
		last[stage.OperationID] = stage.Stage
	}
	if last[firstID] != "pre_schema" || last[secondID] != "post_schema_relationships" {
		t.Fatalf("operations inherited each other's last stage: %+v", last)
	}
	found := make(map[string]map[int64]string)
	for _, span := range detail.Spans {
		if span.Name != "lithograph.execute" {
			continue
		}
		if found[span.OperationID] == nil {
			found[span.OperationID] = map[int64]string{}
		}
		found[span.OperationID][span.DBCallSeq] = span.QueryFamily
	}
	if len(found[firstID]) != 2 ||
		found[firstID][1] != "knowledge.node.create" ||
		found[firstID][2] != "knowledge.relationship.create" ||
		len(found[secondID]) != 1 || found[secondID][1] != "other" {
		t.Fatalf("db_call_seq/family are not per-operation and safe: %+v", found)
	}
}

func TestPhase38IncompletePatchHasToolStageAndDatabaseIdentity(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	observer, err := New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	ctx, requestID, err := WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	WithSurface(ctx, "mcp")
	ctx, root := StartSpan(ctx, "http.mcp")
	store.RequestStart(requestRecord{
		Time: time.Now(), RequestID: requestID, RunID: observer.runID,
		TraceID: root.SpanContext().TraceID().String(), Route: "mcp", Surface: "mcp", Method: "POST",
	})
	ctx = WithTool(ctx, "kgos_mutate")
	ctx, _ = StartSpan(ctx, "mcp.tool")
	observer.ToolStarted(ctx, "kgos_mutate")
	ctx, _ = StartOperation(ctx, "kernel.object.patch")
	operationID := OperationID(ctx)
	BusinessStarted(ctx, "object.patch")
	BusinessStage(ctx, "base_read", "commit/"+strings.Repeat("a", 64), -1, -1)
	BusinessStage(ctx, "parse_plan", "", 2, 1)
	BusinessStage(ctx, "post_schema_relationships", "", -1, -1)
	_, _ = StartSpan(WithQueryFamily(ctx, "knowledge.relationship.create"), "lithograph.execute")
	// Simulate a fatal kill: neither Tool nor Kernel nor Lithograph finishes.
	closeObserverForTest(t, observer)

	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID, Limit: 1})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Request.Tool != "kgos_mutate" || detail.Request.Outcome != "incomplete" ||
		detail.Request.FinishedAt != "" || detail.Request.ErrorCode != "" {
		t.Fatalf("unfinished Tool not preserved accurately: %+v", detail.Request)
	}
	if len(detail.LastStages) != 1 || detail.LastStages[0].OperationID != operationID ||
		detail.LastStages[0].Stage != "post_schema_relationships" {
		all, _ := reopened.ListLogs(context.Background(), LogListInput{Limit: 100})
		t.Fatalf("latest persisted stage lost with paginated logs: stages=%+v logs=%+v", detail.LastStages, all.Items)
	}
	var foundDB, foundStart, foundPlan bool
	for _, span := range detail.Spans {
		if span.Name == "lithograph.execute" {
			foundDB = span.DBCallSeq == 1 && span.QueryFamily == "knowledge.relationship.create" &&
				span.OperationID == operationID && span.Outcome == "incomplete" && span.FinishedAt == ""
		}
	}
	if !foundDB {
		t.Fatalf("incomplete database Span lost safe identity: %+v", detail.Spans)
	}
	logs, err := reopened.ListLogs(context.Background(), LogListInput{Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	for _, log := range logs.Items {
		if log.Event == "mcp.tool.started" {
			foundStart = log.Fields["tool"] == "kgos_mutate"
		}
		if log.Event == "business.operation.stage" && log.Fields["stage"] == "parse_plan" {
			foundPlan = log.Fields["node_count"] == float64(2) && log.Fields["relationship_count"] == float64(1)
		}
	}
	if !foundStart || !foundPlan {
		t.Fatalf("ERROR level filtered critical start/plan: %+v", logs.Items)
	}
}

func TestPhase38MultipleToolsPreserveFirstNameAndEarlierError(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	when := time.Now().UTC()
	requestID := "req_" + strings.Repeat("b", 32)
	base := requestRecord{Time: when, RequestID: requestID, RunID: "run_crash", TraceID: strings.Repeat("c", 32)}
	store.RequestStart(requestRecord{Time: when, RequestID: requestID, RunID: base.RunID, TraceID: base.TraceID,
		Route: "mcp", Surface: "mcp", Method: "POST"})
	base.Tool = "kgos_query"
	store.ToolStart(base)
	base.Outcome, base.ErrorCode = "error", "INTERNAL_ERROR"
	store.ToolEnd(base)
	base.Tool, base.Outcome, base.ErrorCode = "kgos_mutate", "succeeded", ""
	store.ToolStart(base)
	store.ToolEnd(base)
	store.RequestEnd(requestRecord{Time: when.Add(time.Millisecond), RunID: base.RunID,
		RequestID: requestID, Route: "mcp", Surface: "mcp", Method: "POST", Outcome: "succeeded"})
	closeDiagnosticStore(t, store)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	detail, err := reopened.Get(context.Background(), RequestGetInput{RequestID: requestID})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Request.Tool != "kgos_query" || detail.Request.Outcome != "error" ||
		detail.Request.ErrorCode != "INTERNAL_ERROR" {
		t.Fatalf("first Tool/first error overwritten by later Tool: %+v", detail.Request)
	}
}

func TestPhase38StageOverflowKeepsNewestAndProtectsOutcome(t *testing.T) {
	s := &Store{
		queue: make(chan storeEvent, 1), stages: make(chan storeEvent, 1),
		critical: make(chan storeEvent, 1), outcomes: make(chan storeEvent, 1),
	}
	for i := 0; i < 20000; i++ {
		s.Log(logRecord{Time: time.Now(), Event: "business.operation.stage", Fields: `{"stage":"parse_plan"}`})
	}
	s.RequestEnd(requestRecord{RequestID: "req_" + strings.Repeat("a", 32)})
	if len(s.stages) != 1 || len(s.outcomes) != 1 || s.Dropped() == 0 {
		t.Fatalf("stage flood displaced completed result or exceeded its bounded queue: stages=%d outcomes=%d dropped=%d",
			len(s.stages), len(s.outcomes), s.Dropped())
	}
}

func TestPhase38StoreQueuePriorityAndCoalescedWake(t *testing.T) {
	s := &Store{
		queue: make(chan storeEvent, 1), stages: make(chan storeEvent, 1),
		critical: make(chan storeEvent, 1), outcomes: make(chan storeEvent, 1),
		wake: make(chan struct{}, 1),
	}
	for _, kind := range []string{"queue", "stage_log", "request_start", "request_end"} {
		var target chan storeEvent
		switch kind {
		case "queue":
			target = s.queue
		case "stage_log":
			target = s.stages
		case "request_start":
			target = s.critical
		case "request_end":
			target = s.outcomes
		}
		target <- storeEvent{kind: kind}
	}
	for _, want := range []string{"request_end", "request_start", "stage_log", "queue"} {
		got, ok := s.nextEvent()
		if !ok || got.kind != want {
			t.Fatalf("next event = %q, %v; want %q", got.kind, ok, want)
		}
	}
	if _, ok := s.nextEvent(); ok {
		t.Fatal("empty queues returned an event")
	}
	s.notify()
	s.notify()
	if len(s.wake) != 1 {
		t.Fatalf("wake signal was not coalesced: %d", len(s.wake))
	}
}

func TestPhase38EmergencyStartsUseOnlyOpaqueIDsAndFixedNames(t *testing.T) {
	s := &Store{emergencyQueue: make(chan string, 1)}
	op := "op_" + strings.Repeat("a", 32)
	run := "run_" + strings.Repeat("b", 32)
	req := "req_" + strings.Repeat("c", 32)
	s.EmergencyStart(run, req, op, "attacker-token", "object.patch")
	first := <-s.emergencyQueue
	if !strings.Contains(first, "tool=none") || strings.Contains(first, "attacker-token") ||
		!strings.Contains(first, op) {
		t.Fatalf("unsafe emergency line: %q", first)
	}
	s.EmergencyStart("secret-run", req, op, "kgos_mutate", "object.patch")
	if len(s.emergencyQueue) != 0 {
		t.Fatal("malformed caller identity was written to stderr")
	}
}
