import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { mockInstance } from "./web-shell-fixture.js";
import { states } from "./version-fixture.js";

interface HistoryRequest {
  root: string;
  limit: number;
  cursor?: string;
}

interface HistoryOptions {
  total: number;
  pageSize: number;
  behavior?: "repeat" | "failure";
}

function historyItems(total: number) {
  const ids = Array.from({ length: total }, (_, index) =>
    index === 0 ? states.main : index.toString(16).padStart(64, "0")
  );
  const epoch = Date.now() * 1000;
  return ids.map((state, index) => ({
    state,
    message: `History version ${String(index + 1)}`,
    committedAt: epoch - index * 1_000_000,
    parents: ids[index + 1] === undefined ? [] : [ids[index + 1]]
  }));
}

async function paginationFixture(page: Page, options: HistoryOptions) {
  await mockInstance(page);
  const items = historyItems(options.total);
  const calls: HistoryRequest[] = [];
  let references = 0;
  await page.route("**/api/v1/evolution/branch/list", async (route) => {
    references++;
    await route.fulfill({ json: { items: [{ name: "main", state: states.main }] } });
  });
  await page.route("**/api/v1/evolution/tag/list", (route) =>
    route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/evolution/ancestry", async (route) => {
    const input = route.request().postDataJSON() as HistoryRequest;
    calls.push(input);
    if (input.cursor !== undefined && options.behavior === "failure") {
      await route.fulfill({
        status: 503,
        json: { code: "IO_ERROR", message: "Temporary history read failure" }
      });
      return;
    }
    const repeated = input.cursor !== undefined && options.behavior === "repeat";
    const offset = repeated ? 0 : Number(input.cursor?.slice("offset:".length) ?? 0);
    const next = offset + options.pageSize;
    let cursor: string | undefined;
    if (repeated) cursor = input.cursor;
    else if (next < items.length) cursor = `offset:${String(next)}`;
    await route.fulfill({
      json: {
        root: states.main,
        items: items.slice(offset, next),
        ...(cursor === undefined ? {} : { cursor })
      }
    });
  });
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const sidebar = page.locator(".version-sidebar");
  const viewport = sidebar.locator(".world-directory-scroll");
  const history = sidebar.getByRole("region", { name: "Version history: main", exact: true });
  await expect(history).toBeVisible();
  return { calls, sidebar, viewport, history, references: () => references };
}

async function isOverflowing(viewport: Locator) {
  return viewport.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
}

function expectPinnedRequests(calls: HistoryRequest[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call.root).toBe("commit/" + states.main);
    expect(call.limit).toBe(20);
  }
}

test("fills short history to exhaustion without inventing rows or a load-more control", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await paginationFixture(page, { total: 3, pageSize: 2 });
  await expect(fixture.history.locator(".commit-row")).toHaveCount(3);
  expect(fixture.calls).toHaveLength(2);
  expect(fixture.calls[1]?.cursor).toBe("offset:2");
  expect(await isOverflowing(fixture.viewport)).toBe(false);
  await expect(fixture.history.getByRole("button", { name: "Load earlier versions" })).toHaveCount(
    0
  );
  await expect(fixture.sidebar.locator(".world-directory-scroll")).toHaveCount(1);
  await expect(fixture.sidebar.locator(".sidebar-bottom").getByRole("button")).toHaveCount(1);
  await expect(
    fixture.sidebar.getByRole("button", { name: "Settings", exact: true })
  ).toBeVisible();
  expectPinnedRequests(fixture.calls);
});

test("fills long history to overflow, then appends only by explicit action while preserving scroll", async ({
  page
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 760 });
  const fixture = await paginationFixture(page, { total: 180, pageSize: 2 });
  await expect.poll(() => isOverflowing(fixture.viewport)).toBe(true);
  const initialCount = await fixture.history.locator(".commit-row").count();
  expect(initialCount).toBeGreaterThan(2);
  expect(initialCount).toBeLessThan(180);
  const initialCalls = fixture.calls.length;
  const settings = fixture.sidebar.getByRole("button", { name: "Settings", exact: true });
  const footerBefore = await settings.boundingBox();
  await fixture.viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.clock.fastForward(2_000);
  expect(fixture.calls).toHaveLength(initialCalls);
  const more = fixture.history.getByRole("button", { name: "Load earlier versions" });
  await expect(more).toBeVisible();
  const scrollBefore = await fixture.viewport.evaluate((element) => element.scrollTop);
  expect(await more.evaluate((element) => getComputedStyle(element).position)).not.toBe("fixed");
  await more.click();
  await expect(fixture.history.locator(".commit-row")).toHaveCount(initialCount + 2);
  expect(fixture.calls.at(-1)?.cursor).toBe(`offset:${String(initialCount)}`);
  expect(await fixture.viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(
    scrollBefore,
    0
  );
  expect(await settings.boundingBox()).toEqual(footerBefore);
  const observedBefore = fixture.references();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(fixture.references).toBeGreaterThan(observedBefore);
  expect(await fixture.viewport.evaluate((element) => element.scrollTop)).toBeCloseTo(
    scrollBefore,
    0
  );
  expectPinnedRequests(fixture.calls);
});

test("adds pinned pages when a taller viewport creates genuine empty navigation space", async ({
  page
}) => {
  await page.setViewportSize({ width: 1280, height: 520 });
  const fixture = await paginationFixture(page, { total: 180, pageSize: 2 });
  await expect.poll(() => isOverflowing(fixture.viewport)).toBe(true);
  const before = await fixture.history.locator(".commit-row").count();
  const heightBefore = await fixture.viewport.evaluate((element) => element.clientHeight);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await expect
    .poll(() => fixture.viewport.evaluate((element) => element.clientHeight))
    .toBeGreaterThan(heightBefore);
  await expect.poll(() => fixture.history.locator(".commit-row").count()).toBeGreaterThan(before);
  await expect.poll(() => isOverflowing(fixture.viewport)).toBe(true);
  expectPinnedRequests(fixture.calls);
});

test("stops automatic filling when a repeated cursor adds no history", async ({ page }) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await paginationFixture(page, { total: 180, pageSize: 1, behavior: "repeat" });
  await expect(fixture.sidebar).toContainText(
    "No additional versions were received. Refresh to try again."
  );
  await expect(fixture.history.locator(".commit-row")).toHaveCount(1);
  expect(fixture.calls).toHaveLength(2);
  await page.clock.fastForward(2_000);
  expect(fixture.calls).toHaveLength(2);
  expectPinnedRequests(fixture.calls);
});

test("retains loaded history and stops automatic retry after the next-page read fails", async ({
  page
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await paginationFixture(page, { total: 180, pageSize: 1, behavior: "failure" });
  await expect(fixture.sidebar.getByRole("alert")).toContainText("Could not load version history");
  await expect(fixture.history.locator(".commit-row")).toHaveCount(1);
  expect(fixture.calls).toHaveLength(2);
  await page.clock.fastForward(2_000);
  expect(fixture.calls).toHaveLength(2);
  expectPinnedRequests(fixture.calls);
});
