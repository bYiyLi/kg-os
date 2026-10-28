import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

interface RuntimeResult {
  state: string;
  rows?: { elementId: string }[][];
}

type RuntimePost = (path: string, data: object) => Promise<RuntimeResult>;

export interface GraphRuntime {
  endpoint: string;
  token: string;
  modelState: string;
  latestState: string;
  targetId: string;
  neighborId: string;
  relationshipIds: string[];
  providerRequests: () => number;
  close: () => Promise<void>;
}

function definitionPatch(ref: string, body: string[]) {
  return [
    "diff --git a/" + ref + " b/" + ref,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + ref,
    "@@ -0,0 +1," + String(body.length) + " @@",
    ...body.map((line) => "+" + line),
    ""
  ].join("\n");
}

async function seed(post: RuntimePost) {
  const before = await post("evolution/overview", {});
  const model = await post("object/patch", {
    branch: "main",
    baseState: before.state,
    message: "Graph fixture model",
    patch:
      definitionPatch("new:node-definition:GraphDoc", [
        'name: "GraphDoc"',
        "properties:",
        '  - name: "key"',
        '    type: "STRING"',
        "    required: true",
        "    unique: true",
        '  - name: "title"',
        '    type: "STRING"',
        '  - name: "content"',
        '    type: "STRING"',
        "constraints: []",
        "indexes:",
        '  - name: "graph_text"',
        '    type: "fulltext"',
        '    properties: ["content"]',
        '  - name: "graph_semantic"',
        '    type: "vector"',
        '    properties: ["content"]'
      ]) +
      definitionPatch("new:relationship-definition:GRAPH_LINK", [
        'name: "GRAPH_LINK"',
        'from: "new:node-definition:GraphDoc"',
        'to: "new:node-definition:GraphDoc"',
        "properties:",
        '  - name: "note"',
        '    type: "STRING"',
        "constraints: []"
      ])
  });
  const latest = await post("graph/execute", {
    branch: "main",
    message: "Graph fixture searchable knowledge",
    cypher:
      "CREATE (a:GraphDoc {key:'shared', title:'Needle report', content:'needle semantic text'}), " +
      "(b:GraphDoc {key:'semantic', title:'Related insight', content:'related concept'}), " +
      "(c:GraphDoc {key:'neighbor', title:'Connected object'}), " +
      "(a)-[r1:GRAPH_LINK {note:'first parallel edge'}]->(c), " +
      "(a)-[r2:GRAPH_LINK {note:'second parallel edge'}]->(c), " +
      "(a)-[loop:GRAPH_LINK {note:'self loop'}]->(a) RETURN a,c,r1,r2,loop"
  });
  const row = latest.rows?.[0];
  if (row?.length !== 5) throw new Error("Graph fixture omitted identities");
  const [target, neighbor, ...relationships] = row;
  if (target === undefined || neighbor === undefined)
    throw new Error("Graph fixture omitted nodes");
  return {
    modelState: model.state,
    latestState: latest.state,
    targetId: target.elementId,
    neighborId: neighbor.elementId,
    relationshipIds: relationships.map((relationship) => relationship.elementId)
  };
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return;
  await new Promise<void>((done, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error("Graph acceptance daemon did not stop"));
    }, 5000);
    child.once("exit", () => {
      clearTimeout(deadline);
      done();
    });
    child.kill("SIGTERM");
  });
}

