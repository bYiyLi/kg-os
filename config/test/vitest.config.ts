import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root: repoRoot,
  resolve: {
    alias: {
      "@kgos/sdk": fileURLToPath(new URL("../../packages/sdk/src/index.ts", import.meta.url))
    }
  },
  test: {
    coverage: {
      exclude: [
        "**/*.test.ts",
        // Thin process/browser entrypoints delegate to covered modules.
        "**/src/bin.ts",
        "**/src/dev.ts",
        "**/src/types.ts",
        "packages/web/src/main.tsx",
        "**/dist/**"
      ],
      include: ["packages/{sdk,web}/src/**/*.{ts,tsx}"],
      provider: "v8",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**", ".cache/**", "tests/e2e/**"]
  }
});
