// Deterministic, read-only integrity check. Never fetches or executes source material.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { lstat, readFile, readdir } from "node:fs/promises";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
export const ontologyReferenceRoot = "plugins/kgos/skills/kgos-ontology-standards/references";
const hash = (bytes, algorithm = "sha256") => createHash(algorithm).update(bytes).digest("hex");

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

function safePath(path) {
  requireValue(
    typeof path === "string" &&
      path.length > 0 &&
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.startsWith("/") &&
      !path.split("/").some((part) => part === ".." || part === "." || !part),
    `Unsafe source path: ${path}`
  );
  return path;
}

async function regularFiles(root, prefix) {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...(await regularFiles(root, path)));
    else {
      requireValue(entry.isFile(), `Unsupported source entry: ${path}`);
      files.push(path);
    }
  }
  return files.sort();
}

function validateSource(source) {
  requireValue(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(source.id), "Invalid source ID");
  requireValue(
    source.url?.startsWith("https://") &&
      source.license &&
      source.attribution &&
      source.scope &&
      Array.isArray(source.gaps) &&
      Array.isArray(source.dependencies),
    `Incomplete source provenance: ${source.id}`
  );
  requireValue(
    source.commit ? /^[0-9a-f]{40}$/.test(source.commit) : source.version && source.licenseEvidence,
    `Source requires an immutable commit or explicit document version: ${source.id}`
  );
}

async function verifyBytes(root, item) {
  const path = safePath(item.path);
  const info = await lstat(join(root, path));
  requireValue(info.isFile(), `Not a regular source file: ${path}`);
  const bytes = await readFile(join(root, path));
  requireValue(
    bytes.length === item.bytes && hash(bytes) === item.sha256,
    `Source size/hash mismatch: ${path}`
  );
  if (item.gitBlob) {
    const blob = Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes]);
    requireValue(hash(blob, "sha1") === item.gitBlob, `Git blob mismatch: ${path}`);
  }
  return bytes;
}

function validateDerived(item, originals, bytes) {
  const original = originals.get(item.original);
  requireValue(
    original &&
      original.sha256 === item.originalSha256 &&
      original.source === item.source &&
      item.method &&
      item.review &&
      Number.isInteger(item.pages) &&
      item.pages > 0 &&
      item.pageCharacters?.length === item.pages,
    `Incomplete conversion provenance: ${item.path}`
  );
  const text = bytes.toString("utf8");
  const pages = [...text.matchAll(/^## PDF page (\d+)$/gm)].map((match) => Number(match[1]));
  requireValue(
    pages.length === item.pages && pages.every((page, index) => page === index + 1),
    `Incomplete PDF page sequence: ${item.path}`
  );
  requireValue(
    text.includes(item.originalSha256) && text.includes("not a verified semantic substitute"),
    `Conversion omits original identity or fidelity limit: ${item.path}`
  );
}

function upstreamInventory(upstreamRoot, source) {
  const repository = join(upstreamRoot, `kgos-${source.id}`);
  const run = (...args) =>
    execFileSync("git", ["-C", repository, ...args], {
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024
    });
  requireValue(
    run("rev-parse", `${source.commit}^{commit}`).trim() === source.commit,
    `Missing pinned upstream commit: ${source.id}`
  );
  return run("ls-tree", "-rz", source.commit)
    .split("\0")
    .filter(Boolean)
    .map((row) => {
      const [metadata, path] = row.split("\t");
      return [path, metadata.split(" ")[2]];
    })
    .sort(([a], [b]) => a.localeCompare(b, "en"));
}

function validateUpstreamTree(upstreamRoot, source, files, excluded) {
  const actual = upstreamInventory(upstreamRoot, source);
  const declared = [...files, ...excluded]
    .filter((item) => item.source === source.id)
    .map((item) => [item.upstreamPath, item.gitBlob])
    .sort(([a], [b]) => a.localeCompare(b, "en"));
  requireValue(
    JSON.stringify(actual) === JSON.stringify(declared),
    `Included/excluded inventory differs from pinned Git tree: ${source.id}`
  );
}

export async function validateOntologySources({ root = repositoryRoot, upstreamRoot } = {}) {
  const directory = join(root, ontologyReferenceRoot);
  const manifest = JSON.parse(await readFile(join(directory, "sources.json"), "utf8"));
  requireValue(manifest.schema === 1, "Unsupported ontology source manifest");
  const sources = new Map();
  for (const source of manifest.sources) {
    validateSource(source);
    requireValue(!sources.has(source.id), `Duplicate source: ${source.id}`);
    sources.set(source.id, source);
  }
  const originals = new Map();
  for (const item of manifest.files) {
    requireValue(item.path.startsWith(`upstream/${item.source}/`), "Invalid original prefix");
    requireValue(
      sources.has(item.source) && item.upstreamPath && item.license && item.category,
      `Incomplete file provenance: ${item.path}`
    );
    requireValue(!originals.has(item.path), `Duplicate original: ${item.path}`);
    await verifyBytes(directory, item);
    originals.set(item.path, item);
  }
  const derivedPaths = new Set();
  for (const item of manifest.derived) {
    requireValue(item.path.startsWith(`readable/${item.source}/`), "Invalid conversion prefix");
    requireValue(!derivedPaths.has(item.path), `Duplicate conversion: ${item.path}`);
    const bytes = await verifyBytes(directory, item);
    validateDerived(item, originals, bytes);
    derivedPaths.add(item.path);
  }
  for (const alias of manifest.importAliases) {
    requireValue(
      alias.iri?.startsWith("https://") && originals.has(alias.path) && alias.basis,
      "Unresolved or undocumented import alias"
    );
  }
  for (const item of manifest.excluded) {
    requireValue(
      sources.has(item.source) && item.reason && /^[0-9a-f]{40}$/.test(item.gitBlob),
      "Incomplete excluded-file provenance"
    );
    safePath(item.upstreamPath);
  }
  requireValue(
    JSON.stringify(await regularFiles(directory, "upstream")) ===
      JSON.stringify([...originals.keys()].sort()),
    "Undeclared or missing upstream files"
  );
  requireValue(
    JSON.stringify(await regularFiles(directory, "readable")) ===
      JSON.stringify([...derivedPaths].sort()),
    "Undeclared or missing readable conversions"
  );
  for (const source of sources.values()) {
    const items = manifest.files.filter((item) => item.source === source.id);
    requireValue(
      source.files === items.length &&
        source.bytes === items.reduce((sum, item) => sum + item.bytes, 0),
      `Source totals mismatch: ${source.id}`
    );
    if (upstreamRoot && source.commit) {
      validateUpstreamTree(upstreamRoot, source, manifest.files, manifest.excluded);
    }
  }
  const paths = ["sources.json", ...originals.keys(), ...derivedPaths]
    .map((path) => posix.join(ontologyReferenceRoot, path))
    .sort();
  return {
    paths,
    sources: sources.size,
    originals: originals.size,
    conversions: derivedPaths.size,
    bytes: manifest.files.reduce((sum, item) => sum + item.bytes, 0),
    upstreamTrees: upstreamRoot ? [...sources.values()].filter((source) => source.commit).length : 0
  };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  requireValue(
    args.length === 0 || (args.length === 2 && args[0] === "--upstream-root"),
    "Usage: node scripts/check-ontology-sources.mjs [--upstream-root <local-parent-directory>]"
  );
  const result = await validateOntologySources({ upstreamRoot: args[1] });
  process.stdout.write(`${JSON.stringify({ ...result, paths: undefined })}\n`);
}
