import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { runCapture } from "./process.mjs";
import { verifyMcpSdkMatrix } from "./mcp-sdk-matrix.mjs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// This is a Linux Docker test for GitHub Actions and OpenClaw, NOT Mac's
// pnpm validate. All writes happen inside a disposable Docker volume.
if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("Unified Docker smoke must run on Linux amd64 (OpenClaw or GitHub Actions)");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const identifier = randomUUID().slice(0, 12);
const suppliedImage = process.env.KGOS_UNIFIED_DOCKER_SMOKE_IMAGE;
if (suppliedImage !== undefined && suppliedImage.trim() === "") {
  throw new Error("KGOS_UNIFIED_DOCKER_SMOKE_IMAGE must not be empty");
}
const ownsImage = suppliedImage === undefined;
const image = suppliedImage ?? "kgos-unified-smoke-" + identifier;
const volume = "kgos-unified-test-" + identifier;
let token;
// This fixture issuer only tests discovery, not an actual ChatGPT login.
const oauthIssuer = "https://kgos-smoke.example.invalid";

const config = [
  "[cache]",
  'path = "cache/openai-compatible.db"',
  "max_size_mb = 16",
  "",
  "[fulltext]",
  'analyzer = "unicode61"',
  "",
  "[embedding]",
  'base_url = "https://example.invalid/v1"',
  'model = "phase16-unified-docker"',
  "dimensions = 3",
  'similarity = "cosine"',
  'api_key_env = ""',
  ""
].join("\n");

let container;
let session;
let mcpClient;
let volumeCreated = false;

async function docker(...args) {
  return (await runCapture("docker", args, { cwd: root })).stdout.trim();
}

function toolValue(response) {
  assert.notEqual(response?.isError, true, "MCP tool returned an error");
  assert.equal(response?.content?.[0]?.type, "text");
  return JSON.parse(response.content[0].text);
}

async function assertImage() {
  assert.equal(
    await docker("image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", image),
    "linux/amd64"
  );
  assert.equal(
    await docker("image", "inspect", "--format", "{{.Config.User}}", image),
    "10001:10001"
  );
  await docker(
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "--entrypoint",
    "/bin/sh",
    image,
    "-ec",
    "test -x /opt/kgos/kgosd; ! command -v node >/dev/null 2>&1; ! command -v npm >/dev/null 2>&1; test -s /opt/kgos/third-party-notices/QuickJS-NG-WASI-MIT.txt; test -s /opt/kgos/third-party-notices/MCP-Go-SDK-Apache-MIT.txt; test -s /opt/kgos/third-party-notices/wazero-Apache-2.0.txt"
  );
}

async function initializeVolume() {
  await docker("volume", "create", volume);
  volumeCreated = true;
  await docker(
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    "--entrypoint",
    "/bin/sh",
    image,
    "-ec",
    "mkdir -p /workspace/.kgos && cat > /workspace/.kgos/config.toml <<'KGOS_CONFIG'\n" +
      config +
      "KGOS_CONFIG\n"
  );
  await docker(
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    image,
    "init",
    "--root",
    "/workspace"
  );
  const receipt = await docker(
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    "--entrypoint",
    "/bin/cat",
    image,
    "/workspace/.kgos/initialized.json"
  );
  assert.deepEqual(JSON.parse(receipt), { version: 1 });
}

