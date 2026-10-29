// Sync the public VLog model into KG OS's offline Skill snapshot.
// Usage: node scripts/sync-vlog-ontology.mjs ../kgos-ontologies v0.1.0 [--check]
// Reads an immutable Git commit; does not depend on the source working tree.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [repositoryArg, revision, mode] = process.argv.slice(2);
if (!repositoryArg || !revision || (mode !== undefined && mode !== "--check")) {
  throw new Error(
    "Usage: node scripts/sync-vlog-ontology.mjs <local-public-repo> <tag-or-commit> [--check]"
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

const parts = [
  ["models/vlog/ontology.md", "plugins/kgos/skills/kgos-vlog-standards/references/ontology.md"],
  ["models/vlog/cypher.md", "plugins/kgos/skills/kgos-vlog-standards/references/cypher.md"],
  ["models/vlog/tests/seed.cypher", "plugins/kgos/skills/kgos-vlog-standards/tests/seed.cypher"],
  ["models/vlog/tests/expected.json", "plugins/kgos/skills/kgos-vlog-standards/tests/expected.json"]
];
const outputs = [];
for (const [src, dest] of parts) {
  // Use the exact Git blob bytes at the pinned Commit, never an uncommitted local file.
  const content = execFileSync("git", ["-C", repository, "show", commit + ":" + src], {
    encoding: "utf8"
  });
  const header = dest.endsWith(".md")
    ? "<!-- GENERATED SNAPSHOT from https://github.com/bYiyLi/kgos-ontologies/blob/" +
      commit +
      "/" +
      src +
      " ; do not edit this copy manually. -->\n\n"
    : "";
  outputs.push([resolve(root, dest), header + content]);
}

const start = "<!-- KGOS_VLOG_MODEL_SNAPSHOT_START -->";
const end = "<!-- KGOS_VLOG_MODEL_SNAPSHOT_END -->";
const skillPath = resolve(root, "plugins/kgos/skills/kgos-vlog-standards/SKILL.md");
const skill = readFileSync(skillPath, "utf8");
const first = skill.indexOf(start);
const last = skill.indexOf(end);
if (first < 0 || last < first || skill.indexOf(start, first + start.length) !== -1) {
  throw new Error("VLog Skill snapshot marker missing or repeated");
}
const attribution =
  "\n本 Skill 所带 VLog 本体与查询是官方公开模型库 " +
  revision +
  " 的离线固定快照，" +
  "源版本：" +
  "https://github.com/bYiyLi/kgos-ontologies/tree/" +
  commit +
  "/models/vlog 。Definition 及查询的可维护真源在公开仓库；升级时运行同步脚本，" +
  "不得在 Skill 内独立编辑。模型仍然可选，不因安装自动建库。\n";
const nextSkill = skill.slice(0, first + start.length) + attribution + skill.slice(last);
outputs.push([skillPath, nextSkill]);

let mismatch = false;
for (const [path, expected] of outputs) {
  const actual = readFileSync(path, "utf8");
  if (actual === expected) continue;
  if (check) {
    mismatch = true;
    process.stderr.write("OUT OF SYNC: " + path + "\n");
  } else {
    writeFileSync(path, expected, "utf8");
    process.stdout.write("SYNC: " + path + "\n");
  }
}
if (mismatch) process.exitCode = 1;
else process.stdout.write((check ? "Verified" : "Synced") + " VLog snapshot at " + commit + "\n");
