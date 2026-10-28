import { expect, test as base } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

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
      await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(3);
      await expect(page.locator(".graph-node")).toHaveCount(2);
      await expect(page.locator(".graph-relationship")).toHaveCount(1);
      await use(runtime);
    } finally {
      await runtime.close();
    }
  }
});

test.use({ colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
test.setTimeout(90000);

interface Point {
  x: number;
  y: number;
}
interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

function item(page: Page, id: string): Locator {
  return page.locator('[data-graph-id="' + id + '"]');
}

async function nodeCenter(node: Locator): Promise<Point> {
  const bounds = await node.locator(".graph-node-dot").boundingBox();
  if (bounds === null) throw new Error("Graph node has no visible bounds");
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function camera(node: Locator): Promise<Matrix> {
  return node.evaluate((element) => {
    const matrix = (element.parentElement as unknown as SVGGraphicsElement).getScreenCTM();
    if (matrix === null) throw new Error("Graph viewport has no screen transform");
    return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
  });
}

async function worldPoint(node: Locator): Promise<Point> {
  return node.evaluate((element) => {
    const matrix = (element as SVGGElement).transform.baseVal.consolidate()?.matrix;
    if (matrix === undefined) throw new Error("Graph node has no world transform");
    return { x: matrix.e, y: matrix.f };
  });
}

async function edgePoint(edge: Locator): Promise<Point> {
  return edge.locator(".graph-edge-target").evaluate((element) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2);
    const matrix = path.getScreenCTM();
    if (matrix === null) throw new Error("Graph edge has no screen transform");
    const screen = point.matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  });
}

function atScreen(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  };
}

function inWorld(matrix: Matrix, point: Point): Point {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  return {
    x: (matrix.d * (point.x - matrix.e) - matrix.c * (point.y - matrix.f)) / determinant,
    y: (-matrix.b * (point.x - matrix.e) + matrix.a * (point.y - matrix.f)) / determinant
  };
}

function closePoint(actual: Point, expected: Point, tolerance = 2) {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(tolerance);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(tolerance);
}

async function stableNode(node: Locator) {
  let previous: Point | undefined;
  let unchanged = 0;
  await expect
    .poll(
      async () => {
        const point = await worldPoint(node);
        unchanged =
          previous !== undefined && Math.hypot(point.x - previous.x, point.y - previous.y) < 0.05
            ? unchanged + 1
            : 0;
        previous = point;
        return unchanged;
      },
      { intervals: [50, 50, 100] }
    )
    .toBeGreaterThanOrEqual(2);
}

test("double-click and Shift+Enter expand and retract only that exploration", async ({
  page,
  graph
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const target = item(page, graph.targetId);
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  let point = await nodeCenter(target);
  await page.mouse.dblclick(point.x, point.y);
  await expect(item(page, graph.neighborId)).toHaveCount(1);
  await expect(page.locator(".graph-relationship")).toHaveCount(3);
  await stableNode(target);
  point = await nodeCenter(target);
  await page.mouse.dblclick(point.x, point.y);
  await expect(item(page, graph.neighborId)).toHaveCount(0);
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await expect(item(page, selfLoop)).toHaveCount(1);
  await target.focus();
  await page.keyboard.press("Shift+Enter");
  await expect(item(page, graph.neighborId)).toHaveCount(1);
  await target.focus();
  await page.keyboard.press("Shift+Enter");
  await expect(item(page, graph.neighborId)).toHaveCount(0);
  await expect(item(page, selfLoop)).toHaveCount(1);
});

test("a later node selection does not cancel an earlier in-flight exploration", async ({
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
    const first = await nodeCenter(item(page, graph.targetId));
    await page.mouse.dblclick(first.x, first.y);
    await expect.poll(() => received).toBe(true);
    await page.getByRole("button", { name: "Close object details", exact: true }).click();
    const second = await nodeCenter(page.getByRole("button", { name: /Related insight, node / }));
    await page.mouse.dblclick(second.x, second.y);
    await expect(page.getByRole("complementary", { name: "Object details" })).toContainText(
      "Related insight"
    );
    release.resolve(undefined);
    await expect(item(page, graph.neighborId)).toHaveCount(1);
    await expect(page.locator(".graph-node")).toHaveCount(3);
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
  } finally {
    release.resolve(undefined);
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("real node dragging follows the pointer, moves edges, pins and survives arrangement", async ({
  page,
  graph
}) => {
  const target = item(page, graph.targetId);
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  const edge = item(page, selfLoop).locator(".graph-edge-target");
  const beforeEdge = await edge.getAttribute("d");
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
  expect(await edge.getAttribute("d")).not.toBe(beforeEdge);
  await expect(target).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("complementary", { name: "Object details" })).toHaveCount(0);
  const pinned = await nodeCenter(target);
  await page.getByRole("button", { name: "Arrange graph", exact: true }).click();
  closePoint(await nodeCenter(target), pinned);
  const point = await nodeCenter(target);
  await page.mouse.click(point.x, point.y, { button: "right" });
  await expect(page.getByRole("menuitem", { name: "Unpin position", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("ordinary wheel zoom keeps the cursor anchor and graph shortcuts do not steal typing", async ({
  page,
  graph
}) => {
  const target = item(page, graph.targetId);
  const cursor = await nodeCenter(target);
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
  expect(await camera(target)).toEqual(after);
  await page.locator(".graph-scene").focus();
  await page.keyboard.press("0");
  await expect.poll(async () => (await camera(target)).a).toBeLessThan(after.a);
});

test("dragging from a relationship pans the canvas while a light click still selects it", async ({
  page,
  graph
}) => {
  const selfLoop = graph.relationshipIds[2];
  if (selfLoop === undefined) throw new Error("Missing self-loop identity");
  const target = item(page, graph.targetId);
  const edge = item(page, selfLoop);
  const before = await camera(target);
  const world = await worldPoint(target);
  const start = await edgePoint(edge);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 60, start.y + 45, { steps: 10 });
  await page.mouse.up();
  await expect.poll(async () => (await camera(target)).e - before.e).toBeCloseTo(60, 0);
  await expect.poll(async () => (await camera(target)).f - before.f).toBeCloseTo(45, 0);
  closePoint(await worldPoint(target), world);
  await expect(edge).toHaveAttribute("aria-pressed", "false");
  const point = await edgePoint(edge);
  await page.mouse.click(point.x, point.y);
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
  const point = await nodeCenter(target);
  await page.mouse.click(point.x, point.y, { button: "right" });
  const menu = page.getByRole("menu", { name: "Graph actions", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Hide from canvas", exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect(page.locator(".graph-node")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo hide", exact: true }).click();
  await expect(target).toHaveCount(1);
  await expect(page.locator(".graph-relationship")).toHaveCount(1);
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
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-gesture", "pinch");
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [
        { x: destination.x - 90, y: destination.y, id: 1 },
        { x: destination.x + 90, y: destination.y, id: 2 }
      ]
    });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-gesture", "idle");
    await expect.poll(async () => (await camera(target)).a).toBeCloseTo((before.a * 180) / 110, 2);
    closePoint(atScreen(await camera(target), anchor), destination, 3);
  } finally {
    await session.send("Emulation.setTouchEmulationEnabled", { enabled: false });
    await session.detach();
  }
});
