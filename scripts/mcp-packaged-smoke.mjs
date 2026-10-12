import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { runCapture, waitForProcessExit } from "./process.mjs";
import { verifyMcpSdkMatrix } from "./mcp-sdk-matrix.mjs";

const packages = resolve(process.argv[2] ?? "");
const root = await mkdtemp(join(tmpdir(), "kgos-mcp-isolated-"));
const instance = join(root, "workspace");
const repoOut = join(root, "npm-user");
let server;
let mcp;

function toolValue(result) {
  if (
    result.isError === true ||
    !Array.isArray(result.content) ||
    result.content[0]?.type !== "text"
  ) {
    throw new Error("Packed MCP Tool failed: " + JSON.stringify(result).slice(0, 1200));
  }
  return JSON.parse(result.content[0].text);
}

async function runCli(bin, args, env = {}) {
  return await runCapture("node", [bin, ...args], {
    cwd: repoOut,
    env: { ...process.env, ...env }
  });
}

async function stopDaemon() {
  let locator;
  try {
    locator = JSON.parse(await readFile(join(instance, ".kgos", "kgosd.lock"), "utf8"));
  } catch {
    return;
  }
  if (Number.isSafeInteger(locator.pid) && locator.pid > 0) {
    try {
      process.kill(locator.pid, "SIGTERM");
      await waitForProcessExit(locator.pid, "packed MCP daemon did not shut down");
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  }
}

try {
  await mkdir(repoOut, { recursive: true });
  await writeFile(join(repoOut, "package.json"), '{"name":"kgos-mcp-smoke","private":true}\n');
  await runCapture(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(packages, "sdk.tgz"),
      join(packages, "cli.tgz"),
      join(packages, "mcp.tgz")
    ],
    { cwd: repoOut }
  );
  const modules = join(repoOut, "node_modules");
  const kg = join(modules, "@kgos", "cli", "dist", "bin.js");
  const bin = join(modules, "@kgos", "mcp", "dist", "bin.js");
  const runtime = join(modules, "@kgos", "mcp", "dist", "server.js");
  const { KGOSClient } = await import(
    pathToFileURL(join(modules, "@kgos", "sdk", "dist", "index.js")).href
  );
  const { startMCPServer } = await import(pathToFileURL(runtime).href);
  const requireMCP = createRequire(join(modules, "@kgos", "mcp", "package.json"));
  const { Client } = await import(
    pathToFileURL(requireMCP.resolve("@modelcontextprotocol/sdk/client/index.js")).href
  );
  const { StreamableHTTPClientTransport } = await import(
    pathToFileURL(requireMCP.resolve("@modelcontextprotocol/sdk/client/streamableHttp.js")).href
  );
  const version = JSON.parse(
    await readFile(join(repoOut, "node_modules", "@kgos", "mcp", "package.json"), "utf8")
  ).version;
  if ((await runCli(bin, ["--version"])).stdout.trim() !== version)
    throw new Error("Packed MCP version mismatch");
  if (!(await runCli(bin, ["serve", "--help"])).stdout.includes("--token-file")) {
    throw new Error("Packed MCP CLI help is incomplete");
  }
  await runCli(kg, [
    "--root",
    instance,
    "init",
    "--cache-path",
    "cache/openai-compatible.db",
    "--cache-max-size-mb",
    "4096",
    "--embedding-base-url",
    "https://example.invalid/v1",
    "--embedding-model",
    "mcp-packed",
    "--embedding-dimensions",
    "3",
    "--embedding-similarity",
    "cosine",
    "--embedding-api-key-env",
    "",
    "--no-additional-extensions"
  ]);
  const local = JSON.parse(await readFile(join(instance, ".kgos", "kgosd.lock"), "utf8"));
  const auth = JSON.parse(await readFile(join(instance, ".kgos", "auth.json"), "utf8"));
  const sdk = new KGOSClient({ endpoint: local.endpoint, token: auth.token });
  const original = await sdk.evolution.overview();
  if (!original.state.startsWith("commit/")) throw new Error("Packed KG OS State missing");
  const { renderPreview } = await import(
    pathToFileURL(join(modules, "@kgos", "mcp", "dist", "preview.js")).href
  );
  try {
    await renderPreview(sdk);
  } catch (error) {
    throw new Error("Repo-out Preview generation failed", { cause: error });
  }
  const token = "packaged-remote-test-credential-xxxxxxxxxxxxxxxxxx";
  const preflight = await runCli(bin, ["doctor", "--root", instance, "--json"], {
    KGOS_MCP_TOKEN: token
  });
  if (JSON.parse(preflight.stdout).ready !== true)
    throw new Error("Packed MCP doctor was not ready");
  server = await startMCPServer({
    port: 0,
    token,
    getClient: () => Promise.resolve(sdk)
  });
  const port = server.address().port;
  const url = new URL("http://127.0.0.1:" + String(port) + "/mcp");
  if ((await fetch(url)).status !== 401) throw new Error("Unauthenticated MCP request succeeded");
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  mcp = new Client({ name: "packed-mcp-smoke", version: "1.0.0" });
  await mcp.connect(transport);
  const tools = await mcp.listTools();
  if (
    tools.tools
      .map((item) => item.name)
      .sort()
      .join(",") !== "kgos_preview,kgos_read,kgos_run,state_ancestry"
  ) {
    throw new Error("Packed MCP did not expose four expected tools");
  }
  const preview = toolValue(
    await mcp.callTool({
      name: "kgos_preview",
      arguments: { limit: 100 }
    })
  );
  if (preview.totalLines < 1 || !preview.preview.includes("main")) {
    throw new Error("Packed MCP Preview failed");
  }
  const history = toolValue(
    await mcp.callTool({
      name: "state_ancestry",
      arguments: { root: original.state }
    })
  );
  if (history.count < 1) throw new Error("Packed MCP Ancestry failed");
  const created = toolValue(
    await mcp.callTool({
      name: "kgos_run",
      arguments: {
        code: 'const o=await evolution.overview();const b=await evolution.branch.create({name:"mcp-smoke",from:o.state});return b.name;'
      }
    })
  );
  if (created.result !== "mcp-smoke") throw new Error("Packed MCP write failed");
  const read = toolValue(
    await mcp.callTool({
      name: "kgos_read",
      arguments: { code: "return (await evolution.branch.list()).items.map(x=>x.name);" }
    })
  );
  if (!read.result.includes("mcp-smoke")) throw new Error("Packed MCP read-after-write failed");
  await verifyMcpSdkMatrix(mcp);
  process.stdout.write("Repo-out MCP daemon, four Tools, SDK Worker, auth and write/read passed\n");
} finally {
  await mcp?.close().catch(() => undefined);
  if (server !== undefined) {
    await new Promise((done) => server.close(() => done()));
  }
  await stopDaemon();
  await rm(root, { recursive: true, force: true });
}
