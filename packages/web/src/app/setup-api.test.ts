// @vitest-environment jsdom
// cspell:words qwen qwen3

import { afterEach, expect, it, vi } from "vitest";

import {
  SetupAuthenticationRequired,
  loginSetup,
  readSetupStatus,
  restoreSetup,
  rotateSetupToken,
  submitSetup,
  testEmbeddingProvider
} from "../features/setup/setup-api.js";
import type { SetupAccess } from "../features/setup/setup-api.js";

const validAccess: SetupAccess = {
  daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
  accessToken: "kgws_" + "A".repeat(43)
};
const config = {
  server: { public_origin: "https://kgos.example.com" },
  embedding: {
    base_url: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimensions: 1536,
    similarity: "cosine"
  },
  cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
  fulltext: { analyzer: "jieba" },
  sqlite: { extensions: [] as [] }
};

function stubJSON(body: unknown, status = 200) {
  const mock = vi.fn<typeof fetch>().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" }
      })
    )
  );
  vi.stubGlobal("fetch", mock);
  return mock;
}

afterEach(() => vi.unstubAllGlobals());

it("reads initial state anonymously, then sends Web Bearer for protected setup status", async () => {
  for (const state of ["setup_required", "initializing", "ready", "error"] as const) {
    const mock = stubJSON({ state, credentialConfigured: state !== "setup_required" });
    const access = state === "setup_required" ? undefined : validAccess;
    await expect(readSetupStatus(undefined, access)).resolves.toMatchObject({
      state,
      credentialConfigured: state !== "setup_required"
    });
    expect(mock.mock.calls[0]?.[0]).toBe("/api/v1/setup/status");
    expect(mock.mock.calls[0]?.[1]).toMatchObject({
      cache: "no-store",
      credentials: "same-origin"
    });
    expect(mock.mock.calls[0]?.[1]?.headers).toEqual(
      access === undefined
        ? undefined
        : {
            Authorization: "Bearer " + access.accessToken,
            "X-KGOS-Expected-Daemon-Boot": access.daemonBootId
          }
    );
  }

  const controller = new AbortController();
  stubJSON({
    state: "initializing",
    credentialConfigured: true,
    phase: "extensions",
    message: "Only a public status note",
    unexpected: "ignored"
  });
  await expect(readSetupStatus(controller.signal)).resolves.toEqual({
    state: "initializing",
    credentialConfigured: true,
    phase: "extensions",
    message: "Only a public status note"
  });
  expect(vi.mocked(fetch).mock.calls[0]?.[1]).toMatchObject({ signal: controller.signal });
});

it("requires authentication to read claimed setup state and retains the custom MCP path", async () => {
  stubJSON({ code: "AUTHENTICATION_FAILED", message: "authentication failed" }, 401);
  await expect(readSetupStatus()).rejects.toBeInstanceOf(SetupAuthenticationRequired);

  stubJSON({ state: "setup_required", credentialConfigured: true, mcpPath: "/custom-mcp" });
  await expect(readSetupStatus(undefined, validAccess)).resolves.toEqual({
    state: "setup_required",
    credentialConfigured: true,
    mcpPath: "/custom-mcp"
  });
});

it("rejects invalid setup status shapes rather than opening the workspace", async () => {
  for (const body of [
    null,
    42,
    [],
    {},
    { state: "ready" },
    { state: "ready", credentialConfigured: "yes" },
    { state: "finished", credentialConfigured: true }
  ]) {
    stubJSON(body);
    await expect(readSetupStatus()).rejects.toThrow("Invalid setup status");
  }
  stubJSON({
    state: "ready",
    credentialConfigured: true,
    phase: null,
    message: 1
  });
  await expect(readSetupStatus()).resolves.toEqual({
    state: "ready",
    credentialConfigured: true
  });

  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("{")));
  await expect(readSetupStatus()).rejects.toThrow();
});

it("creates an initial administrator token only through rotate-token", async () => {
  const mock = stubJSON({ token: "generated-root-token" }, 201);
  await expect(rotateSetupToken()).resolves.toBe("generated-root-token");
  expect(mock.mock.calls[0]).toMatchObject([
    "/api/v1/setup/rotate-token",
    { method: "POST", credentials: "same-origin", cache: "no-store" }
  ]);
  for (const body of [null, false, [], {}, { token: null }, { token: 1 }, { token: "" }]) {
    stubJSON(body);
    await expect(rotateSetupToken()).rejects.toThrow("Invalid setup credential");
  }
});

it("requires Web Access headers to rotate an existing Token", async () => {
  const mock = stubJSON({ token: "next-instance-token" }, 201);
  await expect(rotateSetupToken(validAccess)).resolves.toBe("next-instance-token");
  expect(mock.mock.calls[0]).toMatchObject([
    "/api/v1/setup/rotate-token",
    { method: "POST", cache: "no-store", credentials: "same-origin" }
  ]);
  expect(mock.mock.calls[0]?.[1]?.headers).toEqual({
    Authorization: "Bearer " + validAccess.accessToken,
    "X-KGOS-Expected-Daemon-Boot": validAccess.daemonBootId
  });
  expect(mock.mock.calls[0]?.[1]).not.toHaveProperty("body");
  stubJSON({ code: "SETUP_CONFLICT", message: "Already initialized" }, 409);
  await expect(rotateSetupToken()).rejects.toThrow("Already initialized");
});

