import { expect, test as base } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { atScreen, graphCamera, inWorld, nodeCenter, worldPoint } from "./graph-g6-geometry.js";
import type { Matrix, Point } from "./graph-g6-geometry.js";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import type { GraphRuntime } from "./graph-runtime.js";

const test = base.extend<{ graph: GraphRuntime }>({
  graph: async ({ page, request }, use) => {
    const runtime = await createGraphRuntime(request);
    try {
      await signInGraph(page, runtime);
      const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
      await search.fill("needle");
      await search.press("Enter");
      await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
      // Four-way search always includes recent knowledge, including the linked fixture node.
      await expect(page.locator(".graph-node")).toHaveCount(3);
      await expect(page.locator(".graph-relationship")).toHaveCount(3);
      await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true");
      await expect(page.locator('[data-node-id="' + runtime.targetId + '"]')).toHaveAttribute(
        "data-x",
        /^-?\d/
      );
      await use(runtime);
    } finally {
      await runtime.close();
    }
  }
});

test.use({ colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
test.setTimeout(90000);

function item(page: Page, id: string): Locator {
  return page.locator('[data-graph-id="' + id + '"]');
}

function camera(node: Locator): Promise<Matrix> {
  return graphCamera(node);
}

function closePoint(actual: Point, expected: Point, tolerance = 2) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tolerance);
}

async function stableScreenNode(node: Locator) {
  let previous: Point | undefined;
  let settled = 0;
  await expect
    .poll(
      async () => {
        const now = await nodeCenter(node);
        settled =
          previous !== undefined && Math.hypot(now.x - previous.x, now.y - previous.y) < 0.2
            ? settled + 1
            : 0;
        previous = now;
        return settled;
      },
      { intervals: [80, 100, 120, 150] }
    )
    .toBeGreaterThanOrEqual(4);
}

test("double-click and Shift+Enter manage the exploration even when recent search already shows its neighbors", async ({
  page,
  graph
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const target = item(page, graph.targetId);
  const canvas = page.locator(".graph-scene");
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(target).toBeEnabled();
  await stableScreenNode(target);
  let point = await nodeCenter(target);
  await page.mouse.dblclick(point.x, point.y);
  await expect(target).toHaveAttribute("aria-expanded", "true");
  await expect(item(page, graph.neighborId)).toHaveCount(1);
  await expect(page.locator(".graph-relationship")).toHaveCount(3);

  // Double-click is reserved for exploration, and must not open a details
  // overlay that intercepts a second double-click on the same node.
  await expect(page.getByRole("complementary", { name: "Object details" })).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(target).toBeEnabled();
  await stableScreenNode(target);
  point = await nodeCenter(target);
  await page.mouse.dblclick(point.x, point.y);
  await expect(target).toHaveAttribute("aria-expanded", "false");
  // Search seeds survive retraction, including connected neighbors.
  await expect(item(page, graph.neighborId)).toHaveCount(1);
  await expect(page.locator(".graph-node")).toHaveCount(3);
  await expect(item(page, selfLoop)).toHaveCount(1);

  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(target).toBeEnabled();
  await target.press("Shift+Enter");
  await expect(target).toHaveAttribute("aria-expanded", "true");
  await expect(canvas).toHaveAttribute("data-ready", "true");
  await expect(target).toBeEnabled();
  await target.press("Shift+Enter");
  await expect(target).toHaveAttribute("aria-expanded", "false");
  await expect(item(page, selfLoop)).toHaveCount(1);
});

test("a later node expansion does not cancel an earlier in-flight exploration", async ({
  page,
  graph
}) => {
  const release = Promise.withResolvers<undefined>();
  let received = false;
  await page.route("**/api/v1/graph/query", async (route) => {
    const request = route.request().postDataJSON() as { params?: { id?: string } };
    if (request.params?.id !== graph.targetId) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    received = true;
    await release.promise;
    await route.fulfill({ response });
  });
  try {
    // This test exercises concurrency, not mouse hit-testing (covered above).
    // Keyboard exploration avoids graph nodes obscured by floating UI.
    await item(page, graph.targetId).press("Shift+Enter");
    await expect.poll(() => received).toBe(true);
    const other = page.getByRole("button", { name: /Related insight, node / });
    await other.press("Shift+Enter");
    await expect(page.getByRole("complementary", { name: "Object details" })).toHaveCount(0);
    await expect(other).toHaveAttribute("aria-expanded", "true");
    release.resolve(undefined);
    await expect(item(page, graph.neighborId)).toHaveCount(1);
    await expect(item(page, graph.targetId)).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".graph-node")).toHaveCount(3);
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
  } finally {
    release.resolve(undefined);
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("real dragging follows the pointer without pinning, explicit pin survives arrangement", async ({
  page,
  graph
}) => {
  const target = item(page, graph.targetId);
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  const edge = item(page, selfLoop);
  await stableScreenNode(target);
  const before = await nodeCenter(target);
  const beforeWorld = await worldPoint(target);
  const transform = await camera(target);
  await page.mouse.move(before.x, before.y);
  await page.mouse.down();
  await page.mouse.move(before.x + 80, before.y + 55, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const actual = await nodeCenter(target);
      return Math.max(Math.abs(actual.x - before.x - 80), Math.abs(actual.y - before.y - 55));
    })
    .toBeLessThan(2);
  closePoint(await nodeCenter(target), { x: before.x + 80, y: before.y + 55 });
  closePoint(await worldPoint(target), {
    x: beforeWorld.x + 80 / transform.a,
    y: beforeWorld.y + 55 / transform.d
  });
  await expect(edge).toHaveCount(1);
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "Object details" })).toHaveCount(0);
  await expect(target).toHaveAttribute("data-pinned", "false");
  let point = await nodeCenter(target);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Pin position", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Pin position", exact: true }).click();
  await expect(target).toHaveAttribute("data-pinned", "true");
  const pinned = await nodeCenter(target);
  await page.getByRole("button", { name: "Arrange graph", exact: true }).click();
  closePoint(await nodeCenter(target), pinned);
  point = await nodeCenter(target);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unpin position", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Unpin position", exact: true }).click();
  await expect(target).toHaveAttribute("data-pinned", "false");
});

