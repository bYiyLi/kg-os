import { createHash, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { readFile } from "node:fs/promises";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { KGOSClient } from "@kgos/sdk";
import { KGOS_VERSION, KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import * as z from "zod/v4";

import { stateAncestry } from "./ancestry.js";
import { OAuthBroker } from "./oauth.js";
import { PreviewCache } from "./preview-cache.js";
import type { PreviewLimits } from "./preview.js";
import { ExecutionError, executeScript, type SandboxLimits } from "./sandbox.js";

type ClientFactory = () => Promise<KGOSClient>;

function reportError(error: unknown): { code: string; message: string; details?: unknown } {
  if (error instanceof KGOSDaemonError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1024),
      ...(error.details === undefined ? {} : { details: error.details })
    };
  }
  if (error instanceof ExecutionError) {
    return {
      code: error.code,
      message: error.message.slice(0, 1024),
      ...(error.details === undefined ? {} : { details: error.details })
    };
  }
  if (error instanceof KGOSTransportError) {
    return {
      code: error.aborted ? "CANCELLED" : "TRANSPORT_ERROR",
      message: error.aborted ? "Call cancelled; writes may have completed" : error.message
    };
  }
  return { code: "INTERNAL_ERROR", message: "KG OS MCP request failed" };
}

async function toolResult<T>(
  callback: () => Promise<T>
): Promise<{ content: [{ type: "text"; text: string }]; isError?: true }> {
  try {
    const result = await callback();
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return {
      content: [{ type: "text", text: JSON.stringify(reportError(error)) }],
      isError: true
    };
  }
}

interface ToolContext {
  getClient: ClientFactory;
  preview: PreviewCache;
  principal: string;
  signal: AbortSignal;
  sandbox?: SandboxLimits;
}

function createToolServer(context: ToolContext): McpServer {
  const { getClient, preview, principal, signal, sandbox } = context;
  const server = new McpServer({ name: "kgos", version: KGOS_VERSION });
  const active = (operation: AbortSignal) => AbortSignal.any([signal, operation]);
  server.registerTool(
    "kgos_preview",
    {
      title: "KG OS ontology preview",
      description:
        "Read an immutable Markdown line window covering all Branch heads and complete pinned Ontologies.",
      inputSchema: {
        offset: z.number().int().min(0).optional(),
        limit: z.number().int().min(100).max(500).optional(),
        viewRevision: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    (args, extra) =>
      toolResult(
        async () => await preview.read(await getClient(), principal, args, active(extra.signal))
      )
  );
  server.registerTool(
    "state_ancestry",
    {
      title: "KG OS Commit ancestry",
      description:
        "Read the pinned Commit ancestry DAG page and unmodified complete Commit Messages as Markdown.",
      inputSchema: {
        root: z.string().min(1),
        limit: z.number().int().min(1).max(1000).optional(),
        cursor: z.string().optional()
      },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    (args, extra) =>
      toolResult(async () => await stateAncestry(await getClient(), args, active(extra.signal)))
  );
  server.registerTool(
    "kgos_read",
    {
      title: "KG OS JavaScript read",
      description:
        "Execute an async JavaScript function body against read-only ontology/object/graph/evolution SDK methods. Return a JSON-compatible value explicitly.",
      inputSchema: { code: z.string() },
      annotations: { readOnlyHint: true, openWorldHint: false, destructiveHint: false }
    },
    (args, extra) =>
      toolResult(async () => ({
        result: await executeScript(await getClient(), args.code, false, {
          signal: active(extra.signal),
          ...(sandbox === undefined ? {} : { limits: sandbox })
        })
      }))
  );
  server.registerTool(
    "kgos_run",
    {
      title: "KG OS JavaScript read/write",
      description:
        "Execute async JavaScript using all supported SDK methods including mutations. Each SDK write commits independently; errors/cancellations may leave writes completed.",
      inputSchema: { code: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false }
    },
    (args, extra) =>
      toolResult(async () => ({
        result: await executeScript(await getClient(), args.code, true, {
          signal: active(extra.signal),
          ...(sandbox === undefined ? {} : { limits: sandbox })
        })
      }))
  );
  return server;
}

function authorized(header: string | undefined, digest: Buffer): boolean {
  if (header?.startsWith("Bearer ") !== true) return false;
  const token = header.slice("Bearer ".length);
  if (token.length === 0 || token.length > 4096) return false;
  const supplied = createHash("sha256").update(token).digest();
  return timingSafeEqual(supplied, digest);
}

export interface MCPServerOptions {
  token: string;
  oauthIssuer?: string;
  port: number;
  host?: string;
  path?: string;
  tls?: { cert: string; key: string };
  requestTimeoutMs?: number;
  maxConcurrency?: number;
  maxRequestBytes?: number;
  sandbox?: SandboxLimits;
  preview?: PreviewLimits;
  getClient: ClientFactory;
}

interface HTTPContext {
  settings: MCPServerOptions;
  hash: Buffer;
  principal: string;
  oauth?: OAuthBroker;
  preview: PreviewCache;
  active: number;
}

class RequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function respond(res: ServerResponse, status: number, message: string): void {
  if (res.headersSent) return;
  res
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32600, message }, id: null }));
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > maxBytes) {
    throw new RequestError(413, "MCP request body is too large");
  }
  if (req.method !== "POST") return undefined;
  const chunks: Buffer[] = [];
  let count = 0;
  for await (const value of req as AsyncIterable<unknown>) {
    if (!Buffer.isBuffer(value)) throw new RequestError(400, "Invalid MCP request body");
    count += value.byteLength;
    if (count > maxBytes) throw new RequestError(413, "MCP request body is too large");
    chunks.push(value);
  }
  if (count === 0) throw new RequestError(400, "Empty MCP request");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new RequestError(400, "Invalid MCP JSON request");
  }
}

