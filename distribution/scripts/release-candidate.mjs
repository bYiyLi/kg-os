// cspell:words opencontainers skopeo diffids
import { createHash } from "node:crypto";
import { createReadStream, realpathSync } from "node:fs";
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { safeToolFailure } from "./ci-report.mjs";

export const repository = "bYiyLi/kg-releases";
export const imageRepository = "ghcr.io/byiyli/kgos";
const hashPattern = /^[0-9a-f]{64}$/;
const revisionPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const skillNames = [
  "design-ontology",
  "kgos-doctor",
  "kgos-ontology-implementation",
  "kgos-organize-knowledge",
  "kgos-record-vlog",
  "kgos-retrieve-knowledge",
  "kgos-review-knowledge",
  "kgos-review-ontology"
];
const locks = {
  pnpmLock: "pnpm-lock.yaml",
  goModule: "go.mod",
  goChecksum: "go.sum",
  rustLock: "native/jieba/Cargo.lock",
  dockerfile: "Dockerfile.unified",
  nodeVersion: ".node-version"
};
const baseNames = ["NODE_IMAGE", "DEBIAN_IMAGE", "RUST_IMAGE", "GO_BUILDER_IMAGE"];
function validateBases(bases, dockerfile) {
  requireValue(
    Object.keys(bases).sort().join(",") === [...baseNames].sort().join(","),
    "BASE_IMAGES_INVALID"
  );
  for (const name of baseNames) {
    const original = dockerfile.match(new RegExp(`^ARG ${name}=([a-z0-9:./-]+)$`, "m"))?.[1];
    requireValue(
      original &&
        bases[name]?.startsWith(`docker.io/library/${original}@sha256:`) &&
        /^[a-z0-9./:-]+@sha256:[0-9a-f]{64}$/.test(bases[name]),
      "BASE_IMAGES_INVALID"
    );
  }
}