test("ordinary wheel zoom keeps the cursor anchor and graph shortcuts do not steal typing", async ({
  page,
  graph
}) => {
  const target = item(page, graph.targetId);
  // The searched node can appear under the floating search or toolbar.
  // Scroll over the unobstructed scene so this checks camera anchoring,
  // not whether a workspace overlay intercepts a wheel event.
  const cursor = await page.locator(".graph-scene").evaluate((scene) => {
    const rect = scene.getBoundingClientRect();
    return { x: rect.left + rect.width * 0.65, y: rect.top + rect.height * 0.58 };
  });
  const before = await camera(target);
  const anchor = inWorld(before, cursor);
  await page.mouse.move(cursor.x, cursor.y);
  await page.mouse.wheel(0, -90);
  await expect.poll(async () => (await camera(target)).a).toBeGreaterThan(before.a);
  closePoint(atScreen(await camera(target), anchor), cursor);
  const after = await camera(target);
  const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
  await search.fill("");
  await search.press("f");
  await search.press("0");
  await expect(search).toHaveValue("f0");
  const unchanged = await camera(target);
  expect(unchanged.a).toBeCloseTo(after.a, 5);
  expect(unchanged.e).toBeCloseTo(after.e, 0);
  expect(unchanged.f).toBeCloseTo(after.f, 0);
  await page.locator(".graph-scene").focus();
  await page.keyboard.press("0");
  // Per the Web contract, 0 fits the graph, not "zoom out". A small graph may zoom in.
  await expect.poll(async () => Math.abs((await camera(target)).a - after.a)).toBeGreaterThan(0.05);
  const canvas = await page.locator(".graph-scene").boundingBox();
  const fitted = await nodeCenter(target);
  if (canvas === null) throw new Error("Missing graph viewport");
  expect(fitted.x).toBeGreaterThan(canvas.x);
  expect(fitted.x).toBeLessThan(canvas.x + canvas.width);
  expect(fitted.y).toBeGreaterThan(canvas.y);
  expect(fitted.y).toBeLessThan(canvas.y + canvas.height);
});

