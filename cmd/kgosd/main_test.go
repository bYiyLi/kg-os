package main

import (
	"bytes"
	"context"
	"strings"
	"testing"
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
		{name: "version", args: []string{"--version"}, wantStdout: "0.1.1"},
		{name: "unsupported", args: []string{"--phase0-shell"}, wantCode: 2, wantStderr: "--root"},
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

func TestRunReportsRuntimePackageFailure(t *testing.T) {
	root := t.TempDir()
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := run(context.Background(), []string{"--root", root}, &stdout, &stderr)
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if !strings.Contains(stderr.String(), "runtime manifest") {
		t.Fatalf("stderr = %q", stderr.String())
	}
}
