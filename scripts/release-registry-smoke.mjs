import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { RELEASE_REGISTRY, assertReleaseVersion } from "./release-core.mjs";
import { runCapture, waitForProcessExit } from "./process.mjs";

const version = assertReleaseVersion(requiredOption("--version"));
const workRoot = await mkdtemp(join(tmpdir(), "kgos-registry-smoke-"));
const cacheRoot = resolve(workRoot, "npm-cache");
const instanceRoot = resolve(workRoot, "instance");
const env = {
  ...process.env,
  npm_config_cache: cacheRoot,
  npm_config_registry: RELEASE_REGISTRY,
  npm_config_update_notifier: "false"
};
let daemonPid;
let smokeFailure;

try {
  const versionResult = await runNpx(["--version"]);
  if (versionResult.stdout !== version + "\n") {
    throw new Error("Registry CLI returned the wrong version");
  }

  const doctor = JSON.parse((await runNpx(["--root", instanceRoot, "doctor", "--json"])).stdout);
  if (doctor.ready !== false) {
    throw new Error("Uninitialized registry smoke root unexpectedly reported ready");
  }
  try {
    await access(instanceRoot);
    throw new Error("doctor created the uninitialized Instance root");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
  }

  const initialized = JSON.parse(
    (
      await runNpx([
        "--root",
        instanceRoot,
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
        "registry-smoke",
        "--embedding-dimensions",
        "3",
        "--embedding-similarity",
        "cosine",
        "--embedding-api-key-env",
        ""
      ])
    ).stdout
  );
  if (initialized.status !== "initialized" || initialized.root !== instanceRoot) {
    throw new Error("Registry CLI init returned an unexpected result");
  }

  const overview = await runJson(["--root", instanceRoot, "evolution", "overview"]);
  if (overview.defaultBranch !== "main" || typeof overview.state !== "string") {
    throw new Error("Registry Runtime failed to bootstrap the main State");
  }
  const locator = JSON.parse(await readFile(resolve(instanceRoot, "kgosd.lock"), "utf8"));
  if (Number.isSafeInteger(locator.pid) && locator.pid > 0) {
    daemonPid = locator.pid;
  }
  if (
    daemonPid === undefined ||
    locator.version !== version ||
    typeof locator.endpoint !== "string"
  ) {
    throw new Error("Registry Runtime published an invalid daemon locator");
  }

  const ontology = await runNpx(["--root", instanceRoot, "ontology", "--at", "branch/main"]);
  if (ontology.stdout.trim() === "") {
    throw new Error("Registry Ontology read returned empty output");
  }

  const created = await runJson([
    "--root",
    instanceRoot,
    "graph",
    "execute",
    "--branch",
    "main",
    "--cypher",
    "CREATE (n:Phase09RegistrySmoke {name: 'phase09'}) RETURN elementId(n) AS ref"
  ]);
  const objectRef = created.rows?.[0]?.[0];
  if (typeof objectRef !== "string" || !objectRef.startsWith("n:")) {
    throw new Error("Registry Graph execute did not return a Knowledge Node Ref");
  }

  const queried = await runJson([
    "--root",
    instanceRoot,
    "graph",
    "query",
    "--at",
    "branch/main",
    "--cypher",
    "MATCH (n:Phase09RegistrySmoke) RETURN n.name"
  ]);
  if (queried.rows?.[0]?.[0] !== "phase09") {
    throw new Error("Registry Graph query did not return the written Knowledge value");
  }
} catch (error) {
  smokeFailure = error;
}

try {
  if (daemonPid === undefined) {
    try {
      const locator = JSON.parse(await readFile(resolve(instanceRoot, "kgosd.lock"), "utf8"));
      if (Number.isSafeInteger(locator.pid) && locator.pid > 0) {
        daemonPid = locator.pid;
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
        smokeFailure ??= error;
      }
    }
  }
  if (daemonPid !== undefined) {
    try {
      process.kill(daemonPid, "SIGTERM");
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) {
        throw error;
      }
    }
    await waitForProcessExit(daemonPid, "Registry smoke daemon did not stop");
  }
  await rm(workRoot, { force: true, recursive: true });
} catch (error) {
  smokeFailure ??= error;
}

if (smokeFailure !== undefined) {
  throw smokeFailure;
}

async function runNpx(args) {
  return runCapture("npx", ["--yes", "@kgos/cli@" + version, ...args], {
    cwd: workRoot,
    env
  });
}

async function runJson(args) {
  return JSON.parse((await runNpx(args)).stdout);
}

function requiredOption(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value === "" || value.startsWith("--")) {
    throw new Error(name + " is required");
  }
  return value;
}
