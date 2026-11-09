import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { runCapture } from "./process.mjs";
import { readMcpToolData, readMcpToolEnvelope } from "./mcp-tool-result.mjs";

// cspell:words CPUPerc fetchall fetchone mountpoint

if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("Phase 37 performance test must run on OpenClaw Linux amd64");
}

const image = process.env.KGOS_PHASE37_PERF_IMAGE;
if (!image) throw new Error("Set KGOS_PHASE37_PERF_IMAGE to the locally built unified image");
const memoryLimit = process.env.KGOS_PHASE37_MEMORY_LIMIT ?? "1g";
const warmupCycles = Number(process.env.KGOS_PHASE37_WARMUP_CYCLES ?? 3);
const serialCycles = Number(process.env.KGOS_PHASE37_SERIAL_CYCLES ?? 20);
const concurrentCycles = Number(process.env.KGOS_PHASE37_CONCURRENT_CYCLES ?? 20);
const concurrentWorkers = Number(process.env.KGOS_PHASE37_CONCURRENT_WORKERS ?? 8);
for (const [name, value, min, max] of [
  ["warmup cycles", warmupCycles, 0, 20],
  ["serial cycles", serialCycles, 1, 100],
  ["concurrent cycles", concurrentCycles, 1, 20],
  ["concurrent workers", concurrentWorkers, 2, 8]
]) {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error("Invalid " + name + ": " + value);
  }
}
if (!/^\d+(?:b|k|m|g|t)?$/i.test(memoryLimit)) {
  throw new Error("KGOS_PHASE37_MEMORY_LIMIT must be a Docker memory quantity");
}

const identifier = randomUUID().slice(0, 12);
const volume = "kgos-phase37-perf-" + identifier;
const container = "kgos-phase37-perf-" + identifier;
const branch = "phase37-perf";
const issuer = "https://kgos-phase37-perf.example.invalid";
const root = process.cwd();
const latencies = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
const memorySamples = [];
const cpuSamples = [];
const memoryStages = [];
const concurrency2Latencies = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
const concurrencyNLatencies = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
let client;
let transport;
let containerCreated = false;
let volumeCreated = false;
let monitoring = true;
let monitorTask;
let testError;

const config = [
  "[server]",
  'public_origin = "' + issuer + '"',
  "",
  "[cache]",
  'path = "cache/openai-compatible.db"',
  "max_size_mb = 16",
  "",
  "[fulltext]",
  'analyzer = "jieba"',
  "",
  "[embedding]",
  'base_url = "https://example.invalid/v1"',
  'model = "phase37-performance"',
  "dimensions = 3",
  'similarity = "cosine"',
  'api_key_env = ""',
  ""
].join("\n");

async function docker(...args) {
  return (await runCapture("docker", args, { cwd: root })).stdout.trim();
}

function addPatch(target, yaml) {
  const lines = yaml.trimEnd().split("\n");
  return [
    "diff --git a/" + target + " b/" + target,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + target,
    "@@ -0,0 +1," + lines.length + " @@",
    ...lines.map((line) => "+" + line),
    ""
  ].join("\n");
}

function replacePatch(ref, before, after) {
  assert.notEqual(before, after);
  const oldLines = before.trimEnd().split("\n");
  const newLines = after.trimEnd().split("\n");
  return [
    "diff --git a/" + ref + " b/" + ref,
    "--- a/" + ref,
    "+++ b/" + ref,
    "@@ -1," + oldLines.length + " +1," + newLines.length + " @@",
    ...oldLines.map((line) => "-" + line),
    ...newLines.map((line) => "+" + line),
    ""
  ].join("\n");
}

function deletePatch(ref, body) {
  const lines = body.trimEnd().split("\n");
  return [
    "diff --git a/" + ref + " b/" + ref,
    "deleted file mode 100644",
    "--- a/" + ref,
    "+++ /dev/null",
    "@@ -1," + lines.length + " +0,0 @@",
    ...lines.map((line) => "-" + line),
    ""
  ].join("\n");
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  return port;
}

async function tool(name, code) {
  assert.ok(client, "MCP client is not connected");
  return readMcpToolData(await client.callTool({ name, arguments: { code } }));
}

async function toolEnvelope(name, code) {
  assert.ok(client, "MCP client is not connected");
  return readMcpToolEnvelope(await client.callTool({ name, arguments: { code } }));
}

async function mutatePatchAtState(targetBranch, baseState, patch, message) {
  const code =
    "return await object.patch({ branch: " +
    JSON.stringify(targetBranch) +
    ", baseState: " +
    JSON.stringify(baseState) +
    ", patch: " +
    JSON.stringify(patch) +
    ", message: " +
    JSON.stringify(message) +
    " });";
  const started = performance.now();
  const envelope = await toolEnvelope("kgos_mutate", code);
  return { envelope, durationMs: performance.now() - started };
}

