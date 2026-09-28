import { createInterface, type Interface } from "node:readline/promises";

import {
  buildConfigFromInitValues,
  classifyExtensionSource,
  parseExtensionsJSON,
  validateRequiredEnvironment,
  type ExtensionConfig,
  type InstanceConfig
} from "./config.js";
import { usageError } from "./errors.js";
import { INIT_FIELD_SPECS, type InitField, type InitFieldSpec } from "./init-schema.js";
import { resolveWorkspacePaths, type WorkspacePaths } from "./paths.js";
import type { NativeRuntime } from "./runtime.js";

type Locale = "en" | "zh";

export interface InitWizardOptions {
  root: string;
  values: Map<string, string>;
  initialExtensions: ExtensionConfig[];
  extensionsResolved: boolean;
  runtime: NativeRuntime;
}

export async function runInitWizard(options: InitWizardOptions): Promise<ExtensionConfig[]> {
  const locale = detectLocale();
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    renderWorkspaceAndRuntime(locale, options.root, options.runtime);
    await promptFieldGroup(readline, locale, options.values, "cache");
    const extensions = await resolveWizardExtensions(readline, locale, options);
    renderFullText(locale, options.values);
    await promptFieldGroup(readline, locale, options.values, "embedding");
    await reviewAndConfirm(readline, locale, {
      root: options.root,
      values: options.values,
      extensions
    });
    process.stdout.write(section(locale, "Initialize", "初始化"));
    return extensions;
  } finally {
    readline.close();
  }
}

export function initWizardSuccessMessage(root: string): string {
  const paths = resolveWorkspacePaths(root);
  if (detectLocale() === "zh") {
    return (
      "Configuration / Extensions / Credential / Knowledge Base / Runtime: ready\n" +
      `KG OS 已初始化：${paths.instanceRoot}\n`
    );
  }
  return (
    "Configuration / Extensions / Credential / Knowledge Base / Runtime: ready\n" +
    `KG OS initialized: ${paths.instanceRoot}\n`
  );
}

function renderWorkspaceAndRuntime(locale: Locale, root: string, runtime: NativeRuntime): void {
  const paths = resolveWorkspacePaths(root);
  process.stdout.write(
    section(locale, "Workspace / Instance", "Workspace / Instance") +
      `  Workspace: ${paths.workspaceRoot}\n  Instance:  ${paths.instanceRoot}\n`
  );
  process.stdout.write(
    section(locale, "Runtime", "Runtime") + `  ${runtime.name} ${runtime.version}\n`
  );
}

async function promptFieldGroup(
  readline: Interface,
  locale: Locale,
  values: Map<string, string>,
  group: "cache" | "embedding"
): Promise<void> {
  process.stdout.write(
    group === "cache" ? section(locale, "Cache", "缓存") : section(locale, "Embedding", "Embedding")
  );
  const specs = INIT_FIELD_SPECS.filter((item) => item.section === group);
  for (const spec of specs) {
    if (!values.has(spec.flag)) {
      values.set(spec.flag, await promptField(readline, locale, spec));
    }
  }
}

async function resolveWizardExtensions(
  readline: Interface,
  locale: Locale,
  options: InitWizardOptions
): Promise<ExtensionConfig[]> {
  process.stdout.write(section(locale, "Additional extensions", "附加扩展"));
  if (options.extensionsResolved) {
    renderConfiguredExtensions(locale, options.initialExtensions.length);
    return options.initialExtensions;
  }
  const prompt = locale === "zh" ? "添加附加 SQLite 扩展？" : "Add additional SQLite extensions?";
  const add = await askYesNo(readline, prompt, false);
  return add ? await promptExtensions(readline, locale) : [];
}

function renderConfiguredExtensions(locale: Locale, count: number): void {
  const message =
    locale === "zh"
      ? `  已配置 ${String(count)} 个附加扩展\n`
      : `  ${String(count)} additional extension(s) configured\n`;
  process.stdout.write(message);
}

function renderFullText(locale: Locale, values: ReadonlyMap<string, string>): void {
  process.stdout.write(section(locale, "Full-text", "全文检索"));
  process.stdout.write(immutabilityWarning(locale));
  const analyzer = values.get("--fulltext-analyzer") ?? "jieba";
  process.stdout.write(`  ${fieldLabel(locale, "--fulltext-analyzer")}: ${analyzer}\n`);
}

