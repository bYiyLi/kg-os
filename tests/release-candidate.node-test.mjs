// cspell:words diffids opencontainers
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  inspectOci,
  packCandidate,
  sha256,
  verifyCandidate,
  verifyIdentity,
  websiteOnly
} from "../distribution/scripts/release-candidate.mjs";
import { safeReport, safeToolFailure } from "../distribution/scripts/ci-report.mjs";
import {
  findCandidate,
  findRelease,
  readRelease,
  verifyAssets
} from "../distribution/scripts/release-delivery.mjs";
import { render } from "../scripts/render-kg-releases.mjs";

const source = fileURLToPath(new URL("../", import.meta.url));
const git = (directory, ...args) =>
  execFileSync("git", ["-C", directory, ...args], { encoding: "utf8" }).trim();
const revision = git(source, "rev-parse", "HEAD");
const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;

async function oci(directory, options = {}) {
  const layout = join(directory, "layout");
  await mkdir(join(layout, "blobs/sha256"), { recursive: true });
  async function blob(content, mediaType) {
    const bytes = Buffer.isBuffer(content) ? content : Buffer.from(JSON.stringify(content));
    const hash = sha256(bytes);
    await writeFile(join(layout, "blobs/sha256", hash), bytes);
    return { mediaType, digest: `sha256:${hash}`, size: bytes.length };
  }
  const layer = await blob(
    Buffer.from("synthetic layer, never executed"),
    "application/vnd.oci.image.layer.v1.tar"
  );
  const config = await blob(
    {
      architecture: options.arch ?? "amd64",
      os: "linux",
      config: {
        Labels: {
          "org.opencontainers.image.revision": options.revision ?? revision,
          "org.opencontainers.image.version": `v${version}`,
          "org.opencontainers.image.source": "https://github.com/bYiyLi/kg-releases"
        }
      },
      rootfs: { type: "layers", diff_ids: [layer.digest] }
    },
    "application/vnd.oci.image.config.v1+json"
  );
  const manifest = await blob(
    {
      schemaVersion: 2,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      config,
      layers: [layer]
    },
    "application/vnd.oci.image.manifest.v1+json"
  );
  await writeFile(join(layout, "oci-layout"), '{"imageLayoutVersion":"1.0.0"}');
  await writeFile(
    join(layout, "index.json"),
    JSON.stringify({
      schemaVersion: 2,
      manifests: options.multiple ? [manifest, manifest] : [manifest]
    })
  );
  if (options.link) {
    await rm(join(layout, "blobs/sha256", layer.digest.slice(7)));
    await symlink("../../outside", join(layout, "blobs/sha256", layer.digest.slice(7)));
  }
  if (options.corrupt)
    await writeFile(join(layout, "blobs/sha256", layer.digest.slice(7)), "corrupted");
  if (options.extra) await writeFile(join(layout, "private.txt"), "PRIVATE_PAYLOAD");
  const archive = join(directory, "image.oci.tar");
  execFileSync("tar", [
    "-cf",
    archive,
    "-C",
    layout,
    "oci-layout",
    "index.json",
    "blobs",
    ...(options.extra ? ["private.txt"] : [])
  ]);
  return archive;
}

