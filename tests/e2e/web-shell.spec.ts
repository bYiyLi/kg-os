import { expect, test } from "@playwright/test";
import type { Page, Route } from "@playwright/test";

import { mockVersionRoutes, states } from "./version-fixture.js";

const testBootID = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";
const secondBootID = "b6f0ba69-d40a-4819-9ed0-f09759c17292";
const webAccess = "kgws_" + "A".repeat(43);

async function mockInstance(page: Page) {
  const state = {
    bootID: testBootID,
    online: true,
    token: "valid-token",
    rootAtLogin: "valid-token",
    sessionValid: false
  };
  async function respond(route: Route, kind: "info" | "overview") {
    const headers = route.request().headers();
    if (!state.online) {
      await route.abort("failed");
    } else if (
      headers["authorization"] !== "Bearer " + webAccess ||
      state.rootAtLogin !== state.token
    ) {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" })
      });
    } else if (
      headers["x-kgos-expected-daemon-boot"] !== undefined &&
      headers["x-kgos-expected-daemon-boot"] !== state.bootID
    ) {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ code: "WEB_CONNECTION_CHANGED", message: "web connection changed" })
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          kind === "info"
            ? { daemonBootId: state.bootID, storageStatus: "unsupported" }
            : { defaultBranch: "main", state: states.main }
        )
      });
    }
  }
  await page.route("**/api/v1/web/auth/*", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    const headers = route.request().headers();
    if (name === "login" && headers["authorization"] === "Bearer " + state.token) {
      state.sessionValid = true;
      state.rootAtLogin = state.token;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: {
          "Set-Cookie":
            "kgos_ws_fixture=" +
            "B".repeat(43) +
            "; Path=/api/v1/web/auth; HttpOnly; SameSite=Strict; Max-Age=2592000"
        },
        body: JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootID })
      });
    } else if (
      name === "session" &&
      state.sessionValid &&
      state.rootAtLogin === state.token &&
      headers["cookie"]?.includes("kgos_ws_fixture=") === true
    ) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ accessToken: webAccess, daemonBootId: state.bootID })
      });
    } else if (name === "logout") {
      state.sessionValid = false;
      await route.fulfill({
        status: 204,
        headers: { "Set-Cookie": "kgos_ws_fixture=; Path=/api/v1/web/auth; Max-Age=0" }
      });
    } else {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" })
      });
    }
  });
  await page.route("**/api/v1/web/data/info", async (route) => respond(route, "info"));
  await page.route("**/api/v1/evolution/overview", async (route) => respond(route, "overview"));
  await mockVersionRoutes(page);
  return state;
}

async function authenticate(page: Page) {
  await mockInstance(page);
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
}

