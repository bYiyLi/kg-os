import type { AddressInfo } from "node:net";
import { request as httpRequest } from "node:http";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { KGOSClient } from "@kgos/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startMCPServer, type MCPServerOptions } from "./server.js";

const credential = "mcp-test-credential-that-is-random-only-for-tests";
const servers: Awaited<ReturnType<typeof startMCPServer>>[] = [];
const clients: Client[] = [];

function sdk(
  response: Response = new Response('{"state":"commit/a","defaultBranch":"main"}')
): KGOSClient {
  return new KGOSClient({
    endpoint: "http://127.0.0.1:9000",
    token: "not-exposed",
    fetch: vi.fn<typeof fetch>().mockResolvedValue(response)
  });
}

async function start(options: Partial<MCPServerOptions> = {}) {
  const server = await startMCPServer({
    token: credential,
    port: 0,
    getClient: () => Promise.resolve(sdk()),
    ...options
  });
  servers.push(server);
  const address = server.address() as AddressInfo;
  return new URL("http://127.0.0.1:" + String(address.port) + (options.path ?? "/mcp"));
}

async function connect(url: URL): Promise<Client> {
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: "Bearer " + credential } }
  });
  const client = new Client({ name: "mcp-http-tests", version: "1.0.0" });
  await client.connect(transport as unknown as Transport);
  clients.push(client);
  return client;
}

function value(result: Awaited<ReturnType<Client["callTool"]>>): Record<string, unknown> {
  const content = result.content as { type: string; text?: string }[];
  if (content[0]?.type !== "text" || content[0].text === undefined) {
    throw new Error("Tool did not return JSON text");
  }
  return JSON.parse(content[0].text) as Record<string, unknown>;
}

afterEach(async () => {
  for (const client of clients.splice(0)) await client.close();
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  }
});

describe("MCP Streamable HTTP security and failure boundaries", () => {
  it("rejects missing/invalid credentials, disallowed Origins and unsupported paths", async () => {
    const url = await start({ path: "/private-mcp" });
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: "Basic " + credential } })).status).toBe(
      401
    );
    expect(
      (
        await fetch(url, {
          headers: { Authorization: "Bearer " + credential, Origin: "https://evil.example" }
        })
      ).status
    ).toBe(403);
    expect(
      (
        await fetch(new URL("/mcp", url), {
          headers: { Authorization: "Bearer " + credential }
        })
      ).status
    ).toBe(404);
    const mcp = await connect(url);
    expect((await mcp.listTools()).tools).toHaveLength(4);
  });

  it("validates listener and credential settings before accepting connections", async () => {
    await expect(
      startMCPServer({ token: "short", port: 0, getClient: () => Promise.resolve(sdk()) })
    ).rejects.toThrow("credential");
    await expect(
      startMCPServer({ token: credential, port: 65536, getClient: () => Promise.resolve(sdk()) })
    ).rejects.toThrow("port");
    await expect(
      startMCPServer({
        token: credential,
        port: 0,
        getClient: () => Promise.resolve(sdk()),
        tls: { cert: "/not/a/valid/certificate", key: "/not/a/valid/private-key" }
      })
    ).rejects.toThrow();
  });

  it("rejects oversized, empty and malformed JSON bodies without invoking the SDK", async () => {
    const backend = vi.fn(() => Promise.resolve(sdk()));
    const url = await start({ maxRequestBytes: 1024, getClient: backend });
    const headers = { Authorization: "Bearer " + credential, "Content-Type": "application/json" };
    const oversized = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ jsonrpc: "2.0", id: 10, data: "x".repeat(2000) })
    });
    expect(oversized.status).toBe(413);
    const malformed = await fetch(url, { method: "POST", headers, body: "not-json" });
    expect(malformed.status).toBe(400);
    const empty = await fetch(url, { method: "POST", headers, body: "" });
    expect(empty.status).toBe(400);
    expect(backend).not.toHaveBeenCalled();
  });

  it("keeps a bounded per-server concurrency budget without blocking another request", async () => {
    const url = await start({ maxConcurrency: 1 });
    const headers = { Authorization: "Bearer " + credential, "Content-Type": "application/json" };
    // Hold a legitimate authenticated request open while it streams its body.
    // This exercises ingress limits without racing MCP Client notifications.
    const hanging = httpRequest(url, {
      method: "POST",
      headers: { ...headers, "Content-Length": "128" }
    });
    hanging.on("error", () => undefined);
    hanging.write('{"jsonrpc":');
    try {
      await new Promise<void>((resolve) => {
        hanging.once("socket", (socket) => {
          if (socket.connecting)
            socket.once("connect", () => {
              resolve();
            });
          else resolve();
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const denied = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", id: 199, method: "ping" })
      });
      expect(denied.status).toBe(429);
    } finally {
      hanging.destroy();
    }
  });

  it("surfaces bounded public SDK errors and isolated transport failures", async () => {
    const daemonFailure = sdk(
      new Response(
        JSON.stringify({
          code: "STATE_NOT_FOUND",
          message: "Unknown Commit",
          details: { ref: "commit/missing" }
        }),
        { status: 404 }
      )
    );
    const url = await start({ getClient: () => Promise.resolve(daemonFailure) });
    const mcp = await connect(url);
    const failure = await mcp.callTool({
      name: "kgos_read",
      arguments: { code: 'return await evolution.get({state:"commit/missing"});' }
    });
    expect(failure.isError).toBe(true);
    expect(value(failure)).toMatchObject({
      code: "STATE_NOT_FOUND",
      details: { ref: "commit/missing" }
    });
    await mcp.close();
    clients.splice(clients.indexOf(mcp), 1);

    const errorUrl = await start({
      getClient: () => Promise.reject(new Error("private host exception"))
    });
    const another = await connect(errorUrl);
    const internal = await another.callTool({
      name: "kgos_read",
      arguments: { code: "return 1;" }
    });
    expect(internal.isError).toBe(true);
    expect(value(internal)).toMatchObject({ code: "INTERNAL_ERROR" });
    expect(JSON.stringify(internal)).not.toContain("private host exception");
  });

  it("applies worker output resource budgets to the actual MCP Tool result", async () => {
    const url = await start({
      sandbox: {
        scriptTimeoutMs: 2000,
        scriptMemoryMb: 64,
        scriptMaxCodeBytes: 2048,
        scriptMaxCalls: 10,
        scriptMaxStreams: 4,
        scriptMaxOutputBytes: 1024
      }
    });
    const mcp = await connect(url);
    const result = await mcp.callTool({
      name: "kgos_read",
      arguments: { code: 'return "x".repeat(2000);' }
    });
    expect(result.isError).toBe(true);
    expect(value(result)).toMatchObject({ code: "RESOURCE_ERROR" });
    const healthy = await mcp.callTool({ name: "kgos_read", arguments: { code: "return true;" } });
    expect(value(healthy)).toEqual({ result: true });
  });
});
