import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");

for (const name of ["sdk", "cli"]) {
  const cwd = resolve(root, "packages", name);
  process.stdout.write("\nChecking package: @kgos/" + name + "\n");
  await run("pnpm", ["exec", "publint", "--strict"], { cwd });
}

const sdk = resolve(root, "packages/sdk");
await run("pnpm", ["exec", "attw", "--pack", ".", "--profile", "esm-only", "--quiet"], {
  cwd: sdk
});