async function start() {
  container = await docker(
    "run",
    "-d",
    "--rm",
    "--platform",
    "linux/amd64",
    "-p",
    "127.0.0.1::3777",
    "-v",
    volume + ":/workspace",
    "-e",
    "KGOS_MCP_OAUTH_ISSUER=" + oauthIssuer,
    image
  );
  const binding = await docker("port", container, "3777/tcp");
  const port = binding.split("\n")[0]?.match(/:(\d+)$/)?.[1];
  if (port === undefined) throw new Error("Docker MCP port was not published");
  const base = "http://127.0.0.1:" + port;
  token = JSON.parse(await docker("exec", container, "cat", "/workspace/.kgos/auth.json")).token;
  for (let attempt = 0; attempt < 90; attempt++) {
    try {
      const response = await fetch(base + "/mcp");
      await response.body?.cancel();
      if (response.status === 401) {
        await docker(
          "exec",
          container,
          "/bin/sh",
          "-ec",
          'test "$(cat /proc/1/comm)" = kgosd; test "$(id -u)" = 10001'
        );
        return base;
      }
    } catch {
      // Wait for the daemon and its pinned runtime extensions to start.
    }
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error("Unified kgosd did not publish a working MCP listener");
}

async function connect(base) {
  const transport = new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  mcpClient = new Client({ name: "unified-docker-smoke", version: "1.0.0" });
  await mcpClient.connect(transport);
  session = transport;
  const tools = (await mcpClient.listTools()).tools;
  const names = tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "kgos_commit_ancestry",
    "kgos_docs",
    "kgos_mutate",
    "kgos_ontology_overview",
    "kgos_query",
    "kgos_workspace"
  ]);
  for (const name of [
    "kgos_docs",
    "kgos_ontology_overview",
    "kgos_query",
    "kgos_commit_ancestry"
  ]) {
    assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
  }
  assert.equal(tools.find((tool) => tool.name === "kgos_mutate")?.annotations?.readOnlyHint, false);
  const workspaceURI = "ui://kgos/workspace/v1";
  const workspace = tools.find((tool) => tool.name === "kgos_workspace");
  assert.equal(workspace?.annotations?.readOnlyHint, true);
  assert.equal(workspace?._meta?.ui?.resourceUri, workspaceURI);
  assert.deepEqual(workspace?._meta?.ui?.visibility, ["app"]);
  assert.deepEqual(workspace?._meta?.["openai/ui"]?.entrypoints, [
    { type: "global" },
    { type: "thread" }
  ]);
  const resources = (await mcpClient.listResources()).resources;
  assert.equal(
    resources.find((resource) => resource.uri === workspaceURI)?.mimeType,
    "text/html;profile=mcp-app"
  );
  const contents = (await mcpClient.readResource({ uri: workspaceURI })).contents;
  assert.equal(contents.length, 1);
  assert.equal(contents[0].uri, workspaceURI);
  assert.equal(contents[0].mimeType, "text/html;profile=mcp-app");
  assert.match(contents[0].text, /<script type="module">/);
  assert.match(contents[0].text, /<style>/);
  assert.doesNotMatch(contents[0].text, /(?:src|href)="\/assets\//);
}