async function mutatePatch(targetBranch, patch, message) {
  // Resolve the branch head in a separate read request. The mutation trace then
  // measures object.patch itself, matching the direct Kernel regression test.
  const headStarted = performance.now();
  const head = await tool(
    "kgos_query",
    "return await evolution.get({ state: " + JSON.stringify("branch/" + targetBranch) + " });"
  );
  const headReadMs = performance.now() - headStarted;
  const code =
    "return await object.patch({ branch: " +
    JSON.stringify(targetBranch) +
    ", baseState: " +
    JSON.stringify(head.state) +
    ", patch: " +
    JSON.stringify(patch) +
    ", message: " +
    JSON.stringify(message) +
    " });";
  const started = performance.now();
  const result = await tool("kgos_mutate", code);
  return { result, durationMs: performance.now() - started, headReadMs };
}

async function readBody(targetBranch, ref) {
  const code = [
    "const branch = " + JSON.stringify(targetBranch) + ";",
    'const { state } = await evolution.get({ state: "branch/" + branch });',
    "return await object.readText({ at: state, refs: [" + JSON.stringify(ref) + "] });"
  ].join("\n");
  const started = performance.now();
  const result = await tool("kgos_query", code);
  assert.equal(result.results.length, 1, "Expected exactly one canonical Object body for " + ref);
  return { body: result.results[0].body, durationMs: performance.now() - started };
}

function definitionYaml(number) {
  const name = "Bench" + String(number).padStart(3, "0");
  const properties = Array.from(
    { length: 9 },
    (_, index) => '  - name: "p' + index + '"\n    type: "STRING"'
  );
  return 'name: "' + name + '"\nproperties:\n' + properties.join("\n") + "\nconstraints: []\n";
}

