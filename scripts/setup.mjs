import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const goEnv = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};

if (process.version !== "v24.15.0") {
  throw new Error("KG OS setup requires Node.js 24.15.0; got " + process.version);
}
const pnpm = (await runCapture("pnpm", ["--version"], { cwd: root })).stdout.trim();
if (pnpm !== "10.34.5") {
  throw new Error("KG OS setup requires pnpm 10.34.5; got " + pnpm);
}

await access(resolve(root, "pnpm-lock.yaml"));
const goVersion = (await runCapture("go", ["version"], { cwd: root, env: goEnv })).stdout;
if (!goVersion.includes("go1.27.1")) {
  throw new Error("KG OS setup requires Go 1.27.1; got " + goVersion.trim());
}
await runCapture("cc", ["--version"], { cwd: root });

await run("pnpm", ["install", "--frozen-lockfile"], { cwd: root });
await run("go", ["mod", "download"], { cwd: root, env: goEnv });
await run("go", ["mod", "verify"], { cwd: root, env: goEnv });
await run("go", ["tool", "staticcheck", "-version"], { cwd: root, env: goEnv });
await run("go", ["tool", "govulncheck", "-version"], { cwd: root, env: goEnv });
await run(
  "go",
  [
    "test",
    "-tags=sqlite_fts5",
    "-run",
    "^TestSQLiteBuildProfile$",
    "-count=1",
    "./internal/lithographtest"
  ],
  { cwd: root, env: goEnv }
);
await run("pnpm", ["exec", "lefthook", "install"], { cwd: root });
await run("pnpm", ["exec", "playwright", "install", "--only-shell", "chromium"], {
  cwd: root
});
await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });

process.stdout.write("KG OS Phase 00 development environment is ready.\n");
