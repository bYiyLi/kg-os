import { randomBytes } from "node:crypto";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { run, runCapture, waitForProcessExit } from "./process.mjs";
import { currentRuntimeTarget } from "./runtime-package.mjs";

const root = resolve(import.meta.dirname, "..");
const outputIndex = process.argv.indexOf("--output");
const temporary = process.argv.includes("--temporary");

if (!temporary && outputIndex === -1) {
  throw new Error("Use --temporary for validation or --output <directory> for local artifacts");
}
if (temporary && outputIndex !== -1) {
  throw new Error("Use either --temporary or --output, not both");
}
if (outputIndex !== -1 && process.argv[outputIndex + 1] === undefined) {
  throw new Error("--output requires a directory");
}

const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = rootPackage.version;
const target = currentRuntimeTarget();
const workRoot = await mkdtemp(join(tmpdir(), "kgos-npm-pack-"));
const packDirectory =
  outputIndex === -1 ? join(workRoot, "release") : resolve(root, process.argv[outputIndex + 1]);
const stagingRoot = join(workRoot, "staging");
const smokeRoot = join(workRoot, "smoke");

await rm(packDirectory, { force: true, recursive: true });
await mkdir(packDirectory, { recursive: true });
await mkdir(stagingRoot, { recursive: true });

const sdkStage = await stageTypescriptPackage("sdk");
const cliStage = await stageTypescriptPackage("cli");
const runtimeStage = resolve(root, "artifacts", "npm", "runtime-" + target);
await assertRuntimeStage(runtimeStage);

const sdkPackage = await packPackage(sdkStage);
const runtimePackage = await packPackage(runtimeStage);
const cliPackage = await packPackage(cliStage);

await verifyTarballContents(
  sdkPackage.tarball,
  ["package/dist/index.js", "package/package.json"],
  ["package/kgosd", "package/dist/.tsbuildinfo"]
);
await verifyTarballContents(
  cliPackage.tarball,
  ["package/dist/bin.js", "package/package.json"],
  ["package/kgosd", "package/dist/.tsbuildinfo"]
);
await verifyTarballContents(
  runtimePackage.tarball,
  [
    "package/kgosd",
    "package/manifest.json",
    "package/extensions/lithograph",
    "package/extensions/lithograph-openai-compatible",
    "package/extensions/kgos-jieba",
    "package/JIEBA-NOTICE.md",
    "package/licenses/sqlite-simple-tokenizer-MIT.txt",
    "package/licenses/jieba-rs-MIT.txt"
  ],
  ["package/kg"]
);
await verifyPackedSmoke({
  sdkTarball: sdkPackage.tarball,
  runtimeTarball: runtimePackage.tarball,
  cliTarball: cliPackage.tarball
});