test("OCI identities reject corrupted bytes, wrong platform, multiple manifests and foreign files", async () => {
  for (const [options, error] of [
    [{}, null],
    [{ corrupt: true }, /MISMATCH/],
    [{ arch: "arm64" }, /PLATFORM/],
    [{ multiple: true }, /SINGLE_PLATFORM/],
    [{ revision: "0".repeat(40) }, /LABEL/],
    [{ extra: true }, /ENTRY/],
    [{ link: true }, /ENTRY_TYPE/]
  ]) {
    const directory = await mkdtemp(join(tmpdir(), "kgos-oci-test-"));
    try {
      const archive = await oci(directory, options);
      const inspect = () => inspectOci(archive, { revision, version });
      if (error) await assert.rejects(inspect, error);
      else {
        const image = await inspect();
        assert.equal(image.platform, "linux/amd64");
        assert.match(image.digest, /^sha256:[0-9a-f]{64}$/);
        assert.equal(image.layers[0], image.diffids[0]);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }
});

test("public diagnostic output has a closed vocabulary and never forwards private log text", () => {
  const log = `> pnpm test:coverage\nPRIVATE_PAYLOAD /private/path.ts secret-marker\nAll files | 94.37 | 89.99 | 95.33 | 96.99 | private file\nERROR: Coverage for branches (89.99%) does not meet global threshold (90%)\n`;
  const report = safeReport(log, 1);
  assert.equal(report.stage, 10);
  assert.equal(report.category, "coverage_threshold");
  assert.deepEqual(report.thresholds, [{ metric: "branches", actual: 89.99, required: 90 }]);
  assert.equal(report.coverage.branches, 89.99);
  assert.doesNotMatch(JSON.stringify(report), /PRIVATE_PAYLOAD|private|secret-marker/);
  assert.equal(safeReport("Error: PRIVATE_PAYLOAD", 1).category, "command_failed_unknown");
  assert.equal(
    safeReport("Vitest caught 1 unhandled error during the test run.", 1).category,
    "unhandled_error"
  );
  assert.equal(safeReport("All files | 999 | 20 | 30 | 40 |", 1).coverage, null);
  assert.equal(safeReport("", 0).category, "passed");
  const tool = safeToolFailure("/private/bin/skopeo", 1, "unknown flag --PRIVATE_PAYLOAD");
  assert.equal(tool.category, "tool_interface");
  assert.equal(tool.tool, "skopeo");
  assert.doesNotMatch(JSON.stringify(tool), /PRIVATE_PAYLOAD|private/);
});

test("partial release recovery verifies existing bytes and treats missing assets separately", async (context) => {
  const candidate = {
    version: "0.3.13",
    files: Object.fromEntries(
      [
        "kgos-plugin-v0.3.13.zip",
        "kgos-install-zh-v0.3.13.md",
        "kgos-install-en-v0.3.13.md",
        "kgos-INSTALL-v0.3.13.md",
        "kgos-install-v0.3.13.sha256"
      ].map((name) => [name, { sha256: sha256("original") }])
    )
  };
  const asset = {
    id: 1,
    url: "https://api.github.com/repos/bYiyLi/kg-releases/releases/assets/1",
    name: "kgos-plugin-v0.3.13.zip",
    size: 8,
    browser_download_url:
      "https://github.com/bYiyLi/kg-releases/releases/download/v0.3.13/kgos-plugin-v0.3.13.zip"
  };
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    return new Response("original");
  });
  const missing = await verifyAssets(
    {
      assets: [
        {
          ...asset,
          browser_download_url:
            "https://github.com/bYiyLi/kg-releases/releases/download/untagged-draft/kgos-plugin-v0.3.13.zip"
        }
      ],
      draft: true
    },
    candidate,
    Buffer.from("provenance")
  );
  assert.equal(missing[0], "kgos-provenance-v0.3.13.json");
  assert.equal(missing.length, 5);
  assert.match(requests[0].url, /api.github.com\/repos\/bYiyLi\/kg-releases\/releases\/assets\/1$/);
  assert.equal(requests[0].options.headers.Accept, "application/octet-stream");
  await verifyAssets({ assets: [asset], draft: false }, candidate, Buffer.from("provenance"));
  assert.equal(requests[1].url, asset.browser_download_url);
  assert.deepEqual(requests[1].options, {});
  await assert.rejects(
    () =>
      verifyAssets(
        { assets: [{ ...asset, url: "https://example.invalid/asset" }], draft: true },
        candidate,
        Buffer.from("provenance")
      ),
    /ASSET_URL_INVALID/
  );
  context.mock.method(globalThis, "fetch", async () => new Response("modified"));
  await assert.rejects(
    () => verifyAssets({ assets: [asset], draft: false }, candidate, Buffer.from("provenance")),
    /ASSET_CONFLICT/
  );
});

test("release discovery includes drafts and rejects duplicate tags across pages", async (context) => {
  const tag = "v0.3.15";
  const draft = { id: 42, tag_name: tag, draft: true, assets: [] };
  let pages = [[draft]];
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    const page = Number(new URL(url).searchParams.get("page"));
    return Response.json(pages[page - 1]);
  });
  assert.deepEqual(await findRelease(tag), draft);
  assert.ok(requests.every((url) => !url.includes("/tags/")));
  pages = [[{ ...draft, draft: false }]];
  assert.equal((await findRelease(tag)).draft, false);
  pages = [[]];
  assert.equal(await findRelease(tag), null);
  pages = [[draft, { ...draft, id: 43 }]];
  await assert.rejects(() => findRelease(tag), /RELEASE_TAG_AMBIGUOUS/);
  const unrelated = Array.from({ length: 99 }, (_, i) => ({ id: i + 100, tag_name: `other-${i}` }));
  pages = [[...unrelated, draft], [{ ...draft, id: 43 }]];
  await assert.rejects(() => findRelease(tag), /RELEASE_TAG_AMBIGUOUS/);
  pages = [[...unrelated, { id: 200, tag_name: "other" }], [draft]];
  assert.deepEqual(await findRelease(tag), draft);
  context.mock.method(globalThis, "fetch", async () => new Response("", { status: 403 }));
  await assert.rejects(() => findRelease(tag), /GITHUB_API_FAILED/);
});