async function verifyHTTP(base) {
  const web = await fetch(base + "/");
  assert.equal(web.status, 200, "Web Shell must use the unified listener");
  assert.match(web.headers.get("content-type") ?? "", /text\/html/);
  await web.body?.cancel();

  const denied = await fetch(base + "/mcp");
  assert.equal(denied.status, 401);
  assert.match(
    denied.headers.get("www-authenticate") ?? "",
    /Bearer resource_metadata="https:\/\/kgos-smoke\.example\.invalid\/\.well-known\/oauth-protected-resource\/mcp"/
  );
  await denied.body?.cancel();
  const pathMetadata = await fetch(base + "/.well-known/oauth-protected-resource/mcp");
  assert.equal(pathMetadata.status, 200);
  const protectedResource = await pathMetadata.json();
  assert.equal(protectedResource.resource, oauthIssuer);
  assert.deepEqual(protectedResource.authorization_servers, [oauthIssuer]);
  const rootMetadata = await fetch(base + "/.well-known/oauth-protected-resource");
  assert.equal(rootMetadata.status, 200);
  assert.deepEqual(await rootMetadata.json(), protectedResource);
  const authorizationMetadata = await fetch(base + "/.well-known/oauth-authorization-server");
  assert.equal(authorizationMetadata.status, 200);
  const authorizationServer = await authorizationMetadata.json();
  assert.equal(authorizationServer.issuer, oauthIssuer);
  assert.equal(authorizationServer.authorization_endpoint, oauthIssuer + "/oauth/authorize");
  assert.equal(authorizationServer.token_endpoint, oauthIssuer + "/oauth/token");
  const tokenEndpoint = await fetch(base + "/oauth/token");
  assert.equal(tokenEndpoint.status, 405, "OAuth endpoint missing from shared listener");
  await tokenEndpoint.body?.cancel();

  const request = (bearer) =>
    fetch(base + "/api/v1/evolution/overview", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
      body: "{}"
    });
  const rejected = await request("invalid-instance-bearer");
  assert.equal(rejected.status, 401, "Wrong Instance bearer must be rejected");
  assert.match(rejected.headers.get("x-kgos-request-id") ?? "", /^req_[a-f0-9]{32}$/);
  await rejected.body?.cancel();
  const authorized = await request(token);
  assert.equal(authorized.status, 200, "Instance credential must still authorize the API");
  assert.match(authorized.headers.get("x-kgos-request-id") ?? "", /^req_[a-f0-9]{32}$/);
  assert.equal(typeof (await authorized.json()).state, "string");

  const diagnostics = (bearer) =>
    fetch(base + "/api/v1/system/diagnostics", {
      method: "POST",
      headers: { Authorization: "Bearer " + bearer, "Content-Type": "application/json" },
      body: "{}"
    });
  const diagnosticsDenied = await diagnostics("mcp-oauth-wrong-audience");
  assert.equal(
    diagnosticsDenied.status,
    401,
    "MCP credentials cannot read the API diagnostic summary"
  );
  await diagnosticsDenied.body?.cancel();
  const snapshotResponse = await diagnostics(token);
  assert.equal(snapshotResponse.status, 200, "Instance must read its own metrics");
  const snapshot = await snapshotResponse.json();
  assert.equal(typeof snapshot.uptime_seconds, "number");
  assert.equal(typeof snapshot.process.heap_alloc_bytes, "number");
  assert.ok(snapshot.http.requests_total > 0);
  assert.ok(snapshot.http.non_2xx_total > 0);
  assert.deepEqual(Object.keys(snapshot.business.outcomes).sort(), [
    "applied",
    "committed",
    "failed",
    "no_change",
    "rejected",
    "unknown"
  ]);
}

async function stop() {
  await mcpClient?.close().catch(() => undefined);
  await session?.close().catch(() => undefined);
  mcpClient = undefined;
  session = undefined;
  if (container) {
    await docker("stop", "--time", "15", container);
    container = undefined;
  }
}

