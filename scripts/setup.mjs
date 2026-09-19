import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
await access(resolve(root, "pnpm-lock.yaml"));
await run("pnpm", ["install", "--frozen-lockfile"], { cwd: root });
await run("pnpm", ["exec", "lefthook", "install"], { cwd: root });
await run("pnpm", ["exec", "playwright", "install", "--only-shell", "chromium"], {
  cwd: root
});
await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });
