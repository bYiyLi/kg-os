import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    sourcemap: true
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@kgos/sdk": fileURLToPath(new URL("../sdk/src/index.ts", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:4765",
      "/control": "http://127.0.0.1:4765"
    }
  }
});
