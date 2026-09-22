package main

import (
	"strings"
	"testing"
)

func TestRun(t *testing.T) {
	t.Parallel()
	var stdout strings.Builder
	var stderr strings.Builder
	if code := run([]string{"--version"}, &stdout, &stderr); code != 0 {
		t.Fatalf("exit code = %d", code)
	}
	if stdout.String() != "0.0.0\n" || stderr.Len() != 0 {
		t.Fatalf("unexpected output: stdout=%q stderr=%q", stdout.String(), stderr.String())
	}
}
