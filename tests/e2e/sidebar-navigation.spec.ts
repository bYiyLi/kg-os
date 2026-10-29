import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";

// cspell:words haspopup

import { authenticate } from "./web-shell-fixture.js";

test.use({ colorScheme: "light", reducedMotion: "reduce", hasTouch: true });

async function expectBorderAlignment(handle: Locator) {
  const readGeometry = () =>
    handle.evaluate((element) => {
      const canvas = document.querySelector(".canvas-stage");
      const contour = element.querySelector(".sidebar-handle-contour");
      const surface = element.querySelector(".sidebar-handle-surface");
      const edge = element.querySelector(".sidebar-handle-edge");
      const shell = document.querySelector(".app-shell");
      const search = document.querySelector(".graph-search");
      if (
        canvas === null ||
        contour === null ||
        surface === null ||
        edge === null ||
        shell === null ||
        search === null
      )
        throw new Error("Missing canvas border layers");
      const bounds = element.getBoundingClientRect();
      const canvasBounds = canvas.getBoundingClientRect();
      const searchBounds = search.getBoundingClientRect();
      return {
        x: bounds.x,
        width: bounds.width,
        height: bounds.height,
        join: bounds.x + 5 - canvasBounds.x,
        center: bounds.y + bounds.height / 2 - canvasBounds.y - canvasBounds.height / 2,
        searchCenter:
          searchBounds.x + searchBounds.width / 2 - canvasBounds.x - canvasBounds.width / 2,
        mirror: new DOMMatrix(getComputedStyle(contour).transform).a,
        fill: getComputedStyle(surface).fill,
        background: getComputedStyle(shell).backgroundColor,
        border: getComputedStyle(canvas).borderLeftColor,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
      };
    });
  // setViewportSize resolves before Chromium has necessarily applied the
  // new media-query styles; keep the same 1px centering requirement after
  // the browser commits its responsive layout.
  await expect.poll(async () => Math.abs((await readGeometry()).searchCenter)).toBeLessThan(1);
  const geometry = await readGeometry();
  expect(geometry.x).toBeGreaterThanOrEqual(0);
  expect(geometry.width).toBe(44);
  expect(geometry.height).toBe(112);
  expect(Math.abs(geometry.join)).toBeLessThan(1);
  expect(Math.abs(geometry.center)).toBeLessThan(1);
  expect(Math.abs(geometry.searchCenter)).toBeLessThan(1);
  expect(geometry.mirror).toBe(-1);
  expect(geometry.fill).toBe(geometry.background);
  await expect(handle.locator(".sidebar-handle-edge")).toHaveCSS("stroke", geometry.border);
  expect(geometry.overflow).toBe(false);
}

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(colorScheme + " border navigation", () => {
    test.use({ colorScheme });

    test("keeps the integrated edge usable at every narrow breakpoint", async ({ page }) => {
      await page.setViewportSize({ width: 867, height: 894 });
      await authenticate(page);
      const handle = page.locator(".sidebar-handle");
      const drawer = page.getByRole("dialog", { name: "Mobile version navigation", exact: true });
      const widthBefore = await page.locator(".app-shell").getAttribute("style");
      for (const width of [320, 375, 867, 900]) {
        await page.setViewportSize({ width, height: 894 });
        await expect(page.locator(".mobile-versions-button")).toHaveCount(0);
        await expect(handle).toBeVisible();
        await expect(handle).toHaveAttribute("aria-label", "Version navigation");
        await expect(handle).toHaveClass("sidebar-handle");
        await expect(handle.locator(".icon.lucide-chevron-right")).toBeVisible();
        await page.mouse.move(width - 16, 16);
        await page.getByRole("searchbox", { name: "Search knowledge", exact: true }).focus();
        await expectBorderAlignment(handle);
        await handle.focus();
        await page.keyboard.press("ArrowRight");
        await expect(page.locator(".app-shell")).toHaveAttribute("style", widthBefore ?? "");
        await page.keyboard.press("Enter");
        await expect(drawer).toBeVisible();
        await expect(handle).toHaveAttribute("aria-expanded", "true");
        await page.keyboard.press("Escape");
        await expect(drawer).toBeHidden();
        await expect(handle).toBeFocused();
        await expect(handle).toHaveAttribute("aria-expanded", "false");
      }
      await page.setViewportSize({ width: 375, height: 894 });
      await handle.tap();
      await expect(drawer).toBeVisible();
      await page.mouse.click(365, 20);
      await expect(drawer).toBeHidden();
      await expect(handle).toBeFocused();
      await page.setViewportSize({ width: 867, height: 894 });
      await page.screenshot({ path: test.info().outputPath("border-navigation.png") });
    });
  });
}

test("preserves desktop width, collapse and world selection when crossing the breakpoint", async ({
  page
}) => {
  await page.setViewportSize({ width: 1100, height: 894 });
  await authenticate(page);
  const shell = page.locator(".app-shell");
  const handle = page.locator(".sidebar-handle");
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(shell).toHaveAttribute("style", "--sidebar-width: 296px;");
  await handle.click();
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await page.setViewportSize({ width: 900, height: 894 });
  await expect(handle).toHaveAttribute("aria-haspopup", "dialog");
  await handle.click();
  const drawer = page.getByRole("dialog", { name: "Mobile version navigation", exact: true });
  const world = drawer.getByRole("button", { name: "feature/search", exact: true });
  await world.click();
  await expect(world).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 901, height: 894 });
  await expect(drawer).toBeHidden();
  await expect(handle).toHaveAttribute("aria-label", "Expand sidebar");
  await expect(shell).toHaveClass(/is-sidebar-collapsed/);
  await expect(shell).toHaveAttribute("style", "--sidebar-width: 296px;");
  await handle.click();
  await expect(page.locator(".version-sidebar")).toBeVisible();
  await expect(
    page.locator(".version-sidebar").getByRole("button", { name: "feature/search", exact: true })
  ).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 867, height: 894 });
  await expect(drawer).toBeHidden();
  await handle.click();
  await expect(drawer).toBeVisible();
  await page.getByRole("button", { name: "Close version navigation", exact: true }).click();
  await expect(handle).toBeFocused();
  await page.setViewportSize({ width: 901, height: 894 });
  await expect(page.locator(".version-sidebar")).toBeVisible();
  await expect(shell).not.toHaveClass(/is-sidebar-collapsed/);
  await expect(shell).toHaveAttribute("style", "--sidebar-width: 296px;");
});
