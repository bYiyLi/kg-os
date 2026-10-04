import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  tsconfig: fileURLToPath(new URL("./tsconfig.test.json", import.meta.url)),
  expect: { timeout: 5_000 },
  fullyParallel: true,
  outputDir: fileURLToPath(new URL("../../test-results", import.meta.url)),
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: fileURLToPath(new URL("../../playwright-report", import.meta.url))
      }
    ]
  ],
  retries: process.env["CI"] === undefined ? 0 : 2,
  testDir: fileURLToPath(new URL("../../tests/e2e", import.meta.url)),
  timeout: 30_000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "pnpm serve:e2e",
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4173"
  }
});
