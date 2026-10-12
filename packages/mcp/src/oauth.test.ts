import { createHash } from "node:crypto";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { KGOSClient } from "@kgos/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { validateOAuthIssuer } from "./oauth.js";
import { startMCPServer } from "./server.js";

const ADMIN = "mcp-test-admin-secret-with-more-than-32-characters";
const CIMD = "https://chatgpt.com/oauth/client.json";
const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const clientMetadata = {
  client_id: CIMD,
  redirect_uris: [REDIRECT],
  token_endpoint_auth_methods_supported: ["none", "private_key_jwt"]
};
const originalFetch = globalThis.fetch;
const servers: Server[] = [];
const clients: Client[] = [];

function mockChatGPTMetadata(document: unknown = clientMetadata): void {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    let url: string;
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.href;
    else url = input.url;
    return url === CIMD
      ? new Response(JSON.stringify(document), { status: 200 })
      : await originalFetch(input, init);
  });
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
  return port;
}

async function server(path = "/mcp"): Promise<URL> {
  const port = await availablePort();
  const issuer = "http://127.0.0.1:" + String(port);
  const listener = await startMCPServer({
    token: ADMIN,
    oauthIssuer: issuer,
    port,
    path,
    getClient: () =>
      Promise.resolve(
        new KGOSClient({
          endpoint: issuer,
          token: "internal-only",
          fetch: vi
            .fn<typeof fetch>()
            .mockResolvedValue(new Response('{"state":"commit/a","defaultBranch":"main"}'))
        })
      )
  });
  servers.push(listener);
  return new URL(issuer);
}

function authorizationUrl(issuer: URL, options: Record<string, string> = {}): URL {
  const uri = new URL("/oauth/authorize", issuer);
  for (const [key, value] of Object.entries({
    response_type: "code",
    client_id: CIMD,
    redirect_uri: REDIRECT,
    code_challenge: createHash("sha256").update("v".repeat(43)).digest("base64url"),
    code_challenge_method: "S256",
    state: "opaque-client-state",
    resource: issuer.origin,
    scope: "kgos:access",
    ...options
  })) {
    uri.searchParams.set(key, value);
  }
  return uri;
}

async function ticket(issuer: URL, options: Record<string, string> = {}): Promise<string> {
  const response = await fetch(authorizationUrl(issuer, options));
  expect(response.status).toBe(200);
  expect(response.headers.get("referrer-policy")).toBe("strict-origin");
  const html = await response.text();
  const value = /name="ticket" value="([^"]+)"/.exec(html)?.[1];
  if (value === undefined) throw new Error("Authorization form has no ticket");
  return value;
}

async function authorize(
  issuer: URL,
  input: { ticket: string; token: string; decision?: string; origin?: string }
): Promise<Response> {
  return await fetch(new URL("/oauth/authorize", issuer), {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: input.origin ?? issuer.origin
    },
    body: new URLSearchParams({
      ticket: input.ticket,
      token: input.token,
      decision: input.decision ?? "approve"
    })
  });
}

async function exchange(issuer: URL, code: string, options: Record<string, string> = {}) {
  const response = await fetch(new URL("/oauth/token", issuer), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      code_verifier: "v".repeat(43),
      client_id: CIMD,
      resource: issuer.origin,
      ...options
    })
  });
  return { status: response.status, body: (await response.json()) as Record<string, string> };
}

async function connect(issuer: URL, token: string): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(new URL("/mcp", issuer), {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  const client = new Client({ name: "oauth-client", version: "1.0" });
  await client.connect(transport as unknown as Transport);
  clients.push(client);
  return client;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) await client.close();
  for (const listener of servers.splice(0)) {
    listener.closeAllConnections();
    await new Promise<void>((resolve) => {
      listener.close(() => {
        resolve();
      });
    });
  }
});

