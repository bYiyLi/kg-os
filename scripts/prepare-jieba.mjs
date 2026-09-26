import { resolve } from "node:path";

import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const manifest = resolve(root, "native", "jieba", "Cargo.toml");
const targetDirectory = resolve(root, "artifacts", "jieba");
const version = (await runCapture("rustc", ["--version"], { cwd: root })).stdout.trim();
if (!version.startsWith("rustc 1.97.1 ")) {
  throw new Error("KG OS Jieba build requires Rust 1.97.1; got " + version);
}
await run("cargo", ["build", "--manifest-path", manifest, "--release", "--locked"], {
  cwd: root,
  env: { ...process.env, CARGO_TARGET_DIR: targetDirectory }
});

export const JIEBA_LIBRARY = resolve(
  targetDirectory,
  "release",
  process.platform === "darwin" ? "libkgos_jieba.dylib" : "libkgos_jieba.so"
);

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  process.stdout.write("Built official Jieba: " + JIEBA_LIBRARY + "\n");
}
