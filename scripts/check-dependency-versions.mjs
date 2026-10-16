import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { LITHOGRAPH_VERSION } from "./lithograph-artifacts.mjs";

const root = resolve(import.meta.dirname, "..");
const packagePaths = [
  "package.json",
  "packages/sdk/package.json",
  "packages/cli/package.json",
  "packages/web/package.json"
];
const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

async function readPackage(path) {
  return JSON.parse(await readFile(resolve(root, path), "utf8"));
}

const packages = await Promise.all(packagePaths.map(readPackage));
const rootPackage = packages[0];

if (rootPackage.packageManager !== "pnpm@10.34.5") {
  throw new Error("packageManager must remain pinned to pnpm@10.34.5");
}
if (rootPackage.engines?.node !== "24.15.0" || rootPackage.engines?.pnpm !== "10.34.5") {
  throw new Error("Node.js and pnpm engines must use the pinned KG OS versions");
}
if ((await readFile(resolve(root, ".node-version"), "utf8")).trim() !== "24.15.0") {
  throw new Error(".node-version must remain pinned to 24.15.0");
}
if (packages[2].engines?.node !== ">=24.15.0") {
  throw new Error("@kgos/cli must declare Node.js >=24.15.0");
}
if (packages[1].engines?.node !== undefined) {
  throw new Error("@kgos/sdk must keep its browser-compatible engine contract");
}

for (const [index, packageJson] of packages.entries()) {
  if (packageJson.version !== rootPackage.version) {
    throw new Error(packagePaths[index] + " version does not match the root version");
  }
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[field] ?? {})) {
      const workspaceExact = version === "workspace:" + rootPackage.version;
      if (version !== "workspace:*" && !workspaceExact && !exactVersion.test(version)) {
        throw new Error(
          packagePaths[index] + " " + field + "." + name + " is not exact: " + version
        );
      }
    }
  }
}

const sdkSource = await readFile(resolve(root, "packages/sdk/src/index.ts"), "utf8");
if (!sdkSource.includes('KGOS_VERSION = "' + rootPackage.version + '"')) {
  throw new Error("SDK KGOS_VERSION does not match the package version");
}

const buildInfo = await readFile(resolve(root, "internal/buildinfo/buildinfo.go"), "utf8");
const goVersionMatch = buildInfo.match(/Version\s*=\s*"([^"]+)"/);
if (goVersionMatch?.[1] !== rootPackage.version) {
  throw new Error("Go buildinfo.Version does not match the package version");
}

const goMod = await readFile(resolve(root, "go.mod"), "utf8");
for (const required of [
  "go 1.27.2",
  "github.com/mattn/go-sqlite3 v1.14.52",
  "golang.org/x/vuln v1.8.0",
  "honnef.co/go/tools v0.8.1",
  "golang.org/x/vuln/cmd/govulncheck",
  "honnef.co/go/tools/cmd/staticcheck"
]) {
  if (!goMod.includes(required)) {
    throw new Error("go.mod is missing pinned engineering dependency: " + required);
  }
}

const lithographArtifacts = await readFile(
  resolve(root, "scripts/lithograph-artifacts.mjs"),
  "utf8"
);
if (!lithographArtifacts.includes('LITHOGRAPH_VERSION = "0.3.1"')) {
  throw new Error("Lithograph fixture must remain pinned to v0.3.1");
}
const linuxArtifactSha = lithographArtifacts.match(
  /"linux-x64": \{[\s\S]*?sha256: "([0-9a-f]{64})"/
)?.[1];
const dockerfile = await readFile(resolve(root, "Dockerfile.unified"), "utf8");
const hostTypes = await readFile(resolve(root, "internal/lithograph/types.go"), "utf8");
if (
  !linuxArtifactSha ||
  !dockerfile.includes(`ARG LITHOGRAPH_VERSION=${LITHOGRAPH_VERSION}`) ||
  !dockerfile.includes(`ARG LITHOGRAPH_LINUX_X64_SHA256=${linuxArtifactSha}`) ||
  !new RegExp(`expectedExtension\\s*=\\s*"${LITHOGRAPH_VERSION}"`).test(hostTypes)
) {
  throw new Error("Go Host, native Docker release and Lithograph fixture pins differ");
}
