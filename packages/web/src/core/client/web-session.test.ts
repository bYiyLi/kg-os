// @vitest-environment jsdom

import { KGOSTransportError } from "@kgos/sdk";
import { afterEach, expect, it, vi } from "vitest";

import { loginWebSession, logoutWebSession, restoreWebSession } from "./web-session.js";

const validSession = {
  daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
  accessToken: "kgws_" + "A".repeat(43)
};

function stubResponse(response: Response) {
  const mock = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

it("exchanges the Instance token only once for a temporary page credential", async () => {
  const mock = stubResponse(new Response(JSON.stringify(validSession)));
  const controller = new AbortController();
  await expect(loginWebSession("root-secret", controller.signal)).resolves.toEqual(validSession);
  const args = mock.mock.calls[0];
  expect(args?.[0]).toBe(window.location.origin + "/api/v1/web/auth/login");
  expect(args?.[1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { Authorization: "Bearer root-secret" },
    signal: controller.signal
  });
});

it("restores through the HttpOnly Cookie endpoint without re-sending the root token", async () => {
  const mock = stubResponse(new Response(JSON.stringify(validSession)));
  await expect(restoreWebSession(new AbortController().signal)).resolves.toEqual(validSession);
  const request = mock.mock.calls[0];
  expect(request?.[0]).toBe(window.location.origin + "/api/v1/web/auth/session");
  expect(request?.[1]).not.toHaveProperty("headers");
});

it("ends a session without passing a root token to the logout endpoint", async () => {
  const mock = stubResponse(new Response(null, { status: 204 }));
  await expect(logoutWebSession()).resolves.toBeUndefined();
  expect(mock.mock.calls[0]?.[0]).toBe(window.location.origin + "/api/v1/web/auth/logout");
  expect(mock.mock.calls[0]?.[1]).not.toHaveProperty("headers");
  expect(mock.mock.calls[0]?.[1]).not.toHaveProperty("signal");
});

it("rejects expired Cookies and login failures as authenticated public errors", async () => {
  stubResponse(new Response("{}", { status: 401 }));
  await expect(restoreWebSession(new AbortController().signal)).rejects.toMatchObject({
    status: 401,
    code: "AUTHENTICATION_FAILED"
  });
  stubResponse(new Response("{}", { status: 503 }));
  await expect(loginWebSession("secret", new AbortController().signal)).rejects.toMatchObject({
    status: 503,
    code: "WEB_SESSION_UNAVAILABLE"
  });
});

it("never unlocks the workspace on invalid JSON or forged bootstrap credentials", async () => {
  for (const value of [
    "{",
    "null",
    JSON.stringify({ daemonBootId: validSession.daemonBootId, accessToken: "root-secret" }),
    JSON.stringify({ daemonBootId: "invalid", accessToken: validSession.accessToken }),
    JSON.stringify({ daemonBootId: validSession.daemonBootId }),
    JSON.stringify({ accessToken: validSession.accessToken })
  ]) {
    stubResponse(new Response(value));
    await expect(restoreWebSession(new AbortController().signal)).rejects.toBeInstanceOf(
      KGOSTransportError
    );
  }
});

it("labels network failures as transport failures, preserving cancellation semantics", async () => {
  const mock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline"));
  vi.stubGlobal("fetch", mock);
  await expect(loginWebSession("secret", new AbortController().signal)).rejects.toBeInstanceOf(
    KGOSTransportError
  );
  const controller = new AbortController();
  controller.abort();
  await expect(restoreWebSession(controller.signal)).rejects.toMatchObject({
    aborted: true
  });
  await expect(logoutWebSession()).rejects.toBeInstanceOf(KGOSTransportError);
  expect(mock).toHaveBeenCalledTimes(3);
});
