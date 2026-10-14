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
  const names = (await mcpClient.listTools()).tools.map((tool) => tool.name).sort();
  assert.deepEqual(names, ["kgos_preview", "kgos_read", "kgos_run", "state_ancestry"]);
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
  await rejected.body?.cancel();
  const authorized = await request(token);
  assert.equal(authorized.status, 200, "Instance credential must still authorize the API");
  assert.equal(typeof (await authorized.json()).state, "string");
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
  const preview = toolValue(
    await mcpClient.callTool({ name: "kgos_preview", arguments: { limit: 100 } })
  );
  assert.match(preview.preview, /main/);
  await verifyMcpSdkMatrix(mcpClient);
  const created = toolValue(
    await mcpClient.callTool({
      name: "kgos_run",
      arguments: {
        code: 'const state=(await evolution.overview()).state; return await evolution.branch.create({name:"unified-persist",from:state});'
      }
    })
  );
  assert.equal(created.result.name, "unified-persist");
  await stop();
  await connect(await start());
  const saved = toolValue(
    await mcpClient.callTool({
      name: "kgos_read",
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
