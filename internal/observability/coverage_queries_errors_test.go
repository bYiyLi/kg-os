package observability

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestHistoricalQueriesReturnBackendErrorsInsteadOfFalseEmptyResults(t *testing.T) {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store := &Store{db: db}
	if _, err := store.Overview(context.Background(), Window{}, Snapshot{}); err == nil {
		t.Fatal("closed diagnostic database returned a fictitious empty Overview")
	}
	if _, err := store.List(context.Background(), RequestListInput{}); err == nil {
		t.Fatal("closed diagnostic database returned a fictitious empty request list")
	}
	if _, err := store.Get(context.Background(), RequestGetInput{RequestID: "req_" + strings.Repeat("a", 32)}); err == nil {
		t.Fatal("closed diagnostic database returned a fictitious empty request")
	}
	if _, _, err := parseWindow(Window{To: "not-an-RFC3339-time"}); err == nil {
		t.Fatal("malformed upper time window bound accepted")
	}
	to := time.Now().Add(-time.Hour).UTC()
	start, end, err := parseWindow(Window{To: to.Format(time.RFC3339)})
	if err != nil || end-start != int64((24*time.Hour)/time.Millisecond) {
		t.Fatalf("time window without From failed to use bounded 24 hours: %d %d %v", start, end, err)
	}
}

func TestDiagnosticSafeSlogAttributeProjectionAndResponseCapabilities(t *testing.T) {
	store := &Store{queue: make(chan storeEvent, 1)}
	base := &storeHandler{store: store, level: slog.LevelWarn}
	handler := base.WithAttrs([]slog.Attr{
		slog.String("component", "kernel"), slog.String("route", "mcp"),
		slog.Int64("status", http.StatusServiceUnavailable),
		slog.String("secret_token", "should-not-survive"),
	})
	if handler.Enabled(context.Background(), slog.LevelInfo) {
		t.Fatal("diagnostic level filter ignored")
	}
	if !handler.Enabled(context.Background(), slog.LevelWarn) {
		t.Fatal("warning diagnostic level ignored")
	}
	if handler.WithGroup("nested") != handler {
		t.Fatal("attribute grouping unexpectedly changes allowed diagnostic scope")
	}
	rec := slog.NewRecord(time.Now(), slog.LevelWarn, "business.operation.finished", 0)
	rec.AddAttrs(slog.String("outcome", "error"), slog.String("error_code", "SAFE_ERROR"))
	if err := handler.Handle(context.Background(), rec); err != nil {
		t.Fatal(err)
	}
	event := <-store.queue
	if event.kind != "required_log" {
		t.Fatalf("unsafe diagnostic event: %s", event.kind)
	}
	log := event.data.(logRecord)
	if log.Component != "kernel" || log.Event != "business.operation.finished" {
		t.Fatalf("structured slog fields lost their identity: %+v", log)
	}
	var fields map[string]any
	if err := json.Unmarshal([]byte(log.Fields), &fields); err != nil {
		t.Fatal(err)
	}
	if fields["route"] != "mcp" || fields["status"] != float64(http.StatusServiceUnavailable) ||
		fields["outcome"] != "error" || fields["error_code"] != "SAFE_ERROR" || fields["secret_token"] != nil {
		t.Fatalf("private slog attr leaked or safe attr dropped: %+v", fields)
	}
	writer := &statusWriter{ResponseWriter: httptest.NewRecorder()}
	if _, _, err := writer.Hijack(); !errors.Is(err, http.ErrNotSupported) {
		t.Fatalf("diagnostic status wrapper invented hijack ability: %v", err)
	}
	writer.Flush()
	if writer.status != http.StatusOK {
		t.Fatalf("Flush did not establish a valid response status: %d", writer.status)
	}
}

func TestDiagnosticUnsignedMetricReaderRejectsInvalidContents(t *testing.T) {
	path := filepath.Join(t.TempDir(), "counter")
	if readUnsignedFile(path) != nil {
		t.Fatal("missing metric source became an invented metric")
	}
	if err := os.WriteFile(path, []byte("not-an-unsigned-integer"), 0o600); err != nil {
		t.Fatal(err)
	}
	if readUnsignedFile(path) != nil {
		t.Fatal("malformed metric value was not treated as unavailable")
	}
	if err := os.WriteFile(path, []byte(" 42\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	value := readUnsignedFile(path)
	if value == nil || *value != 42 {
		t.Fatalf("valid unsigned resource sample rejected: %+v", value)
	}
}
