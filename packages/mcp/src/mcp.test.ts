import type { AddressInfo } from "node:net";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { KGOSClient } from "@kgos/sdk";
import { afterEach, describe, expect, it } from "vitest";

import { stateAncestry } from "./ancestry.js";
import { MAX_VIEW_BYTES, navigation, summaryFromMessage } from "./markdown.js";
import { PreviewCache } from "./preview-cache.js";
import { executeScript } from "./sandbox.js";
import { startMCPServer } from "./server.js";

const token = "temporary-integration-test-credential-xxxxxxxx";
const commitA = "commit/aaa";
const commitB = "commit/bbb";
const message = "## 简介\n\n人员与组织。\n\n## 改动\n\n添加模型\n````embedded\n";

type RequestBody = Record<string, unknown>;
function kindForRef(ref: string): "domain" | "node-definition" | "relationship-definition" {
  if (ref.startsWith("domain:")) return "domain";
  if (ref.startsWith("node:")) return "node-definition";
  return "relationship-definition";
}
type RequestHandler = (
  pathname: string,
  body: RequestBody,
  options?: RequestInit
) => Promise<Response> | Response;

function sdk(handler: RequestHandler): KGOSClient {
  return new KGOSClient({
    endpoint: "http://127.0.0.1:8181",
    token: "local-daemon-token",
    fetch: async (input: string | URL | Request, options?: RequestInit) => {
      let requestUrl: string;
      if (typeof input === "string") requestUrl = input;
      else if (input instanceof URL) requestUrl = input.toString();
      else requestUrl = input.url;
      const pathname = new URL(requestUrl).pathname;
      const body =
        typeof options?.body === "string" ? (JSON.parse(options.body) as RequestBody) : {};
      return await handler(pathname, body, options);
    }
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function fakeGraph(): Response {
  const data = [
    { type: "columns", columns: ["name"] },
    { type: "row", row: ["Alice"] },
    { type: "summary", state: commitA }
  ];
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of data) controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        controller.close();
      }
    }),
    { status: 200, headers: { "Content-Type": "application/x-ndjson" } }
  );
}

function fixture() {
  let latest = commitA;
  const calls: string[] = [];
  const client = sdk((path, body) => {
    calls.push(path);
    if (path.endsWith("/evolution/overview")) return json({ state: latest, defaultBranch: "main" });
    if (path.endsWith("/evolution/branch/list"))
      return json({
        items: [
          { name: "main", state: latest },
          { name: "development", state: commitB }
        ]
      });
    if (path.endsWith("/evolution/get"))
      return json({
        state: body["state"],
        parents: [commitA],
        author: "author",
        message,
        committedAt: 1700000000000000,
        consistency: { status: "valid", issues: [] },
        data: null,
        hasData: false
      });
    if (path.endsWith("/evolution/ancestry"))
      return json({
        root: commitA,
        items: [
          {
            state: commitA,
            parents: [commitB],
            author: "author",
            message,
            committedAt: 1700000000000000
          },
          { state: commitB, parents: [], committedAt: 1690000000000000 }
        ]
      });
    if (path.endsWith("/ontology/read")) {
      if (Array.isArray(body["refs"]) && body["refs"][0] === "domain:Work") {
        return json({
          state: body["at"],
          results: [
            {
              ref: "domain:Work",
              kind: "domain",
              markdown: "",
              total: 2,
              items: [
                { ref: "node:Person", name: "Person", kind: "node-definition" },
                { ref: "relationship:KNOWS", name: "KNOWS", kind: "relationship-definition" }
              ]
            }
          ]
        });
      }
      return json({
        state: body["at"],
        results: [
          {
            kind: "overview",
            markdown: "",
            total: 1,
            items: [{ ref: "domain:Work", name: "Work", kind: "domain", title: "领域|A" }]
          }
        ]
      });
    }
    if (path.endsWith("/object/read-text")) {
      const refs = body["refs"] as string[];
      return json({
        state: body["at"],
        results: refs.map((ref) => ({
          ref,
          kind: kindForRef(ref),
          body: `name: "${ref}"\ndescription: "This includes \`\`\` tricky fences"\n`
        }))
      });
    }
    if (path.endsWith("/object/read")) {
      const refs = body["refs"] as string[];
      return json({
        state: body["at"],
        results: refs.map((ref) => ({
          ref,
          kind: kindForRef(ref),
          value:
            ref === "relationship:KNOWS"
              ? { name: "KNOWS", from: "node:Person", to: null }
              : { name: ref }
        }))
      });
    }
    if (path.endsWith("/graph/query")) {
      return json({ state: commitA, columns: ["name"], rows: [["Alice"]] });
    }
    if (path.endsWith("/evolution/branch/create"))
      return json({ name: body["name"], state: commitA });
    return json({ code: "NOT_FOUND", message: "Unknown route" }, 404);
  });
  return {
    client,
    calls,
    changeHead: (head: string) => {
      latest = head;
    }
  };
}

