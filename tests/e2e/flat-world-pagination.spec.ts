import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { mockInstance } from "./web-shell-fixture.js";
import { mockDomainRoutes, states } from "./version-fixture.js";
import type { DomainReadCall, FixtureDomain } from "./version-fixture.js";

function records(total: number): FixtureDomain[] {
  return Array.from({ length: total }, (_, index) => ({
    name: "Domain" + String(index + 1).padStart(3, "0"),
    title: "Domain " + String(index + 1),
    includes: []
  }));
}

async function domainFixture(
  page: Page,
  options: { total: number; pageSize: number; behavior?: "repeat" | "failure" }
) {
  await mockInstance(page);
  const calls = await mockDomainRoutes(page, {
    records: records(options.total),
    pageSize: options.pageSize,
    ...(options.behavior === undefined ? {} : { behavior: options.behavior })
  });
  await page.goto("/");
  await page.getByLabel("Access Token", { exact: true }).fill("valid-token");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  const sidebar = page.locator(".version-sidebar");
  return {
    calls,
    sidebar,
    viewport: sidebar.locator(".world-directory-scroll"),
    tree: sidebar.getByRole("region", { name: "Domains: main", exact: true })
  };
}

async function isOverflowing(viewport: Locator) {
  return viewport.evaluate((element) => element.scrollHeight > element.clientHeight + 1);
}

function expectPinnedRequests(calls: DomainReadCall[]) {
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) expect(call.at).toBe("commit/" + states.main);
  for (const call of calls.filter((item) => item.operation === "objects"))
    expect(call.refs?.length).toBeLessThanOrEqual(100);
}

test("completes every overview page before exposing the domain tree", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const fixture = await domainFixture(page, { total: 3, pageSize: 2 });
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(3);
  const overviews = fixture.calls.filter((call) => call.operation === "overview");
  expect(overviews).toHaveLength(2);
  expect(overviews[1]?.cursor).toBe("offset:2");
  expect(fixture.calls.filter((call) => call.operation === "objects")).toHaveLength(1);
  expect(await isOverflowing(fixture.viewport)).toBe(false);
  await expect(fixture.sidebar.locator(".commit-item")).toHaveCount(0);
  await expect(fixture.sidebar.getByRole("button", { name: "Load earlier versions" })).toHaveCount(
    0
  );
  await expect(fixture.sidebar.locator(".sidebar-bottom").getByRole("button")).toHaveCount(2);
  expectPinnedRequests(fixture.calls);
});

test("scrolls long trees internally without moving settings or rereading on resize", async ({
  page
}) => {
  await page.clock.install();
  await page.setViewportSize({ width: 1280, height: 620 });
  const fixture = await domainFixture(page, { total: 110, pageSize: 25 });
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(110);
  await expect.poll(() => isOverflowing(fixture.viewport)).toBe(true);
  const batches = fixture.calls.filter((call) => call.operation === "objects");
  expect(batches).toHaveLength(2);
  expect(batches.map((call) => call.refs?.length).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
    10, 100
  ]);
  const settings = fixture.sidebar.getByRole("button", { name: "Settings", exact: true });
  const footerBefore = await settings.boundingBox();
  const count = fixture.calls.length;
  await fixture.viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await page.clock.fastForward(2000);
  expect(fixture.calls).toHaveLength(count);
  expect(await settings.boundingBox()).toEqual(footerBefore);
  await page.setViewportSize({ width: 1280, height: 1100 });
  await page.clock.fastForward(2000);
  expect(fixture.calls).toHaveLength(count);
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(110);
  expectPinnedRequests(fixture.calls);
});

test("rejects a repeated overview cursor rather than showing an incomplete tree", async ({
  page
}) => {
  await page.clock.install();
  const fixture = await domainFixture(page, { total: 5, pageSize: 1, behavior: "repeat" });
  await expect(fixture.sidebar.getByRole("alert")).toBeVisible();
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(0);
  expect(fixture.calls.filter((call) => call.operation === "overview")).toHaveLength(2);
  expect(fixture.calls.filter((call) => call.operation === "objects")).toHaveLength(0);
  const count = fixture.calls.length;
  await page.clock.fastForward(2000);
  expect(fixture.calls).toHaveLength(count);
  expectPinnedRequests(fixture.calls);
});

test("keeps failed overview pages uncommitted and retries the same immutable snapshot", async ({
  page
}) => {
  const fixture = await domainFixture(page, { total: 5, pageSize: 2, behavior: "failure" });
  await expect(fixture.sidebar.getByRole("alert")).toBeVisible();
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(0);
  expect(fixture.calls.filter((call) => call.operation === "objects")).toHaveLength(0);
  expectPinnedRequests(fixture.calls);
  const retried = await mockDomainRoutes(page, { records: records(5), pageSize: 2 });
  await fixture.sidebar.getByRole("button", { name: "Retry domains", exact: true }).click();
  await expect(fixture.tree.locator("[data-domain-ref]")).toHaveCount(5);
  await expect(fixture.sidebar.getByRole("alert")).toHaveCount(0);
  expectPinnedRequests(retried);
});
