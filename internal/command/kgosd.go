package command

import (
	"github.com/bYiyLi/kg-os/internal/buildinfo"
)

const kgosdHelp = "KG OS daemon\n\n" +
	"Usage: kgosd --root <absolute-instance-root>\n" +
	"       kgosd [--help] [--version]\n\n" +
	"Options:\n" +
	"      --root     Absolute KG OS Instance Root\n" +
	"  -h, --help     Show this help\n" +
	"  -V, --version  Show the installed version\n"

type DaemonMode uint8

const (
	DaemonModeResult DaemonMode = iota
	DaemonModeRun
)

type DaemonEvaluation struct {
	Mode   DaemonMode
	Root   string
	Result Result
}

func EvaluateKGOSD(args []string) DaemonEvaluation {
	if containsHelp(args) {
		return DaemonEvaluation{Mode: DaemonModeResult, Result: Result{Stdout: kgosdHelp}}
	}
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") {
		return DaemonEvaluation{
			Mode:   DaemonModeResult,
			Result: Result{Stdout: buildinfo.Version + "\n"},
		}
	}
	if len(args) == 2 && args[0] == "--root" && args[1] != "" {
		return DaemonEvaluation{Mode: DaemonModeRun, Root: args[1]}
	}
	return DaemonEvaluation{
		Mode:   DaemonModeResult,
		Result: Result{ExitCode: 2, Stderr: "kgosd: --root <absolute-instance-root> is required\n"},
	}
}