async function embeddings() {
  let requests = 0;
  const server = createServer((incoming, outgoing) => {
    void (async () => {
      let body = "";
      for await (const chunk of incoming) body += String(chunk);
      const payload = JSON.parse(body) as { input: string | string[] };
      const inputs = Array.isArray(payload.input) ? payload.input : [payload.input];
      requests += 1;
      outgoing.setHeader("Content-Type", "application/json");
      outgoing.end(
        JSON.stringify({
          object: "list",
          model: "graph-acceptance-model",
          data: inputs.map((input, index) => ({
            object: "embedding",
            index,
            embedding: /needle|related/i.test(input) ? [1, 0, 0] : [0, 1, 0]
          })),
          usage: { prompt_tokens: 0, total_tokens: 0 }
        })
      );
    })().catch(() => {
      outgoing.statusCode = 400;
      outgoing.end();
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("Embeddings fixture has no port");
  return {
    server,
    baseURL: "http://127.0.0.1:" + String(address.port) + "/v1",
    count: () => requests
  };
}

async function writeConfiguration(workspace: string, baseURL: string) {
  const instance = join(workspace, ".kgos");
  await mkdir(instance, { mode: 0o700 });
  await writeFile(
    join(instance, "config.toml"),
    [
      "[cache]",
      'path = "cache/graph.db"',
      "max_size_mb = 64",
      "[fulltext]",
      'analyzer = "jieba"',
      "[embedding]",
      "base_url = " + JSON.stringify(baseURL),
      'model = "graph-acceptance-model"',
      "dimensions = 3",
      'similarity = "cosine"',
      'api_key_env = ""',
      ""
    ].join("\n"),
    { mode: 0o600 }
  );
}

async function start(workspace: string, request: APIRequestContext) {
  const binary = resolve(
    "artifacts/runtime",
    process.platform + "-" + process.arch,
    process.platform === "win32" ? "kgosd.exe" : "kgosd"
  );
  const child = spawn(binary, ["--root", workspace], {
    stdio: "ignore",
    env: { ...process.env, KGOS_LOG_LEVEL: "WARN" }
  });
  let startupError: Error | undefined;
  child.once("error", (error) => {
    startupError = error;
  });
  let endpoint = "";
  let token = "";
  try {
    await expect
      .poll(
        async () => {
          if (startupError !== undefined) throw startupError;
          if (child.exitCode !== null) throw new Error("Graph acceptance daemon exited");
          try {
            const locator = JSON.parse(
              await readFile(join(workspace, ".kgos/kgosd.lock"), "utf8")
            ) as { endpoint: string; pid: number };
            if (locator.pid !== child.pid) return "starting";
            endpoint = locator.endpoint;
            ({ token } = JSON.parse(await readFile(join(workspace, ".kgos/auth.json"), "utf8")) as {
              token: string;
            });
            const response = await request.get(endpoint + "/api/v1/setup/status", {
              headers: { Authorization: "Bearer " + token }
            });
            return response.ok()
              ? ((await response.json()) as { state: string }).state
              : "starting";
          } catch {
            return "starting";
          }
        },
        { timeout: 25000 }
      )
      .toBe("ready");
    return { child, endpoint, token };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

function closeProvider(server: Server) {
  return new Promise<void>((done, reject) =>
    server.close((error) => {
      if (error === undefined) done();
      else reject(error);
    })
  );
}

// Each test owns a real throwaway Instance and local provider. No graph API is
// intercepted, and neither the existing development data nor paid models are used.
export async function createGraphRuntime(request: APIRequestContext): Promise<GraphRuntime> {
  const workspace = await mkdtemp(join(tmpdir(), "kgos-graph-e2e-"));
  const provider = await embeddings();
  let active: Awaited<ReturnType<typeof start>> | undefined;
  try {
    await writeConfiguration(workspace, provider.baseURL);
    active = await start(workspace, request);
    const runtime = active;
    const post: RuntimePost = async (path, data) => {
      const response = await request.post(runtime.endpoint + "/api/v1/" + path, {
        headers: { Authorization: "Bearer " + runtime.token },
        data
      });
      if (!response.ok()) {
        const error = (await response.json()) as { code?: string; message?: string };
        throw new Error(
          "Graph fixture API " +
            String(response.status()) +
            ": " +
            (error.code ?? "UNKNOWN_ERROR") +
            " " +
            (error.message ?? "Request failed")
        );
      }
      return (await response.json()) as RuntimeResult;
    };
    const data = await seed(post);
    return {
      endpoint: active.endpoint,
      token: active.token,
      ...data,
      providerRequests: provider.count,
      close: async () => {
        try {
          await stop(runtime.child);
        } finally {
          await closeProvider(provider.server);
          await rm(workspace, { recursive: true, force: true });
        }
      }
    };
  } catch (error) {
    try {
      if (active !== undefined) await stop(active.child);
    } finally {
      await closeProvider(provider.server);
      await rm(workspace, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function signInGraph(page: Page, runtime: GraphRuntime) {
  await page.goto(runtime.endpoint + "/");
  await page.getByLabel("Access Token", { exact: true }).fill(runtime.token);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  await expect(page.locator(".version-sidebar")).toBeVisible();
}
