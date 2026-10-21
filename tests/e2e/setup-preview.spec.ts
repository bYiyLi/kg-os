// cspell:words qwen qwen3

import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import {
  expectPersistedOriginAndOAuth,
  regenerateAndCheckOldToken
} from "./setup-acceptance-helpers.js";

test.describe.configure({ mode: "serial" });

let workspace: string;
let daemon: ChildProcess;
let endpoint: string;

async function startDaemon(root: string): Promise<{ child: ChildProcess; url: string }> {
  const bin = resolve(
    "artifacts",
    "npm",
    "runtime-" + process.platform + "-" + process.arch,
    process.platform === "win32" ? "kgosd.exe" : "kgosd"
  );
  const child = spawn(bin, ["--root", root], { stdio: "ignore" });
  const locator = join(root, ".kgos", "kgosd.lock");
  const limit = Date.now() + 20000;
  while (Date.now() < limit && child.exitCode === null) {
    try {
      const data: unknown = JSON.parse(await readFile(locator, "utf8"));
      if (
        typeof data === "object" &&
        data !== null &&
        "endpoint" in data &&
        typeof data.endpoint === "string" &&
        data.endpoint.startsWith("http://")
      ) {
        return { child, url: data.endpoint };
      }
    } catch {
      // Wait for the daemon to atomically publish its locator.
    }
    await new Promise((done) => setTimeout(done, 60));
  }
  throw new Error("KG OS setup daemon did not start");
}

async function stopDaemon(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await new Promise<void>((done) => {
    child.once("exit", () => {
      done();
    });
    setTimeout(done, 5000);
  });
}

test.beforeAll(async () => {
  workspace = await mkdtemp(join(tmpdir(), "kgos-first-run-e2e-"));
  const started = await startDaemon(workspace);
  daemon = started.child;
  endpoint = started.url;
});

test.afterAll(async () => {
  await stopDaemon(daemon);
  await rm(workspace, { recursive: true, force: true });
});

async function useEmbeddingFixture(page: Page) {
  await page.route("**/api/v1/setup/validate-embedding", async (route) => {
    const request = route.request().postDataJSON() as { dimensions: number };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, dimensions: request.dimensions })
    });
  });
}

test("uninitialized Instance serves setup but gates every business API before authentication", async ({
  page,
  request
}) => {
  const status = await request.get(endpoint + "/api/v1/setup/status");
  expect(status.status()).toBe(200);
  await expect(status).toBeOK();
  expect(((await status.json()) as { state: string }).state).toBe("setup_required");

  const denied = await request.post(endpoint + "/api/v1/evolution/overview", {
    headers: { Authorization: "Bearer wrong" },
    data: {}
  });
  expect(denied.status()).toBe(503);
  expect(((await denied.json()) as { code: string }).code).toBe("INSTANCE_NOT_INITIALIZED");

  await page.goto(endpoint + "/");
  await expect(page).toHaveURL(/\/setup$/);
  await expect(page.getByRole("heading", { name: "Welcome to KG OS" })).toBeVisible();
  await expect(page.locator(".setup-step-dot")).toHaveCount(5);
});

test("setup keeps its step rail, progress and buttons anchored across screen sizes", async ({
  page
}) => {
  await useEmbeddingFixture(page);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 375, height: 812 },
    { width: 320, height: 700 }
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(endpoint + "/setup");
    await expect(page.locator(".setup-stepper ol")).toBeVisible();
    const anchors = async () =>
      page.evaluate(() => {
        function box(selector: string) {
          const element = document.querySelector(selector);
          if (element === null) throw new Error("Missing setup element: " + selector);
          const rect = element.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height].map((number) => Math.round(number));
        }
        return {
          steps: box(".setup-stepper ol"),
          progress: box(".setup-page-progress"),
          previous: box(".setup-button-secondary"),
          next: box(".setup-button-primary"),
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        };
      });
    const start = await anchors();
    expect(start.overflow).toBe(false);
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    expect(await anchors()).toEqual(start);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    expect(await anchors()).toEqual(start);
    await expect(page.locator(".setup-auth-tagline")).toBeVisible();
    await expect(page.locator(".setup-auth-intro")).toHaveCount(2);
    await expect(page.locator(".setup-auth-guidance")).toBeVisible();
    await page.locator(".setup-form-content").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    expect(await anchors()).toEqual(start);
  }
});

