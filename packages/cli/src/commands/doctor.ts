import { parseOptions } from "../args.js";
import { usageError } from "../errors.js";
import { outputJSON } from "../io.js";
import { hasLegacyInstanceLayout, resolveWorkspacePaths } from "../paths.js";
import {
  diagnoseConfig,
  diagnoseCredential,
  diagnoseDaemon,
  diagnoseDatabase,
  diagnoseEnvironment,
  diagnoseInitialization,
  diagnoseRuntimePackage,
  directoryState,
  instanceCheck,
  legacyCheck,
  workspaceCheck
} from "./doctor-checks.js";
import { diagnoseExtensions } from "./doctor-extensions.js";
import type { DoctorCheck } from "./doctor-types.js";

interface DoctorResult {
  ready: boolean;
  root: string;
  instance: string;
  checks: DoctorCheck[];
}

export async function runDoctor(root: string, args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args, { boolean: ["--json", "--pretty"] });
  if (parsed.positionals.length !== 0) {
    throw usageError("doctor does not accept positional arguments");
  }
  const pretty = parsed.booleans.has("--pretty");
  if (pretty && !parsed.booleans.has("--json")) {
    throw usageError("--pretty requires --json for doctor");
  }
  const result = await diagnose(root);
  if (parsed.booleans.has("--json")) {
    outputJSON(result, pretty);
    return;
  }
  writeHumanDoctor(result);
}

export async function diagnose(root: string): Promise<DoctorResult> {
  const paths = resolveWorkspacePaths(root);
  const workspaceState = await directoryState(paths.workspaceRoot);
  const instanceState = await directoryState(paths.instanceRoot);
  const legacy = await hasLegacyInstanceLayout(root);
  const config = await diagnoseConfig(root, instanceState);
  const runtime = await diagnoseRuntimePackage();
  const credential = await diagnoseCredential(root, paths.auth);
  const checks = [
    workspaceCheck(paths.workspaceRoot, workspaceState),
    instanceCheck(paths.instanceRoot, instanceState),
    legacyCheck(legacy),
    config.check,
    runtime.check,
    await diagnoseExtensions(paths.extensionsDir, config.config, runtime.runtime),
    diagnoseEnvironment(config.config),
    credential.check,
    await diagnoseDatabase(paths.database),
    await diagnoseInitialization(root),
    await diagnoseDaemon(root, instanceState, credential.exists)
  ];
  return {
    ready: !checks.some(isBlockingError),
    root,
    instance: paths.instanceRoot,
    checks
  };
}

function writeHumanDoctor(result: DoctorResult): void {
  process.stdout.write(`Workspace: ${result.root}\nInstance: ${result.instance}\n`);
  const blocker = result.checks.find(isBlockingError);
  if (blocker !== undefined) {
    process.stdout.write(`Blocker: ${blocker.id}: ${blocker.message}\n`);
  }
  for (const check of result.checks) {
    process.stdout.write(formatCheck(check));
  }
  process.stdout.write(result.ready ? "ready\n" : "not ready\n");
}

function formatCheck(check: DoctorCheck): string {
  const suffix = check.blocking ? " (blocking)" : "";
  return `[${check.status}] ${check.id}: ${check.message}${suffix}\n`;
}

function isBlockingError(check: DoctorCheck): boolean {
  return check.blocking && check.status === "error";
}
