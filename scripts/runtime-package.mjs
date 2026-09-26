import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";

const supportedTargets = new Set(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function currentRuntimeTarget() {
  const target = process.platform + "-" + process.arch;
  if (!supportedTargets.has(target)) {
    throw new Error("Unsupported KG OS Runtime target: " + target);
  }
  return target;
}

export async function buildCurrentRuntimePackage({ root, daemon, output: explicitOutput }) {
  const target = currentRuntimeTarget();
  const [platform, arch] = target.split("-");
  const source = resolve(root, "packages", "runtime-" + target);
  const output = explicitOutput ?? resolve(root, "artifacts", "npm", "runtime-" + target);
  const packageJSON = JSON.parse(await readFile(resolve(source, "package.json"), "utf8"));
  const rootPackage = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
  const artifact = currentLithographArtifact(root);
  if (artifact.key !== target) {
    throw new Error("Lithograph artifact target does not match Runtime target");
  }
  if (
    packageJSON.name !== "@kgos/runtime-" + target ||
    packageJSON.version !== rootPackage.version ||
    packageJSON.os?.[0] !== platform ||
    packageJSON.cpu?.[0] !== arch
  ) {
    throw new Error("Runtime package metadata does not match current target/version");
  }
  if (platform === "linux" && packageJSON.libc?.[0] !== "glibc") {
    throw new Error("Linux Runtime package must declare libc=glibc");
  }

  await rm(output, { force: true, recursive: true });
  await mkdir(resolve(output, "extensions"), { recursive: true });
  await cp(resolve(source, "package.json"), resolve(output, "package.json"));
  await cp(resolve(root, "LICENSE"), resolve(output, "LICENSE"));
  const daemonTarget = resolve(output, "kgosd");
  await cp(daemon, daemonTarget);
  await chmod(daemonTarget, 0o755);

  const librarySource = resolve(artifact.cacheDirectory, artifact.library);
  const providerSource = resolve(artifact.cacheDirectory, artifact.providerLibrary);
  const jiebaSource = resolve(
    root,
    "artifacts",
    "jieba",
    "release",
    platform === "darwin" ? "libkgos_jieba.dylib" : "libkgos_jieba.so"
  );
  const libraryTarget = resolve(output, "extensions", artifact.library);
  const providerTarget = resolve(output, "extensions", artifact.providerLibrary);
  const jiebaTarget = resolve(
    output,
    "extensions",
    "kgos-jieba" + (platform === "darwin" ? ".dylib" : ".so")
  );
  const noticeTarget = resolve(output, "JIEBA-NOTICE.md");
  await cp(librarySource, libraryTarget);
  await cp(providerSource, providerTarget);
  await cp(jiebaSource, jiebaTarget);
  await cp(resolve(root, "native", "jieba", "NOTICE.md"), noticeTarget);
  await mkdir(resolve(output, "licenses"), { recursive: true });
  const tokenizerLicense = resolve(output, "licenses", "sqlite-simple-tokenizer-MIT.txt");
  const jiebaLicense = resolve(output, "licenses", "jieba-rs-MIT.txt");
  await cp(
    resolve(root, "native", "jieba", "licenses", "sqlite-simple-tokenizer-MIT.txt"),
    tokenizerLicense
  );
  await cp(resolve(root, "native", "jieba", "licenses", "jieba-rs-MIT.txt"), jiebaLicense);

  const files = [];
  for (const path of [
    daemonTarget,
    libraryTarget,
    providerTarget,
    jiebaTarget,
    noticeTarget,
    tokenizerLicense,
    jiebaLicense
  ]) {
    const bytes = await readFile(path);
    const file =
      path === daemonTarget
        ? "kgosd"
        : path === noticeTarget
          ? "JIEBA-NOTICE.md"
          : path === tokenizerLicense || path === jiebaLicense
            ? "licenses/" + basename(path)
            : "extensions/" + basename(path);
    files.push({ file, sha256: sha256(bytes) });
  }
  const manifest = {
    arch,
    files,
    platform,
    version: rootPackage.version
  };
  await writeFile(resolve(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
  return { output, target, manifest };
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(import.meta.dirname, "..");
  const daemon = resolve(root, "artifacts", "build", "kgosd");
  const built = await buildCurrentRuntimePackage({ root, daemon });
  process.stdout.write("Built " + built.target + " Runtime package: " + built.output + "\n");
}
