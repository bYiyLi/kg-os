import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Host-side, read-only Dev acceptance. The unified kgosd image has NO Node.js
// runtime; this test client executes on the OpenClaw host, never in the image.
// Secrets stay in the protected Dev data tree; never print them or responses.
const base = process.env.KGOS_DEV_ENDPOINT;
const tokenFile = process.env.KGOS_DEV_TOKEN_FILE;
const authFile = process.env.KGOS_DEV_AUTH_FILE;
const issuer = process.env.KGOS_DEV_OAUTH_ISSUER;
if (!base || !tokenFile || !authFile || !issuer) {
  throw new Error("KG OS Dev acceptance requires endpoint, token, auth file, and issuer");
}
const token = readFileSync(tokenFile, "utf8").replace(/\r?\n$/, "");
const instanceToken = JSON.parse(readFileSync(authFile, "utf8")).token;
assert.ok(
  token && instanceToken && token !== instanceToken,
  "MCP and Instance credentials overlap"
);

const mcpURL = base + "/mcp";
const headers = {
  Authorization: "Bearer " + token,
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
const rejected = await api(token);
assert.equal(rejected.status, 401, "MCP bearer authorized Instance API");
await rejected.body?.cancel();
const permitted = await api(instanceToken);
assert.equal(permitted.status, 200, "Instance bearer cannot access original API");
assert.equal(typeof (await permitted.json()).state, "string");
const wrongMCP = await fetch(mcpURL, {
  headers: { Authorization: "Bearer " + instanceToken },
  signal: AbortSignal.timeout(10000)
});
assert.equal(wrongMCP.status, 401, "Instance bearer authorized external MCP");
await wrongMCP.body?.cancel();

const hello = await rpc("initialize", {
  protocolVersion: "2025-03-26",
  capabilities: {},
  clientInfo: { name: "kgos-dev-read-only-verifier", version: "1" }
});
assert.equal(hello.serverInfo?.name, "kgos");
const tools = (await rpc("tools/list")).tools;
assert.deepEqual(tools.map((tool) => tool.name).sort(), [
  "kgos_preview",
  "kgos_read",
  "kgos_run",
  "state_ancestry"
]);
for (const name of ["kgos_preview", "kgos_read", "state_ancestry"]) {
  assert.equal(tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint, true);
}
assert.equal(tools.find((tool) => tool.name === "kgos_run")?.annotations?.readOnlyHint, false);

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
  "KG OS Dev verified: unified Web/API/MCP, separate Bearers, OAuth discovery, 4 Tools, Preview, State, ancestry (read-only)\n"
);
