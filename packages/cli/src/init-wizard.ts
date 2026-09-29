import { createInterface, type Interface } from "node:readline/promises";

import {
  buildConfigFromInitValues,
  classifyExtensionSource,
  parseExtensionsJSON,
  validateExtensionEntrypoint,
  validateExtensionLibraryPath,
  validateExtensionSHA256,
  validateInitFieldInput,
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
    await promptFieldGroup(readline, locale, options, "cache");
    const extensions = await resolveWizardExtensions(readline, locale, options);
    renderFullText(locale, options.values);
    await promptFieldGroup(readline, locale, options, "embedding");
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
      "Configuration / Extensions / Instance auth / Knowledge Base / Runtime: ready\n" +
      `KG OS 已初始化：${paths.instanceRoot}\n`
    );
  }
  return (
    "Configuration / Extensions / Instance auth / Knowledge Base / Runtime: ready\n" +
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
  options: Pick<InitWizardOptions, "root" | "values">,
  group: "cache" | "embedding"
): Promise<void> {
  process.stdout.write(
    group === "cache" ? section(locale, "Cache", "缓存") : section(locale, "Embedding", "Embedding")
  );
  const specs = INIT_FIELD_SPECS.filter((item) => item.section === group);
  for (const spec of specs) {
    if (!options.values.has(spec.flag)) {
      options.values.set(spec.flag, await promptField(readline, locale, options.root, spec));
    }
  }
}

async function resolveWizardExtensions(
  readline: Interface,
  locale: Locale,
  options: InitWizardOptions
): Promise<ExtensionConfig[]> {
  process.stdout.write(section(locale, "Custom SQLite extensions", "自定义 SQLite 扩展"));
  if (options.extensionsResolved) {
    renderConfiguredExtensions(locale, options.initialExtensions.length);
    return options.initialExtensions;
  }
  process.stdout.write(
    locale === "zh"
      ? "  Lithograph、OpenAI-compatible Provider 与 Jieba 已由 Runtime 自动提供。\n"
      : "  Lithograph, the OpenAI-compatible Provider, and Jieba are provided automatically by the Runtime.\n"
  );
  const prompt =
    locale === "zh"
      ? "添加额外的第三方/自定义 SQLite 扩展？"
      : "Add an extra third-party/custom SQLite extension?";
  const add = await askYesNo(readline, locale, prompt, false);
  return add ? await promptExtensions(readline, locale) : [];
}

function renderConfiguredExtensions(locale: Locale, count: number): void {
  const message =
    locale === "zh"
      ? `  已配置 ${String(count)} 个自定义 SQLite 扩展\n`
      : `  ${String(count)} custom SQLite extension(s) configured\n`;
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
  process.stdout.write(section(locale, "Review", "确认配置"));
  process.stdout.write(
    reviewText(locale, resolveWorkspacePaths(input.root), built.normalized, input.extensions)
  );
  const prompt = locale === "zh" ? "开始初始化？" : "Initialize now?";
  if (!(await askYesNo(readline, locale, prompt, true))) {
    throw usageError(locale === "zh" ? "初始化已取消" : "initialization cancelled");
  }
}

async function promptField(
  readline: Interface,
  locale: Locale,
  root: string,
  spec: InitFieldSpec
): Promise<string> {
  for (;;) {
    const answer = await readline.question(promptText(locale, spec));
    const value = promptValue(spec, answer);
    try {
      validateInitFieldInput(root, spec, value);
      return value;
    } catch (error) {
      renderValidationError(locale, error);
    }
  }
}

function promptValue(spec: InitFieldSpec, answer: string): string {
  if (answer === "") return spec.recommended;
  if (spec.flag === "--embedding-api-key-env" && answer === '""') return "";
  return answer;
}

async function promptExtensions(readline: Interface, locale: Locale): Promise<ExtensionConfig[]> {
  const extensions: ExtensionConfig[] = [];
  for (;;) {
    extensions.push(await promptExtension(readline, locale));
    const prompt = locale === "zh" ? "继续添加扩展？" : "Add another extension?";
    if (!(await askYesNo(readline, locale, prompt, false))) return extensions;
  }
}