test("draft asset refresh uses its exact release ID without a published tag lookup", async (context) => {
  const tag = "v0.3.15";
  let release = { id: 42, tag_name: tag, draft: true, assets: [{ id: 10 }] };
  const requests = [];
  context.mock.method(globalThis, "fetch", async (url) => {
    requests.push(String(url));
    return String(url).endsWith("/releases/42")
      ? Response.json(release)
      : new Response("", { status: 404 });
  });
  assert.deepEqual(await readRelease(42, tag), release);
  assert.deepEqual(requests, ["https://api.github.com/repos/bYiyLi/kg-releases/releases/42"]);
  release = { ...release, id: 43 };
  await assert.rejects(() => readRelease(42, tag), /IDENTITY_MISMATCH/);
  release = { ...release, id: 42, tag_name: "v0.0.0" };
  await assert.rejects(() => readRelease(42, tag), /IDENTITY_MISMATCH/);
  await assert.rejects(() => readRelease(0, tag), /ID_INVALID/);
});

test("website-only routing cannot hide product, dependency, workflow or Skill changes", () => {
  const catalog = "distribution/site/src/content/service-installation/catalog.json";
  assert.equal(
    websiteOnly([catalog, "distribution/site/src/content/service-installation/v0.3.14/zh.md"]),
    true
  );
  for (const path of [
    "packages/sdk/src/index.ts",
    "pnpm-lock.yaml",
    "distribution/.github/workflows/ci.yml",
    "plugins/kgos/INSTALL.md",
    "docs/design/client.md",
    "distribution/site/src/content/service-installation/zh.md"
  ]) {
    assert.equal(websiteOnly([catalog, path]), false);
  }
  assert.equal(websiteOnly([]), false);
  assert.equal(
    websiteOnly(["docs/development/phases/30-private-source-public-releases.md"]),
    false
  );
});

