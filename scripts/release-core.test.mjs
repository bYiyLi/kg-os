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
  classifyRegistryVersion,
  validateReleaseManifest
} from "./release-core.mjs";

const revision = "a".repeat(40);

function integrity(value) {
  return "sha512-" + createHash("sha512").update(value).digest("base64");
}

function candidate(target, overrides = {}) {
  const [platform, arch] = target.split("-");
  const suffix = platform === "darwin" ? ".dylib" : platform === "win32" ? ".dll" : ".so";
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
        { file: platform === "win32" ? "kgosd.exe" : "kgosd", sha256: "b".repeat(64) },
        {
          file: "extensions/lithograph" + suffix,
          sha256: "c".repeat(64)
        },
        {
          file: "extensions/lithograph-openai-compatible" + suffix,
          sha256: "d".repeat(64)
        },
        {
          file: "extensions/kgos-jieba" + suffix,
          sha256: "e".repeat(64)
        },
        { file: "JIEBA-NOTICE.md", sha256: "f".repeat(64) },
        { file: "licenses/sqlite-simple-tokenizer-MIT.txt", sha256: "a".repeat(64) },
        { file: "licenses/jieba-rs-MIT.txt", sha256: "1".repeat(64) }
      ]
    },
    ...overrides
  };
}

describe("release core", () => {
  it("accepts the first MVP release baseline and rejects placeholders", () => {
    expect(assertReleaseVersion("0.1.0")).toBe("0.1.0");
    expect(assertDistTag("latest")).toBe("latest");
    expect(() => assertReleaseVersion("0.0.0")).toThrow(/non-placeholder/);
    expect(() => assertReleaseVersion("01.1.0")).toThrow(/SemVer/);
    expect(() => assertReleaseVersion("1.0.0-01")).toThrow(/SemVer/);
    expect(() => assertReleaseVersion("v0.1.0")).toThrow(/SemVer/);
    expect(() => assertDistTag("0.1.0")).toThrow(/non-SemVer/);
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
        ...clean.filter((entry) => entry.document.target !== "linux-x64"),
        { directory: "/dirty", document: candidate("linux-x64", { dirty: true }) }
      ])
    ).toThrow(/dirty worktree/);
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.filter((entry) => entry.document.target !== "linux-x64"),
        {
          directory: "/stale",
          document: candidate("linux-x64", { revision: "c".repeat(40) })
        }
      ])
    ).toThrow(/one revision and version/);
    expect(() => aggregateCandidateDocuments(clean.slice(0, -1))).toThrow(/Missing/);
    expect(() => aggregateCandidateDocuments([...clean, clean[0]])).toThrow(/Duplicate/);
    const divergentClient = candidate("linux-x64");
    divergentClient.packages.find((entry) => entry.name === "@kgos/sdk").integrity =
      integrity("different-sdk");
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.filter((entry) => entry.document.target !== "linux-x64"),
        { directory: "/divergent-client", document: divergentClient }
      ])
    ).toThrow(/client package differs/);
    const windowsCliMode = candidate("win32-x64");
    windowsCliMode.packages.find((entry) => entry.name === "@kgos/cli").integrity =
      integrity("windows-cli-mode");
    const windowsCandidates = [
      ...clean.filter((entry) => entry.document.target !== "win32-x64"),
      { directory: "/windows-mode", document: windowsCliMode }
    ];
    expect(() => aggregateCandidateDocuments(windowsCandidates)).toThrow(/client package differs/);
    expect(
      aggregateCandidateDocuments(windowsCandidates, new Set(["win32-x64"])).packages.at(-1)
        ?.sourceDirectory
    ).toBe("/candidates/linux-x64");
    const macCliChange = candidate("darwin-arm64");
    macCliChange.packages.find((entry) => entry.name === "@kgos/cli").integrity =
      integrity("mac-cli-change");
    expect(() =>
      aggregateCandidateDocuments(
        [
          ...clean.filter((entry) => entry.document.target !== "darwin-arm64"),
          { directory: "/mac-change", document: macCliChange }
        ],
        new Set(["darwin-arm64"])
      )
    ).toThrow(/client package differs/);
    const invalidRuntime = candidate("linux-x64");
    invalidRuntime.runtimeManifest.files[0].sha256 = "invalid";
    expect(() =>
      aggregateCandidateDocuments([
        ...clean.filter((entry) => entry.document.target !== "linux-x64"),
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

  it("requires exact CLI dependencies and a complete target manifest", () => {
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

  it("keeps every public package bound to the GitHub repository for trusted publishing", async () => {
    const packageFiles = [
      "packages/sdk/package.json",
      "packages/cli/package.json",
      ...RUNTIME_TARGETS.map((target) => "packages/runtime-" + target + "/package.json")
    ];
    for (const packageFile of packageFiles) {
      const metadata = JSON.parse(
        await readFile(resolve(import.meta.dirname, "..", packageFile), "utf8")
      );
      expect(metadata.repository?.url).toBe("git+https://github.com/bYiyLi/kg-os.git");
    }
  });

  it("publishes only from release tags or explicit tag recovery and keeps CLI last", async () => {
    const workflow = await readFile(
      resolve(import.meta.dirname, "..", ".github", "workflows", "release.yml"),
      "utf8"
    );
    expect(workflow).toContain('push:\n    tags:\n      - "v*"');
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("tag:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain('--release-tag "$RELEASE_TAG"');
    expect(workflow).toContain("REVISION=$(git rev-parse HEAD)");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("NPM_BOOTSTRAP_TOKEN: ${{ secrets.NPM_TOKEN }}");
    expect(workflow).not.toContain("NODE_AUTH_TOKEN");
    expect(RELEASE_PACKAGE_ORDER.slice(0, 2)).toEqual([
      "@kgos/runtime-win32-arm64",
      "@kgos/runtime-win32-x64"
    ]);
    expect(workflow).toContain("github.event_name == 'workflow_dispatch' && github.sha");
    expect(workflow).toContain("Remove non-package build metadata");
    expect(workflow).toContain("packages/cli/dist/.tsbuildinfo");
    expect(workflow).toContain('--revision "${{ needs.preflight.outputs.revision }}"');
    expect(workflow).toContain('--version "${{ needs.preflight.outputs.version }}"');
    expect(workflow).toContain("--dry-run");
    expect(workflow).toContain('--dist-tag "$RELEASE_DIST_TAG"');
    expect(workflow).toContain("      - publish");
    expect(workflow).toContain("      - registry-smoke");
    expect(workflow).not.toContain("      - promote");
    expect(workflow).toContain("--verify-tag");
  });
});
