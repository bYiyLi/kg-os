export const KGOS_VERSION = "0.0.0";
export const PRODUCT_NAME = "KG OS";
export const CLI_NAME = "kg";
export const DAEMON_NAME = "kgosd";

export interface Phase0CommandConfig {
  readonly help: string;
  readonly unsupported: string;
  readonly version: string;
}

export interface Phase0CommandResult {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
}

export function evaluatePhase0Command(
  args: readonly string[],
  config: Phase0CommandConfig
): Phase0CommandResult {
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    return { exitCode: 0, stderr: "", stdout: config.help };
  }

  if (args.length === 1 && (args[0] === "--version" || args[0] === "-V")) {
    return { exitCode: 0, stderr: "", stdout: `${config.version}\n` };
  }

  return { exitCode: 2, stderr: config.unsupported, stdout: "" };
}

export type JsonPrimitive = boolean | null | number | string;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
