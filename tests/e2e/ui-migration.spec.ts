import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const activeToast = '[data-slot="toast"]:not([data-ending-style])';

async function vectorStep(page: Page) {
  let issued = false;
  await page.route("**/api/v1/setup/status", (route) =>
    route.fulfill({ json: { state: "setup_required", credentialConfigured: issued } })
  );
  await page.route("**/api/v1/setup/rotate-token", async (route) => {
    issued = true;
    await route.fulfill({ status: 201, json: { token: "A".repeat(43) } });
  });
  await page.route("**/api/v1/web/auth/login", (route) =>
    route.fulfill({
      json: {
        accessToken: "kgws_" + "A".repeat(43),
        daemonBootId: "4ce99373-4158-4ed1-8309-b55ea866b023"
      }
    })
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Generate access token" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
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
        function readDomainTool(code: string): unknown {
          const match = /\.read\((\{.*\})\)/.exec(code);
          if (match?.[1] === undefined) throw new Error("Missing Domain read request");
          const input = JSON.parse(match[1]) as { at: string; refs?: string[] };
          const domains =
            input.at === previous
              ? []
              : [
                  { name: "Writing", includes: ["domain:Characters"] },
                  { name: "Characters", includes: [] }
                ];
          if (code.includes("ontology.read"))
            return {
              state: input.at,
              results: [
                {
                  kind: "overview",
                  items: domains.map((domain) => ({
                    kind: "domain",
                    ref: "domain:" + domain.name,
                    name: domain.name
                  })),
                  total: domains.length,
                  markdown: ""
                }
              ]
            };
          return {
            state: input.at,
            results: (input.refs ?? []).map((ref) => ({
              kind: "domain",
              ref,
              value: domains.find((domain) => "domain:" + domain.name === ref)
            }))
          };
        }
        function readVersionTool(code: string): unknown {
          if (code.includes("ontology.read") || code.includes("object.read"))
            return readDomainTool(code);
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
            const codes = JSON.parse(document.body.dataset["toolCodes"] ?? "[]") as string[];
            document.body.dataset["toolCodes"] = JSON.stringify([...codes, code]);
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
    await expect(app.locator(".mobile-versions-button")).toHaveCount(0);
    await expect(app.locator(".sidebar-handle")).toBeVisible();
    if (width < 900)
      await app.getByRole("button", { name: "Version navigation", exact: true }).click();
    const history = width < 900 ? app.locator(".version-drawer") : app.locator(".version-sidebar");
    const novel = history.getByRole("button", { name: "novel", exact: true });
    await expect(novel).toHaveAttribute("aria-current", "page");
    await expect(history.locator(".commit-item")).toHaveCount(0);
    const novelDomains = history.getByRole("region", { name: "Domains: novel", exact: true });
    await expect(novelDomains.getByRole("button", { name: "Writing", exact: true })).toBeVisible();
    await novelDomains.getByRole("button", { name: "Expand domain: Writing", exact: true }).click();
    const characterDomain = novelDomains.getByRole("button", { name: "Characters", exact: true });
    await characterDomain.click();
    await expect(characterDomain).toHaveAttribute("aria-pressed", "true");
    const main = history.getByRole("button", { name: "main", exact: true });
    await main.click();
    await expect(main).toHaveAttribute("aria-current", "page");
    await expect(novel).not.toHaveAttribute("aria-current", "page");
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
    const historyTrigger = history.getByRole("button", {
      name: "View history: learning",
      exact: true
    });
    await historyTrigger.click();
    const relationships = app.getByRole("dialog", { name: "Version relationships", exact: true });
    await expect(relationships).toBeVisible();
    await expect(relationships.locator(".version-dag-world")).toHaveText("learning");
    const latest = relationships.getByRole("button", { name: /Learning world updated/ });
    await expect(latest).toHaveAttribute("aria-pressed", "true");
    await relationships.getByRole("button", { name: /Initial MCP version/ }).click();
    await expect(latest).toHaveAttribute("aria-pressed", "false");
    await expect(latest).toContainText("Latest");
    await relationships.getByRole("button", { name: "Back to latest" }).click();
    await expect(latest).toHaveAttribute("aria-pressed", "true");
    expect(await relationships.evaluate((element) => getComputedStyle(element).colorScheme)).toBe(
      "dark"
    );
    if (width < 900) await expect(history).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(relationships).toBeHidden();
    if (width < 900) await expect(history).toBeVisible();
    await expect(historyTrigger).toBeFocused();
    await history.getByRole("button", { name: "Settings", exact: true }).click();
    const settings = app.getByRole("dialog", { name: "Settings", exact: true });
    await expect(settings).toBeVisible();
    await expect(settings.getByRole("group", { name: "Interface language" })).toBeVisible();
    await settings.locator('[data-settings-category="connection"]').click();
    await expect(settings).toContainText("Open KG OS in a separate browser");
    await expect(settings.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
    const codes = await page.evaluate(
      () => JSON.parse(document.body.dataset["toolCodes"] ?? "[]") as string[]
    );
    expect(codes.some((code) => code.includes("ontology.read"))).toBe(true);
    expect(codes.some((code) => code.includes("object.read"))).toBe(true);
    expect(requests).toEqual([]);
  });
}
