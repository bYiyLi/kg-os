package observability

import (
	"strings"
	"testing"
	"time"
)

func TestCriticalRequestOutcomesHaveSeparateBoundedCapacity(t *testing.T) {
	s := &Store{
		queue:    make(chan storeEvent, 1),
		critical: make(chan storeEvent, 2),
	}
	s.Log(logRecord{Time: time.Now(), Event: "lithograph.operation.finished"})
	s.Log(logRecord{Time: time.Now(), Event: "lithograph.operation.finished"})
	if s.Dropped() != 1 || len(s.queue) != 1 {
		t.Fatalf("unbounded optional diagnostic producer: dropped=%d queued=%d",
			s.Dropped(), len(s.queue))
	}
	requestID := "req_" + strings.Repeat("a", 32)
	s.RequestStart(requestRecord{RequestID: requestID})
	s.RequestEnd(requestRecord{RequestID: requestID, Outcome: "succeeded"})
	if len(s.critical) != 2 || s.Dropped() != 1 {
		t.Fatalf("optional log flood displaced real request outcomes: critical=%d dropped=%d",
			len(s.critical), s.Dropped())
	}
	if start := <-s.critical; start.kind != "request_start" {
		t.Fatalf("critical ordering lost the request start: %s", start.kind)
	}
	if end := <-s.critical; end.kind != "request_end" {
		t.Fatalf("critical ordering lost the request finish: %s", end.kind)
	}
	// Even the priority queue must not be a hidden unbounded resource.
	s.RequestEnd(requestRecord{RequestID: requestID})
	s.RequestEnd(requestRecord{RequestID: requestID})
	s.RequestEnd(requestRecord{RequestID: requestID})
	if len(s.critical) != 2 || s.Dropped() != 2 {
		t.Fatalf("critical queue overflow was not bounded and counted")
	}
}
