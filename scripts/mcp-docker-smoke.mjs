import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

import { runCapture } from "./process.mjs";
import { verifyMcpSdkMatrix } from "./mcp-sdk-matrix.mjs";

const root = new URL("../", import.meta.url).pathname;
const suffix = randomUUID().slice(0, 12);
const suppliedImage = process.env.KGOS_MCP_DOCKER_SMOKE_IMAGE;
if (suppliedImage !== undefined && suppliedImage.trim() === "") {
  throw new Error("KGOS_MCP_DOCKER_SMOKE_IMAGE must not be empty");
}
const ownImage = suppliedImage === undefined;
const image = suppliedImage ?? "kgos-mcp-smoke-" + suffix;
const volume = "kgos-mcp-test-" + suffix;
const token = "docker-mcp-integration-secret-xxxxxxxxxxxxxxxx";
const requireMCP = createRequire(new URL("../packages/mcp/package.json", import.meta.url));
const { Client } = await import(requireMCP.resolve("@modelcontextprotocol/sdk/client/index.js"));
const { StreamableHTTPClientTransport } = await import(
  requireMCP.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js")
);
let container;
let client;

function toolValue(result) {
  if (
    result.isError === true ||
    !Array.isArray(result.content) ||
    result.content[0]?.type !== "text"
  ) {
    throw new Error("Docker MCP tool failed: " + JSON.stringify(result).slice(0, 800));
  }
  return JSON.parse(result.content[0].text);
}

async function docker(args) {
  return (await runCapture("docker", args, { cwd: root })).stdout.trim();
}

async function startContainer() {
  container = await docker([
    "run",
    "--platform",
    "linux/amd64",
    "-d",
    "--rm",
    "-p",
    "127.0.0.1::3777",
    "-v",
    volume + ":/workspace",
    "-e",
    "KGOS_MCP_TOKEN=" + token,
    image,
    "serve"
  ]);
  const binding = await docker(["port", container, "3777/tcp"]);
  const port = binding.split("\n")[0]?.match(/:(\d+)$/)?.[1];
  if (port === undefined) throw new Error("Docker did not publish a reachable MCP port");
  const endpoint = new URL("http://127.0.0.1:" + port + "/mcp");
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(endpoint)).status === 401) return endpoint;
    } catch {
      // Startup may still be initializing the internal daemon.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Docker MCP listener did not become ready");
}

async function connect(endpoint) {
  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  client = new Client({ name: "docker-smoke", version: "1.0.0" });
  await client.connect(transport);
  const listing = await client.listTools();
  if (
    listing.tools
      .map((tool) => tool.name)
      .sort()
      .join(",") !== "kgos_preview,kgos_read,kgos_run,state_ancestry"
  ) {
    throw new Error("Docker MCP tools mismatch");
  }
}

async function stopContainer() {
  await client?.close().catch(() => undefined);
  client = undefined;
  if (container !== undefined) {
    await docker(["stop", "--time", "15", container]);
    container = undefined;
  }
}

try {
  if (ownImage) {
    const baseImage = process.env.KGOS_MCP_DOCKER_BASE_IMAGE;
    const buildArgs = ["build", "--platform", "linux/amd64", "-f", "Dockerfile.mcp", "-t", image];
    if (baseImage) buildArgs.push("--build-arg", "NODE_IMAGE=" + baseImage);
    for (const proxy of ["HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"]) {
      if (process.env[proxy]) buildArgs.push("--build-arg", proxy);
    }
    buildArgs.push(".");
    await docker(buildArgs);
  }
  if (
    (await docker(["image", "inspect", "--format", "{{.Os}}/{{.Architecture}}", image])) !==
    "linux/amd64"
  ) {
    throw new Error("Docker MCP smoke requires a Linux amd64 image");
  }
  await docker(["volume", "create", volume]);
  await docker([
    "run",
    "--rm",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    image,
    "init",
    "--cache-path",
    "cache/openai-compatible.db",
    "--cache-max-size-mb",
    "4096",
    "--embedding-base-url",
    "https://example.invalid/v1",
    "--embedding-model",
    "mcp-docker",
    "--embedding-dimensions",
    "3",
    "--embedding-similarity",
    "cosine",
    "--embedding-api-key-env",
    "",
    "--no-additional-extensions"
  ]);
  await connect(await startContainer());
  const preview = toolValue(
    await client.callTool({ name: "kgos_preview", arguments: { limit: 100 } })
  );
  if (!preview.preview.includes("main")) throw new Error("Docker MCP Preview failed");
  const state = toolValue(
    await client.callTool({
      name: "kgos_read",
      arguments: { code: "return (await evolution.overview()).state" }
    })
  );
  const ancestry = toolValue(
    await client.callTool({
      name: "state_ancestry",
      arguments: { root: state.result }
    })
  );
  if (ancestry.count < 1) throw new Error("Docker MCP Ancestry failed");
  await verifyMcpSdkMatrix(client);
  toolValue(
    await client.callTool({
      name: "kgos_run",
      arguments: {
        code: 'const v=await evolution.overview();return await evolution.branch.create({name:"docker-smoke",from:v.state});'
      }
    })
  );
  await stopContainer();
  await connect(await startContainer());
  const branches = toolValue(
    await client.callTool({
      name: "kgos_read",
      arguments: { code: "return (await evolution.branch.list()).items.map(x=>x.name)" }
    })
  );
  if (!branches.result.includes("docker-smoke"))
    throw new Error("Docker volume did not survive restart");
  process.stdout.write("Docker MCP non-root Image / isolated KG OS / restart smoke passed\n");
} finally {
  await stopContainer().catch(() => undefined);
  await docker(["volume", "rm", "-f", volume]).catch(() => undefined);
  if (ownImage) await docker(["image", "rm", "-f", image]).catch(() => undefined);
}