it("surfaces server-provided public errors and safely handles invalid error bodies", async () => {
  stubJSON({ code: "SETUP_CONFLICT", message: "Existing Instance configuration" }, 409);
  await expect(rotateSetupToken()).rejects.toThrow("Existing Instance configuration");

  for (const body of [{}, null, { message: 9 }, { message: null }, { error: "untrusted HTML" }]) {
    stubJSON(body, 503);
    await expect(readSetupStatus()).rejects.toThrow("The setup request could not be completed");
  }

  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>not JSON</html>", { status: 502 }))
  );
  await expect(rotateSetupToken()).rejects.toThrow("The setup request could not be completed");

  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
  await expect(readSetupStatus()).rejects.toThrow("offline");
});

it("submits full settings only with a short-lived Web Bearer, never the root Token", async () => {
  const mock = stubJSON({ state: "initializing" }, 202);
  await submitSetup(validAccess, config, "provider-key-not-root");
  const request = mock.mock.calls[0];
  expect(request?.[0]).toBe("/api/v1/setup/initialize");
  expect(request?.[1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + validAccess.accessToken,
      "X-KGOS-Expected-Daemon-Boot": validAccess.daemonBootId,
      "Content-Type": "application/json"
    }
  });
  expect(JSON.parse(request?.[1]?.body as string)).toEqual({
    config,
    apiKey: "provider-key-not-root"
  });
  expect(JSON.stringify(request?.[1])).not.toContain("root-secret");
});

it("distinguishes no-auth configuration and resume from a fresh setup", async () => {
  const mock = stubJSON({ state: "initializing" }, 202);
  await submitSetup(validAccess, config, null);
  expect(JSON.parse(mock.mock.calls[0]?.[1]?.body as string)).toEqual({ config, apiKey: null });
  await submitSetup(validAccess);
  expect(JSON.parse(mock.mock.calls[1]?.[1]?.body as string)).toEqual({});
});

it("reuses existing Web login/session validation instead of inventing setup credentials", async () => {
  const mock = stubJSON(validAccess);
  await expect(loginSetup("root-secret")).resolves.toEqual(validAccess);
  await expect(restoreSetup()).resolves.toEqual(validAccess);
  const login = mock.mock.calls[0];
  const restore = mock.mock.calls[1];
  expect(login?.[0]).toBe(window.location.origin + "/api/v1/web/auth/login");
  expect(login?.[1]).toMatchObject({
    headers: { Authorization: "Bearer root-secret" },
    credentials: "same-origin"
  });
  expect(restore?.[0]).toBe(window.location.origin + "/api/v1/web/auth/session");
  expect(restore?.[1]).not.toHaveProperty("headers");
});

it("tests current Embedding settings, sending null when API Key is blank", async () => {
  const mock = stubJSON({ ok: true, dimensions: 4096 });
  const controller = new AbortController();
  const draft = {
    url: "https://newapi.y2l.top/v1",
    key: "",
    model: "qwen/qwen3-embedding-8b",
    dimensions: "4096",
    similarity: "cosine"
  };
  await expect(testEmbeddingProvider(draft, controller.signal, validAccess)).resolves.toEqual({
    ok: true,
    dimensions: 4096
  });
  expect(mock.mock.calls[0]?.[0]).toBe("/api/v1/setup/validate-embedding");
  expect(mock.mock.calls[0]?.[1]).toMatchObject({
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal: controller.signal
  });
  expect(JSON.parse(mock.mock.calls[0]?.[1]?.body as string)).toEqual({
    base_url: draft.url,
    model: draft.model,
    dimensions: 4096,
    similarity: "cosine",
    apiKey: null
  });

  stubJSON({ ok: false, reason: "authentication_failed", httpStatus: 401 }, 422);
  await expect(
    testEmbeddingProvider({ ...draft, key: "private-provider-key" }, controller.signal, validAccess)
  ).resolves.toEqual({ ok: false, reason: "authentication_failed", httpStatus: 401 });
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0]?.[1]?.body as string)).toMatchObject({
    apiKey: "private-provider-key"
  });
  stubJSON({ code: "SETUP_CONFLICT", message: "Instance initialization already started" }, 409);
  await expect(testEmbeddingProvider(draft, controller.signal, validAccess)).resolves.toEqual({
    ok: false,
    reason: "setup_unavailable"
  });
  stubJSON({ invalid: "data" });
  await expect(testEmbeddingProvider(draft, controller.signal, validAccess)).rejects.toThrow(
    "Invalid embedding test response"
  );
});

it.each([401, 403])(
  "treats denied Setup verification (HTTP %i) as unavailable, not a provider error",
  async (status) => {
    const mock = stubJSON(
      { code: "AUTHENTICATION_FAILED", message: "authentication failed" },
      status
    );
    const controller = new AbortController();
    await expect(
      testEmbeddingProvider(
        {
          url: "http://127.0.0.1:9000/v1",
          key: "private-provider-key",
          model: "local-model",
          dimensions: "3",
          similarity: "cosine"
        },
        controller.signal,
        validAccess
      )
    ).resolves.toEqual({ ok: false, reason: "setup_unavailable" });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(mock.mock.calls[0]?.[0]).toBe("/api/v1/setup/validate-embedding");
  }
);
