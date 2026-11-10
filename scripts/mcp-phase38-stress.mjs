import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { performance } from "node:perf_hooks";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { readMcpToolEnvelope } from "./mcp-tool-result.mjs";
import { runCapture } from "./process.mjs";

// cspell:words noobserver
// Linux amd64 only. Every test write is confined to a new disposable volume;
// never connect this script to the long-running Dev or Prod Instance.
if (process.platform !== "linux" || process.arch !== "x64") {
  throw new Error("Phase 38 stress requires Linux amd64");
}
const image = process.env.KGOS_PHASE38_IMAGE;
if (!image) throw new Error("KGOS_PHASE38_IMAGE is required");
const logLevel = process.env.KGOS_PHASE38_LOG_LEVEL ?? "INFO";
if (!["ERROR", "INFO"].includes(logLevel)) throw new Error("Unsupported log level");
const diagnosticMode = process.env.KGOS_PHASE38_DIAGNOSTICS ?? "enabled";
if (!["enabled", "unavailable", "off"].includes(diagnosticMode)) {
  throw new Error("Unsupported diagnostic mode");
}
if (diagnosticMode === "off" && !image.endsWith("-noobserver:local")) {
  throw new Error("Diagnostics-off comparison requires the isolated noobserver test image");
}
const fixture = process.env.KGOS_PHASE38_FIXTURE ?? "person";
if (!["person", "source-claim"].includes(fixture)) {
  throw new Error("Unsupported Phase 38 fixture");
}
const leftLabel = fixture === "source-claim" ? "Source" : "Person";
const rightLabel = fixture === "source-claim" ? "Claim" : "Person";
const relationshipType = fixture === "source-claim" ? "EVIDENCES" : "KNOWS";
const noiseCount = Number(process.env.KGOS_PHASE38_NOISE_NODES ?? 750);
const serialCount = Number(process.env.KGOS_PHASE38_SERIAL ?? 12);
const parallelCount = Number(process.env.KGOS_PHASE38_PARALLEL ?? 4);
const bindingCount = Number(process.env.KGOS_PHASE38_BINDINGS ?? 0);
if (
  ![noiseCount, serialCount, parallelCount].every(Number.isInteger) ||
  ![0, 505].includes(bindingCount) ||
  noiseCount < 0 ||
  noiseCount > 2000 ||
  serialCount < 1 ||
  serialCount > 50 ||
  parallelCount < 1 ||
  parallelCount > 8
) {
  throw new Error("Unbounded stress workload");
}

const id = randomUUID().slice(0, 12);
const volume = "kgos-phase38-" + id;
const container = "kgos-phase38-" + id;
const branch = "phase38-stress";
const issuer = "https://phase38-isolated.example.invalid";
const workspace = "/workspace";
const report = {
  image,
  logLevel,
  diagnosticMode,
  memoryLimit: "1 GiB",
  swapLimit: "0",
  fixture: { shape: fixture, noiseCount, baseNodes: 2, bindings: bindingCount },
  serialCount,
  parallelCount,
  result: "incomplete"
};
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
  'model = "phase38-isolated"',
  "dimensions = 3",
  'similarity = "cosine"',
  'api_key_env = ""',
  ""
].join("\n");

let client;
let transport;
let token;
let port;
let created = false;
let containerCreated = false;
let metricsRunning = false;
let metricsTask;
const sampledCPU = [];
const sampledMemory = [];

