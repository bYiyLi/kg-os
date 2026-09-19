import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true
  },
  resolve: {
    alias: {
      "@kgos/contracts": fileURLToPath(new URL("../contracts/src/index.ts", import.meta.url)),
      "@kgos/sdk": fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url))
    }
  }
});
