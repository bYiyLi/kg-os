package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/bYiyLi/kg-os/internal/observability"
)

func TestRuntimeFailureHasPrivateSafeEmergencySummary(t *testing.T) {
	observer, err := observability.New(&bytes.Buffer{}, "ERROR")
	if err != nil {
		t.Fatal(err)
	}
	var stderr bytes.Buffer
	reportRuntimeFailure(context.Background(), observer, &stderr,
		"runtime.open.failed", "runtime_open", errors.New("private/path?token=secret"))
	if got := stderr.String(); !strings.Contains(got, "stage=runtime_open") ||
		!strings.Contains(got, "cause_class=runtime_failure") ||
		strings.Contains(got, "private") || strings.Contains(got, "secret") {
		t.Fatalf("unsafe or unhelpful startup error: %q", got)
	}
}

func TestRunOwnsPrivateSQLiteDiagnosticsForDetachedCLI(t *testing.T) {
	root := t.TempDir()
	t.Setenv("KGOS_INTERNAL_LOG_TO_FILE", "1")
	t.Setenv("KGOS_LOG_LEVEL", "DEBUG")
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	var stdout, stderr bytes.Buffer
	if code := run(ctx, []string{"--root", root}, &stdout, &stderr); code != 0 {
		t.Fatalf("restricted setup should be available: %d", code)
	}
	file := filepath.Join(root, ".kgos", "logs", "observability.sqlite")
	db, err := sql.Open("sqlite3", file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM system_events WHERE event='runtime.starting'").Scan(&count); err != nil || count != 1 {
		t.Fatalf("startup event not persisted safely: %v count=%d", err, count)
	}
	if _, err := os.Stat(filepath.Join(root, ".kgos", "logs", "kgosd.log")); !os.IsNotExist(err) {
		t.Fatalf("unexpected legacy full JSONL diagnostic file: %v", err)
	}
	if !strings.Contains(stdout.String(), "KG OS daemon: ") || stderr.Len() != 0 {
		t.Fatalf("restricted startup stdout/stderr unexpected: %q / %q", stdout.String(), stderr.String())
	}
	if info, err := os.Stat(file); err != nil || (runtime.GOOS != "windows" && info.Mode().Perm() != 0o600) {
		t.Fatalf("diagnostic SQLite permission incorrect: %v %v", info, err)
	}
}

func TestInvalidLogLevelAndUnwritableDestinationDoNotExposeSecrets(t *testing.T) {
	root := t.TempDir()
	var stdout, stderr bytes.Buffer
	t.Setenv("KGOS_LOG_LEVEL", "bogus")
	if code := run(context.Background(), []string{"--root", root}, &stdout, &stderr); code != 1 ||
		!strings.Contains(stderr.String(), "invalid KGOS_LOG_LEVEL") {
		t.Fatalf("invalid logging configuration: %d %q", code, stderr.String())
	}
	t.Setenv("KGOS_LOG_LEVEL", "INFO")
	t.Setenv("KGOS_INTERNAL_LOG_TO_FILE", "1")
	logs := filepath.Join(root, ".kgos", "logs")
	if err := os.MkdirAll(filepath.Dir(logs), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(logs, []byte("existing-private-content"), 0o600); err != nil {
		t.Fatal(err)
	}
	stderr.Reset()
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	if code := run(ctx, []string{"--root", root}, &stdout, &stderr); code != 0 ||
		!strings.Contains(stderr.String(), "diagnostic storage unavailable") {
		t.Fatalf("bad log path was not safely degraded: %d %q", code, stderr.String())
	}
	data, err := os.ReadFile(logs)
	if err != nil || string(data) != "existing-private-content" {
		t.Fatal("diagnostic output overwrote an existing file")
	}
}
