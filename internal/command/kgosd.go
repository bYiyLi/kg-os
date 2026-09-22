package command

import (
	"github.com/bYiyLi/kg-os/internal/buildinfo"
)

const kgosdHelp = "KG OS daemon\n\n" +
	"Usage: kgosd\n" +
	"       kgosd [--help] [--version]\n\n" +
	"Options:\n" +
	"  -h, --help     Show this help\n" +
	"  -V, --version  Show the installed version\n\n" +
	"Runtime configuration is loaded from $KG_HOME/config.toml.\n"

type DaemonMode uint8

const (
	DaemonModeResult DaemonMode = iota
	DaemonModeRun
)

type DaemonEvaluation struct {
	Mode   DaemonMode
	Result Result
}

func EvaluateKGOSD(args []string) DaemonEvaluation {
	if len(args) == 0 {
		return DaemonEvaluation{Mode: DaemonModeRun}
	}
	if containsHelp(args) {
		return DaemonEvaluation{Mode: DaemonModeResult, Result: Result{Stdout: kgosdHelp}}
	}
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") {
		return DaemonEvaluation{
			Mode:   DaemonModeResult,
			Result: Result{Stdout: buildinfo.Version + "\n"},
		}
	}

	return DaemonEvaluation{
		Mode:   DaemonModeResult,
		Result: Result{ExitCode: 2, Stderr: "kgosd: unsupported arguments\n"},
	}
}
