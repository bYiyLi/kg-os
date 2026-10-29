import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, posix } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { render, stampSkillVersion } from "../scripts/render-kg-releases.mjs";
import {
  renderInstallationGuide,
  renderInstaller,
  validateInstallationBundle,
  validateInstallationCatalog,
  installationSnapshotFiles
} from "../scripts/render-release-installation.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();

function relativeImports(content, path) {
  return [...content.matchAll(/(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"']+)["']/g)].map(
    (match) => posix.normalize(posix.join(posix.dirname(path), match[1].split("?")[0]))
  );
}

test("only whitelisted public files are generated, deterministically", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-"));
  try {
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: directory });
    const first = await render({ output: directory, revision, ref: "refs/heads/main" });
    const manifest = JSON.parse(await readFile(join(directory, "source.json"), "utf8"));
    assert.ok(first.files.length > 50);
    assert.deepEqual(
      first.files.filter((path) => /^plugins\/kgos\/skills\/[^/]+\/SKILL\.md$/.test(path)).length,
      4
    );
    assert.deepEqual(
      first.files
        .filter((path) => path.startsWith("plugins/kgos/skills/kgos-ontology-standards/"))
        .sort(),
      [
        "plugins/kgos/skills/kgos-ontology-standards/SKILL.md",
        "plugins/kgos/skills/kgos-ontology-standards/references/model-confirmation-template.md",
        "plugins/kgos/skills/kgos-ontology-standards/references/modeling-examples.md",
        "plugins/kgos/skills/kgos-ontology-standards/references/ontology-methodology.md"
      ]
    );
    assert.deepEqual(
      first.files.filter((path) =>
        path.startsWith("plugins/kgos/skills/kgos-knowledge-standards/")
      ),
      ["plugins/kgos/skills/kgos-knowledge-standards/SKILL.md"]
    );
    assert.deepEqual(
      first.files.filter((path) => path.startsWith("plugins/kgos/skills/kgos-doctor/")).sort(),
      [
        "plugins/kgos/skills/kgos-doctor/SKILL.md",
        "plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md"
      ]
    );
    assert.deepEqual(
      first.files
        .filter((path) => path.startsWith("plugins/kgos/skills/kgos-vlog-standards/"))
        .sort(),
      [
        "plugins/kgos/skills/kgos-vlog-standards/SKILL.md",
        "plugins/kgos/skills/kgos-vlog-standards/references/cypher.md",
        "plugins/kgos/skills/kgos-vlog-standards/references/ontology.md"
      ]
    );
    assert.ok(
      !first.files.some((path) => path.startsWith("plugins/kgos/skills/kgos-vlog-standards/tests/"))
    );
    assert.deepEqual(
      first.files.filter(
        (path) => !path.startsWith("site/") && /(?:^|\/)INSTALL(?:[.-].*)?\.md$/i.test(path)
      ),
      ["INSTALL.md"]
    );
    assert.ok(first.files.includes("README.md"));
    assert.ok(first.files.includes("README.zh-CN.md"));
    assert.ok(!first.files.includes("MAINTAINING.md"));
    assert.ok(!first.files.some((path) => path.startsWith("docs/")));
    assert.ok(first.files.includes(".github/workflows/pages.yml"));
    assert.ok(first.files.includes("scripts/render-release-installation.mjs"));
    assert.ok(first.files.includes("site/astro.config.mjs"));
    assert.match(
      await readFile(join(directory, "site/astro.config.mjs"), "utf8"),
      /site:\s*"https:\/\/kgos\.sites\.y2l\.top"/
    );
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
        "site/src/components/InstallationGuide.astro",
        "site/src/components/SiteHeader.astro",
        "site/src/components/ThemeControls.astro",
        "site/src/components/ThemeInit.astro",
        "site/src/components/WorkspacePreview.astro",
        "site/src/content/service-installation/catalog.json",
        "site/src/content/service-installation/zh.md",
        "site/src/content/service-installation/en.md",
        ...(
          await installationSnapshotFiles(
            join(root, "distribution/site/src/content/service-installation")
          )
        ).map((file) => `site/src/content/service-installation/${file}`),
        "site/src/lib/content.ts",
        "site/src/lib/installations.ts",
        "site/src/pages/[locale]/install/[version]/index.astro",
        "site/src/pages/[locale]/install/[version].md.ts",
        "site/src/pages/install/[version]/INSTALL.md.ts",
        "site/src/pages/en/index.astro",
        "site/src/pages/en/install.astro",
        "site/src/pages/en/install.md.ts",
        "site/src/pages/index.astro",
        "site/src/pages/zh/index.astro",
        "site/src/pages/zh/install.astro",
        "site/src/pages/zh/install.md.ts",
        "site/src/styles/install.css",
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
        "kgos-doctor",
        "kgos-knowledge-standards",
        "kgos-ontology-standards",
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
      "Private source must contain exactly the four official Skills; do not retain retired independent Skills"
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
    const version = JSON.parse(
      await readFile(join(directory, "plugins/kgos/plugin.json"), "utf8")
    ).version;
    for (const skill of [
      "kgos-doctor",
      "kgos-knowledge-standards",
      "kgos-ontology-standards",
      "kgos-vlog-standards"
    ]) {
      const path = `plugins/kgos/skills/${skill}/SKILL.md`;
      const source = await readFile(join(root, path), "utf8");
      assert.doesNotMatch(source, /^metadata:\n {2}version:/m);
      assert.equal(
        await readFile(join(directory, path), "utf8"),
        stampSkillVersion(source, version)
      );
    }
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
      await readFile(join(directory, ".github/workflows/pages.yml"), "utf8"),
      /path: site\/dist/
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("Skill distribution versions support preview tags but never modify canonical sources", async () => {
  const source = await readFile(join(root, "plugins/kgos/skills/kgos-doctor/SKILL.md"), "utf8");
  const stamped = stampSkillVersion(source, "0.3.7-preview.1");
  assert.match(stamped, /metadata:\n {2}version: "0\.3\.7-preview\.1"\n---/);
  assert.equal(stamped.replace('metadata:\n  version: "0.3.7-preview.1"\n', ""), source);
  assert.throws(() => stampSkillVersion(stamped, "0.3.8"), /version metadata/);
  assert.throws(() => stampSkillVersion(source, "v0.3.7"), /version/);
  assert.throws(() => stampSkillVersion("# Not a Skill\n", "0.3.7"), /frontmatter/);
});

test("manual installation pages and downloads share self-contained public Markdown sources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-guide-"));
  try {
    const output = await render({ output: directory, revision, ref: "refs/heads/main" });
    const paths = new Set(output.files);
    for (const path of output.files.filter((file) => file.startsWith("site/"))) {
      const content = await readFile(join(directory, path), "utf8");
      assert.equal(content, await readFile(join(root, "distribution", path), "utf8"), path);
      if (![".mjs", ".ts", ".astro"].includes(extname(path))) {
        continue;
      }
      for (const dependency of relativeImports(content, path)) {
        assert.ok(dependency.startsWith("site/"), `${path} escapes the exported site`);
        assert.ok(
          [dependency, `${dependency}.ts`, `${dependency}.mjs`, `${dependency}/index.ts`].some(
            (candidate) => paths.has(candidate)
          ),
          `${path} imports a missing public dependency: ${dependency}`
        );
      }
    }
    const catalog = validateInstallationCatalog(
      JSON.parse(
        await readFile(
          join(directory, "site/src/content/service-installation/catalog.json"),
          "utf8"
        )
      )
    );
    for (const tag of catalog.versions) {
      const manuals = [];
      for (const locale of ["zh", "en"]) {
        const markdown = `site/src/content/service-installation/${tag}/${locale}.md`;
        const content = await readFile(join(directory, markdown), "utf8");
        const version = content.match(/^version:\s*["']?([^\s"']+)/m)?.[1];
        assert.equal(`v${version}`, tag);
        manuals.push({
          version,
          examples: [...content.matchAll(/^```([^\n]*)\n([\s\S]*?)^```/gm)]
            .filter((match) => match[1] !== "markdown")
            .map((match) => [match[1], match[2]])
        });
      }
      assert.ok(manuals[0].examples.length > 0, "Manuals must include executable examples");
      assert.deepEqual(manuals[0], manuals[1], "Both languages must preserve technical examples");
      const installer = await readFile(
        join(directory, `site/src/content/service-installation/${tag}/INSTALL.md`),
        "utf8"
      );
      assert.ok(
        installer.includes(`/install/${tag}/INSTALL.md`) ||
          installer.includes(`/zh/install/${tag}/`)
      );
      assert.ok(installer.includes(`/download/${tag}/kgos-plugin-${tag}.zip`));
    }
    for (const path of [
      "site/src/pages/zh/install.astro",
      "site/src/pages/zh/install.md.ts",
      "site/src/pages/en/install.astro",
      "site/src/pages/en/install.md.ts",
      "site/src/pages/[locale]/install/[version]/index.astro",
      "site/src/pages/[locale]/install/[version].md.ts",
      "site/src/pages/install/[version]/INSTALL.md.ts"
    ]) {
      assert.ok(
        relativeImports(await readFile(join(directory, path), "utf8"), path).includes(
          "site/src/lib/installations"
        ),
        `${path} must use the catalog loader`
      );
    }
    const loader = await readFile(join(directory, "site/src/lib/installations.ts"), "utf8");
    assert.match(loader, /import\.meta\.glob/);
    assert.match(loader, /catalog\.json/);
    const sitePackage = JSON.parse(await readFile(join(directory, "site/package.json"), "utf8"));
    for (const dependency of Object.values({
      ...sitePackage.dependencies,
      ...sitePackage.devDependencies
    })) {
      assert.doesNotMatch(dependency, /^(?:workspace:|file:|link:)/);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release guides render only verified KG OS facts from self-contained public templates", async () => {
  const digest = "a".repeat(64);
  const digestRef = `ghcr.io/byiyli/kgos@sha256:${digest}`;
  const options = { tag: "v0.3.1", digestRef };
  const previousImage = `ghcr.io/byiyli/kgos:v0.3.0@sha256:${"b".repeat(64)}`;
  const nextImage = `ghcr.io/byiyli/kgos:v0.3.1@sha256:${digest}`;
  const body = [
    "---",
    'version: "0.3.0"',
    "---",
    "Latest stable release: KG OS v0.3.0.",
    "https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.0",
    "https://github.com/bYiyLi/kg-releases/releases/download/v0.3.0/kgos-plugin-v0.3.0.zip",
    "https://raw.githubusercontent.com/bYiyLi/kg-releases/v0.3.0/INSTALL.md",
    previousImage,
    "caddy:2.11.7-alpine / model:0.3.0 / historical v0.3.0 Tag",
    "ghcr.io/byiyli/kgos:v0.3.01 / KG OS v0.3.01 / https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.01"
  ].join("\n");
  const expected = [
    "---",
    'version: "0.3.1"',
    "---",
    "Latest stable release: KG OS v0.3.1.",
    "https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.1",
    "https://github.com/bYiyLi/kg-releases/releases/download/v0.3.1/kgos-plugin-v0.3.1.zip",
    "https://kgos.sites.y2l.top/install/v0.3.1/INSTALL.md",
    nextImage,
    "caddy:2.11.7-alpine / model:0.3.0 / historical v0.3.0 Tag",
    "ghcr.io/byiyli/kgos:v0.3.01 / KG OS v0.3.01 / https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.01"
  ].join("\n");
  assert.equal(renderInstallationGuide(body, options), expected);
  const installerTemplate =
    "# KG OS v0.3.0 Plugin\nhttps://kgos.sites.y2l.top/zh/install/v0.3.0/#connect-chatgpt\nhttps://kgos.sites.y2l.top/en/install/\nhttps://kgos.sites.y2l.top/zh/install/v0.3.0.md\nhttps://kgos.sites.y2l.top/install/v0.3.0/INSTALL.md";
  const updatedInstaller = renderInstaller(installerTemplate, options);
  assert.ok(updatedInstaller.includes("/zh/install/v0.3.1/#connect-chatgpt"));
  assert.ok(updatedInstaller.includes("/en/install/v0.3.1/"));
  assert.ok(updatedInstaller.includes("/zh/install/v0.3.1.md"));
  assert.ok(updatedInstaller.includes("/install/v0.3.1/INSTALL.md"));
  assert.doesNotMatch(updatedInstaller, /v0\.3\.1\/v0\.3/);
  assert.throws(() => renderInstaller("# Unknown guide", options), /stable installer/);
  for (const tag of ["v0.3", "v00.3.1", "v0.3.1/../../x", "v0.3.1-rc.1"]) {
    assert.throws(() => renderInstallationGuide(body, { ...options, tag }), /stable KG OS tag/);
  }
  for (const badDigest of [
    "sha256:" + digest,
    digestRef + "x",
    digestRef.replace("kgos@", "other@")
  ]) {
    assert.throws(
      () => renderInstallationGuide(body, { ...options, digestRef: badDigest }),
      /verified KG OS/
    );
  }
  assert.throws(() => renderInstallationGuide("no frontmatter", options), /frontmatter/);
  assert.throws(
    () => renderInstallationGuide(body.replace(previousImage, "missing"), options),
    /pinned KG OS/
  );
  const directory = await mkdtemp(join(tmpdir(), "kg-releases-render-guides-"));
  const output = await mkdtemp(join(tmpdir(), "kg-releases-guide-assets-"));
  try {
    await render({ output: directory, revision, ref: "refs/heads/main" });
    const script = join(directory, "scripts/render-release-installation.mjs");
    assert.equal(
      await readFile(script, "utf8"),
      await readFile(join(root, "scripts/render-release-installation.mjs"), "utf8")
    );
    const sourceDirectory = join(directory, "site/src/content/service-installation");
    const result = JSON.parse(
      execFileSync(
        process.execPath,
        [
          script,
          "--source-directory",
          sourceDirectory,
          "--installer",
          join(directory, "INSTALL.md"),
          "--output",
          output,
          "--tag",
          options.tag,
          "--digest-ref",
          digestRef
        ],
        { encoding: "utf8" }
      )
    );
    assert.equal(result.version, "0.3.1");
    assert.deepEqual(
      result.files.map((file) => file.name),
      ["kgos-install-zh-v0.3.1.md", "kgos-install-en-v0.3.1.md", "kgos-INSTALL-v0.3.1.md"]
    );
    for (const [index, locale] of ["zh", "en"].entries()) {
      const original = await readFile(join(sourceDirectory, `${locale}.md`), "utf8");
      const asset = await readFile(join(output, result.files[index].name), "utf8");
      assert.equal(asset, renderInstallationGuide(original, options));
      assert.equal(result.files[index].sha256, createHash("sha256").update(asset).digest("hex"));
      assert.match(asset, /^version: "0\.3\.1"$/m);
      assert.ok(asset.includes(nextImage));
      assert.doesNotMatch(asset, /ghcr\.io\/byiyli\/kgos:v0\.3\.0@/);
      assert.equal(
        original,
        await readFile(
          join(root, "distribution/site/src/content/service-installation", `${locale}.md`),
          "utf8"
        )
      );
    }
    const installer = await readFile(join(output, "kgos-INSTALL-v0.3.1.md"), "utf8");
    assert.equal(
      installer,
      renderInstaller(await readFile(join(directory, "INSTALL.md"), "utf8"), options)
    );
    assert.match(installer, /^# KG OS v0\.3\.1 /);
    assert.ok(installer.includes("/zh/install/v0.3.1/"));
    assert.ok(installer.includes("/download/v0.3.1/kgos-plugin-v0.3.1.zip"));
    assert.doesNotMatch(installer, /kg-releases\/main\/INSTALL\.md/);
    assert.equal(result.files[2].sha256, createHash("sha256").update(installer).digest("hex"));
    const snapshotPath = join(sourceDirectory, "v0.3.0/zh.md");
    const snapshotHash = createHash("sha256")
      .update(await readFile(snapshotPath))
      .digest("hex");
    const catalogBefore = await readFile(join(sourceDirectory, "catalog.json"), "utf8");
    for (const locale of ["zh", "en"]) {
      const templatePath = join(sourceDirectory, `${locale}.md`);
      const candidate = renderInstallationGuide(await readFile(templatePath, "utf8"), options);
      await writeFile(templatePath, candidate + "\nCandidate-only installation instruction.\n");
    }
    await writeFile(
      join(directory, "INSTALL.md"),
      renderInstaller(await readFile(join(directory, "INSTALL.md"), "utf8"), options) +
        "\nCandidate-only Plugin instruction.\n"
    );
    execFileSync(process.execPath, [
      script,
      "--source-directory",
      sourceDirectory,
      "--installer",
      join(directory, "INSTALL.md"),
      "--output",
      output,
      "--tag",
      options.tag,
      "--digest-ref",
      digestRef
    ]);
    assert.match(
      await readFile(join(output, "kgos-install-zh-v0.3.1.md"), "utf8"),
      /Candidate-only installation instruction/
    );
    assert.match(
      await readFile(join(output, "kgos-INSTALL-v0.3.1.md"), "utf8"),
      /Candidate-only Plugin instruction/
    );
    assert.equal(
      createHash("sha256")
        .update(await readFile(snapshotPath))
        .digest("hex"),
      snapshotHash
    );
    assert.equal(await readFile(join(sourceDirectory, "catalog.json"), "utf8"), catalogBefore);
  } finally {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(output, { recursive: true, force: true })
    ]);
  }
});

test("installation catalog retains older snapshots and rejects unsafe or mismatched archives", async () => {
  const catalog = { latest: "v0.3.0", versions: ["v0.3.0", "v0.2.0"] };
  assert.deepEqual(validateInstallationCatalog(catalog), catalog);
  for (const invalid of [
    null,
    {},
    { ...catalog, extra: true },
    { ...catalog, versions: [] },
    { ...catalog, versions: ["../private", "v0.3.0"] },
    { ...catalog, versions: ["v0.3.0/../../x"] },
    { ...catalog, versions: ["v0.3.0", "v0.3.0"] },
    { ...catalog, versions: ["v00.3.0"] },
    { ...catalog, latest: "v0.4.0" },
    { ...catalog, latest: "v0.2.0" },
    { ...catalog, versions: ["v0.3.0-rc.1"] }
  ])
    assert.throws(() => validateInstallationCatalog(invalid), /Invalid installation catalog/);
  const directory = await mkdtemp(join(tmpdir(), "kg-release-catalog-"));
  try {
    await writeFile(join(directory, "catalog.json"), JSON.stringify(catalog));
    const snapshot = join(root, "distribution/site/src/content/service-installation/v0.3.0");
    const digestRef = `ghcr.io/byiyli/kgos@sha256:${"a".repeat(64)}`;
    for (const tag of catalog.versions) {
      await mkdir(join(directory, tag));
      for (const name of ["zh.md", "en.md", "INSTALL.md"]) {
        const original = await readFile(join(snapshot, name), "utf8");
        const content =
          name === "INSTALL.md"
            ? renderInstaller(original, { tag, digestRef })
            : renderInstallationGuide(original, { tag, digestRef });
        await writeFile(join(directory, tag, name), content);
      }
    }
    const old = await readFile(join(directory, "v0.2.0/zh.md"), "utf8");
    const files = await installationSnapshotFiles(directory);
    assert.equal(files.length, 6);
    assert.ok(files.includes("v0.2.0/INSTALL.md"));
    assert.equal(await readFile(join(directory, "v0.2.0/zh.md"), "utf8"), old);
    await writeFile(join(directory, "v0.3.0/secret.txt"), "must not export");
    await assert.rejects(installationSnapshotFiles(directory), /exactly zh.md/);
    await rm(join(directory, "v0.3.0/secret.txt"));
    await writeFile(join(directory, "unknown.md"), "not in catalog");
    await assert.rejects(
      installationSnapshotFiles(directory),
      /Unexpected installation catalog entry/
    );
    await rm(join(directory, "unknown.md"));
    const original = await readFile(join(directory, "v0.3.0/en.md"), "utf8");
    await writeFile(
      join(directory, "v0.3.0/en.md"),
      original.replace('version: "0.3.0"', 'version: "0.2.0"')
    );
    await assert.rejects(installationSnapshotFiles(directory), /version differs/);
    await writeFile(join(directory, "v0.3.0/en.md"), original);
    await writeFile(join(directory, "v0.3.0/INSTALL.md"), "# KG OS v0.2.0 private Plugin");
    await assert.rejects(
      installationSnapshotFiles(directory),
      /snapshot must bind|Archived installer/
    );
    await rm(join(directory, "v0.3.0/INSTALL.md"));
    await assert.rejects(installationSnapshotFiles(directory), /exactly zh.md/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("installation bundles reject mixed image digests and cross-version resource links", async () => {
  const directory = join(root, "distribution/site/src/content/service-installation/v0.3.0");
  const documents = Object.fromEntries(
    await Promise.all(
      ["zh.md", "en.md", "INSTALL.md"].map(async (name) => [
        name,
        await readFile(join(directory, name), "utf8")
      ])
    )
  );
  const image = validateInstallationBundle(documents, "v0.3.0");
  assert.match(image, /^ghcr\.io\/byiyli\/kgos:v0\.3\.0@sha256:[0-9a-f]{64}$/);
  const replacement = image.replace(/sha256:[0-9a-f]{64}/, `sha256:${"a".repeat(64)}`);
  assert.throws(
    () =>
      validateInstallationBundle(
        { ...documents, "en.md": documents["en.md"].replaceAll(image, replacement) },
        "v0.3.0"
      ),
    /language image digests differ/
  );
  for (const extra of [
    image.replace("v0.3.0", "v0.3.1"),
    replacement,
    "ghcr.io/byiyli/kgos:v0.3.0",
    "ghcr.io/byiyli/kgos:latest",
    "ghcr.io/byiyli/kgos:v0.3.1-rc.1",
    image.replace("v0.3.0", "v0.3.1-rc.1"),
    image + "x"
  ]) {
    assert.throws(
      () =>
        validateInstallationBundle(
          { ...documents, "zh.md": documents["zh.md"] + `\n${extra}\n` },
          "v0.3.0"
        ),
      /version differs/
    );
  }
  assert.equal(
    validateInstallationBundle(
      { ...documents, "zh.md": documents["zh.md"] + "\nghcr.io/byiyli/kgos:vX.Y.Z@sha256:…\n" },
      "v0.3.0"
    ),
    image,
    "The documented user-selected upgrade placeholder is not a concrete image"
  );
  for (const extra of [
    "https://github.com/bYiyLi/kg-releases/releases/download/v0.3.1/kgos-plugin-v0.3.1.zip",
    "https://github.com/bYiyLi/kg-releases/releases/download/v0.3.0/kgos-plugin-v0.3.1.zip",
    "https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.1",
    "https://kgos.sites.y2l.top/en/install/v0.3.1/",
    "https://kgos.sites.y2l.top/zh/install/v0.3.1.md",
    "https://kgos.sites.y2l.top/install/v0.3.1/INSTALL.md",
    "https://raw.githubusercontent.com/bYiyLi/kg-releases/main/INSTALL.md"
  ]) {
    for (const name of Object.keys(documents)) {
      assert.throws(
        () =>
          validateInstallationBundle(
            { ...documents, [name]: documents[name] + `\n${extra}\n` },
            "v0.3.0"
          ),
        /resources differ/
      );
    }
  }
});

test("stable Plugin archive embeds the matching rendered installer and all release manuals", async () => {
  const directory = await mkdtemp(join(tmpdir(), "kg-release-package-"));
  const output = await mkdtemp(join(tmpdir(), "kg-release-package-assets-"));
  try {
    await render({ output: directory, revision, ref: "refs/heads/main" });
    const tag = "v0.3.1";
    const digestRef = `ghcr.io/byiyli/kgos@sha256:${"a".repeat(64)}`;
    execFileSync(process.execPath, [
      join(directory, "scripts/render-release-installation.mjs"),
      "--source-directory",
      join(directory, "site/src/content/service-installation"),
      "--installer",
      join(directory, "INSTALL.md"),
      "--output",
      output,
      "--tag",
      tag,
      "--digest-ref",
      digestRef
    ]);
    const manifest = JSON.parse(
      await readFile(join(directory, "plugins/kgos/plugin.json"), "utf8")
    );
    manifest.version = "0.3.1";
    await writeFile(join(directory, "plugins/kgos/plugin.json"), JSON.stringify(manifest));
    // Simulate an earlier release's exported skills alongside the fixture
    // manifest. The actual tag exporter stamps these without manual edits.
    for (const skill of [
      "kgos-doctor",
      "kgos-knowledge-standards",
      "kgos-ontology-standards",
      "kgos-vlog-standards"
    ]) {
      const path = `plugins/kgos/skills/${skill}/SKILL.md`;
      await writeFile(
        join(directory, path),
        stampSkillVersion(await readFile(join(root, path), "utf8"), manifest.version)
      );
    }
    const workflow = await readFile(join(directory, ".github/workflows/release.yml"), "utf8");
    assert.ok(
      workflow.indexOf("      - name: Render versioned installation") <
        workflow.indexOf("      - name: Package complete")
    );
    assert.ok(
      workflow.indexOf("      - name: Verify anonymous pull") <
        workflow.indexOf("      - name: Render versioned installation")
    );
    const step = workflow
      .split("      - name: Package complete official Plugin and Skills\n")[1]
      .split("      - name:")[0];
    const shell = step
      .split("        run: |\n")[1]
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const result = spawnSync("bash", ["-c", shell], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, TAG: tag, STABLE_RELEASE: "true", RUNNER_TEMP: output }
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.equal(
      execFileSync("unzip", ["-p", join(output, `kgos-plugin-${tag}.zip`), "INSTALL.md"], {
        encoding: "utf8"
      }),
      await readFile(join(output, `kgos-INSTALL-${tag}.md`), "utf8")
    );
    for (const skill of [
      "kgos-doctor",
      "kgos-knowledge-standards",
      "kgos-ontology-standards",
      "kgos-vlog-standards"
    ]) {
      const path = `skills/${skill}/SKILL.md`;
      const archived = execFileSync("unzip", ["-p", join(output, `kgos-plugin-${tag}.zip`), path], {
        encoding: "utf8"
      });
      assert.equal(archived, await readFile(join(directory, "plugins/kgos", path), "utf8"));
      assert.match(archived, /metadata:\n {2}version: "0\.3\.1"\n---/);
    }
    const guideStep = workflow
      .split(
        "      - name: Render versioned installation guides using the verified image digest\n"
      )[1]
      .split("      - name:")[0];
    const guideShell = guideStep
      .split("        run: |\n")[1]
      .split("\n")
      .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
      .join("\n");
    const guides = spawnSync("bash", ["-c", guideShell], {
      cwd: directory,
      encoding: "utf8",
      env: { ...process.env, TAG: tag, DIGEST_REF: digestRef, RUNNER_TEMP: output }
    });
    assert.equal(guides.status, 0, guides.stdout + guides.stderr);
    const checksums = await readFile(join(output, `kgos-install-${tag}.sha256`), "utf8");
    assert.equal(checksums.trim().split("\n").length, 3);
    for (const name of [
      `kgos-install-zh-${tag}.md`,
      `kgos-install-en-${tag}.md`,
      `kgos-INSTALL-${tag}.md`
    ]) {
      assert.ok(
        checksums.includes(
          createHash("sha256")
            .update(await readFile(join(output, name)))
            .digest("hex") +
            "  " +
            name
        )
      );
    }
  } finally {
    await Promise.all([
      rm(directory, { recursive: true, force: true }),
      rm(output, { recursive: true, force: true })
    ]);
  }
});

test("release publishing classifies stable and preview tags and rejects inconsistent recovery", async () => {
  const workflow = await readFile(join(root, "distribution/.github/workflows/release.yml"), "utf8");
  const publish = workflow.split("      - name: Publish public GitHub Release\n")[1];
  assert.ok(publish, "The actual publish step must be exercised");
  const shell = publish
    .split("        run: |\n")[1]
    .split("\n")
    .map((line) => (line.startsWith("          ") ? line.slice(10) : line))
    .join("\n");
  const digestRef = `ghcr.io/byiyli/kgos@sha256:${"a".repeat(64)}`;
  async function scenario({
    stable,
    exists = false,
    isPrerelease = !stable,
    body = `${revision} ${digestRef}`
  }) {
    const directory = await mkdtemp(join(tmpdir(), "kg-release-offline-publish-"));
    const tag = stable ? "v0.3.1" : "v0.3.1-rc.1";
    try {
      await writeFile(
        join(directory, "gh"),
        `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify(args) + '\\n');
if (args[0] !== 'release') process.exit(21);
if (args[1] === 'view') {
  if (process.env.FIXTURE_EXISTS !== 'true') process.exit(1);
  const field = args[args.indexOf('--json') + 1];
  if (field === 'body') process.stdout.write(process.env.FIXTURE_BODY);
  if (field === 'isPrerelease') process.stdout.write(process.env.FIXTURE_PRERELEASE);
} else if (args[1] === 'create') {
  const notes = args[args.indexOf('--notes-file') + 1];
  if (!fs.existsSync(notes)) process.exit(22);
} else if (args[1] === 'upload') {
  for (const file of args.filter((arg) => arg.startsWith(process.env.RUNNER_TEMP + '/'))) {
    if (!fs.existsSync(file)) process.exit(23);
  }
} else process.exit(24);
`,
        { mode: 0o755 }
      );
      await writeFile(join(directory, `kgos-plugin-${tag}.zip`), "fixture");
      if (stable) {
        for (const name of [
          `kgos-install-zh-${tag}.md`,
          `kgos-install-en-${tag}.md`,
          `kgos-INSTALL-${tag}.md`,
          `kgos-install-${tag}.sha256`
        ]) {
          await writeFile(join(directory, name), "fixture");
        }
      }
      const callsPath = join(directory, "calls.jsonl");
      const result = spawnSync("bash", ["-c", shell], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${directory}:${process.env.PATH}`,
          RUNNER_TEMP: directory,
          TAG: tag,
          STABLE_RELEASE: String(stable),
          REVISION: revision,
          DIGEST_REF: digestRef,
          IMAGE: `ghcr.io/byiyli/kgos:${tag}`,
          GITHUB_REPOSITORY: "offline/fixture",
          GITHUB_SHA: revision,
          FIXTURE_CALLS: callsPath,
          FIXTURE_EXISTS: String(exists),
          FIXTURE_PRERELEASE: String(isPrerelease),
          FIXTURE_BODY: body
        }
      });
      const calls = (await readFile(callsPath, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      return { ...result, calls };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
  for (const stable of [true, false]) {
    const created = await scenario({ stable });
    assert.equal(created.status, 0, created.stdout + created.stderr);
    const create = created.calls.find((args) => args[1] === "create");
    assert.ok(create);
    assert.equal(create.includes("--prerelease"), !stable);
    assert.equal(create.includes("--latest=false"), !stable);
    assert.equal(created.calls.filter((args) => args[1] === "upload").length, stable ? 2 : 1);
    const resumed = await scenario({ stable, exists: true });
    assert.equal(resumed.status, 0, resumed.stdout + resumed.stderr);
    assert.ok(!resumed.calls.some((args) => args[1] === "create"));
    const mismatch = await scenario({ stable, exists: true, isPrerelease: stable });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stdout, /classification differs/);
    assert.ok(!mismatch.calls.some((args) => ["create", "edit", "upload"].includes(args[1])));
  }
  for (const body of [`wrong-source ${digestRef}`, `${revision} wrong-digest`]) {
    const mismatch = await scenario({ stable: true, exists: true, body });
    assert.notEqual(mismatch.status, 0);
    assert.match(mismatch.stdout, /verified source or digest/);
    assert.ok(!mismatch.calls.some((args) => ["create", "edit", "upload"].includes(args[1])));
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
  const catalog = JSON.parse(
    await readFile(
      join(root, "distribution/site/src/content/service-installation/catalog.json"),
      "utf8"
    )
  );
  for (const document of [english, chinese]) {
    assert.ok(document.includes(`https://kgos.sites.y2l.top/install/${catalog.latest}/INSTALL.md`));
    assert.doesNotMatch(
      document,
      /raw\.githubusercontent\.com\/bYiyLi\/kg-releases\/main\/INSTALL\.md/
    );
  }
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
    await readdir(join(root, "plugins/kgos/skills/kgos-doctor/assets")),
    ["global-ai-guidance.md"],
    "Only the current guidance source is packaged; Git tags preserve historical versions"
  );
  const guidance = await readFile(
    join(root, "plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md"),
    "utf8"
  );
  const block = /\[KGOS_GUIDANCE_BEGIN\][\s\S]*?\[KGOS_GUIDANCE_END\]/g;
  assert.deepEqual(
    [...installer.matchAll(block)].map((match) => match[0]),
    [guidance.match(block)[0]]
  );
  const rendered = renderInstaller(installer, {
    tag: "v0.3.5",
    digestRef: `ghcr.io/byiyli/kgos@sha256:${"a".repeat(64)}`
  });
  assert.deepEqual(
    [...rendered.matchAll(block)].map((match) => match[0]),
    [guidance.match(block)[0]]
  );
  for (const locale of ["zh", "en"]) {
    const template = await readFile(
      join(root, `distribution/site/src/content/service-installation/${locale}.md`),
      "utf8"
    );
    assert.match(template, /Global AI Guidance/);
  }
});

test("published installer snapshots retain their original guidance baseline", async () => {
  const directory = join(root, "distribution/site/src/content/service-installation");
  const catalog = JSON.parse(await readFile(join(directory, "catalog.json"), "utf8"));
  // Historical release artifacts are immutable; current Doctor carries only one guidance asset.
  const guidance = await readFile(join(directory, "v0.3.0/INSTALL.md"), "utf8");
  const block = /\[KGOS_GUIDANCE_BEGIN:v1\][\s\S]*?\[KGOS_GUIDANCE_END:v1\]/g;
  for (const tag of ["v0.3.0", "v0.3.1", "v0.3.2", "v0.3.3"]) {
    assert.ok(catalog.versions.includes(tag));
    const installer = await readFile(join(directory, tag, "INSTALL.md"), "utf8");
    assert.deepEqual(
      [...installer.matchAll(block)].map((match) => match[0]),
      [guidance.match(block)[0]]
    );
    assert.doesNotMatch(installer, /\[KGOS_GUIDANCE_BEGIN\]/);
  }
});

// The candidate guidance may evolve, but the v0.3.4 public installer is frozen.
test("v0.3.4 installer retains its shipped guidance", async () => {
  const installer = await readFile(
    join(root, "distribution/site/src/content/service-installation/v0.3.4/INSTALL.md"),
    "utf8"
  );
  const blocks = installer.match(/\[KGOS_GUIDANCE_BEGIN\][\s\S]*?\[KGOS_GUIDANCE_END\]/g);
  assert.equal(blocks?.length, 1);
  const { createHash } = await import("node:crypto");
  assert.equal(
    createHash("sha256")
      .update(blocks[0] + "\n")
      .digest("hex"),
    "d4a594f52128ff6b11cbf8f7649f84c3b99aac0990e210d6895ab85d55c29876"
  );
});