if (temporary) {
  await rm(workRoot, { force: true, recursive: true });
} else {
  const revision = (await runCapture("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const dirty =
    (await runCapture("git", ["status", "--porcelain"], { cwd: root })).stdout.trim() !== "";
  const runtimeManifest = JSON.parse(
    await readFile(resolve(runtimeStage, "manifest.json"), "utf8")
  );
  await writeFile(
    resolve(packDirectory, "candidate.json"),
    JSON.stringify(
      {
        schemaVersion: 1,
        revision,
        dirty,
        version,
        target,
        packages: [sdkPackage.metadata, runtimePackage.metadata, cliPackage.metadata],
        runtimeManifest
      },
      null,
      2
    ) + "\n"
  );
  process.stdout.write("Packed KG OS npm candidates: " + packDirectory + "\n");
}

async function stageTypescriptPackage(name) {
  const source = resolve(root, "packages", name);
  const destination = resolve(stagingRoot, name);
  const packageJSON = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
  if (packageJSON.version !== version) {
    throw new Error("Package version does not match root: " + packageJSON.name);
  }
  rewriteWorkspaceVersions(packageJSON.dependencies);
  rewriteWorkspaceVersions(packageJSON.optionalDependencies);
  await mkdir(destination, { recursive: true });
  await cp(resolve(source, "dist"), resolve(destination, "dist"), { recursive: true });
  await rm(resolve(destination, "dist", ".tsbuildinfo"), { force: true });
  await cp(resolve(root, "LICENSE"), resolve(destination, "LICENSE"));
  if (name === "cli") {
    await chmod(resolve(destination, "dist", "bin.js"), 0o755);
  }
  await writeFile(
    resolve(destination, "package.json"),
    JSON.stringify(packageJSON, null, 2) + "\n"
  );
  return destination;
}

function rewriteWorkspaceVersions(dependencies) {
  if (dependencies === undefined) {
    return;
  }
  for (const [name, value] of Object.entries(dependencies)) {
    if (typeof value === "string" && value.startsWith("workspace:")) {
      dependencies[name] = version;
    }
  }
}

async function assertRuntimeStage(runtimeStagePath) {
  const metadata = JSON.parse(await readFile(resolve(runtimeStagePath, "package.json"), "utf8"));
  if (metadata.name !== "@kgos/runtime-" + target || metadata.version !== version) {
    throw new Error("Current Runtime package metadata is missing or stale");
  }
  const manifest = JSON.parse(await readFile(resolve(runtimeStagePath, "manifest.json"), "utf8"));
  if (manifest.version !== version || manifest.platform + "-" + manifest.arch !== target) {
    throw new Error("Current Runtime manifest is missing or stale");
  }
}

async function packPackage(directory) {
  const result = await runCapture(
    "npm",
    ["pack", "--json", "--pack-destination", packDirectory, directory],
    { cwd: root }
  );
  const parsed = JSON.parse(result.stdout);
  const first =
    Array.isArray(parsed) && parsed.length > 0
      ? parsed[0]
      : typeof parsed === "object" && parsed !== null
        ? Object.values(parsed)[0]
        : undefined;
  if (
    typeof first?.name !== "string" ||
    typeof first.version !== "string" ||
    typeof first.filename !== "string" ||
    first.filename === "" ||
    typeof first.integrity !== "string" ||
    !first.integrity.startsWith("sha512-")
  ) {
    throw new Error("npm pack did not return complete package metadata");
  }
  return {
    tarball: resolve(packDirectory, first.filename),
    metadata: {
      name: first.name,
      version: first.version,
      filename: first.filename,
      integrity: first.integrity
    }
  };
}

async function verifyTarballContents(tarball, requiredPrefixes, forbiddenPrefixes) {
  const listing = (await runCapture("tar", ["-tzf", tarball], { cwd: root })).stdout
    .split("\n")
    .filter(Boolean);
  for (const prefix of requiredPrefixes) {
    if (!listing.some((entry) => entry === prefix || entry.startsWith(prefix))) {
      throw new Error(basename(tarball) + " is missing " + prefix);
    }
  }
  for (const prefix of forbiddenPrefixes) {
    if (listing.includes(prefix)) {
      throw new Error(basename(tarball) + " unexpectedly contains " + prefix);
    }
  }
}

async function verifyPackedSmoke({ sdkTarball, runtimeTarball, cliTarball }) {
  await mkdir(smokeRoot, { recursive: true });
  await writeFile(
    resolve(smokeRoot, "package.json"),
    JSON.stringify({ name: "kgos-packed-smoke", private: true }, null, 2) + "\n"
  );
  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      sdkTarball,
      runtimeTarball,
      cliTarball
    ],
    { cwd: smokeRoot }
  );

  const versionResult = await runCapture("npm", ["exec", "--yes", "--", "kg", "--version"], {
    cwd: smokeRoot
  });
  if (versionResult.stdout !== version + "\n") {
    throw new Error("packed kg returned the wrong version");
  }

  const rootA = resolve(smokeRoot, "instance-a");
  const rootB = resolve(smokeRoot, "instance-b");
  const provider = await startPackedProvider();
  process.env.KGOS_PACK_PROVIDER_KEY = provider.secret;
  try {
    await initPackedInstance(rootA, undefined, provider.baseURL, "KGOS_PACK_PROVIDER_KEY");
    await initPackedInstance(rootB, "unicode61");
    await assertStoppedDoctor(rootA);
    await assertStoppedDoctor(rootB);

    const [overviewA1, overviewA2] = await Promise.all([
      runKgJSON(rootA, ["evolution", "overview"]),
      runKgJSON(rootA, ["evolution", "overview"])
    ]);
    if (
      overviewA1.defaultBranch !== "main" ||
      overviewA1.state !== overviewA2.state ||
      typeof overviewA1.state !== "string"
    ) {
      throw new Error("concurrent packed kg startup did not converge on one main State");
    }
    const overviewB = await runKgJSON(rootB, ["evolution", "overview"]);
    if (overviewB.defaultBranch !== "main") {
      throw new Error("second packed Instance failed to bootstrap");
    }

    const locatorA = await readPackedLocator(rootA);
    const locatorB = await readPackedLocator(rootB);
    const tokenA = await readPackedToken(rootA);
    const tokenB = await readPackedToken(rootB);
    if (locatorA.endpoint === locatorB.endpoint || tokenA === tokenB) {
      throw new Error("packed Instances did not isolate endpoint/token");
    }
    await Promise.all([access(resolve(rootA, "kgos.db")), access(resolve(rootB, "kgos.db"))]);

    await writeFile(
      resolve(rootA, "kgosd.lock"),
      JSON.stringify({ ...locatorA, endpoint: locatorB.endpoint }) + "\n"
    );
    await expectPackedFailure(rootA, ["evolution", "overview"], "AUTHENTICATION_FAILED");
    await writeFile(resolve(rootA, "kgosd.lock"), JSON.stringify(locatorA) + "\n");

    await writeFile(
      resolve(rootB, "kgosd.lock"),
      JSON.stringify({ ...locatorB, endpoint: "http://127.0.0.1:1" }) + "\n"
    );
    await expectPackedFailure(
      rootB,
      ["evolution", "overview"],
      "kgosd did not publish a usable endpoint"
    );
    await writeFile(resolve(rootB, "kgosd.lock"), JSON.stringify(locatorB) + "\n");
    if ((await readPackedLocator(rootB)).pid !== locatorB.pid) {
      throw new Error("live lock owner was replaced during unavailable endpoint recovery");
    }

    const ontology = await runKg(rootA, ["ontology", "--at", "branch/main"]);
    if (ontology.stdout.trim() === "") {
      throw new Error("packed Ontology read returned empty output");
    }
    const created = await runKgJSON(rootA, [
      "graph",
      "execute",
      "--branch",
      "main",
      "--cypher",
      "CREATE (n:Phase08Smoke {name: 'phase08'}) RETURN elementId(n) AS ref"
    ]);
    const objectRef = created.rows?.[0]?.[0];
    if (typeof objectRef !== "string" || !objectRef.startsWith("n:")) {
      throw new Error("packed Graph execute did not return a Knowledge Node Ref");
    }
    const objectRead = await runKgJSON(rootA, ["object", "read", objectRef, "--at", "branch/main"]);
    if (objectRead.results?.[0]?.ref !== objectRef) {
      throw new Error("packed Object read did not return the created Knowledge Node");
    }
    const graphRead = await runKgJSON(rootA, [
      "graph",
      "query",
      "--at",
      "branch/main",
      "--cypher",
      "MATCH (n:Phase08Smoke) RETURN n.name"
    ]);
    if (graphRead.rows?.[0]?.[0] !== "phase08") {
      throw new Error("packed Graph query did not return the created Knowledge value");
    }

    await runKgJSON(rootA, [
      "evolution",
      "branch",
      "create",
      "phase08-feature",
      "--from",
      "branch/main"
    ]);
    await runKgJSON(rootA, [
      "evolution",
      "state",
      "create",
      "--branch",
      "phase08-feature",
      "--message",
      "phase08 packed merge"
    ]);
    const merge = await runKgJSON(rootA, [
      "evolution",
      "merge",
      "start",
      "--branch",
      "main",
      "--source",
      "branch/phase08-feature"
    ]);
    if (typeof merge.session !== "string" || !Number.isSafeInteger(merge.revision)) {
      throw new Error("packed Merge start returned invalid session metadata");
    }
    const finalized = await runKgJSON(rootA, [
      "evolution",
      "merge",
      "finalize",
      merge.session,
      "--expected-revision",
      String(merge.revision)
    ]);
    if (typeof finalized.state !== "string") {
      throw new Error("packed Merge finalize did not return a State");
    }
    await runKgJSON(rootA, ["evolution", "branch", "delete", "phase08-feature", "--pretty"]);
    const branchHelp = await runKg(rootA, ["evolution", "branch", "--help"]);
    if (!branchHelp.stdout.includes("create") || !branchHelp.stdout.includes("delete")) {
      throw new Error("packed hierarchical help omitted Branch children");
    }

    killPackedDaemon(locatorA.pid);
    await waitForProcessExit(locatorA.pid, "packed kgosd did not exit after SIGTERM");
    await writeFile(
      resolve(rootA, "kgosd.lock"),
      JSON.stringify({ ...locatorA, pid: process.pid }) + "\n"
    );
    const staleDoctor = await runKgJSON(rootA, ["doctor", "--json"]);
    if (
      staleDoctor.checks?.find((check) => check.id === "daemon")?.details?.state !== "unavailable"
    ) {
      throw new Error("packed doctor did not report stale daemon without recovery");
    }
    const restarts = await Promise.all(
      Array.from({ length: 4 }, () => runKgJSON(rootA, ["evolution", "overview"]))
    );
    const restarted = restarts[0];
    if (restarts.some((item) => item.state !== restarted.state)) {
      throw new Error("concurrent packed stale recovery did not converge on one State");
    }
    const restartedLocator = await readPackedLocator(rootA);
    if (
      restarted.defaultBranch !== "main" ||
      restartedLocator.pid === locatorA.pid ||
      (await readPackedToken(rootA)) !== tokenA
    ) {
      throw new Error("packed daemon restart did not preserve Instance identity");
    }

    const ontologyBody = [
      'name: "Phase10Doc"',
      "properties:",
      '  - name: "content"',
      '    type: "STRING"',
      "    indexes:",
      '      - name: "phase10_doc_text"',
      '        type: "fulltext"',
      '      - name: "phase10_doc_semantic"',
      '        type: "vector"',
      "constraints: []"
    ];
    const ontologyPatch = [
      "diff --git a/new:node-definition:phase10doc b/new:node-definition:phase10doc",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/new:node-definition:phase10doc",
      `@@ -0,0 +1,${ontologyBody.length} @@`,
      ...ontologyBody.map((line) => "+" + line),
      ""
    ].join("\n");
    const patchedOntology = await runKgJSON(rootA, [
      "ontology",
      "patch",
      "--base-state",
      restarted.state,
      "--branch",
      "main",
      "--patch",
      ontologyPatch
    ]);
    if (typeof patchedOntology.state !== "string") {
      throw new Error("packed Ontology Patch did not create a State");
    }
    await runKgJSON(rootA, [
      "graph",
      "execute",
      "--branch",
      "main",
      "--cypher",
      "CREATE (:Phase10Doc {content: '这是知识图。'})"
    ]);
    const chinese = await runKgJSON(rootA, [
      "graph",
      "query",
      "--at",
      "branch/main",
      "--cypher",
      "CALL db.index.fulltext.queryNodes('phase10_doc_text', '知识图', {limit:10}) YIELD node, score RETURN node.content AS content"
    ]);
    if (chinese.rows?.[0]?.[0] !== "这是知识图。") {
      throw new Error("packed official Jieba did not match the Chinese corpus");
    }

    const semantic = await runKgJSON(rootA, [
      "graph",
      "query",
      "--at",
      "branch/main",
      "--cypher",
      "CALL db.index.semantic.queryNodes('phase10_doc_semantic', 'semantic smoke', {limit:10}) " +
        "YIELD node, score RETURN node.content AS content"
    ]);
    if (semantic.rows?.[0]?.[0] !== "这是知识图。" || provider.requests === 0) {
      throw new Error("packed Semantic Provider request did not return the indexed Knowledge");
    }

    killPackedDaemon(locatorB.pid, "SIGKILL");
    await waitForProcessExit(locatorB.pid, "second packed kgosd did not exit after SIGKILL");
    await runKgJSON(rootB, ["evolution", "overview"]);
    const abruptRestart = await readPackedLocator(rootB);
    if (abruptRestart.pid === locatorB.pid) {
      throw new Error("abrupt daemon exit did not recover through the OS lock");
    }

    killPackedDaemon(restartedLocator.pid);
    killPackedDaemon(abruptRestart.pid);
    await Promise.all([
      waitForProcessExit(restartedLocator.pid, "restarted packed kgosd did not exit after SIGTERM"),
      waitForProcessExit(
        abruptRestart.pid,
        "abruptly recovered packed kgosd did not exit after SIGTERM"
      )
    ]);
    await assertNoPackedSecret([rootA, rootB], provider.secret);
  } finally {
    delete process.env.KGOS_PACK_PROVIDER_KEY;
    await cleanupPackedDaemons([rootA, rootB]);
    await provider.close();
  }
}

