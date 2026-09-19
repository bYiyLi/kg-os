import { defineConfig } from "@playwright/test";

export default defineConfig({
  expect: { timeout: 5_000 },
  fullyParallel: true,
  reporter: [["list"], ["html", { open: "never" }]],
  retries: process.env["CI"] === undefined ? 0 : 2,
  testDir: "tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node scripts/serve-built-web.mjs --port 4173",
    reuseExistingServer: false,
    timeout: 30_000,
    url: "http://127.0.0.1:4173"
  }
});
