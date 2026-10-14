package command

import (
	"os"

	"github.com/bYiyLi/kg-os/internal/buildinfo"
)

const kgosdHelp = "KG OS daemon\n\n" +
	"Usage: kgosd --root <absolute-workspace-root> [--host <address>] [--port <0..65535>]\n" +
	"       [--tls-cert <path> --tls-key <path>]\n" +
	"       [--mcp-oauth-issuer <origin>] [MCP options]\n" +
	"       kgosd init --root <absolute-workspace-root>\n" +
	"       kgosd [--help] [--version]\n\n" +
	"Options:\n" +
	"      --root     Absolute KG OS Workspace Root\n" +
	"      --host, --port, --tls-cert, --tls-key\n" +
	"      --mcp-path, --mcp-oauth-issuer (Instance token authenticates MCP)\n" +
	"      --mcp-request-timeout-ms, --mcp-max-concurrency, --mcp-max-request-bytes\n" +
	"      --mcp-script-timeout-ms, --mcp-script-memory-mb, --mcp-script-max-code-bytes\n" +
	"      --mcp-script-max-calls, --mcp-script-max-streams, --mcp-script-max-output-bytes\n" +
	"      --mcp-preview-max-items, --mcp-preview-cache-entries, --mcp-preview-cache-ttl-ms\n" +
	"      Config environment: KGOSD_* and KGOS_MCP_*\n" +
	"  -h, --help     Show this help\n" +
	"  -V, --version  Show the installed version\n"

type DaemonMode uint8

const (
	DaemonModeResult DaemonMode = iota
	DaemonModeRun
	DaemonModeInit
)

type DaemonEvaluation struct {
	Mode     DaemonMode
	Root     string
	Result   Result
	Settings DaemonSettings
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
	mode := DaemonModeRun
	if len(args) > 0 && args[0] == "init" {
		mode = DaemonModeInit
		args = args[1:]
	}
	if mode == DaemonModeInit {
		if len(args) == 2 && args[0] == "--root" && args[1] != "" {
			return DaemonEvaluation{Mode: DaemonModeInit, Root: args[1]}
		}
		return DaemonEvaluation{Mode: DaemonModeResult, Result: Result{ExitCode: 2, Stderr: "kgosd: init requires --root <absolute-workspace-root>\n"}}
	}
	settings, root, err := parseDaemonSettings(args, os.LookupEnv)
	if err != nil {
		return DaemonEvaluation{Mode: DaemonModeResult, Result: Result{ExitCode: 2, Stderr: "kgosd: " + err.Error() + "\n"}}
	}
	return DaemonEvaluation{Mode: mode, Root: root, Settings: settings}
}
