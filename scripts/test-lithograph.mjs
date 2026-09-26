import { resolve } from "node:path";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";
import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });
await run("node", ["scripts/prepare-jieba.mjs"], { cwd: root });

const artifact = currentLithographArtifact(root);
const baseEnv = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1"
};
const env = {
  ...baseEnv,
  KGOS_LITHOGRAPH_LIBRARY: resolve(artifact.cacheDirectory, artifact.library),
  KGOS_LITHOGRAPH_PROVIDER_LIBRARY: resolve(artifact.cacheDirectory, artifact.providerLibrary),
  KGOS_JIEBA_LIBRARY: resolve(
    root,
    "artifacts",
    "jieba",
    "release",
    process.platform === "darwin"
      ? "libkgos_jieba.dylib"
      : process.platform === "win32"
        ? "kgos_jieba.dll"
        : "libkgos_jieba.so"
  )
};

await run(
  "go",
  [
    "test",
    "-tags=sqlite_fts5,lithograph_smoke",
    "-count=1",
    "./internal/lithograph",
    "./internal/runtime",
    "./internal/lithographtest",
    "./internal/kernel",
    "./internal/daemon",
    "./cmd/kgosd"
  ],
  { cwd: root, env }
);
