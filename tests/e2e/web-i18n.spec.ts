import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  closePreferenceSettings,
  openPreferenceSettings,
  readOnlySettingsSnapshot,
  selectChineseLanguage
} from "./settings-navigation.js";
import { mockEmptyGraphQuery } from "./graph-empty-fixture.js";
import { mockVersionRoutes, states } from "./version-fixture.js";

async function mockConnectedInstance(page: Page) {
  let requestCount = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      (path.startsWith("/api/v1/evolution/") && !path.endsWith("/overview")) ||
      path === "/api/v1/ontology/read" ||
      path === "/api/v1/object/read"
    )
      requestCount++;
  });
  await page.route("**/api/v1/web/auth/login", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
        accessToken: "kgws_" + "A".repeat(43)
      }),
      headers: {
        "Set-Cookie":
          "kgos_ws_fixture=" +
          "B".repeat(43) +
          "; Path=/api/v1/web/auth; HttpOnly; SameSite=Strict; Max-Age=2592000"
      }
    });
  });
  await page.route("**/api/v1/web/data/info", async (route) => {
    requestCount++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
        storageStatus: "unsupported"
      })
    });
  });
  await page.route("**/api/v1/evolution/overview", async (route) => {
    requestCount++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ defaultBranch: "main", state: states.main })
    });
  });
  await page.route("**/api/v1/web/settings/read", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      headers: { "Cache-Control": "no-store" },
      body: JSON.stringify(readOnlySettingsSnapshot())
    });
  });
  await mockVersionRoutes(page);
  await mockEmptyGraphQuery(page, async (route, body) => {
    expect(route.request().headers()["authorization"]).toBe("Bearer kgws_" + "A".repeat(43));
    await route.fulfill({ json: body });
  });
  return () => requestCount;
}

async function authenticate(page: Page) {
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
}

test("persists an explicit language choice without saving the token", async ({ page }) => {
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Authentication Required" });
  const token = dialog.getByLabel("Access Token", { exact: true });
  await token.fill("unsaved-token");
  await dialog.getByRole("button", { name: "简体中文" }).click();
  await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
  await expect(page.getByLabel("访问令牌", { exact: true })).toHaveValue("unsaved-token");
  expect(
    await page.evaluate(() => ({
      lang: document.documentElement.lang,
      pref: localStorage.getItem("kgos.web.locale"),
      keys: Object.keys(localStorage),
      sessionKeys: Object.keys(sessionStorage)
    }))
  ).toEqual({ lang: "zh-CN", pref: "zh-CN", keys: ["kgos.web.locale"], sessionKeys: [] });

  await page.reload();
  await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
  await expect(page.getByLabel("访问令牌", { exact: true })).toHaveValue("");
  await page
    .getByRole("dialog", { name: "需要身份认证" })
    .getByRole("button", { name: "English" })
    .click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});

test.describe("Chinese browser preference", () => {
  test.use({ locale: "zh-CN" });

  test("restores automatic Chinese language after clearing an English override", async ({
    page
  }) => {
    await page.goto("/");
    const controls = page
      .getByRole("dialog", { name: "需要身份认证" })
      .getByRole("group", { name: "界面语言" });
    await controls.getByRole("button", { name: "English" }).click();
    expect(await page.evaluate(() => localStorage.getItem("kgos.web.locale"))).toBe("en");
    await page
      .getByRole("dialog", { name: "Authentication Required" })
      .getByRole("button", { name: "Follow system language" })
      .click();
    await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("kgos.web.locale"))).toBeNull();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
  });

  test("selects Chinese on the first visit, but permits an English override", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("zh-CN");
    await page
      .getByRole("dialog", { name: "需要身份认证" })
      .getByRole("button", { name: "English" })
      .click();
    await page.reload();
    await expect(page.getByRole("dialog", { name: "Authentication Required" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
  });
});

test("retranslates an existing authentication error without re-sending credentials", async ({
  page
}) => {
  let requests = 0;
  await page.route("**/api/v1/web/auth/login", async (route) => {
    requests++;
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "do not display this" })
    });
  });
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Invalid access token");
  await page
    .getByRole("dialog", { name: "Authentication Required" })
    .getByRole("button", { name: "简体中文" })
    .click();
  await expect(page.getByRole("alert")).toContainText("访问令牌无效");
  expect(requests).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "需要身份认证" })).toBeVisible();
});

test("supports switching inside the mobile drawer at narrow widths", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  const getRequestCount = await mockConnectedInstance(page);
  await authenticate(page);
  await page.getByRole("button", { name: "Version navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Mobile version navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".commit-item")).toHaveCount(0);
  await expect(
    drawer.getByRole("button", { name: "View history: main", exact: true })
  ).toBeVisible();
  await expect(drawer.getByRole("button", { name: "Work", exact: true })).toBeVisible();
  const before = getRequestCount();
  const settings = await openPreferenceSettings(page);
  await expect(drawer).toBeHidden();
  await selectChineseLanguage(settings);
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
  await closePreferenceSettings(page);
  await expect(page.getByRole("button", { name: "版本导航", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "版本导航", exact: true }).click();
  const chineseDrawer = page.getByRole("dialog", { name: "移动端版本导航" });
  await expect(chineseDrawer).toBeVisible();
  await expect(chineseDrawer.getByRole("heading", { name: "知识世界", exact: true })).toBeVisible();
  await expect(chineseDrawer.getByRole("button", { name: "main", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(chineseDrawer.locator(".world-section")).toHaveCount(4);
  await expect(
    chineseDrawer.getByRole("button", { name: "查看历史：main", exact: true })
  ).toBeVisible();
  expect(getRequestCount()).toBe(before);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
});

test("translates the existing MCP consent modal without repeating the OAuth request", async ({
  page
}) => {
  await mockConnectedInstance(page);
  let oauthRequests = 0;
  await page.route("**/oauth/request?*", async (route) => {
    oauthRequests++;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        client_id: "https://chatgpt.com/oauth/client.json",
        client_name: "ChatGPT",
        client_kind: "cimd",
        redirect_host: "chatgpt.com",
        redirect_origin: "https://chatgpt.com",
        redirect_path: "/connector_platform_oauth_redirect",
        loopback: false,
        resource: "https://kgos.example.com",
        scope: "mcp",
        canWrite: true,
        expires_at: "2099-01-01T00:00:00Z"
      })
    });
  });
  await page.goto("/?mcp_authorization=" + "r".repeat(43));
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Authorize Connection" });
  await expect(modal.getByText("This connection includes write access.")).toBeVisible();
  const before = oauthRequests;
  await modal.getByRole("button", { name: "简体中文" }).click();
  await expect(page.getByRole("dialog", { name: "授权连接" })).toBeVisible();
  await expect(page.getByText("此连接包含写入权限。")).toBeVisible();
  expect(oauthRequests).toBe(before);
});