test("public origin is prefilled, editable and rejects non-HTTPS external addresses", async ({
  page
}) => {
  await page.goto(endpoint + "/setup");
  await page.getByRole("button", { name: "Get started" }).click();
  const origin = page.locator("#setup-public-origin");
  const next = page.getByRole("button", { name: "Next", exact: true });
  await expect(origin).toHaveValue(endpoint);
  await expect(page.locator(".setup-public-preview code")).toHaveText(endpoint + "/mcp");
  await expect(page.locator(".setup-public-guidance")).toContainText(
    "ChatGPT Cloud cannot connect"
  );
  await origin.fill("https://kgos.example.com/mcp");
  await expect(next).toBeDisabled();
  await origin.fill("http://example.com");
  await expect(next).toBeDisabled();
  await origin.fill("https://kgos.example.com/");
  await expect(next).toBeEnabled();
  await expect(page.locator(".setup-public-preview code")).toHaveText(
    "https://kgos.example.com/mcp"
  );
  let verificationRequests = 0;
  await page.route("**/api/v1/setup/validate-embedding", (route) => {
    verificationRequests += 1;
    return route.fulfill({ json: { ok: false, reason: "authentication_failed" } });
  });
  await next.dblclick({ delay: 80 });
  await expect(page.getByRole("heading", { name: "Connect your vector service" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test connection" })).toBeVisible();
  expect(verificationRequests).toBe(0);
  await expect(page.locator('[data-slot="toast"]:not([data-ending-style])')).toHaveCount(0);
  await page.getByRole("button", { name: "Back" }).click();
  await expect(origin).toHaveValue("https://kgos.example.com");
});

test("vector verification errors use the Base UI Toast component, not inline feedback", async ({
  page
}) => {
  await page.goto(endpoint + "/setup");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.route("**/api/v1/setup/validate-embedding", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({ ok: false, reason: "authentication_failed", httpStatus: 401 })
    });
  });
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.locator("[data-slot=toast]:not([data-ending-style])")).toContainText(
    "Verification failed"
  );
  await expect(page.locator("[data-slot=toast]:not([data-ending-style])")).toContainText(
    "Missing or invalid API key"
  );
  await expect(page.locator(".setup-form-content [role=alert]")).toHaveCount(0);
  await expect(page.locator(".setup-vector-immutable")).toHaveCount(0);
});

