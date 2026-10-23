import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, mkdir, writeFile, readdir, lstat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const stableVersion = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const stableTag = new RegExp(`^v${stableVersion}$`);
const imageRepository = "ghcr.io/byiyli/kgos";
const website = "https://kgos.sites.y2l.top";
const releases = "https://github.com/bYiyLi/kg-releases/releases";

export function validateInstallationCatalog(catalog) {
  if (
    !catalog ||
    typeof catalog !== "object" ||
    Array.isArray(catalog) ||
    Object.keys(catalog).sort().join(",") !== "latest,versions" ||
    !Array.isArray(catalog.versions) ||
    !catalog.versions.length ||
    !catalog.versions.every((version) => typeof version === "string" && stableTag.test(version)) ||
    new Set(catalog.versions).size !== catalog.versions.length ||
    !catalog.versions.includes(catalog.latest)
  ) {
    throw new Error(
      "Invalid installation catalog: unique stable versions and a listed latest are required"
    );
  }
  const latest = catalog.latest.slice(1).split(".").map(BigInt);
  for (const tag of catalog.versions) {
    const candidate = tag.slice(1).split(".").map(BigInt);
    for (let index = 0; index < 3; index += 1) {
      if (candidate[index] < latest[index]) break;
      if (candidate[index] > latest[index]) {
        throw new Error("Invalid installation catalog: latest must be the highest stable version");
      }
    }
  }
  return catalog;
}

async function readInstallationCatalog(sourceDirectory) {
  return validateInstallationCatalog(
    JSON.parse(await readFile(join(sourceDirectory, "catalog.json"), "utf8"))
  );
}

