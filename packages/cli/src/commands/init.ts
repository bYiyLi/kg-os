import { link, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";

import { parseOptions } from "../args.js";
import {
  INIT_FIELDS,
  RECOMMENDED_CONFIG,
  configPath,
  encodeConfig,
  parseConfig,
  type InstanceConfig
} from "../config.js";
import { CLIError, localIOError, usageError } from "../errors.js";
import { outputJSON } from "../io.js";

export async function runInit(root: string, args: readonly string[]): Promise<void> {
  const parsed = parseOptions(args, { boolean: ["--pretty"], value: INIT_FIELDS });
  if (parsed.positionals.length !== 0) {
    throw usageError("init does not accept positional arguments");
  }
  const existing = await readExistingConfig(root);
  const pretty = parsed.booleans.has("--pretty");
  if (existing !== undefined) {
    parseConfig(root, existing);
    if (parsed.values.size !== 0) {
      throw usageError("configuration options cannot be provided for an initialized Instance");
    }
    writeInitSuccess(root, "already_initialized", pretty);
    return;
  }

  const values = new Map(parsed.values);
  if (!values.has("--fulltext-analyzer")) {
    values.set("--fulltext-analyzer", RECOMMENDED_CONFIG["--fulltext-analyzer"]);
  }
  const missing = INIT_FIELDS.filter((field) => !values.has(field));
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (interactive && missing.length !== 0 && pretty) {
    throw usageError("--pretty is not valid with interactive init prompts");
  }
  if (missing.length !== 0 && !interactive) {
    throw new CLIError(
      "INIT_CONFIGURATION_INCOMPLETE",
      "all initialization settings must be provided in non-interactive mode",
      2,
      { missing: [...missing].sort() }
    );
  }
  if (missing.length !== 0) {
    await promptMissing(values, missing);
  }
  const sourceConfig = buildConfig(values);
  const body = encodeConfig(sourceConfig);
  const normalized = parseConfig(root, body);
  await publishConfig(root, normalized, body);
  if (interactive && missing.length !== 0) {
    process.stdout.write(successMessage(root));
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

async function promptMissing(
  values: Map<string, string>,
  missing: readonly (typeof INIT_FIELDS)[number][]
): Promise<void> {
  const locale = detectLocale();
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    let warned = false;
    for (const field of missing) {
      if (!warned && (field === "--fulltext-analyzer" || field.startsWith("--embedding-"))) {
        process.stdout.write(immutabilityWarning(locale));
        warned = true;
      }
      const recommended = RECOMMENDED_CONFIG[field];
      const answer = await readline.question(promptText(locale, field, recommended));
      values.set(field, answer === "" ? recommended : answer);
    }
  } finally {
    readline.close();
  }
}

function buildConfig(values: Map<string, string>): InstanceConfig {
  const similarity = values.get("--embedding-similarity");
  if (similarity !== "cosine" && similarity !== "euclidean") {
    throw usageError("--embedding-similarity must be cosine or euclidean");
  }
  return {
    cache: {
      path: required(values, "--cache-path"),
      max_size_mb: parseInteger(values, "--cache-max-size-mb", 1, Number.MAX_SAFE_INTEGER)
    },
    fulltext: { analyzer: required(values, "--fulltext-analyzer") },
    embedding: {
      base_url: required(values, "--embedding-base-url"),
      model: required(values, "--embedding-model"),
      dimensions: parseInteger(values, "--embedding-dimensions", 1, 4096),
      similarity,
      api_key_env: values.get("--embedding-api-key-env") ?? ""
    }
  };
}

async function publishConfig(root: string, config: InstanceConfig, body: string): Promise<void> {
  await mkdir(root, { recursive: true, mode: 0o700 }).catch(() => {
    throw localIOError("create instance root failed");
  });
  await Promise.all([
    mkdir(join(root, "cache"), { recursive: true, mode: 0o700 }),
    mkdir(join(root, "extensions"), { recursive: true, mode: 0o700 }),
    mkdir(join(root, "logs"), { recursive: true, mode: 0o700 }),
    mkdir(dirname(config.cache.path), { recursive: true, mode: 0o700 })
  ]).catch(() => {
    throw localIOError("create instance directories failed");
  });

  const temporary = join(root, `.config-${String(process.pid)}-${String(Date.now())}.tmp`);
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

function parseInteger(
  values: Map<string, string>,
  name: string,
  minimum: number,
  maximum: number
): number {
  const value = Number(values.get(name));
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw usageError(
      `${name} must be an integer between ${String(minimum)} and ${String(maximum)}`
    );
  }
  return value;
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined || value.length === 0) {
    throw usageError(name + " is required");
  }
  return value;
}

function writeInitSuccess(
  root: string,
  status: "initialized" | "already_initialized",
  pretty: boolean
): void {
  outputJSON({ status, root }, pretty);
}

function detectLocale(): "en" | "zh" {
  for (const name of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const value = process.env[name]?.trim();
    if (value === undefined || value === "") {
      continue;
    }
    return /^zh(?:_|-|\b)/iu.test(value) ? "zh" : "en";
  }
  return "en";
}

function immutabilityWarning(locale: "en" | "zh"): string {
  return locale === "zh"
    ? "以下配置初始化后禁止修改。\n"
    : "The following settings must not be changed after initialization.\n";
}

function promptText(locale: "en" | "zh", field: string, recommended: string): string {
  return locale === "zh"
    ? field + "（推荐 " + recommended + "）: "
    : field + " (recommended " + recommended + "): ";
}

function successMessage(root: string): string {
  return detectLocale() === "zh"
    ? "KG OS 已初始化到 " + root + "。\n"
    : "KG OS initialized in " + root + ".\n";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
