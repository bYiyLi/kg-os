import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const cwd = resolve(root, "packages/sdk");

process.stdout.write("\nChecking package exports: @kgos/sdk\n");
await run("pnpm", ["exec", "publint", "--strict"], { cwd });
await run("pnpm", ["exec", "attw", "--pack", ".", "--profile", "esm-only", "--quiet"], {
  cwd
});
