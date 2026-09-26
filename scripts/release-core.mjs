import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

export const RELEASE_DIST_TAG = "latest";
export const RELEASE_REGISTRY = "https://registry.npmjs.org";
export const RUNTIME_TARGETS = [
  "win32-arm64",
  "win32-x64",
  "darwin-arm64",
  "darwin-x64",
  "linux-arm64",
  "linux-x64"
];
export const RELEASE_PACKAGE_ORDER = [
  ...RUNTIME_TARGETS.map((target) => "@kgos/runtime-" + target),
  "@kgos/sdk",
  "@kgos/cli"
];

const semverNumber = "(?:0|[1-9]\\d*)";
const semverPrereleaseIdentifier = "(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)";
const exactVersion = new RegExp(
  "^" +
    semverNumber +
    "\\." +
    semverNumber +
    "\\." +
    semverNumber +
    "(?:-" +
    semverPrereleaseIdentifier +
    "(?:\\." +
    semverPrereleaseIdentifier +
    ")*)?$"
);
const distTag = /^[A-Za-z][0-9A-Za-z._-]*$/;
const sha512Integrity = /^sha512-[A-Za-z0-9+/]{86}==$/;

export function assertReleaseVersion(version) {
  if (!exactVersion.test(version) || version === "0.0.0") {
    throw new Error("Release version must be an exact non-placeholder SemVer");
  }
  return version;
}

export function assertDistTag(value) {
  if (!distTag.test(value) || exactVersion.test(value)) {
    throw new Error("npm dist-tag must be a non-SemVer tag name");
  }
  return value;
}

export function validateCandidateDocument(candidate) {
  if (candidate?.schemaVersion !== 1) {
    throw new Error("Unsupported release candidate schema");
  }
  assertReleaseVersion(candidate.version);
  if (typeof candidate.revision !== "string" || !/^[0-9a-f]{40}$/.test(candidate.revision)) {
    throw new Error("Release candidate revision must be a full Git SHA");
  }
  if (!RUNTIME_TARGETS.includes(candidate.target)) {
    throw new Error("Unsupported release candidate target: " + String(candidate.target));
  }
  if (typeof candidate.dirty !== "boolean") {
    throw new Error("Release candidate dirty marker is missing");
  }
  if (!Array.isArray(candidate.packages)) {
    throw new Error("Release candidate packages are missing");
  }

  const expectedNames = new Set(["@kgos/sdk", "@kgos/cli", "@kgos/runtime-" + candidate.target]);
  if (candidate.packages.length !== expectedNames.size) {
    throw new Error("Release candidate package set is incomplete");
  }
  for (const entry of candidate.packages) {
    if (
      typeof entry?.name !== "string" ||
      !expectedNames.delete(entry.name) ||
      entry.version !== candidate.version ||
      typeof entry.filename !== "string" ||
      entry.filename === "" ||
      entry.filename.includes("/") ||
      typeof entry.integrity !== "string" ||
      !sha512Integrity.test(entry.integrity)
    ) {
      throw new Error("Release candidate package metadata is invalid");
    }
  }
  if (expectedNames.size !== 0) {
    throw new Error("Release candidate package set is incomplete");
  }

  const [platform, arch] = candidate.target.split("-");
  const librarySuffix = platform === "darwin" ? ".dylib" : platform === "win32" ? ".dll" : ".so";
  const daemonName = platform === "win32" ? "kgosd.exe" : "kgosd";
  const expectedRuntimeFiles = new Set([
    daemonName,
    "extensions/lithograph" + librarySuffix,
    "extensions/lithograph-openai-compatible" + librarySuffix,
    "extensions/kgos-jieba" + librarySuffix,
    "JIEBA-NOTICE.md",
    "licenses/sqlite-simple-tokenizer-MIT.txt",
    "licenses/jieba-rs-MIT.txt"
  ]);
  if (
    candidate.runtimeManifest?.version !== candidate.version ||
    candidate.runtimeManifest?.platform !== platform ||
    candidate.runtimeManifest?.arch !== arch ||
    !Array.isArray(candidate.runtimeManifest?.files) ||
    candidate.runtimeManifest.files.length !== expectedRuntimeFiles.size
  ) {
    throw new Error("Release candidate Runtime manifest is invalid");
  }
  for (const file of candidate.runtimeManifest.files) {
    if (
      typeof file?.file !== "string" ||
      !expectedRuntimeFiles.delete(file.file) ||
      typeof file.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(file.sha256)
    ) {
      throw new Error("Release candidate Runtime manifest file is invalid");
    }
  }
  if (expectedRuntimeFiles.size !== 0) {
    throw new Error("Release candidate Runtime manifest is incomplete");
  }
  return candidate;
}

