import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parse, stringify } from "smol-toml";

import { localIOError, usageError } from "./errors.js";
import { INIT_FIELD_SPECS, type InitField } from "./init-schema.js";
import { resolveWorkspacePaths } from "./paths.js";

export interface InstanceConfig {
  cache: { path: string; max_size_mb: number };
  sqlite?: { extensions?: ExtensionConfig[] };
  fulltext: { analyzer: string };
  embedding: {
    base_url: string;
    model: string;
    dimensions: number;
    similarity: "cosine" | "euclidean";
    api_key_env: string;
  };
}

export interface ExtensionConfig {
  source: string;
  library?: string;
  entrypoint: string;
  sha256?: string;
}

const OFFICIAL_ENTRYPOINTS = new Set([
  "sqlite3_lithograph_init",
  "sqlite3_lithographopenaicompatible_init",
  "sqlite3_kgosjieba_init"
]);

export function configPath(root: string): string {
  return resolveWorkspacePaths(root).config;
}

export function encodeConfig(config: InstanceConfig): string {
  return stringify(config);
}

export function parseConfig(root: string, body: string): InstanceConfig {
  let raw: unknown;
  try {
    raw = parse(body);
  } catch {
    throw usageError("config.toml is invalid TOML");
  }
  if (!isRecord(raw)) {
    throw usageError("config.toml must contain a TOML table");
  }
  assertOnlyKeys(raw, ["cache", "sqlite", "fulltext", "embedding"], "config.toml");
  const cache = requireRecord(raw["cache"], "cache");
  const fulltext = requireRecord(raw["fulltext"], "fulltext");
  const embedding = requireRecord(raw["embedding"], "embedding");
  const sections = { cache, fulltext, embedding };
  for (const name of ["cache", "fulltext", "embedding"] as const) {
    assertOnlyKeys(
      sections[name],
      INIT_FIELD_SPECS.filter((spec) => spec.section === name).map((spec) => spec.key),
      name
    );
  }
  const values = new Map<InitField, string | number>();
  for (const spec of INIT_FIELD_SPECS) {
    const value = sections[spec.section][spec.key];
    if (value === undefined) {
      throw usageError(`config.toml missing required field ${spec.section}.${spec.key}`);
    }
    values.set(spec.flag, validateConfigScalar(spec, value));
  }
  const config: InstanceConfig = {
    cache: {
      path: normalizeCachePath(root, scalarString(values, "--cache-path")),
      max_size_mb: scalarNumber(values, "--cache-max-size-mb")
    },
    fulltext: { analyzer: scalarString(values, "--fulltext-analyzer") },
    embedding: {
      base_url: scalarString(values, "--embedding-base-url"),
      model: scalarString(values, "--embedding-model"),
      dimensions: scalarNumber(values, "--embedding-dimensions"),
      similarity: scalarString(values, "--embedding-similarity") as "cosine" | "euclidean",
      api_key_env: scalarString(values, "--embedding-api-key-env")
    }
  };
  const sqlite = parseSQLite(raw["sqlite"]);
  if (sqlite !== undefined) {
    config.sqlite = sqlite;
  }
  return config;
}

export function buildConfigFromInitValues(
  root: string,
  values: ReadonlyMap<string, string>,
  extensions: readonly ExtensionConfig[]
): { source: InstanceConfig; normalized: InstanceConfig; body: string } {
  const parsed = new Map<InitField, string | number>();
  for (const spec of INIT_FIELD_SPECS) {
    const raw = values.get(spec.flag);
    if (raw === undefined) {
      throw usageError(spec.flag + " is required");
    }
    parsed.set(spec.flag, validateCLIValue(spec, raw));
  }
  const source: InstanceConfig = {
    cache: {
      path: scalarString(parsed, "--cache-path"),
      max_size_mb: scalarNumber(parsed, "--cache-max-size-mb")
    },
    fulltext: { analyzer: scalarString(parsed, "--fulltext-analyzer") },
    embedding: {
      base_url: scalarString(parsed, "--embedding-base-url"),
      model: scalarString(parsed, "--embedding-model"),
      dimensions: scalarNumber(parsed, "--embedding-dimensions"),
      similarity: scalarString(parsed, "--embedding-similarity") as "cosine" | "euclidean",
      api_key_env: scalarString(parsed, "--embedding-api-key-env")
    }
  };
  if (extensions.length !== 0) {
    source.sqlite = { extensions: [...extensions] };
  }
  const body = encodeConfig(source);
  return { source, normalized: parseConfig(root, body), body };
}

