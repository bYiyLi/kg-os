import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

// Verify that the persisted Instance Origin, rather than a daemon flag, is
// the issuer used by the live MCP OAuth discovery endpoints.
export async function expectPersistedOriginAndOAuth(
  request: APIRequestContext,
  endpoint: string,
  workspace: string
) {
  const config = await readFile(join(workspace, ".kgos", "config.toml"), "utf8");
  expect(config).toContain("[server]");
  expect(config).toContain('public_origin = "https://kgos.example.com"');
  expect(config).toContain('analyzer = "jieba"');
  expect(config).toContain('base_url = "https://newapi.y2l.top/v1"');
  expect(config).toContain('model = "reverified-model"');
  expect(config).toContain("dimensions = 4096");
  expect(config).toContain('api_key_env = ""');

  const issuerMetadata = await request.get(endpoint + "/.well-known/oauth-authorization-server");
  expect(issuerMetadata.status()).toBe(200);
  expect((await issuerMetadata.json()) as { issuer: string }).toMatchObject({
    issuer: "https://kgos.example.com"
  });
  const resourceMetadata = await request.get(
    endpoint + "/.well-known/oauth-protected-resource/mcp"
  );
  expect(resourceMetadata.status()).toBe(200);
  expect(
    (await resourceMetadata.json()) as { resource: string; authorization_servers: string[] }
  ).toMatchObject({
    resource: "https://kgos.example.com",
    authorization_servers: ["https://kgos.example.com"]
  });
}

// Authenticated rotation revokes the previously issued administrator Token,
// even while the Setup wizard is still in its pre-initialized state.
export async function regenerateAndCheckOldToken(
  page: Page,
  request: APIRequestContext,
  endpoint: string
): Promise<string> {
  const oldToken = await page.locator("#setup-issued-token").inputValue();
  await page.getByRole("button", { name: "Regenerate access token" }).click();
  await expect(page.locator("#setup-issued-token")).not.toHaveValue(oldToken);
  await expect(page.getByText("administrator credential", { exact: false })).toBeVisible();
  await expect(page.getByText("takes effect immediately", { exact: false })).toBeVisible();
  const newToken = await page.locator("#setup-issued-token").inputValue();
  const obsoleteLogin = await request.post(endpoint + "/api/v1/web/auth/login", {
    headers: { Origin: endpoint, Authorization: "Bearer " + oldToken }
  });
  expect(obsoleteLogin.status()).toBe(401);
  return newToken;
}

export async function waitReady(url: string, request: APIRequestContext, workspace: string) {
  await expect
    .poll(
      async () => {
        let token: string;
        try {
          const credential = JSON.parse(
            await readFile(join(workspace, ".kgos", "auth.json"), "utf8")
          ) as { token: string };
          token = credential.token;
        } catch {
          return "waiting_for_credential";
        }
        const result = await request.get(url + "/api/v1/setup/status", {
          headers: { Authorization: "Bearer " + token }
        });
        if (result.status() !== 200) return "http_" + String(result.status());
        return ((await result.json()) as { state: string }).state;
      },
      { timeout: 35000 }
    )
    .toBe("ready");
}

// An isolated browser-only credential fixture for layout/field tests.
// It must not mutate the real first-run workspace before the E2E bootstrap test.
export async function mockSetupSessionForLayout(page: Page) {
  let issued = false;
  await page.route("**/api/v1/setup/rotate-token", async (route) => {
    issued = true;
    await route.fulfill({ status: 201, json: { token: "A".repeat(43) } });
  });
  await page.route("**/api/v1/web/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        accessToken: "kgws_" + "A".repeat(43),
        daemonBootId: "4ce99373-4158-4ed1-8309-b55ea866b023"
      }
    });
  });
  await page.route("**/api/v1/setup/status", async (route) => {
    if (!issued) {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      json: { state: "setup_required", credentialConfigured: true }
    });
  });
  return () => {
    issued = false;
  };
}

export async function enterOriginStep(page: Page) {
  await page.getByRole("button", { name: "Generate access token" }).click();
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

export async function enterVectorStep(page: Page) {
  await enterOriginStep(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
}

export async function startDaemon(root: string): Promise<{ child: ChildProcess; url: string }> {
  const bin = resolve(
    "artifacts",
    "runtime",
    process.platform + "-" + process.arch,
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

export async function useEmbeddingFixture(page: Page) {
  await page.route("**/api/v1/setup/validate-embedding", async (route) => {
    const request = route.request().postDataJSON() as { dimensions: number };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, dimensions: request.dimensions })
    });
  });
}
