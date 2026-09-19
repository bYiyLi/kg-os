import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@kgos/cli": fileURLToPath(new URL("./packages/cli/src/index.ts", import.meta.url)),
      "@kgos/contracts": fileURLToPath(
        new URL("./packages/contracts/src/index.ts", import.meta.url)
      ),
      "@kgos/daemon": fileURLToPath(new URL("./packages/daemon/src/index.ts", import.meta.url)),
      "@kgos/kernel": fileURLToPath(new URL("./packages/kernel/src/index.ts", import.meta.url)),
      "@kgos/sdk": fileURLToPath(new URL("./packages/sdk/src/index.ts", import.meta.url))
    }
  },
  test: {
    coverage: {
      exclude: [
        "**/*.test.ts",
        // Thin process/browser entrypoints delegate to covered modules.
        "**/src/bin.ts",
        "**/src/dev.ts",
        "packages/web/src/main.ts",
        "**/dist/**"
      ],
      include: ["packages/{cli,contracts,daemon,kernel,sdk,web}/src/**/*.ts"],
      provider: "v8",
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    exclude: ["**/node_modules/**", "**/dist/**", "**/coverage/**", "tests/e2e/**"]
  }
});