async function seedBindings() {
  const overview = await tool("kgos_query", "return await evolution.overview();");
  const created = await tool(
    "kgos_mutate",
    "return await evolution.branch.create({ name: " +
      JSON.stringify(branch) +
      ", from: " +
      JSON.stringify(overview.state) +
      " });"
  );
  assert.equal(created.name, branch);
  const started = performance.now();
  let definitions = 0;
  let domains = 0;
  for (let batch = 0; batch < 5; batch += 1) {
    const patches = [];
    for (let number = batch * 10; number < (batch + 1) * 10; number += 1) {
      const alias = "new:node-definition:bench" + String(number).padStart(3, "0");
      patches.push(addPatch(alias, definitionYaml(number)));
      definitions += 1;
    }
    if (batch === 0) {
      for (let number = 0; number < 5; number += 1) {
        const domain = "PerfDomain" + number;
        const alias = "new:domain:perf-domain-" + number;
        const target = "new:node-definition:bench" + String(number).padStart(3, "0");
        patches.push(addPatch(alias, 'name: "' + domain + '"\nincludes:\n  - "' + target + '"\n'));
        domains += 1;
      }
    }
    const applied = await mutatePatch(
      branch,
      patches.join(""),
      "Seed Phase 37 505-Binding fixture batch " + batch
    );
    assert.match(applied.result.state, /^commit\//);
  }
  assert.equal(domains + definitions + definitions * 9, 505);
  const state = (
    await tool("kgos_query", 'return await evolution.get({ state: "branch/' + branch + '" });')
  ).state;
  const refs = [
    ...Array.from({ length: 5 }, (_, index) => "domain:PerfDomain" + index),
    ...Array.from({ length: 50 }, (_, index) => "node:Bench" + String(index).padStart(3, "0"))
  ];
  const read = await tool(
    "kgos_query",
    "return await object.readText({ at: " +
      JSON.stringify(state) +
      ", refs: " +
      JSON.stringify(refs) +
      " });"
  );
  assert.equal(read.results.length, 55);
  for (const item of read.results) {
    if (item.kind === "node-definition") {
      const propertyCount = item.body
        .split("\n")
        .filter((line) => /^ {2}- name: "p\d+"$/.test(line)).length;
      assert.equal(
        propertyCount,
        9,
        "Definition fixture must contain nine Properties: " + item.ref
      );
    }
  }
  return {
    state,
    domains,
    definitions,
    properties: definitions * 9,
    bindings: 505,
    elapsedMs: performance.now() - started
  };
}

async function addKnowledge(targetBranch, id) {
  const alias = "phase37-perf-" + id;
  const patch = addPatch(
    "new:knowledge-node:" + alias,
    'labels:\n  - "Bench000"\nproperties:\n  "p0": "value-' + id + '"\n'
  );
  const applied = await mutatePatch(targetBranch, patch, "Phase 37 Knowledge Add " + id);
  assert.equal(applied.result.created.length, 1);
  assert.equal(applied.result.created[0].alias, alias);
  assert.match(applied.result.created[0].ref, /^n:/);
  return {
    ref: applied.result.created[0].ref,
    durationMs: applied.durationMs,
    headReadMs: applied.headReadMs
  };
}

async function updateKnowledge(targetBranch, id, ref) {
  const read = await readBody(targetBranch, ref);
  const next = read.body.replace("value-" + id, "updated-" + id);
  assert.notEqual(next, read.body, "Knowledge fixture property must be present before Update");
  const applied = await mutatePatch(
    targetBranch,
    replacePatch(ref, read.body, next),
    "Phase 37 Knowledge Update " + id
  );
  assert.match(applied.result.state, /^commit\//);
  return {
    body: next,
    durationMs: applied.durationMs,
    headReadMs: applied.headReadMs,
    objectReadMs: read.durationMs
  };
}

async function deleteKnowledge(targetBranch, id, ref, body) {
  const applied = await mutatePatch(
    targetBranch,
    deletePatch(ref, body),
    "Phase 37 Knowledge Delete " + id
  );
  assert.match(applied.result.state, /^commit\//);
  return { durationMs: applied.durationMs, headReadMs: applied.headReadMs };
}

async function patchObjectText(targetBranch, ref, transform, message) {
  const read = await readBody(targetBranch, ref);
  const next = transform(read.body);
  assert.notEqual(next, read.body, "Expected the requested Ontology change: " + ref);
  const applied = await mutatePatch(targetBranch, replacePatch(ref, read.body, next), message);
  assert.match(applied.result.state, /^commit\//);
  return {
    durationMs: applied.durationMs,
    headReadMs: applied.headReadMs,
    objectReadMs: read.durationMs
  };
}

async function cycle(targetBranch, id, target) {
  const added = await addKnowledge(targetBranch, id);
  const updated = await updateKnowledge(targetBranch, id, added.ref);
  const deleted = await deleteKnowledge(targetBranch, id, added.ref, updated.body);
  target.add.push(added.durationMs);
  target.update.push(updated.durationMs);
  target.delete.push(deleted.durationMs);
  target.headRead.push(added.headReadMs, updated.headReadMs, deleted.headReadMs);
  target.objectRead.push(updated.objectReadMs);
}

function stats(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const percentile = (ratio) =>
    sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
  return {
    count: sorted.length,
    minMs: Number(sorted[0].toFixed(2)),
    meanMs: Number((sum / sorted.length).toFixed(2)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2))
  };
}

function parseDockerQuantity(value) {
  const match = value.match(/^([0-9.]+)(b|k|m|g|t)?$/i);
  if (!match) throw new Error("Invalid Docker memory quantity: " + value);
  const exponent = { b: 0, k: 1, m: 2, g: 3, t: 4 }[(match[2] ?? "b").toLowerCase()];
  return Number(match[1]) * 1024 ** exponent;
}

function parseBytes(value) {
  const match = value.trim().match(/^([0-9.]+)\s*(B|kB|KB|KiB|MB|MiB|GB|GiB)$/i);
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const factor =
    unit === "b"
      ? 1
      : unit === "kb" || unit === "kib"
        ? 1024
        : unit === "mb" || unit === "mib"
          ? 1024 ** 2
          : 1024 ** 3;
  return Number(match[1]) * factor;
}

async function captureMemoryStage(stage) {
  const current = Number(
    await docker("exec", container, "/bin/cat", "/sys/fs/cgroup/memory.current")
  );
  const statText = await docker("exec", container, "/bin/cat", "/sys/fs/cgroup/memory.stat");
  const stat = Object.fromEntries(
    statText
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.trim().split(/\s+/);
        return [key, Number(value)];
      })
  );
  const eventsText = await docker("exec", container, "/bin/cat", "/sys/fs/cgroup/memory.events");
  const events = Object.fromEntries(
    eventsText
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.trim().split(/\s+/);
        return [key, Number(value)];
      })
  );
  memoryStages.push({
    stage,
    currentBytes: current,
    currentMiB: Number((current / 1024 ** 2).toFixed(2)),
    anonMiB: Number(((stat.anon ?? 0) / 1024 ** 2).toFixed(2)),
    fileMiB: Number(((stat.file ?? 0) / 1024 ** 2).toFixed(2)),
    kernelMiB: Number(((stat.kernel ?? 0) / 1024 ** 2).toFixed(2)),
    oom: events.oom ?? 0,
    oomKill: events.oom_kill ?? 0
  });
}