test("renders API-backed versions with a blank graph canvas", async ({ page }) => {
  await authenticate(page);

  await expect(page).toHaveTitle("KG OS");
  await expect(page.getByRole("heading", { name: "KG OS" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Version navigation" })).toBeVisible();
  await expect(page.locator(".version-sidebar .commit-item")).toHaveCount(8);
  await expect(page.locator(".version-sidebar .version-tree-heading")).toHaveCount(0);
  await expect(
    page.locator(".version-sidebar").getByRole("button", { name: "Filter branches" })
  ).toContainText("All branches");
  await expect(page.getByRole("region", { name: "Graph canvas" })).toBeVisible();
  await expect(page.locator(".workspace-controls")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await expect(page.locator(".sidebar-collapse-button")).toHaveCount(0);
  await expect(
    page.locator(".version-sidebar").getByRole("group", { name: "Appearance theme" })
  ).toBeVisible();
  await expect(page.locator(".canvas-toolbar button:disabled")).toHaveCount(5);

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".version-sidebar");
    const canvas = document.querySelector(".canvas-stage");
    const selected = document.querySelector('.version-sidebar .commit-row[aria-pressed="true"]');
    return {
      theme: shell?.getAttribute("data-theme"),
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
      sidebarBorder: sidebar === null ? "" : getComputedStyle(sidebar).borderTopWidth,
      sidebarBackground: sidebar === null ? "" : getComputedStyle(sidebar).backgroundColor,
      selectedBackground: selected === null ? "" : getComputedStyle(selected).backgroundColor,
      canvasBorder: canvas === null ? "" : getComputedStyle(canvas).borderTopWidth,
      canvasTop: canvas?.getBoundingClientRect().top ?? 0,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(metrics.theme).toBe("dark");
  expect(metrics.sidebarWidth).toBeGreaterThanOrEqual(240);
  expect(metrics.sidebarWidth).toBeLessThanOrEqual(320);
  expect(metrics.sidebarBorder).toBe("0px");
  expect(metrics.sidebarBackground).toBe("rgba(0, 0, 0, 0)");
  expect(metrics.selectedBackground).not.toBe("rgba(0, 0, 0, 0)");
  expect(metrics.canvasBorder).toBe("1px");
  expect(metrics.canvasTop).toBeLessThan(30);
  expect(metrics.horizontalOverflow).toBe(false);
  await expect(page.locator(".global-header")).toHaveCount(0);
  await expect(page.locator(".version-sidebar input[type=search]")).toHaveCount(1);
  await expect(page.locator(".canvas-stage input")).toHaveCount(0);
  await expect(page.getByText("Connected")).toHaveCount(0);
});

test("filters real Evolution-shaped commits across branches without changing the canvas", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const branchFilter = sidebar.getByRole("button", { name: "Filter branches" });
  const history = sidebar.locator(".commit-item");

  await expect(history).toHaveCount(8);
  await branchFilter.click();
  const choices = sidebar.getByRole("group", { name: "Filter branches" });
  await expect(choices.getByRole("checkbox")).toHaveCount(4);
  await expect(choices.getByRole("checkbox", { name: "main" })).toBeChecked();

  await choices.getByRole("checkbox", { name: "develop" }).uncheck();
  await expect(history).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "experiment" }).uncheck();
  await expect(history).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "main" }).uncheck();
  await expect(history).toHaveCount(4);
  await expect(sidebar.getByText("Update knowledge model")).toHaveCount(0);
  await choices.getByRole("checkbox", { name: "feature/search" }).uncheck();
  await expect(history).toHaveCount(0);
  await expect(sidebar.getByText("Select a branch to show commits.")).toBeVisible();

  await choices.getByRole("button", { name: "Select all" }).click();
  await expect(history).toHaveCount(8);
  await branchFilter.click();
  const search = sidebar.getByRole("searchbox", { name: "Search commits..." });
  await search.fill("7A1D9E");
  await expect(history).toHaveCount(1);
  await expect(sidebar.getByText("Add knowledge sources")).toBeVisible();
  await search.fill("unknown-hash");
  await expect(history).toHaveCount(0);
  await expect(sidebar.getByText("No matching commits.")).toBeVisible();
  await search.clear();
  await sidebar.getByRole("button", { name: /Fix node properties/ }).click();
  await expect(sidebar.getByRole("button", { name: /Fix node properties/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(page.getByRole("region", { name: "Graph canvas" })).toBeVisible();
  await expect(page.locator(".canvas-stage .commit-item")).toHaveCount(0);
});

test("switches themes and hides the entire sidebar from the canvas border", async ({ page }) => {
  await authenticate(page);
  const canvas = page.getByRole("region", { name: "Graph canvas" });
  const sidebar = page.getByRole("complementary", { name: "Version navigation" });
  const before = await canvas.boundingBox();
  const handle = page.getByRole("button", { name: "Collapse sidebar" });
  const handleBox = await handle.boundingBox();

  expect(handleBox).not.toBeNull();
  expect(before).not.toBeNull();
  expect(handleBox?.width).toBe(44);
  expect(handleBox?.height).toBe(112);
  await expect(handle.locator(".sidebar-handle-contour")).toHaveAttribute("viewBox", "0 0 44 112");
  // The longer, shallower S-curve joins the canvas edge without forming a separate tab.
  expect(Math.abs((handleBox?.x ?? 0) + 39 - (before?.x ?? 0))).toBeLessThan(1);
  expect(Math.abs((before?.x ?? 0) - ((handleBox?.x ?? 0) + 25) - 14)).toBeLessThan(1);
  const borderAppearance = await handle.evaluate((element) => {
    const canvas = document.querySelector(".canvas-stage");
    const surface = element.querySelector(".sidebar-handle-surface");
    const edge = element.querySelector(".sidebar-handle-edge");
    if (canvas === null || surface === null || edge === null) {
      throw new Error("Missing integrated border layers");
    }
    return {
      stroke: getComputedStyle(edge).stroke,
      border: getComputedStyle(canvas).borderLeftColor,
      fill: getComputedStyle(surface).fill,
      background: getComputedStyle(canvas).backgroundColor
    };
  });
  expect(borderAppearance.stroke).toBe(borderAppearance.border);
  expect(borderAppearance.fill).toBe(borderAppearance.background);
  expect(
    Math.abs(
      (handleBox?.y ?? 0) +
        (handleBox?.height ?? 0) / 2 -
        (before?.y ?? 0) -
        (before?.height ?? 0) / 2
    )
  ).toBeLessThan(3);

  const group = sidebar.getByRole("group", { name: "Appearance theme" });
  await group.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await group.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");

  await handle.click();
  await expect(page.locator(".app-shell")).toHaveClass(/is-sidebar-collapsed/);
  await expect(sidebar).toBeHidden();
  await expect.poll(async () => (await canvas.boundingBox())?.x ?? -1).toBe(12);
  const collapsedCanvas = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(collapsedCanvas).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect({
    top: Math.round(collapsedCanvas?.y ?? -1),
    right: Math.round(
      (viewport?.width ?? 0) - (collapsedCanvas?.x ?? 0) - (collapsedCanvas?.width ?? 0)
    ),
    bottom: Math.round(
      (viewport?.height ?? 0) - (collapsedCanvas?.y ?? 0) - (collapsedCanvas?.height ?? 0)
    ),
    left: Math.round(collapsedCanvas?.x ?? -1)
  }).toEqual({ top: 12, right: 12, bottom: 12, left: 12 });
  const expandHandle = page.getByRole("button", { name: "Expand sidebar" });
  const collapsedHandle = await expandHandle.boundingBox();
  expect(collapsedHandle).not.toBeNull();
  // The collapsed outline is mirrored inward: the border joins at x=5,
  // and its center protrudes 14px to the right of the canvas left edge.
  expect(collapsedHandle?.x).toBeGreaterThanOrEqual(0);
  expect(Math.abs((collapsedHandle?.x ?? 0) + 5 - (collapsedCanvas?.x ?? -1))).toBeLessThan(1);
  expect(Math.abs((collapsedHandle?.x ?? 0) + 19 - (collapsedCanvas?.x ?? 0) - 14)).toBeLessThan(1);
  const collapsedAppearance = await expandHandle.evaluate((element) => {
    const contour = element.querySelector(".sidebar-handle-contour");
    const surface = element.querySelector(".sidebar-handle-surface");
    const app = document.querySelector(".app-shell");
    if (contour === null || surface === null || app === null) {
      throw new Error("Missing collapsed border layers");
    }
    return {
      transform: getComputedStyle(contour).transform,
      fill: getComputedStyle(surface).fill,
      pageBackground: getComputedStyle(app).backgroundColor
    };
  });
  expect(collapsedAppearance.transform).toBe("matrix(-1, 0, 0, 1, 0, 0)");
  expect(collapsedAppearance.fill).toBe(collapsedAppearance.pageBackground);
  await expect(expandHandle.locator(".icon path")).toHaveAttribute("d", "m9 5 7 7-7 7");
  expect((await canvas.boundingBox())?.width).toBeGreaterThan(before?.width ?? 0);
  await expandHandle.click();
  await expect(sidebar).toBeVisible();
  await expect.poll(async () => (await canvas.boundingBox())?.x ?? -1).toBe(before?.x);
});

test("drags the center border handle and allows keyboard width adjustment", async ({ page }) => {
  await authenticate(page);
  const sidebar = page.getByRole("complementary", { name: "Version navigation" });
  const handle = page.getByRole("button", { name: "Collapse sidebar" });
  const before = await sidebar.boundingBox();
  const box = await handle.boundingBox();
  if (before === null || box === null) {
    throw new Error("Sidebar or resize handle is missing");
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 72, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBe(before.width + 72);
  await expect(sidebar).toBeVisible();

  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBe(before.width + 56);
  await handle.click();
  await expect(sidebar).toBeHidden();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect.poll(async () => (await sidebar.boundingBox())?.width ?? 0).toBe(before.width + 56);
});

test("keeps version navigation available at 320 CSS px without horizontal overflow", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await authenticate(page);

  await expect(page.getByRole("region", { name: "Graph canvas" })).toBeVisible();
  await expect(page.locator(".sidebar-handle")).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Version navigation" })).toBeHidden();
  const navigation = page.getByRole("button", { name: "Version navigation" });
  await expect(navigation).toHaveAttribute("title", "Version navigation");
  await expect(navigation).toHaveText("");
  await expect(navigation.locator("svg")).toHaveCount(1);
  const bounds = await navigation.boundingBox();
  expect(bounds?.width).toBe(44);
  expect(bounds?.height).toBe(44);
  await navigation.click();
  await expect(page.getByRole("dialog", { name: "Mobile version navigation" })).toBeVisible();
  await expect(page.locator(".version-drawer .commit-item")).toHaveCount(8);
  await page
    .getByRole("dialog", { name: "Mobile version navigation" })
    .getByRole("button", { name: "Light theme" })
    .click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Mobile version navigation" })).toBeHidden();

  await page.getByRole("button", { name: "Version navigation" }).click();
  await page.getByRole("button", { name: "Close version navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Mobile version navigation" })).toBeHidden();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
});

test("does not expose an API readiness bypass", async ({ request }) => {
  const encodedSlash = String.fromCharCode(0x25, 0x32, 0x46);
  const response = await request.get("/api/status");
  const encodedResponse = await request.get(`/api${encodedSlash}status`);

  expect(response.status()).toBe(404);
  expect(encodedResponse.status()).toBe(404);
});

test("requires authentication and cannot dismiss or interact with the background", async ({
  page
}) => {
  await mockInstance(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/is-auth-required/);
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeDisabled();
  await expect(dialog.locator("button[aria-label='Close']")).toHaveCount(0);
  await expect(page.locator(".version-sidebar .version-tree")).toHaveCSS("visibility", "hidden");
  await expect(page.locator(".version-sidebar")).toHaveCSS("filter", "blur(8px)");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.mouse.click(16, 16);
  await expect(dialog).toBeVisible();
  const backgroundTheme = page.locator(".version-sidebar").getByRole("button", {
    name: "Light theme"
  });
  await expect(backgroundTheme.click({ timeout: 500 })).rejects.toThrow();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");

  const token = page.getByLabel("Access Token", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await token.fill("wrong");
  await page.getByRole("button", { name: "Show access token" }).click();
  await expect(token).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide access token" }).click();
  await expect(token).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Invalid access token");
  await expect(token).toHaveValue("");
  await expect(dialog).toBeVisible();
});

test("authenticates with Bearer token, can disconnect, and never persists the token", async ({
  page
}) => {
  await authenticate(page);
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-auth-required/);
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  await page.getByRole("button", { name: "Disconnect" }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/is-auth-required/);
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toBeVisible();
  await expect(page.getByLabel("Access Token", { exact: true })).toHaveValue("");
});

test("keeps the mandatory authentication dialog usable at 320 CSS px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Access Token", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
  const measures = await page.evaluate(() => {
    const bounds = document.querySelector(".authentication-dialog")?.getBoundingClientRect();
    return {
      left: bounds?.left ?? -1,
      right: bounds?.right ?? 9999,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
  expect(measures.left).toBeGreaterThanOrEqual(0);
  expect(measures.right).toBeLessThanOrEqual(320);
  expect(measures.horizontalOverflow).toBe(false);
});

test("detects a daemon restart while the page is idle and requires explicit reconnection", async ({
  page
}) => {
  const daemon = await mockInstance(page);
  await page.goto("/");
  const token = page.getByLabel("Access Token", { exact: true });
  await token.fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  daemon.bootID = secondBootID;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const login = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(login).toBeVisible();
  await expect(login.getByRole("status")).toContainText("service has changed");
  await expect(page.locator(".app-shell")).toHaveClass(/is-auth-required/);
  await expect(token).toHaveValue("");
  await token.fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(login).toHaveCount(0);
});

test("requires a new token after a 401 on an established connection", async ({ page }) => {
  const daemon = await mockInstance(page);
  await page.goto("/");
  const token = page.getByLabel("Access Token", { exact: true });
  await token.fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  daemon.token = "new-token";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const login = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(login).toBeVisible();
  await expect(login.getByRole("status")).toContainText("no longer valid");
  await token.fill("new-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(login).toHaveCount(0);
});

test("keeps authentication mandatory after an outage until the user reconnects", async ({
  page
}) => {
  const daemon = await mockInstance(page);
  await page.goto("/");
  const token = page.getByLabel("Access Token", { exact: true });
  await token.fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  daemon.online = false;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const login = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(login).toBeVisible();
  await expect(login.getByRole("status")).toContainText("offline");
  daemon.online = true;
  await expect(login).toBeVisible();
  await token.fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(login).toHaveCount(0);
});

test("restores a valid Web Session after refresh without re-entering the root token", async ({
  page
}) => {
  await authenticate(page);
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  const sessionCookies = await page.context().cookies();
  const cookie = sessionCookies.find((entry) => entry.name === "kgos_ws_fixture");
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Disconnect" })).toBeVisible();
  await expect(page.getByLabel("Access Token", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
});

test("the persistent Web Session expires when the Instance root token is changed", async ({
  page
}) => {
  const daemon = await mockInstance(page);
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toHaveCount(0);
  daemon.token = "new-root-token";
  await page.reload();
  await expect(page.getByRole("dialog", { name: "Authentication Required" })).toBeVisible();
  await expect(page.getByLabel("Access Token", { exact: true })).toHaveValue("");
});
