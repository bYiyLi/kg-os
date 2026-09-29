import { access, link, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { parseOptions, type ParsedOptions } from "../args.js";
import {
  buildConfigFromInitValues,
  configPath,
  parseExtensionsJSON,
  parseConfig,
  type ExtensionConfig,
  type InstanceConfig
} from "../config.js";
import { CLIError, localIOError, usageError } from "../errors.js";
import { outputJSON } from "../io.js";
import { initWizardSuccessMessage, runInitWizard } from "../init-wizard.js";
import { INIT_FIELD_SPECS, INIT_FIELDS } from "../init-schema.js";
import {
  hasLegacyInstanceLayout,
  isInitializationComplete,
  markInitializationComplete,
  resolveWorkspacePaths
} from "../paths.js";
import { initializeClient, resolveNativeRuntime, type NativeRuntime } from "../runtime.js";

export async function runInit(root: string, args: readonly string[]): Promise<void> {
  const parsed = parseInitOptions(args);
  await assertSupportedLayout(root);
  const existing = await readExistingConfig(root);
  const pretty = parsed.booleans.has("--pretty");
  if (existing !== undefined) {
    await resumeInit(root, existing, parsed, pretty);
    return;
  }
  await initializeFresh(root, parsed, pretty);
}

function parseInitOptions(args: readonly string[]): ParsedOptions {
  const parsed = parseOptions(args, {
    boolean: ["--pretty", "--no-additional-extensions"],
    value: [...INIT_FIELDS, "--extensions-file"]
  });
  if (parsed.positionals.length !== 0) {
    throw usageError("init does not accept positional arguments");
  }
  if (parsed.booleans.has("--no-additional-extensions") && parsed.values.has("--extensions-file")) {
    throw usageError("--extensions-file and --no-additional-extensions are mutually exclusive");
  }
  return parsed;
}

async function assertSupportedLayout(root: string): Promise<void> {
  if (!(await hasLegacyInstanceLayout(root))) return;
  throw usageError(
    "legacy v0.1.x Instance layout detected at the Workspace Root; move or rebuild it explicitly before init",
    { root, instance: resolveWorkspacePaths(root).instanceRoot }
  );
}

async function resumeInit(
  root: string,
  body: string,
  parsed: ParsedOptions,
  pretty: boolean
): Promise<void> {
  if (hasConfigurationOptions(parsed)) {
    throw usageError("configuration options cannot be provided for an initialized Instance");
  }
  parseConfig(root, body);
  const runtime = await resolveNativeRuntime();
  if (await isInitializationComplete(root)) {
    await assertCompletedArtifacts(root);
    await initializeClient(root, runtime);
    writeInitSuccess(root, "already_initialized", pretty);
    return;
  }
  await initializeClient(root, runtime);
  await markInitializationComplete(root);
  writeInitSuccess(root, "initialized", pretty);
}

function hasConfigurationOptions(parsed: ParsedOptions): boolean {
  return parsed.values.size !== 0 || parsed.booleans.has("--no-additional-extensions");
}

async function initializeFresh(
  root: string,
  parsed: ParsedOptions,
  pretty: boolean
): Promise<void> {
  const values = collectInitValues(parsed);
  const missing = missingInitSpecs(values);
  const extensionsResolved = hasExtensionSelection(parsed);
  const entersWizard = shouldEnterWizard(missing.length !== 0 || !extensionsResolved);
  validatePromptMode(entersWizard, pretty, missing, extensionsResolved);

  let runtime: NativeRuntime | undefined;
  let extensions = await resolveFlagExtensions(parsed.values.get("--extensions-file"));
  if (entersWizard) {
    runtime = await resolveNativeRuntime();
    extensions = await runInitWizard({
      root,
      values,
      initialExtensions: extensions,
      extensionsResolved,
      runtime
    });
  }
  await completeFreshInitialization(root, values, extensions, runtime);
  writeFreshSuccess(root, pretty, entersWizard);
}

function collectInitValues(parsed: ParsedOptions): Map<string, string> {
  const values = new Map<string, string>();
  for (const field of INIT_FIELDS) {
    const value = parsed.values.get(field);
    if (value !== undefined) values.set(field, value);
  }
  for (const spec of INIT_FIELD_SPECS) {
    if (spec.automaticDefault && !values.has(spec.flag)) values.set(spec.flag, spec.recommended);
  }
  return values;
}

function missingInitSpecs(
  values: ReadonlyMap<string, string>
): (typeof INIT_FIELD_SPECS)[number][] {
  return INIT_FIELD_SPECS.filter((spec) => !spec.automaticDefault && !values.has(spec.flag));
}

function hasExtensionSelection(parsed: ParsedOptions): boolean {
  return (
    parsed.values.has("--extensions-file") || parsed.booleans.has("--no-additional-extensions")
  );
}

function shouldEnterWizard(hasMissingInput: boolean): boolean {
  return process.stdin.isTTY && process.stdout.isTTY && hasMissingInput;
}

function validatePromptMode(
  entersWizard: boolean,
  pretty: boolean,
  missingSpecs: readonly (typeof INIT_FIELD_SPECS)[number][],
  extensionsResolved: boolean
): void {
  if (entersWizard && pretty) {
    throw usageError("--pretty is not valid with interactive init prompts");
  }
  if (process.stdin.isTTY && process.stdout.isTTY) return;
  if (missingSpecs.length === 0 && extensionsResolved) return;
  const missing = missingSpecs.map((spec) => `${spec.section}.${spec.key}`);
  if (!extensionsResolved) missing.push("sqlite.extensions");
  throw new CLIError(
    "INIT_CONFIGURATION_INCOMPLETE",
    "all initialization settings must be provided in non-interactive mode",
    2,
    { missing: missing.sort() }
  );
}

async function completeFreshInitialization(
  root: string,
  values: ReadonlyMap<string, string>,
  extensions: readonly ExtensionConfig[],
  runtime: NativeRuntime | undefined
): Promise<void> {
  const built = buildConfigFromInitValues(root, values, extensions);
  await publishConfig(root, built.normalized, built.body);
  const resolvedRuntime = runtime ?? (await resolveNativeRuntime());
  await initializeClient(root, resolvedRuntime);
  await markInitializationComplete(root);
}

function writeFreshSuccess(root: string, pretty: boolean, enteredWizard: boolean): void {
  if (enteredWizard) {
    process.stdout.write(initWizardSuccessMessage(root));
    return;
  }
  writeInitSuccess(root, "initialized", pretty);
}

async function readExistingConfig(root: string): Promise<string | undefined> {
  try {
    return await readFile(configPath(root), "utf8");
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw localIOError("config.toml cannot be read");
  }
}

async function resolveFlagExtensions(path: string | undefined): Promise<ExtensionConfig[]> {
  if (path === undefined) {
    return [];
  }
  let body: string;
  try {
    body = await readFile(path, "utf8");
  } catch {
    throw localIOError("read --extensions-file failed", { path });
  }
  return parseExtensionsJSON(body);
}

async function publishConfig(root: string, config: InstanceConfig, body: string): Promise<void> {
  const paths = resolveWorkspacePaths(root);
  await mkdir(paths.workspaceRoot, { recursive: true, mode: 0o700 }).catch(() => {
    throw localIOError("create Workspace Root failed");
  });
  await Promise.all([
    mkdir(paths.instanceRoot, { recursive: true, mode: 0o700 }),
    mkdir(paths.cacheDir, { recursive: true, mode: 0o700 }),
    mkdir(paths.extensionsDir, { recursive: true, mode: 0o700 }),
    mkdir(paths.logsDir, { recursive: true, mode: 0o700 }),
    mkdir(dirname(config.cache.path), { recursive: true, mode: 0o700 })
  ]).catch(() => {
    throw localIOError("create Instance directories failed");
  });

  const temporary = join(
    paths.instanceRoot,
    `.config-${String(process.pid)}-${String(Date.now())}.tmp`
  );
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(body, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await link(temporary, configPath(root)).catch((error: unknown) => {
      if (isNodeError(error) && error.code === "EEXIST") {
        throw usageError("Instance was initialized concurrently");
      }
      throw localIOError("publish config.toml failed");
    });
  } finally {
    await handle?.close().catch(() => undefined);
    await rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function assertCompletedArtifacts(root: string): Promise<void> {
  const paths = resolveWorkspacePaths(root);
  for (const [label, path] of [
    ["auth.json", paths.auth],
    ["kgos.db", paths.database]
  ] as const) {
    try {
      await access(path);
    } catch {
      throw localIOError(`initialized Instance is missing ${label}`);
    }
  }
}

function writeInitSuccess(
  root: string,
  status: "initialized" | "already_initialized",
  pretty: boolean
): void {
  outputJSON({ status, root, instance: resolveWorkspacePaths(root).instanceRoot }, pretty);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