async function monitorMemory() {
  while (monitoring) {
    const sample = await docker(
      "stats",
      "--no-stream",
      "--format",
      "{{.CPUPerc}}|{{.MemUsage}}",
      container
    ).catch(() => "");
    const [cpu, usage] = sample.split("|");
    const cpuPercent = Number.parseFloat(cpu ?? "");
    if (Number.isFinite(cpuPercent)) cpuSamples.push(cpuPercent);
    const used = usage?.split("/")[0];
    const bytes = used ? parseBytes(used) : null;
    if (bytes !== null) memorySamples.push(bytes);
    await new Promise((resolve) => setTimeout(resolve, 750));
  }
}

async function inspectTraceDatabase(volumeMount, startMs) {
  const database = join(volumeMount, ".kgos", "logs", "observability.sqlite");
  const python = String.raw`
import json, sqlite3, sys
path, start = sys.argv[1], int(sys.argv[2])
connection = sqlite3.connect('file:' + path + '?mode=ro', uri=True, timeout=10)
connection.row_factory = sqlite3.Row
rows = connection.execute("""
SELECT request_id, tool, started_at, duration_ms, outcome, error_code
FROM requests
WHERE surface='mcp' AND tool='kgos_mutate' AND started_at >= ?
ORDER BY started_at
""", (start,)).fetchall()
result = []
for row in rows:
    count = connection.execute("SELECT COUNT(*) FROM spans WHERE request_id=? AND name='lithograph.execute'", (row['request_id'],)).fetchone()[0]
    result.append({"requestId": row['request_id'], "tool": row['tool'], "startedAt": row['started_at'],
                   "durationMs": row['duration_ms'], "outcome": row['outcome'],
                   "errorCode": row['error_code'], "lithographExecutes": count})
print(json.dumps(result))
connection.close()
`;
  const output = await runCapture("python3", ["-c", python, database, String(startMs)], {
    cwd: root
  });
  return JSON.parse(output.stdout);
}

