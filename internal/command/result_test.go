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
		{name: "default help", mode: DaemonModeResult},
		{name: "help", args: []string{"--help"}, mode: DaemonModeResult},
		{name: "version", args: []string{"--version"}, mode: DaemonModeResult},
		{name: "shell", args: []string{"--phase0-shell"}, mode: DaemonModePhase0Shell},
		{name: "ephemeral shell", args: []string{"--phase0-shell", "--port", "0"}, mode: DaemonModePhase0Shell},
		{name: "missing shell mode", args: []string{"--port", "0"}, mode: DaemonModeResult, code: 2},
		{name: "unknown flag", args: []string{"--unknown"}, mode: DaemonModeResult, code: 2},
		{name: "positional", args: []string{"--phase0-shell", "extra"}, mode: DaemonModeResult, code: 2},
		{name: "empty host", args: []string{"--phase0-shell", "--host", ""}, mode: DaemonModeResult, code: 2},
		{name: "invalid port", args: []string{"--phase0-shell", "--port", "70000"}, mode: DaemonModeResult, code: 2},
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

	shell := EvaluateKGOSD([]string{"--phase0-shell", "--host", "127.0.0.1", "--port", "4173"})
	if shell.Host != "127.0.0.1" || shell.Port != 4173 {
		t.Fatalf("unexpected shell bind: %#v", shell)
	}
}
