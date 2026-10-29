// Pin the official AIMemory domain model and Skill to one immutable public Commit.
// Usage: node scripts/sync-memory-ontology.mjs ../kgos-ontologies <tag-or-commit> [--check]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [repositoryArg, revision, mode] = process.argv.slice(2);
if (!repositoryArg || !revision || (mode !== undefined && mode !== "--check")) {
  throw new Error(
    "Usage: node scripts/sync-memory-ontology.mjs <local-public-repo> <tag-or-commit> [--check]"
  );
}
const check = mode === "--check";
const repository = resolve(repositoryArg);
const git = (...args) =>
  execFileSync("git", ["-C", repository, ...args], { encoding: "utf8" }).trimEnd();
const origin = git("remote", "get-url", "origin");
if (!/^(git@github\.com:|https:\/\/github\.com\/)bYiyLi\/kgos-ontologies(?:\.git)?$/.test(origin)) {
  throw new Error("Expected the official bYiyLi/kgos-ontologies remote, found: " + origin);
}
const commit = git("rev-parse", "--verify", revision + "^{commit}").trim();
if (!/^[a-f0-9]{40}$/.test(commit)) {
  throw new Error("Invalid immutable Git commit: " + commit);
}
const base = "models/ai-memory/";
const destination = "plugins/kgos/skills/kgos-memory-standards/";
const assets = [
  ["ontology.md", "references/ontology.md"],
  ["cypher.md", "references/cypher.md"],
  ["tests/seed.cypher", "tests/seed.cypher"],
  ["tests/expected.json", "tests/expected.json"]
];
const source = (path) =>
  execFileSync("git", ["-C", repository, "show", commit + ":" + base + path], {
    encoding: "utf8"
  });
const url = (path) =>
  "https://github.com/bYiyLi/kgos-ontologies/blob/" + commit + "/" + base + path;
const outputs = [];
for (const [from, to] of assets) {
  const header = to.endsWith(".md")
    ? "<!-- GENERATED SNAPSHOT from " + url(from) + " ; do not edit manually. -->\n\n"
    : "";
  outputs.push([resolve(root, destination + to), header + source(from)]);
}

let skill = source("skills/kgos-memory-standards/SKILL.md");
const links = [
  ["[Ontology 定义](../../ontology.md)", "[Ontology 定义](references/ontology.md)"],
  ["[业务 Cypher](../../cypher.md)", "[业务 Cypher](references/cypher.md)"]
];
for (const [from, to] of links) {
  if (skill.split(from).length !== 2) {
    throw new Error("Unexpected canonical Memory Skill resource link: " + from);
  }
  skill = skill.replace(from, to);
}
if (!skill.startsWith("---\n")) {
  throw new Error("Canonical Memory Skill is missing its YAML frontmatter");
}
skill +=
  "\n<!-- GENERATED SKILL SNAPSHOT from " +
  url("skills/kgos-memory-standards/SKILL.md") +
  " ; do not edit manually. -->\n";
outputs.push([resolve(root, destination + "SKILL.md"), skill]);

let mismatch = false;
for (const [path, expected] of outputs) {
  const actual = existsSync(path) ? readFileSync(path, "utf8") : null;
  if (actual === expected) continue;
  if (check) {
    mismatch = true;
    process.stderr.write("OUT OF SYNC: " + path + "\n");
  } else {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, expected, "utf8");
    process.stdout.write("SYNC: " + path + "\n");
  }
}
if (mismatch) process.exitCode = 1;
else process.stdout.write((check ? "Verified" : "Synced") + " AIMemory at " + commit + "\n");
