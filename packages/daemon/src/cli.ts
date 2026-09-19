import {
  DAEMON_NAME,
  evaluatePhase0Command,
  KGOS_VERSION,
  PRODUCT_NAME,
  type Phase0CommandResult
} from "@kgos/contracts";

export type DaemonCliResult = Phase0CommandResult;

const HELP = `${PRODUCT_NAME} daemon

Usage: ${DAEMON_NAME} [--help] [--version]

Options:
  -h, --help     Show this help
  -V, --version  Show the installed version

Phase 0 provides the host executable and bundled Web assets. The production daemon lifecycle is not implemented yet.
`;

export function evaluateDaemonCli(args: readonly string[]): DaemonCliResult {
  return evaluatePhase0Command(args, {
    help: HELP,
    unsupported: `${DAEMON_NAME}: production lifecycle is not implemented in Phase 0\n`,
    version: KGOS_VERSION
  });
}
