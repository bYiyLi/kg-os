import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { authenticate, mockInstance } from "./web-shell-fixture.js";
import { states, versionAncestry } from "./version-fixture.js";

test.use({ colorScheme: "dark" });

function domains(sidebar: Locator, name = "main") {
  return sidebar.getByRole("region", { name: "Domains: " + name, exact: true });
}

async function openHistory(page: Page, sidebar: Locator, name = "main") {
  const trigger = sidebar.getByRole("button", { name: "View history: " + name, exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Version relationships", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".version-dag-world")).toHaveText(name);
  return { trigger, dialog };
}

test("shows nested and shared domains while loading history only on demand", async ({ page }) => {
  const ancestry: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/api/v1/evolution/ancestry"))
      ancestry.push(request.postData() ?? "");
  });
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const tree = domains(sidebar);
  await expect(tree.getByRole("button", { name: "Work", exact: true })).toBeVisible();
  await expect(sidebar.locator(".commit-item")).toHaveCount(0);
  expect(ancestry).toEqual([]);
  await tree.getByRole("button", { name: "Expand domain: Work", exact: true }).click();
  await expect(
    tree.getByRole("button", { name: "People and organizations", exact: true })
  ).toBeVisible();
  await tree
    .getByRole("button", { name: "Expand domain: People and organizations", exact: true })
    .click();
  await tree
    .getByRole("button", { name: "Expand domain: Projects and decisions", exact: true })
    .click();
  await expect(tree.getByRole("button", { name: "Shared references", exact: true })).toHaveCount(2);
  await tree.getByRole("button", { name: "Shared references", exact: true }).first().click();
  await expect(
    tree.getByRole("button", { name: "Shared references", exact: true }).first()
  ).toHaveAttribute("aria-pressed", "true");
  await tree.getByRole("button", { name: "Expand domain: Cycle A", exact: true }).click();
  await tree.getByRole("button", { name: "Expand domain: Cycle B", exact: true }).click();
  await expect(tree.locator('[data-domain-ref="domain:CycleA"]')).toHaveCount(2);
  await expect(
    tree.getByRole("button", { name: "Expand domain: Cycle A", exact: true })
  ).toHaveCount(1);
  expect(ancestry).toEqual([]);
  const { dialog } = await openHistory(page, sidebar);
  await expect(dialog.getByRole("button", { name: /Merge experiment/ })).toBeVisible();
  expect(ancestry).toHaveLength(1);
});

