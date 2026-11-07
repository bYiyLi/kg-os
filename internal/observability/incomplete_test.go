package observability

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func TestReopenKeepsMissingCompletionAsIncomplete(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	now := time.Now().UTC()
	requestID := "req_" + strings.Repeat("a", 32)
	spanID := strings.Repeat("b", 16)
	store.RequestStart(requestRecord{
		Time: now, RunID: "run_crashed", RequestID: requestID,
		TraceID: strings.Repeat("c", 32), Route: "mcp", Surface: "mcp",
		Method: "POST",
	})
	store.SpanStart(spanRecord{
		RequestID: requestID, TraceID: strings.Repeat("c", 32),
		SpanID: spanID, Name: "mcp.tool", Start: now,
	})
	// There is deliberately no RequestEnd or SpanEnd. This models a stopped
	// process after a committed start record; the database must not invent
	// success, failure, rollback, or an OOM cause when reopened.
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
	if detail.Request.Outcome != "incomplete" || detail.Request.FinishedAt != "" {
		t.Fatalf("missing execution terminal was invented: %+v", detail.Request)
	}
	if len(detail.Spans) != 1 || detail.Spans[0].Outcome != "incomplete" ||
		detail.Spans[0].FinishedAt != "" {
		t.Fatalf("unfinished trace incorrectly gained an ending: %+v", detail.Spans)
	}
	overview, err := reopened.Overview(context.Background(), Window{}, Snapshot{})
	if err != nil || overview.Incomplete != 1 || overview.Errors != 0 || overview.Success != 0 {
		t.Fatalf("incomplete history misrepresented as terminal: %+v %v", overview, err)
	}
}