async function initPackedInstance(
  instanceRoot,
  analyzer,
  baseURL = "https://example.invalid/v1",
  apiKeyEnv = ""
) {
  const args = [
    "init",
    "--cache-path",
    "cache/openai-compatible.db",
    "--cache-max-size-mb",
    "4096",
    "--embedding-base-url",
    baseURL,
    "--embedding-model",
    "packed-smoke",
    "--embedding-dimensions",
    "3",
    "--embedding-similarity",
    "cosine",
    "--embedding-api-key-env",
    apiKeyEnv
  ];
  if (analyzer !== undefined) args.push("--fulltext-analyzer", analyzer);
  const init = await runKg(instanceRoot, args);
  const result = JSON.parse(init.stdout);
  if (result.status !== "initialized" || result.root !== instanceRoot) {
    throw new Error("packed kg init returned an unexpected result");
  }
  const config = await readFile(resolve(instanceRoot, "config.toml"), "utf8");
  if (!config.includes(`analyzer = "${analyzer ?? "jieba"}"`)) {
    throw new Error("packed init did not persist the selected Full-text analyzer");
  }
  if (config.includes("node_modules") || config.includes("runtime-")) {
    throw new Error("Instance config persisted npm Runtime package state");
  }
}

async function assertStoppedDoctor(instanceRoot) {
  const doctor = await runKgJSON(instanceRoot, ["doctor", "--json"]);
  if (doctor.ready !== true) {
    throw new Error("packed kg doctor did not report a ready stopped Instance");
  }
}