function requireValue(condition, code) {
  if (!condition) throw new Error(code);
}
export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
export async function fileHash(path) {
  const hash = createHash("sha256");
  for await (const part of createReadStream(path)) hash.update(part);
  return hash.digest("hex");
}
export function commandBytes(program, args, cwd, env = process.env) {
  try {
    return execFileSync(program, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 8 * 1024 * 1024
    });
  } catch (error) {
    const wrapped = new Error("EXTERNAL_TOOL_FAILED", { cause: error });
    wrapped.safeTool = safeToolFailure(program, error.status, error.stderr);
    wrapped.stderr = error.stderr;
    throw wrapped;
  }
}
export function command(program, args, cwd, env) {
  return commandBytes(program, args, cwd, env).toString("utf8").trim();
}
async function files(directory, prefix = "") {
  const output = [];
  for (const entry of await readdir(join(directory, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    requireValue(!entry.isSymbolicLink(), "SYMLINK_REJECTED");
    if (entry.isDirectory()) output.push(...(await files(directory, path)));
    else {
      requireValue(entry.isFile(), "FILE_TYPE_REJECTED");
      output.push(path);
    }
  }
  return output.sort();
}
export async function publicInputs(root) {
  const paths = [
    ".github/workflows/ci.yml",
    ".github/workflows/release.yml",
    "scripts/release-candidate.mjs",
    "scripts/release-delivery.mjs",
    "scripts/ci-report.mjs",
    "scripts/render-release-installation.mjs",
    "INSTALL.md",
    "LICENSE",
    "COMMERCIAL-LICENSE.md",
    "site/src/content/service-installation/zh.md",
    "site/src/content/service-installation/en.md"
  ];
  paths.push(...(await files(join(root, "plugins/kgos"))).map((path) => `plugins/kgos/${path}`));
  return Object.fromEntries(
    await Promise.all(paths.sort().map(async (path) => [path, await fileHash(join(root, path))]))
  );
}
export async function sourceInputs(root) {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(locks).map(async ([key, path]) => [key, await fileHash(join(root, path))])
    )
  );
}
function blobPath(digest) {
  requireValue(/^sha256:[0-9a-f]{64}$/.test(digest), "OCI_DIGEST_INVALID");
  return `blobs/sha256/${digest.slice(7)}`;
}
async function tarBlob(archive, path, descriptor, json = false) {
  const child = spawn("tar", ["-xOf", archive, "--", path], { stdio: ["ignore", "pipe", "pipe"] });
  const hash = createHash("sha256");
  let size = 0;
  const chunks = [];
  const completion = new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0 ? resolvePromise() : reject(new Error("OCI_ARCHIVE_READ_FAILED"))
    );
  });
  const settled = completion.catch((error) => error);
  child.stderr.resume();
  try {
    for await (const chunk of child.stdout) {
      size += chunk.length;
      hash.update(chunk);
      if (json) {
        requireValue(size <= 4 * 1024 * 1024, "OCI_METADATA_TOO_LARGE");
        chunks.push(chunk);
      }
    }
  } catch (error) {
    child.kill();
    await settled;
    throw error;
  }
  const failure = await settled;
  if (failure) throw failure;
  if (descriptor)
    requireValue(
      size === descriptor.size && `sha256:${hash.digest("hex")}` === descriptor.digest,
      "OCI_BLOB_MISMATCH"
    );
  return json ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : undefined;
}
export async function inspectOci(archive, expected) {
  requireValue(
    command("tar", ["-tvf", archive])
      .split("\n")
      .every((line) => line.startsWith("-") || line.startsWith("d")),
    "OCI_ENTRY_TYPE_REJECTED"
  );
  const names = command("tar", ["-tf", archive])
    .split("\n")
    .map((name) => name.replace(/^\.\//, ""))
    .filter((name) => name && name !== ".");
  requireValue(new Set(names).size === names.length, "OCI_DUPLICATE_ENTRY");
  requireValue(
    names.every((name) =>
      /^(?:oci-layout|index\.json|blobs\/?|blobs\/sha256\/?|blobs\/sha256\/[0-9a-f]{64})$/.test(
        name
      )
    ),
    "OCI_ENTRY_REJECTED"
  );
  const layout = await tarBlob(archive, "oci-layout", null, true);
  requireValue(layout.imageLayoutVersion === "1.0.0", "OCI_LAYOUT_INVALID");
  const index = await tarBlob(archive, "index.json", null, true);
  requireValue(
    index.schemaVersion === 2 && index.manifests?.length === 1,
    "OCI_SINGLE_PLATFORM_REQUIRED"
  );
  const descriptor = index.manifests[0];
  requireValue(
    descriptor.mediaType === "application/vnd.oci.image.manifest.v1+json",
    "OCI_MANIFEST_TYPE_INVALID"
  );
  if (descriptor.platform)
    requireValue(
      descriptor.platform.os === "linux" &&
        descriptor.platform.architecture === "amd64" &&
        !descriptor.platform.variant,
      "OCI_PLATFORM_MISMATCH"
    );
  const manifest = await tarBlob(archive, blobPath(descriptor.digest), descriptor, true);
  requireValue(
    manifest.schemaVersion === 2 &&
      manifest.mediaType === descriptor.mediaType &&
      manifest.config?.mediaType === "application/vnd.oci.image.config.v1+json" &&
      Array.isArray(manifest.layers),
    "OCI_MANIFEST_INVALID"
  );
  const config = await tarBlob(archive, blobPath(manifest.config.digest), manifest.config, true);
  requireValue(
    config.os === "linux" && config.architecture === "amd64" && !config.variant,
    "OCI_PLATFORM_MISMATCH"
  );
  requireValue(
    config.rootfs?.type === "layers" &&
      config.rootfs.diff_ids?.length === manifest.layers.length &&
      config.rootfs.diff_ids.every((value) => /^sha256:[0-9a-f]{64}$/.test(value)),
    "OCI_ROOTFS_INVALID"
  );
  requireValue(
    config.config?.Labels?.["org.opencontainers.image.revision"] === expected.revision &&
      config.config.Labels["org.opencontainers.image.version"] === `v${expected.version}` &&
      config.config.Labels["org.opencontainers.image.source"] ===
        `https://github.com/${repository}`,
    "OCI_LABEL_MISMATCH"
  );
  const blobs = [descriptor, manifest.config, ...manifest.layers];
  requireValue(
    manifest.layers.every(
      (layer) =>
        [
          "application/vnd.oci.image.layer.v1.tar",
          "application/vnd.oci.image.layer.v1.tar+gzip",
          "application/vnd.oci.image.layer.v1.tar+zstd"
        ].includes(layer.mediaType) && !layer.urls
    ),
    "OCI_LAYER_TYPE_INVALID"
  );
  for (const layer of manifest.layers) await tarBlob(archive, blobPath(layer.digest), layer);
  const declared = new Set(blobs.map((item) => blobPath(item.digest)));
  requireValue(
    names.filter((name) => /^blobs\/sha256\/[^/]+$/.test(name)).every((name) => declared.has(name)),
    "OCI_UNDECLARED_BLOB"
  );
  return {
    platform: "linux/amd64",
    digest: descriptor.digest,
    configDigest: manifest.config.digest,
    layers: manifest.layers.map((layer) => layer.digest),
    diffids: config.rootfs.diff_ids
  };
}
export function releaseAssetNames(version) {
  requireValue(versionPattern.test(version), "VERSION_INVALID");
  const tag = `v${version}`;
  return [
    `kgos-plugin-${tag}.zip`,
    ...(!version.includes("-")
      ? [
          `kgos-install-zh-${tag}.md`,
          `kgos-install-en-${tag}.md`,
          `kgos-INSTALL-${tag}.md`,
          `kgos-install-${tag}.sha256`
        ]
      : [])
  ];
}
export async function packPlugin(root, output, version, digest) {
  const tag = `v${version}`;
  const stable = !version.includes("-");
  if (stable) {
    command(process.execPath, [
      join(root, "scripts/render-release-installation.mjs"),
      "--source-directory",
      join(root, "site/src/content/service-installation"),
      "--installer",
      join(root, "INSTALL.md"),
      "--output",
      output,
      "--tag",
      tag,
      "--digest-ref",
      `${imageRepository}@${digest}`
    ]);
    const manuals = releaseAssetNames(version).filter((name) => name.endsWith(".md"));
    await writeFile(
      join(output, `kgos-install-${tag}.sha256`),
      (
        await Promise.all(
          manuals.map(async (name) => `${await fileHash(join(output, name))}  ${name}\n`)
        )
      ).join("")
    );
  }
  const plugin = JSON.parse(await readFile(join(root, "plugins/kgos/plugin.json"), "utf8"));
  requireValue(plugin.version === version, "PLUGIN_VERSION_MISMATCH");
  requireValue(
    JSON.stringify((await readdir(join(root, "plugins/kgos/skills"))).sort()) ===
      JSON.stringify(skillNames),
    "PLUGIN_SKILLS_MISMATCH"
  );
  const packageDir = join(output, "plugin-content");
  await cp(join(root, "plugins/kgos"), packageDir, { recursive: true });
  for (const path of await files(packageDir))
    requireValue(!/(^|\/)\.app\.json$|(^|\/)INSTALL\.md$/.test(path), "PLUGIN_PRIVATE_FILE");
  await cp(
    stable ? join(output, `kgos-INSTALL-${tag}.md`) : join(root, "INSTALL.md"),
    join(packageDir, "INSTALL.md")
  );
  for (const name of ["LICENSE", "COMMERCIAL-LICENSE.md"])
    await cp(join(root, name), join(packageDir, name));
  command("zip", ["-q", "-r", join(output, `kgos-plugin-${tag}.zip`), "."], packageDir);
  await rm(packageDir, { recursive: true });
}
export async function packCandidate(root, source, output, suppliedTools) {
  await mkdir(output, { recursive: true });
  const data = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  requireValue(versionPattern.test(data.version), "VERSION_INVALID");
  const revision = command("git", ["rev-parse", "HEAD"], source);
  requireValue(revisionPattern.test(revision), "REVISION_INVALID");
  const image = await inspectOci(join(output, "image.oci.tar"), {
    revision,
    version: data.version
  });
  await packPlugin(root, output, data.version, image.digest);
  const names = ["image.oci.tar", ...releaseAssetNames(data.version)];
  const records = Object.fromEntries(
    await Promise.all(
      names.map(async (name) => [
        name,
        { sha256: await fileHash(join(output, name)), size: (await lstat(join(output, name))).size }
      ])
    )
  );
  const bases = JSON.parse(await readFile(join(output, "base-images.json"), "utf8"));
  validateBases(bases, await readFile(join(source, "Dockerfile.unified"), "utf8"));
  requireValue(
    Object.keys(bases).sort().join(",") === "DEBIAN_IMAGE,GO_BUILDER_IMAGE,NODE_IMAGE,RUST_IMAGE" &&
      Object.values(bases).every((ref) => /^[a-z0-9./:-]+@sha256:[0-9a-f]{64}$/.test(ref)),
    "BASE_IMAGES_INVALID"
  );
  const candidate = {
    schema: 1,
    repository,
    revision,
    version: data.version,
    publicSha: process.env.GITHUB_SHA,
    runId: Number(process.env.GITHUB_RUN_ID),
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    workflow: ".github/workflows/ci.yml",
    platform: "linux/amd64",
    sourceInputs: await sourceInputs(source),
    publicInputs: await publicInputs(root),
    tools: suppliedTools ?? {
      node: process.versions.node,
      pnpm: command("pnpm", ["--version"]),
      docker: command("docker", ["version", "--format", "{{.Client.Version}}"]),
      skopeo: command("skopeo", ["--version"]),
      validation: JSON.parse(process.env.KGOS_VALIDATION_TOOLS)
    },
    bases,
    image,
    files: records
  };
  requireValue(
    revisionPattern.test(candidate.publicSha) &&
      Number.isSafeInteger(candidate.runId) &&
      candidate.runId > 0 &&
      Number.isSafeInteger(candidate.attempt) &&
      candidate.attempt > 0,
    "RUN_IDENTITY_INVALID"
  );
  await rm(join(output, "base-images.json"));
  await writeFile(join(output, "candidate.json"), `${JSON.stringify(candidate, null, 2)}\n`);
  requireValue(
    JSON.stringify((await readdir(output)).sort()) ===
      JSON.stringify(["candidate.json", ...names].sort()),
    "CANDIDATE_FILES_MISMATCH"
  );
  return candidate;
}
export async function buildCandidate(root, source, output) {
  requireValue(
    process.platform === "linux" &&
      process.arch === "x64" &&
      process.env.GITHUB_ACTIONS === "true" &&
      process.env.GITHUB_REPOSITORY === repository &&
      process.env.GITHUB_REF === "refs/heads/main",
    "CANDIDATE_BUILD_ENVIRONMENT_INVALID"
  );
  await mkdir(output, { recursive: true });
  const revision = command("git", ["rev-parse", "HEAD"], source);
  const version = JSON.parse(await readFile(join(source, "package.json"), "utf8")).version;
  requireValue(
    command("git", ["status", "--porcelain", "--untracked-files=no"], source) === "",
    "CANDIDATE_SOURCE_DIRTY"
  );
  requireValue(
    revisionPattern.test(revision) && versionPattern.test(version),
    "CANDIDATE_SOURCE_INVALID"
  );
  const dockerfile = await readFile(join(source, "Dockerfile.unified"), "utf8");
  const bases = {};
  for (const name of ["NODE_IMAGE", "DEBIAN_IMAGE", "RUST_IMAGE", "GO_BUILDER_IMAGE"]) {
    const original = dockerfile.match(new RegExp(`^ARG ${name}=([a-z0-9:./-]+)$`, "m"))?.[1];
    requireValue(
      original && /^(?:node|debian|rust|golang):[a-z0-9.-]+$/.test(original),
      "BASE_IMAGE_REFERENCE_INVALID"
    );
    const digest = command("skopeo", [
      "inspect",
      "--override-os",
      "linux",
      "--override-arch",
      "amd64",
      "--format",
      "{{.Digest}}",
      `docker://docker.io/library/${original}`
    ]);
    requireValue(/^sha256:[0-9a-f]{64}$/.test(digest), "BASE_IMAGE_DIGEST_INVALID");
    bases[name] = `docker.io/library/${original}@${digest}`;
  }
  await writeFile(join(output, "base-images.json"), JSON.stringify(bases));
  const local = `kgos-candidate:${revision}`;
  command(
    "docker",
    [
      "build",
      "--platform",
      "linux/amd64",
      "-f",
      "Dockerfile.unified",
      ...Object.entries(bases).flatMap(([key, ref]) => ["--build-arg", `${key}=${ref}`]),
      "--label",
      `org.opencontainers.image.source=https://github.com/${repository}`,
      "--label",
      `org.opencontainers.image.revision=${revision}`,
      "--label",
      `org.opencontainers.image.version=v${version}`,
      "-t",
      local,
      "."
    ],
    source
  );
  const archive = join(output, "image.oci.tar");
  command("skopeo", [
    "copy",
    "--format",
    "oci",
    `docker-daemon:${local}`,
    `oci-archive:${archive}:kgos`
  ]);
  const image = await inspectOci(archive, { revision, version });
  const transport = join(output, "promotion-check");
  command("skopeo", [
    "copy",
    "--preserve-digests",
    `oci-archive:${archive}`,
    `oci:${transport}:kgos`
  ]);
  const transported = JSON.parse(await readFile(join(transport, "index.json"), "utf8"));
  requireValue(
    transported.manifests?.length === 1 && transported.manifests[0].digest === image.digest,
    "OCI_PROMOTION_MISMATCH"
  );
  for (const digest of [image.digest, image.configDigest, ...image.layers])
    requireValue(
      (await fileHash(join(transport, blobPath(digest)))) === digest.slice(7),
      "OCI_PROMOTION_MISMATCH"
    );
  await rm(transport, { recursive: true });
  command("docker", ["image", "rm", local]);
  command("skopeo", ["copy", `oci-archive:${archive}`, `docker-daemon:${local}`]);
  const loaded = JSON.parse(command("docker", ["image", "inspect", local]))[0];
  requireValue(
    loaded.Id === image.configDigest &&
      loaded.Os === "linux" &&
      loaded.Architecture === "amd64" &&
      JSON.stringify(loaded.RootFS.Layers) === JSON.stringify(image.diffids),
    "OCI_RELOAD_MISMATCH"
  );
  command(process.execPath, ["scripts/mcp-unified-docker-smoke.mjs"], source, {
    ...process.env,
    KGOS_UNIFIED_DOCKER_SMOKE_IMAGE: local
  });
  return packCandidate(root, source, output);
}
export async function verifyIdentity(root, source, candidate, run) {
  const manifest = JSON.parse(await readFile(join(root, "source.json"), "utf8"));
  const dockerfile = await readFile(join(source, "Dockerfile.unified"), "utf8");
  const expectedValidation = {
    node: (await readFile(join(source, ".node-version"), "utf8")).trim(),
    pnpm: JSON.parse(await readFile(join(source, "package.json"), "utf8")).packageManager.split(
      "@"
    )[1],
    go: dockerfile.match(/^ARG GO_BUILDER_IMAGE=golang:(\d+\.\d+\.\d+)/m)?.[1],
    rust: dockerfile.match(/^ARG RUST_IMAGE=rust:(\d+\.\d+\.\d+)/m)?.[1]
  };
  requireValue(
    JSON.stringify(candidate.tools?.validation) === JSON.stringify(expectedValidation) &&
      /^\d+\.\d+\.\d+/.test(candidate.tools?.docker) &&
      /^skopeo version \d+\.\d+\.\d+/.test(candidate.tools?.skopeo),
    "CANDIDATE_TOOLCHAIN_MISMATCH"
  );
  validateBases(candidate.bases, await readFile(join(source, "Dockerfile.unified"), "utf8"));
  requireValue(
    candidate.schema === 1 &&
      candidate.repository === repository &&
      candidate.workflow === ".github/workflows/ci.yml" &&
      candidate.platform === "linux/amd64" &&
      revisionPattern.test(candidate.revision) &&
      versionPattern.test(candidate.version),
    "CANDIDATE_IDENTITY_INVALID"
  );
  requireValue(
    candidate.revision === manifest.revision &&
      command("git", ["rev-parse", "HEAD"], source) === candidate.revision &&
      JSON.parse(await readFile(join(source, "package.json"), "utf8")).version ===
        candidate.version,
    "CANDIDATE_SOURCE_MISMATCH"
  );
  requireValue(
    run.id === candidate.runId &&
      run.run_attempt === candidate.attempt &&
      run.head_sha === candidate.publicSha &&
      run.status === "completed" &&
      run.conclusion === "success" &&
      run.head_branch === "main" &&
      ["push", "workflow_dispatch"].includes(run.event) &&
      run.path === candidate.workflow &&
      run.repository.full_name === repository &&
      run.head_repository.full_name === repository,
    "CANDIDATE_RUN_UNTRUSTED"
  );
  command("git", ["merge-base", "--is-ancestor", candidate.publicSha, "HEAD"], root);
  const binding = JSON.parse(command("git", ["show", `${candidate.publicSha}:source.json`], root));
  requireValue(
    binding.schema === 1 &&
      binding.repository === "bYiyLi/kg-os" &&
      binding.revision === candidate.revision &&
      binding.ref === "refs/heads/main",
    "CANDIDATE_PUBLIC_BINDING_MISMATCH"
  );
  const currentPublic = await publicInputs(root);
  for (const [path, hash] of Object.entries(currentPublic)) {
    requireValue(
      sha256(commandBytes("git", ["show", `${candidate.publicSha}:${path}`], root)) === hash,
      "CANDIDATE_WORKFLOW_MISMATCH"
    );
  }
  requireValue(
    JSON.stringify(await sourceInputs(source)) === JSON.stringify(candidate.sourceInputs) &&
      JSON.stringify(currentPublic) === JSON.stringify(candidate.publicInputs),
    "CANDIDATE_INPUTS_MISMATCH"
  );
  requireValue(
    candidate.tools.node === (await readFile(join(source, ".node-version"), "utf8")).trim() &&
      candidate.tools.pnpm ===
        JSON.parse(await readFile(join(source, "package.json"), "utf8")).packageManager.split(
          "@"
        )[1],
    "CANDIDATE_TOOLCHAIN_MISMATCH"
  );
}
export async function verifyCandidate(root, source, directory, run) {
  const candidate = JSON.parse(await readFile(join(directory, "candidate.json"), "utf8"));
  await verifyIdentity(root, source, candidate, run);
  await verifyCandidateFiles(directory, candidate);
  return candidate;
}
export async function verifyCandidateFiles(directory, candidate) {
  const expected = [
    "candidate.json",
    "image.oci.tar",
    ...releaseAssetNames(candidate.version)
  ].sort();
  requireValue(
    JSON.stringify((await readdir(directory)).sort()) === JSON.stringify(expected) &&
      JSON.stringify(Object.keys(candidate.files).sort()) ===
        JSON.stringify(expected.filter((name) => name !== "candidate.json")),
    "CANDIDATE_FILES_MISMATCH"
  );
  for (const [name, record] of Object.entries(candidate.files)) {
    const info = await lstat(join(directory, name));
    requireValue(
      info.isFile() &&
        !info.isSymbolicLink() &&
        hashPattern.test(record.sha256) &&
        record.size === info.size &&
        (await fileHash(join(directory, name))) === record.sha256,
      "CANDIDATE_FILE_CORRUPT"
    );
  }
  requireValue(
    JSON.stringify(await inspectOci(join(directory, "image.oci.tar"), candidate)) ===
      JSON.stringify(candidate.image),
    "CANDIDATE_OCI_MISMATCH"
  );
}
export function websiteOnly(paths) {
  return (
    paths.length > 0 &&
    paths.some((path) => path.startsWith("distribution/site/src/content/service-installation/")) &&
    paths.every((path) =>
      /^(?:distribution\/site\/src\/content\/service-installation\/(?:catalog\.json|v\d+\.\d+\.\d+\/(?:zh|en|INSTALL)\.md)|distribution\/README(?:\.zh-CN)?\.md|docs\/development\/phases\/(?:30-private-source-public-releases|31-public-product-website)\.md)$/.test(
        path
      )
    )
  );
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...args] = process.argv.slice(2);
  try {
    if (operation === "build") await buildCandidate(...args.map((path) => resolve(path)));
    else if (operation === "pack") await packCandidate(...args.map((path) => resolve(path)));
    else if (operation === "verify")
      await verifyCandidate(
        ...args.slice(0, 3).map((path) => resolve(path)),
        JSON.parse(await readFile(args[3], "utf8"))
      );
    else if (operation === "image")
      console.log(
        JSON.stringify(await inspectOci(resolve(args[0]), { revision: args[1], version: args[2] }))
      );
    else if (operation === "check-files") {
      const directory = resolve(args[0]);
      const candidate = JSON.parse(await readFile(join(directory, "candidate.json"), "utf8"));
      requireValue(
        candidate.runId === Number(process.env.GITHUB_RUN_ID) &&
          candidate.attempt === Number(process.env.GITHUB_RUN_ATTEMPT) &&
          candidate.publicSha === process.env.GITHUB_SHA,
        "CANDIDATE_ROUNDTRIP_IDENTITY_MISMATCH"
      );
      await verifyCandidateFiles(directory, candidate);
    } else if (operation === "scope")
      console.log(
        websiteOnly(
          command("git", ["diff", "--name-only", args[1], "HEAD"], args[0])
            .split("\n")
            .filter(Boolean)
        )
          ? "website"
          : "full"
      );
    else throw new Error("OPERATION_INVALID");
  } catch (error) {
    if (error.safeTool) console.error(JSON.stringify(error.safeTool));
    else
      console.error(
        /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : "CANDIDATE_OPERATION_FAILED"
      );
    process.exitCode = 1;
  }
}
