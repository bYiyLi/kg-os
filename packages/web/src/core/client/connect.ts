import { KGOSClient } from "@kgos/sdk";
import type { WebDataInfoResult } from "@kgos/sdk";

import { loginWebSession, restoreWebSession } from "./web-session.js";
import type { WebAccess } from "./web-session.js";

export type ConnectionLossReason = "changed" | "expired" | "offline";

export interface Connection {
  client: KGOSClient;
  defaultBranch: string;
  state: string;
  daemonBootId: string;
  storageStatus: WebDataInfoResult["storageStatus"];
  oauthFetch: (path: string, init?: RequestInit) => Promise<Response>;
  check: () => Promise<void>;
  close: () => void;
}

const expectedBootHeader = "X-KGOS-Expected-Daemon-Boot";
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const storageStates: readonly string[] = ["ready", "unavailable", "unsupported", "mismatch"];

function validInfo(value: unknown): value is WebDataInfoResult {
  if (typeof value !== "object" || value === null) return false;
  const info = value as Record<string, unknown>;
  return (
    typeof info["daemonBootId"] === "string" &&
    uuidV4Pattern.test(info["daemonBootId"]) &&
    typeof info["storageStatus"] === "string" &&
    storageStates.includes(info["storageStatus"])
  );
}

function guardedFetch(
  bootID: string,
  lifetime: AbortController,
  stop: (reason: ConnectionLossReason) => void
): typeof fetch {
  return async (input, init) => {
    if (lifetime.signal.aborted) {
      throw new DOMException("Web connection is no longer active", "AbortError");
    }
    const headers = new Headers(init?.headers);
    headers.set(expectedBootHeader, bootID);
    const requestSignal = init?.signal;
    const combinedSignal = requestSignal
      ? AbortSignal.any([requestSignal, lifetime.signal])
      : lifetime.signal;
    let response: Response;
    try {
      response = await globalThis.fetch(input, { ...init, headers, signal: combinedSignal });
    } catch (error) {
      // Cancelling one query does not invalidate the whole connection.
      if (requestSignal?.aborted !== true) {
        stop("offline");
      }
      throw error;
    }
    if (response.status === 401) {
      stop("expired");
    } else if (response.status === 409) {
      let error: unknown;
      try {
        error = await response.clone().json();
      } catch {
        // Let the SDK report the original protocol error unchanged.
      }
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "WEB_CONNECTION_CHANGED"
      ) {
        stop("changed");
      }
    }
    return response;
  };
}

// The current daemon serves both the Web and API; never discover a different
// instance, persist credentials, or silently retry a prior write request.
// The page gets only a daemon-local Web Bearer after the original Instance
// credential has been verified. Persistent authentication stays HttpOnly.
async function activateWebAccess(
  access: WebAccess,
  signal: AbortSignal,
  onLost: (reason: ConnectionLossReason) => void
): Promise<Connection> {
  const endpoint = window.location.origin;
  const bootID = access.daemonBootId;
  const lifetime = new AbortController();
  let active = false;

  function stop(reason?: ConnectionLossReason) {
    if (lifetime.signal.aborted) return;
    lifetime.abort();
    if (reason !== undefined && active) onLost(reason);
  }

  const fetchWithGuard = guardedFetch(bootID, lifetime, stop);
  const client = new KGOSClient({ endpoint, token: access.accessToken, fetch: fetchWithGuard });
  try {
    const info: unknown = await client.web.data.info({ signal });
    signal.throwIfAborted();
    if (!validInfo(info) || info.daemonBootId !== bootID) {
      throw new Error("KG OS returned an invalid connection response");
    }
    const overview = await client.evolution.overview({ signal });
    signal.throwIfAborted();
    if (
      typeof overview.defaultBranch !== "string" ||
      overview.defaultBranch.length === 0 ||
      typeof overview.state !== "string" ||
      overview.state.length === 0 ||
      lifetime.signal.aborted
    ) {
      throw new Error("KG OS returned an invalid connection response");
    }
    active = true;
    return {
      client,
      defaultBranch: overview.defaultBranch,
      state: overview.state,
      daemonBootId: bootID,
      storageStatus: info.storageStatus,
      oauthFetch: (path, init) => {
        if (!path.startsWith("/oauth/request?request_id=") && path !== "/oauth/decision") {
          throw new Error("Unknown KG OS authorization endpoint");
        }
        const headers = new Headers(init?.headers);
        headers.set("Authorization", "Bearer " + access.accessToken);
        return fetchWithGuard(endpoint + path, { ...init, headers, credentials: "same-origin" });
      },
      close: () => {
        stop();
      },
      check: async () => {
        const current: unknown = await client.web.data.info();
        if (!validInfo(current) || current.daemonBootId !== bootID) {
          stop("changed");
          throw new Error("KG OS daemon connection changed");
        }
      }
    };
  } catch (error) {
    stop();
    throw error;
  }
}

export async function connectToCurrentInstance(
  token: string,
  signal: AbortSignal,
  onLost: (reason: ConnectionLossReason) => void = () => undefined
): Promise<Connection> {
  const access = await loginWebSession(token, signal);
  signal.throwIfAborted();
  return activateWebAccess(access, signal, onLost);
}

export async function restoreCurrentInstanceSession(
  signal: AbortSignal,
  onLost: (reason: ConnectionLossReason) => void = () => undefined
): Promise<Connection> {
  const access = await restoreWebSession(signal);
  signal.throwIfAborted();
  return activateWebAccess(access, signal, onLost);
}
