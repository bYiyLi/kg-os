// Executed via stdin by Node.js INSIDE the KG OS Dev container.
// Its imports and admin credential never leave that container.
import { readFileSync } from "node:fs";

import { Client } from "/opt/kgos/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "/opt/kgos/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";

const credential = readFileSync("/run/secrets/kgos-mcp-token", "utf8").trim();
const endpoint = new URL("http://127.0.0.1:3777/mcp");
const client = new Client({ name: "kgos-dev-readonly-acceptance", version: "1.0.0" });
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: { headers: { Authorization: "Bearer " + credential } }
});

function unwrap(reply) {
  if (reply.isError || reply.content?.[0]?.type !== "text") {
    throw new Error("KG OS Dev read-only MCP Tool failed");
  }
  return JSON.parse(reply.content[0].text);
}

try {
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  const names = tools.map(({ name }) => name).sort();
  if (names.join(",") !== "kgos_preview,kgos_read,kgos_run,state_ancestry") {
    throw new Error("KG OS Dev discovered unexpected MCP Tools");
  }
  for (const name of ["kgos_preview", "kgos_read", "state_ancestry"]) {
    if (tools.find((tool) => tool.name === name)?.annotations?.readOnlyHint !== true) {
      throw new Error(name + " must be marked read-only");
    }
  }
  if (tools.find(({ name }) => name === "kgos_run")?.annotations?.readOnlyHint !== false) {
    throw new Error("kgos_run must be marked as a write-capable Tool");
  }
  const preview = unwrap(
    await client.callTool({ name: "kgos_preview", arguments: { limit: 100 } })
  );
  if (typeof preview.preview !== "string" || preview.preview.length === 0) {
    throw new Error("KG OS Dev returned an empty Preview");
  }
  const state = unwrap(
    await client.callTool({
      name: "kgos_read",
      arguments: { code: "return (await evolution.overview()).state;" }
    })
  ).result;
  if (typeof state !== "string" || state.length === 0) {
    throw new Error("KG OS Dev has no valid Commit State");
  }
  const branches = unwrap(
    await client.callTool({
      name: "kgos_read",
      arguments: { code: "return (await evolution.branch.list()).items.map(x => x.name);" }
    })
  ).result;
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error("KG OS Dev has no readable Branch");
  }
  const history = unwrap(
    await client.callTool({ name: "state_ancestry", arguments: { root: state } })
  );
  if (!Number.isInteger(history.count) || history.count < 1) {
    throw new Error("KG OS Dev has no readable Commit ancestry");
  }
  process.stdout.write(
    "KG OS Dev acceptance passed: 4 Tools, preview, pinned State and ancestry (read-only)\n"
  );
} finally {
  await client.close();
}