test("dragging the G6 background pans the canvas while an edge stays keyboard-selectable", async ({
  page,
  graph
}) => {
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  const target = item(page, graph.targetId);
  const edge = item(page, selfLoop);
  const before = await camera(target);
  const world = await worldPoint(target);
  const bounds = await page.locator(".graph-scene").boundingBox();
  const visibleCard = await page.locator(".canvas-stage").boundingBox();
  if (bounds === null || visibleCard === null) throw new Error("Missing graph canvas");
  // The fixed full-width G6 surface extends beneath the desktop sidebar.
  // Start from its visible card area, not the part obscured by navigation.
  const start = {
    x: Math.max(bounds.x + 85, visibleCard.x + 120),
    y: bounds.y + bounds.height - 120
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  // Exercise real frame-paced pointer movement. Dispatching ten CDP moves in
  // one burst can outpace G6's async viewport transforms under concurrent E2E load.
  for (let step = 1; step <= 10; step++) {
    await page.mouse.move(start.x + step * 6, start.y + step * 4.5);
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            resolve();
          });
        })
    );
  }
  await page.mouse.up();
  await expect.poll(async () => (await camera(target)).e - before.e).toBeGreaterThan(30);
  await expect.poll(async () => (await camera(target)).f - before.f).toBeGreaterThan(20);
  closePoint(await worldPoint(target), world);
  await expect(edge).toHaveAttribute("aria-pressed", "false");
  await edge.focus();
  await edge.press("Enter");
  await expect(page.getByRole("complementary", { name: "Object details" })).toContainText(
    "self loop"
  );
  await expect(edge).toHaveAttribute("aria-pressed", "true");
});

test("context hide can be undone and keyboard context dismissal restores graph focus", async ({
  page,
  graph
}) => {
  const target = item(page, graph.targetId);
  await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true");
  await stableScreenNode(target);
  const point = await nodeCenter(target);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Graph actions", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Hide from canvas", exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect(page.locator(".graph-node")).toHaveCount(2);
  const undo = page.getByRole("button", { name: "Undo hide", exact: true });
  await expect(undo).toBeVisible();
  const sidebarBox = await page.locator(".version-sidebar").boundingBox();
  const noticeBox = await page.locator(".graph-action-notice").boundingBox();
  if (sidebarBox === null || noticeBox === null) throw new Error("Missing notice geometry");
  expect(noticeBox.x).toBeGreaterThanOrEqual(sidebarBox.x + sidebarBox.width);
  await undo.click();
  await expect(target).toHaveCount(1);
  await expect(page.locator(".graph-node")).toHaveCount(3);
  await expect(page.locator(".graph-relationship")).toHaveCount(3);
  await target.focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Expand neighbors", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(target).toBeFocused();
  const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
  const searchBounds = await search.boundingBox();
  if (searchBounds === null) throw new Error("Search input has no visible bounds");
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.mouse.click(
    searchBounds.x + searchBounds.width / 2,
    searchBounds.y + searchBounds.height / 2
  );
  await expect(menu).toBeHidden();
  await expect(search).toBeFocused();
});

test("two real touch pointers pinch around their moving midpoint", async ({
  page,
  graph,
  context
}) => {
  const target = item(page, graph.targetId);
  const bounds = await page.locator(".graph-scene").boundingBox();
  if (bounds === null) throw new Error("Graph viewport is missing");
  const middle = { x: bounds.x + bounds.width * 0.62, y: bounds.y + bounds.height * 0.67 };
  const destination = { x: middle.x + 20, y: middle.y + 15 };
  await page.getByRole("button", { name: "Reset zoom to 100%", exact: true }).click();
  await expect.poll(async () => (await camera(target)).a).toBeCloseTo(1, 5);
  await stableScreenNode(target);
  const before = await camera(target);
  const anchor = inWorld(before, middle);
  const session = await context.newCDPSession(page);
  try {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 2 });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [
        { x: middle.x - 55, y: middle.y, id: 1 },
        { x: middle.x + 55, y: middle.y, id: 2 }
      ]
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: destination.x - 90, y: destination.y, id: 1 },
        { x: destination.x + 90, y: destination.y, id: 2 }
      ]
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    // G6 corrects the gesture midpoint on the next rendered frame after
    // touchEnd. Wait for the browser to present that frame before asserting.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              resolve();
            });
          });
        })
    );
    // G6's pinch sensitivity is deliberately independent of the former custom gesture formula.
    await expect.poll(async () => (await camera(target)).a / before.a).toBeGreaterThan(1.4);
    // Pinch zoom and the post-touch viewport-center correction resolve on
    // different animation frames. Keep the same 3px anchor acceptance.
    await expect
      .poll(async () => {
        const point = atScreen(await camera(target), anchor);
        return Math.max(Math.abs(point.x - destination.x), Math.abs(point.y - destination.y));
      })
      .toBeLessThan(3);
    closePoint(atScreen(await camera(target), anchor), destination, 3);
  } finally {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await session.detach();
  }
});
