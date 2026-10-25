import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, test as base } from "@playwright/test";
import type { Locator, Page, Response } from "@playwright/test";

import { selectChineseLanguage } from "./settings-navigation.js";
import { createSettingsRuntime, signInSettings } from "./settings-runtime.js";
import type { SettingsRuntime } from "./settings-runtime.js";

const test = base.extend<{ settingsRuntime: SettingsRuntime }>({
  settingsRuntime: async ({ request }, use) => {
    const runtime = await createSettingsRuntime(request);
    try {
      await use(runtime);
    } finally {
      await runtime.close();
    }
  }
});

test.use({ colorScheme: "dark", viewport: { width: 1440, height: 1000 } });

interface ConfigurationSnapshot {
  effective: {
    server: { public_origin: string } | null;
    cache: { path: string; max_size_mb: number };
    embedding: { model: string; dimensions: number };
  };
  saved: {
    server: { public_origin: string } | null;
    cache: { path: string; max_size_mb: number };
    sqlite: { extensions: { source: string; entrypoint: string }[] };
  };
  pendingRestart: boolean;
}

async function openSettings(page: Page) {
  const read = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/web/settings/read")
  );
  await page
    .locator(".version-sidebar")
    .getByRole("button", { name: "Settings", exact: true })
    .click();
  const response = await read;
  expect(response.ok()).toBe(true);
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  expect(response.headers()["cache-control"]).toContain("no-store");
  return { dialog, snapshot: (await response.json()) as ConfigurationSnapshot };
}

async function category(dialog: Locator, name: string) {
  await dialog.locator(`[data-settings-category="${name}"]`).click();
}

async function save(page: Page, dialog: Locator): Promise<Response> {
  const response = page.waitForResponse((item) =>
    item.url().endsWith("/api/v1/web/settings/update")
  );
  await dialog.getByRole("button", { name: "Save changes", exact: true }).click();
  return response;
}

