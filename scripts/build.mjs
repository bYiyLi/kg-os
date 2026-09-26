import { cp, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./process.mjs";
import { buildCurrentRuntimePackage } from "./runtime-package.mjs";

const root = resolve(import.meta.dirname, "..");
const webOutput = resolve(root, "packages/web/dist");
const embeddedWeb = resolve(root, "internal/webui/dist");
const buildOutput = resolve(root, "artifacts/build");
const goEnv = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};

await run("pnpm", ["clean"], { cwd: root });
await run("pnpm", ["exec", "tsc", "-b", "--pretty", "false"], { cwd: root });
await run("pnpm", ["exec", "tsc", "-p", "packages/web/tsconfig.json", "--pretty", "false"], {
  cwd: root
});
await run("pnpm", ["--filter", "@kgos/web", "build"], { cwd: root });
await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });
await run("node", ["scripts/prepare-jieba.mjs"], { cwd: root });

await mkdir(embeddedWeb, { recursive: true });
for (const entry of await readdir(embeddedWeb)) {
  if (entry !== ".gitkeep") {
    await rm(resolve(embeddedWeb, entry), { force: true, recursive: true });
  }
}
await cp(webOutput, embeddedWeb, { recursive: true });

await mkdir(buildOutput, { recursive: true });
await run(
  "go",
  ["build", "-tags=sqlite_fts5", "-o", resolve(buildOutput, "kgosd"), "./cmd/kgosd"],
  { cwd: root, env: goEnv }
);
await buildCurrentRuntimePackage({
  root,
  daemon: resolve(buildOutput, "kgosd")
});