test("candidate verifies real archive, Plugin, source locks, workflow ancestry and run attempt", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "kgos-candidate-test-"));
  const root = join(directory, "public");
  const output = join(directory, "candidate");
  const oldEnvironment = Object.fromEntries(
    ["GITHUB_SHA", "GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_REF_NAME"].map((key) => [
      key,
      process.env[key]
    ])
  );
  try {
    await mkdir(root);
    git(root, "init", "-q", "-b", "main");
    git(root, "config", "user.name", "Fixture");
    git(root, "config", "user.email", "fixture@example.invalid");
    await render({ output: root, revision, ref: "refs/heads/main" });
    git(root, "add", ".");
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Synthetic public candidate");
    const publicSha = git(root, "rev-parse", "HEAD");
    process.env.GITHUB_SHA = publicSha;
    process.env.GITHUB_RUN_ID = "123";
    process.env.GITHUB_RUN_ATTEMPT = "1";
    process.env.GITHUB_REF_NAME = `v${version}`;
    await mkdir(output);
    await oci(output);
    await rm(join(output, "layout"), { recursive: true });
    const digest = `sha256:${"a".repeat(64)}`;
    const dockerfile = await readFile(join(source, "Dockerfile.unified"), "utf8");
    const bases = Object.fromEntries(
      ["NODE_IMAGE", "DEBIAN_IMAGE", "RUST_IMAGE", "GO_BUILDER_IMAGE"].map((name) => [
        name,
        `docker.io/library/${dockerfile.match(new RegExp(`^ARG ${name}=(.+)$`, "m"))[1]}@${digest}`
      ])
    );
    await writeFile(join(output, "base-images.json"), JSON.stringify(bases));
    const candidate = await packCandidate(root, source, output, {
      node: "24.15.0",
      pnpm: "10.34.5",
      docker: "28.0.0",
      skopeo: "skopeo version 1.13.3",
      validation: { node: "24.15.0", pnpm: "10.34.5", go: "1.27.3", rust: "1.97.1" }
    });
    const manifest = JSON.parse(await readFile(join(root, "source.json"), "utf8"));
    manifest.ref = `refs/tags/v${version}`;
    await writeFile(join(root, "source.json"), JSON.stringify(manifest));
    git(root, "add", "source.json");
    git(root, "-c", "core.hooksPath=/dev/null", "commit", "-qm", "Synthetic immutable Tag export");
    const run = {
      id: 123,
      run_attempt: 1,
      head_sha: publicSha,
      status: "completed",
      conclusion: "success",
      head_branch: "main",
      event: "push",
      path: ".github/workflows/ci.yml",
      repository: { full_name: "bYiyLi/kg-releases" },
      head_repository: { full_name: "bYiyLi/kg-releases" }
    };
    assert.deepEqual(await verifyCandidate(root, source, output, run), candidate);
    const changedLock = structuredClone(candidate);
    changedLock.sourceInputs.pnpmLock = "0".repeat(64);
    await assert.rejects(() => verifyIdentity(root, source, changedLock, run), /INPUTS/);
    const changedTool = structuredClone(candidate);
    changedTool.tools.validation.go = "0.0.0";
    await assert.rejects(() => verifyIdentity(root, source, changedTool, run), /TOOLCHAIN/);
    let release = null;
    let expired = false;
    let forbidden = false;
    const requests = [];
    context.mock.method(globalThis, "fetch", async (url) => {
      requests.push(String(url));
      if (forbidden) return Response.json({ message: "PRIVATE_PAYLOAD" }, { status: 403 });
      if (String(url).includes("/releases?")) return Response.json(release ? [release] : []);
      if (String(url).includes("/attempts/")) return Response.json(run);
      if (String(url).includes("/artifacts?"))
        return Response.json({
          artifacts: [
            {
              id: 456,
              name: `kgos-candidate-${revision}-123-1`,
              expired,
              digest: `sha256:${"a".repeat(64)}`,
              workflow_run: { id: 123, head_sha: publicSha }
            }
          ]
        });
      return Response.json({ workflow_runs: [run] });
    });
    const lookup = join(directory, "lookup");
    assert.deepEqual(await findCandidate(root, source, lookup), {
      complete: false,
      run_id: 123,
      artifact_id: 456
    });
    expired = true;
    await assert.rejects(() => findCandidate(root, source, lookup), /MISSING_OR_EXPIRED/);
    expired = false;
    release = {
      id: 42,
      tag_name: `v${version}`,
      draft: true,
      assets: [{ name: `kgos-plugin-v${version}.zip` }],
      body: `Candidate SHA256: ${sha256(await readFile(join(output, "candidate.json")))}\nCandidate CI: https://github.com/bYiyLi/kg-releases/actions/runs/123/attempts/1`
    };
    requests.length = 0;
    assert.deepEqual(await findCandidate(root, source, lookup), {
      complete: false,
      run_id: 123,
      artifact_id: 456
    });
    assert.ok(requests.some((url) => url.endsWith("/actions/runs/123/attempts/1")));
    assert.ok(!requests.some((url) => url.includes("/workflows/ci.yml/runs")));
    expired = true;
    await assert.rejects(() => findCandidate(root, source, lookup), /MISSING_OR_EXPIRED/);
    forbidden = true;
    await assert.rejects(() => findCandidate(root, source, lookup), /^Error: GITHUB_API_FAILED$/);
    for (const change of [
      { conclusion: "failure" },
      { run_attempt: 2 },
      { head_branch: "untrusted" },
      { path: ".github/workflows/other.yml" },
      { head_sha: "0".repeat(40) }
    ]) {
      await assert.rejects(
        () => verifyIdentity(root, source, candidate, { ...run, ...change }),
        /UNTRUSTED/
      );
    }
    await writeFile(join(root, "scripts/ci-report.mjs"), "changed workflow input");
    await assert.rejects(() => verifyIdentity(root, source, candidate, run), /WORKFLOW/);
    git(root, "restore", "scripts/ci-report.mjs");
    const archive = join(output, `kgos-plugin-v${version}.zip`);
    await writeFile(archive, "tampered Plugin");
    await assert.rejects(() => verifyCandidate(root, source, output, run), /CORRUPT/);
  } finally {
    for (const [key, value] of Object.entries(oldEnvironment)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