describe("single-administrator ChatGPT OAuth", () => {
  it("restricts the issuer to HTTPS origins or developer loopback HTTP", () => {
    expect(validateOAuthIssuer("https://kgos.example.com:8443/")).toBe(
      "https://kgos.example.com:8443"
    );
    expect(validateOAuthIssuer("http://localhost:5555")).toBe("http://localhost:5555");
    for (const value of [
      "http://kgos.example.com",
      "http://0.0.0.0:3777",
      "https://" + "user:pass@" + "kgos.example.com",
      "https://kgos.example.com/mcp",
      "https://kgos.example.com?admin=true",
      "file:///tmp/test"
    ]) {
      expect(() => validateOAuthIssuer(value)).toThrow("OAuth issuer");
    }
  });

  it("discovers metadata for a configured nondefault MCP endpoint", async () => {
    const issuer = await server("/v2/mcp");
    const response = await fetch(new URL("/v2/mcp", issuer));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      issuer.origin + "/.well-known/oauth-protected-resource/v2/mcp"
    );
    const metadataResponse = await fetch(
      new URL("/.well-known/oauth-protected-resource/v2/mcp", issuer)
    );
    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({
      resource: issuer.origin,
      authorization_servers: [issuer.origin]
    });
  });

  it("discovers resource and OAuth metadata and supports the full PKCE + refresh flow", async () => {
    mockChatGPTMetadata();
    const issuer = await server();
    const unauthenticated = await fetch(new URL("/mcp", issuer));
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.headers.get("www-authenticate")).toContain(
      issuer.origin + "/.well-known/oauth-protected-resource/mcp"
    );
    const resource = (await (
      await fetch(new URL("/.well-known/oauth-protected-resource", issuer))
    ).json()) as Record<string, unknown>;
    expect(resource).toMatchObject({
      resource: issuer.origin,
      authorization_servers: [issuer.origin],
      scopes_supported: ["kgos:access"]
    });
    const pathAware = await fetch(new URL("/.well-known/oauth-protected-resource/mcp", issuer));
    expect(pathAware.status).toBe(200);
    expect(pathAware.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await pathAware.json()).toEqual(resource);
    const metadata = (await (
      await fetch(new URL("/.well-known/oauth-authorization-server", issuer))
    ).json()) as Record<string, unknown>;
    expect(metadata).toMatchObject({
      issuer: issuer.origin,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      client_id_metadata_document_supported: true
    });

    const codeTicket = await ticket(issuer);
    const rejected = await authorize(issuer, { ticket: codeTicket, token: "bad" });
    expect(rejected.status).toBe(401);
    const approved = await authorize(issuer, { ticket: codeTicket, token: ADMIN });
    expect(approved.status).toBe(302);
    const location = new URL(approved.headers.get("location") ?? "");
    expect(location.origin).toBe("https://chatgpt.com");
    expect(location.searchParams.get("state")).toBe("opaque-client-state");
    expect(location.searchParams.get("iss")).toBe(issuer.origin);
    const code = location.searchParams.get("code") ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await authorize(issuer, { ticket: codeTicket, token: ADMIN })).status).toBe(400);
    const exchanged = await exchange(issuer, code);
    expect(exchanged.status).toBe(200);
    expect(exchanged.body).toMatchObject({ token_type: "Bearer", scope: "kgos:access" });
    expect((await exchange(issuer, code)).status).toBe(400);
    await expect(
      (await connect(issuer, exchanged.body["access_token"] ?? "")).listTools()
    ).resolves.toMatchObject({
      tools: [
        { name: "kgos_preview" },
        { name: "state_ancestry" },
        { name: "kgos_read" },
        { name: "kgos_run" }
      ]
    });
    await expect((await connect(issuer, ADMIN)).listTools()).resolves.toMatchObject({
      tools: [
        { name: "kgos_preview" },
        { name: "state_ancestry" },
        { name: "kgos_read" },
        { name: "kgos_run" }
      ]
    });
    const refresh = async (value: string): Promise<Response> =>
      await fetch(new URL("/oauth/token", issuer), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: CIMD,
          resource: issuer.origin,
          refresh_token: value
        })
      });
    const refreshed = await refresh(exchanged.body["refresh_token"] ?? "");
    expect(refreshed.status).toBe(200);
    const rotated = (await refreshed.json()) as Record<string, string>;
    expect(rotated["refresh_token"]).not.toBe(exchanged.body["refresh_token"]);
    expect((await refresh(exchanged.body["refresh_token"] ?? "")).status).toBe(400);
    await expect(
      (await connect(issuer, rotated["access_token"] ?? "")).listTools()
    ).resolves.toMatchObject({
      tools: [
        { name: "kgos_preview" },
        { name: "state_ancestry" },
        { name: "kgos_read" },
        { name: "kgos_run" }
      ]
    });
  });

  it("rejects forged clients, redirect mismatches, PKCE/resource mismatches and replay", async () => {
    mockChatGPTMetadata();
    const issuer = await server();
    const rejected = [
      { client_id: "https://evil.example/oauth/client.json" },
      { redirect_uri: "https://evil.example/callback" },
      { code_challenge_method: "plain" },
      { resource: "https://another.example" },
      { scope: "admin" }
    ];
    for (const params of rejected) {
      const response = await fetch(authorizationUrl(issuer, params));
      expect(response.status).toBe(400);
    }
    const t = await ticket(issuer);
    expect(
      (await authorize(issuer, { ticket: t, token: ADMIN, origin: "https://evil.example" })).status
    ).toBe(403);
    const approved = await authorize(issuer, { ticket: t, token: ADMIN });
    const code = new URL(approved.headers.get("location") ?? "").searchParams.get("code") ?? "";
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await exchange(issuer, code, { code_verifier: "x".repeat(43) })).status).toBe(400);
    expect((await exchange(issuer, code)).status).toBe(400);
    const bad = await fetch(new URL("/mcp", issuer), {
      headers: { Authorization: "Bearer not-a-token" }
    });
    expect(bad.status).toBe(401);
  });

  it("rejects spoofed client metadata and preserves one-time cancellation", async () => {
    mockChatGPTMetadata({ ...clientMetadata, redirect_uris: ["https://attacker.example"] });
    const issuer = await server();
    expect((await fetch(authorizationUrl(issuer))).status).toBe(400);
    vi.restoreAllMocks();
    mockChatGPTMetadata();
    const t = await ticket(issuer);
    const denied = await authorize(issuer, { ticket: t, token: "", decision: "deny" });
    expect(denied.status).toBe(302);
    const url = new URL(denied.headers.get("location") ?? "");
    expect(url.searchParams.get("error")).toBe("access_denied");
    expect(url.searchParams.get("iss")).toBe(issuer.origin);
    expect((await authorize(issuer, { ticket: t, token: ADMIN })).status).toBe(400);
  });
});

