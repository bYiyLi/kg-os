import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { render } from "../scripts/render-kg-releases.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

test("only whitelisted public files are generated, deterministically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    const first = await render({ output: directory, revision, ref: "refs/heads/main" });
    const manifest = JSON.parse(await readFile(join(directory, "source.json"), "utf8"));
    assert.ok(first.files.length > 50);
    assert.deepEqual(
      first.files.filter((path) => /^plugins\/kgos\/skills\/[^/]+\/SKILL\.md$/.test(path)).length,
      7
    );
    assert.deepEqual(
      first.files.filter((path) => /(?:^|\/)INSTALL(?:[.-].*)?\.md$/i.test(path)),
      ["INSTALL.md"]
    );
    assert.ok(first.files.includes("README.md"));
    assert.ok(first.files.includes("README.zh-CN.md"));
    assert.ok(!first.files.includes("MAINTAINING.md"));
    assert.ok(!first.files.some((path) => path.startsWith("docs/")));
    assert.ok(first.files.includes(".github/workflows/pages.yml"));
    assert.ok(first.files.includes("site/astro.config.mjs"));
    assert.ok(first.files.includes("site/pnpm-lock.yaml"));
    assert.ok(first.files.includes("site/src/pages/en/index.astro"));
    assert.ok(first.files.includes("site/src/pages/zh/index.astro"));
    assert.ok(first.files.includes("site/public/favicon.svg"));
    assert.ok(!first.files.some((path) => path.startsWith("site/dist/")));
    assert.ok(!first.files.some((path) => path.startsWith("site/node_modules/")));
    assert.deepEqual(
      first.files.filter((path) => path.startsWith("site/")).sort(),
      [
        "site/astro.config.mjs",
        "site/package.json",
        "site/pnpm-lock.yaml",
        "site/pnpm-workspace.yaml",
        "site/public/favicon.svg",
        "site/src/components/AiInstall.astro",
        "site/src/components/Homepage.astro",
        "site/src/components/WorkspacePreview.astro",
        "site/src/lib/content.ts",
        "site/src/pages/en/index.astro",
        "site/src/pages/index.astro",
        "site/src/pages/zh/index.astro",
        "site/src/styles/site.css",
        "site/tsconfig.json"
      ].sort()
    );
    assert.ok(!first.files.includes("plugins/kgos/INSTALL.md"));
    assert.ok(!first.files.includes("plugins/kgos/skills/kgos/SKILL.md"));
    assert.ok(!first.files.includes("plugins/kgos/.app.json"));
    assert.deepEqual(
      (await readdir(join(directory, "plugins/kgos/skills"))).sort(),
      [
        "kgos-branch-standards",
        "kgos-doctor",
        "kgos-knowledge-standards",
        "kgos-maintenance-standards",
        "kgos-ontology-standards",
        "kgos-retrieval-standards",
        "kgos-vlog-standards"
      ].sort()
    );
    const sourceSkillDirs = (
      await readdir(join(root, "plugins/kgos/skills"), { withFileTypes: true })
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    assert.deepEqual(
      sourceSkillDirs,
      (await readdir(join(directory, "plugins/kgos/skills"))).sort(),
      "Private source must contain exactly the seven official Skills; do not retain a legacy generic Skill"
    );
    assert.equal(
      await readFile(join(directory, "INSTALL.md"), "utf8"),
      await readFile(join(root, "plugins/kgos/INSTALL.md"), "utf8")
    );
    assert.equal(
      (await readFile(join(directory, "LICENSE"), "utf8")).includes(
        "GNU AFFERO GENERAL PUBLIC LICENSE"
      ),
      true
    );
    assert.equal(
      JSON.parse(await readFile(join(directory, "plugins/kgos/plugin.json"), "utf8")).version,
      JSON.parse(await readFile(join(root, "package.json"), "utf8")).version
    );
    assert.deepEqual(manifest, {
      schema: 1,
      repository: "bYiyLi/kg-os",
      revision,
      ref: "refs/heads/main"
    });
    const before = await readFile(join(directory, "source.json"), "utf8");
    const second = await render({ output: directory, revision, ref: "refs/heads/main" });
    assert.deepEqual(first, second);
    assert.equal(await readFile(join(directory, "source.json"), "utf8"), before);
    assert.equal(
      (await readFile(join(directory, "README.md"), "utf8")).includes("kg-releases"),
      true
    );
    assert.match(
      await readFile(join(directory, "site/src/lib/content.ts"), "utf8"),
      /Make knowledge operable/
    );
    assert.match(
      await readFile(join(directory, "site/src/components/AiInstall.astro"), "utf8"),
      /https:\/\/raw\.githubusercontent\.com\/bYiyLi\/kg-releases\/main\/INSTALL\.md/
    );
    assert.match(
      await readFile(join(directory, ".github/workflows/pages.yml"), "utf8"),
      /path: site\/dist/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("rejects untrusted refs, mismatched revisions and unexpected public files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    await assert.rejects(
      render({ output: directory, revision, ref: "refs/heads/untrusted" }),
      /Only private main/
    );
    await assert.rejects(
      render({ output: directory, revision: "0".repeat(40), ref: "refs/heads/main" }),
      /does not equal/
    );
    await writeFile(join(directory, "private-source.txt"), "must never be synced");
    await assert.rejects(
      render({ output: directory, revision, ref: "refs/heads/main" }),
      /unmanaged public file/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("removes previously tracked files outside the export allowlist", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    execFileSync("git", ["config", "user.name", "Release Test"], { cwd: directory });
    execFileSync("git", ["config", "user.email", "test@example.invalid"], { cwd: directory });
    await writeFile(join(directory, "legacy-public-file.txt"), "obsolete");
    await writeFile(join(directory, "MAINTAINING.md"), "internal operations");
    execFileSync("git", ["add", "."], { cwd: directory });
    execFileSync("git", ["commit", "-qm", "seed"], { cwd: directory });
    await render({ output: directory, revision, ref: "refs/heads/main" });
    await assert.rejects(readFile(join(directory, "legacy-public-file.txt")), /ENOENT/);
    await assert.rejects(readFile(join(directory, "MAINTAINING.md")), /ENOENT/);
    assert.ok((await readFile(join(directory, "README.zh-CN.md"), "utf8")).length > 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("refuses rendering into the KG OS source and rejects unknown release tags", async () => {
  await assert.rejects(
    render({ output: join(root, ".private-source-output"), revision, ref: "refs/heads/main" }),
    /must not be inside/
  );
  await assert.rejects(
    render({
      output: join(tmpdir(), "kg-releases-invalid-tag"),
      revision,
      ref: "refs/tags/v999.999.999"
    })
  );
});

test("user-facing documentation is bilingual without exposing maintainer operations", async () => {
  const english = await readFile(join(root, "distribution/README.md"), "utf8");
  const chinese = await readFile(join(root, "distribution/README.zh-CN.md"), "utf8");
  const installer = await readFile(join(root, "plugins/kgos/INSTALL.md"), "utf8");
  const commercial = await readFile(join(root, "COMMERCIAL-LICENSE.md"), "utf8");
  assert.match(english, /\[简体中文\]\(README\.zh-CN\.md\)/);
  assert.match(chinese, /\[English\]\(README\.md\)/);
  assert.match(english, /\[INSTALL\.md\]\(INSTALL\.md\)/);
  assert.match(chinese, /\[INSTALL\.md\]\(INSTALL\.md\)/);
  assert.match(commercial, /^## English$/m);
  assert.match(commercial, /^## 简体中文$/m);
  for (const document of [english, chinese, installer, commercial]) {
    assert.doesNotMatch(
      document,
      /bYiyLi\/kg-os|KG_RELEASES_WRITE_KEY|KGOS_SOURCE_DEPLOY_KEY|KGOS_BINARY_DISTRIBUTION_APPROVED|MAINTAINING\.md/
    );
  }
});

test("agent installer has one installation flow and preserves official guidance", async () => {
  const installer = await readFile(join(root, "plugins/kgos/INSTALL.md"), "utf8");
  assert.doesNotMatch(installer, /^## (?:English|简体中文)$/m);
  assert.deepEqual(
    [...installer.matchAll(/^## ([1-6])\. /gm)].map((match) => match[1]),
    ["1", "2", "3", "4", "5", "6"]
  );
  const guidance = await readFile(
    join(root, "plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance-v1.md"),
    "utf8"
  );
  const block = /\[KGOS_GUIDANCE_BEGIN:v1\][\s\S]*?\[KGOS_GUIDANCE_END:v1\]/g;
  assert.deepEqual(
    [...installer.matchAll(block)].map((match) => match[0]),
    [guidance.match(block)[0]]
  );
});
