import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parse } from "yaml";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const configPath = resolve(root, "config/quality/markdownlint-cli2.yaml");
const settings = parse(await readFile(configPath, "utf8"));
for (const field of ["globs", "ignores"]) {
  if (
    !Array.isArray(settings?.[field]) ||
    !settings[field].every((glob) => typeof glob === "string" && glob.trim() !== "")
  ) {
    throw new Error("Markdown " + field + " must be an array of nonempty patterns");
  }
}
if (settings.globs.length === 0) {
  throw new Error("Markdown gate requires at least one input pattern");
}
// The rule engine reads /config; selection still has one owner in the same YAML.
// Knip records this dynamically invoked CLI in ignoreDependencies.
await run(
  "pnpm",
  [
    "exec",
    "markdownlint",
    "--config",
    configPath,
    "--configPointer",
    "/config",
    "--dot",
    ...settings.globs,
    ...settings.ignores.flatMap((glob) => ["--ignore", glob])
  ],
  { cwd: root }
);