export function parseExtensionsJSON(body: string): ExtensionConfig[] {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw usageError("--extensions-file must contain valid JSON");
  }
  if (!Array.isArray(value)) {
    throw usageError("--extensions-file must contain a JSON array");
  }
  return value.map((entry, index) => parseExtension(entry, index, "extensions"));
}

export function classifyExtensionSource(source: string): {
  remote: boolean;
  archive: boolean;
} {
  if (isAbsolute(source)) {
    return { remote: false, archive: isArchivePath(source) };
  }
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    throw usageError("extension source must be an absolute local path or HTTPS URL");
  }
  if (url.protocol !== "https:" || url.host === "") {
    throw usageError("extension source URL must use HTTPS");
  }
  return { remote: true, archive: isArchivePath(url.pathname) };
}

export async function loadConfig(root: string): Promise<InstanceConfig> {
  let body: string;
  try {
    body = await readFile(configPath(root), "utf8");
  } catch {
    throw localIOError("config.toml cannot be read");
  }
  return parseConfig(root, body);
}

export function validateRequiredEnvironment(config: InstanceConfig): void {
  const name = config.embedding.api_key_env;
  if (name !== "" && (process.env[name] ?? "") === "") {
    throw localIOError("required embedding credential environment variable is missing or empty", {
      name
    });
  }
}

export async function validateRootShape(root: string): Promise<"missing" | "directory"> {
  try {
    const info = await lstat(root);
    if (!info.isDirectory()) {
      throw usageError("--root must refer to a Workspace directory");
    }
    return "directory";
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "missing";
    }
    if (error instanceof Error && !isNodeError(error)) {
      throw error;
    }
    throw localIOError("inspect Workspace Root failed");
  }
}

export async function parentWritable(root: string): Promise<boolean> {
  let current = dirname(root);
  for (;;) {
    try {
      await access(current, constants.W_OK);
      return true;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        return false;
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      return false;
    }
    current = parent;
  }
}

function parseSQLite(value: unknown): InstanceConfig["sqlite"] | undefined {
  if (value === undefined) {
    return undefined;
  }
  const sqlite = requireRecord(value, "sqlite");
  assertOnlyKeys(sqlite, ["extensions"], "sqlite");
  const extensions = sqlite["extensions"];
  if (extensions === undefined) {
    return {};
  }
  if (!Array.isArray(extensions)) {
    throw usageError("sqlite.extensions must be an array of tables");
  }
  return {
    extensions: extensions.map((entry, index) => parseExtension(entry, index, "sqlite.extensions"))
  };
}

function parseExtension(value: unknown, index: number, collection: string): ExtensionConfig {
  const label = `${collection}[${String(index)}]`;
  const extension = requireRecord(value, label);
  assertOnlyKeys(extension, ["source", "library", "entrypoint", "sha256"], label);
  const source = requireString(extension["source"], label + ".source");
  const entrypoint = requireString(extension["entrypoint"], label + ".entrypoint");
  if (OFFICIAL_ENTRYPOINTS.has(entrypoint)) {
    throw usageError(label + " cannot configure an official Runtime extension");
  }
  let sourceClass: ReturnType<typeof classifyExtensionSource>;
  try {
    sourceClass = classifyExtensionSource(source);
  } catch (error) {
    if (error instanceof Error) {
      throw usageError(label + "." + error.message);
    }
    throw error;
  }
  const parsed: ExtensionConfig = { source, entrypoint };
  const library = extension["library"];
  if (library !== undefined) {
    parsed.library = requireString(library, label + ".library");
  }
  const hash = extension["sha256"];
  if (hash !== undefined) {
    const sha256 = requireString(hash, label + ".sha256");
    if (!/^[0-9a-f]{64}$/.test(sha256)) {
      throw usageError(label + ".sha256 must be 64 lowercase hexadecimal characters");
    }
    parsed.sha256 = sha256;
  }
  if (sourceClass.remote && parsed.sha256 === undefined) {
    throw usageError(label + ".sha256 is required for HTTPS sources");
  }
  if (sourceClass.archive && parsed.library === undefined) {
    throw usageError(label + ".library is required for archive sources");
  }
  if (!sourceClass.archive && parsed.library !== undefined) {
    throw usageError(label + ".library is only valid for archive sources");
  }
  if (parsed.library !== undefined) {
    validateLibraryPath(parsed.library, label);
  }
  return parsed;
}