async function runKg(instanceRoot, args) {
  return runCapture("npm", ["exec", "--yes", "--", "kg", "--root", instanceRoot, ...args], {
    cwd: smokeRoot
  });
}

async function runKgJSON(instanceRoot, args) {
  return JSON.parse((await runKg(instanceRoot, args)).stdout);
}

async function expectPackedFailure(instanceRoot, args, expectedText) {
  try {
    await runKg(instanceRoot, args);
  } catch (error) {
    if (error instanceof Error && error.message.includes(expectedText)) {
      return;
    }
    throw error;
  }
  throw new Error("packed kg unexpectedly succeeded: " + args.join(" "));
}

async function readPackedLocator(instanceRoot) {
  const locator = JSON.parse(await readFile(resolve(instanceRoot, "kgosd.lock"), "utf8"));
  if (
    !Number.isSafeInteger(locator.pid) ||
    locator.pid <= 0 ||
    typeof locator.endpoint !== "string" ||
    locator.version !== version
  ) {
    throw new Error("packed kgosd did not publish a valid locator");
  }
  return locator;
}

async function readPackedToken(instanceRoot) {
  const credential = JSON.parse(await readFile(resolve(instanceRoot, "auth.json"), "utf8"));
  if (typeof credential.token !== "string" || credential.token === "") {
    throw new Error("packed kgosd did not publish a valid credential");
  }
  return credential.token;
}

