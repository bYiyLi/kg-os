import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

async function openUnauthenticatedShell(page: Page) {
  await page.route("**/api/v1/web/auth/session", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "Authentication required" })
    });
  });
  await page.goto("/");
  await expect(page.locator(".authentication-dialog")).toBeVisible();
}

test("100% browser zoom uses a compact desktop shell and readable authentication", async ({
  page
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openUnauthenticatedShell(page);

  const dimensions = await page.evaluate(() => {
    const shell = document.querySelector(".app-shell");
    if (shell === null) throw new Error("Missing app shell");
    function box(selector: string) {
      const element = document.querySelector(selector);
      if (element === null) throw new Error(`Missing ${selector}`);
      return element.getBoundingClientRect();
    }
    return {
      scale: window.visualViewport?.scale,
      sidebarWidth: box(".version-sidebar").width,
      brandHeight: box(".sidebar-brand").height,
      unloadedCount: document.querySelectorAll(".commit-item").length,
      dialogWidth: box(".authentication-dialog").width,
      dialogHeight: box(".authentication-dialog").height,
      dialogTop: box(".authentication-dialog").top,
      controlHeight: box(".authentication-connect").height,
      mainFontSize: getComputedStyle(shell).fontSize,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  expect(dimensions.scale).toBe(1);
  expect(dimensions.sidebarWidth).toBe(240);
  expect(dimensions.brandHeight).toBe(78);
  expect(dimensions.unloadedCount).toBe(0);
  expect(dimensions.dialogWidth).toBe(496);
  expect(dimensions.dialogTop).toBeGreaterThanOrEqual(0);
  expect(dimensions.dialogTop + dimensions.dialogHeight).toBeLessThanOrEqual(900);
  expect(dimensions.controlHeight).toBeGreaterThanOrEqual(44);
  expect(dimensions.mainFontSize).toBe("13px");
  expect(dimensions.horizontalOverflow).toBe(false);
});

test("compact layout fits a mobile viewport without shrinking the tap target", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openUnauthenticatedShell(page);

  const dimensions = await page.evaluate(() => {
    const dialog = document.querySelector<HTMLDialogElement>(".authentication-dialog");
    const action = document.querySelector<HTMLElement>(".authentication-connect");
    const navigation = document.querySelector<HTMLElement>(".mobile-versions-button");
    if (dialog === null || action === null || navigation === null) {
      throw new Error("Missing mobile controls");
    }
    const bounds = dialog.getBoundingClientRect();
    return {
      dialogLeft: bounds.left,
      dialogRight: bounds.right,
      dialogTop: bounds.top,
      dialogBottom: bounds.bottom,
      controlHeight: action.getBoundingClientRect().height,
      mobileNavHeight: navigation.getBoundingClientRect().height,
      mobileNavDisplay: getComputedStyle(navigation).display,
      horizontalOverflow:
        document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });

  expect(dimensions.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(dimensions.dialogRight).toBeLessThanOrEqual(390);
  expect(dimensions.dialogTop).toBeGreaterThanOrEqual(0);
  expect(dimensions.dialogBottom).toBeLessThanOrEqual(844);
  expect(dimensions.controlHeight).toBeGreaterThanOrEqual(44);
  expect(dimensions.mobileNavHeight).toBeGreaterThanOrEqual(44);
  expect(dimensions.mobileNavDisplay).toBe("flex");
  expect(dimensions.horizontalOverflow).toBe(false);
});