async function initialize(port) {
  await docker("volume", "create", volume);
  volumeCreated = true;
  await docker(
    "run",
    "--rm",
    "--network",
    "host",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    "--entrypoint",
    "/bin/sh",
    image,
    "-ec",
    "mkdir -p -m 700 /workspace/.kgos && cat > /workspace/.kgos/config.toml <<'KGOS_CONFIG'\n" +
      config +
      "KGOS_CONFIG\nstat -c '%a' /workspace/.kgos\n"
  );
  await docker(
    "run",
    "--rm",
    "--network",
    "host",
    "--platform",
    "linux/amd64",
    "-v",
    volume + ":/workspace",
    image,
    "init",
    "--root",
    "/workspace"
  );
  const args = [
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "host",
    "--memory",
    memoryLimit,
    "--memory-swap",
    memoryLimit,
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=10m",
    "--log-opt",
    "max-file=3",
    "-v",
    volume + ":/workspace",
    image,
    "--root",
    "/workspace",
    "--host",
    "127.0.0.1",
    "--port",
    String(port)
  ];
  await docker(...args);
  containerCreated = true;
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const status = await docker("inspect", "--format", "{{.State.Status}}", container).catch(
      () => ""
    );
    if (status === "running") {
      const response = await fetch("http://127.0.0.1:" + port + "/mcp").catch(() => undefined);
      if (response?.status === 401) {
        await response.body?.cancel();
        return "http://127.0.0.1:" + port;
      }
      await response?.body?.cancel();
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("Memory-limited kgosd did not become ready");
}

async function cleanup() {
  await client?.close().catch(() => undefined);
  await transport?.close().catch(() => undefined);
  if (containerCreated) {
    await docker("rm", "-f", container).catch(() => undefined);
    containerCreated = false;
  }
  if (volumeCreated) {
    await docker("volume", "rm", "-f", volume).catch(() => undefined);
    volumeCreated = false;
  }
}

const port = await availablePort();
const report = {
  image,
  memoryLimit,
  memorySwapLimit: memoryLimit,
  swapAllowed: false,
  branch,
  concurrencyModel:
    "The 2/8-worker throughput stages use independent branches in one temporary database; a separate 8-way same-Branch race shares one baseState and verifies strict stale-head rejection.",
  fixture: null,
  warmupCycles,
  serialCycles,
  concurrentCycles,
  concurrentWorkers,
  serial: null,
  concurrency2: null,
  concurrencyN: null,
  sameBranchConcurrency: null,
  memory: null,
  traces: null
};

try {
  const endpoint = await initialize(port);
  const token = JSON.parse(
    await docker("exec", container, "/bin/cat", "/workspace/.kgos/auth.json")
  ).token;
  transport = new StreamableHTTPClientTransport(new URL(endpoint + "/mcp"), {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  client = new Client({ name: "kgos-phase37-performance", version: "1.0.0" });
  await client.connect(transport);
  const toolNames = (await client.listTools()).tools.map((item) => item.name).sort();
  assert.ok(toolNames.includes("kgos_mutate") && toolNames.includes("kgos_query"));

  monitorTask = monitorMemory();
  report.fixture = await seedBindings();
  await captureMemoryStage("after-505-binding-fixture");

  const warmups = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
  for (let index = 0; index < warmupCycles; index += 1) {
    await cycle(branch, "warmup-" + index, warmups);
  }
  await captureMemoryStage("after-warmup");

  const workerBranches = [];
  for (let index = 0; index < concurrentWorkers; index += 1) {
    const name = "phase37-perf-worker-" + index;
    await tool(
      "kgos_mutate",
      "return await evolution.branch.create({ name: " +
        JSON.stringify(name) +
        ", from: " +
        JSON.stringify(report.fixture.state) +
        " });"
    );
    workerBranches.push(name);
  }

  const benchmarkStart = Date.now();
  const ontologyStarted = performance.now();
  const definitionTitle = await patchObjectText(
    branch,
    "node:Bench000",
    (body) => body.replace(/^(name: .+)$/m, '$1\ntitle: "Phase 37 Performance"'),
    "Phase 37 Definition title performance"
  );
  const propertyTitle = await patchObjectText(
    branch,
    "node:Bench000",
    (body) => body.replace(/^ {2}- name: "?p0"?$/m, '$&\n    title: "Phase 37 Property"'),
    "Phase 37 Property title performance"
  );
  const domainMembership = await patchObjectText(
    branch,
    "domain:PerfDomain0",
    (body) => {
      const lines = body.split("\n");
      const index = lines.findIndex((line) => line.includes("Bench000"));
      assert.notEqual(index, -1, "Domain fixture must include Bench000 before membership update");
      lines.splice(index + 1, 0, '  - "node:Bench001"');
      return lines.join("\n");
    },
    "Phase 37 Domain membership performance"
  );
  report.ontology = {
    elapsedMs: Number((performance.now() - ontologyStarted).toFixed(2)),
    definitionTitle,
    propertyTitle,
    domainMembership
  };
  await captureMemoryStage("after-ontology-mutations");
  const serialStartMs = Date.now();
  const serialStarted = performance.now();
  for (let index = 0; index < serialCycles; index += 1) {
    await cycle(branch, "serial-" + index, latencies);
  }
  const serialElapsed = performance.now() - serialStarted;
  report.serial = {
    elapsedMs: Number(serialElapsed.toFixed(2)),
    cycles: serialCycles,
    writes: serialCycles * 3,
    throughputWritesPerSecond: Number(((serialCycles * 3 * 1000) / serialElapsed).toFixed(2)),
    add: stats(latencies.add),
    update: stats(latencies.update),
    delete: stats(latencies.delete),
    branchHeadRead: stats(latencies.headRead),
    objectRead: stats(latencies.objectRead)
  };
  await captureMemoryStage("after-serial-60-writes");

  const concurrency2StartMs = Date.now();
  const twoStarted = performance.now();
  await Promise.all(
    workerBranches.slice(0, 2).map(async (worker, index) => {
      const measured = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
      for (let cycleIndex = 0; cycleIndex < concurrentCycles; cycleIndex += 1) {
        await cycle(worker, "concurrency2-" + index + "-" + cycleIndex, measured);
      }
      for (const operation of ["add", "update", "delete", "headRead", "objectRead"])
        concurrency2Latencies[operation].push(...measured[operation]);
    })
  );
  const twoElapsed = performance.now() - twoStarted;
  report.concurrency2 = {
    workers: 2,
    cyclesPerWorker: concurrentCycles,
    writes: 2 * concurrentCycles * 3,
    elapsedMs: Number(twoElapsed.toFixed(2)),
    throughputWritesPerSecond: Number(((2 * concurrentCycles * 3 * 1000) / twoElapsed).toFixed(2)),
    branchHeadRead: stats(concurrency2Latencies.headRead),
    objectRead: stats(concurrency2Latencies.objectRead)
  };
  await captureMemoryStage("after-concurrency-2");

  const concurrencyNStartMs = Date.now();
  const concurrencyNStarted = performance.now();
  await Promise.all(
    workerBranches.map(async (worker, index) => {
      const measured = { add: [], update: [], delete: [], headRead: [], objectRead: [] };
      for (let cycleIndex = 0; cycleIndex < concurrentCycles; cycleIndex += 1) {
        await cycle(worker, "concurrencyN-" + index + "-" + cycleIndex, measured);
      }
      for (const operation of ["add", "update", "delete", "headRead", "objectRead"])
        concurrencyNLatencies[operation].push(...measured[operation]);
    })
  );
  const concurrencyNElapsed = performance.now() - concurrencyNStarted;
  report.concurrencyN = {
    workers: concurrentWorkers,
    cyclesPerWorker: concurrentCycles,
    writes: concurrentWorkers * concurrentCycles * 3,
    elapsedMs: Number(concurrencyNElapsed.toFixed(2)),
    throughputWritesPerSecond: Number(
      ((concurrentWorkers * concurrentCycles * 3 * 1000) / concurrencyNElapsed).toFixed(2)
    ),
    add: stats(concurrencyNLatencies.add),
    update: stats(concurrencyNLatencies.update),
    delete: stats(concurrencyNLatencies.delete),
    branchHeadRead: stats(concurrencyNLatencies.headRead),
    objectRead: stats(concurrencyNLatencies.objectRead)
  };
  await captureMemoryStage("after-concurrency-" + concurrentWorkers);

  const sameBranchBase = (
    await tool(
      "kgos_query",
      "return await evolution.get({ state: " + JSON.stringify("branch/" + branch) + " });"
    )
  ).state;
  const sameBranchStartMs = Date.now();
  const sameBranchStarted = performance.now();
  const sameBranchAttempts = await Promise.all(
    Array.from({ length: concurrentWorkers }, async (_, worker) => {
      const alias = "phase37-same-branch-" + worker;
      const patch = addPatch(
        "new:knowledge-node:" + alias,
        'labels:\n  - "Bench000"\nproperties:\n  "p0": "same-branch-' + worker + '"\n'
      );
      return {
        worker,
        alias,
        ...(await mutatePatchAtState(
          branch,
          sameBranchBase,
          patch,
          "Phase 37 same-Branch concurrency " + worker
        ))
      };
    })
  );
  const sameBranchElapsed = performance.now() - sameBranchStarted;
  const sameBranchAccepted = sameBranchAttempts.filter((attempt) => attempt.envelope.code === "ok");
  const sameBranchStale = sameBranchAttempts.filter(
    (attempt) => attempt.envelope.code === "STALE_BASE_STATE"
  );
  const unexpectedSameBranch = sameBranchAttempts.filter(
    (attempt) => !["ok", "STALE_BASE_STATE"].includes(attempt.envelope.code)
  );
  assert.equal(
    unexpectedSameBranch.length,
    0,
    "Same-Branch contender returned an unexpected error"
  );
  assert.equal(sameBranchAccepted.length, 1, "Exactly one same-Branch contender must commit");
  assert.equal(
    sameBranchStale.length,
    concurrentWorkers - 1,
    "All losing same-Branch contenders must be rejected as STALE_BASE_STATE"
  );
  const sameBranchWinner = sameBranchAccepted[0];
  assert.equal(sameBranchWinner.envelope.data.created.length, 1);
  assert.equal(sameBranchWinner.envelope.data.created[0].alias, sameBranchWinner.alias);
  const sameBranchHead = (
    await tool(
      "kgos_query",
      "return await evolution.get({ state: " + JSON.stringify("branch/" + branch) + " });"
    )
  ).state;
  assert.equal(
    sameBranchHead,
    sameBranchWinner.envelope.data.state,
    "Branch head must equal the sole winning Commit"
  );
  const sameBranchGraph = await tool(
    "kgos_query",
    "return await graph.query({ at: " +
      JSON.stringify(sameBranchHead) +
      ', cypher: "MATCH (n:Bench000) RETURN count(n) AS count" });'
  );
  assert.equal(
    Number(sameBranchGraph.rows[0]?.[0]),
    1,
    "Same-Branch race must persist exactly one Knowledge node"
  );
  const baseGraph = await tool(
    "kgos_query",
    "return await graph.query({ at: " +
      JSON.stringify(sameBranchBase) +
      ', cypher: "MATCH (n:Bench000) RETURN count(n) AS count" });'
  );
  assert.equal(
    Number(baseGraph.rows[0]?.[0]),
    0,
    "Immutable same-Branch base State must remain unchanged"
  );
  const winnerRead = await tool(
    "kgos_query",
    "return await object.readText({ at: " +
      JSON.stringify(sameBranchHead) +
      ", refs: " +
      JSON.stringify([sameBranchWinner.envelope.data.created[0].ref]) +
      " });"
  );
  assert.equal(
    winnerRead.results.length,
    1,
    "Winning Knowledge must be readable at the new Branch head"
  );
  report.sameBranchConcurrency = {
    branch,
    baseState: sameBranchBase,
    workers: concurrentWorkers,
    accepted: sameBranchAccepted.length,
    staleRejected: sameBranchStale.length,
    elapsedMs: Number(sameBranchElapsed.toFixed(2)),
    attempts: stats(sameBranchAttempts.map((attempt) => attempt.durationMs)),
    acceptedLatencyMs: stats(sameBranchAccepted.map((attempt) => attempt.durationMs)),
    staleLatencyMs: stats(sameBranchStale.map((attempt) => attempt.durationMs)),
    winningAlias: sameBranchWinner.alias,
    winningState: sameBranchHead,
    committedKnowledgeNodes: Number(sameBranchGraph.rows[0][0])
  };
  await captureMemoryStage("after-same-branch-contention");

  const memoryPeakText = await docker("exec", container, "/bin/cat", "/sys/fs/cgroup/memory.peak");
  const memoryEventsText = await docker(
    "exec",
    container,
    "/bin/cat",
    "/sys/fs/cgroup/memory.events"
  );
  const memoryEvents = Object.fromEntries(
    memoryEventsText
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [key, value] = line.trim().split(/\s+/);
        return [key, Number(value)];
      })
  );
  const state = JSON.parse(await docker("inspect", container))[0].State;
  report.memory = {
    limitBytes: parseDockerQuantity(memoryLimit),
    peakBytes: Number(memoryPeakText),
    peakMiB: Number((Number(memoryPeakText) / 1024 ** 2).toFixed(2)),
    sampledPeakBytes: Math.max(0, ...memorySamples),
    sampledPeakMiB: Number((Math.max(0, ...memorySamples) / 1024 ** 2).toFixed(2)),
    sampledCpuPeakPercent: Number(Math.max(0, ...cpuSamples).toFixed(2)),
    sampledCpuMeanPercent:
      cpuSamples.length === 0
        ? 0
        : Number(
            (cpuSamples.reduce((sum, value) => sum + value, 0) / cpuSamples.length).toFixed(2)
          ),
    stages: memoryStages,
    events: memoryEvents,
    oomKilled: state.OOMKilled,
    exitCode: state.ExitCode,
    restartCount: JSON.parse(await docker("inspect", "--format", "{{.RestartCount}}", container))
  };

  monitoring = false;
  await monitorTask;
  await client.close();
  client = undefined;
  await transport.close();
  transport = undefined;
  await docker("stop", "--time", "15", container);
  const mountpoint = JSON.parse(await docker("volume", "inspect", volume))[0].Mountpoint;
  const traceRows = await inspectTraceDatabase(mountpoint, benchmarkStart);
  const ontologyTrace = traceRows.filter((row) => row.startedAt < serialStartMs);
  const serialTrace = traceRows.filter(
    (row) => row.startedAt >= serialStartMs && row.startedAt < concurrency2StartMs
  );
  const concurrency2Trace = traceRows.filter(
    (row) => row.startedAt >= concurrency2StartMs && row.startedAt < concurrencyNStartMs
  );
  const concurrencyNTrace = traceRows.filter(
    (row) => row.startedAt >= concurrencyNStartMs && row.startedAt < sameBranchStartMs
  );
  const sameBranchTrace = traceRows.filter((row) => row.startedAt >= sameBranchStartMs);
  const expected = [17, 19, 20];
  assert.equal(ontologyTrace.length, 3, "Missing Ontology Patch request traces");
  for (const [index, row] of ontologyTrace.entries()) {
    assert.equal(
      row.lithographExecutes,
      27,
      "Unexpected Lithograph execute count for Ontology Patch " + index
    );
  }
  assert.equal(serialTrace.length, serialCycles * 3, "Missing serial Patch request traces");
  for (let index = 0; index < serialTrace.length; index += 1) {
    assert.equal(
      serialTrace[index].lithographExecutes,
      expected[index % 3],
      "Unexpected Lithograph execute count for serial " + ["add", "update", "delete"][index % 3]
    );
  }
  assert.equal(
    concurrency2Trace.length,
    2 * concurrentCycles * 3,
    "Missing two-worker Patch request traces"
  );
  assert.equal(
    concurrencyNTrace.length,
    concurrentWorkers * concurrentCycles * 3,
    "Missing N-worker Patch request traces"
  );
  assert.equal(
    sameBranchTrace.length,
    concurrentWorkers,
    "Missing same-Branch concurrency request traces"
  );
  const countByExec = (rows) =>
    Object.fromEntries(
      [17, 19, 20].map((count) => [
        String(count),
        rows.filter((row) => row.lithographExecutes === count).length
      ])
    );
  const expectedTwoWorkerWrites = 2 * concurrentCycles;
  assert.deepEqual(countByExec(concurrency2Trace), {
    17: expectedTwoWorkerWrites,
    19: expectedTwoWorkerWrites,
    20: expectedTwoWorkerWrites
  });
  const expectedConcurrentWrites = concurrentWorkers * concurrentCycles;
  assert.deepEqual(countByExec(concurrencyNTrace), {
    17: expectedConcurrentWrites,
    19: expectedConcurrentWrites,
    20: expectedConcurrentWrites
  });
  const expectedStaleRows = sameBranchTrace.filter((row) => row.errorCode === "STALE_BASE_STATE");
  assert.equal(
    expectedStaleRows.length,
    concurrentWorkers - 1,
    "Trace must record each losing same-Branch request as STALE_BASE_STATE"
  );
  assert.equal(
    sameBranchTrace.filter((row) => row.outcome === "succeeded" && !row.errorCode).length,
    1,
    "Trace must record exactly one successful same-Branch mutation"
  );
  const expectedStaleRequestIDs = new Set(expectedStaleRows.map((row) => row.requestId));
  const failedRequests = traceRows.filter(
    (row) =>
      (row.outcome !== "succeeded" || row.errorCode) && !expectedStaleRequestIDs.has(row.requestId)
  );
  assert.equal(failedRequests.length, 0, "One or more measured Patch requests failed unexpectedly");
  report.traces = {
    total: traceRows.length,
    failedRequests: failedRequests.length,
    expectedStaleRejections: expectedStaleRows.length,
    ontology: {
      requests: ontologyTrace.length,
      lithographExecutes: ontologyTrace.map((row) => row.lithographExecutes),
      serverDurationMs: stats(ontologyTrace.map((row) => row.durationMs))
    },
    serial: {
      requests: serialTrace.length,
      lithographExecutesByOperation: { add: 17, update: 19, delete: 20 },
      serverDurationMs: {
        add: stats(serialTrace.filter((_, index) => index % 3 === 0).map((row) => row.durationMs)),
        update: stats(
          serialTrace.filter((_, index) => index % 3 === 1).map((row) => row.durationMs)
        ),
        delete: stats(
          serialTrace.filter((_, index) => index % 3 === 2).map((row) => row.durationMs)
        )
      }
    },
    concurrency2: {
      requests: concurrency2Trace.length,
      lithographExecuteCounts: countByExec(concurrency2Trace),
      serverDurationMs: {
        add: stats(
          concurrency2Trace
            .filter((row) => row.lithographExecutes === 17)
            .map((row) => row.durationMs)
        ),
        update: stats(
          concurrency2Trace
            .filter((row) => row.lithographExecutes === 19)
            .map((row) => row.durationMs)
        ),
        delete: stats(
          concurrency2Trace
            .filter((row) => row.lithographExecutes === 20)
            .map((row) => row.durationMs)
        )
      }
    },
    concurrencyN: {
      workers: concurrentWorkers,
      requests: concurrencyNTrace.length,
      lithographExecuteCounts: countByExec(concurrencyNTrace),
      serverDurationMs: {
        add: stats(
          concurrencyNTrace
            .filter((row) => row.lithographExecutes === 17)
            .map((row) => row.durationMs)
        ),
        update: stats(
          concurrencyNTrace
            .filter((row) => row.lithographExecutes === 19)
            .map((row) => row.durationMs)
        ),
        delete: stats(
          concurrencyNTrace
            .filter((row) => row.lithographExecutes === 20)
            .map((row) => row.durationMs)
        )
      }
    },
    sameBranch: {
      requests: sameBranchTrace.length,
      accepted: sameBranchTrace.filter((row) => row.outcome === "succeeded" && !row.errorCode)
        .length,
      staleRejected: expectedStaleRows.length,
      errorCodes: Object.fromEntries(
        [...new Set(sameBranchTrace.map((row) => row.errorCode ?? ""))].map((code) => [
          code || "none",
          sameBranchTrace.filter((row) => (row.errorCode ?? "") === code).length
        ])
      ),
      serverDurationMs: stats(sameBranchTrace.map((row) => row.durationMs))
    }
  };
  assert.equal(report.memory.oomKilled, false, "KG OS container was OOM-killed");
  assert.equal(report.memory.events.oom_kill ?? 0, 0, "Kernel OOM killer terminated a process");
  assert.equal(
    report.memory.events.oom_group_kill ?? 0,
    0,
    "Kernel OOM group killer terminated a process"
  );
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
} catch (error) {
  testError = error;
  process.stderr.write(
    "Phase 37 performance test failed: " +
      (error instanceof Error ? error.stack : String(error)) +
      "\n"
  );
  if (containerCreated) {
    const logs = await docker("logs", "--tail", "80", container).catch(() => "");
    if (logs) process.stderr.write("--- kgosd logs ---\n" + logs + "\n");
    const inspect = await docker("inspect", container).catch(() => "");
    if (inspect) process.stderr.write("--- container state ---\n" + inspect + "\n");
  }
} finally {
  monitoring = false;
  await monitorTask?.catch(() => undefined);
  await cleanup();
}
if (testError) throw testError;
