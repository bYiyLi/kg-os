package main

import (
	"context"
	"strings"
	"testing"
)

func TestRunResultModes(t *testing.T) {
	t.Parallel()
	for _, args := range [][]string{{"--help"}, {"--version"}, {"unsupported"}} {
		var stdout strings.Builder
		var stderr strings.Builder
		code := run(context.Background(), args, &stdout, &stderr)
		if args[0] == "unsupported" {
			if code != 2 || stderr.Len() == 0 {
				t.Fatalf("unsupported result = %d, %q", code, stderr.String())
			}
			continue
		}
		if code != 0 || stdout.Len() == 0 {
			t.Fatalf("result for %v = %d, %q", args, code, stdout.String())
		}
	}
}

func TestRunPhase0ShellStops(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	var stdout strings.Builder
	var stderr strings.Builder
	code := run(ctx, []string{"--phase0-shell", "--port", "0"}, &stdout, &stderr)
	if code != 0 || stderr.Len() != 0 || !strings.Contains(stdout.String(), "Phase 00 shell") {
		t.Fatalf("run = code %d stdout %q stderr %q", code, stdout.String(), stderr.String())
	}
}

func TestRunPhase0ShellReportsBindFailure(t *testing.T) {
	t.Parallel()
	var stdout strings.Builder
	var stderr strings.Builder
	code := run(
		context.Background(),
		[]string{"--phase0-shell", "--host", "not a host", "--port", "0"},
		&stdout,
		&stderr,
	)
	if code != 1 || stdout.Len() != 0 || !strings.Contains(stderr.String(), "listen for Phase 00 shell") {
		t.Fatalf("run = code %d stdout %q stderr %q", code, stdout.String(), stderr.String())
	}
}