describe("single-administrator OAuth error paths", () => {
  it("explains expired authorization tickets to browsers without weakening the five-minute timeout", async () => {
    mockChatGPTMetadata();
    const issuer = await server();
    const page = await fetch(authorizationUrl(issuer));
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("expires after five minutes");
    const pending = /name="ticket" value="([^"]+)"/.exec(html)?.[1];
    expect(pending).toBeDefined();
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 5 * 60_000 + 1);

    const response = await fetch(new URL("/oauth/authorize", issuer), {
      method: "POST",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Content-Type": "application/x-www-form-urlencoded",
        Origin: issuer.origin
      },
      body: new URLSearchParams({ ticket: pending ?? "", token: ADMIN, decision: "approve" })
    });
    expect(response.status).toBe(400);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("Return to ChatGPT");
    const plain = await authorize(issuer, { ticket: pending ?? "", token: ADMIN });
    expect(plain.status).toBe(400);
    expect(await plain.json()).toEqual({ error: "invalid_request" });
  });

  it("rejects malformed authorization input, forbidden methods and repeated wrong credentials", async () => {
    mockChatGPTMetadata();
    const issuer = await server();
    const malformed = [
      { client_id: "http://chatgpt.com/oauth/client.json" },
      { client_id: "https://chatgpt.com/oauth/invalid/other.json" },
      { code_challenge: "invalid" },
      { state: "" },
      { state: "untrusted\nstate" },
      { response_type: "token" },
      { redirect_uri: "http://localhost/callback" },
      { scope: "kgos:access kgos:admin" }
    ];
    for (const values of malformed) {
      expect((await fetch(authorizationUrl(issuer, values))).status).toBe(400);
    }
    for (const path of [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-authorization-server"
    ]) {
      expect((await fetch(new URL(path, issuer), { method: "POST" })).status).toBe(405);
    }
    expect((await fetch(new URL("/oauth/token", issuer))).status).toBe(405);
    expect((await fetch(new URL("/oauth/authorize", issuer), { method: "PUT" })).status).toBe(405);
    const t = await ticket(issuer);
    expect(
      (
        await fetch(new URL("/oauth/authorize", issuer), {
          method: "POST",
          headers: { "Content-Type": "text/plain" },
          body: "not a form"
        })
      ).status
    ).toBe(400);
    expect((await authorize(issuer, { ticket: "x".repeat(43), token: ADMIN })).status).toBe(400);
    expect((await authorize(issuer, { ticket: t, token: ADMIN, decision: "unknown" })).status).toBe(
      400
    );
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect((await authorize(issuer, { ticket: t, token: "wrong" })).status).toBe(
        attempt === 5 ? 429 : 401
      );
    }
    expect((await authorize(issuer, { ticket: t, token: ADMIN })).status).toBe(400);
  });

  it("rejects malformed token grants and expires access and refresh independently", async () => {
    mockChatGPTMetadata();
    const issuer = await server();
    const t = await ticket(issuer);
    const approved = await authorize(issuer, { ticket: t, token: ADMIN });
    const code = new URL(approved.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const request = async (values: Record<string, string>): Promise<Response> =>
      await fetch(new URL("/oauth/token", issuer), {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CIMD,
          resource: issuer.origin,
          code,
          redirect_uri: REDIRECT,
          code_verifier: "v".repeat(43),
          ...values
        })
      });
    expect((await request({ grant_type: "password" })).status).toBe(400);
    expect((await request({ resource: "https://wrong.example" })).status).toBe(400);
    expect((await request({ client_id: "https://other.example/client.json" })).status).toBe(400);
    expect((await request({ client_secret: "should-never-exist" })).status).toBe(400);
    expect((await request({ code: "too-short" })).status).toBe(400);
    expect((await request({ redirect_uri: "https://chatgpt.com/wrong" })).status).toBe(400);
    expect((await request({ code })).status).toBe(400);

    const second = await ticket(issuer);
    const secondApproval = await authorize(issuer, { ticket: second, token: ADMIN });
    const secondCode =
      new URL(secondApproval.headers.get("location") ?? "").searchParams.get("code") ?? "";
    const success = await request({ code: secondCode });
    expect(success.status).toBe(200);
    const issued = (await success.json()) as Record<string, string>;
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now + 60 * 60_000 + 1);
    expect(
      (
        await fetch(new URL("/mcp", issuer), {
          headers: { Authorization: "Bearer " + (issued["access_token"] ?? "") }
        })
      ).status
    ).toBe(401);
    const rotated = await request({
      grant_type: "refresh_token",
      refresh_token: issued["refresh_token"] ?? ""
    });
    expect(rotated.status).toBe(200);
    const token = (await rotated.json()) as Record<string, string>;
    expect(token["access_token"]).not.toBe(issued["access_token"]);
    vi.mocked(Date.now).mockReturnValue(now + 31 * 24 * 60 * 60_000);
    const expired = await request({
      grant_type: "refresh_token",
      refresh_token: token["refresh_token"] ?? ""
    });
    expect(expired.status).toBe(400);
  });

  it("validates ChatGPT client metadata instead of trusting supplied redirect URIs", async () => {
    const documents: unknown[] = [
      { ...clientMetadata, client_id: "https://evil.example/client.json" },
      { ...clientMetadata, token_endpoint_auth_methods_supported: ["private_key_jwt"] },
      { ...clientMetadata, redirect_uris: [] },
      { ...clientMetadata, redirect_uris: [42] },
      { ...clientMetadata, redirect_uris: ["http://chatgpt.com/connector/callback"] },
      { ...clientMetadata, redirect_uris: [REDIRECT, "https://evil.example/callback"] },
      {},
      null,
      Array.from({ length: 40_000 }, () => "A").join("")
    ];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      let url: string;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else url = input.url;
      return url === CIMD
        ? new Response(JSON.stringify(documents.shift()), { status: 200 })
        : await originalFetch(input, init);
    });
    const issuer = await server();
    for (let index = 0; index < 9; index++) {
      expect((await fetch(authorizationUrl(issuer))).status).toBe(400);
    }
  });
});
