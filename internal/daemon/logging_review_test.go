package daemon

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/kernel"
	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestStreamTerminalFailureIsNotRecordedAsHTTP200Success(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	store, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeGraphStream(w, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			if err := consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns}); err != nil {
				return err
			}
			return &kernel.PublicError{Code: kernel.CodeSemantic, Message: "private query"}
		}, r.Context())
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/graph/query", nil))
	if response.Code != http.StatusOK || !response.Flushed {
		t.Fatalf("expected a started HTTP 200 NDJSON response: %d, flushed=%v", response.Code, response.Flushed)
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(shutdown); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(context.Background()) }()
	detail, err := reopened.Get(context.Background(), observability.RequestGetInput{
		RequestID: response.Header().Get(observability.RequestIDHeader),
	})
	if err != nil {
		t.Fatal(err)
	}
	if detail.Request.Status != http.StatusOK || detail.Request.Outcome != "error" ||
		detail.Request.ErrorCode != string(kernel.CodeSemantic) {
		t.Fatalf("terminal Graph error misclassified as HTTP success: %+v", detail.Request)
	}
}

func TestDiagnosticQueryFailureLogsSafeCauseAndRequestID(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	store, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	ctx, requestID, err := observability.WithRequest(context.Background(), observer)
	if err != nil {
		t.Fatal(err)
	}
	if diagnosticQueryError(ctx, "observability.logs.list", errors.New("private/path/token=secret")) == nil {
		t.Fatal("server failure became a successful diagnostic query")
	}
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(shutdown); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(context.Background()) }()
	logs, err := reopened.ListLogs(context.Background(), observability.LogListInput{})
	if err != nil || len(logs.Items) != 1 {
		t.Fatalf("diagnostic failure was not recorded: %+v %v", logs, err)
	}
	log := logs.Items[0]
	if log.Event != "observability.query.failed" || log.RequestID != requestID ||
		log.Fields["cause_class"] != "storage_error" || log.Fields["operation"] != "observability.logs.list" {
		t.Fatalf("diagnostic failure lacked safe correlation: %+v", log)
	}
}

func TestGraphFlushFailurePropagatesThroughHTTPObservation(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "logs")
	store, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	observer, err := observability.New(io.Discard, "INFO")
	if err != nil {
		t.Fatal(err)
	}
	observer.AttachStore(store)
	handler := observability.HTTPMiddleware(observer, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		writeGraphStream(w, func(consume func(kernel.GraphStreamEvent) error) error {
			columns := []string{"value"}
			return consume(kernel.GraphStreamEvent{Type: "columns", Columns: &columns})
		}, r.Context())
	}))
	writer := &flushFailGraphWriter{header: make(http.Header)}
	handler.ServeHTTP(writer, httptest.NewRequest(http.MethodPost, "/api/v1/graph/query", nil))
	shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := observer.Close(shutdown); err != nil {
		t.Fatal(err)
	}
	reopened, err := observability.OpenStore(dir, io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reopened.Close(context.Background()) }()
	detail, err := reopened.Get(context.Background(), observability.RequestGetInput{
		RequestID: writer.Header().Get(observability.RequestIDHeader),
	})
	if err != nil || detail.Request.Outcome != "error" || detail.Request.ErrorCode != string(kernel.CodeIO) {
		t.Fatalf("swallowed transport flush error: %+v %v", detail.Request, err)
	}
}