async function serveRequest(
  context: HTTPContext,
  req: IncomingMessage,
  res: ServerResponse,
  caller: { signal: AbortSignal; principal: string }
): Promise<void> {
  const settings = context.settings;
  const body = await readBody(req, settings.maxRequestBytes ?? 1_048_576);
  if (caller.signal.aborted) return;
  const mcp = createToolServer({
    getClient: settings.getClient,
    preview: context.preview,
    principal: caller.principal,
    signal: caller.signal,
    ...(settings.sandbox === undefined ? {} : { sandbox: settings.sandbox })
  });
  const transport = new StreamableHTTPServerTransport({ enableJsonResponse: true });
  try {
    await mcp.connect(transport as unknown as Transport);
    await transport.handleRequest(req, res, body);
  } finally {
    await transport.close().catch(() => undefined);
    await mcp.close().catch(() => undefined);
  }
}

function handleHTTP(context: HTTPContext, req: IncomingMessage, res: ServerResponse): void {
  const settings = context.settings;
  if (req.url !== (settings.path ?? "/mcp")) {
    res.writeHead(404).end();
    return;
  }
  const header = req.headers.authorization;
  const staticAuthorized = authorized(header, context.hash);
  let principal: string | undefined;
  if (staticAuthorized) principal = context.principal;
  else if (header?.startsWith("Bearer ") === true) {
    principal = context.oauth?.principal(header.slice("Bearer ".length));
  }
  if (principal === undefined) {
    res.setHeader(
      "WWW-Authenticate",
      context.oauth === undefined
        ? 'Bearer realm="KG OS MCP"'
        : 'Bearer realm="KG OS MCP", resource_metadata="' +
            context.oauth.resourceMetadataUrl +
            '", scope="kgos:access"'
    );
    res.writeHead(401).end();
    return;
  }
  if (req.headers.origin !== undefined) {
    res.writeHead(403).end();
    return;
  }
  if (context.active >= (settings.maxConcurrency ?? 16)) {
    respond(res, 429, "MCP request concurrency exceeded");
    return;
  }
  context.active += 1;
  const controller = new AbortController();
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    clearTimeout(timer);
    controller.abort();
    context.active -= 1;
  };
  const timer = setTimeout(() => {
    controller.abort();
    respond(res, 408, "MCP request timed out; writes may have completed");
    req.destroy();
  }, settings.requestTimeoutMs ?? 30_000);
  res.once("close", cleanup);
  req.once("aborted", cleanup);
  void serveRequest(context, req, res, { signal: controller.signal, principal })
    .catch((error: unknown) => {
      if (error instanceof RequestError) respond(res, error.status, error.message);
      else respond(res, 500, "Internal MCP server error");
    })
    .finally(cleanup);
}

export async function startMCPServer(options: MCPServerOptions): Promise<Server> {
  if (Buffer.byteLength(options.token, "utf8") < 32) {
    throw new Error("MCP credential is invalid");
  }
  if (!Number.isSafeInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new Error("MCP port is invalid");
  }
  const hash = createHash("sha256").update(options.token).digest();
  const context: HTTPContext = {
    settings: options,
    hash,
    principal: hash.toString("hex"),
    ...(options.oauthIssuer === undefined
      ? {}
      : { oauth: new OAuthBroker(options.oauthIssuer, options.token, options.path ?? "/mcp") }),
    preview: new PreviewCache(options.preview),
    active: 0
  };
  const listener = (req: IncomingMessage, res: ServerResponse) => {
    if (context.oauth === undefined) {
      handleHTTP(context, req, res);
      return;
    }
    void context.oauth
      .handle(req, res)
      .then((handled) => {
        if (!handled) handleHTTP(context, req, res);
      })
      .catch(() => {
        if (!res.headersSent) res.writeHead(500).end();
      });
  };
  const server =
    options.tls === undefined
      ? createServer(listener)
      : createHttpsServer(
          {
            cert: await readFile(options.tls.cert),
            key: await readFile(options.tls.key)
          },
          listener
        );
  return await new Promise<Server>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, options.host ?? "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
