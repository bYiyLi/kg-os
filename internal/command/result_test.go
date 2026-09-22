package command

import (
	"strings"
	"testing"
)

func TestEvaluateKG(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name string
		args []string
		code int
		want string
	}{
		{name: "default help", want: "KG OS command-line client"},
		{name: "long help", args: []string{"--help"}, want: "Usage: kg"},
		{name: "short help", args: []string{"other", "-h"}, want: "Usage: kg"},
		{name: "version", args: []string{"--version"}, want: "0.0.0\n"},
		{name: "short version", args: []string{"-V"}, want: "0.0.0\n"},
		{name: "unsupported", args: []string{"object", "read"}, code: 2, want: "not implemented"},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := EvaluateKG(test.args)
			if result.ExitCode != test.code {
				t.Fatalf("exit code = %d, want %d", result.ExitCode, test.code)
			}
			combined := result.Stdout + result.Stderr
			if !strings.Contains(combined, test.want) {
				t.Fatalf("output %q does not contain %q", combined, test.want)
			}
		})
	}
}

func TestEvaluateKGOSD(t *testing.T) {
	t.Parallel()

	for _, test := range []struct {
		name string
		args []string
		mode DaemonMode
		code int
	}{
		{name: "run daemon", mode: DaemonModeRun},
		{name: "help", args: []string{"--help"}, mode: DaemonModeResult},
		{name: "version", args: []string{"--version"}, mode: DaemonModeResult},
		{name: "old phase0 shell rejected", args: []string{"--phase0-shell"}, mode: DaemonModeResult, code: 2},
		{name: "old host override rejected", args: []string{"--host", "127.0.0.1"}, mode: DaemonModeResult, code: 2},
		{name: "old port override rejected", args: []string{"--port", "4173"}, mode: DaemonModeResult, code: 2},
		{name: "unknown flag", args: []string{"--unknown"}, mode: DaemonModeResult, code: 2},
		{name: "positional", args: []string{"extra"}, mode: DaemonModeResult, code: 2},
	} {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()
			result := EvaluateKGOSD(test.args)
			if result.Mode != test.mode {
				t.Fatalf("mode = %d, want %d", result.Mode, test.mode)
			}
			if result.Result.ExitCode != test.code {
				t.Fatalf("exit code = %d, want %d", result.Result.ExitCode, test.code)
			}
		})
	}
}