async function promptExtension(readline: Interface, locale: Locale): Promise<ExtensionConfig> {
  let source = "";
  let sourceClass: ReturnType<typeof classifyExtensionSource> | undefined;
  while (sourceClass === undefined) {
    source = await readline.question(
      locale === "zh"
        ? "  来源（绝对本地路径或 HTTPS URL）: "
        : "  Source (absolute local path or HTTPS URL): "
    );
    try {
      sourceClass = classifyExtensionSource(source);
    } catch (error) {
      renderValidationError(locale, error);
    }
  }
  const entrypoint = await promptValidatedText(
    readline,
    locale,
    locale === "zh"
      ? "  入口函数（SQLite extension init symbol）: "
      : "  Entrypoint (SQLite extension init symbol): ",
    validateExtensionEntrypoint
  );
  const candidate: Record<string, string> = { source, entrypoint };
  if (sourceClass.archive) {
    candidate["library"] = await promptValidatedText(
      readline,
      locale,
      locale === "zh"
        ? "  库文件（archive 内的安全相对路径）: "
        : "  Library (safe relative path inside archive): ",
      validateExtensionLibraryPath
    );
  }
  if (sourceClass.remote) {
    candidate["sha256"] = await promptValidatedText(
      readline,
      locale,
      locale === "zh" ? "  SHA-256（64 位小写十六进制）: " : "  SHA-256 (64 lowercase hex): ",
      validateExtensionSHA256
    );
  }
  const [extension] = parseExtensionsJSON(JSON.stringify([candidate]));
  if (extension === undefined) throw usageError("extension entry is required");
  return extension;
}

async function askYesNo(
  readline: Interface,
  locale: Locale,
  prompt: string,
  defaultValue: boolean
): Promise<boolean> {
  const suffix = defaultValue ? " [Y/n]: " : " [y/N]: ";
  for (;;) {
    const answer = (await readline.question(prompt + suffix)).trim().toLowerCase();
    if (answer === "") return defaultValue;
    if (answer === "y" || answer === "yes") return true;
    if (answer === "n" || answer === "no") return false;
    renderValidationError(
      locale,
      usageError(locale === "zh" ? "请输入 yes 或 no" : "expected yes or no")
    );
  }
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
  return `  ${label} [${spec.recommended}]: `;
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
  const customLabel = locale === "zh" ? "自定义 SQLite 扩展" : "Custom SQLite extensions";
  const lines = [
    "  Workspace / Instance",
    `    Workspace: ${paths.workspaceRoot}`,
    `    Instance: ${paths.instanceRoot}`,
    locale === "zh" ? "  缓存" : "  Cache",
    `    ${fieldLabel(locale, "--cache-path")}: ${config.cache.path}`,
    `    ${fieldLabel(locale, "--cache-max-size-mb")}: ${String(config.cache.max_size_mb)} MiB`,
    `  ${customLabel}`,
    `    ${locale === "zh" ? "数量" : "Count"}: ${String(extensions.length)}`
  ];
  extensions.forEach((extension, index) => {
    lines.push(
      `    [${String(index + 1)}] ${locale === "zh" ? "来源" : "Source"}: ${extension.source}`,
      `        ${locale === "zh" ? "入口函数" : "Entrypoint"}: ${extension.entrypoint}`
    );
    if (extension.library !== undefined) {
      lines.push(`        ${locale === "zh" ? "库文件" : "Library"}: ${extension.library}`);
    }
    if (extension.sha256 !== undefined) lines.push(`        SHA-256: ${extension.sha256}`);
  });
  lines.push(
    locale === "zh" ? "  全文检索" : "  Full-text",
    `    ${fieldLabel(locale, "--fulltext-analyzer")}: ${config.fulltext.analyzer}`,
    "  Embedding",
    `    ${fieldLabel(locale, "--embedding-base-url")}: ${config.embedding.base_url}`,
    `    ${fieldLabel(locale, "--embedding-model")}: ${config.embedding.model}`,
    `    ${fieldLabel(locale, "--embedding-dimensions")}: ${String(config.embedding.dimensions)}`,
    `    ${fieldLabel(locale, "--embedding-similarity")}: ${config.embedding.similarity}`,
    `    ${locale === "zh" ? "凭证环境变量名" : "Credential env name"}: ${credential}`,
    ""
  );
  return lines.join("\n");
}

function credentialLabel(locale: Locale, environmentName: string): string {
  if (environmentName !== "") return environmentName;
  return locale === "zh" ? "无需认证" : "no authentication";
}

async function promptValidatedText(
  readline: Interface,
  locale: Locale,
  prompt: string,
  validate: (value: string) => void
): Promise<string> {
  for (;;) {
    const value = await readline.question(prompt);
    try {
      validate(value);
      return value;
    } catch (error) {
      renderValidationError(locale, error);
    }
  }
}

function renderValidationError(locale: Locale, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`  ${locale === "zh" ? "输入无效" : "Invalid input"}: ${message}\n`);
}
