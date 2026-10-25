import { loginWebSession, restoreWebSession } from "../../core/client/web-session.js";
import type { WebAccess } from "../../core/client/web-session.js";

export interface SetupStatus {
  mcpPath?: string;
  state: "setup_required" | "initializing" | "ready" | "error";
  credentialConfigured: boolean;
  phase?: string;
  message?: string;
}
export type SetupAccess = WebAccess;

export class SetupAuthenticationRequired extends Error {
  constructor() {
    super("Setup authentication required");
  }
}

function authenticatedHeaders(access: SetupAccess): Record<string, string> {
  return {
    Authorization: "Bearer " + access.accessToken,
    "X-KGOS-Expected-Daemon-Boot": access.daemonBootId
  };
}

export interface EmbeddingTestResult {
  ok: boolean;
  dimensions?: number;
  reason?: string;
  httpStatus?: number;
}

export async function testEmbeddingProvider(
  params: { url: string; key: string; model: string; dimensions: string; similarity: string },
  signal: AbortSignal,
  access: SetupAccess
): Promise<EmbeddingTestResult> {
  const response = await fetch("/api/v1/setup/validate-embedding", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...authenticatedHeaders(access) },
    signal,
    body: JSON.stringify({
      base_url: params.url,
      model: params.model,
      dimensions: Number(params.dimensions),
      similarity: params.similarity,
      apiKey: params.key.trim() === "" ? null : params.key
    })
  });
  const body: unknown = await response.json();
  if (
    response.status === 409 &&
    typeof body === "object" &&
    body !== null &&
    "code" in body &&
    body.code === "SETUP_CONFLICT"
  ) {
    return { ok: false, reason: "setup_unavailable" };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: "setup_unavailable" };
  }
  if (
    body === null ||
    typeof body !== "object" ||
    !("ok" in body) ||
    typeof body.ok !== "boolean"
  ) {
    throw new Error("Invalid embedding test response");
  }
  const data = body as Record<string, unknown>;
  return {
    ok: data["ok"] === true && response.ok,
    ...(typeof data["dimensions"] === "number" ? { dimensions: data["dimensions"] } : {}),
    ...(typeof data["reason"] === "string" ? { reason: data["reason"] } : {}),
    ...(typeof data["httpStatus"] === "number" ? { httpStatus: data["httpStatus"] } : {})
  };
}

async function setupRequest(path: string, options: RequestInit = {}) {
  const response = await fetch("/api/v1/setup/" + path, {
    cache: "no-store",
    credentials: "same-origin",
    ...options
  });
  if (!response.ok) {
    if (response.status === 401) throw new SetupAuthenticationRequired();
    let message = "The setup request could not be completed";
    try {
      const result: unknown = await response.json();
      if (
        typeof result === "object" &&
        result !== null &&
        "message" in result &&
        typeof result.message === "string"
      )
        message = result.message;
    } catch {
      // Preserve an actionable generic error without reflecting response HTML.
    }
    throw new Error(message);
  }
  return response;
}

export async function readSetupStatus(
  signal?: AbortSignal,
  access?: SetupAccess
): Promise<SetupStatus> {
  const result: unknown = await (
    await setupRequest("status", {
      ...(signal === undefined ? {} : { signal }),
      ...(access === undefined ? {} : { headers: authenticatedHeaders(access) })
    })
  ).json();
  if (typeof result !== "object" || result === null) throw new Error("Invalid setup status");
  const data = result as Record<string, unknown>;
  if (
    !["setup_required", "initializing", "ready", "error"].includes(String(data["state"])) ||
    typeof data["credentialConfigured"] !== "boolean"
  )
    throw new Error("Invalid setup status");
  return {
    state: data["state"] as SetupStatus["state"],
    credentialConfigured: data["credentialConfigured"],
    ...(typeof data["mcpPath"] === "string" ? { mcpPath: data["mcpPath"] } : {}),
    ...(typeof data["phase"] === "string" ? { phase: data["phase"] } : {}),
    ...(typeof data["message"] === "string" ? { message: data["message"] } : {})
  };
}

export async function rotateSetupToken(access?: SetupAccess): Promise<string> {
  const value: unknown = await (
    await setupRequest("rotate-token", {
      method: "POST",
      ...(access === undefined ? {} : { headers: authenticatedHeaders(access) })
    })
  ).json();
  if (
    typeof value !== "object" ||
    value === null ||
    !("token" in value) ||
    typeof value.token !== "string" ||
    value.token.length === 0
  )
    throw new Error("Invalid setup credential");
  return value.token;
}

export async function loginSetup(token: string): Promise<SetupAccess> {
  return loginWebSession(token, new AbortController().signal);
}

export async function restoreSetup(): Promise<SetupAccess> {
  return restoreWebSession(new AbortController().signal);
}

export interface SetupConfig {
  server: { public_origin: string };
  embedding: { base_url: string; model: string; dimensions: number; similarity: string };
  cache: { path: string; max_size_mb: number };
  fulltext: { analyzer: string };
  sqlite: { extensions: [] };
}

export async function submitSetup(
  access: SetupAccess,
  config?: SetupConfig,
  apiKey?: string | null
) {
  const payload = config === undefined ? {} : { config, apiKey };
  await setupRequest("initialize", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authenticatedHeaders(access) },
    body: JSON.stringify(payload)
  });
}