async function reviewAndConfirm(
  readline: Interface,
  locale: Locale,
  input: {
    root: string;
    values: ReadonlyMap<string, string>;
    extensions: readonly ExtensionConfig[];
  }
): Promise<void> {
  const built = buildConfigFromInitValues(input.root, input.values, input.extensions);
  validateRequiredEnvironment(built.normalized);
  process.stdout.write(section(locale, "Review", "确认配置"));
  process.stdout.write(
    reviewText(locale, resolveWorkspacePaths(input.root), built.normalized, input.extensions)
  );
  const prompt = locale === "zh" ? "开始初始化？" : "Initialize now?";
  if (!(await askYesNo(readline, prompt, true))) {
    throw usageError(locale === "zh" ? "初始化已取消" : "initialization cancelled");
  }
}

async function promptField(
  readline: Interface,
  locale: Locale,
  spec: InitFieldSpec
): Promise<string> {
  const answer = await readline.question(promptText(locale, spec));
  if (answer === "") return spec.recommended;
  if (spec.flag === "--embedding-api-key-env" && answer === '""') return "";
  return answer;
}

async function promptExtensions(readline: Interface, locale: Locale): Promise<ExtensionConfig[]> {
  const extensions: ExtensionConfig[] = [];
  for (;;) {
    extensions.push(await promptExtension(readline));
    const prompt = locale === "zh" ? "继续添加扩展？" : "Add another extension?";
    if (!(await askYesNo(readline, prompt, false))) return extensions;
  }
}

async function promptExtension(readline: Interface): Promise<ExtensionConfig> {
  const source = await readline.question("  Source: ");
  const entrypoint = await readline.question("  Entrypoint: ");
  const candidate: Record<string, string> = { source, entrypoint };
  const sourceClass = classifyExtensionSource(source);
  if (sourceClass.archive) candidate["library"] = await readline.question("  Library: ");
  if (sourceClass.remote) candidate["sha256"] = await readline.question("  SHA-256: ");
  const [extension] = parseExtensionsJSON(JSON.stringify([candidate]));
  if (extension === undefined) throw usageError("extension entry is required");
  return extension;
}

async function askYesNo(
  readline: Interface,
  prompt: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]: " : " [y/N]: ";
  const answer = (await readline.question(prompt + suffix)).trim().toLowerCase();
  if (answer === "") return defaultValue;
  if (answer === "y" || answer === "yes") return true;
  if (answer === "n" || answer === "no") return false;
  throw usageError("expected yes or no");
}

function detectLocale(): Locale {
  for (const name of ["LC_ALL", "LC_MESSAGES", "LANG"]) {
    const value = process.env[name]?.trim();
    if (value !== undefined && value !== "") return /^zh(?:_|-|\b)/iu.test(value) ? "zh" : "en";
  }
  return "en";
}

function immutabilityWarning(locale: Locale): string {
  if (locale === "zh") return "以下配置初始化后禁止修改。\n";
  return "The following settings must not be changed after initialization.\n";
}

function promptText(locale: Locale, spec: InitFieldSpec): string {
  const label = spec.label[locale];
  if (locale === "zh") return `  ${label}（推荐 ${spec.recommended}）: `;
  return `  ${label} (recommended ${spec.recommended}): `;
}

function fieldLabel(locale: Locale, flag: InitField): string {
  return INIT_FIELD_SPECS.find((item) => item.flag === flag)?.label[locale] ?? flag;
}

function section(locale: Locale, en: string, zh: string): string {
  return "\n" + (locale === "zh" ? zh : en) + "\n";
}

function reviewText(
  locale: Locale,
  paths: WorkspacePaths,
  config: InstanceConfig,
  extensions: readonly ExtensionConfig[]
): string {
  const credential = credentialLabel(locale, config.embedding.api_key_env);
  return [
    `  Workspace: ${paths.workspaceRoot}`,
    `  Instance: ${paths.instanceRoot}`,
    `  Cache: ${config.cache.path} (${String(config.cache.max_size_mb)} MiB)`,
    `  Additional extensions: ${String(extensions.length)}`,
    `  Full-text: ${config.fulltext.analyzer}`,
    `  Embedding: ${config.embedding.base_url} | ${config.embedding.model} | ${String(config.embedding.dimensions)} | ${config.embedding.similarity}`,
    `  Credential env: ${credential}`,
    ""
  ].join("\n");
}

function credentialLabel(locale: Locale, environmentName: string): string {
  if (environmentName !== "") return environmentName;
  return locale === "zh" ? "无需认证" : "no authentication";
}
