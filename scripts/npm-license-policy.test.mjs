import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ALLOWED_LICENSES,
  checkProductionLicenses,
  isLicenseAllowed
} from "./npm-license-policy.mjs";

const directories = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "kgos-npm-license-test-"));
  directories.push(root);
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ name: "workspace", version: "1.0.0", private: true })
  );
  const manifests = [
    { name: "public", version: "1.0.0", license: "MIT" },
    { name: "private", version: "2.0.0", license: "UNLICENSED", private: true },
    { name: "@kgos/sdk", version: "0.2.1", license: "AGPL-3.0-only" },
    { name: "peer", version: "3.0.0", license: "ISC" },
    { name: "optional", version: "4.0.0", license: "BSD-3-Clause" }
  ];
  const paths = {};
  const report = {};
  for (const [index, manifest] of manifests.entries()) {
    const path = join(root, String(index));
    await mkdir(path);
    await writeFile(join(path, "package.json"), JSON.stringify(manifest));
    paths[manifest.name] = path;
    (report[manifest.license] ??= []).push({
      name: manifest.name,
      license: manifest.license,
      versions: [manifest.version],
      paths: [path]
    });
  }
  const workspaces = [
    {
      path: root,
      dependencies: {
        linked: { path: paths["@kgos/sdk"] },
        private: {
          path: paths.private,
          dependencies: { peer: { path: paths.peer } }
        }
      },
      optionalDependencies: { optional: { path: paths.optional } },
      unsavedDependencies: { developmentOnly: { path: join(root, "absent-development-only") } }
    },
    { path: paths["@kgos/sdk"], dependencies: { public: { path: paths.public } } }
  ];
  return { root, paths, report, workspaces };
}

describe("npm production license gate", () => {
  it("preserves every previously reviewed identifier and explicit exception", () => {
    expect(ALLOWED_LICENSES.every(isLicenseAllowed)).toBe(true);
  });

  it("requires every AND term and accepts an allowed OR branch", () => {
    expect(isLicenseAllowed("MIT AND GPL-3.0-only")).toBe(false);
    expect(isLicenseAllowed("MIT AND (ISC OR GPL-3.0-only)")).toBe(true);
    expect(isLicenseAllowed("GPL-3.0-only OR MIT")).toBe(true);
    expect(isLicenseAllowed("GPL-3.0-only AND (MIT OR ISC)")).toBe(false);
    expect(isLicenseAllowed("MIT WITH Classpath-exception-2.0")).toBe(false);
  });

  it.each([
    "Unknown",
    "",
    "UNLICENSED",
    "NOASSERTION",
    "not MIT",
    "MIT AND",
    "MIT+",
    "MPL-2.0+",
    null
  ])("rejects unknown or malformed license %j", (license) => {
    expect(isLicenseAllowed(license)).toBe(false);
  });

  it("includes linked workspace, private child, optional and resolved peer dependencies", async () => {
    const { report, workspaces } = await fixture();
    expect(await checkProductionLicenses(report, workspaces)).toEqual({
      "BSD-3-Clause": 1,
      ISC: 1,
      MIT: 1
    });
  });

  it("rejects an omitted production package even when the scan has allowed results", async () => {
    const { report, workspaces } = await fixture();
    delete report.MIT;
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/missed.*dependency/);
  });

  it("checks each peer instance even when pnpm reports one path per name and version", async () => {
    const { root, report, workspaces } = await fixture();
    const second = join(root, "second-peer-instance");
    await mkdir(second);
    await writeFile(
      join(second, "package.json"),
      JSON.stringify({ name: "public", version: "1.0.0", license: "MIT" })
    );
    workspaces[0].dependencies.anotherPeer = { path: second, version: "1.0.0" };
    expect(await checkProductionLicenses(report, workspaces)).toEqual({
      "BSD-3-Clause": 1,
      ISC: 1,
      MIT: 1
    });
    await writeFile(
      join(second, "package.json"),
      JSON.stringify({ name: "public", version: "1.0.0", license: "GPL-3.0-only" })
    );
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/missed.*dependency/);
    await writeFile(
      join(second, "package.json"),
      JSON.stringify({ name: "public", version: "1.0.0", license: "MIT", private: true })
    );
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/missed.*dependency/);
  });

  it("rejects an unapproved installed dependency and changed license metadata", async () => {
    const { paths, report, workspaces } = await fixture();
    await writeFile(
      join(paths.public, "package.json"),
      JSON.stringify({ name: "public", version: "1.0.0", license: "GPL-3.0-only" })
    );
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/installed license/);
    report["GPL-3.0-only"] = [{ ...report.MIT[0], license: "GPL-3.0-only" }];
    delete report.MIT;
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/unapproved license/);
  });

  it("rejects missing manifests and mismatched installed name or version", async () => {
    const { paths, report, workspaces } = await fixture();
    report.MIT[0].versions = ["9.0.0"];
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/installed package/);
    report.MIT[0].versions = ["1.0.0"];
    report.MIT[0].name = "different";
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/installed package/);
    report.MIT[0].name = "public";
    await rm(join(paths.public, "package.json"));
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/ENOENT/);
  });

  it("requires parallel version/path pairs rather than matching any listed version", async () => {
    const { paths, report, workspaces } = await fixture();
    report.MIT[0].versions = ["9.0.0", "1.0.0"];
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/Malformed/);
    report.MIT[0].paths = [paths.public, paths.public];
    await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/installed package/);
  });

  it.each([null, [], { MIT: [] }, { MIT: [{}] }, { MIT: "not an array" }])(
    "rejects malformed license report %j",
    async (report) => {
      const { workspaces } = await fixture();
      await expect(checkProductionLicenses(report, workspaces)).rejects.toThrow(/Malformed/);
    }
  );

  it("rejects empty scans of a workspace with production dependencies", async () => {
    const { workspaces } = await fixture();
    await expect(checkProductionLicenses({}, workspaces)).rejects.toThrow(/missed.*dependency/);
    await expect(checkProductionLicenses({}, [])).rejects.toThrow(/Missing.*tree/);
  });
});
