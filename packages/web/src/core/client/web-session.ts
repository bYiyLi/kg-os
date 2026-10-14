import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";

export interface WebAccess {
  accessToken: string;
  daemonBootId: string;
}

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const accessTokenPattern = /^kgws_[A-Za-z0-9_-]{43}$/;

async function exchange(
  action: "login" | "session" | "logout",
  rootToken?: string,
  signal?: AbortSignal
) {
  let response: Response;
  try {
    const request: RequestInit = {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error"
    };
    if (rootToken !== undefined) request.headers = { Authorization: "Bearer " + rootToken };
    if (signal !== undefined) request.signal = signal;
    response = await fetch(window.location.origin + "/api/v1/web/auth/" + action, request);
  } catch (cause) {
    throw new KGOSTransportError("KG OS Web session request failed", {
      cause,
      aborted: signal?.aborted === true
    });
  }
  if (!response.ok) {
    throw new KGOSDaemonError(
      {
        code: response.status === 401 ? "AUTHENTICATION_FAILED" : "WEB_SESSION_UNAVAILABLE",
        message: "KG OS Web session request was rejected"
      },
      response.status
    );
  }
  return response;
}

async function credentials(response: Response): Promise<WebAccess> {
  let result: unknown;
  try {
    result = await response.json();
  } catch (cause) {
    throw new KGOSTransportError("Invalid KG OS Web session response", { cause });
  }
  if (typeof result !== "object" || result === null) {
    throw new KGOSTransportError("Invalid KG OS Web session response");
  }
  const value = result as Record<string, unknown>;
  if (
    typeof value["accessToken"] !== "string" ||
    !accessTokenPattern.test(value["accessToken"]) ||
    typeof value["daemonBootId"] !== "string" ||
    !uuidV4.test(value["daemonBootId"])
  ) {
    throw new KGOSTransportError("Invalid KG OS Web session response");
  }
  return { accessToken: value["accessToken"], daemonBootId: value["daemonBootId"] };
}

export async function loginWebSession(rootToken: string, signal: AbortSignal): Promise<WebAccess> {
  return credentials(await exchange("login", rootToken, signal));
}

export async function restoreWebSession(signal: AbortSignal): Promise<WebAccess> {
  return credentials(await exchange("session", undefined, signal));
}

export async function logoutWebSession(): Promise<void> {
  await exchange("logout");
}
