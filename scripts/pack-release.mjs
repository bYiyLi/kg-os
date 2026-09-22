import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

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
const packDirectory =
  outputIndex === -1 ? join(workRoot, "release") : resolve(root, process.argv[outputIndex + 1]);
const suffix = process.platform === "win32" ? ".exe" : "";
const binaryNames = ["kgosd" + suffix, "kg" + suffix];

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

async function verifyWorkspaceExternalArtifact() {
  await copyBinaries(smokeDirectory);
  const kg = resolve(smokeDirectory, "kg" + suffix);
  const daemon = resolve(smokeDirectory, "kgosd" + suffix);
  const kgVersion = await runCapture(kg, ["--version"], { cwd: smokeDirectory });
  const daemonVersion = await runCapture(daemon, ["--version"], { cwd: smokeDirectory });
  if (kgVersion.stdout !== version + "\n" || daemonVersion.stdout !== version + "\n") {
    throw new Error("built kg/kgosd returned the wrong version");
  }

  const child = spawn(daemon, ["--phase0-shell", "--host", "127.0.0.1", "--port", "0"], {
    cwd: smokeDirectory,
    env: { ...process.env, KG_HOME: resolve(smokeDirectory, "home") },
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
    const api = await fetch(origin + "/api/status");
    if (api.status !== 404) {
      throw new Error("Phase 00 artifact exposed an unexpected API readiness path");
    }
  } finally {
    await stop(child);
  }
}

async function writeManifest() {
  const files = [];
  for (const name of binaryNames) {
    const bytes = await readFile(resolve(packDirectory, name));
    files.push({ file: name, sha256: sha256(bytes) });
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
  await writeFile(
    resolve(packDirectory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n"
  );
}

try {
  await verifyWorkspaceExternalArtifact();
  if (outputIndex !== -1) {
    await rm(packDirectory, { force: true, recursive: true });
  }
  await copyBinaries(packDirectory);
  await writeManifest();

  if (outputIndex !== -1) {
    await cp(resolve(root, "LICENSE"), resolve(packDirectory, "LICENSE"));
    await cp(
      resolve(root, "COMMERCIAL-LICENSE.md"),
      resolve(packDirectory, "COMMERCIAL-LICENSE.md")
    );
    await cp(resolve(root, "README.md"), resolve(packDirectory, "README.md"));
  }
  process.stdout.write("Native artifact smoke and manifest passed.\n");
} finally {
  await rm(workRoot, { force: true, recursive: true });
}