try {
  if (ownsImage) {
    const buildArgs = ["build", "--platform", "linux/amd64", "-f", "Dockerfile.unified"];
    const baseImage = process.env.KGOS_DOCKER_BASE_IMAGE;
    if (baseImage) buildArgs.push("--build-arg", "NODE_IMAGE=" + baseImage);
    const runtimeImage = process.env.KGOS_DOCKER_DEBIAN_IMAGE;
    if (runtimeImage) buildArgs.push("--build-arg", "DEBIAN_IMAGE=" + runtimeImage);
    buildArgs.push("-t", image, ".");
    await docker(...buildArgs);
  }
  await assertImage();
  await initializeVolume();
  const endpoint = await start();
  await verifyHTTP(endpoint);
  await connect(endpoint);
  const rootDoc = toolValue(
    await mcpClient.callTool({
      name: "kgos_docs",
      arguments: {}
    })
  );
  assert.equal(rootDoc.documents[0].path, "index.md");
  assert.match(rootDoc.documents[0].content, /guides\/ontology\.md/);
  const methodDoc = toolValue(
    await mcpClient.callTool({
      name: "kgos_docs",
      arguments: { paths: ["sdk/evolution/state/create.md", "cypher/index.md"] }
    })
  );
  assert.deepEqual(
    methodDoc.documents.map(({ path }) => path),
    ["sdk/evolution/state/create.md", "cypher/index.md"]
  );
  assert.match(methodDoc.documents[0].content, /StateCreateRequest/);
  assert.match(methodDoc.documents[1].content, /Cypher 25/);
  const sameIndex = toolValue(
    await mcpClient.callTool({ name: "kgos_docs", arguments: { paths: [] } })
  );
  assert.deepEqual(sameIndex, rootDoc);
  const typesIndex = toolValue(
    await mcpClient.callTool({
      name: "kgos_docs",
      arguments: { paths: ["sdk/types/index.md"] }
    })
  ).documents[0].content;
  const first32 = [...typesIndex.matchAll(/`(sdk\/types\/[^`]+\.md)`/g)]
    .map((match) => match[1])
    .slice(0, 32);
  assert.equal(first32.length, 32, "MCP type directory must expose 32 distinct pages");
  const pages32 = toolValue(
    await mcpClient.callTool({ name: "kgos_docs", arguments: { paths: first32 } })
  ).documents;
  assert.deepEqual(
    pages32.map((item) => item.path),
    first32
  );
  assert.ok(pages32.every((page) => typeof page.content === "string" && page.content.length > 20));
  for (const args of [
    { paths: null },
    { paths: "index.md" },
    { path: "index.md" },
    { paths: ["index.md", "index.md"] },
    { paths: ["index.md", "unknown.md"] },
    { paths: ["index.md", "../index.md"] },
    { paths: ["SDK/INDEX.md"] },
    { paths: ["https://example.com/file.md"] },
    { paths: [null] },
    { paths: ["index.md", 17] },
    { paths: Array(33).fill("index.md") },
    { paths: [], unexpected: true }
  ]) {
    const rejected = await mcpClient.callTool({ name: "kgos_docs", arguments: args });
    assert.equal(rejected.isError, true, "Invalid document batch must fail");
    const error = JSON.parse(rejected.content[0].text);
    assert.equal(error.code, "INVALID_ARGUMENT");
    assert.equal(error.documents, undefined, "Partial documents escaped from rejected batch");
  }
  const refused = await mcpClient.callTool({
    name: "kgos_query",
    arguments: {
      code: 'return await evolution.branch.create({name:"forbidden",from:"branch/main"})'
    }
  });
  assert.equal(refused.isError, true, "Help did not preserve the read-only sandbox");
  const preview = toolValue(
    await mcpClient.callTool({ name: "kgos_ontology_overview", arguments: { limit: 100 } })
  );
  assert.match(preview.preview, /main/);
  await verifyMcpSdkMatrix(mcpClient);
  const created = toolValue(
    await mcpClient.callTool({
      name: "kgos_mutate",
      arguments: {
        code: 'const state=(await evolution.overview()).state; return await evolution.branch.create({name:"unified-persist",from:state});'
      }
    })
  );
  assert.equal(created.result.name, "unified-persist");
  // Docker preserves stdout and stderr as separate streams; kgosd startup
  // locators use stdout while structured diagnostics go to stderr.
  const collectedLogs = await runCapture("docker", ["logs", container], { cwd: root });
  const logs = collectedLogs.stdout + collectedLogs.stderr;
  assert.match(logs, /"event":"business.operation.finished"/);
  assert.match(logs, /"event":"mcp.tool.finished"/);
  assert.doesNotMatch(logs, /unified-persist/, "Log leaked an object name");
  assert.doesNotMatch(logs, /"token"/, "Log leaked a credential field");
  await stop();
  await connect(await start());
  const saved = toolValue(
    await mcpClient.callTool({
      name: "kgos_query",
      arguments: { code: "return (await evolution.branch.list()).items.map(x=>x.name)" }
    })
  );
  assert.ok(saved.result.includes("unified-persist"), "Docker volume lost committed data");
  process.stdout.write(
    "Unified Docker: non-root, Node-free, one kgosd, Web/API/MCP, 31/31 SDK, restart passed\n"
  );
} finally {
  await stop().catch(() => undefined);
  if (volumeCreated) await docker("volume", "rm", "-f", volume).catch(() => undefined);
  if (ownsImage) await docker("image", "rm", "-f", image).catch(() => undefined);
}
