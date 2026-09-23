import { resolve } from "node:path";

import { currentLithographArtifact } from "./lithograph-artifacts.mjs";
import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
await run("node", ["scripts/prepare-lithograph.mjs"], { cwd: root });

const artifact = currentLithographArtifact(root);
const env = {
  ...process.env,
  CGO_ENABLED: "1",
  GOTOOLCHAIN: "go1.27.1",
  KGOS_LITHOGRAPH_LIBRARY: resolve(artifact.cacheDirectory, artifact.library),
  KGOS_LITHOGRAPH_PROVIDER_LIBRARY: resolve(artifact.cacheDirectory, artifact.providerLibrary)
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
    "./cmd/kg",
    "./cmd/kgosd"
  ],
  { cwd: root, env }
);
