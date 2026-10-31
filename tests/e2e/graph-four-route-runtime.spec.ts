import { expect, test } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";

test.use({ colorScheme: "light", reducedMotion: "reduce" });
test.setTimeout(90_000);

test("browses recent knowledge, searches three channels with related enrichment, and returns to recent", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  const reads: { at: string; cypher: string }[] = [];
  page.on("request", (outgoing) => {
    if (outgoing.url().endsWith("/api/v1/graph/query")) {
      reads.push(outgoing.postDataJSON() as { at: string; cypher: string });
    }
  });
  try {
    await signInGraph(page, runtime);
    const status = page.locator(".graph-route-status");
    await expect(status).toContainText("Recent");
    await expect(status.locator("span")).toHaveCount(1);
    await expect(status).toContainText("3 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(3);
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
    expect(reads.some((item) => item.cypher.includes("size(elementId(n)) DESC"))).toBe(true);
    expect(reads.some((item) => item.cypher.includes("db.index.semantic.queryNodes"))).toBe(false);

    const beforeSearch = reads.length;
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(status.locator('[data-status="ok"]')).toHaveCount(4);
    await expect(status).not.toContainText("Recent");
    await expect(status).toContainText("Keyword");
    await expect(status).toContainText("Full-text");
    await expect(status).toContainText("Semantic");
    await expect(status).toContainText("Related");
    await expect(page.locator(".graph-node")).toHaveCount(3);
    expect(reads.every((item) => item.at === runtime.latestState)).toBe(true);
    expect(reads.filter((item) => item.cypher.includes("size(elementId(n)) DESC"))).toHaveLength(1);
    expect(reads.filter((item) => item.cypher.includes("UNWIND $indexes"))).toHaveLength(2);
    expect(reads.filter((item) => item.cypher.includes("UNWIND $seeds"))).toHaveLength(2);
    const searchReads = reads.slice(beforeSearch);
    expect(searchReads).toHaveLength(8);
    expect(searchReads.every((item) => !item.cypher.includes("size(elementId(n)) DESC"))).toBe(
      true
    );

    await page.getByRole("button", { name: "Show recent knowledge", exact: true }).click();
    await expect(search).toHaveValue("");
    await expect(status.locator("span")).toHaveCount(1);
    await expect(status).toContainText("3 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(3);
  } finally {
    await runtime.close();
  }
});

test("keeps a bordered right card while its stationary G6 canvas is clipped by the sidebar", async ({
  page,
  request
}) => {
  await page.setViewportSize({ width: 1173, height: 900 });
  const runtime = await createGraphRuntime(request);
  let graphReads = 0;
  page.on("request", (outgoing) => {
    if (outgoing.url().endsWith("/api/v1/graph/query")) graphReads++;
  });
  try {
    await signInGraph(page, runtime);
    await expect(page.locator(".graph-route-status")).toContainText("3 recent nodes");
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
    const scene = page.locator(".graph-scene");
    await expect(scene).toHaveAttribute("data-ready", "true");
    const canvas = scene.locator("canvas").first();
    await expect(canvas).toBeVisible();
    const originalCanvas = await canvas.elementHandle();
    expect(originalCanvas).not.toBeNull();
    const metrics = () =>
      page.evaluate(() => {
        const frame = document.querySelector(".canvas-stage");
        const card = document.querySelector(".knowledge-canvas");
        const scene = document.querySelector(".graph-scene");
        const canvas = scene?.querySelector("canvas");
        const search = document.querySelector(".graph-search");
        const sidebar = document.querySelector(".version-sidebar");
        if (!frame || !card || !scene || !canvas || !search || !sidebar)
          throw new Error("Missing graph layout");
        const position = (element: Element): [number, number, number, number] => {
          const bounds = element.getBoundingClientRect();
          return [bounds.x, bounds.y, bounds.width, bounds.height];
        };
        return {
          frame: position(frame),
          card: position(card),
          search: position(search),
          scene: position(scene),
          sidebar: position(sidebar),
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          zoom: scene.getAttribute("data-zoom"),
          frameBorder: getComputedStyle(frame).borderLeftWidth,
          frameRadius: getComputedStyle(frame).borderTopLeftRadius
        };
      });
    const open = await metrics();
    expect(open.canvasWidth).toBeCloseTo(open.card[2], 0);
    expect(open.frame[0]).toBeGreaterThan(240);
    expect(open.frame[2]).toBeLessThan(open.card[2]);
    expect(open.frameBorder).not.toBe("0px");
    expect(open.frameRadius).not.toBe("0px");
    expect(open.sidebar[0]).toBe(0);
    expect(open.sidebar[2]).toBeGreaterThan(200);
    const readsBeforeToggle = graphReads;
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect.poll(async () => (await metrics()).frame[0]).toBeLessThan(20);
    const collapsed = await metrics();
    expect(collapsed.frame[2]).toBeGreaterThan(open.frame[2] + 200);
    expect(collapsed.card).toEqual(open.card);
    expect(collapsed.scene).toEqual(open.scene);
    expect(collapsed.search).toEqual(open.search);
    expect(collapsed.canvasWidth).toBe(open.canvasWidth);
    expect(collapsed.canvasHeight).toBe(open.canvasHeight);
    expect(collapsed.zoom).toBe(open.zoom);
    expect(graphReads).toBe(readsBeforeToggle);
    expect(
      await originalCanvas.evaluate(
        (element) => element === document.querySelector(".graph-scene canvas")
      )
    ).toBe(true);

    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect.poll(async () => (await metrics()).frame[0]).toBeGreaterThan(240);
    const reopened = await metrics();
    expect(reopened.frame).toEqual(open.frame);
    expect(reopened.card).toEqual(open.card);
    expect(reopened.scene).toEqual(open.scene);
    expect(reopened.search).toEqual(open.search);
    expect(reopened.canvasWidth).toBe(open.canvasWidth);
    expect(reopened.canvasHeight).toBe(open.canvasHeight);
    expect(reopened.zoom).toBe(open.zoom);
    expect(graphReads).toBe(readsBeforeToggle);
  } finally {
    await runtime.close();
  }
});