test("Web wizard claims administrator token and bootstraps the real database", async ({
  page,
  request
}) => {
  test.setTimeout(120000);
  await page.goto(endpoint + "/setup");
  await page.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("heading", { name: "Configure external access" })).toBeVisible();
  await expect(page.locator("#setup-public-origin")).toHaveValue(endpoint);
  await page.locator("#setup-public-origin").fill("https://kgos.example.com/");
  await expect(page.locator(".setup-public-preview code")).toHaveText(
    "https://kgos.example.com/mcp"
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Connect your vector service" })).toBeVisible();
  await expect(page.locator(".setup-vector-tagline")).toContainText("Find knowledge by meaning");
  await expect(page.locator(".setup-vector-card-header p")).toHaveCount(2);
  await expect(page.getByRole("heading", { name: "Verify your vector service" })).toBeVisible();
  await expect(page.locator("#setup-url")).toHaveValue("https://newapi.y2l.top/v1");
  await expect(page.locator("#setup-model")).toHaveValue("qwen/qwen3-embedding-8b");
  await expect(page.locator("#setup-dimensions")).toHaveValue("4096");
  await useEmbeddingFixture(page);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  await expect(page.locator("[data-slot=toast]:not([data-ending-style])")).toContainText(
    "Model output 4096 dimensions"
  );
  await expect(page.locator("[data-slot=toast]:not([data-ending-style])")).not.toContainText(
    "Missing or invalid API key"
  );
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Protect your KG OS Instance" })).toBeVisible();
  await expect(page.locator(".setup-auth-tagline")).toContainText("secure administrator access");
  await expect(page.locator(".setup-auth-intro")).toHaveCount(2);
  await expect(page.getByText("administrator credential", { exact: false })).toBeVisible();
  await expect(page.getByText("takes effect immediately", { exact: false })).toBeVisible();
  await expect(page.getByText(".kgos/auth.json", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  let rejectFirstSession = true;
  await page.route("**/api/v1/web/auth/login", async (route) => {
    if (rejectFirstSession) {
      rejectFirstSession = false;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ code: "WEB_SESSION_UNAVAILABLE", message: "Retry Web login" })
      });
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Generate access token" }).click();
  await expect(page.getByRole("heading", { name: "Access token created" })).toBeVisible();
  await expect(page.getByText("takes effect immediately", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.getByText("not signed in", { exact: false })).toBeVisible();
  const firstToken = await page.locator("#setup-issued-token").inputValue();
  // The initial Web login failed: regeneration must still work without the
  // previous Token or an authenticated Web Session.
  await page.getByRole("button", { name: "Regenerate access token" }).click();
  await expect(page.locator("#setup-issued-token")).not.toHaveValue(firstToken);
  await expect(page.locator("#setup-existing-token")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  // Real daemon route: claimed Token must not block setup validation before config is published.
  // The loopback destination is denied locally, so no provider request or secret is sent.
  const afterClaimProbe = await request.post(endpoint + "/api/v1/setup/validate-embedding", {
    headers: { Origin: endpoint, "Sec-Fetch-Site": "same-origin" },
    data: {
      base_url: "https://127.0.0.1/v1",
      model: "test-model",
      dimensions: 3,
      similarity: "cosine",
      apiKey: null
    }
  });
  expect(afterClaimProbe.status()).toBe(422);
  expect(await afterClaimProbe.json()).toMatchObject({
    ok: false,
    reason: "address_not_allowed"
  });
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.locator("#setup-model").fill("reverified-model");
  await page.getByRole("button", { name: "Test connection" }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Generate access token", exact: true })
  ).toHaveCount(0);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy token" }).click();
  await expect(
    page.locator('[data-slot="toast"][data-type="success"]:not([data-ending-style])')
  ).toContainText("Token copied");
  const claimedToken = await page.locator("#setup-issued-token").inputValue();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(claimedToken);
  await expect(page.getByRole("status", { name: "" })).toContainText(
    "Instance authentication is complete."
  );
  await expect(page.locator("#setup-issued-token")).toHaveValue(/.{40,}/);
  const issuedToken = await regenerateAndCheckOldToken(page, request, endpoint);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Initialize knowledge base" })).toBeVisible();
  await page.getByRole("button", { name: "Initialize knowledge base", exact: true }).click();

  await expect
    .poll(
      async () => {
        const response = await request.get(endpoint + "/api/v1/setup/status");
        return ((await response.json()) as { state: string }).state;
      },
      { timeout: 80000 }
    )
    .toBe("ready");

  await expect.poll(() => page.url(), { timeout: 15000 }).not.toContain("/setup");
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  await expect(page.locator(".app-shell.is-auth-required")).toHaveCount(0);
  const receipt = JSON.parse(
    await readFile(join(workspace, ".kgos", "initialized.json"), "utf8")
  ) as { version: number };
  expect(receipt.version).toBe(1);
  await expectPersistedOriginAndOAuth(request, endpoint, workspace);
  await stat(join(workspace, ".kgos", "kgos.db"));
  const locked = await request.post(endpoint + "/api/v1/setup/claim");
  expect(locked.status()).toBe(409);
  const lockedRotation = await request.post(endpoint + "/api/v1/setup/rotate-token");
  expect(lockedRotation.status()).toBe(409);
  const authorized = await request.post(endpoint + "/api/v1/evolution/overview", {
    headers: { Authorization: "Bearer " + issuedToken },
    data: {}
  });
  expect(authorized.status()).toBe(200);
  expect(((await authorized.json()) as { defaultBranch: string }).defaultBranch).toBe("main");
});

test("restarts the same initialized Instance without allowing a second setup", async ({
  request
}) => {
  test.setTimeout(45000);
  await stopDaemon(daemon);
  const previous = endpoint;
  const started = await startDaemon(workspace);
  daemon = started.child;
  endpoint = started.url;
  expect(endpoint).not.toBe("");
  await expect
    .poll(
      async () => {
        const ready = await request.get(endpoint + "/api/v1/setup/status");
        return ((await ready.json()) as { state: string }).state;
      },
      { timeout: 15000 }
    )
    .toBe("ready");
  const html = await request.get(endpoint + "/setup", { maxRedirects: 0 });
  expect(html.status()).toBe(302);
  expect(html.headers()["location"]).toBe("/");
  const file = await readFile(join(workspace, ".kgos", "config.toml"), "utf8");
  expect(file).toContain("reverified-model");
  const issuer = await request.get(endpoint + "/.well-known/oauth-authorization-server");
  expect((await issuer.json()) as { issuer: string }).toMatchObject({
    issuer: "https://kgos.example.com"
  });
  expect(previous).toMatch(/^http:\/\//);
});

async function waitReady(url: string, request: APIRequestContext) {
  await expect
    .poll(
      async () => {
        const result = await request.get(url + "/api/v1/setup/status");
        return ((await result.json()) as { state: string }).state;
      },
      { timeout: 35000 }
    )
    .toBe("ready");
}

test("manual TOML starts automatically and resumes with the existing database and Token", async ({
  request
}) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "kgos-toml-first-e2e-"));
  let child: ChildProcess | null = null;
  try {
    await mkdir(join(root, ".kgos"), { mode: 0o700 });
    const config = [
      "[cache]",
      'path = "cache/openai-compatible.db"',
      "max_size_mb = 4096",
      "[sqlite]",
      "[fulltext]",
      'analyzer = "jieba"',
      "[embedding]",
      'base_url = "https://api.openai.com/v1"',
      'model = "text-embedding-3-small"',
      "dimensions = 1536",
      'similarity = "cosine"',
      'api_key_env = ""',
      ""
    ].join("\n");
    await writeFile(join(root, ".kgos", "config.toml"), config, { mode: 0o600 });
    const first = await startDaemon(root);
    child = first.child;
    await waitReady(first.url, request);
    const credential = JSON.parse(await readFile(join(root, ".kgos", "auth.json"), "utf8")) as {
      token: string;
    };
    const before = await request.post(first.url + "/api/v1/evolution/overview", {
      headers: { Authorization: "Bearer " + credential.token },
      data: {}
    });
    expect(before.status()).toBe(200);
    const state = ((await before.json()) as { state: string }).state;
    await stopDaemon(child);
    await unlink(join(root, ".kgos", "initialized.json"));
    const resumed = await startDaemon(root);
    child = resumed.child;
    await waitReady(resumed.url, request);
    const after = await request.post(resumed.url + "/api/v1/evolution/overview", {
      headers: { Authorization: "Bearer " + credential.token },
      data: {}
    });
    expect(after.status()).toBe(200);
    expect(((await after.json()) as { state: string }).state).toBe(state);
    const restored = JSON.parse(await readFile(join(root, ".kgos", "auth.json"), "utf8")) as {
      token: string;
    };
    expect(restored.token).toBe(credential.token);
  } finally {
    if (child !== null) await stopDaemon(child);
    await rm(root, { recursive: true, force: true });
  }
});

test("Web-provided embedding key stays private and survives a restart", async ({
  page,
  request
}) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "kgos-key-first-e2e-"));
  let child: ChildProcess | null = null;
  const key = "test-embedding-credential-only";
  try {
    const first = await startDaemon(root);
    child = first.child;
    await page.goto(first.url + "/setup");
    await useEmbeddingFixture(page);
    await page.getByRole("button", { name: "Get started" }).click();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.locator("#setup-key").fill(key);
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("button", { name: "Next", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Generate access token" }).click();
    await expect(page.locator("#setup-issued-token")).toHaveValue(/.{40,}/);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Initialize knowledge base", exact: true }).click();
    await waitReady(first.url, request);

    const config = await readFile(join(root, ".kgos", "config.toml"), "utf8");
    expect(config).toContain('api_key_env = "KGOS_WEB_EMBEDDING_API_KEY"');
    expect(config).not.toContain(key);
    expect(await readFile(join(root, ".kgos", "embedding-api-key"), "utf8")).toBe(key);
    expect((await stat(join(root, ".kgos", "embedding-api-key"))).mode & 0o777).toBe(0o600);
    expect(await readFile(join(root, ".kgos", "auth.json"), "utf8")).not.toContain(key);

    await stopDaemon(child);
    const resumed = await startDaemon(root);
    child = resumed.child;
    await waitReady(resumed.url, request);
    expect(await readFile(join(root, ".kgos", "embedding-api-key"), "utf8")).toBe(key);
  } finally {
    if (child !== null) await stopDaemon(child);
    await rm(root, { recursive: true, force: true });
  }
});

