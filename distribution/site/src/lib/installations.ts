import type { MarkdownInstance } from "astro";
import catalog from "../content/service-installation/catalog.json";
import type { Locale } from "./content";

interface InstallationFrontmatter {
  title: string;
  description: string;
  version: string;
}

const locales: Locale[] = ["zh", "en"];
const stableTag = /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
const documents = import.meta.glob<MarkdownInstance<InstallationFrontmatter>>(
  "../content/service-installation/v*/{zh,en}.md",
  { eager: true }
);
const rawDocuments = import.meta.glob<string>("../content/service-installation/v*/*.md", {
  eager: true,
  query: "?raw",
  import: "default"
});

if (
  Object.keys(catalog).sort().join(",") !== "latest,versions" ||
  !Array.isArray(catalog.versions) ||
  catalog.versions.length === 0 ||
  catalog.versions.some((version) => typeof version !== "string" || !stableTag.test(version)) ||
  new Set(catalog.versions).size !== catalog.versions.length ||
  !catalog.versions.includes(catalog.latest)
) {
  throw new Error(
    "Invalid installation catalog: provide unique release tags and an explicit latest version."
  );
}
const latest = catalog.latest.slice(1).split(".").map(BigInt);
for (const version of catalog.versions) {
  const candidate = version.slice(1).split(".").map(BigInt);
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] < latest[index]) break;
    if (candidate[index] > latest[index]) {
      throw new Error("Invalid installation catalog: latest must be the highest stable version.");
    }
  }
}

export const installationVersions: readonly string[] = catalog.versions;
export const latestInstallationVersion: string = catalog.latest;

function documentPath(version: string, name: string) {
  if (!installationVersions.includes(version)) {
    throw new Error(`Unknown installation version: ${version}`);
  }
  return `../content/service-installation/${version}/${name}.md`;
}

function validateResourceLinks(raw: string, version: string) {
  const links = [
    ...raw.matchAll(
      /https:\/\/github\.com\/bYiyLi\/kg-releases\/releases\/download\/(v[^/\s]+)\/kgos-plugin-(v[^/\s]+)\.zip/g
    ),
    ...raw.matchAll(
      /https:\/\/github\.com\/bYiyLi\/kg-releases\/releases\/tag\/(v[0-9]+\.[0-9]+\.[0-9]+)(?![\w.-])/g
    ),
    ...raw.matchAll(
      /https:\/\/kgos\.sites\.y2l\.top\/(?:zh|en)\/install\/(v[0-9]+\.[0-9]+\.[0-9]+)(?=\/|\.md)/g
    ),
    ...raw.matchAll(/https:\/\/kgos\.sites\.y2l\.top\/install\/(v[^/\s]+)\/INSTALL\.md/g)
  ];
  if (
    !raw.includes(
      `https://github.com/bYiyLi/kg-releases/releases/download/${version}/kgos-plugin-${version}.zip`
    ) ||
    links.some((link) => link[1] !== version || (link[2] && link[2] !== version)) ||
    /raw\.githubusercontent\.com\/bYiyLi\/kg-releases\/main\/INSTALL\.md/.test(raw)
  ) {
    throw new Error(`Installation resources differ from their version: ${version}`);
  }
}

export function getInstallation(locale: Locale, version: string) {
  if (!locales.includes(locale)) throw new Error(`Unknown installation language: ${locale}`);
  const path = documentPath(version, locale);
  const document = documents[path];
  const raw = rawDocuments[path];
  if (!document || !raw) throw new Error(`Missing installation manual: ${version}/${locale}.md`);
  validateResourceLinks(raw, version);
  const { frontmatter } = document;
  const images = [
    ...raw.matchAll(/ghcr\.io\/byiyli\/kgos:([\w][\w.-]*)(?:@sha256:[\w.-]+)?/g)
  ].filter((image) => image[1] !== "vX.Y.Z");
  if (
    frontmatter.version !== version.slice(1) ||
    !raw.includes(`https://kgos.sites.y2l.top/install/${version}/INSTALL.md`) ||
    new Set(images.map((image) => image[0])).size !== 1 ||
    images.some((image) => image[1] !== version || !/@sha256:[0-9a-f]{64}$/.test(image[0]))
  ) {
    throw new Error(`Installation version mismatch: ${version}/${locale}.md`);
  }
  if (!frontmatter.title?.trim() || !frontmatter.description?.trim()) {
    throw new Error(`Missing installation metadata: ${version}/${locale}.md`);
  }
  return { ...document, raw, locale, version };
}

export function getInstallationInstructions(version: string) {
  const path = documentPath(version, "INSTALL");
  const raw = rawDocuments[path];
  if (!raw?.trim()) throw new Error(`Missing AI installation instructions: ${version}/INSTALL.md`);
  validateResourceLinks(raw, version);
  if (
    raw.split("\n")[0].match(/^# KG OS (v[0-9]+\.[0-9]+\.[0-9]+)(?: |$)/)?.[1] !== version ||
    !locales.every((locale) =>
      raw.includes(`https://kgos.sites.y2l.top/${locale}/install/${version}/`)
    )
  ) {
    throw new Error(`Archived installer must bind its versioned guide and Plugin: ${version}`);
  }
  return raw;
}

// Validate the complete release bundle even when only the latest alias is rendered.
for (const version of installationVersions) {
  const images = new Set(
    locales.map(
      (locale) =>
        getInstallation(locale, version).raw.match(
          /ghcr\.io\/byiyli\/kgos:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}/
        )![0]
    )
  );
  if (images.size !== 1) throw new Error(`Installation language image digests differ: ${version}`);
  getInstallationInstructions(version);
}

export function getInstallationPaths() {
  return installationVersions.flatMap((version) =>
    locales.map((locale) => ({
      params: { locale, version },
      props: { guide: getInstallation(locale, version) }
    }))
  );
}

export type InstallationGuideDocument = ReturnType<typeof getInstallation>;
