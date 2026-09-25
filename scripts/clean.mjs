import { mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const paths = [
  ".cache/tsbuildinfo",
  "artifacts",
  "coverage",
  "playwright-report",
  "test-results",
  "packages/cli/dist",
  "packages/sdk/dist",
  "packages/web/dist"
];

for (const path of paths) {
  await rm(resolve(root, path), { force: true, recursive: true });
}

const embeddedWeb = resolve(root, "internal/webui/dist");
await mkdir(embeddedWeb, { recursive: true });
for (const entry of await readdir(embeddedWeb)) {
  if (entry !== ".gitkeep") {
    await rm(resolve(embeddedWeb, entry), { force: true, recursive: true });
  }
}
