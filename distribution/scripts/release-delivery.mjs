// cspell:words skopeo opencontainers
import { realpathSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  command,
  commandBytes,
  imageRepository,
  releaseAssetNames,
  repository,
  sha256,
  verifyCandidate,
  verifyIdentity
} from "./release-candidate.mjs";

function check(condition, code) {
  if (!condition) throw new Error(code);
}
async function api(path, method = "GET", data) {
  check(path.startsWith(`/repos/${repository}/`), "API_TARGET_INVALID");
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(data ? { "Content-Type": "application/json" } : {})
    },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  if (response.status === 404 && method === "GET") return null;
  check(response.ok, "GITHUB_API_FAILED");
  return response.status === 204 ? null : response.json();
}
async function downloadAsset(asset, tag, draft = false) {
  check(
    asset.browser_download_url ===
      `https://github.com/${repository}/releases/download/${tag}/${asset.name}`,
    "ASSET_URL_INVALID"
  );
  const response = await fetch(
    draft
      ? `https://api.github.com/repos/${repository}/releases/assets/${asset.id}`
      : asset.browser_download_url,
    draft
      ? {
          headers: {
            Authorization: `Bearer ${process.env.GH_TOKEN}`,
            Accept: "application/octet-stream"
          }
        }
      : {}
  );
  check(response.ok, "ASSET_DOWNLOAD_FAILED");
  const bytes = Buffer.from(await response.arrayBuffer());
  check(bytes.length === asset.size, "ASSET_SIZE_MISMATCH");
  return bytes;
}
export function assetPlan(assets, expected) {
  check(
    new Set(assets.map((asset) => asset.name)).size === assets.length &&
      assets.every((asset) => Object.hasOwn(expected, asset.name)),
    "RELEASE_ASSET_CONFLICT"
  );
  return Object.keys(expected).filter((name) => !assets.some((asset) => asset.name === name));
}
export function releasePlan(release, candidate, provenanceHash) {
  if (!release) return "create";
  check(
    release.body?.includes(`Candidate SHA256: ${provenanceHash}`) &&
      release.body.includes(`Private source commit SHA: ${candidate.revision}`) &&
      release.body.includes(`Verified digest: ${imageRepository}@${candidate.image.digest}`),
    "RELEASE_PROVENANCE_CONFLICT"
  );
  check(release.prerelease === candidate.version.includes("-"), "RELEASE_CLASSIFICATION_CONFLICT");
  return "resume";
}
export async function verifyAssets(release, candidate, provenanceBytes) {
  const tag = `v${candidate.version}`;
  const provenance = `kgos-provenance-${tag}.json`;
  const expected = {
    [provenance]: sha256(provenanceBytes),
    ...Object.fromEntries(
      releaseAssetNames(candidate.version).map((name) => [name, candidate.files[name].sha256])
    )
  };
  const missing = assetPlan(release.assets, expected);
  for (const asset of release.assets)
    check(
      sha256(await downloadAsset(asset, tag, release.draft)) === expected[asset.name],
      "RELEASE_ASSET_CONFLICT"
    );
  return missing;
}
async function verifyImage(candidate, directory) {
  await mkdir(directory, { recursive: true });
  const auth = join(directory, "anonymous-auth.json");
  await writeFile(auth, '{"auths":{}}');
  const reference = `${imageRepository}:v${candidate.version}`;
  const raw = commandBytes("skopeo", [
    "inspect",
    "--authfile",
    auth,
    "--raw",
    `docker://${reference}`
  ]);
  check(sha256(raw) === candidate.image.digest.slice(7), "REGISTRY_DIGEST_MISMATCH");
  const manifest = JSON.parse(raw);
  check(
    manifest.config?.digest === candidate.image.configDigest &&
      JSON.stringify(manifest.layers?.map((layer) => layer.digest)) ===
        JSON.stringify(candidate.image.layers),
    "REGISTRY_IMAGE_MISMATCH"
  );
  const dockerConfig = join(directory, "docker");
  await mkdir(dockerConfig, { recursive: true });
  command("docker", [
    "--config",
    dockerConfig,
    "pull",
    `${imageRepository}@${candidate.image.digest}`
  ]);
  const info = JSON.parse(
    command("docker", ["image", "inspect", `${imageRepository}@${candidate.image.digest}`])
  )[0];
  check(
    info.Os === "linux" &&
      info.Architecture === "amd64" &&
      info.Id === candidate.image.configDigest &&
      JSON.stringify(info.RootFS.Layers) === JSON.stringify(candidate.image.diffids) &&
      info.Config.Labels["org.opencontainers.image.revision"] === candidate.revision &&
      info.Config.Labels["org.opencontainers.image.version"] === `v${candidate.version}`,
    "ANONYMOUS_IMAGE_MISMATCH"
  );
}
async function releaseTarget(root) {
  const manifest = JSON.parse(await readFile(join(root, "source.json"), "utf8"));
  const tag = process.env.GITHUB_REF_NAME;
  check(
    manifest.repository === "bYiyLi/kg-os" &&
      manifest.schema === 1 &&
      /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag) &&
      manifest.ref === `refs/tags/${tag}` &&
      /^[0-9a-f]{40}$/.test(manifest.revision),
    "RELEASE_TARGET_INVALID"
  );
  return { tag, manifest };
}
export async function findCandidate(root, source, output) {
  await mkdir(output, { recursive: true });
  const { tag, manifest } = await releaseTarget(root);
  const release = await api(`/repos/${repository}/releases/tags/${tag}`);
  let requiredAttempt;
  if (release) {
    const provenance = release.assets.find((asset) => asset.name === `kgos-provenance-${tag}.json`);
    if (provenance) {
      const bytes = await downloadAsset(provenance, tag, release.draft);
      const candidate = JSON.parse(bytes);
      check(
        Number.isSafeInteger(candidate.runId) &&
          candidate.runId > 0 &&
          Number.isSafeInteger(candidate.attempt) &&
          candidate.attempt > 0,
        "CANDIDATE_RUN_UNTRUSTED"
      );
      releasePlan(release, candidate, sha256(bytes));
      const run = await api(
        `/repos/${repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}`
      );
      await verifyIdentity(root, source, candidate, run);
      const missing = await verifyAssets(release, candidate, bytes);
      if (!release.draft && missing.length === 0) {
        await verifyImage(candidate, output);
        return { complete: true };
      }
    } else
      check(
        release.draft && /^Candidate SHA256: [0-9a-f]{64}$/m.test(release.body),
        "RELEASE_PROVENANCE_MISSING"
      );
    requiredAttempt = release.body.match(
      /Candidate CI: https:\/\/github\.com\/bYiyLi\/kg-releases\/actions\/runs\/(\d+)\/attempts\/(\d+)/
    );
    check(requiredAttempt, "RELEASE_PROVENANCE_MISSING");
  }
  for (let page = 1; page <= 10; page++) {
    const response = requiredAttempt
      ? {
          workflow_runs: [
            await api(
              `/repos/${repository}/actions/runs/${requiredAttempt[1]}/attempts/${requiredAttempt[2]}`
            )
          ]
        }
      : await api(
          `/repos/${repository}/actions/workflows/ci.yml/runs?branch=main&status=success&per_page=100&page=${page}`
        );
    check(response, "CANDIDATE_RUNS_UNAVAILABLE");
    for (const run of response.workflow_runs) {
      if (
        !run ||
        run.status !== "completed" ||
        run.conclusion !== "success" ||
        run.head_branch !== "main" ||
        !Number.isSafeInteger(run.id) ||
        !Number.isSafeInteger(run.run_attempt) ||
        run.path !== ".github/workflows/ci.yml" ||
        !["push", "workflow_dispatch"].includes(run.event) ||
        !/^[0-9a-f]{40}$/.test(run.head_sha)
      )
        continue;
      let bound;
      try {
        command("git", ["merge-base", "--is-ancestor", run.head_sha, "HEAD"], root);
        bound = JSON.parse(command("git", ["show", `${run.head_sha}:source.json`], root));
      } catch {
        continue;
      }
      if (bound.revision !== manifest.revision || bound.ref !== "refs/heads/main") continue;
      const name = `kgos-candidate-${manifest.revision}-${run.id}-${run.run_attempt}`;
      const list = await api(`/repos/${repository}/actions/runs/${run.id}/artifacts?per_page=100`);
      const matching = list?.artifacts.filter(
        (artifact) => artifact.name === name && !artifact.expired
      );
      if (matching?.length !== 1) continue;
      const artifact = matching[0];
      check(
        Number.isSafeInteger(artifact.id) &&
          artifact.id > 0 &&
          /^sha256:[0-9a-f]{64}$/.test(artifact.digest) &&
          artifact.workflow_run.id === run.id &&
          artifact.workflow_run.head_sha === run.head_sha,
        "CANDIDATE_ARTIFACT_UNTRUSTED"
      );
      await writeFile(join(output, "run.json"), JSON.stringify(run));
      return { complete: false, run_id: run.id, artifact_id: artifact.id };
    }
    if (response.workflow_runs.length < 100) break;
  }
  throw new Error("CANDIDATE_MISSING_OR_EXPIRED");
}
export async function promote(root, source, directory, runPath) {
  const candidate = await verifyCandidate(
    root,
    source,
    directory,
    JSON.parse(await readFile(runPath, "utf8"))
  );
  const { tag } = await releaseTarget(root);
  check(tag === `v${candidate.version}`, "RELEASE_VERSION_MISMATCH");
  const bytes = await readFile(join(directory, "candidate.json"));
  const provenanceName = `kgos-provenance-${tag}.json`;
  await writeFile(join(directory, provenanceName), bytes);
  const body = `Linux amd64 image: ${imageRepository}:${tag}\n\nVerified digest: ${imageRepository}@${candidate.image.digest}\n\nPrivate source commit SHA: ${candidate.revision}\n\nCandidate CI: https://github.com/${repository}/actions/runs/${candidate.runId}/attempts/${candidate.attempt}\n\nCandidate SHA256: ${sha256(bytes)}\n\nThe Plugin and guides are the exact candidate assets. The public Tag belongs to this distribution repository.\n`;
  let release = await api(`/repos/${repository}/releases/tags/${tag}`);
  if (release) {
    releasePlan(release, candidate, sha256(bytes));
    await verifyAssets(release, candidate, bytes);
  }
  const target = `docker://${imageRepository}:${tag}`;
  let exists = false;
  try {
    const raw = commandBytes("skopeo", ["inspect", "--raw", target]);
    check(sha256(raw) === candidate.image.digest.slice(7), "REGISTRY_TAG_CONFLICT");
    exists = true;
  } catch (error) {
    if (error.message === "REGISTRY_TAG_CONFLICT") throw error;
    check(
      !/unauthorized|denied|401|403/i.test(String(error.stderr)) &&
        /manifest unknown|name unknown|status code: 404/.test(String(error.stderr)),
      "REGISTRY_STATUS_UNKNOWN"
    );
  }
  if (!exists)
    command("skopeo", [
      "copy",
      "--preserve-digests",
      `oci-archive:${join(directory, "image.oci.tar")}`,
      target
    ]);
  await verifyImage(candidate, join(directory, "verify-public"));

  if (release) {
    releasePlan(release, candidate, sha256(bytes));
  } else
    release = await api(`/repos/${repository}/releases`, "POST", {
      tag_name: tag,
      target_commitish: process.env.GITHUB_SHA,
      name: `KG OS ${tag}`,
      body,
      draft: true,
      prerelease: candidate.version.includes("-")
    });
  const missing = await verifyAssets(release, candidate, bytes);
  for (const name of missing)
    command("gh", ["release", "upload", tag, join(directory, name), "--repo", repository]);
  release = await api(`/repos/${repository}/releases/tags/${tag}`);
  check((await verifyAssets(release, candidate, bytes)).length === 0, "RELEASE_ASSETS_INCOMPLETE");
  if (release.draft)
    await api(`/repos/${repository}/releases/${release.id}`, "PATCH", {
      draft: false,
      prerelease: candidate.version.includes("-"),
      make_latest: candidate.version.includes("-") ? "false" : "true"
    });
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [operation, ...paths] = process.argv.slice(2);
  try {
    check(
      process.platform === "linux" &&
        process.arch === "x64" &&
        process.env.GITHUB_ACTIONS === "true" &&
        process.env.GITHUB_REPOSITORY === repository,
      "RELEASE_ENVIRONMENT_INVALID"
    );
    if (operation === "find") {
      const result = await findCandidate(...paths.map((path) => resolve(path)));
      for (const [key, value] of Object.entries(result)) console.log(`${key}=${value}`);
    } else if (operation === "promote") await promote(...paths.map((path) => resolve(path)));
    else throw new Error("OPERATION_INVALID");
  } catch (error) {
    if (error.safeTool) console.error(JSON.stringify(error.safeTool));
    else
      console.error(
        /^[A-Z][A-Z_]+$/.test(error.message) ? error.message : "RELEASE_OPERATION_FAILED"
      );
    process.exitCode = 1;
  }
}