async function startPackedProvider() {
  const secret = randomBytes(24).toString("hex");
  let requests = 0;
  const server = createServer(async (request, response) => {
    if (
      request.method !== "POST" ||
      request.url !== "/v1/embeddings" ||
      request.headers.authorization !== `Bearer ${secret}`
    ) {
      response.writeHead(401).end();
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      if (!Array.isArray(body.input) || body.input.some((input) => typeof input !== "string")) {
        response.writeHead(400).end();
        return;
      }
      requests += 1;
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: body.input.map((_, index) => ({ index, embedding: [1, 0, 0] }))
        })
      );
    } catch {
      response.writeHead(400).end();
    }
  });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("packed Provider fixture did not bind a loopback endpoint");
  }
  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    secret,
    get requests() {
      return requests;
    },
    close: () =>
      new Promise((resolveClose, rejectClose) => {
        server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
      })
  };
}

async function assertNoPackedSecret(roots, secret) {
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await scan(path);
      } else if (entry.isFile() && (await readFile(path)).includes(secret)) {
        throw new Error("packed Provider credential leaked into an Instance file: " + path);
      }
    }
  }
  for (const instanceRoot of roots) await scan(instanceRoot);
}

async function cleanupPackedDaemons(roots) {
  for (const instanceRoot of roots) {
    let locator;
    try {
      locator = await readPackedLocator(instanceRoot);
    } catch {
      continue;
    }
    try {
      const processInfo = await runCapture("ps", ["-p", String(locator.pid), "-o", "command="], {
        cwd: smokeRoot
      });
      if (processInfo.stdout.includes("kgosd") && processInfo.stdout.includes(instanceRoot)) {
        killPackedDaemon(locator.pid);
        await waitForProcessExit(locator.pid, "packed kgosd did not exit during smoke cleanup");
      }
    } catch {
      // The process may already have exited before cleanup reaches this root.
    }
  }
}

function killPackedDaemon(pid, signal = "SIGTERM") {
  try {
    process.kill(pid, signal);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}
