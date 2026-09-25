import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";

import {
  RELEASE_DIST_TAG,
  RELEASE_PACKAGE_ORDER,
  RELEASE_REGISTRY,
  aggregateCandidateDocuments,
  assertCliRegistryDependencies,
  assertDistTag,
  assertReleaseVersion,
  classifyRegistryVersion,
  fileIntegrity,
  validateCandidateDocument,
  validateReleaseManifest
} from "./release-core.mjs";
import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const command = process.argv[2];

switch (command) {
  case "preflight":
    await preflight();
    break;
  case "authority":
    await verifyNpmAuthority();
    break;
  case "aggregate":
    await aggregate();
    break;
  case "publish":
    await publish();
    break;
  case "verify-registry":
    await verifyRegistryCommand();
    break;
  default:
    throw new Error(
      "Usage: node scripts/release.mjs <preflight|authority|aggregate|publish|verify-registry>"
    );
}

async function preflight() {
  const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const version = assertReleaseVersion(rootPackage.version);
  const finalTag = assertDistTag(option("--dist-tag") ?? RELEASE_DIST_TAG);
  const releaseTag = requiredOption("--release-tag");
  if (releaseTag !== "v" + version) {
    throw new Error("Release tag must exactly match package version: v" + version);
  }

  await run("pnpm", ["check:dependencies"], { cwd: root });
  const revision = (await runCapture("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  const originMain = (
    await runCapture("git", ["rev-parse", "--verify", "origin/main"], { cwd: root })
  ).stdout.trim();
  const status = (await runCapture("git", ["status", "--porcelain"], { cwd: root })).stdout.trim();
  const tagRevision = (
    await runCapture("git", ["rev-list", "-n", "1", releaseTag], { cwd: root })
  ).stdout.trim();

  try {
    await run("git", ["merge-base", "--is-ancestor", revision, originMain], { cwd: root });
  } catch {
    throw new Error("Release revision must be reachable from origin/main");
  }
  if (status !== "") {
    throw new Error("Release preflight requires a clean worktree");
  }
  if (tagRevision !== revision) {
    throw new Error("Release tag must point to the checked-out release revision");
  }

  process.stdout.write(JSON.stringify({ version, distTag: finalTag, releaseTag, revision }) + "\n");
}

async function verifyNpmAuthority() {
  const user = (
    await runCapture("npm", ["whoami", "--registry", RELEASE_REGISTRY], { cwd: root })
  ).stdout.trim();
  if (user === "") {
    throw new Error("npm whoami returned an empty account");
  }

  let authority = "user-scope";
  if (user !== "kgos") {
    const membershipResult = await runCapture(
      "npm",
      ["org", "ls", "kgos", user, "--json", "--registry", RELEASE_REGISTRY],
      { cwd: root }
    );
    const membership = JSON.parse(membershipResult.stdout);
    const role =
      typeof membership === "string"
        ? membership
        : (membership?.[user] ?? membership?.["@" + user] ?? Object.values(membership ?? {})[0]);
    if (typeof role !== "string" || role === "") {
      throw new Error("npm account is not a confirmed @kgos organization member");
    }
    authority = "organization-" + role;
  }

  process.stdout.write(JSON.stringify({ scope: "@kgos", user, authority }) + "\n");
}

async function aggregate() {
  const input = requiredOption("--input");
  const output = artifactDirectory(requiredOption("--output"));
  const expectedRevision = requiredOption("--revision");
  const expectedVersion = assertReleaseVersion(requiredOption("--version"));
  if (!/^[0-9a-f]{40}$/.test(expectedRevision)) {
    throw new Error("--revision must be a full Git SHA");
  }
  const candidateFiles = await findFiles(resolve(input), "candidate.json");
  const entries = [];
  for (const path of candidateFiles) {
    const document = validateCandidateDocument(JSON.parse(await readFile(path, "utf8")));
    const directory = dirname(path);
    for (const entry of document.packages) {
      const tarball = resolve(directory, entry.filename ?? "");
      if ((await fileIntegrity(tarball)) !== entry.integrity) {
        throw new Error("Candidate tarball integrity mismatch: " + String(entry.name));
      }
    }
    await verifyRuntimeCandidate(directory, document);
    entries.push({ directory, document });
  }

  const aggregateManifest = aggregateCandidateDocuments(entries);
  if (
    aggregateManifest.revision !== expectedRevision ||
    aggregateManifest.version !== expectedVersion
  ) {
    throw new Error("Release candidates do not match the preflight revision and version");
  }
  await rm(output, { force: true, recursive: true });
  await mkdir(output, { recursive: true });
  const packages = [];
  for (const entry of aggregateManifest.packages) {
    const source = resolve(entry.sourceDirectory, entry.filename);
    const destination = resolve(output, entry.filename);
    await cp(source, destination);
    if ((await fileIntegrity(destination)) !== entry.integrity) {
      throw new Error("Aggregated tarball integrity mismatch: " + entry.name);
    }
    packages.push({
      name: entry.name,
      version: entry.version,
      filename: entry.filename,
      integrity: entry.integrity
    });
  }
  const release = validateReleaseManifest({
    schemaVersion: 1,
    revision: aggregateManifest.revision,
    version: aggregateManifest.version,
    packages
  });
  await writeFile(resolve(output, "release.json"), JSON.stringify(release, null, 2) + "\n");
  process.stdout.write(JSON.stringify({ output, ...release }) + "\n");
}

async function publish() {
  const directory = resolve(requiredOption("--directory"));
  const finalTag = assertDistTag(option("--dist-tag") ?? RELEASE_DIST_TAG);
  const dryRun = process.argv.includes("--dry-run");
  const release = await loadRelease(directory);
  const states = await readRegistryStates(release);

  for (const entry of release.packages) {
    const state = states.get(entry.name);
    if (state.state === "conflicting") {
      throw new Error(
        "Registry already contains a different immutable artifact for " +
          entry.name +
          "@" +
          release.version
      );
    }
    if (state.state === "matching") {
      const packageMetadata = await registryPackage(entry.name);
      if (packageMetadata?.["dist-tags"]?.[finalTag] !== release.version) {
        throw new Error(
          "Matching registry artifact does not carry the release dist-tag: " +
            entry.name +
            "@" +
            release.version
        );
      }
    }
  }

  if (dryRun) {
    process.stdout.write(
      JSON.stringify({
        version: release.version,
        distTag: finalTag,
        packages: RELEASE_PACKAGE_ORDER.map((name) => ({
          name,
          state: states.get(name).state
        }))
      }) + "\n"
    );
    return;
  }

  for (const name of RELEASE_PACKAGE_ORDER) {
    const entry = release.packages.find((item) => item.name === name);
    const existing = states.get(name);
    if (existing.state === "matching") {
      continue;
    }
    if (name === "@kgos/cli") {
      for (const dependencyName of RELEASE_PACKAGE_ORDER.slice(0, -1)) {
        const dependency = release.packages.find((item) => item.name === dependencyName);
        const registryMetadata = await registryVersion(dependencyName, release.version);
        if (classifyRegistryVersion(dependency.integrity, registryMetadata) !== "matching") {
          throw new Error("CLI publish is blocked by missing exact dependency: " + dependencyName);
        }
      }
    }

    let publishError = null;
    try {
      await run(
        "npm",
        [
          "publish",
          resolve(directory, entry.filename),
          "--access",
          "public",
          "--tag",
          finalTag,
          "--registry",
          RELEASE_REGISTRY
        ],
        { cwd: root }
      );
    } catch (error) {
      publishError = error;
    }

    try {
      await waitForRegistryArtifact(entry, finalTag);
    } catch (registryError) {
      if (publishError !== null) {
        throw new Error(
          publishError.message + "\nRegistry recovery failed: " + registryError.message,
          { cause: registryError }
        );
      }
      throw registryError;
    }

    if (publishError !== null) {
      process.stderr.write(
        "npm publish returned non-zero, but the matching immutable registry artifact became visible: " +
          entry.name +
          "@" +
          entry.version +
          "\n"
      );
    }
  }
}

async function verifyRegistryCommand() {
  const directory = resolve(requiredOption("--directory"));
  const finalTag = option("--dist-tag");
  if (finalTag !== undefined) {
    assertDistTag(finalTag);
  }
  const release = await loadRelease(directory);
  await verifyRegistry(release, finalTag);
  process.stdout.write(
    JSON.stringify({ version: release.version, distTag: finalTag ?? null, status: "verified" }) +
      "\n"
  );
}

async function loadRelease(directory) {
  const release = validateReleaseManifest(
    JSON.parse(await readFile(resolve(directory, "release.json"), "utf8"))
  );
  for (const entry of release.packages) {
    if ((await fileIntegrity(resolve(directory, entry.filename))) !== entry.integrity) {
      throw new Error("Release tarball integrity mismatch: " + entry.name);
    }
  }
  return release;
}

async function readRegistryStates(release) {
  const states = new Map();
  for (const entry of release.packages) {
    const metadata = await registryVersion(entry.name, release.version);
    states.set(entry.name, {
      metadata,
      state: classifyRegistryVersion(entry.integrity, metadata)
    });
  }
  return states;
}

async function verifyRegistry(release, finalTag) {
  let cliMetadata;
  for (const entry of release.packages) {
    const packageMetadata = await registryPackage(entry.name);
    const metadata = packageMetadata?.versions?.[release.version] ?? null;
    if (classifyRegistryVersion(entry.integrity, metadata) !== "matching") {
      throw new Error("Registry artifact does not match candidate: " + entry.name);
    }
    if (finalTag !== undefined && packageMetadata?.["dist-tags"]?.[finalTag] !== release.version) {
      throw new Error("Registry dist-tag does not match release: " + entry.name);
    }
    if (entry.name === "@kgos/cli") {
      cliMetadata = metadata;
    }
  }
  assertCliRegistryDependencies(cliMetadata, release.version);
}

async function waitForRegistryArtifact(entry, finalTag) {
  const attempts = 72;
  let lastRegistryError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let packageMetadata;
    try {
      packageMetadata = await registryPackage(entry.name);
      lastRegistryError = null;
    } catch (error) {
      lastRegistryError = error;
      if (attempt + 1 < attempts) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
        continue;
      }
      throw error;
    }
    const metadata = packageMetadata?.versions?.[entry.version] ?? null;
    const state = classifyRegistryVersion(entry.integrity, metadata);
    if (state === "matching" && packageMetadata?.["dist-tags"]?.[finalTag] === entry.version) {
      return;
    }
    if (state === "conflicting") {
      throw new Error(
        "Published registry artifact conflicts with the release candidate: " + entry.name
      );
    }
    if (attempt + 1 < attempts) {
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 5000));
    }
  }
  throw new Error(
    "Registry propagation timed out for " +
      entry.name +
      "@" +
      entry.version +
      (lastRegistryError instanceof Error ? ": " + lastRegistryError.message : "")
  );
}