export function validateInstallationBundle(documents, tag) {
  if (!stableTag.test(tag)) throw new Error("A stable installation bundle tag is required");
  const plugin = `${releases}/download/${tag}/kgos-plugin-${tag}.zip`;
  const images = new Set();
  for (const name of ["zh.md", "en.md", "INSTALL.md"]) {
    const content = documents[name];
    if (typeof content !== "string" || !content.includes(plugin)) {
      throw new Error(`Installation snapshot must bind its released Plugin: ${tag}/${name}`);
    }
    const resources = [
      ...content.matchAll(
        /https:\/\/github\.com\/bYiyLi\/kg-releases\/releases\/download\/(v[^/\s]+)\/kgos-plugin-(v[^/\s]+)\.zip/g
      ),
      ...content.matchAll(
        /https:\/\/github\.com\/bYiyLi\/kg-releases\/releases\/tag\/(v[0-9]+\.[0-9]+\.[0-9]+)(?![\w.-])/g
      ),
      ...content.matchAll(
        /https:\/\/kgos\.sites\.y2l\.top\/(?:zh|en)\/install\/(v[0-9]+\.[0-9]+\.[0-9]+)(?=\/|\.md)/g
      ),
      ...content.matchAll(/https:\/\/kgos\.sites\.y2l\.top\/install\/(v[^/\s]+)\/INSTALL\.md/g)
    ];
    if (
      resources.some((match) => match[1] !== tag || (match[2] && match[2] !== tag)) ||
      /raw\.githubusercontent\.com\/bYiyLi\/kg-releases\/main\/INSTALL\.md/.test(content)
    ) {
      throw new Error(`Installation resources differ from their version: ${tag}/${name}`);
    }
    if (name === "INSTALL.md") {
      if (
        content.split("\n")[0].match(/^# KG OS (v[0-9]+\.[0-9]+\.[0-9]+)(?: |$)/)?.[1] !== tag ||
        !["zh", "en"].every((locale) => content.includes(`${website}/${locale}/install/${tag}/`))
      ) {
        throw new Error(`Archived installer must bind its versioned guides: ${tag}`);
      }
      continue;
    }
    const references = [
      ...content.matchAll(/ghcr\.io\/byiyli\/kgos:([\w][\w.-]*)(?:@sha256:[\w.-]+)?/g)
    ].filter((match) => match[1] !== "vX.Y.Z");
    const pinned = new Set(references.map((match) => match[0]));
    if (
      `v${installationTemplateVersion(content)}` !== tag ||
      !content.includes(`${website}/install/${tag}/INSTALL.md`) ||
      pinned.size !== 1 ||
      references.some((match) => match[1] !== tag || !/@sha256:[0-9a-f]{64}$/.test(match[0]))
    ) {
      throw new Error(
        `Installation snapshot version differs from its directory or image: ${tag}/${name}`
      );
    }
    images.add([...pinned][0]);
  }
  if (images.size !== 1) {
    throw new Error(`Installation language image digests differ: ${tag}`);
  }
  return [...images][0];
}

export async function installationSnapshotFiles(sourceDirectory) {
  const catalog = await readInstallationCatalog(sourceDirectory);
  const expected = new Set(["catalog.json", "zh.md", "en.md", ...catalog.versions]);
  for (const entry of await readdir(sourceDirectory)) {
    if (!expected.has(entry)) throw new Error(`Unexpected installation catalog entry: ${entry}`);
  }
  const files = [];
  for (const tag of catalog.versions) {
    const directory = join(sourceDirectory, tag);
    const entries = (await readdir(directory)).sort();
    if (entries.join(",") !== "INSTALL.md,en.md,zh.md") {
      throw new Error(
        `Installation snapshot must contain exactly zh.md, en.md and INSTALL.md: ${tag}`
      );
    }
    const documents = {};
    for (const name of entries) {
      const path = join(directory, name);
      if (!(await lstat(path)).isFile())
        throw new Error(`Installation snapshot must be a regular file: ${path}`);
      documents[name] = await readFile(path, "utf8");
      files.push(`${tag}/${name}`);
    }
    validateInstallationBundle(documents, tag);
  }
  return files;
}

function releaseFacts(tag, digestRef) {
  if (!stableTag.test(tag)) throw new Error("A stable KG OS tag in vX.Y.Z form is required");
  if (!/^ghcr\.io\/byiyli\/kgos@sha256:[0-9a-f]{64}$/.test(digestRef)) {
    throw new Error("A verified KG OS sha256 digest reference is required");
  }
  return { version: tag.slice(1), image: `${imageRepository}:${tag}@${digestRef.split("@")[1]}` };
}

function installationTemplateVersion(content) {
  const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  const version = frontmatter?.[1].match(
    new RegExp(`^version: *["']?(${stableVersion})["']? *$`, "m")
  )?.[1];
  if (!version) throw new Error("Installation template has no stable version frontmatter");
  return version;
}

function versionedLinks(content, previous, tag) {
  const escaped = previous.replaceAll(".", "\\.");
  let rendered = content.replace(
    new RegExp(`https://github\\.com/bYiyLi/kg-releases/releases/tag/v${escaped}(?![\\w.-])`, "g"),
    `${releases}/tag/${tag}`
  );
  rendered = rendered.replaceAll(
    `${releases}/download/v${previous}/kgos-plugin-v${previous}.zip`,
    `${releases}/download/${tag}/kgos-plugin-${tag}.zip`
  );
  // INSTALL is a rendered release asset, rather than the pre-render source at the Git tag.
  for (const url of [
    `https://raw.githubusercontent.com/bYiyLi/kg-releases/v${previous}/INSTALL.md`,
    `${releases}/download/v${previous}/kgos-INSTALL-v${previous}.md`,
    `${website}/install/v${previous}/INSTALL.md`
  ])
    rendered = rendered.replaceAll(url, `${website}/install/${tag}/INSTALL.md`);
  for (const locale of ["zh", "en"]) {
    rendered = rendered.replaceAll(
      `${website}/${locale}/install/v${previous}/`,
      `${website}/${locale}/install/${tag}/`
    );
    rendered = rendered.replaceAll(
      `${website}/${locale}/install/v${previous}.md`,
      `${website}/${locale}/install/${tag}.md`
    );
    rendered = rendered.replace(
      new RegExp(`https://kgos\\.sites\\.y2l\\.top/${locale}/install/(?!v[0-9])`, "g"),
      `${website}/${locale}/install/${tag}/`
    );
  }
  return rendered.replaceAll(
    "https://raw.githubusercontent.com/bYiyLi/kg-releases/main/INSTALL.md",
    `${website}/install/${tag}/INSTALL.md`
  );
}

export function renderInstallationGuide(content, { tag, digestRef }) {
  const { version, image } = releaseFacts(tag, digestRef);
  const previous = installationTemplateVersion(content);
  const escaped = previous.replaceAll(".", "\\.");
  const imagePattern = new RegExp(
    `ghcr\\.io/byiyli/kgos:v${escaped}@sha256:[0-9a-f]{64}(?![0-9a-f])`,
    "g"
  );
  if (!imagePattern.test(content))
    throw new Error("Installation template has no pinned KG OS image");
  imagePattern.lastIndex = 0;
  let rendered = content.replace(
    new RegExp(`^version: *["']?${escaped}["']? *$`, "m"),
    `version: "${version}"`
  );
  rendered = rendered.replace(imagePattern, image);
  rendered = rendered.replace(
    new RegExp(`KG OS v${escaped}(?![\\w-]|\\.\\d)`, "g"),
    `KG OS ${tag}`
  );
  return versionedLinks(rendered, previous, tag);
}

export function renderInstaller(content, { tag, digestRef }) {
  releaseFacts(tag, digestRef);
  const previousTag = content
    .split("\n")[0]
    .match(/^# KG OS (v[0-9]+\.[0-9]+\.[0-9]+)(?: |$)/)?.[1];
  if (!stableTag.test(previousTag))
    throw new Error("A stable installer template version is required");
  const previous = previousTag.slice(1);
  const escaped = previous.replaceAll(".", "\\.");
  return versionedLinks(content, previous, tag).replace(
    new RegExp(`KG OS v${escaped}(?![\\w-]|\\.\\d)`, "g"),
    `KG OS ${tag}`
  );
}

async function renderReleaseInstallation({ sourceDirectory, installer, output, tag, digestRef }) {
  releaseFacts(tag, digestRef);
  await installationSnapshotFiles(sourceDirectory);
  const manuals = await Promise.all(
    ["zh", "en"].map(async (locale) => {
      const content = await readFile(join(sourceDirectory, `${locale}.md`), "utf8");
      return {
        name: `kgos-install-${locale}-${tag}.md`,
        content: renderInstallationGuide(content, { tag, digestRef })
      };
    })
  );
  manuals.push({
    name: `kgos-INSTALL-${tag}.md`,
    content: renderInstaller(await readFile(installer, "utf8"), { tag, digestRef })
  });
  validateInstallationBundle(
    Object.fromEntries(
      manuals.map((manual, index) => [["zh.md", "en.md", "INSTALL.md"][index], manual.content])
    ),
    tag
  );
  await mkdir(output, { recursive: true });
  const files = [];
  for (const manual of manuals) {
    await writeFile(join(output, manual.name), manual.content);
    files.push({
      name: manual.name,
      sha256: createHash("sha256").update(manual.content).digest("hex")
    });
  }
  return { version: tag.slice(1), files };
}

function parseArgs(args) {
  const options = {};
  const names = {
    "--source-directory": "sourceDirectory",
    "--installer": "installer",
    "--output": "output",
    "--tag": "tag",
    "--digest-ref": "digestRef"
  };
  for (let index = 0; index < args.length; index += 2) {
    const name = names[args[index]];
    if (!name || !args[index + 1] || options[name]) {
      throw new Error(
        "Required once each: --source-directory, --installer, --output, --tag, --digest-ref"
      );
    }
    options[name] = args[index + 1];
  }
  if (Object.keys(options).length !== 5)
    throw new Error("Required: --source-directory, --installer, --output, --tag, --digest-ref");
  return options;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  renderReleaseInstallation(parseArgs(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
