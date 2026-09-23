package command

type Result struct {
	ExitCode int
	Stderr   string
	Stdout   string
}

func containsHelp(args []string) bool {
	for _, arg := range args {
		if arg == "--help" || arg == "-h" {
			return true
		}
	}
	return false
}
