package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
	"time"
)

func TestRunMetadataModes(t *testing.T) {
	tests := []struct {
		name       string
		args       []string
		wantCode   int
		wantStdout string
		wantStderr string
	}{
		{name: "help", args: []string{"--help"}, wantStdout: "KG OS daemon"},
		{name: "version", args: []string{"--version"}, wantStdout: "0.2.1"},
		{name: "unsupported", args: []string{"--phase0-shell"}, wantCode: 2, wantStderr: "unknown option"},
		{name: "missing root", wantCode: 2, wantStderr: "--root"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			var stdout bytes.Buffer
			var stderr bytes.Buffer
			code := run(context.Background(), test.args, &stdout, &stderr)
			if code != test.wantCode {
				t.Fatalf("exit code = %d, want %d", code, test.wantCode)
			}
			if test.wantStdout != "" && !strings.Contains(stdout.String(), test.wantStdout) {
				t.Fatalf("stdout = %q", stdout.String())
			}
			if test.wantStderr != "" && !strings.Contains(stderr.String(), test.wantStderr) {
				t.Fatalf("stderr = %q", stderr.String())
			}
		})
	}
}

func TestRunStartsRestrictedSetupWithoutRuntimeConfig(t *testing.T) {
	root := t.TempDir()
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := run(ctx, []string{"--root", root}, &stdout, &stderr)
	if code != 0 {
		t.Fatalf("exit code = %d, want 0; stderr=%q", code, stderr.String())
	}
	if !strings.Contains(stdout.String(), "KG OS daemon: ") {
		t.Fatalf("restricted setup did not expose an HTTP endpoint: %q", stdout.String())
	}
}