describe("Phase 15 MCP views", () => {
  it("generates pinned complete branch/domain/definition view with exact lines and fenced messages", async () => {
    const { client, calls, changeHead } = fixture();
    const cache = new PreviewCache();
    const start = await cache.read(client, "alice", { offset: 0, limit: 100 });
    const lines = start.preview.split("\n");
    expect(start.totalLines).toBeGreaterThan(40);
    expect(start.preview).toContain("## main");
    expect(start.preview).toContain("## development");
    expect(start.preview).toContain("KNOWS");
    expect(start.preview).toContain("`````markdown");
    expect(start.preview).toContain("领域&#124;A");
    expect(start.preview).toContain("mermaid");
    expect(lines.some((line) => line.includes("Domain 组织"))).toBe(true);
    const initialCalls = calls.length;
    changeHead(commitB);
    const pages = [start.preview];
    for (let offset = start.lineCount; offset < start.totalLines; offset += 100) {
      const next = await cache.read(client, "alice", {
        offset,
        limit: 100,
        viewRevision: start.viewRevision
      });
      pages.push(next.preview);
    }
    expect(calls).toHaveLength(initialCalls);
    const document = pages.join("");
    expect(document.endsWith("\n")).toBe(true);
    expect(document.endsWith("\n\n")).toBe(false);
    expect(document.split("\n").length - 1).toBe(start.totalLines);
    const allLines = document.trimEnd().split("\n");
    const matches = [
      ...document.matchAll(/\| (node:Person|relationship:KNOWS) \|[^\n]*\| (\d+) \| (\d+) \|/g)
    ];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      const offset = Number(match[2]);
      const length = Number(match[3]);
      expect(allLines[offset]).toContain(match[1]);
      expect(length).toBeGreaterThan(3);
    }
    await expect(
      cache.read(client, "bob", { limit: 100, viewRevision: start.viewRevision })
    ).rejects.toMatchObject({ code: "VIEW_EXPIRED" });
    await expect(
      cache.read(client, "alice", {
        offset: start.totalLines + 1,
        limit: 100,
        viewRevision: start.viewRevision
      })
    ).rejects.toMatchObject({ code: "INVALID_ARGUMENT" });
  });

  it("renders real DAG edges, missing parents and exact raw Messages", async () => {
    const { client } = fixture();
    const value = await stateAncestry(client, { root: "branch/main", limit: 2 });
    expect(value.root).toBe(commitA);
    expect(value.count).toBe(2);
    expect(value.markdown).toContain("1700000000000000");
    expect(value.markdown).toContain("## 简介");
    expect(value.markdown).toContain("`````markdown");
    expect(value.markdown).toContain("commit/bbb");
    expect(value.markdown.endsWith("\n\n")).toBe(false);
    await expect(stateAncestry(client, { root: "branch/main", limit: 0 })).rejects.toMatchObject({
      code: "INVALID_ARGUMENT"
    });
    expect(summaryFromMessage("random description")).toBe("无规范简介");
    expect(navigation("a|b\n## heading")).toContain("&#124;");
    expect(MAX_VIEW_BYTES).toBeGreaterThan(1_000_000);
  });
});

