import { access } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const config = resolve(root, "config/quality/secretlint.json");
await access(config);

const targets = [
  ".npmrc",
  "README.md",
  "config/**/*.{json,yaml,yml,js,cjs,mjs,ts}",
  "docs/**/*.md",
  "packages/**/*.{ts,tsx,html,css,json}",
  "scripts/**/*.mjs",
  "tests/**/*.{ts,mjs}",
  "cmd/**/*.go",
  "internal/**/*.go",
  "go.mod",
  "go.sum",
  "*.{js,cjs,mjs,ts,json,yaml,yml}",
  ".github/**/*.yml",
  ".vscode/**/*.json"
];

await run("pnpm", ["exec", "secretlint", "--secretlintrc", config, ...targets], {
  cwd: root
});
