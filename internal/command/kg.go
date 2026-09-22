package command

import "github.com/bYiyLi/kg-os/internal/buildinfo"

const kgHelp = "KG OS command-line client\n\n" +
	"Usage: kg [--help] [--version]\n\n" +
	"Options:\n" +
	"  -h, --help     Show this help\n" +
	"  -V, --version  Show the installed version\n\n" +
	"Phase 00 provides the Go executable and engineering baseline. Business commands are not implemented yet.\n"

func EvaluateKG(args []string) Result {
	return evaluateHelpVersion(
		args,
		kgHelp,
		buildinfo.Version,
		"kg: business commands are not implemented in Phase 00\n",
	)
}
