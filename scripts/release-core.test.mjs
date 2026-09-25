import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  RELEASE_PACKAGE_ORDER,
  RUNTIME_TARGETS,
  aggregateCandidateDocuments,
  assertCliRegistryDependencies,
  assertDistTag,
  assertReleaseVersion,
  assertStagingTag,
  classifyRegistryVersion,
  validateReleaseManifest
} from "./release-core.mjs";

const revision = "a".repeat(40);

function integrity(value) {
  return "sha512-" + createHash("sha512").update(value).digest("base64");
}

function candidate(target, overrides = {}) {
  const [platform, arch] = target.split("-");
  return {
    schemaVersion: 1,
    revision,
    dirty: false,
    version: "0.1.0",
    target,
    packages: [
      {
        name: "@kgos/sdk",
        version: "0.1.0",
        filename: "kgos-sdk-0.1.0.tgz",
        integrity: integrity("sdk")
      },
      {
        name: "@kgos/runtime-" + target,
        version: "0.1.0",
        filename: "kgos-runtime-" + target + "-0.1.0.tgz",
        integrity: integrity("runtime-" + target)
      },
      {
        name: "@kgos/cli",
        version: "0.1.0",
        filename: "kgos-cli-0.1.0.tgz",
        integrity: integrity("cli")
      }
    ],
    runtimeManifest: {
      platform,
      arch,
      version: "0.1.0",
      files: [
        { file: "kgosd", sha256: "b".repeat(64) },
        {
          file: "extensions/lithograph" + (platform === "darwin" ? ".dylib" : ".so"),
          sha256: "c".repeat(64)
        },
        {
          file:
            "extensions/lithograph-openai-compatible" + (platform === "darwin" ? ".dylib" : ".so"),
          sha256: "d".repeat(64)
        }
      ]
    },
    ...overrides
  };
}

describe("release core", () => {
  it("accepts the first MVP release baseline and rejects placeholders", () => {
    expect(assertReleaseVersion("0.1.0")).toBe("0.1.0");
    expect(assertDistTag("latest")).toBe("latest");
    expect(assertStagingTag("kgos-release-123")).toBe("kgos-release-123");
    expect(() => assertReleaseVersion("0.0.0")).toThrow(/non-placeholder/);
    expect(() => assertReleaseVersion("01.1.0")).toThrow(/SemVer/);
    expect(() => assertReleaseVersion("1.0.0-01")).toThrow(/SemVer/);
    expect(() => assertReleaseVersion("v0.1.0")).toThrow(/SemVer/);
    expect(() => assertDistTag("0.1.0")).toThrow(/non-SemVer/);
    expect(() => assertStagingTag("latest")).toThrow(/differ/);
  });

  it("aggregates exactly one clean candidate for every supported target", () => {
    const aggregate = aggregateCandidateDocuments(
      RUNTIME_TARGETS.map((target) => ({
        directory: "/candidates/" + target,
        document: candidate(target)
      }))
    );

    expect(aggregate).toMatchObject({ revision, version: "0.1.0" });
    expect(aggregate.packages.map((entry) => entry.name)).toEqual(RELEASE_PACKAGE_ORDER);
    expect(aggregate.packages.at(-1)?.sourceDirectory).toBe("/candidates/linux-x64");
  });

  it("fails closed on dirty, stale, duplicate, or missing candidates", () => {
    const clean = RUNTIME_TARGETS.map((target) => ({
      directory: "/candidates/" + target,
      document: candidate(target)
    }));
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.slice(0, 3),
        { directory: "/dirty", document: candidate("linux-x64", { dirty: true }) }
      ])
    ).toThrow(/dirty worktree/);
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.slice(0, 3),
        {
          directory: "/stale",
          document: candidate("linux-x64", { revision: "c".repeat(40) })
        }
      ])
    ).toThrow(/one revision and version/);
    expect(() => aggregateCandidateDocuments(clean.slice(0, 3))).toThrow(/Missing/);
    expect(() => aggregateCandidateDocuments([...clean, clean[0]])).toThrow(/Duplicate/);
    const divergentClient = candidate("linux-x64");
    divergentClient.packages.find((entry) => entry.name === "@kgos/sdk").integrity =
      integrity("different-sdk");
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.slice(0, 3),
        { directory: "/divergent-client", document: divergentClient }
      ])
    ).toThrow(/client package differs/);
    const invalidRuntime = candidate("linux-x64");
    invalidRuntime.runtimeManifest.files[0].sha256 = "invalid";
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.slice(0, 3),
        { directory: "/invalid-runtime", document: invalidRuntime }
      ])
    ).toThrow(/Runtime manifest file/);
  });

  it("classifies partial-release registry state by immutable integrity", () => {
    expect(classifyRegistryVersion("sha512-a", null)).toBe("missing");
    expect(classifyRegistryVersion("sha512-a", { dist: { integrity: "sha512-a" } })).toBe(
      "matching"
    );
    expect(classifyRegistryVersion("sha512-a", { dist: { integrity: "sha512-b" } })).toBe(
      "conflicting"
    );
  });

  it("requires exact CLI dependencies and a complete six-package manifest", () => {
    const dependencies = { "@kgos/sdk": "0.1.0" };
    const optionalDependencies = Object.fromEntries(
      RUNTIME_TARGETS.map((target) => ["@kgos/runtime-" + target, "0.1.0"])
    );
    expect(() =>
      assertCliRegistryDependencies({ dependencies, optionalDependencies }, "0.1.0")
    ).not.toThrow();
    expect(() =>
      assertCliRegistryDependencies(
        { dependencies: { "@kgos/sdk": "^0.1.0" }, optionalDependencies },
        "0.1.0"
      )
    ).toThrow(/exact SDK/);

    expect(() =>
      validateReleaseManifest({
        schemaVersion: 1,
        revision,
        version: "0.1.0",
        packages: RELEASE_PACKAGE_ORDER.map((name) => ({
          name,
          version: "0.1.0",
          filename: name.replace("@kgos/", "kgos-") + "-0.1.0.tgz",
          integrity: integrity(name)
        }))
      })
    ).not.toThrow();
  });

  it("keeps the Release workflow manual and ordered after registry acceptance", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, "..", ".github", "workflows", "release.yml"),
      "utf8"
    );
    expect(workflow).toContain("on:\n  workflow_dispatch:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).not.toContain("push:");
    expect(workflow).toContain("Require main branch");
    expect(workflow).toContain("release.mjs authority");
    expect(workflow).toContain('--revision "${{ needs.preflight.outputs.revision }}"');
    expect(workflow).toContain('--version "${{ needs.preflight.outputs.version }}"');
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain("--expect-final-tag-pending");
    expect(workflow).toContain("      - publish");
    expect(workflow).toContain("      - registry-smoke");
    expect(workflow).toContain("      - promote");
  });
});