async function registryVersion(name, version) {
  const packageMetadata = await registryPackage(name);
  return packageMetadata?.versions?.[version] ?? null;
}

async function registryPackage(name) {
  const response = await fetch(RELEASE_REGISTRY + "/" + encodeURIComponent(name), {
    headers: { Accept: "application/vnd.npm.install-v1+json" }
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      "npm registry request failed for " + name + ": HTTP " + String(response.status)
    );
  }
  return response.json();
}

async function findFiles(directory, filename) {
  const matches = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      matches.push(...(await findFiles(path, filename)));
    } else if (entry.isFile() && entry.name === filename) {
      matches.push(path);
    }
  }
  return matches;
}

async function verifyRuntimeCandidate(directory, candidate) {
  const runtime = candidate.packages.find(
    (entry) => entry.name === "@kgos/runtime-" + candidate.target
  );
  if (runtime === undefined) {
    throw new Error("Release candidate Runtime package is missing");
  }
  const extraction = await mkdtemp(join(tmpdir(), "kgos-release-runtime-"));
  try {
    await run("tar", ["-xzf", resolve(directory, runtime.filename), "-C", extraction], {
      cwd: root
    });
    const packageRoot = resolve(extraction, "package");
    const metadata = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
    const manifest = JSON.parse(await readFile(resolve(packageRoot, "manifest.json"), "utf8"));
    const [platform, arch] = candidate.target.split("-");
    if (
      metadata.name !== runtime.name ||
      metadata.version !== candidate.version ||
      metadata.os?.[0] !== platform ||
      metadata.cpu?.[0] !== arch ||
      (platform === "linux" && metadata.libc?.[0] !== "glibc") ||
      manifest.version !== candidate.version ||
      manifest.platform !== platform ||
      manifest.arch !== arch ||
      !Array.isArray(manifest.files) ||
      manifest.files.length !== candidate.runtimeManifest.files.length
    ) {
      throw new Error("Release candidate Runtime tarball metadata is invalid");
    }

    const expectedFiles = new Map(
      candidate.runtimeManifest.files.map((entry) => [entry.file, entry.sha256])
    );
    for (const file of manifest.files) {
      if (
        typeof file?.file !== "string" ||
        typeof file.sha256 !== "string" ||
        expectedFiles.get(file.file) !== file.sha256
      ) {
        throw new Error("Release candidate Runtime tarball manifest does not match candidate");
      }
      const filePath = resolve(packageRoot, file.file);
      const fromPackageRoot = relative(packageRoot, filePath);
      if (
        fromPackageRoot === ".." ||
        fromPackageRoot.startsWith("../") ||
        resolve(packageRoot, fromPackageRoot) !== filePath
      ) {
        throw new Error("Release candidate Runtime manifest contains an unsafe file path");
      }
      const digest = createHash("sha256")
        .update(await readFile(filePath))
        .digest("hex");
      if (digest !== file.sha256) {
        throw new Error("Release candidate Runtime native SHA-256 mismatch: " + file.file);
      }
      expectedFiles.delete(file.file);
    }
    if (expectedFiles.size !== 0) {
      throw new Error("Release candidate Runtime tarball manifest is incomplete");
    }
  } finally {
    await rm(extraction, { force: true, recursive: true });
  }
}

function requiredOption(name) {
  const value = option(name);
  if (value === undefined || value === "") {
    throw new Error(name + " is required");
  }
  return value;
}

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(name + " requires a value");
  }
  return value;
}

function artifactDirectory(value) {
  const artifactsRoot = resolve(root, "artifacts");
  const path = resolve(value);
  const fromArtifacts = relative(artifactsRoot, path);
  if (
    fromArtifacts === "" ||
    fromArtifacts === ".." ||
    fromArtifacts.startsWith("../") ||
    resolve(artifactsRoot, fromArtifacts) !== path
  ) {
    throw new Error(
      "Release aggregate output must be a child of the repository artifacts directory"
    );
  }
  return path;
}
