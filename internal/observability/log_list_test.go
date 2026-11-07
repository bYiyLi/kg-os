package observability

import (
	"context"
	"io"
	"strings"
	"testing"
	"time"
)

func TestLogTimelineIsBoundedOrderedFilteredAndPreservesRequestIdentity(t *testing.T) {
	store, dir := newPrivateStoreForTest(t)
	id := "req_" + strings.Repeat("b", 32)
	start := time.Now().UTC().Add(-time.Minute)
	for i, level := range []string{"INFO", "WARN", "ERROR", "INFO", "WARN"} {
		store.Log(logRecord{
			Time:  start.Add(time.Duration(i) * time.Second),
			Level: level, Component: "kernel", Event: "kernel.operation.finished",
			RunID: "run_test", RequestID: id, Fields: `{"error_code":"SAFE"}`,
		})
	}
	closeDiagnosticStore(t, store)
	reopened, err := OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDiagnosticStore(t, reopened)
	page, err := reopened.ListLogs(context.Background(), LogListInput{Limit: 2})
	if err != nil || len(page.Items) != 2 || page.NextCursor == "" {
		t.Fatalf("first page invalid: %+v %v", page, err)
	}
	if page.Items[0].ID <= page.Items[1].ID || page.Items[0].RequestID != id {
		t.Fatalf("timeline ordering or identity lost: %+v", page.Items)
	}
	next, err := reopened.ListLogs(context.Background(), LogListInput{Limit: 2, Cursor: page.NextCursor})
	if err != nil || len(next.Items) != 2 || next.Items[0].ID >= page.Items[1].ID {
		t.Fatalf("overlapping or missing second page: %+v %v", next, err)
	}
	last, err := reopened.ListLogs(context.Background(), LogListInput{Limit: 2, Cursor: next.NextCursor})
	if err != nil || len(last.Items) != 1 || last.NextCursor != "" {
		t.Fatalf("last page invalid: %+v %v", last, err)
	}
	warnings, err := reopened.ListLogs(context.Background(), LogListInput{Level: "WARN"})
	if err != nil || len(warnings.Items) != 2 {
		t.Fatalf("log level filter ignored: %+v %v", warnings, err)
	}
	for _, input := range []LogListInput{
		{Limit: 101}, {Limit: -1}, {Cursor: "../secret"}, {Cursor: "-1"},
		{Level: "PRIVATE"}, {Window: Window{From: "not-a-timestamp"}},
	} {
		if _, err := reopened.ListLogs(context.Background(), input); err != ErrInvalidQuery {
			t.Errorf("invalid timeline input accepted: %+v => %v", input, err)
		}
	}
}
