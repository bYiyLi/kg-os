import {
  CLI_NAME,
  evaluatePhase0Command,
  KGOS_VERSION,
  PRODUCT_NAME,
  type Phase0CommandResult
} from "@kgos/sdk";

export type CliResult = Phase0CommandResult;

const HELP = `${PRODUCT_NAME} command-line client

Usage: ${CLI_NAME} [--help] [--version]

Options:
  -h, --help     Show this help
  -V, --version  Show the installed version

Phase 0 provides the executable and development environment. Business commands are not implemented yet.
`;

export function evaluateCli(args: readonly string[]): CliResult {
  return evaluatePhase0Command(args, {
    help: HELP,
    unsupported: `${CLI_NAME}: unsupported Phase 0 argument: ${args.join(" ")}\n`,
    version: KGOS_VERSION
  });
}
