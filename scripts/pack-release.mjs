import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";
import { runCapture } from "./process.mjs";

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
const workRoot = await mkdtemp(join(tmpdir(), "kgos-pack-"));
const smokeDirectory = join(workRoot, "workspace-external-smoke");
const smokeCwd = join(workRoot, "outside-distribution");
const packDirectory =
  outputIndex === -1 ? join(workRoot, "release") : resolve(root, process.argv[outputIndex + 1]);
const suffix = process.platform === "win32" ? ".exe" : "";
const binaryNames = ["kgosd" + suffix, "kg" + suffix];
const lithographArtifact = currentLithographArtifact(root);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function copyBinaries(destination) {
  await mkdir(destination, { recursive: true });
  for (const name of binaryNames) {
    const source = resolve(root, "artifacts/build", name);
    const target = resolve(destination, name);
    await cp(source, target);
    if (process.platform !== "win32") {
      await chmod(target, 0o755);
    }
  }
}

async function copyExtensions(destination) {
  const extensions = resolve(destination, "extensions");
  await mkdir(extensions, { recursive: true });
  await cp(
    resolve(lithographArtifact.cacheDirectory, lithographArtifact.library),
    resolve(extensions, lithographArtifact.library)
  );
  await cp(
    resolve(lithographArtifact.cacheDirectory, lithographArtifact.providerLibrary),
    resolve(extensions, lithographArtifact.providerLibrary)
  );
}

async function copyDistribution(destination) {
  await copyBinaries(destination);
  await copyExtensions(destination);
}

function manifestFile(destination, path) {
  return relative(destination, path).split(sep).join("/");
}

async function waitForOrigin(child) {
  return await new Promise((resolveOrigin, rejectOrigin) => {
    let output = "";
    const timer = setTimeout(
      () => rejectOrigin(new Error("kgosd smoke did not become ready")),
      10000
    );
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match !== null) {
        clearTimeout(timer);
        resolveOrigin(match[0]);
      }
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      rejectOrigin(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      rejectOrigin(
        new Error(
          "kgosd smoke exited before readiness: code=" + String(code) + " signal=" + String(signal)
        )
      );
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolveExit) => child.once("exit", resolveExit));
}

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("failed to allocate a loopback port for kgosd smoke");
  }
  const port = address.port;
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error === undefined ? resolveClose() : rejectClose(error)));
  });
  return port;
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function verifyWorkspaceExternalArtifact() {
  await mkdir(smokeCwd, { recursive: true });
  await copyDistribution(smokeDirectory);
  await writeManifest(smokeDirectory);
  const kg = resolve(smokeDirectory, "kg" + suffix);
  const daemon = resolve(smokeDirectory, "kgosd" + suffix);
  const kgVersion = await runCapture(kg, ["--version"], { cwd: smokeCwd });
  const daemonVersion = await runCapture(daemon, ["--version"], { cwd: smokeCwd });
  if (kgVersion.stdout !== version + "\n" || daemonVersion.stdout !== version + "\n") {
    throw new Error("built kg/kgosd returned the wrong version");
  }

  const home = resolve(workRoot, "home");
  const freshDoctor = JSON.parse(
    (
      await runCapture(kg, ["doctor", "--json"], {
        cwd: smokeCwd,
        env: { ...process.env, KG_HOME: home }
      })
    ).stdout
  );
  if (freshDoctor.ready !== false || (await pathExists(home))) {
    throw new Error("packaged fresh doctor was not side-effect-free");
  }
  const port = await freeLoopbackPort();
  const installed = JSON.parse(
    (
      await runCapture(
        kg,
        [
          "install",
          "--server-host",
          "127.0.0.1",
          "--server-port",
          String(port),
          "--cache-path",
          "cache/openai-compatible.db",
          "--cache-max-size-mb",
          "4096",
          "--fulltext-analyzer",
          "unicode61",
          "--embedding-base-url",
          "https://example.invalid/v1",
          "--embedding-model",
          "phase03-package-smoke",
          "--embedding-dimensions",
          "3",
          "--embedding-similarity",
          "cosine",
          "--embedding-api-key-env",
          ""
        ],
        { cwd: smokeCwd, env: { ...process.env, KG_HOME: home } }
      )
    ).stdout
  );
  if (installed.status !== "installed" || installed.home !== home) {
    throw new Error("packaged fully parameterized install returned an unexpected result");
  }
  const doctor = JSON.parse(
    (
      await runCapture(kg, ["doctor", "--json"], {
        cwd: smokeCwd,
        env: { ...process.env, KG_HOME: home }
      })
    ).stdout
  );
  const runtimeCheck = doctor.checks.find((check) => check.id === "runtime");
  if (
    doctor.ready !== true ||
    runtimeCheck?.status !== "info" ||
    runtimeCheck?.blocking !== false ||
    runtimeCheck?.details?.state !== "stopped"
  ) {
    throw new Error("packaged doctor did not report installed/stopped as ready");
  }
  const child = spawn(daemon, [], {
    cwd: smokeCwd,
    env: { ...process.env, KG_HOME: home },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const origin = await waitForOrigin(child);
    const response = await fetch(origin);
    const body = await response.text();
    if (response.status !== 200 || !body.includes("<title>KG OS</title>")) {
      throw new Error("workspace-external embedded Web smoke failed");
    }
    const script = body.match(/<script[^>]+src="([^"]+)"/);
    if (script === null) {
      throw new Error("workspace-external Web shell is missing its bundled script");
    }
    const asset = await fetch(origin + script[1]);
    if (asset.status !== 200 || (await asset.text()).length === 0) {
      throw new Error("workspace-external Web asset smoke failed");
    }
  } finally {
    await stop(child);
  }
}

async function writeManifest(destination) {
  const files = [];
  const artifactPaths = [
    ...binaryNames.map((name) => resolve(destination, name)),
    resolve(destination, "extensions", lithographArtifact.library),
    resolve(destination, "extensions", lithographArtifact.providerLibrary)
  ];
  for (const path of artifactPaths) {
    const bytes = await readFile(path);
    files.push({ file: manifestFile(destination, path), sha256: sha256(bytes) });
  }
  const goVersion = (
    await runCapture("go", ["version"], {
      cwd: root,
      env: { ...process.env, GOTOOLCHAIN: "go1.27.1" }
    })
  ).stdout.trim();
  const manifest = {
    arch: process.arch,
    files,
    go: goVersion,
    platform: process.platform,
    version
  };
  await writeFile(resolve(destination, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
}

try {
  await runCapture("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });
  await verifyWorkspaceExternalArtifact();
  if (outputIndex !== -1) {
    await rm(packDirectory, { force: true, recursive: true });
  }
  await copyDistribution(packDirectory);
  await writeManifest(packDirectory);

  if (outputIndex !== -1) {
    await cp(resolve(root, "LICENSE"), resolve(packDirectory, "LICENSE"));
    await cp(
      resolve(root, "COMMERCIAL-LICENSE.md"),
      resolve(packDirectory, "COMMERCIAL-LICENSE.md")
    );
    await cp(resolve(root, "README.md"), resolve(packDirectory, "README.md"));
  }
  process.stdout.write("Native artifact, installer, doctor, and manifest smoke passed.\n");
} finally {
  await rm(workRoot, { force: true, recursive: true });
}