test("uses real configuration in all five categories and applies saved values only after restart", async ({
  page,
  settingsRuntime
}, testInfo) => {
  test.setTimeout(90000);
  await signInSettings(page, settingsRuntime);
  const { dialog, snapshot } = await openSettings(page);
  expect(snapshot.effective.embedding).toMatchObject({
    model: "settings-acceptance-model",
    dimensions: 3
  });
  expect(snapshot.saved.cache.max_size_mb).toBe(2048);
  expect(JSON.stringify(snapshot)).not.toContain(settingsRuntime.privateKey);
  for (const name of ["display", "connection", "retrieval", "storage", "runtime"]) {
    await category(dialog, name);
    await page.screenshot({ path: testInfo.outputPath("settings-" + name + "-dark.png") });
  }
  await category(dialog, "retrieval");
  await expect(dialog.getByText("settings-acceptance-model", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Embedding model", exact: true })).toHaveCount(
    0
  );
  const testResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/web/settings/test-embedding")
  );
  await dialog.getByRole("button", { name: "Test connection", exact: true }).click();
  expect(await (await testResponse).json()).toMatchObject({
    ok: false,
    reason: "address_not_allowed"
  });
  const replacementKey = settingsRuntime.privateKey + "-rotated";
  await dialog.getByRole("button", { name: "Update key", exact: true }).click();
  await dialog.getByLabel("New API Key", { exact: true }).fill(replacementKey);
  const keyResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/web/settings/embedding-key")
  );
  await dialog.getByRole("button", { name: "Save new key", exact: true }).click();
  const keySaved = await keyResponse;
  expect(keySaved.ok()).toBe(true);
  expect(await keySaved.text()).not.toContain(replacementKey);
  expect(await readFile(join(settingsRuntime.workspace, ".kgos/embedding-api-key"), "utf8")).toBe(
    replacementKey
  );
  await expect(dialog.getByLabel("New API Key", { exact: true })).toHaveCount(0);

  await category(dialog, "connection");
  await expect(dialog.getByLabel(/^Public access address/u)).toHaveValue(
    "https://settings.example.com"
  );
  await dialog.getByLabel(/^Public access address/u).fill("https://updated.example.com");
  const changed = await save(page, dialog);
  expect(changed.ok()).toBe(true);
  const saved = (await changed.json()) as ConfigurationSnapshot;
  expect(saved.pendingRestart).toBe(true);
  expect(saved.effective.server?.public_origin).toBe("https://settings.example.com");
  expect(saved.saved.server?.public_origin).toBe("https://updated.example.com");

  await category(dialog, "storage");
  await dialog.getByLabel(/^Cache budget/u).fill("3072");
  await dialog.getByLabel(/^Cache path/u).fill("cache/settings-updated.db");
  await dialog.getByRole("button", { name: "Add extension", exact: true }).click();
  const extension = join(settingsRuntime.workspace, "custom-settings.so");
  await dialog.getByLabel("Extension source", { exact: true }).fill(extension);
  await dialog.getByLabel("Entrypoint", { exact: true }).fill("sqlite3_settings_init");
  const extensionSave = await save(page, dialog);
  expect(extensionSave.ok()).toBe(true);
  expect(((await extensionSave.json()) as ConfigurationSnapshot).saved.sqlite.extensions).toEqual([
    { source: extension, entrypoint: "sqlite3_settings_init" }
  ]);
  // Prove extension list writes persist, then remove the declarative sample
  // before restart so this test never tries to execute an invented native DLL.
  await dialog.getByRole("button", { name: /Remove extension/ }).click();
  expect((await save(page, dialog)).ok()).toBe(true);
  const persisted = await readFile(join(settingsRuntime.workspace, ".kgos/config.toml"), "utf8");
  expect(persisted).toContain("https://updated.example.com");
  expect(persisted).toContain("3072");
  expect(persisted).toContain("cache/settings-updated.db");
  expect(persisted).not.toContain("sqlite3_settings_init");
  expect(persisted).not.toContain(settingsRuntime.privateKey);

  await category(dialog, "runtime");
  const parameters = dialog.locator("summary").filter({ hasText: "All startup parameters" });
  if (await parameters.isVisible()) await parameters.click();
  const concurrency = dialog.getByRole("row").filter({ hasText: "mcp-max-concurrency" });
  await expect(concurrency).toContainText("7");
  await expect(concurrency).toContainText("--mcp-max-concurrency");
  const diagnosticsResponse = page.waitForResponse((response) =>
    response.url().endsWith("/api/v1/system/diagnostics")
  );
  await dialog.getByRole("button", { name: "Refresh diagnostics", exact: true }).click();
  const diagnostics = await diagnosticsResponse;
  expect(diagnostics.ok()).toBe(true);
  expect(await diagnostics.json()).toMatchObject({
    uptime_seconds: expect.any(Number),
    http: { requests_total: expect.any(Number) }
  });
  await testInfo.attach("settings-runtime-dark", {
    body: await page.screenshot(),
    contentType: "image/png"
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await settingsRuntime.restart();
  await signInSettings(page, settingsRuntime);
  const reopened = await openSettings(page);
  expect(reopened.snapshot.effective.server?.public_origin).toBe("https://updated.example.com");
  expect(reopened.snapshot.effective.cache.max_size_mb).toBe(3072);
  expect(reopened.snapshot.effective.cache.path).toBe(
    join(settingsRuntime.workspace, ".kgos/cache/settings-updated.db")
  );
  expect(reopened.snapshot.pendingRestart).toBe(false);
});

test("rejects a stale browser save without replacing another browser's configuration", async ({
  page,
  context,
  settingsRuntime
}) => {
  test.setTimeout(60000);
  await signInSettings(page, settingsRuntime);
  const first = await openSettings(page);
  const secondPage = await context.newPage();
  await signInSettings(secondPage, settingsRuntime);
  const second = await openSettings(secondPage);
  await category(first.dialog, "connection");
  await category(second.dialog, "connection");
  await first.dialog.getByLabel(/^Public access address/u).fill("https://first.example.com");
  await second.dialog.getByLabel(/^Public access address/u).fill("https://stale.example.com");
  expect((await save(page, first.dialog)).ok()).toBe(true);
  expect((await save(secondPage, second.dialog)).status()).toBe(409);
  await expect(
    second.dialog.getByRole("status").filter({ hasText: "Configuration changed elsewhere" })
  ).toBeVisible();
  await expect(second.dialog.getByLabel(/^Public access address/u)).toHaveValue(
    "https://stale.example.com"
  );
  const persisted = await readFile(join(settingsRuntime.workspace, ".kgos/config.toml"), "utf8");
  expect(persisted).toContain("https://first.example.com");
  expect(persisted).not.toContain("https://stale.example.com");
  await second.dialog.getByRole("button", { name: "Reload configuration", exact: true }).click();
  await expect(second.dialog.getByLabel(/^Public access address/u)).toHaveValue(
    "https://first.example.com"
  );
});

test("keeps preferences local and all settings usable on a narrow screen", async ({
  page,
  settingsRuntime
}, testInfo) => {
  test.setTimeout(60000);
  await signInSettings(page, settingsRuntime);
  const { dialog } = await openSettings(page);
  await category(dialog, "display");
  await dialog.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator(".app-shell")).toHaveAttribute("data-theme", "light");
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("kgos.web.theme")))
    .toBe("light");
  await page.screenshot({ path: testInfo.outputPath("settings-display-light.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.screenshot({ path: testInfo.outputPath("settings-mobile-375-light.png") });
  await page.setViewportSize({ width: 320, height: 700 });
  for (const name of ["display", "connection", "retrieval", "storage", "runtime"]) {
    await category(dialog, name);
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(321);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      320
    );
  }
  await category(dialog, "display");
  await selectChineseLanguage(dialog);
  await expect(page.getByRole("dialog", { name: "设置", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("kgos.web.locale"))).toBe("zh-CN");
  await page.screenshot({ path: testInfo.outputPath("settings-mobile-320-chinese.png") });
  await testInfo.attach("settings-mobile-light-chinese", {
    body: await page.screenshot(),
    contentType: "image/png"
  });
  const stores = await page.evaluate(() => ({
    local: JSON.stringify(localStorage),
    session: JSON.stringify(sessionStorage)
  }));
  expect(stores.local).not.toContain(settingsRuntime.token);
  expect(stores.session).not.toContain(settingsRuntime.privateKey);
});
