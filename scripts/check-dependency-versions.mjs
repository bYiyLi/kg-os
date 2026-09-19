import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packagePaths = [
  "package.json",
  "packages/cli/package.json",
  "packages/contracts/package.json",
  "packages/daemon/package.json",
  "packages/kernel/package.json",
  "packages/sdk/package.json",
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
  throw new Error("Node.js and pnpm engines must use the pinned Phase 0 versions");
}

for (const [index, packageJson] of packages.entries()) {
  if (packageJson.version !== rootPackage.version) {
    throw new Error(`${packagePaths[index]} version does not match the root version`);
  }

  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    for (const [name, version] of Object.entries(packageJson[field] ?? {})) {
      if (version !== "workspace:*" && !exactVersion.test(version)) {
        throw new Error(`${packagePaths[index]} ${field}.${name} is not exact: ${version}`);
      }
    }
  }
}

const contractsSource = await readFile(resolve(root, "packages/contracts/src/index.ts"), "utf8");
if (!contractsSource.includes(`KGOS_VERSION = "${rootPackage.version}"`)) {
  throw new Error("KGOS_VERSION does not match the package version");
}