async function docker(...args) {
  return (await runCapture("docker", args)).stdout.trim();
}
async function endpointPort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const value = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return value;
}
function addPatch(ref, body) {
  const lines = body.trimEnd().split("\n");
  return [
    "diff --git a/" + ref + " b/" + ref,
    "new file mode 100644",
    "--- /dev/null",
    "+++ b/" + ref,
    "@@ -0,0 +1," + lines.length + " @@",
    ...lines.map((line) => "+" + line),
    ""
  ].join("\n");
}
function addTriple(prefix) {
  const left = "new:knowledge-node:" + prefix + "-left";
  const right = "new:knowledge-node:" + prefix + "-right";
  const edge = "new:knowledge-relationship:" + prefix + "-edge";
  const leftBody = 'labels:\n  - "' + leftLabel + '"\nproperties:\n  "id": "' + prefix + '-left"\n';
  const rightBody =
    'labels:\n  - "' + rightLabel + '"\nproperties:\n  "id": "' + prefix + '-right"\n';
  const relBody =
    'type: "' +
    relationshipType +
    '"\nstart: "' +
    left +
    '"\nend: "' +
    right +
    '"\nproperties:\n  "kind": "synthetic"\n';
  // Deliberately put the relationship first to test request-local alias order.
  return addPatch(edge, relBody) + addPatch(left, leftBody) + addPatch(right, rightBody);
}
function definitionYaml(number) {
  const name = "Bench" + String(number).padStart(3, "0");
  const properties = Array.from(
    { length: 9 },
    (_, index) => '  - name: "p' + index + '"\n    type: "STRING"'
  );
  return 'name: "' + name + '"\nproperties:\n' + properties.join("\n") + "\nconstraints: []\n";
}
function stats(list) {
  const sorted = [...list].sort((a, b) => a - b);
  const value = (p) => Number(sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)].toFixed(2));
  return {
    count: sorted.length,
    p50Ms: value(0.5),
    p95Ms: value(0.95),
    maxMs: Number(sorted.at(-1).toFixed(2))
  };
}
async function call(name, code) {
  const result = await client.callTool({ name, arguments: { code } });
  return readMcpToolEnvelope(result);
}
async function ok(name, code) {
  const result = await call(name, code);
  assert.equal(result.code, "ok", name + " returned " + result.code);
  return result.data;
}
async function head(target = branch) {
  const value = await ok(
    "kgos_query",
    "return await evolution.get({state:" + JSON.stringify("branch/" + target) + "});"
  );
  assert.match(value.state, /^commit\//);
  return value.state;
}
async function graphCount(at, pattern) {
  const value = await ok(
    "kgos_query",
    "return await graph.query({at:" +
      JSON.stringify(at) +
      ",cypher:" +
      JSON.stringify("MATCH " + pattern + " RETURN count(*) AS count") +
      "});"
  );
  const count = Number(value.rows?.[0]?.[0]);
  assert.ok(Number.isInteger(count) && count >= 0, "Graph count is missing");
  return count;
}
async function fixtureNodeCount(at) {
  const left = await graphCount(at, "(n:" + leftLabel + ")");
  return leftLabel === rightLabel ? left : left + (await graphCount(at, "(n:" + rightLabel + ")"));
}
async function patchAt(target, base, body, label) {
  const code =
    "return await object.patch({branch:" +
    JSON.stringify(target) +
    ",baseState:" +
    JSON.stringify(base) +
    ",patch:" +
    JSON.stringify(body) +
    ",message:" +
    JSON.stringify(label) +
    "});";
  const started = performance.now();
  const result = await call("kgos_mutate", code);
  return { result, ms: performance.now() - started };
}
async function makeTriple(target, key) {
  const base = await head(target);
  const { result, ms } = await patchAt(target, base, addTriple(key), "Phase 38 synthetic triple");
  if (result.code !== "ok") {
    throw new Error(
      "Triple creation on " +
        target +
        ": " +
        result.code +
        " (retryable=" +
        String(result.retryable) +
        ")"
    );
  }
  assert.equal(result.data.created.length, 3);
  const refs = result.data.created.map((x) => x.ref);
  assert.equal(refs.filter((x) => x.startsWith("n:")).length, 2);
  assert.equal(refs.filter((x) => x.startsWith("r:")).length, 1);
  assert.notEqual(result.data.state, base);
  return { ...result.data, ms };
}
async function seedBindings(target) {
  const started = performance.now();
  for (let batch = 0; batch < 5; batch++) {
    let patch = "";
    for (let number = batch * 10; number < (batch + 1) * 10; number++) {
      patch += addPatch(
        "new:node-definition:bench" + String(number).padStart(3, "0"),
        definitionYaml(number)
      );
    }
    if (batch === 0) {
      for (let number = 0; number < 5; number++) {
        patch += addPatch(
          "new:domain:perf-domain-" + number,
          'name: "PerfDomain' +
            number +
            '"\nincludes:\n  - "new:node-definition:bench' +
            String(number).padStart(3, "0") +
            '"\n'
        );
      }
    }
    const outcome = await patchAt(
      target,
      await head(target),
      patch,
      "Phase 38 synthetic binding fixture"
    );
    assert.equal(outcome.result.code, "ok", "Binding seed batch " + batch);
  }
  const state = await head(target);
  const refs = [
    ...Array.from({ length: 5 }, (_, i) => "domain:PerfDomain" + i),
    ...Array.from({ length: 50 }, (_, i) => "node:Bench" + String(i).padStart(3, "0"))
  ];
  const read = await ok(
    "kgos_query",
    "return await object.readText({at:" +
      JSON.stringify(state) +
      ",refs:" +
      JSON.stringify(refs) +
      "});"
  );
  assert.equal(read.results.length, 55);
  report.fixture.bindingSeedMs = Number((performance.now() - started).toFixed(2));
  report.fixture.domains = 5;
  report.fixture.definitions = 50;
  report.fixture.properties = 450;
}
async function api(path, body) {
  const response = await fetch("http://127.0.0.1:" + port + path, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200, "diagnostic API " + path + ": " + response.status);
  return response.json();
}
async function connect() {
  transport = new StreamableHTTPClientTransport(new URL("http://127.0.0.1:" + port + "/mcp"), {
    requestInit: { headers: { Authorization: "Bearer " + token } }
  });
  client = new Client({ name: "phase38-stress", version: "1.0.0" });
  await client.connect(transport);
}
async function closeClient() {
  await client?.close().catch(() => undefined);
  await transport?.close().catch(() => undefined);
  client = undefined;
  transport = undefined;
}
async function measure() {
  while (metricsRunning) {
    // cspell:ignore Perc -- Docker's documented CPU percentage template field.
    const line = await docker(
      "stats",
      "--no-stream",
      "--format",
      "{{.CPUPerc}}|{{.MemUsage}}",
      container
    ).catch(() => "");
    const [cpu, mem] = line.split("|");
    const number = Number.parseFloat(cpu ?? "");
    if (Number.isFinite(number)) sampledCPU.push(number);
    const usage = mem
      ?.split("/")[0]
      ?.trim()
      .match(/^([0-9.]+)([KMG]i?B)$/i);
    if (usage) {
      const factor = {
        KB: 1024,
        KIB: 1024,
        MB: 1024 ** 2,
        MIB: 1024 ** 2,
        GB: 1024 ** 3,
        GIB: 1024 ** 3
      }[usage[2].toUpperCase()];
      if (factor) sampledMemory.push(Number(usage[1]) * factor);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}
async function cgroup() {
  const text = await docker(
    "exec",
    container,
    "/bin/sh",
    "-ec",
    "cat /sys/fs/cgroup/memory.max; cat /sys/fs/cgroup/memory.swap.max; " +
      "cat /sys/fs/cgroup/memory.peak; cat /sys/fs/cgroup/memory.events"
  );
  const [max, swap, peak, ...rows] = text.split("\n");
  return {
    memoryMax: Number(max),
    swapMax: Number(swap),
    memoryPeak: Number(peak),
    events: Object.fromEntries(
      rows
        .filter(Boolean)
        .map((line) => line.trim().split(/\s+/))
        .map(([key, value]) => [key, Number(value)])
    )
  };
}
async function diagnosticFileSizes() {
  if (diagnosticMode !== "enabled") return null;
  const result = await docker(
    "exec",
    container,
    "/bin/sh",
    "-ec",
    "for name in observability.sqlite observability.sqlite-wal observability.sqlite-shm; do " +
      "if test -f /workspace/.kgos/logs/$name; then " +
      "stat -c '%n:%s' /workspace/.kgos/logs/$name; fi; done"
  );
  return Object.fromEntries(
    result
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const sep = line.lastIndexOf(":");
        return [line.slice(0, sep).split("/").at(-1), Number(line.slice(sep + 1))];
      })
  );
}
async function initialize() {
  port = await endpointPort();
  await docker("volume", "create", volume);
  created = true;
  await docker(
    "run",
    "--rm",
    "--network",
    "host",
    "-v",
    volume + ":" + workspace,
    "--entrypoint",
    "/bin/sh",
    image,
    "-ec",
    "mkdir -p -m 700 /workspace/.kgos; cat > /workspace/.kgos/config.toml <<'PHASE38'\n" +
      config +
      "PHASE38\n"
  );
  await docker(
    "run",
    "--rm",
    "--network",
    "host",
    "-v",
    volume + ":" + workspace,
    image,
    "init",
    "--root",
    workspace
  );
  if (diagnosticMode === "unavailable") {
    // Isolated disposable volume only. Preserve init logs for investigation,
    // then deliberately make the optional diagnostics directory unusable.
    await docker(
      "run",
      "--rm",
      "--network",
      "host",
      "-u",
      "0",
      "-v",
      volume + ":" + workspace,
      "--entrypoint",
      "/bin/sh",
      image,
      "-ec",
      "mv /workspace/.kgos/logs /workspace/.kgos/logs-test-preserved; " +
        "touch /workspace/.kgos/logs"
    );
  }
  await docker(
    "run",
    "-d",
    "--name",
    container,
    "--network",
    "host",
    "--memory",
    "1g",
    "--memory-swap",
    "1g",
    "--log-driver",
    "json-file",
    "--log-opt",
    "max-size=10m",
    "--log-opt",
    "max-file=2",
    "-e",
    "KGOS_LOG_LEVEL=" + logLevel,
    "-v",
    volume + ":" + workspace,
    image,
    "--root",
    workspace,
    "--host",
    "127.0.0.1",
    "--port",
    String(port)
  );
  containerCreated = true;
  token = JSON.parse(await docker("exec", container, "cat", "/workspace/.kgos/auth.json")).token;
  for (let i = 0; i < 100; i++) {
    const response = await fetch("http://127.0.0.1:" + port + "/mcp").catch(() => undefined);
    if (response?.status === 401) {
      await response.body?.cancel();
      await connect();
      return;
    }
    await response?.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error("Phase 38 container did not start");
}

try {
  await initialize();
  report.cgroupStart = await cgroup();
  assert.equal(report.cgroupStart.memoryMax, 1073741824);
  assert.equal(report.cgroupStart.swapMax, 0);
  metricsRunning = true;
  metricsTask = measure();

  const overview = await ok("kgos_query", "return await evolution.overview();");
  await ok(
    "kgos_mutate",
    "return await evolution.branch.create({name:" +
      JSON.stringify(branch) +
      ",from:" +
      JSON.stringify(overview.state) +
      "});"
  );
  if (bindingCount === 505) await seedBindings(branch);
  report.initial = await makeTriple(branch, "initial");

  // Seed unrelated nodes through public Graph.execute rather than hundreds
  // of administrative Patch calls. This reproduces the graph-size risk.
  const seeded = performance.now();
  for (let rest = noiseCount; rest > 0;) {
    const count = Math.min(250, rest);
    await ok(
      "kgos_mutate",
      "return await graph.execute({branch:" +
        JSON.stringify(branch) +
        ',cypher:"UNWIND range(1, $count) AS i CREATE (n:' +
        leftLabel +
        ' {synthetic:true})",' +
        "params:{count:" +
        count +
        "}});"
    );
    rest -= count;
  }
  report.fixture.seedMs = Number((performance.now() - seeded).toFixed(2));
  const seedHead = await head();
  report.fixture.observedNodes = await fixtureNodeCount(seedHead);
  report.fixture.observedRelationships = await graphCount(
    seedHead,
    "()-[r:" + relationshipType + "]->()"
  );
  assert.equal(
    report.fixture.observedNodes,
    noiseCount + 2,
    "The unrelated-node fixture was not actually committed"
  );
  assert.equal(report.fixture.observedRelationships, 1);
  const serial = [];
  for (let i = 0; i < serialCount; i++) {
    serial.push((await makeTriple(branch, "serial-" + i)).ms);
  }
  report.serial = stats(serial);

  const from = await head();
  assert.equal(await graphCount(from, "()-[r:" + relationshipType + "]->()"), 1 + serialCount);
  const workers = Array.from({ length: parallelCount }, (_, i) => "phase38-worker-" + i);
  for (const name of workers) {
    await ok(
      "kgos_mutate",
      "return await evolution.branch.create({name:" +
        JSON.stringify(name) +
        ",from:" +
        JSON.stringify(from) +
        "});"
    );
  }
  const start = performance.now();
  // Always await every in-flight worker before inspecting a failure, querying
  // the diagnostics, or destroying the isolated container and volume.
  const settled = await Promise.allSettled(
    workers.map(async (name, i) => {
      const timings = [];
      for (let step = 0; step < 4; step++) {
        timings.push((await makeTriple(name, "parallel-" + i + "-" + step)).ms);
      }
      return timings;
    })
  );
  const failures = settled.flatMap((entry, index) =>
    entry.status === "rejected"
      ? [{ worker: workers[index], error: String(entry.reason?.message ?? entry.reason) }]
      : []
  );
  if (failures.length > 0) {
    report.parallelFailures = failures;
    throw new Error(failures.length + " concurrent branch worker(s) failed");
  }
  const concurrent = settled.map((entry) => entry.value);
  report.parallel = {
    ...stats(concurrent.flat()),
    throughputWritesPerSecond: Number(
      ((concurrent.flat().length * 1000) / (performance.now() - start)).toFixed(2)
    )
  };
  const representative = await head(workers[0]);
  assert.equal(await fixtureNodeCount(representative), noiseCount + 2 + serialCount * 2 + 8);
  assert.equal(
    await graphCount(representative, "()-[r:" + relationshipType + "]->()"),
    1 + serialCount + 4
  );

  const current = await head();
  const stale = await patchAt(
    branch,
    report.initial.state,
    addTriple("stale-ref"),
    "Phase38 stale state rejection"
  );
  assert.equal(stale.result.code, "STALE_BASE_STATE");
  assert.equal(await head(), current);
  const invalid = await patchAt(
    branch,
    current,
    addPatch(
      "new:knowledge-relationship:invalid",
      'type: "' + relationshipType + '"\nstart: "n:999999999"\nend: "n:999999998"\n'
    ),
    "Phase38 invalid endpoint"
  );
  assert.notEqual(invalid.result.code, "ok");
  assert.equal(await head(), current);
  report.rollback = {
    staleCode: stale.result.code,
    invalidEndpointCode: invalid.result.code,
    headUnchanged: true
  };

  let item;
  if (diagnosticMode !== "enabled") {
    // For unavailable, the SQLite directory was made unusable; for off, a
    // test-only build never attaches an Observer to the HTTP request context.
    // Both must continue serving valid writes but reveal no trace history.
    const result = await api("/api/v1/system/observability/requests/list", {});
    assert.equal(result.availability, "unavailable");
    report.diagnostics = { availability: "unavailable", businessUnaffected: true };
  } else {
    // All events here are real, persisted SQLite/HTTP observations.
    await new Promise((resolve) => setTimeout(resolve, 400));
    const listing = await api("/api/v1/system/observability/requests/list", {
      limit: 100,
      route: "mcp"
    });
    let detail;
    for (const candidate of listing.items) {
      if (candidate.tool !== "kgos_mutate" || candidate.outcome !== "succeeded") continue;
      const candidateDetail = await api("/api/v1/system/observability/requests/get", {
        request_id: candidate.request_id,
        limit: 100
      });
      if (!candidateDetail.last_stages?.length) continue;
      item = candidate;
      detail = candidateDetail;
      break;
    }
    assert.ok(item && detail, "No persisted successful Object Patch");
    assert.equal(detail.request.tool, "kgos_mutate");
    assert.ok(detail.last_stages?.length, "Last persisted stage missing");
    assert.equal(detail.last_stages[0].stage, "commit");
    const writes = detail.spans.filter((span) => span.name === "lithograph.execute");
    assert.ok(
      writes.some((span) => span.db_call_seq > 0),
      "Database call sequence missing"
    );
    assert.ok(
      writes.some((span) => span.query_family),
      "Safe query family missing"
    );
    assert.doesNotMatch(
      JSON.stringify(detail),
      /synthetic triple|invalid endpoint|stale state rejection/
    );
    report.diagnostics = {
      tool: detail.request.tool,
      stageCount: detail.last_stages.length,
      lastStage: detail.last_stages[0].stage,
      executeSpans: writes.length,
      coverage: detail.coverage
    };
  }

  const beforeRestart = await head();
  report.cgroupEnd = await cgroup();
  report.diagnosticFiles = await diagnosticFileSizes();
  report.cpuSampleMax = sampledCPU.length ? Math.max(...sampledCPU) : null;
  report.memSampleMaxBytes = sampledMemory.length ? Math.max(...sampledMemory) : null;
  const logOutput = await runCapture("docker", ["logs", container]);
  const logs = logOutput.stdout + logOutput.stderr;
  report.stderrBytes = Buffer.byteLength(logs);
  assert.doesNotMatch(logs, /synthetic triple|invalid endpoint|stale state rejection/);
  assert.equal(report.cgroupEnd.events.oom_kill, 0, "Cgroup OOM kill occurred");
  await closeClient();
  await docker("kill", "--signal=KILL", container);
  await docker("start", container);
  for (let i = 0; i < 100; i++) {
    const response = await fetch("http://127.0.0.1:" + port + "/mcp").catch(() => undefined);
    if (response?.status === 401) {
      await response.body?.cancel();
      break;
    }
    await response?.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  await connect();
  assert.equal(await head(), beforeRestart);
  if (diagnosticMode === "enabled") {
    const retained = await api("/api/v1/system/observability/requests/get", {
      request_id: item.request_id
    });
    assert.equal(retained.request.tool, "kgos_mutate");
    assert.ok(retained.last_stages?.length);
  } else {
    const unavailable = await api("/api/v1/system/observability/requests/list", {});
    assert.equal(unavailable.availability, "unavailable");
  }
  report.restart = {
    deliberatelySIGKILLed: true,
    headUnchanged: true,
    diagnosticRetained: diagnosticMode === "enabled"
  };
  report.result = "passed";
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (containerCreated) {
    // Retain only the sanitized, authenticated diagnostic summary in the
    // report. The temporary database and runtime are still cleaned below.
    try {
      report.failureCgroup = await cgroup();
      if (diagnosticMode === "enabled") {
        const listing = await api("/api/v1/system/observability/requests/list", {
          route: "mcp",
          limit: 100
        });
        const abnormal = listing.items
          .filter((item) => item.outcome !== "succeeded")
          .slice(0, 24)
          .map((item) => ({
            requestID: item.request_id,
            tool: item.tool,
            outcome: item.outcome,
            errorCode: item.error_code
          }));
        report.failureDiagnostics = {
          availability: listing.availability,
          coverage: listing.coverage,
          abnormal
        };
        // The failure path needs the safe *real* execution stage/sequence,
        // not user Patch/Cypher/JS bodies or raw database error messages.
        report.failureDiagnostics.details = [];
        for (const request of abnormal.slice(0, 8)) {
          try {
            const detail = await api("/api/v1/system/observability/requests/get", {
              request_id: request.requestID,
              limit: 50
            });
            report.failureDiagnostics.details.push({
              requestID: request.requestID,
              lastStages: (detail.last_stages ?? []).slice(0, 8).map((stage) => ({
                operationID: stage.operation_id,
                stage: stage.stage
              })),
              spans: (detail.spans ?? [])
                .filter((span) => span.name?.startsWith("lithograph."))
                .slice(0, 12)
                .map((span) => ({
                  name: span.name,
                  queryFamily: span.query_family,
                  dbCallSeq: span.db_call_seq,
                  outcome: span.outcome
                }))
            });
          } catch {
            report.failureDiagnostics.details.push({
              requestID: request.requestID,
              detailAvailability: "unavailable"
            });
          }
        }
      }
    } catch (diagnosticError) {
      report.failureInspectionError = String(diagnosticError?.message ?? diagnosticError);
    }
  }
  console.error(JSON.stringify(report));
  process.exitCode = 1;
} finally {
  metricsRunning = false;
  await metricsTask?.catch(() => undefined);
  await closeClient();
  if (containerCreated) await docker("rm", "-f", container).catch(() => undefined);
  if (created) await docker("volume", "rm", "-f", volume).catch(() => undefined);
}
