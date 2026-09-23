package command

import "github.com/bYiyLi/kg-os/internal/buildinfo"

func EvaluateKG(args []string) Result {
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") {
		return Result{Stdout: buildinfo.Version + "\n"}
	}
	return Result{ExitCode: 2, Stderr: "kg: command is not available in the current implementation\n"}
}
