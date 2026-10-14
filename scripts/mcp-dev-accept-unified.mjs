import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Host-side, read-only Dev acceptance. The unified kgosd image has NO Node.js
// runtime; this test client executes on the OpenClaw host, never in the image.
// Secrets stay in the protected Dev data tree; never print them or responses.
const base = process.env.KGOS_DEV_ENDPOINT;
const authFile = process.env.KGOS_DEV_AUTH_FILE;
const issuer = process.env.KGOS_DEV_OAUTH_ISSUER;
if (!base || !authFile || !issuer) {
  throw new Error("KG OS Dev acceptance requires endpoint, Instance auth file, and issuer");
}
const instanceToken = JSON.parse(readFileSync(authFile, "utf8")).token;
assert.ok(instanceToken, "Instance credential missing");
// This optional file is used ONLY when verifying a previously deployed Phase
// 16 image during rollback. Phase 17 always uses the Instance credential.
const legacyTokenFile = process.env.KGOS_DEV_LEGACY_MCP_TOKEN_FILE;
const mcpToken = legacyTokenFile
  ? readFileSync(legacyTokenFile, "utf8").replace(/\r?\n$/, "")
  : instanceToken;
assert.ok(mcpToken, "MCP verification credential missing");

const mcpURL = base + "/mcp";
const headers = {
  Authorization: "Bearer " + mcpToken,
  Accept: "application/json, text/event-stream",
  "Content-Type": "application/json",
  "MCP-Protocol-Version": "2025-03-26"
};
let sessionID;
let requestID = 0;
async function rpc(method, params = {}) {
  const response = await fetch(mcpURL, {
    method: "POST",
    headers: sessionID ? { ...headers, "Mcp-Session-Id": sessionID } : headers,
    body: JSON.stringify({ jsonrpc: "2.0", method, params, id: ++requestID }),
    signal: AbortSignal.timeout(30000)
  });
  assert.equal(response.status, 200, "MCP JSON-RPC request failed: " + method);
  sessionID ??= response.headers.get("mcp-session-id") ?? undefined;
  let body;
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const text = await response.text();
    const messages = text
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)));
    body = messages.find((message) => message.id === requestID);
  } else {
    body = await response.json();
  }
  if (body?.error) throw new Error("MCP JSON-RPC error in " + method + ": " + body.error.code);
  assert.ok(body?.result, "MCP response has no result: " + method);
  return body.result;
}
function toolValue(response) {
  assert.notEqual(response?.isError, true, "MCP tool returned error");
  assert.equal(response?.content?.[0]?.type, "text");
  return JSON.parse(response.content[0].text);
}
async function probe(path, expected) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, expected, "unexpected HTTP status: " + path);
  return response;
}

const home = await probe("/", 200);
assert.match(home.headers.get("content-type") ?? "", /text\/html/);
await home.body?.cancel();

const unauthenticated = await probe("/mcp", 401);
assert.match(
  unauthenticated.headers.get("www-authenticate") ?? "",
  /oauth-protected-resource\/mcp/
);
await unauthenticated.body?.cancel();

const protectedResource = await (
  await probe("/.well-known/oauth-protected-resource/mcp", 200)
).json();
assert.equal(protectedResource.resource, issuer);
assert.deepEqual(protectedResource.authorization_servers, [issuer]);
const metadata = await (await probe("/.well-known/oauth-authorization-server", 200)).json();
assert.equal(metadata.issuer, issuer);
assert.equal(metadata.authorization_endpoint, issuer + "/oauth/authorize");
assert.equal(metadata.token_endpoint, issuer + "/oauth/token");
assert.ok(metadata.code_challenge_methods_supported?.includes("S256"));
assert.ok(metadata.token_endpoint_auth_methods_supported?.includes("none"));
assert.equal(metadata.client_id_metadata_document_supported, true);

