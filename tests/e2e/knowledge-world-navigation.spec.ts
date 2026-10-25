import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { authenticate, mockInstance } from "./web-shell-fixture.js";
import { states, versionAncestry } from "./version-fixture.js";

test.use({ colorScheme: "dark" });

function worldHistory(sidebar: Locator, name: string) {
  return sidebar.getByRole("region", { name: "Version history: " + name, exact: true });
}

async function openRelationships(page: Page, sidebar: Locator) {
  const actions = sidebar.getByRole("button", { name: "Knowledge world actions" });
  await actions.click();
  await page.getByRole("menuitem", { name: "View version relationships" }).click();
  const dialog = page.getByRole("dialog", { name: "Version relationships", exact: true });
  await expect(dialog).toBeVisible();
  return { actions, dialog };
}

test("keeps the browsing world and version while filtering loaded history across worlds", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const versions = sidebar.locator(".commit-item");
  const selected = sidebar.locator('.commit-row[aria-pressed="true"]');
  await expect(versions).toHaveCount(6);
  await expect(selected).toContainText("Update knowledge model");
  await sidebar.getByRole("button", { name: "Knowledge world actions" }).click();
  await page.getByRole("menuitem", { name: "View history across worlds" }).click();
  await expect(versions).toHaveCount(8);
  await sidebar.getByRole("button", { name: "Filter knowledge worlds" }).click();
  const choices = page.getByRole("group", { name: "Filter knowledge worlds" });
  await expect(choices.getByRole("checkbox")).toHaveCount(4);
  await choices.getByRole("checkbox", { name: "develop" }).uncheck();
  await expect(versions).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "experiment" }).uncheck();
  await expect(versions).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "main" }).uncheck();
  await expect(versions).toHaveCount(4);
  await choices.getByRole("checkbox", { name: "feature/search" }).uncheck();
  await expect(versions).toHaveCount(0);
  await expect(sidebar.getByText("Select a knowledge world to show versions.")).toBeVisible();
  await choices.getByRole("button", { name: "Select all" }).click();
  await expect(versions).toHaveCount(8);
  await page.keyboard.press("Escape");
  const search = sidebar.getByRole("searchbox", { name: "Search loaded versions..." });
  await search.fill("7A1D9E");
  await expect(versions).toHaveCount(1);
  await expect(sidebar.getByText("Add knowledge sources")).toBeVisible();
  await search.fill("unknown-hash");
  await expect(versions).toHaveCount(0);
  await expect(sidebar.getByText("No matching versions.")).toBeVisible();
  await search.clear();
  await expect(selected).toContainText("Update knowledge model");
  await sidebar.getByRole("button", { name: "Filter knowledge worlds" }).click();
  await choices.getByRole("button", { name: "Clear all" }).click();
  await page.keyboard.press("Escape");
  await sidebar.getByRole("button", { name: "Back to world navigation" }).click();
  await expect(worldHistory(sidebar, "main").locator(".commit-item")).toHaveCount(6);
  await expect(selected).toContainText("Update knowledge model");
  await expect(sidebar.getByText("Select a knowledge world to show versions.")).toHaveCount(0);
  await expect(sidebar.getByRole("searchbox", { name: "Search loaded versions..." })).toHaveCount(
    0
  );
  await expect(page.getByRole("region", { name: "Graph canvas" })).toBeVisible();
});

test("expands worlds without opening a version, then distinguishes latest from historical browsing", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const reads: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/evolution/get")) reads.push(request.postData() ?? "");
  });
  const search = sidebar.getByRole("searchbox", { name: "Search knowledge worlds..." });
  await search.fill("develop");
  await expect(sidebar.locator(".world-section-trigger")).toHaveCount(1);
  await sidebar.getByRole("button", { name: "develop", exact: true }).click();
  const history = worldHistory(sidebar, "develop");
  await expect(history.locator(".commit-item")).toHaveCount(4);
  await expect(history.locator('.commit-row[aria-pressed="true"]')).toHaveCount(0);
  expect(reads).toEqual([]);
  const head = history.getByRole("button", { name: /Improve query diagnostics/ });
  await expect(head).toContainText("Latest");
  await head.click();
  await expect(head).toHaveAttribute("aria-pressed", "true");
  expect(reads).toHaveLength(1);
  await search.clear();
  const historical = history.getByRole("button", { name: /Fix node properties/ });
  await historical.click();
  await expect(historical).toHaveAttribute("aria-pressed", "true");
  await expect(head).toHaveAttribute("aria-pressed", "false");
  await expect(head).toContainText("Latest");
  await expect(history.getByText("Viewing a historical version")).toBeVisible();
  await history.getByRole("button", { name: "Back to latest" }).click();
  await expect(head).toHaveAttribute("aria-pressed", "true");
  await expect(history.getByText("Viewing a historical version")).toHaveCount(0);
  const openedReads = reads.length;
  await sidebar.getByRole("button", { name: "develop", exact: true }).click();
  await expect(history).toHaveCount(0);
  await sidebar.getByRole("button", { name: "main", exact: true }).click();
  await expect(worldHistory(sidebar, "main")).toBeVisible();
  await expect(sidebar.locator('.commit-row[aria-pressed="true"]')).toHaveCount(0);
  expect(reads).toHaveLength(openedReads);
  const { dialog } = await openRelationships(page, sidebar);
  await expect(dialog.locator(".version-dag-world")).toHaveText("main");
  await expect(dialog.getByRole("button", { name: /Update knowledge model/ })).toBeVisible();
  await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(0);
});

