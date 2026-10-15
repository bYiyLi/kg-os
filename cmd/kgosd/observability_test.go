package main

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRunOwnsPrivateRotatingLogsForDetachedCLI(t *testing.T) {
	root := t.TempDir()
	t.Setenv("KGOS_INTERNAL_LOG_TO_FILE", "1")
	t.Setenv("KGOS_LOG_LEVEL", "DEBUG")
	var stdout, stderr bytes.Buffer
	if code := run(context.Background(), []string{"--root", root}, &stdout, &stderr); code != 1 {
		t.Fatalf("uninitialized runtime should fail: %d", code)
	}
	file := filepath.Join(root, ".kgos", "logs", "kgosd.log")
	data, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"event":"runtime.open.failed"`) ||
		strings.Contains(string(data), root) {
		t.Fatalf("missing safe startup log: %s", data)
	}
	if stdout.Len() != 0 || stderr.Len() != 0 {
		t.Fatalf("detached stdout/stderr contaminated: %q / %q", stdout.String(), stderr.String())
	}
	if info, err := os.Stat(file); err != nil || info.Mode().Perm() != 0o600 {
		t.Fatalf("log permission incorrect: %v %v", info, err)
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
	if code := run(context.Background(), []string{"--root", root}, &stdout, &stderr); code != 1 ||
		!strings.Contains(stderr.String(), "cannot open private diagnostic log") {
		t.Fatalf("bad log path was not safely degraded: %d %q", code, stderr.String())
	}
	data, err := os.ReadFile(logs)
	if err != nil || string(data) != "existing-private-content" {
		t.Fatal("diagnostic output overwrote an existing file")
	}
}