const api = (credential) =>
  fetch(base + "/api/v1/evolution/overview", {
    method: "POST",
    headers: { Authorization: "Bearer " + credential, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(10000)
  });
const rejected = await api("invalid-instance-bearer");
assert.equal(rejected.status, 401, "Wrong Instance bearer authorized Instance API");
await rejected.body?.cancel();
const permitted = await api(instanceToken);
assert.equal(permitted.status, 200, "Instance bearer cannot access original API");
assert.equal(typeof (await permitted.json()).state, "string");
const wrongMCP = await fetch(mcpURL, {
  headers: { Authorization: "Bearer " + instanceToken },
  signal: AbortSignal.timeout(10000)
});
assert.equal(
  wrongMCP.status,
  legacyTokenFile ? 401 : 405,
  "MCP authentication did not match the verified image's credential model"
);
await wrongMCP.body?.cancel();

const hello = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "kgos-dev-read-only-verifier", version: "1" }
});
assert.equal(hello.serverInfo?.name, "kgos");
const tools = (await rpc("tools/list")).tools;
const businessTools = ["kgos_preview", "kgos_read", "kgos_run", "state_ancestry"];
const names = tools.map((tool) => tool.name).sort();
const withWorkspace = [...businessTools, "kgos_workspace"].sort();
const hasWorkspace = names.includes("kgos_workspace");
if (process.env.KGOS_DEV_REQUIRE_UI === "1") {
  assert.deepEqual(
    names,
    withWorkspace,
    "Phase 18 Dev must expose all four business Tools and the app-only workspace Tool"
  );
} else {
  assert.deepEqual(
    names,
    hasWorkspace ? withWorkspace : businessTools,
    "Unexpected MCP Tool inventory"
  );
}
for (const name of ["kgos_preview", "kgos_read", "state_ancestry"]) {
  assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
}
assert.equal(tools.find((tool) => tool.name === "kgos_run")?.annotations?.readOnlyHint, false);
if (hasWorkspace) {
  const workspaceURI = "ui://kgos/workspace/v1";
  const workspace = tools.find((tool) => tool.name === "kgos_workspace");
  assert.equal(workspace.annotations?.readOnlyHint, true);
  assert.equal(workspace._meta?.ui?.resourceUri, workspaceURI);
  assert.deepEqual(workspace._meta?.ui?.visibility, ["app"]);
  assert.deepEqual(workspace._meta?.["openai/ui"]?.entrypoints, [
    { type: "global" },
    { type: "thread" }
  ]);
  const resources = (await rpc("resources/list")).resources;
  assert.equal(
    resources.find((resource) => resource.uri === workspaceURI)?.mimeType,
    "text/html;profile=mcp-app"
  );
  const result = await rpc("resources/read", { uri: workspaceURI });
  assert.equal(result.contents?.length, 1);
  const contents = result.contents[0];
  assert.equal(contents.uri, workspaceURI);
  assert.equal(contents.mimeType, "text/html;profile=mcp-app");
  assert.match(contents.text, /<script type="module">/);
  assert.match(contents.text, /<style>/);
  assert.doesNotMatch(contents.text, /(?:src|href)="\/assets\//);
  assert.deepEqual(contents._meta?.ui?.csp?.connectDomains, []);
  await (await probe("/mcp-app.html", 404)).body?.cancel();
}

const readTool = async (name, args) =>
  toolValue(await rpc("tools/call", { name, arguments: args }));
const preview = await readTool("kgos_preview", { limit: 100 });
assert.ok(preview.preview?.length > 0 && preview.viewRevision);
const state = (
  await readTool("kgos_read", {
    code: "return (await evolution.overview()).state;"
  })
).result;
assert.ok(typeof state === "string" && state.startsWith("commit/"));
const branches = (
  await readTool("kgos_read", {
    code: "return (await evolution.branch.list()).items.map(x => x.name);"
  })
).result;
assert.ok(Array.isArray(branches) && branches.length > 0);
const ancestry = await readTool("state_ancestry", { root: state });
assert.ok(Number.isInteger(ancestry.count) && ancestry.count > 0);
process.stdout.write(
  "KG OS Dev verified: unified Web/API/MCP, Instance Bearer, OAuth discovery, " +
    (hasWorkspace
      ? "4 business Tools + workspace UI Resource"
      : "4 business Tools (previous image)") +
    ", Preview, State, ancestry (read-only)\n"
);
