import { createHash } from "node:crypto";
import { cp, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const packageDirectories = ["contracts", "kernel", "daemon", "sdk", "cli"];
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

const workRoot = await mkdtemp(join(tmpdir(), "kgos-pack-"));
const packDirectory =
  outputIndex === -1 ? join(workRoot, "packages") : resolve(root, process.argv[outputIndex + 1]);
const installDirectory = join(workRoot, "install");
const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const version = rootPackage.version;

function npmEnvironment() {
  return Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.toLowerCase().startsWith("npm_config_"))
  );
}

async function verifyInstalledPackages() {
  const cliBin = join(installDirectory, "node_modules", "@kgos", "cli", "dist", "bin.js");
  const daemonBin = join(installDirectory, "node_modules", "@kgos", "daemon", "dist", "bin.js");
  const cliVersion = await runCapture(process.execPath, [cliBin, "--version"]);
  const daemonVersion = await runCapture(process.execPath, [daemonBin, "--version"]);
  if (cliVersion.stdout !== `${version}\n` || daemonVersion.stdout !== `${version}\n`) {
    throw new Error("Installed CLI or daemon returned the wrong version");
  }

  for (const directory of packageDirectories) {
    const installedPackage = await readFile(
      join(installDirectory, "node_modules", "@kgos", directory, "package.json"),
      "utf8"
    );
    if (installedPackage.includes("workspace:")) {
      throw new Error(`Installed @kgos/${directory} still contains a workspace dependency`);
    }
  }

  const smokeScript = join(workRoot, "installed-web-smoke.mjs");
  await writeFile(
    smokeScript,
    `import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const installRoot = process.argv[2];
const moduleUrl = pathToFileURL(resolve(installRoot, "node_modules/@kgos/daemon/dist/index.js"));
const { startStaticShellServer } = await import(moduleUrl.href);
const webRoot = resolve(installRoot, "node_modules/@kgos/daemon/dist/web");
const running = await startStaticShellServer({ webRoot });
try {
  const response = await fetch(running.origin);
  const body = await response.text();
  if (response.status !== 200 || !body.includes("KG OS")) throw new Error("installed Web shell failed");
} finally {
  await running.close();
}
`
  );
  await run(process.execPath, [smokeScript, installDirectory]);
}

async function writeManifest(tarballs) {
  const entries = [];
  for (const tarball of tarballs) {
    const bytes = await readFile(join(packDirectory, tarball));
    entries.push({
      file: tarball,
      sha256: createHash("sha256").update(bytes).digest("hex")
    });
  }
  await writeFile(
    join(packDirectory, "SHA256SUMS.json"),
    `${JSON.stringify({ packages: entries, version }, null, 2)}\n`
  );
}

try {
  if (outputIndex !== -1) {
    await rm(packDirectory, { force: true, recursive: true });
  }
  await mkdir(packDirectory, { recursive: true });
  await mkdir(installDirectory, { recursive: true });

  for (const directory of packageDirectories) {
    await run("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: resolve(root, "packages", directory)
    });
  }

  const tarballs = (await readdir(packDirectory)).filter((file) => file.endsWith(".tgz")).sort();
  if (tarballs.length !== packageDirectories.length) {
    throw new Error(
      `Expected ${packageDirectories.length} package tarballs, found ${tarballs.length}`
    );
  }

  await run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      ...tarballs.map((file) => join(packDirectory, file))
    ],
    { cwd: installDirectory, env: npmEnvironment() }
  );
  await verifyInstalledPackages();
  await writeManifest(tarballs);
  if (outputIndex !== -1) {
    await cp(resolve(root, "LICENSE"), join(packDirectory, "LICENSE"));
    await cp(resolve(root, "COMMERCIAL-LICENSE.md"), join(packDirectory, "COMMERCIAL-LICENSE.md"));
    await cp(resolve(root, "README.md"), join(packDirectory, "README.md"));
  }
  process.stdout.write(`Package smoke passed for ${tarballs.length} local artifacts\n`);
} finally {
  await rm(workRoot, { force: true, recursive: true });
}