test("keeps the domain sidebar while searching and filtering history across worlds", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  await sidebar.getByRole("button", { name: "Knowledge world actions" }).click();
  await page.getByRole("menuitem", { name: "View history across worlds" }).click();
  const dialog = page.getByRole("dialog", { name: "Version relationships", exact: true });
  const versions = dialog.locator(".commit-item");
  await expect(versions).toHaveCount(8);
  await expect(sidebar.locator(".commit-item")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Filter knowledge worlds" }).click();
  const choices = page.getByRole("group", { name: "Filter knowledge worlds" });
  await expect(choices.getByRole("checkbox")).toHaveCount(4);
  await choices.getByRole("checkbox", { name: "develop", exact: true }).uncheck();
  await expect(versions).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "experiment", exact: true }).uncheck();
  await expect(versions).toHaveCount(7);
  await choices.getByRole("checkbox", { name: "main", exact: true }).uncheck();
  await expect(versions).toHaveCount(4);
  await choices.getByRole("checkbox", { name: "feature/search", exact: true }).uncheck();
  await expect(versions).toHaveCount(0);
  await expect(dialog.getByText("Select a knowledge world to show versions.")).toBeVisible();
  await choices.getByRole("button", { name: "Select all" }).click();
  await page.keyboard.press("Escape");
  await expect(versions).toHaveCount(8);
  const search = dialog.getByRole("searchbox", { name: "Search loaded versions..." });
  await search.fill("7A1D9E");
  await expect(versions).toHaveCount(1);
  await expect(dialog.getByText("Add knowledge sources")).toBeVisible();
  await search.fill("unknown-hash");
  await expect(versions).toHaveCount(0);
  await expect(dialog.getByText("No matching versions.")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(domains(sidebar).getByRole("button", { name: "Work", exact: true })).toBeVisible();
  await expect(sidebar.getByRole("button", { name: "main", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
});

test("opens an unexpanded world's history independently and keeps a world without domains compact", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const { dialog } = await openHistory(page, sidebar, "develop");
  await expect(
    sidebar.getByRole("button", { name: "main", exact: true, includeHidden: true })
  ).toHaveAttribute("aria-current", "page");
  await expect(dialog.locator('button[aria-pressed="true"]')).toHaveCount(0);
  await page.keyboard.press("Escape");
  await sidebar.getByRole("button", { name: "develop", exact: true }).click();
  await expect(sidebar.getByRole("button", { name: "develop", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(
    sidebar.getByRole("button", { name: "Expand knowledge world: develop", exact: true })
  ).toHaveCount(0);
  await expect(sidebar.locator(".commit-item")).toHaveCount(0);
  await expect(domains(sidebar, "develop").locator("[data-domain-ref]")).toHaveCount(0);
});

test("retains the browsing world and domains when another world's version cannot be opened", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  await page.route("**/api/v1/evolution/get", async (route) => {
    const request = route.request().postDataJSON() as { state: string };
    if (request.state === "commit/" + states.develop)
      await route.fulfill({ status: 503, json: { code: "IO_ERROR", message: "unavailable" } });
    else await route.fallback();
  });
  await sidebar.getByRole("button", { name: "develop", exact: true }).click();
  await expect(sidebar.getByRole("alert")).toContainText("Could not open this version");
  await expect(sidebar.getByRole("button", { name: "main", exact: true })).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(domains(sidebar).getByRole("button", { name: "Work", exact: true })).toBeVisible();
});

test("draws real merge edges in a centered dialog and binds old domains to the chosen version", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const canvas = page.locator(".canvas-stage");
  const before = await canvas.boundingBox();
  const { trigger, dialog } = await openHistory(page, sidebar);
  for (const parent of [states.shared, states.experiment])
    await expect(
      dialog.locator(`path[data-child="commit/${states.merge}"][data-parent="commit/${parent}"]`)
    ).toHaveCount(1);
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  const viewport = page.viewportSize();
  if (bounds === null || viewport === null) throw new Error("Missing dialog bounds");
  expect(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2)).toBeLessThan(2);
  expect(await canvas.boundingBox()).toEqual(before);
  await dialog.getByRole("button", { name: /Fix node properties/ }).click();
  await expect(dialog.getByRole("button", { name: /Fix node properties/ })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(
    domains(sidebar).getByRole("button", { name: "Historical archive", exact: true })
  ).toBeVisible();
  await expect(domains(sidebar).getByRole("button", { name: "Work", exact: true })).toHaveCount(0);
  await expect(sidebar.getByText("Viewing a historical version")).toBeVisible();
  await sidebar.getByRole("button", { name: "Back to latest", exact: true }).click();
  await expect(domains(sidebar).getByRole("button", { name: "Work", exact: true })).toBeVisible();
  expect(await canvas.boundingBox()).toEqual(before);
});

test("makes a pending version switch visible and confirms it without moving a visible row", async ({
  page
}) => {
  await authenticate(page);
  let resume: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const requests: string[] = [];
  await page.route("**/api/v1/evolution/get", async (route) => {
    const request = route.request().postDataJSON() as { state: string };
    if (request.state === "commit/" + states.shared) {
      requests.push(request.state);
      await pending;
    }
    await route.fallback();
  });
  const { dialog } = await openHistory(page, page.locator(".version-sidebar"));
  const identity = dialog.locator(".version-browsing-identity");
  const current = dialog.locator(`[data-version-state="commit/${states.main}"] button`);
  const target = dialog.locator(`[data-version-state="commit/${states.shared}"] button`);
  const viewport = dialog.locator(".version-dag-viewport");
  await expect(identity).toContainText(states.main.slice(0, 7));
  await expect(target.locator(".version-switch-action")).toHaveText("Switch to version");
  const before = await viewport.evaluate((element) => element.scrollTop);
  const bounds = await viewport.boundingBox();
  try {
    await target.click();
    await expect(target).toHaveAttribute("aria-busy", "true");
    await expect(target.locator(".version-switch-action")).toHaveText("Switching...");
    await expect(dialog.locator(".version-browsing-feedback")).toContainText(
      "Switching to main · " + states.shared.slice(0, 7)
    );
    await expect(identity).toContainText(states.main.slice(0, 7));
    await expect(current).toHaveAttribute("aria-pressed", "true");
    await target.click();
    expect(requests).toHaveLength(1);
  } finally {
    resume?.();
  }
  await expect(target).toHaveAttribute("aria-busy", "false");
  await expect(target).toHaveAttribute("aria-pressed", "true");
  await expect(target.locator(".version-switch-action")).toHaveText("Current view");
  await expect(current).toHaveAttribute("aria-pressed", "false");
  await expect(identity).toContainText(states.shared.slice(0, 7));
  await expect(identity).toContainText("Historical version");
  await expect(dialog).toBeVisible();
  expect(await viewport.evaluate((element) => element.scrollTop)).toBe(before);
  expect(await viewport.boundingBox()).toEqual(bounds);
  await target.click();
  expect(requests).toHaveLength(1);
  await dialog.getByRole("button", { name: "Back to latest", exact: true }).click();
  await expect(identity).toContainText(states.main.slice(0, 7));
  await expect(identity).toContainText("Latest version");
  await expect(dialog.locator(".version-browsing-feedback")).toHaveText(
    "You are viewing the latest version."
  );
  await expect(dialog).toBeVisible();
});

test("keeps the current version and readable switch feedback after a failure on a narrow screen", async ({
  page
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await authenticate(page);
  await page.route("**/api/v1/evolution/get", async (route) => {
    const request = route.request().postDataJSON() as { state: string };
    if (request.state === "commit/" + states.shared)
      await route.fulfill({ status: 503, json: { code: "IO_ERROR", message: "unavailable" } });
    else await route.fallback();
  });
  await page.locator(".sidebar-handle").click();
  const { dialog } = await openHistory(page, page.locator(".version-drawer"));
  const target = dialog.locator(`[data-version-state="commit/${states.shared}"] button`);
  await expect(target.locator(".version-switch-action")).toHaveText("Switch to version");
  await target.click();
  await expect(dialog.locator(".version-browsing-status").getByRole("alert")).toContainText(
    "Could not open this version. Your previous selection is unchanged."
  );
  await expect(dialog.locator(".version-browsing-identity")).toContainText(states.main.slice(0, 7));
  await expect(
    dialog.locator(`[data-version-state="commit/${states.main}"] button`)
  ).toHaveAttribute("aria-pressed", "true");
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await expect(target).toHaveAttribute("aria-busy", "false");
  await expect(dialog).toBeVisible();
  const actionBounds = await target.locator(".version-switch-action").boundingBox();
  const dialogBounds = await dialog.boundingBox();
  if (actionBounds === null || dialogBounds === null) throw new Error("Missing switch bounds");
  expect(actionBounds.x).toBeGreaterThanOrEqual(dialogBounds.x);
  expect(actionBounds.x + actionBounds.width).toBeLessThanOrEqual(
    dialogBounds.x + dialogBounds.width
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
  ).toBe(false);
});

test("keeps missing parents and retries the exact pinned history page after a failure", async ({
  page
}) => {
  await mockInstance(page);
  const calls: { root: string; cursor?: string }[] = [];
  const items = versionAncestry.get(states.main) ?? [];
  let unavailable = true;
  await page.route("**/api/v1/evolution/ancestry", async (route) => {
    const input = route.request().postDataJSON() as { root: string; cursor?: string };
    if (input.root !== "commit/" + states.main) return route.fallback();
    calls.push(input);
    if (input.cursor !== undefined && unavailable) {
      await route.fulfill({ status: 503, json: { code: "IO_ERROR", message: "unavailable" } });
      return;
    }
    await route.fulfill({
      json: {
        root: states.main,
        items: input.cursor === undefined ? items.slice(0, 2) : items.slice(2),
        ...(input.cursor === undefined ? { cursor: "main-page-2" } : {})
      }
    });
  });
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const { dialog } = await openHistory(page, page.locator(".version-sidebar"));
  await expect(dialog.locator('[data-loaded="false"]')).toHaveCount(2);
  await dialog.getByRole("button", { name: "Load earlier versions" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Could not load version history");
  await expect(dialog.locator('[data-loaded="false"]')).toHaveCount(2);
  unavailable = false;
  await dialog.getByRole("button", { name: "Load earlier versions" }).click();
  await expect(dialog.locator('[data-loaded="false"]')).toHaveCount(0);
  expect(calls.at(-1)).toMatchObject({ root: "commit/" + states.main, cursor: "main-page-2" });
});

test("reports moved and deleted references without replacing the pinned domain snapshot", async ({
  page
}) => {
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const { dialog } = await openHistory(page, sidebar);
  await dialog.getByRole("button", { name: /Fix node properties/ }).click();
  await page.keyboard.press("Escape");
  await expect(
    domains(sidebar).getByRole("button", { name: "Historical archive", exact: true })
  ).toBeVisible();
  let deleted = false;
  await page.route("**/api/v1/evolution/branch/list", (route) =>
    route.fulfill({
      json: {
        items: deleted
          ? [{ name: "develop", state: states.develop }]
          : [{ name: "main", state: states.develop }]
      }
    })
  );
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(sidebar).toContainText(/new version/i);
  await expect(
    domains(sidebar).getByRole("button", { name: "Historical archive", exact: true })
  ).toBeVisible();
  deleted = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(sidebar).toContainText(/no longer exists/i);
  const reopened = await openHistory(page, sidebar);
  await expect(
    reopened.dialog.getByRole("button", { name: /Fix node properties/ })
  ).toHaveAttribute("aria-pressed", "true");
});
