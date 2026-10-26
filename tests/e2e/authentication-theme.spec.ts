import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { mockInstance } from "./web-shell-fixture.js";

async function loginColors(page: Page) {
  return page.locator(".authentication-dialog").evaluate((dialog) => {
    const rgb = (color: string) => color.match(/\d+/g)?.slice(0, 3).map(Number) ?? [];
    const surface = getComputedStyle(dialog);
    const text = dialog.querySelector("#authentication-title");
    const input = dialog.querySelector("input");
    const help = dialog.querySelector(".authentication-help-text p");
    const backdrop = document.querySelector(".authentication-backdrop");
    if (!text || !input || !help || !backdrop) throw new Error("Missing login controls");
    return {
      theme: document.documentElement.classList.contains("theme-light") ? "light" : "dark",
      surface: surface.backgroundImage,
      foreground: rgb(getComputedStyle(dialog).color),
      heading: rgb(getComputedStyle(text).color),
      input: rgb(getComputedStyle(input).color),
      help: rgb(getComputedStyle(help).color),
      backdrop: getComputedStyle(backdrop).backgroundColor,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  });
}

function isBright(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0) / 3 > 120;
}

test("login Portal follows the system in both modes without discarding input or bypassing auth", async ({
  page
}, info) => {
  await page.emulateMedia({ colorScheme: "light" });
  await mockInstance(page);
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Authentication Required" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  const light = await loginColors(page);
  expect(light.theme).toBe("light");
  expect(isBright(light.heading)).toBe(false);
  expect(isBright(light.foreground)).toBe(false);
  expect(isBright(light.help)).toBe(false);
  expect(light.overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("login-follow-system-light.png") });

  const token = dialog.getByLabel("Access Token", { exact: true });
  await token.fill("not-submitted");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  const dark = await loginColors(page);
  expect(dark.theme).toBe("dark");
  expect(isBright(dark.foreground)).toBe(true);
  expect(isBright(dark.help)).toBe(true);
  expect(dark.backdrop).not.toBe(light.backdrop);
  await expect(token).toHaveValue("not-submitted");
  await expect(dialog).toBeVisible();
  await token.fill(""); // No access Token may be included in screenshots.
  await page.screenshot({ path: info.outputPath("login-follow-system-dark.png") });

  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  expect((await loginColors(page)).surface).toBe(light.surface);
});

test("saved login appearance overrides the opposite system theme across refresh and narrow layouts", async ({
  page
}, info) => {
  await mockInstance(page);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("phase32-seeded") !== "yes") {
      localStorage.setItem("kgos.web.theme", "light");
      sessionStorage.setItem("phase32-seeded", "yes");
    }
  });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  expect(isBright((await loginColors(page)).foreground)).toBe(false);
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  expect((await loginColors(page)).overflow).toBe(false);
  await page.screenshot({ path: info.outputPath("login-manual-light-mobile.png") });

  await page.evaluate(() => {
    localStorage.setItem("kgos.web.theme", "dark");
  });
  await page.emulateMedia({ colorScheme: "light" });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
  expect(isBright((await loginColors(page)).foreground)).toBe(true);

  await page.evaluate(() => {
    localStorage.removeItem("kgos.web.theme");
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => {
    localStorage.setItem("kgos.web.theme", "invalid-old-setting");
  });
  await page.reload();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
});
