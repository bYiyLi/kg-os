import { expect, test } from "@playwright/test";

import { closePreferenceSettings, openPreferenceSettings } from "./settings-navigation.js";
import { authenticate, mockInstance, secondBootID } from "./web-shell-fixture.js";

test.use({ colorScheme: "dark" });

test("renders API-backed world navigation with a blank graph canvas", async ({ page }) => {
  await authenticate(page);

  await expect(page).toHaveTitle("KG OS");
  await expect(page.getByRole("heading", { name: "KG OS" })).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Version navigation" })).toBeVisible();
  await expect(page.locator(".version-sidebar .commit-item")).toHaveCount(0);
  const sidebar = page.locator(".version-sidebar");
  await expect(
    sidebar.getByRole("heading", { name: "Knowledge worlds", exact: true })
  ).toBeVisible();
  await expect(sidebar.locator(".world-section")).toHaveCount(4);
  await expect(sidebar.getByRole("button", { name: "main", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(
    sidebar.getByRole("button", { name: "View history: main", exact: true })
  ).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "Work", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Graph canvas" })).toBeVisible();
  await expect(page.locator(".workspace-controls")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await expect(page.locator(".sidebar-collapse-button")).toHaveCount(0);
  await expect(sidebar.locator(".sidebar-settings-button")).toHaveText("Settings");
  await expect(sidebar.locator(".sidebar-bottom button")).toHaveCount(1);
  await expect(page.locator(".graph-canvas-controls button:disabled")).toHaveCount(5);
  const graph = page.getByRole("region", { name: "Graph canvas" });
  await expect(graph.getByRole("group", { name: "Graph canvas", exact: true })).toBeVisible();
  await expect(graph.locator(".graph-node, .graph-relationship")).toHaveCount(0);

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    const sidebar = document.querySelector(".version-sidebar");
    const canvas = document.querySelector(".canvas-stage");
    const selected = document.querySelector('.version-sidebar button[aria-current="page"]');
    return {
      theme: shell?.getAttribute("data-theme"),
      sidebarWidth: sidebar?.getBoundingClientRect().width ?? 0,
      sidebarBorder: sidebar === null ? "" : getComputedStyle(sidebar).borderTopWidth,
      sidebarBackground: sidebar === null ? "" : getComputedStyle(sidebar).backgroundColor,
      pageBackground: shell === null ? "" : getComputedStyle(shell).backgroundColor,
      selectedColor: selected === null ? "" : getComputedStyle(selected).color,
      sidebarColor: sidebar === null ? "" : getComputedStyle(sidebar).color,
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
  // The new overlay navigation has an opaque page background so the
  // separate right card retains its own visible border and corners.
  expect(metrics.sidebarBackground).toBe(metrics.pageBackground);
  expect(metrics.selectedColor).not.toBe(metrics.sidebarColor);
  expect(metrics.canvasBorder).toBe("1px");
  expect(metrics.canvasTop).toBeLessThan(30);
  expect(metrics.horizontalOverflow).toBe(false);
  await expect(page.locator(".global-header")).toHaveCount(0);
  await expect(page.locator(".version-sidebar input[type=search]")).toHaveCount(1);
  const search = graph.getByRole("searchbox", { name: "Search knowledge", exact: true });
  await expect(search).toBeVisible();
  await expect(search).toBeEnabled();
  await expect(search).toHaveValue("");
  await expect(page.getByText("Connected")).toHaveCount(0);
});

test("follows system appearance until a persistent user override is chosen", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await authenticate(page);
  const shell = page.locator(".app-shell");
  let settings = await openPreferenceSettings(page);
  await expect(shell).toHaveAttribute("data-theme", "light");
  await expect(
    settings.getByRole("button", { name: "Follow system", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(shell).toHaveAttribute("data-theme", "dark");
  await settings.getByRole("button", { name: "Light", exact: true }).click();
  await expect(shell).toHaveAttribute("data-theme", "light");
  expect(await page.evaluate(() => localStorage.getItem("kgos.web.theme"))).toBe("light");
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  settings = await openPreferenceSettings(page);
  await settings.getByRole("button", { name: "Follow system", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("kgos.web.theme"))).toBeNull();
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
  // The independent card border stays two CSS pixels beyond the S-curve,
  // while the navigation handle remains integrated rather than a separate tab.
  expect(Math.abs((handleBox?.x ?? 0) + 41 - (before?.x ?? 0))).toBeLessThan(1);
  expect(Math.abs((before?.x ?? 0) - ((handleBox?.x ?? 0) + 25) - 16)).toBeLessThan(1);
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

  const settings = await openPreferenceSettings(page);
  await settings.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await settings.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  await closePreferenceSettings(page);

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
  await expect(expandHandle.locator(".icon.lucide-chevron-right")).toBeVisible();
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
  await expect(page.locator(".sidebar-handle")).toBeVisible();
  await expect(page.getByRole("complementary", { name: "Version navigation" })).toBeHidden();
  const navigation = page.locator(".sidebar-handle");
  await expect(page.locator(".mobile-versions-button")).toHaveCount(0);
  await expect(navigation).toHaveClass("sidebar-handle");
  await expect(navigation).toHaveAttribute("aria-controls", "kgos-version-drawer");
  await expect(navigation).toHaveAttribute("aria-expanded", "false");
  await expect(navigation).toHaveAttribute("title", "Version navigation");
  await expect(navigation).toHaveText("");
  await expect(navigation.locator(".sidebar-handle-contour")).toHaveCount(1);
  const bounds = await navigation.boundingBox();
  expect(bounds?.width).toBe(44);
  expect(bounds?.height).toBe(112);
  await navigation.click();
  await expect(page.getByRole("dialog", { name: "Mobile version navigation" })).toBeVisible();
  await expect(navigation).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".version-drawer .commit-item")).toHaveCount(0);
  const drawer = page.getByRole("dialog", { name: "Mobile version navigation" });
  const featureWorld = drawer.getByRole("button", { name: "feature/search", exact: true });
  await expect(featureWorld).toBeVisible();
  await featureWorld.click();
  await expect(featureWorld).toHaveAttribute("aria-current", "page");
  await expect(drawer.getByRole("button", { name: "main", exact: true })).not.toHaveAttribute(
    "aria-current",
    "page"
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
  const historyTrigger = drawer.getByRole("button", {
    name: "View history: feature/search",
    exact: true
  });
  await historyTrigger.click();
  const relationships = page.getByRole("dialog", { name: "Version relationships", exact: true });
  await expect(relationships).toBeVisible();
  await expect(relationships.locator(".version-dag-world")).toHaveText("feature/search");
  await expect(relationships.getByRole("button", { name: /Add hybrid search/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.keyboard.press("Escape");
  await expect(relationships).toBeHidden();
  await expect(drawer).toBeVisible();
  await expect(historyTrigger).toBeFocused();
  const drawerBounds = await page.locator(".version-drawer").boundingBox();
  expect(drawerBounds?.x).toBe(0);
  expect(drawerBounds?.y).toBe(0);
  const settings = await openPreferenceSettings(page);
  await expect(drawer).toBeHidden();
  await settings.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await closePreferenceSettings(page);
  await expect(navigation).toBeFocused();
  await expect(drawer).toBeHidden();

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
  const backgroundSettings = page.locator(".version-sidebar .sidebar-settings-button");
  await expect(backgroundSettings.click({ timeout: 500 })).rejects.toThrow();
  await expect(page.locator(".settings-dialog")).toHaveCount(0);
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");

  const token = page.getByLabel("Access Token", { exact: true });
  await expect(token).toHaveAttribute("type", "password");
  await expect(token).toHaveAttribute("data-slot", "input-group-control");
  const inputGroup = dialog.locator('[data-slot="input-group"]');
  await expect(inputGroup).toBeVisible();
  await token.fill("wrong");
  expect(await token.evaluate((input) => getComputedStyle(input).outlineStyle)).toBe("none");
  expect(await token.evaluate((input) => getComputedStyle(input).boxShadow)).not.toMatch(
    /\b[1-9]\d*px\b/
  );
  await expect(inputGroup).toHaveCSS("background-image", "none");
  const focusAppearance = await inputGroup.evaluate((field) => {
    const style = getComputedStyle(field);
    return {
      borderColor: style.borderColor,
      borderStyle: style.borderStyle,
      shadow: style.boxShadow
    };
  });
  expect(focusAppearance.borderStyle).toBe("solid");
  expect(focusAppearance.borderColor).not.toBe("rgba(0, 0, 0, 0)");
  expect(focusAppearance.shadow).toBe("none");
  await inputGroup.locator('[data-align="inline-start"]').click();
  await expect(token).toBeFocused();
  await page.getByRole("button", { name: "Show access token" }).click();
  await expect(token).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Hide access token" }).click();
  await expect(token).toHaveAttribute("type", "password");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("Invalid access token");
  expect(await inputGroup.evaluate((field) => getComputedStyle(field).boxShadow)).toBe("none");
  await expect(token).toHaveValue("");
  await expect(dialog).toBeVisible();
});

test("authenticates with Bearer token, can disconnect, and never persists the token", async ({
  page
}) => {
  await authenticate(page);
  await expect(page.locator(".app-shell")).not.toHaveClass(/is-auth-required/);
  await expect(page.locator(".sidebar-settings-button:visible")).toHaveText("Settings");
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual([]);
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
  const settings = await openPreferenceSettings(page);
  await settings.locator('[data-settings-category="connection"]').click();
  const logout = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/web/auth/logout")
  );
  await settings.getByRole("button", { name: "Sign out", exact: true }).click();
  expect((await logout).status()).toBe(204);
  await expect(settings).toBeHidden();
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
  await expect(page.locator(".sidebar-settings-button:visible")).toHaveText("Settings");
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
