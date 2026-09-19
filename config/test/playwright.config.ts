import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
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
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve-built-web.mjs --port 4173",
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4173"
  }
});