describe("Phase 15 real QuickJS Worker", () => {
  it("executes parallel SDK promises, and rejects elevated read methods", async () => {
    const { client, calls } = fixture();
    expect(
      await executeScript(
        client,
        `
      const [a,b] = await Promise.all([evolution.overview(), evolution.overview()]);
      return {a,b,host:typeof process, fetch:typeof fetch};
    `,
        false
      )
    ).toMatchObject({
      a: { state: commitA },
      b: { state: commitA },
      host: "undefined",
      fetch: "undefined"
    });
    await expect(
      executeScript(
        client,
        "return await evolution.branch.create({name:'forbidden',from:'commit/aaa'})",
        false
      )
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(calls).not.toContain("/api/v1/evolution/branch/create");
    expect(
      await executeScript(
        client,
        "const branch=await evolution.branch.create({name:'allowed',from:'commit/aaa'}); return branch.name",
        true
      )
    ).toBe("allowed");
  }, 12_000);

  it("rejects invalid results, JS errors and terminates guest loops via cancellation", async () => {
    const { client } = fixture();
    for (const code of [
      "let x=1",
      "return undefined",
      "return 1n",
      "return Infinity",
      "return () => 1",
      "const a={};a.self=a;return a",
      "return {bad:undefined}"
    ]) {
      await expect(executeScript(client, code, false)).rejects.toMatchObject({
        code: "SCRIPT_ERROR"
      });
    }
    const controller = new AbortController();
    const waiting = executeScript(client, "while(true) {}", false, { signal: controller.signal });
    setTimeout(() => {
      controller.abort();
    }, 50);
    await expect(waiting).rejects.toMatchObject({ code: "CANCELLED" });
    expect(await executeScript(client, "return 42", false)).toBe(42);
  }, 20_000);

  it("incrementally consumes streamed SDK events", async () => {
    const client = sdk((path, _body, options) => {
      if (
        path.endsWith("/graph/query") &&
        new Headers(options?.headers).get("Accept") === "application/x-ndjson"
      ) {
        return fakeGraph();
      }
      return json({ code: "NOT_FOUND", message: "Unknown route" }, 404);
    });
    const result = await executeScript(
      client,
      `
      const result=[];
      for await (const event of graph.streamQuery({at:"commit/aaa",cypher:"RETURN 1"})) {
        result.push(event.type);
      }
      return result;
    `,
      false
    );
    expect(result).toEqual(["columns", "row", "summary"]);
  }, 12_000);
});

describe("Phase 15 standard MCP HTTP client", () => {
  const servers: Awaited<ReturnType<typeof startMCPServer>>[] = [];
  afterEach(async () => {
    for (const server of servers.splice(0))
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve();
        })
      );
  });

  it("enforces external Bearer and discovers only four tools over Streamable HTTP", async () => {
    const { client } = fixture();
    const server = await startMCPServer({
      token,
      port: 0,
      getClient: () => Promise.resolve(client)
    });
    servers.push(server);
    const address = server.address() as AddressInfo;
    const url = new URL("http://127.0.0.1:" + String(address.port) + "/mcp");
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: "Bearer wrong-token" } })).status).toBe(
      401
    );
    expect(
      (
        await fetch(url, {
          headers: { Authorization: `Bearer ${token}`, Origin: "https://evil.example" }
        })
      ).status
    ).toBe(403);
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers: { Authorization: `Bearer ${token}` } }
    });
    const mcp = new Client({ name: "phase15-acceptance", version: "1.0.0" });
    try {
      // Upstream MCP SDK optional callback declarations disagree under
      // exactOptionalPropertyTypes; runtime transport compatibility is tested.
      await mcp.connect(transport as unknown as Transport);
      const tools = await mcp.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        "kgos_preview",
        "kgos_read",
        "kgos_run",
        "state_ancestry"
      ]);
      expect(
        tools.tools.find((tool) => tool.name === "kgos_run")?.annotations?.destructiveHint
      ).toBe(true);
      const read = await mcp.callTool({
        name: "kgos_read",
        arguments: { code: "const x=await evolution.overview();return x.state" }
      });
      expect(read.isError).not.toBe(true);
      expect(read.content).toContainEqual({
        type: "text",
        text: JSON.stringify({ result: commitA })
      });
      const preview = await mcp.callTool({ name: "kgos_preview", arguments: { limit: 100 } });
      expect(preview.isError).not.toBe(true);
      expect(JSON.stringify(preview)).toContain("viewRevision");
      const ancestry = await mcp.callTool({ name: "state_ancestry", arguments: { root: commitA } });
      expect(ancestry.isError).not.toBe(true);
    } finally {
      await mcp.close();
    }
  }, 25_000);
});

describe("Phase 15 Ancestry pagination and cross-page DAG", () => {
  it("pins an immutable cursor root while retaining original multi-parent topology", async () => {
    const seen: Record<string, unknown>[] = [];
    const client = sdk((path, body) => {
      if (!path.endsWith("/evolution/ancestry")) {
        return json({ code: "NOT_FOUND", message: "Unknown route" }, 404);
      }
      seen.push(body);
      return json({
        root: "commit/resolved",
        cursor: "opaque-next",
        items: [
          {
            state: "commit/resolved",
            parents: ["commit/parent", "commit/outside"],
            author: "AI|Owner",
            message: "A full original commit message\n## heading\n",
            committedAt: 123
          },
          { state: "commit/parent", parents: null, committedAt: 120 }
        ]
      });
    });
    const page = await stateAncestry(client, {
      root: "commit/resolved",
      limit: 2,
      cursor: "opaque-previous"
    });
    expect(seen).toEqual([{ root: "commit/resolved", limit: 2, cursor: "opaque-previous" }]);
    expect(page.root).toBe("commit/resolved");
    expect(page.count).toBe(2);
    expect(page.cursor).toBe("opaque-next");
    expect(page.markdown).toContain("未在本页展开");
    expect(page.markdown).toContain("commit/outside");
    expect(page.markdown).toContain("AI&#124;Owner");
    expect(page.markdown).toContain("（无 Message）");
    expect(page.markdown).toContain("A full original commit message");
  });

  it("rejects unresolved root and invalid pagination bounds", async () => {
    const client = sdk(() => json({ root: "branch/main", items: [] }));
    await expect(stateAncestry(client, { root: "branch/main" })).rejects.toMatchObject({
      code: "RESOURCE_ERROR"
    });
    for (const limit of [-1, 0, 1001, 1.5]) {
      await expect(stateAncestry(client, { root: "branch/main", limit })).rejects.toMatchObject({
        code: "INVALID_ARGUMENT"
      });
    }
  });
});