test("retains the browsing world and version when opening another world's version fails", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  await page.route("**/api/v1/evolution/get", async (route) => {
    const request = route.request().postDataJSON() as { state: string };
    if (request.state === "commit/" + states.develop) {
      await route.fulfill({
        status: 503,
        json: { code: "IO_ERROR", message: "unavailable" }
      });
    } else await route.fallback();
  });
  await sidebar.getByRole("button", { name: "develop", exact: true }).click();
  await worldHistory(sidebar, "develop")
    .getByRole("button", { name: /Improve query diagnostics/ })
    .click();
  await expect(sidebar.getByRole("alert")).toContainText("Could not open this version");
  await expect(sidebar.getByRole("button", { name: "develop", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await sidebar.getByRole("button", { name: "main", exact: true }).click();
  await expect(
    worldHistory(sidebar, "main").locator('.commit-row[aria-pressed="true"]')
  ).toContainText("Update knowledge model");
});

test("opens real version relationships without resizing the graph workspace and restores focus", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const canvas = page.locator(".canvas-stage");
  const before = await canvas.boundingBox();
  const { actions, dialog } = await openRelationships(page, sidebar);
  await expect(dialog.getByRole("button", { name: /Merge experiment/ })).toBeVisible();
  for (const parent of [states.shared, states.experiment])
    await expect(
      dialog.locator(`path[data-child="commit/${states.merge}"][data-parent="commit/${parent}"]`)
    ).toHaveCount(1);
  expect(await canvas.boundingBox()).toEqual(before);
  await dialog.getByRole("button", { name: /Fix node properties/ }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(actions).toBeFocused();
  await expect(sidebar.locator('.commit-row[aria-pressed="true"]')).toContainText(
    "Fix node properties"
  );
  expect(await canvas.boundingBox()).toEqual(before);
});

test("shows missing parents after a page failure and retries the same pinned DAG root", async ({
  page
}) => {
  await mockInstance(page);
  const calls: { root: string; cursor?: string }[] = [];
  const items = versionAncestry.get(states.main) ?? [];
  let unavailable = true;
  await page.route("**/api/v1/evolution/ancestry", async (route) => {
    const request = route.request().postDataJSON() as { root: string; cursor?: string };
    if (request.root !== "commit/" + states.main) {
      await route.fallback();
      return;
    }
    calls.push(request);
    if (request.cursor !== undefined && unavailable) {
      await route.fulfill({ status: 503, json: { code: "IO_ERROR", message: "unavailable" } });
      return;
    }
    await route.fulfill({
      json: {
        root: states.main,
        items: request.cursor === undefined ? items.slice(0, 2) : items.slice(2),
        ...(request.cursor === undefined ? { cursor: "main-page-2" } : {})
      }
    });
  });
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const sidebar = page.locator(".version-sidebar");
  await expect(sidebar.getByRole("alert")).toContainText("Could not load version history");
  const { dialog } = await openRelationships(page, sidebar);
  await expect(dialog.locator('[data-loaded="false"]')).toHaveCount(2);
  unavailable = false;
  await dialog.getByRole("button", { name: "Load earlier versions" }).click();
  await expect(dialog.locator('[data-loaded="false"]')).toHaveCount(0);
  expect(calls.at(-1)).toMatchObject({ root: "commit/" + states.main, cursor: "main-page-2" });
  await expect(dialog.getByRole("button", { name: /Initialize knowledge base/ })).toBeVisible();
});

test("reports moved or deleted world refs without moving pinned browsing state", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  await worldHistory(sidebar, "main")
    .getByRole("button", { name: /Fix node properties/ })
    .click();
  const historical = sidebar.locator('.commit-row[aria-pressed="true"]');
  await expect(historical).toContainText("Fix node properties");
  let deleted = false;
  await page.route("**/api/v1/evolution/branch/list", async (route) => {
    await route.fulfill({
      json: {
        items: deleted
          ? [{ name: "develop", state: states.develop }]
          : [{ name: "main", state: states.develop }]
      }
    });
  });
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(sidebar).toContainText(/new version/i);
  await expect(historical).toContainText("Fix node properties");
  deleted = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(sidebar).toContainText(/no longer exists/i);
  await expect(sidebar.getByRole("button", { name: "main", exact: true })).toHaveAttribute(
    "aria-expanded",
    "true"
  );
  await expect(historical).toContainText("Fix node properties");
  const { dialog } = await openRelationships(page, sidebar);
  await expect(dialog.locator(".version-dag-world")).toHaveText("main");
  await expect(dialog.getByRole("button", { name: /Fix node properties/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
