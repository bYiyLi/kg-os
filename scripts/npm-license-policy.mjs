import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import parseLicense from "spdx-expression-parse";

// Preserve the reviewed identifiers and explicit legacy exceptions.
export const ALLOWED_LICENSES = [
  "MIT",
  "MIT*",
  "ISC",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
  "MPL-2.0",
  "Python-2.0",
  "CC0-1.0",
  "BlueOak-1.0.0",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "(BSD-2-Clause OR MIT OR Apache-2.0)",
  "(MIT AND CC-BY-3.0)",
  "Custom: https://github.com/streetsidesoftware/cspell"
];
const allowed = new Set(ALLOWED_LICENSES);

function permitsExpression(expression) {
  if (expression.conjunction === "or") {
    return permitsExpression(expression.left) || permitsExpression(expression.right);
  }
  if (expression.conjunction === "and") {
    return permitsExpression(expression.left) && permitsExpression(expression.right);
  }
  return (
    expression.exception === undefined &&
    expression.plus !== true &&
    allowed.has(expression.license)
  );
}

export function isLicenseAllowed(license) {
  if (typeof license !== "string" || license.trim() === "" || license.length > 4096) {
    return false;
  }
  if (allowed.has(license)) {
    return true;
  }
  try {
    return permitsExpression(parseLicense(license));
  } catch {
    return false;
  }
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonemptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validateEntry(license, entry) {
  if (
    !isRecord(entry) ||
    !isNonemptyString(entry.name) ||
    entry.license !== license ||
    !Array.isArray(entry.versions) ||
    entry.versions.length === 0 ||
    !entry.versions.every(isNonemptyString) ||
    !Array.isArray(entry.paths) ||
    entry.paths.length === 0 ||
    entry.paths.length !== entry.versions.length ||
    !entry.paths.every((path) => isNonemptyString(path) && isAbsolute(path))
  ) {
    throw new Error("Malformed npm license entry for " + license);
  }
}

function declaredLicense(manifest) {
  return typeof manifest.license === "string" ? manifest.license : manifest.license?.type;
}

async function inspectEntry(entry, scanned, identities, summary) {
  for (const [index, path] of entry.paths.entries()) {
    const directory = await realpath(path);
    const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
    if (manifest.name !== entry.name || manifest.version !== entry.versions[index]) {
      throw new Error("npm license scan does not match installed package: " + path);
    }
    scanned.add(directory);
    const declared = declaredLicense(manifest);
    const identity = manifest.name + "@" + manifest.version;
    const privatePackage = manifest.private === true;
    const previous = identities.get(identity);
    if (
      previous !== undefined &&
      (previous.declared !== declared || previous.privatePackage !== privatePackage)
    ) {
      throw new Error("Inconsistent installed npm package identity: " + identity);
    }
    identities.set(identity, { declared, privatePackage });
    if (manifest.private === true || manifest.name.startsWith("@kgos/")) {
      continue;
    }
    if (
      isNonemptyString(declared) &&
      !declared.startsWith("SEE LICENSE IN ") &&
      declared !== entry.license
    ) {
      throw new Error("npm license scan does not match installed license: " + path);
    }
    if (!isLicenseAllowed(entry.license)) {
      throw new Error(
        manifest.name + "@" + manifest.version + " has unapproved license: " + entry.license
      );
    }
    summary.set(entry.license, (summary.get(entry.license) ?? 0) + 1);
  }
}

function hasPeerInstanceProof(manifest, identities) {
  const observed = identities.get(manifest.name + "@" + manifest.version);
  const declared = declaredLicense(manifest);
  return (
    observed !== undefined &&
    isNonemptyString(declared) &&
    !declared.startsWith("SEE LICENSE IN ") &&
    observed.declared === declared &&
    observed.privatePackage === (manifest.private === true)
  );
}

async function checkScanCoverage(workspaces, scanned, identities) {
  if (!Array.isArray(workspaces) || workspaces.length === 0) {
    throw new Error("Missing npm production dependency tree");
  }
  const workspacePaths = new Set();
  for (const workspace of workspaces) {
    if (!isRecord(workspace) || !isNonemptyString(workspace.path) || !isAbsolute(workspace.path)) {
      throw new Error("Malformed npm workspace dependency tree");
    }
    workspacePaths.add(await realpath(workspace.path));
  }
  const pending = [...workspaces];
  const visited = new WeakSet();
  while (pending.length > 0) {
    const node = pending.pop();
    if (!isRecord(node) || !isNonemptyString(node.path) || !isAbsolute(node.path)) {
      throw new Error("Malformed npm production dependency");
    }
    if (visited.has(node)) {
      continue;
    }
    visited.add(node);
    const directory = await realpath(node.path);
    const manifest = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
    if (!isNonemptyString(manifest.name) || !isNonemptyString(manifest.version)) {
      throw new Error("Malformed installed npm package: " + node.path);
    }
    if (
      isNonemptyString(node.version) &&
      !node.version.startsWith("link:") &&
      node.version !== manifest.version
    ) {
      throw new Error("npm dependency tree does not match installed version: " + node.path);
    }
    if (
      !workspacePaths.has(directory) &&
      !scanned.has(directory) &&
      !hasPeerInstanceProof(manifest, identities)
    ) {
      throw new Error("npm license scan missed a production dependency: " + node.path);
    }
    for (const field of ["dependencies", "optionalDependencies"]) {
      if (node[field] === undefined) {
        continue;
      }
      if (!isRecord(node[field])) {
        throw new Error("Malformed npm production dependency field: " + field);
      }
      pending.push(...Object.values(node[field]));
    }
  }
}

export async function checkProductionLicenses(report, workspaces) {
  if (!isRecord(report)) {
    throw new Error("Malformed npm license report");
  }
  const scanned = new Set();
  const identities = new Map();
  const summary = new Map();
  for (const [license, entries] of Object.entries(report)) {
    if (!isNonemptyString(license) || !Array.isArray(entries) || entries.length === 0) {
      throw new Error("Malformed npm license group: " + license);
    }
    for (const entry of entries) {
      validateEntry(license, entry);
      await inspectEntry(entry, scanned, identities, summary);
    }
  }
  await checkScanCoverage(workspaces, scanned, identities);
  return Object.fromEntries([...summary].sort(([left], [right]) => left.localeCompare(right)));
}
