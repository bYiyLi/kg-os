import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import { run, runCapture } from "./process.mjs";
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

const sdkTarball = await packPackage(sdkStage);
const runtimeTarball = await packPackage(runtimeStage);
const cliTarball = await packPackage(cliStage);

await verifyTarballContents(
  cliTarball,
  ["package/dist/bin.js", "package/package.json"],
  ["package/kgosd"]
);
await verifyTarballContents(
  runtimeTarball,
  [
    "package/kgosd",
    "package/manifest.json",
    "package/extensions/lithograph",
    "package/extensions/lithograph-openai-compatible"
  ],
  ["package/kg"]
);
await verifyPackedSmoke({ sdkTarball, runtimeTarball, cliTarball });

if (temporary) {
  await rm(workRoot, { force: true, recursive: true });
} else {
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
  const first = Object.values(parsed)[0];
  const filename =
    typeof first === "object" && first !== null && "filename" in first ? first.filename : undefined;
  if (typeof filename !== "string" || filename === "") {
    throw new Error("npm pack did not return a tarball filename");
  }
  return resolve(packDirectory, filename);
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
  await initPackedInstance(rootA);
  await initPackedInstance(rootB);
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

  killPackedDaemon(locatorA.pid);
  await waitForProcessExit(locatorA.pid);
  const restarted = await runKgJSON(rootA, ["evolution", "overview"]);
  const restartedLocator = await readPackedLocator(rootA);
  if (
    restarted.defaultBranch !== "main" ||
    restartedLocator.pid === locatorA.pid ||
    (await readPackedToken(rootA)) !== tokenA
  ) {
    throw new Error("packed daemon restart did not preserve Instance identity");
  }

  killPackedDaemon(restartedLocator.pid);
  killPackedDaemon(locatorB.pid);
}

async function initPackedInstance(instanceRoot) {
  const init = await runKg(instanceRoot, [
    "init",
    "--cache-path",
    "cache/openai-compatible.db",
    "--cache-max-size-mb",
    "4096",
    "--fulltext-analyzer",
    "unicode61",
    "--embedding-base-url",
    "https://example.invalid/v1",
    "--embedding-model",
    "packed-smoke",
    "--embedding-dimensions",
    "3",
    "--embedding-similarity",
    "cosine",
    "--embedding-api-key-env",
    ""
  ]);
  const result = JSON.parse(init.stdout);
  if (result.status !== "initialized" || result.root !== instanceRoot) {
    throw new Error("packed kg init returned an unexpected result");
  }
  const config = await readFile(resolve(instanceRoot, "config.toml"), "utf8");
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

function killPackedDaemon(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
      throw error;
    }
  }
}

async function waitForProcessExit(pid) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return;
      }
      throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  }
  throw new Error("packed kgosd did not exit after SIGTERM");
}
