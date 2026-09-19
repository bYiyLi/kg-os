import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const packageDirectories = ["contracts", "kernel", "daemon", "sdk", "cli"];

for (const directory of packageDirectories) {
  const cwd = resolve(root, "packages", directory);
  process.stdout.write(`\nChecking package exports: @kgos/${directory}\n`);
  await run("pnpm", ["exec", "publint", "--strict"], { cwd });
  await run("pnpm", ["exec", "attw", "--pack", ".", "--profile", "esm-only", "--quiet"], {
    cwd
  });
}
