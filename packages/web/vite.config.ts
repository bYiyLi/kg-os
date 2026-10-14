import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devEndpoint = process.env["KGOS_DEV_ENDPOINT"];

export default defineConfig(({ mode }) => ({
  build: {
    emptyOutDir: true,
    outDir: mode === "mcp" ? "dist-mcp" : "dist",
    sourcemap: true,
    ...(mode === "mcp"
      ? { rollupOptions: { input: fileURLToPath(new URL("./mcp.html", import.meta.url)) } }
      : {})
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
    ...(devEndpoint === undefined
      ? {}
      : {
          proxy: {
            // Preserve the browser-facing Host: Web Session enforces Origin === Host.
            "/api": { target: devEndpoint, changeOrigin: false }
          }
        })
  }
}));