test("invalid operator configuration never creates a database or completion receipt", async ({
  request,
  page
}) => {
  const root = await mkdtemp(join(tmpdir(), "kgos-invalid-toml-e2e-"));
  let child: ChildProcess | null = null;
  try {
    await mkdir(join(root, ".kgos"), { mode: 0o700 });
    await writeFile(join(root, ".kgos", "config.toml"), "invalid = true\n", { mode: 0o600 });
    const started = await startDaemon(root);
    child = started.child;
    await expect
      .poll(
        async () => {
          const response = await request.get(started.url + "/api/v1/setup/status");
          return ((await response.json()) as { state: string }).state;
        },
        { timeout: 15000 }
      )
      .toBe("error");
    const denied = await request.post(started.url + "/api/v1/evolution/overview", { data: {} });
    expect(denied.status()).toBe(503);
    await page.goto(started.url + "/setup");
    await expect(page.getByRole("heading", { name: "Instance needs attention" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate access token" })).toHaveCount(0);
    await expect(async () => {
      await stat(join(root, ".kgos", "initialized.json"));
    }).rejects.toThrow();
    await expect(async () => {
      await stat(join(root, ".kgos", "kgos.db"));
    }).rejects.toThrow();
  } finally {
    if (child !== null) await stopDaemon(child);
    await rm(root, { recursive: true, force: true });
  }
});
