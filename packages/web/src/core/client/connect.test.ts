// @vitest-environment jsdom

import { afterEach, expect, it, vi } from "vitest";

import { connectToCurrentInstance } from "./connect.js";

const bootA = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";
const bootB = "b6f0ba69-d40a-4819-9ed0-f09759c17292";
const webAccess = "kgws_" + "A".repeat(43);

interface InstanceState {
  bootId: string;
  online: boolean;
  validToken: string;
  sessionRoot: string;
  hasSession: boolean;
}

function authMockResponse(
  path: string,
  bearer: string | null,
  state: InstanceState
): Response | null {
  if (path === "/api/v1/web/auth/login") {
    if (bearer !== "Bearer " + state.validToken) return new Response("{}", { status: 401 });
    state.hasSession = true;
    state.sessionRoot = state.validToken;
    return new Response(JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootId }));
  }
  if (path === "/api/v1/web/auth/session") {
    if (!state.hasSession || state.sessionRoot !== state.validToken)
      return new Response("{}", { status: 401 });
    return new Response(JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootId }));
  }
  if (path === "/api/v1/web/auth/logout") {
    state.hasSession = false;
    return new Response(null, { status: 204 });
  }
  return null;
}

function instance() {
  const state: InstanceState = {
    bootId: bootA,
    online: true,
    validToken: "secret",
    sessionRoot: "secret",
    hasSession: false
  };
  const calls: { path: string; boot: string | null; bearer: string | null }[] = [];
  const fetcher = vi.fn<typeof fetch>().mockImplementation((input, init) => {
    let address: string;
    if (typeof input === "string") address = input;
    else if (input instanceof URL) address = input.href;
    else address = input.url;
    const path = new URL(address).pathname;
    const headers = new Headers(init?.headers);
    const boot = headers.get("X-KGOS-Expected-Daemon-Boot");
    const bearer = headers.get("Authorization");
    calls.push({ path, boot, bearer });
    if (!state.online) return Promise.reject(new TypeError("Connection refused"));
    const webAuthResponse = authMockResponse(path, bearer, state);
    if (webAuthResponse !== null) return Promise.resolve(webAuthResponse);
    if (bearer !== "Bearer " + webAccess || state.sessionRoot !== state.validToken) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" }),
          {
            status: 401
          }
        )
      );
    }
    if (boot !== null && boot !== state.bootId) {
      return Promise.resolve(
        new Response(
          JSON.stringify({ code: "WEB_CONNECTION_CHANGED", message: "web connection changed" }),
          {
            status: 409
          }
        )
      );
    }
    if (path === "/api/v1/web/data/info") {
      return Promise.resolve(
        new Response(JSON.stringify({ daemonBootId: state.bootId, storageStatus: "unsupported" }))
      );
    }
    if (path === "/api/v1/evolution/overview") {
      return Promise.resolve(
        new Response(JSON.stringify({ defaultBranch: "main", state: "commit/a" }))
      );
    }
    if (path.startsWith("/oauth/")) {
      return Promise.resolve(new Response(JSON.stringify({ ok: true })));
    }
    return Promise.resolve(new Response(JSON.stringify({ state: "commit/a", results: [] })));
  });
  vi.stubGlobal("fetch", fetcher);
  return { state, fetcher, calls };
}

afterEach(() => vi.unstubAllGlobals());

it("bootstraps without a guard then protects every later SDK and OAuth request", async () => {
  const server = instance();
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", new AbortController().signal, lost);
  expect(connection).toMatchObject({
    defaultBranch: "main",
    state: "commit/a",
    daemonBootId: bootA,
    storageStatus: "unsupported"
  });
  expect(server.calls.slice(0, 3)).toEqual([
    { path: "/api/v1/web/auth/login", boot: null, bearer: "Bearer secret" },
    { path: "/api/v1/web/data/info", boot: bootA, bearer: "Bearer " + webAccess },
    { path: "/api/v1/evolution/overview", boot: bootA, bearer: "Bearer " + webAccess }
  ]);
  await connection.client.object.read({ at: "branch/main", refs: ["node:Person"] });
  await connection.check();
  await connection.oauthFetch("/oauth/request?request_id=sample");
  expect(() => connection.oauthFetch("https://example.com/evil")).toThrow();
  expect(server.calls.slice(3).every((call) => call.boot === bootA)).toBe(true);
  expect(server.calls.at(-1)?.bearer).toBe("Bearer " + webAccess);
  expect(lost).not.toHaveBeenCalled();
  connection.close();
  await expect(connection.client.evolution.overview()).rejects.toThrow();
  expect(server.calls).toHaveLength(6);
});

it("stops stale sessions when the daemon boot changes and never retries writes", async () => {
  const server = instance();
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", new AbortController().signal, lost);
  server.state.bootId = bootB;
  await expect(
    connection.client.object.patch({
      branch: "main",
      baseState: "commit/a",
      patch: ""
    })
  ).rejects.toThrow();
  expect(lost).toHaveBeenCalledExactlyOnceWith("changed");
  const sent = server.calls.length;
  await expect(connection.client.evolution.overview()).rejects.toThrow();
  expect(server.calls).toHaveLength(sent);
  const fresh = await connectToCurrentInstance("secret", new AbortController().signal);
  expect(fresh.daemonBootId).toBe(bootB);
  fresh.close();
});

it("expires an invalid credential and does not silently follow the new credential", async () => {
  const server = instance();
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", new AbortController().signal, lost);
  server.state.validToken = "rotated";
  await expect(connection.check()).rejects.toThrow();
  expect(lost).toHaveBeenCalledExactlyOnceWith("expired");
  const sent = server.calls.length;
  await expect(connection.check()).rejects.toThrow();
  expect(server.calls).toHaveLength(sent);
  const renewed = await connectToCurrentInstance("rotated", new AbortController().signal);
  expect(renewed.daemonBootId).toBe(bootA);
  renewed.close();
});

it("marks a network outage offline, then waits for explicit reconnection", async () => {
  const server = instance();
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", new AbortController().signal, lost);
  server.state.online = false;
  await expect(connection.check()).rejects.toThrow();
  expect(lost).toHaveBeenCalledExactlyOnceWith("offline");
  server.state.online = true;
  const previous = server.calls.length;
  await expect(connection.client.web.data.info()).rejects.toThrow();
  expect(server.calls).toHaveLength(previous);
  const fresh = await connectToCurrentInstance("secret", new AbortController().signal);
  expect(fresh.state).toBe("commit/a");
  fresh.close();
});

it("does not mistake an explicitly cancelled request for an offline daemon", async () => {
  const server = instance();
  const lost = vi.fn();
  const connection = await connectToCurrentInstance("secret", new AbortController().signal, lost);
  const controller = new AbortController();
  controller.abort();
  await connection.client.evolution.overview({ signal: controller.signal });
  expect(lost).not.toHaveBeenCalled();
  expect(server.calls.at(-1)?.boot).toBe(bootA);
  connection.close();
});

it("rejects malformed bootstrap responses before enabling any business API", async () => {
  const server = instance();
  server.fetcher.mockResolvedValueOnce(
    new Response(JSON.stringify({ accessToken: "bad", daemonBootId: bootA }))
  );
  await expect(connectToCurrentInstance("secret", new AbortController().signal)).rejects.toThrow(
    "Invalid KG OS Web session response"
  );
  expect(server.fetcher).toHaveBeenCalledOnce();
});
