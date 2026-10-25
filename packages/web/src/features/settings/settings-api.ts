import type {
  EmbeddingTestResult,
  SettingsConfig,
  SettingsExtension,
  SettingsFetch,
  SettingsPatch,
  SettingsSnapshot
} from "./settings-types.js";

export class SettingsRequestError extends Error {
  constructor(readonly status: number) {
    super("Settings request failed");
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extension(value: unknown): value is SettingsExtension {
  return (
    record(value) &&
    typeof value["source"] === "string" &&
    typeof value["entrypoint"] === "string" &&
    (value["library"] === undefined || typeof value["library"] === "string") &&
    (value["sha256"] === undefined || typeof value["sha256"] === "string")
  );
}

function config(value: unknown): value is SettingsConfig {
  if (!record(value)) return false;
  const { server, cache, sqlite, fulltext, embedding } = value;
  return (
    (server === null || (record(server) && typeof server["public_origin"] === "string")) &&
    record(cache) &&
    typeof cache["path"] === "string" &&
    Number.isSafeInteger(cache["max_size_mb"]) &&
    record(sqlite) &&
    Array.isArray(sqlite["extensions"]) &&
    sqlite["extensions"].every(extension) &&
    record(fulltext) &&
    typeof fulltext["analyzer"] === "string" &&
    validEmbedding(embedding)
  );
}

function validEmbedding(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    ["base_url", "model", "similarity", "api_key_env"].every(
      (key) => typeof value[key] === "string"
    ) && Number.isSafeInteger(value["dimensions"])
  );
}

function validRuntime(value: unknown): boolean {
  if (!record(value)) return false;
  return (
    ["version", "platform", "endpoint", "mcpPath"].every((key) => typeof value[key] === "string") &&
    Array.isArray(value["parameters"]) &&
    value["parameters"].every(
      (item: unknown) =>
        record(item) && ["key", "value", "source"].every((key) => typeof item[key] === "string")
    )
  );
}

export function isSettingsSnapshot(value: unknown): value is SettingsSnapshot {
  if (!record(value) || !record(value["credential"])) return false;
  const credential = value["credential"];
  return (
    typeof value["revision"] === "string" &&
    value["revision"].length > 0 &&
    config(value["effective"]) &&
    config(value["saved"]) &&
    typeof value["pendingRestart"] === "boolean" &&
    typeof value["databasePath"] === "string" &&
    ["private_file", "environment", "none"].includes(String(credential["source"])) &&
    ["configured", "canUpdate", "pendingRestart"].every(
      (key) => typeof credential[key] === "boolean"
    ) &&
    validRuntime(value["runtime"])
  );
}

async function request(fetcher: SettingsFetch, path: string, body: unknown, signal?: AbortSignal) {
  const response = await fetcher(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal === undefined ? {} : { signal })
  });
  if (!response.ok) throw new SettingsRequestError(response.status);
  const value: unknown = await response.json();
  return value;
}

export async function readSettings(fetcher: SettingsFetch, signal?: AbortSignal) {
  const value = await request(fetcher, "/api/v1/web/settings/read", {}, signal);
  if (!isSettingsSnapshot(value)) throw new Error("Invalid settings response");
  return value;
}

export async function updateSettings(
  fetcher: SettingsFetch,
  revision: string,
  patch: SettingsPatch
) {
  const value = await request(fetcher, "/api/v1/web/settings/update", { revision, ...patch });
  if (!isSettingsSnapshot(value)) throw new Error("Invalid settings response");
  return value;
}

export async function updateEmbeddingKey(fetcher: SettingsFetch, revision: string, apiKey: string) {
  const value = await request(fetcher, "/api/v1/web/settings/embedding-key", { revision, apiKey });
  if (!isSettingsSnapshot(value)) throw new Error("Invalid settings response");
  return value;
}

export async function testEmbedding(
  fetcher: SettingsFetch,
  signal: AbortSignal
): Promise<EmbeddingTestResult> {
  const response = await fetcher("/api/v1/web/settings/test-embedding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    signal
  });
  if (!response.ok && response.status !== 422 && response.status !== 429)
    throw new SettingsRequestError(response.status);
  const value: unknown = await response.json();
  if (!record(value) || typeof value["ok"] !== "boolean")
    throw new Error("Invalid verification response");
  if (
    value["ok"] &&
    (response.status !== 200 ||
      !Number.isSafeInteger(value["dimensions"]) ||
      Number(value["dimensions"]) < 1 ||
      Number(value["dimensions"]) > 4096)
  ) {
    throw new Error("Invalid verification success");
  }
  if (!value["ok"] && typeof value["reason"] !== "string")
    throw new Error("Invalid verification failure");
  return {
    ok: value["ok"],
    ...(typeof value["dimensions"] === "number" ? { dimensions: value["dimensions"] } : {}),
    ...(typeof value["reason"] === "string" ? { reason: value["reason"] } : {})
  };
}

export async function readDiagnostics(fetcher: SettingsFetch, signal: AbortSignal) {
  const value = await request(fetcher, "/api/v1/system/diagnostics", {}, signal);
  if (!record(value)) throw new Error("Invalid diagnostics response");
  return value;
}
