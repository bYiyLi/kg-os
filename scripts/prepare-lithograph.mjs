import { createHash } from "node:crypto";
import { access, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { currentLithographArtifact, LITHOGRAPH_VERSION } from "./lithograph-artifacts.mjs";
import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const artifact = currentLithographArtifact(root);
const manifestPath = join(artifact.cacheDirectory, "manifest.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function validCache() {
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const archive = await readFile(join(artifact.cacheDirectory, artifact.archive));
    const library = await readFile(join(artifact.cacheDirectory, artifact.library));
    const providerLibrary = await readFile(join(artifact.cacheDirectory, artifact.providerLibrary));
    return (
      manifest.version === LITHOGRAPH_VERSION &&
      manifest.sourceSha256 === artifact.sha256 &&
      manifest.librarySha256 === sha256(library) &&
      manifest.providerLibrary === artifact.providerLibrary &&
      manifest.providerLibrarySha256 === sha256(providerLibrary) &&
      sha256(archive) === artifact.sha256
    );
  } catch {
    return false;
  }
}

function validateArchiveEntries(listing) {
  const entries = listing
    .split("\n")
    .map((entry) => entry.replace(/\r$/, ""))
    .filter((entry) => entry.length > 0);
  for (const entry of entries) {
    const parts = entry.split("/");
    if (entry.startsWith("/") || entry.includes("\\") || parts.includes("..")) {
      throw new Error(`Unsafe path in Lithograph release archive: ${entry}`);
    }
  }
  if (!entries.includes(artifact.library)) {
    throw new Error(
      `Lithograph release archive does not contain ${artifact.library}: ${JSON.stringify(entries)}`
    );
  }
  if (!entries.includes(artifact.providerLibrary)) {
    throw new Error(
      `Lithograph release archive does not contain ${artifact.providerLibrary}: ${JSON.stringify(entries)}`
    );
  }
  if (!entries.includes("VERSION")) {
    throw new Error("Lithograph release archive does not contain VERSION");
  }
}

async function prepare() {
  if (await validCache()) {
    process.stdout.write(`Lithograph v${LITHOGRAPH_VERSION} fixture ready: ${artifact.key}\n`);
    return;
  }

  await mkdir(dirname(artifact.cacheDirectory), { recursive: true });
  const staging = await mkdtemp(join(dirname(artifact.cacheDirectory), ".prepare-"));
  const archivePath = join(staging, artifact.archive);

  try {
    const response = await fetch(artifact.url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Failed to download Lithograph fixture: HTTP ${response.status}`);
    }
    const archive = Buffer.from(await response.arrayBuffer());
    if (sha256(archive) !== artifact.sha256) {
      throw new Error("Lithograph fixture SHA-256 does not match the pinned release asset");
    }
    await writeFile(archivePath, archive, { flag: "wx" });

    const zip = artifact.archive.endsWith(".zip");
    const archiveTool =
      process.platform === "win32" && zip
        ? resolve(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
        : "tar";
    const listing = await runCapture(archiveTool, [zip ? "-tf" : "-tzf", artifact.archive], {
      cwd: staging
    });
    validateArchiveEntries(listing.stdout);
    await run(archiveTool, [zip ? "-xf" : "-xzf", artifact.archive], { cwd: staging });
    await access(join(staging, artifact.library));
    await access(join(staging, artifact.providerLibrary));
    const version = (await readFile(join(staging, "VERSION"), "utf8")).trim();
    if (version !== LITHOGRAPH_VERSION) {
      throw new Error("Lithograph release archive VERSION does not match the pinned release");
    }

    const library = await readFile(join(staging, artifact.library));
    const providerLibrary = await readFile(join(staging, artifact.providerLibrary));
    await writeFile(
      join(staging, "manifest.json"),
      `${JSON.stringify(
        {
          archive: artifact.archive,
          library: artifact.library,
          librarySha256: sha256(library),
          providerLibrary: artifact.providerLibrary,
          providerLibrarySha256: sha256(providerLibrary),
          platform: artifact.key,
          source: artifact.url,
          sourceSha256: artifact.sha256,
          version: LITHOGRAPH_VERSION
        },
        null,
        2
      )}\n`
    );

    await rm(artifact.cacheDirectory, { force: true, recursive: true });
    await rename(staging, artifact.cacheDirectory);
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }

  process.stdout.write(`Prepared Lithograph v${LITHOGRAPH_VERSION} fixture: ${artifact.key}\n`);
}

await prepare();
