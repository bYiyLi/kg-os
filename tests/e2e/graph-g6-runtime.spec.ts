import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import { nodeCenter, worldPoint } from "./graph-g6-geometry.js";

test.use({
  colorScheme: "light",
  reducedMotion: "no-preference",
  viewport: { width: 1280, height: 900 }
});
test.setTimeout(90_000);

async function stableScreenPosition(node: Locator) {
  let last: { x: number; y: number } | undefined;
  let quiet = 0;
  await expect
    .poll(
      async () => {
        const point = await nodeCenter(node);
        quiet =
          last !== undefined && Math.hypot(point.x - last.x, point.y - last.y) < 0.25
            ? quiet + 1
            : 0;
        last = point;
        return quiet;
      },
      { intervals: [60, 100, 120, 150] }
    )
    .toBeGreaterThanOrEqual(3);
}

async function positions(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.locator(".graph-node").evaluateAll((nodes) =>
    Object.fromEntries(
      nodes.map((node) => {
        const element = node as HTMLElement;
        return [
          element.dataset["nodeId"] ?? "",
          { x: Number(element.dataset["x"]), y: Number(element.dataset["y"]) }
        ];
      })
    )
  );
}

test("mouse release and drag release settle briefly without long-tail movement", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true", {
      timeout: 20_000
    });
    const target = page.locator('[data-node-id="' + runtime.targetId + '"]');
    await stableScreenPosition(target);
    const start = await nodeCenter(target);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.waitForTimeout(375);
    const duringHold = await positions(page);
    await page.mouse.up();
    // A short deceleration is intentional; all motion must finish before
    // the 300ms checkpoint and remain stable afterwards.
    await page.waitForTimeout(300);
    const afterHoldSettle = await positions(page);
    await page.waitForTimeout(260);
    expect(await positions(page)).toEqual(afterHoldSettle);
    expect(Object.keys(duringHold)).toHaveLength(3);
    await expect(target).toHaveAttribute("data-pinned", "false");

    const again = await nodeCenter(target);
    const beforeDrag = await worldPoint(target);
    await page.mouse.move(again.x, again.y);
    await page.mouse.down();
    await page.mouse.move(again.x + 75, again.y + 40, { steps: 12 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const current = await worldPoint(target);
        return Math.hypot(current.x - beforeDrag.x, current.y - beforeDrag.y);
      })
      .toBeGreaterThan(20);
    await page.waitForTimeout(300);
    const afterDragSettle = await positions(page);
    await page.waitForTimeout(260);
    expect(await positions(page)).toEqual(afterDragSettle);
    await expect(target).toHaveAttribute("data-pinned", "false");
    expect(errors).toEqual([]);
  } finally {
    await page.mouse.up();
    await runtime.close();
  }
});

test("G6 drag moves the node with elastic neighbor response and no automatic pin", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  const errors: string[] = [];
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });
  try {
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true", {
      timeout: 15_000
    });
    await expect.poll(() => page.locator(".graph-scene canvas").count()).toBeGreaterThan(0);
    const target = page.locator('[data-node-id="' + runtime.targetId + '"]');
    const neighbor = page.locator('[data-node-id="' + runtime.neighborId + '"]');
    await stableScreenPosition(target);
    const start = await nodeCenter(target);
    const before = await worldPoint(target);
    const other = await worldPoint(neighbor);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 85, start.y + 60, { steps: 16 });
    await expect
      .poll(async () => {
        const point = await worldPoint(target);
        return Math.hypot(point.x - before.x, point.y - before.y);
      })
      .toBeGreaterThan(20);
    await expect
      .poll(async () => {
        const point = await worldPoint(neighbor);
        return Math.hypot(point.x - other.x, point.y - other.y);
      })
      .toBeGreaterThan(1);
    await page.mouse.up();
    await expect(target).toHaveAttribute("data-pinned", "false");
    const dropped = await nodeCenter(target);
    await page.mouse.move(dropped.x, dropped.y);
    await page.mouse.down();
    // Match the first drag's duration so G6 can recognize the repeated gesture.
    await page.mouse.move(dropped.x + 36, dropped.y + 25, { steps: 16 });
    await page.mouse.up();
    await expect
      .poll(async () => {
        const latest = await nodeCenter(target);
        return Math.hypot(latest.x - dropped.x, latest.y - dropped.y);
      })
      .toBeGreaterThan(20);
    await expect(target).toHaveAttribute("data-pinned", "false");
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
    expect(errors).toEqual([]);
    const screenshot = test.info().outputPath("g6-elastic-graph-real-runtime.png");
    await page.screenshot({ path: screenshot });
    await test
      .info()
      .attach("G6 force layout interaction", { path: screenshot, contentType: "image/png" });
  } finally {
    await page.mouse.up();
    await runtime.close();
  }
});
