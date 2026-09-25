import { constants } from "node:fs";
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parse, stringify } from "smol-toml";

import { localIOError, usageError } from "./errors.js";

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

interface ExtensionConfig {
  source: string;
  library?: string;
  entrypoint: string;
  sha256?: string;
}

export const INIT_FIELDS = [
  "--cache-path",
  "--cache-max-size-mb",
  "--fulltext-analyzer",
  "--embedding-base-url",
  "--embedding-model",
  "--embedding-dimensions",
  "--embedding-similarity",
  "--embedding-api-key-env"
] as const;

export const RECOMMENDED_CONFIG = {
  "--cache-path": "cache/openai-compatible.db",
  "--cache-max-size-mb": "4096",
  "--fulltext-analyzer": "unicode61",
  "--embedding-base-url": "https://api.openai.com/v1",
  "--embedding-model": "text-embedding-3-small",
  "--embedding-dimensions": "1536",
  "--embedding-similarity": "cosine",
  "--embedding-api-key-env": "OPENAI_API_KEY"
} as const satisfies Record<(typeof INIT_FIELDS)[number], string>;

const OFFICIAL_ENTRYPOINTS = new Set([
  "sqlite3_lithograph_init",
  "sqlite3_lithographopenaicompatible_init"
]);

export function configPath(root: string): string {
  return join(root, "config.toml");
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
  assertOnlyKeys(cache, ["path", "max_size_mb"], "cache");
  assertOnlyKeys(fulltext, ["analyzer"], "fulltext");
  assertOnlyKeys(
    embedding,
    ["base_url", "model", "dimensions", "similarity", "api_key_env"],
    "embedding"
  );
  const config: InstanceConfig = {
    cache: {
      path: normalizeCachePath(root, requireString(cache["path"], "cache.path")),
      max_size_mb: requirePositiveInteger(cache["max_size_mb"], "cache.max_size_mb")
    },
    fulltext: { analyzer: requireString(fulltext["analyzer"], "fulltext.analyzer") },
    embedding: {
      base_url: validateBaseURL(requireString(embedding["base_url"], "embedding.base_url")),
      model: requireString(embedding["model"], "embedding.model"),
      dimensions: requireIntegerRange(embedding["dimensions"], "embedding.dimensions", 1, 4096),
      similarity: requireSimilarity(embedding["similarity"]),
      api_key_env: requirePresentString(embedding["api_key_env"], "embedding.api_key_env")
    }
  };
  const sqlite = parseSQLite(raw["sqlite"]);
  if (sqlite !== undefined) {
    config.sqlite = sqlite;
  }
  return config;
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
      throw usageError("--root must refer to a directory");
    }
    return "directory";
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return "missing";
    }
    if (error instanceof Error && !isNodeError(error)) {
      throw error;
    }
    throw localIOError("inspect instance root failed");
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
  return { extensions: extensions.map(parseExtension) };
}

function parseExtension(value: unknown, index: number): ExtensionConfig {
  const label = `sqlite.extensions[${String(index)}]`;
  const extension = requireRecord(value, label);
  assertOnlyKeys(extension, ["source", "library", "entrypoint", "sha256"], label);
  const source = requireString(extension["source"], label + ".source");
  const entrypoint = requireString(extension["entrypoint"], label + ".entrypoint");
  if (OFFICIAL_ENTRYPOINTS.has(entrypoint)) {
    throw usageError(label + " cannot configure an official Runtime extension");
  }
  validateExtensionSource(source, label);
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
  if (source.startsWith("https://") && parsed.sha256 === undefined) {
    throw usageError(label + ".sha256 is required for HTTPS sources");
  }
  return parsed;
}

function validateExtensionSource(source: string, label: string): void {
  if (!source.startsWith("https://") && !isAbsolute(source)) {
    throw usageError(label + ".source must be an absolute local path or HTTPS URL");
  }
}

function normalizeCachePath(root: string, path: string): string {
  if (path.includes("\0")) {
    throw usageError("cache.path must contain no NUL");
  }
  const absolute = isAbsolute(path) ? resolve(path) : resolve(root, path);
  if (absolute === join(root, "kgos.db")) {
    throw usageError("cache.path must not point at kgos.db");
  }
  return absolute;
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
