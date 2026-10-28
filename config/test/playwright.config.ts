import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env["KGOS_E2E_PORT"] ?? 4173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("KGOS_E2E_PORT must be an integer from 1 to 65535");
}
const baseURL = `http://127.0.0.1:${String(port)}`;

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
    baseURL,
    trace: "retain-on-failure"
  },
  webServer: {
    command: `node scripts/serve-built-runtime.mjs --port ${String(port)}`,
    cwd: repoRoot,
    reuseExistingServer: false,
    timeout: 30_000,
    url: baseURL
  }
});
