import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { lstat, mkdir, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { installationSnapshotFiles } from "./render-release-installation.mjs";

const sourceRoot = fileURLToPath(new URL("../", import.meta.url));
const publicRepository = "bYiyLi/kg-releases";
const sourceRepository = "bYiyLi/kg-os";
const generatedFiles = [
  ".github/workflows/ci.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/release.yml",
  ".gitignore",
  "README.md",
  "README.zh-CN.md",
  "INSTALL.md",
  "LICENSE",
  "COMMERCIAL-LICENSE.md",
  "scripts/render-release-installation.mjs",
  "plugins/kgos/plugin.json",
  "plugins/kgos/.app.json.example"
];
const officialSkills = [
  "kgos-ontology-standards",
  "kgos-knowledge-standards",
  "kgos-vlog-standards",
  "kgos-doctor"
];
const siteFiles = [
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
];
const rootOwnedFiles = new Set([
  "LICENSE",
  "COMMERCIAL-LICENSE.md",
  "scripts/render-release-installation.mjs",
  "plugins/kgos/plugin.json",
  "plugins/kgos/.app.json.example"
]);

function git(directory, ...args) {
  return execFileSync("git", ["-C", directory, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  }).trim();
}

function sourceRefKind(ref) {
  if (ref === "refs/heads/main") {
    return "main";
  }
  if (/^refs\/tags\/v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(ref)) {
    return "tag";
  }
  throw new Error("Only private main and version-tag pushes can generate kg-releases");
}

function inside(directory, parent) {
  const path = relative(parent, directory);
  return !path || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function trackedFiles(directory) {
  try {
    return execFileSync("git", ["-C", directory, "ls-files", "-z"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    })
      .split("\0")
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function collectFiles(root, prefix = "") {
  const entries = await readdir(join(root, prefix), { withFileTypes: true });
  const paths = [];
  for (const entry of entries) {
    if (prefix === "" && entry.name === ".git") {
      continue;
    }
    if (
      prefix === "distribution/site" &&
      entry.isDirectory() &&
      ["node_modules", "dist", ".astro"].includes(entry.name)
    ) {
      continue;
    }
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      paths.push(...(await collectFiles(root, path)));
    } else if (entry.isFile()) {
      paths.push(path);
    } else {
      throw new Error(`Unsupported public output entry: ${path}`);
    }
  }
  return paths;
}

async function publicFiles() {
  const paths = [...generatedFiles];
  for (const skill of officialSkills) {
    const directory = `plugins/kgos/skills/${skill}`;
    // The author's model tests are not assistant-facing Skill resources.
    const files = (await collectFiles(sourceRoot, directory)).filter(
      (file) => !file.startsWith(`${directory}/tests/`)
    );
    if (!files.includes(`${directory}/SKILL.md`)) {
      throw new Error(`Missing official Skill entrypoint: ${directory}`);
    }
    for (const file of files) {
      if (!file.endsWith(".md")) {
        throw new Error(`Unexpected file in official Skill resources: ${file}`);
      }
    }
    paths.push(...files);
  }
  const actualSiteFiles = (await collectFiles(sourceRoot, "distribution/site")).map((file) =>
    file.slice("distribution/".length)
  );
  const manualDirectory = "site/src/content/service-installation";
  const versionedFiles = (
    await installationSnapshotFiles(join(sourceRoot, "distribution", manualDirectory))
  ).map((file) => `${manualDirectory}/${file}`);
  const websiteFiles = [...siteFiles, ...versionedFiles];
  const expectedSiteFiles = new Set(websiteFiles);
  for (const file of actualSiteFiles) {
    if (!expectedSiteFiles.has(file)) {
      throw new Error(`Unexpected public website source file: ${file}`);
    }
  }
  for (const file of websiteFiles) {
    if (!actualSiteFiles.includes(file)) {
      throw new Error(`Missing public website source file: ${file}`);
    }
  }
  paths.push(...websiteFiles);
  return paths;
}

function sourceFile(path) {
  if (path === "INSTALL.md") {
    return "plugins/kgos/INSTALL.md";
  }
  if (rootOwnedFiles.has(path) || path.startsWith("plugins/kgos/skills/")) {
    return path;
  }
  return `distribution/${path}`;
}

export async function render({ output, ref, revision }) {
  const kind = sourceRefKind(ref);
  if (!/^[0-9a-f]{40}$/.test(revision)) {
    throw new Error("A full lowercase source revision is required");
  }
  if (git(sourceRoot, "rev-parse", "HEAD") !== revision) {
    throw new Error("Source revision does not equal the checked-out commit");
  }
  if (kind === "tag" && git(sourceRoot, "rev-parse", `${ref}^{commit}`) !== revision) {
    throw new Error("The source release tag does not point to this commit");
  }

  const target = resolve(output);
  if (inside(target, sourceRoot)) {
    throw new Error("Public output must not be inside the private source repository");
  }
  await mkdir(target, { recursive: true });
  const canonicalTarget = await realpath(target);
  if (inside(canonicalTarget, sourceRoot)) {
    throw new Error("Public output resolves inside the private source repository");
  }
  const targetGit = join(canonicalTarget, ".git");
  try {
    const gitMeta = await stat(targetGit);
    if (!gitMeta.isDirectory() && !gitMeta.isFile()) {
      throw new Error("Unsupported public Git metadata");
    }
    if (resolve(git(canonicalTarget, "rev-parse", "--show-toplevel")) !== canonicalTarget) {
      throw new Error("Public output must be its own Git repository");
    }
    try {
      const remote = git(canonicalTarget, "remote", "get-url", "origin");
      if (
        !/^((https:\/\/github\.com\/)|(git@github\.com:))bYiyLi\/kg-releases(?:\.git)?$/.test(
          remote
        )
      ) {
        throw new Error("Refusing to generate into a different Git repository");
      }
    } catch (error) {
      if (!String(error.message).includes("No such remote")) {
        throw error;
      }
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const files = await publicFiles();
  const expected = new Set([...files, "source.json"]);
  if (expected.size !== files.length + 1) {
    throw new Error("Duplicate public distribution path");
  }
  const packageData = JSON.parse(await readFile(join(sourceRoot, "package.json"), "utf8"));
  const pluginData = JSON.parse(
    await readFile(join(sourceRoot, "plugins/kgos/plugin.json"), "utf8")
  );
  if (pluginData.version !== packageData.version) {
    throw new Error("Official Plugin version must match the KG OS product version");
  }
  const tracked = new Set(trackedFiles(canonicalTarget));
  const existing = await collectFiles(canonicalTarget);
  for (const path of existing) {
    if (!expected.has(path) && !tracked.has(path)) {
      throw new Error(`Refusing to overwrite unmanaged public file: ${path}`);
    }
  }
  for (const path of tracked) {
    if (!expected.has(path)) {
      await rm(join(canonicalTarget, path));
    }
  }
  for (const path of files) {
    const template = join(sourceRoot, sourceFile(path));
    const info = await lstat(template);
    if (!info.isFile() || info.size > 1024 * 1024) {
      throw new Error(`Invalid public distribution source: ${path}`);
    }
    const content = await readFile(template);
    const dest = join(canonicalTarget, path);
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, content);
  }
  const manifest = {
    schema: 1,
    repository: sourceRepository,
    revision,
    ref
  };
  await writeFile(join(canonicalTarget, "source.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return {
    repository: publicRepository,
    source: revision,
    kind,
    files: [...expected].sort()
  };
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--output", "--ref", "--revision"].includes(args[i]) || !args[i + 1]) {
      throw new Error(
        "Usage: render-kg-releases.mjs --output <directory> --ref <git-ref> --revision <sha>"
      );
    }
    options[args[i].slice(2)] = args[i + 1];
  }
  if (!options.output || !options.ref || !options.revision || Object.keys(options).length !== 3) {
    throw new Error("Required: --output, --ref, --revision");
  }
  return options;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  render(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(`Rendered kg-releases for ${result.kind} ${result.source}`))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
