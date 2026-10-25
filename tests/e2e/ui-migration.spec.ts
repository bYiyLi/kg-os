import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const activeToast = '[data-slot="toast"]:not([data-ending-style])';

async function vectorStep(page: Page) {
  await page.route("**/api/v1/setup/status", (route) =>
    route.fulfill({ json: { state: "setup_required", credentialConfigured: false } })
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#setup-url")).toBeVisible();
  await page.locator("#setup-url").fill("https://embedding.example.test/v1");
  await page.locator("#setup-model").fill("text-embedding-3-small");
  await page.locator("#setup-dimensions").fill("1536");
}

test("Toast retains live language/theme, dismisses success, and never shifts the footer", async ({
  page
}) => {
  await vectorStep(page);
  let finish: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let probes = 0;
  await page.route("**/api/v1/setup/validate-embedding", async (route) => {
    probes += 1;
    await pending;
    await route.fulfill({ json: { ok: true, dimensions: 1536 } });
  });
  const footer = await page.locator(".setup-footer").boundingBox();
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  const toast = page.locator(activeToast);
  await expect(toast).toHaveAttribute("data-type", "loading");
  await expect(toast.getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "简体中文" }).click();
  await expect(toast).toContainText("正在");
  await page.getByRole("button", { name: "English" }).click();
  await page.getByRole("button", { name: "Light theme" }).click();
  expect(await toast.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("light");
  finish?.();
  await expect(toast).toHaveAttribute("data-type", "success");
  await expect(toast).toContainText("1536");
  expect(await page.locator(".setup-footer").boundingBox()).toEqual(footer);
  await expect(toast).toHaveCount(0, { timeout: 6000 });
  expect(probes).toBe(1);
  await expect(page.getByRole("button", { name: "Next", exact: true })).toBeEnabled();
});

test("error Toast closes manually and stale verification disappears after edits", async ({
  page
}) => {
  await vectorStep(page);
  await page.route("**/api/v1/setup/validate-embedding", (route) =>
    route.fulfill({ json: { ok: false, reason: "authentication_failed" } })
  );
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  const toast = page.locator(activeToast);
  await expect(toast).toHaveAttribute("data-type", "error");
  await expect(page.getByRole("button", { name: "Next", exact: true })).toHaveCount(0);
  await page.keyboard.press("F6");
  await expect(toast).not.toHaveAttribute("aria-hidden", "true");
  await toast.getByRole("button", { name: "Close notification" }).click();
  await expect(toast).toHaveCount(0);
  await page.getByRole("button", { name: "Test connection", exact: true }).click();
  await expect(toast).toHaveAttribute("data-type", "error");
  await page.locator("#setup-model").fill("another-model");
  await expect(toast).toHaveCount(0);
});

test("Base UI Select supports keyboard selection, Escape and portal theme at 320px", async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await vectorStep(page);
  const trigger = page.getByRole("combobox", { name: "Similarity" });
  await expect(trigger).toHaveCSS("display", "flex");
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await expect(page.getByRole("option", { name: "Cosine similarity" })).toHaveAttribute(
    "data-highlighted",
    ""
  );
  await expect(page.getByRole("option", { name: "Cosine similarity" })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("option", { name: "Euclidean distance" })).toHaveAttribute(
    "data-highlighted",
    ""
  );
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Euclidean");
  await expect(trigger).toBeFocused();
  await page.getByRole("button", { name: "Light theme" }).click();
  await trigger.click();
  const popup = page.getByRole("listbox");
  expect(await popup.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("light");
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [375, 1100]) {
  test(`self-contained MCP resource supports portal controls and host theme at ${String(width)}px`, async ({
    page
  }) => {
    const html = await readFile("packages/web/dist/mcp-app.html", "utf8");
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+rel=["']stylesheet/);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(request.url()));
    await page.setViewportSize({ width, height: 800 });
    await page.goto("about:blank");
    await page.evaluate(
      ({ content, frameWidth }) => {
        const frame = document.createElement("iframe");
        frame.title = "KG OS MCP fixture";
        frame.style.cssText = `width:${String(frameWidth)}px;height:760px;border:0`;
        document.body.style.margin = "0";
        const state = "commit/" + "a".repeat(64);
        const previous = "commit/" + "0".repeat(64);
        const learning = "commit/" + "b".repeat(64);
        function readVersionTool(code: string): unknown {
          if (code.includes("branch.list"))
            return {
              items: [
                { name: "main", state },
                { name: "novel", state },
                { name: "learning", state: learning }
              ]
            };
          if (code.includes("tag.list")) return { items: [] };
          if (code.includes("ancestry")) {
            const history = [
              { state, parents: [previous], message: "MCP migration fixture", committedAt: 2 },
              { state: previous, parents: [], message: "Initial MCP version", committedAt: 1 }
            ];
            if (code.includes(learning))
              return {
                root: learning,
                items: [
                  {
                    state: learning,
                    parents: [state],
                    message: "Learning world updated",
                    committedAt: 3
                  },
                  ...history
                ]
              };
            return { root: state, items: history };
          }
          if (code.includes("evolution.get")) {
            if (code.includes(learning)) return { state: learning };
            if (code.includes(previous)) return { state: previous };
            return { state };
          }
          return { defaultBranch: "novel", state };
        }
        window.addEventListener("message", (event: MessageEvent) => {
          if (event.source !== frame.contentWindow) return;
          const message = event.data as {
            id?: number;
            method?: string;
            params?: { arguments?: { code?: string } };
          };
          if (message.id === undefined) return;
          let result: unknown = {};
          if (message.method === "ui/initialize") {
            result = {
              protocolVersion: "2026-01-26",
              hostInfo: { name: "Migration test host", version: "1" },
              hostCapabilities: { serverTools: {} },
              hostContext: { theme: "light", locale: "en", displayMode: "inline" }
            };
          } else if (message.method === "tools/call") {
            const code = message.params?.arguments?.code ?? "";
            const value = readVersionTool(code);
            result = { content: [{ type: "text", text: JSON.stringify({ result: value }) }] };
          }
          frame.contentWindow?.postMessage({ jsonrpc: "2.0", id: message.id, result }, "*");
        });
        frame.srcdoc = content;
        document.body.append(frame);
      },
      { content: html, frameWidth: width }
    );
    const app = page.frameLocator("iframe");
    await expect(app.locator(".app-shell")).toHaveAttribute("data-theme", "light");
    await expect(app.locator(".authentication-dialog")).toHaveCount(0);
    if (width < 900)
      await app.getByRole("button", { name: "Version navigation", exact: true }).click();
    const history = width < 900 ? app.locator(".version-drawer") : app.locator(".version-sidebar");
    const novel = history.getByRole("button", { name: "novel", exact: true });
    await expect(novel).toHaveAttribute("aria-expanded", "true");
    await expect(
      history
        .getByRole("region", { name: "Version history: novel", exact: true })
        .locator('.commit-row[aria-pressed="true"]')
    ).toContainText("MCP migration fixture");
    const main = history.getByRole("button", { name: "main", exact: true });
    await main.click();
    const mainHistory = history.getByRole("region", { name: "Version history: main", exact: true });
    await expect(mainHistory.locator('.commit-row[aria-pressed="true"]')).toHaveCount(0);
    await mainHistory.getByRole("button", { name: /MCP migration fixture/ }).click();
    await expect(mainHistory.locator('.commit-row[aria-pressed="true"]')).toHaveCount(1);
    const trigger = history.getByRole("button", { name: "Knowledge world actions" });
    await trigger.click();
    const actions = app.getByRole("menu");
    expect(await actions.evaluate((element) => getComputedStyle(element).colorScheme)).toBe(
      "light"
    );
    await page.evaluate(() => {
      document.querySelector("iframe")?.contentWindow?.postMessage(
        {
          jsonrpc: "2.0",
          method: "ui/notifications/host-context-changed",
          params: { theme: "dark", locale: "en" }
        },
        "*"
      );
    });
    await expect(app.locator(".app-shell")).toHaveAttribute("data-theme", "dark");
    expect(await actions.evaluate((element) => getComputedStyle(element).colorScheme)).toBe("dark");
    await page.keyboard.press("Escape");
    await expect(actions).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await history.getByRole("button", { name: "learning", exact: true }).click();
    const learningHistory = history.getByRole("region", {
      name: "Version history: learning",
      exact: true
    });
    await expect(learningHistory.locator('.commit-row[aria-pressed="true"]')).toHaveCount(0);
    await expect(history.locator(".commit-item")).toHaveCount(3);
    const latest = learningHistory.getByRole("button", { name: /Learning world updated/ });
    await latest.click();
    await expect(latest).toHaveAttribute("aria-pressed", "true");
    await history.getByRole("button", { name: /Initial MCP version/ }).click();
    await expect(latest).toHaveAttribute("aria-pressed", "false");
    await expect(latest).toContainText("Latest");
    await history.getByRole("button", { name: "Back to latest" }).click();
    await expect(latest).toHaveAttribute("aria-pressed", "true");
    await history.getByRole("button", { name: "Knowledge world actions" }).click();
    await app.getByRole("menuitem", { name: "View version relationships" }).click();
    const relationships = app.getByRole("dialog", { name: "Version relationships", exact: true });
    await expect(relationships).toBeVisible();
    expect(await relationships.evaluate((element) => getComputedStyle(element).colorScheme)).toBe(
      "dark"
    );
    await page.keyboard.press("Escape");
    await expect(relationships).toBeHidden();
    await history.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = app.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("group", { name: "Interface language" })).toBeVisible();
    await settings.locator('[data-settings-category="connection"]').click();
    await expect(settings).toContainText("Open KG OS in a separate browser");
    await expect(settings.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
    expect(requests).toEqual([]);
  });
}
