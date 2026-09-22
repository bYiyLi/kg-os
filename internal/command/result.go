package command

type Result struct {
	ExitCode int
	Stderr   string
	Stdout   string
}

func evaluateHelpVersion(args []string, help, version, unsupported string) Result {
	if len(args) == 0 || containsHelp(args) {
		return Result{Stdout: help}
	}
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") {
		return Result{Stdout: version + "\n"}
	}
	return Result{ExitCode: 2, Stderr: unsupported}
}

func containsHelp(args []string) bool {
	for _, arg := range args {
		if arg == "--help" || arg == "-h" {
			return true
		}
	}
	return false
}
