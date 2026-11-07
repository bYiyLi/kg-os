package observability

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

// The workbench must preserve exact filtering, cursor and sparse metric
// semantics when requests, spans, logs and resource samples coexist.
func TestWorkbenchHistoricalFiltersCursorAndResourceDetails(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	now := time.Now().UTC().Add(-10 * time.Minute).Truncate(time.Second)
	ids := []string{
		fmt.Sprintf("req_%032x", 1),
		fmt.Sprintf("req_%032x", 2),
		fmt.Sprintf("req_%032x", 3),
		fmt.Sprintf("req_%032x", 4),
	}
	routes := []string{"api", "mcp", "oauth", "api"}
	outcomes := []string{"succeeded", "error", "succeeded", "incomplete"}
	for i, id := range ids {
		start := now.Add(time.Duration(i) * time.Second)
		duration := int64(25)
		if i == 1 {
			duration = 3001
		}
		store.RequestStart(requestRecord{Time: start, RunID: "run_filter", RequestID: id,
			Route: routes[i], Surface: "http", Method: "POST"})
		store.RequestEnd(requestRecord{Time: start.Add(time.Duration(duration) * time.Millisecond),
			RunID: "run_filter", RequestID: id, Route: routes[i], Surface: "http", Method: "POST",
			Status: http.StatusOK, DurationMS: duration, Outcome: outcomes[i]})
	}
	spanID := strings.Repeat("a", 16)
	operationID := "op_" + strings.Repeat("b", 32)
	start := now.Add(time.Second)
	store.SpanStart(spanRecord{TraceID: strings.Repeat("c", 32), SpanID: spanID,
		RequestID: ids[1], OperationID: operationID, Name: "kernel.graph.query", Start: start})
	store.SpanEnd(spanRecord{TraceID: strings.Repeat("c", 32), SpanID: spanID,
		RequestID: ids[1], OperationID: operationID, Name: "kernel.graph.query",
		Start: start, End: start.Add(40 * time.Millisecond), Outcome: "error"})
	for i := 0; i < 3; i++ {
		store.Log(logRecord{Time: start.Add(time.Duration(i) * time.Millisecond),
			RunID: "run_filter", RequestID: ids[1], OperationID: operationID, SpanID: spanID,
			Level: "WARN", Component: "kernel", Event: "kernel.graph.query.failed",
			Fields: fmt.Sprintf(`{"event":%d}`, i)})
	}
	rss, used, maximum := uint64(1024), uint64(512), uint64(2048)
	cpu := 12.5
	store.Metric(metricRecord{Time: now, HeapBytes: 256, RSSBytes: &rss,
		CgroupUsed: &used, CgroupMax: &maximum, CPUPercent: &cpu,
		Goroutines: 3, GCPauses: 17})
	store.System(systemRecord{Time: now, RunID: "run_filter", Event: "runtime.started"})
	closeDiagnosticStore(t, store)
	persisted, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, persisted)
	ctx := context.Background()
	window := Window{From: now.Add(-time.Minute).Format(time.RFC3339),
		To: now.Add(time.Minute).Format(time.RFC3339)}
	overview, err := persisted.Overview(ctx, window, Snapshot{})
	if err != nil || overview.Total != 4 || overview.Errors != 1 || overview.Slow != 1 ||
		overview.Incomplete != 1 || len(overview.Events) != 1 || len(overview.Resources) != 1 {
		t.Fatalf("history overview lost requests or real resource values: %+v %v", overview, err)
	}
	point := overview.Resources[0]
	if point.RSSBytes == nil || *point.RSSBytes != rss ||
		point.CgroupUsed == nil || *point.CgroupUsed != used ||
		point.CgroupMax == nil || *point.CgroupMax != maximum ||
		point.CPUPercent == nil || *point.CPUPercent != cpu {
		t.Fatalf("real resource metrics were fabricated or lost: %+v", point)
	}
	first, err := persisted.List(ctx, RequestListInput{Window: window, Limit: 2})
	if err != nil || len(first.Items) != 2 || first.NextCursor == "" {
		t.Fatalf("request page 1: %+v %v", first, err)
	}
	second, err := persisted.List(ctx, RequestListInput{Window: window, Limit: 2, Cursor: first.NextCursor})
	if err != nil || len(second.Items) != 2 || second.NextCursor != "" {
		t.Fatalf("request page 2: %+v %v", second, err)
	}
	if first.Items[0].RequestID == second.Items[0].RequestID {
		t.Fatal("cursor repeated a request from the previous page")
	}
	for _, tc := range []struct {
		name  string
		input RequestListInput
		want  string
	}{
		{"route", RequestListInput{Window: window, Route: "mcp"}, ids[1]},
		{"outcome", RequestListInput{Window: window, Outcome: "error"}, ids[1]},
		{"slow", RequestListInput{Window: window, Slow: true}, ids[1]},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := persisted.List(ctx, tc.input)
			if err != nil || len(got.Items) != 1 || got.Items[0].RequestID != tc.want {
				t.Fatalf("filtered request: %+v %v", got, err)
			}
		})
	}
	detail, err := persisted.Get(ctx, RequestGetInput{RequestID: ids[1], Limit: 2})
	if err != nil || len(detail.Spans) != 1 || len(detail.Logs) != 2 || detail.NextCursor == "" {
		t.Fatalf("bounded request details: %+v %v", detail, err)
	}
	nextDetail, err := persisted.Get(ctx, RequestGetInput{RequestID: ids[1], Limit: 2, Cursor: detail.NextCursor,
		SpanID: spanID, OperationID: operationID})
	if err != nil || len(nextDetail.Logs) != 1 || nextDetail.NextCursor != "" {
		t.Fatalf("span-scoped log cursor: %+v %v", nextDetail, err)
	}
	if nextDetail.Logs[0].Fields["event"] != float64(2) {
		t.Fatalf("safe JSON log payload was lost: %+v", nextDetail.Logs[0])
	}
}

func TestWorkbenchRejectsMalformedFiltersAndUnknownRequest(t *testing.T) {
	store, _ := newPrivateStoreForTest(t)
	defer closeDiagnosticStore(t, store)
	ctx := context.Background()
	validID := "req_" + strings.Repeat("a", 32)
	badLists := []RequestListInput{
		{Route: "secret"}, {Outcome: "committed"}, {Cursor: "not-a-cursor"},
		{Limit: 101}, {Cursor: "0:" + validID},
	}
	for _, input := range badLists {
		if _, err := store.List(ctx, input); !errors.Is(err, ErrInvalidQuery) {
			t.Fatalf("invalid list filter accepted: %+v, %v", input, err)
		}
	}
	badGets := []RequestGetInput{
		{RequestID: "secret"}, {RequestID: validID, Limit: 101},
		{RequestID: validID, Cursor: "-1"}, {RequestID: validID, Cursor: "not-an-offset"},
		{RequestID: validID, SpanID: "wrong"}, {RequestID: validID, OperationID: "wrong"},
		{RequestID: validID},
	}
	for _, input := range badGets {
		if _, err := store.Get(ctx, input); !errors.Is(err, ErrInvalidQuery) {
			t.Fatalf("invalid or missing detail request accepted: %+v, %v", input, err)
		}
	}
}
