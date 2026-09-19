import { rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const paths = [
  ".cache/tsbuildinfo",
  "artifacts",
  "coverage",
  "playwright-report",
  "test-results",
  "packages/cli/dist",
  "packages/contracts/dist",
  "packages/daemon/dist",
  "packages/kernel/dist",
  "packages/sdk/dist",
  "packages/web/dist"
];

for (const path of paths) {
  await rm(resolve(root, path), { force: true, recursive: true });
}
