import { readFile } from "node:fs/promises";
import { join } from "node:path";

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

// Claiming a new administrator Token revokes the previously issued one,
// even while the Setup wizard itself is still in its pre-initialized state.
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