function normalizeCachePath(root: string, path: string): string {
  if (path.includes("\0")) {
    throw usageError("cache.path must contain no NUL");
  }
  const instanceRoot = resolveWorkspacePaths(root).instanceRoot;
  const absolute = isAbsolute(path) ? resolve(path) : resolve(instanceRoot, path);
  if (absolute === join(instanceRoot, "kgos.db")) {
    throw usageError("cache.path must not point at kgos.db");
  }
  return absolute;
}

function validateConfigScalar(
  spec: (typeof INIT_FIELD_SPECS)[number],
  value: unknown
): string | number {
  const label = `${spec.section}.${spec.key}`;
  switch (spec.kind) {
    case "cache-path":
    case "string":
      return requireString(value, label);
    case "credential-env":
      return requirePresentString(value, label);
    case "positive-integer":
      return requirePositiveInteger(value, label);
    case "dimensions":
      return requireIntegerRange(value, label, 1, 4096);
    case "url":
      return validateBaseURL(requireString(value, label));
    case "similarity":
      return requireSimilarity(value);
  }
}

function validateCLIValue(spec: (typeof INIT_FIELD_SPECS)[number], value: string): string | number {
  if (spec.kind === "positive-integer" || spec.kind === "dimensions") {
    const parsed = Number(value);
    return spec.kind === "positive-integer"
      ? requirePositiveInteger(parsed, spec.flag)
      : requireIntegerRange(parsed, spec.flag, 1, 4096);
  }
  return validateConfigScalar(spec, value);
}

function scalarString(values: ReadonlyMap<InitField, string | number>, flag: InitField): string {
  const value = values.get(flag);
  if (typeof value !== "string") {
    throw usageError(flag + " must be a string");
  }
  return value;
}

function scalarNumber(values: ReadonlyMap<InitField, string | number>, flag: InitField): number {
  const value = values.get(flag);
  if (typeof value !== "number") {
    throw usageError(flag + " must be an integer");
  }
  return value;
}

function isArchivePath(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".tar.gz");
}

function validateLibraryPath(path: string, label: string): void {
  if (path.length === 0 || path.includes("\0") || isAbsolute(path) || path.includes("\\")) {
    throw usageError(label + ".library must be a safe relative archive path");
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw usageError(label + ".library must be a safe relative archive path");
  }
}

function validateBaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw usageError("embedding.base_url must be an absolute HTTP(S) URL");
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.search.length !== 0 ||
    url.hash.length !== 0
  ) {
    throw usageError(
      "embedding.base_url must be an absolute HTTP(S) URL without query or fragment"
    );
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/$/, "");
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw usageError(label + " must be a table");
  }
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw usageError(label + " must be a non-empty string containing no NUL");
  }
  return value;
}

function requirePresentString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.includes("\0")) {
    throw usageError(label + " must be a string containing no NUL");
  }
  return value;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw usageError(label + " must be a positive integer");
  }
  return value;
}

function requireIntegerRange(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw usageError(`${label} must be an integer between ${String(min)} and ${String(max)}`);
  }
  return value;
}

function requireSimilarity(value: unknown): "cosine" | "euclidean" {
  if (value !== "cosine" && value !== "euclidean") {
    throw usageError("embedding.similarity must be cosine or euclidean");
  }
  return value;
}

function assertOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string
): void {
  const allowed = new Set(keys);
  const unknown = Object.keys(value).find((key) => !allowed.has(key));
  if (unknown !== undefined) {
    throw usageError(label + " contains unknown field " + JSON.stringify(unknown));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
