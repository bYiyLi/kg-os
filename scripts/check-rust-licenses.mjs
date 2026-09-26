import { resolve } from "node:path";

import { runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const revision = "720b3fa794b3fe8163fba9088bb964b4c629aa33";
const allowed = new Set([
  "MIT",
  "Apache-2.0",
  "MIT OR Apache-2.0",
  "Apache-2.0 OR MIT",
  "MIT/Apache-2.0",
  "Unlicense OR MIT",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Zlib",
  "Zlib OR Apache-2.0 OR MIT",
  "MIT OR Apache-2.0 OR LGPL-2.1-or-later",
  "(MIT OR Apache-2.0) AND Unicode-3.0"
]);

const manifest = resolve(root, "native", "jieba", "Cargo.toml");
const result = await runCapture(
  "cargo",
  ["metadata", "--locked", "--manifest-path", manifest, "--format-version", "1"],
  { cwd: root }
);
const metadata = JSON.parse(result.stdout);
for (const dependency of metadata.packages) {
  if (dependency.name === "kgos-jieba") {
    if (dependency.license !== "AGPL-3.0-only") {
      throw new Error("KG OS Jieba wrapper license changed");
    }
    continue;
  }
  if (!allowed.has(dependency.license)) {
    throw new Error(`${dependency.name} has an unreviewed Rust license: ${dependency.license}`);
  }
}
for (const [name, version] of [
  ["sqlite-jieba-tokenizer", "0.6.0"],
  ["rusqlite-ext", "0.39.0"],
  ["jieba-rs", "0.9.0"]
]) {
  const dependency = metadata.packages.find((item) => item.name === name);
  if (
    dependency?.version !== version ||
    ((name === "sqlite-jieba-tokenizer" || name === "rusqlite-ext") &&
      !dependency.source?.includes(revision))
  ) {
    throw new Error(`${name} source or version differs from the reviewed official Jieba build`);
  }
}
process.stdout.write(
  `Rust Jieba license gate passed for ${metadata.packages.length - 1} dependencies\n`
);
