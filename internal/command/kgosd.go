package command

import (
	"flag"
	"fmt"
	"io"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
)

const kgosdHelp = "KG OS daemon\n\n" +
	"Usage: kgosd [--help] [--version]\n" +
	"       kgosd --phase0-shell [--host <host>] [--port <port>]\n\n" +
	"Options:\n" +
	"  -h, --help       Show this help\n" +
	"  -V, --version    Show the installed version\n" +
	"  --phase0-shell   Serve the embedded Phase 00 Web shell for engineering smoke\n" +
	"  --host <host>    Phase 00 shell bind host (default 127.0.0.1)\n" +
	"  --port <port>    Phase 00 shell bind port (default 4765; 0 selects an ephemeral port)\n\n" +
	"The production daemon lifecycle and Knowledge Base runtime are not implemented in Phase 00.\n"

type DaemonMode uint8

const (
	DaemonModeResult DaemonMode = iota
	DaemonModePhase0Shell
)

type DaemonEvaluation struct {
	Host   string
	Mode   DaemonMode
	Port   int
	Result Result
}

func EvaluateKGOSD(args []string) DaemonEvaluation {
	if len(args) == 0 || containsHelp(args) {
		return DaemonEvaluation{Mode: DaemonModeResult, Result: Result{Stdout: kgosdHelp}}
	}
	if len(args) == 1 && (args[0] == "--version" || args[0] == "-V") {
		return DaemonEvaluation{
			Mode:   DaemonModeResult,
			Result: Result{Stdout: buildinfo.Version + "\n"},
		}
	}

	flags := flag.NewFlagSet(buildinfo.DaemonName, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	phase0Shell := flags.Bool("phase0-shell", false, "")
	host := flags.String("host", "127.0.0.1", "")
	port := flags.Int("port", 4765, "")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || !*phase0Shell {
		return daemonArgumentError(err)
	}
	if *host == "" || *port < 0 || *port > 65535 {
		return daemonArgumentError(fmt.Errorf("invalid Phase 00 shell bind address"))
	}
	return DaemonEvaluation{Host: *host, Mode: DaemonModePhase0Shell, Port: *port}
}

func daemonArgumentError(err error) DaemonEvaluation {
	message := "kgosd: unsupported Phase 00 arguments\n"
	if err != nil {
		message = fmt.Sprintf("kgosd: %s\n", err)
	}
	return DaemonEvaluation{
		Mode:   DaemonModeResult,
		Result: Result{ExitCode: 2, Stderr: message},
	}
}