export function aggregateCandidateDocuments(entries, verifiedWindowsCliTargets = new Set()) {
  if (!Array.isArray(entries)) {
    throw new TypeError("Candidate entries must be an array");
  }

  const byTarget = new Map();
  let revision;
  let version;
  for (const entry of entries) {
    const candidate = validateCandidateDocument(entry.document);
    if (candidate.dirty) {
      throw new Error("Release candidate was built from a dirty worktree: " + candidate.target);
    }
    if (byTarget.has(candidate.target)) {
      throw new Error("Duplicate release candidate target: " + candidate.target);
    }
    revision ??= candidate.revision;
    version ??= candidate.version;
    if (candidate.revision !== revision || candidate.version !== version) {
      throw new Error("Release candidates do not share one revision and version");
    }
    byTarget.set(candidate.target, { ...entry, document: candidate });
  }

  for (const target of RUNTIME_TARGETS) {
    if (!byTarget.has(target)) {
      throw new Error("Missing release candidate target: " + target);
    }
  }

  const packages = [];
  for (const target of RUNTIME_TARGETS) {
    const entry = byTarget.get(target);
    const packageEntry = entry.document.packages.find(
      (item) => item.name === "@kgos/runtime-" + target
    );
    packages.push({ ...packageEntry, sourceDirectory: entry.directory });
  }
  const clientEntry = byTarget.get("linux-x64");
  for (const name of ["@kgos/sdk", "@kgos/cli"]) {
    const packageEntry = clientEntry.document.packages.find((item) => item.name === name);
    for (const target of RUNTIME_TARGETS) {
      const peer = byTarget.get(target).document.packages.find((item) => item.name === name);
      if (
        peer.filename !== packageEntry.filename ||
        (peer.integrity !== packageEntry.integrity &&
          !(
            name === "@kgos/cli" &&
            target.startsWith("win32-") &&
            verifiedWindowsCliTargets.has(target)
          ))
      ) {
        throw new Error("Release client package differs across target candidates: " + name);
      }
    }
    packages.push({ ...packageEntry, sourceDirectory: clientEntry.directory });
  }

  return {
    schemaVersion: 1,
    revision,
    version,
    packages
  };
}

export function validateReleaseManifest(manifest) {
  if (manifest?.schemaVersion !== 1) {
    throw new Error("Unsupported release manifest schema");
  }
  assertReleaseVersion(manifest.version);
  if (typeof manifest.revision !== "string" || !/^[0-9a-f]{40}$/.test(manifest.revision)) {
    throw new Error("Release manifest revision must be a full Git SHA");
  }
  if (
    !Array.isArray(manifest.packages) ||
    manifest.packages.length !== RELEASE_PACKAGE_ORDER.length
  ) {
    throw new Error("Release manifest package set is incomplete");
  }
  const expected = new Set(RELEASE_PACKAGE_ORDER);
  for (const entry of manifest.packages) {
    if (
      typeof entry?.name !== "string" ||
      !expected.delete(entry.name) ||
      entry.version !== manifest.version ||
      typeof entry.filename !== "string" ||
      entry.filename === "" ||
      entry.filename.includes("/") ||
      typeof entry.integrity !== "string" ||
      !sha512Integrity.test(entry.integrity)
    ) {
      throw new Error("Release manifest package metadata is invalid");
    }
  }
  if (expected.size !== 0) {
    throw new Error("Release manifest package set is incomplete");
  }
  return manifest;
}

export function classifyRegistryVersion(candidateIntegrity, registryMetadata) {
  if (registryMetadata === null) {
    return "missing";
  }
  return registryMetadata?.dist?.integrity === candidateIntegrity ? "matching" : "conflicting";
}

export function assertCliRegistryDependencies(metadata, version) {
  const dependencies = metadata?.dependencies ?? {};
  const optionalDependencies = metadata?.optionalDependencies ?? {};
  if (dependencies["@kgos/sdk"] !== version) {
    throw new Error("Registry CLI does not depend on the exact SDK release version");
  }
  for (const target of RUNTIME_TARGETS) {
    if (optionalDependencies["@kgos/runtime-" + target] !== version) {
      throw new Error("Registry CLI does not depend on the exact Runtime release version");
    }
  }
}

export async function fileIntegrity(path) {
  const bytes = await readFile(path);
  return "sha512-" + createHash("sha512").update(bytes).digest("base64");
}
