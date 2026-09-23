package command

import "github.com/bYiyLi/kg-os/internal/buildinfo"

const kgHelp = "KG OS command-line client\n\n" +
	"Usage: kg [--help] [--version]\n" +
	"       kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <n>] [--cursor <token>]\n" +
	"       kg ontology <OntologyRef> [<OntologyRef> ...] --at <ResolvedState> --edit\n" +
	"       kg ontology patch --base-state <ResolvedState> --branch <name> [payload options]\n\n" +
	"Options:\n" +
	"  -h, --help     Show this help\n" +
	"  -V, --version  Show the installed version\n\n" +
	"Phase 02 provides the Ontology read/edit/patch surface. Other business namespaces remain unavailable.\n"

const kgOntologyHelp = "KG OS Ontology commands\n\n" +
	"Usage:\n" +
	"  kg ontology [<OntologyRef> ...] --at <StateRef> [--limit <1..1000>] [--cursor <token>]\n" +
	"  kg ontology <OntologyRef> [<OntologyRef> ...] --at <commit/...> --edit\n" +
	"  kg ontology patch --base-state <commit/...> --branch <name>\n" +
	"    [--patch <diff> | --patch-file <path> | stdin] [--author <text>] [--message <text>]\n\n" +
	"OntologyRef: domain:<name> | node:<name> | relationship:<name>\n" +
	"Reads emit Markdown; --edit emits server-rendered canonical YAML; patch emits JSON.\n"

func KGOntologyHelp() string {
	return kgOntologyHelp
}

func EvaluateKG(args []string) Result {
	return evaluateHelpVersion(
		args,
		kgHelp,
		buildinfo.Version,
		"kg: command is not available in the current implementation\n",
	)
}
