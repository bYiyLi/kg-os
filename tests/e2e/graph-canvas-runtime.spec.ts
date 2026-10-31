import { expect, test } from "@playwright/test";
import { graphCamera } from "./graph-g6-geometry.js";

// cspell:words haspopup

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";

test.use({ colorScheme: "light", reducedMotion: "reduce" });
test.setTimeout(90000);

test("searches three real channels, enriches linked nodes, and explores parallel edges", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  try {
    const requests: { at: string; cypher: string }[] = [];
    page.on("request", (outgoing) => {
      if (outgoing.url().endsWith("/api/v1/graph/query"))
        requests.push(outgoing.postDataJSON() as { at: string; cypher: string });
    });
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    const routes = page.locator(".graph-route-status");
    await expect(routes).not.toContainText("Recent");
    await expect(routes).toContainText("Keyword");
    await expect(routes).toContainText("Full-text");
    await expect(routes).toContainText("Semantic");
    await expect(routes).toContainText("Related");
    await expect(routes.locator('[data-status="ok"]')).toHaveCount(4);
    const target = page.locator('[data-graph-id="' + runtime.targetId + '"]');
    await expect(target).toHaveCount(1);
    await expect(page.locator(".graph-node")).toHaveCount(3);
    const selfLoopId = runtime.relationshipIds[2];
    if (selfLoopId === undefined) throw new Error("Graph fixture has no self-loop");
    await expect(page.locator(".graph-relationship")).toHaveCount(3);
    await expect(page.locator('[data-graph-id="' + selfLoopId + '"]')).toHaveCount(1);
    await expect(page.locator('[data-graph-id="' + runtime.neighborId + '"]')).toHaveCount(1);
    await expect(page.getByRole("button", { name: /Related insight, node / })).toBeVisible();
    expect(runtime.providerRequests()).toBeGreaterThan(0);
    expect(
      requests.filter((query) => query.cypher.includes("size(elementId(n)) DESC"))
    ).toHaveLength(1);
    expect(requests.some((query) => query.cypher.includes("UNWIND $seeds"))).toBe(true);
    expect(requests.some((query) => query.cypher.includes("keys(n)"))).toBe(true);
    expect(requests.some((query) => query.cypher.includes("db.index.fulltext.queryNodes"))).toBe(
      true
    );
    expect(requests.some((query) => query.cypher.includes("db.index.semantic.queryNodes"))).toBe(
      true
    );
    expect(requests.some((query) => query.cypher.includes("elementId(a) IN $ids"))).toBe(true);
    expect(requests.every((query) => query.at === runtime.latestState)).toBe(true);
    // Use the graph's keyboard selection proxy: a moving force-layout node
    // can shift between measuring its center and dispatching a pointer click.
    await target.focus();
    await target.press("Enter");
    const details = page.getByRole("complementary", { name: "Object details", exact: true });
    await expect(details).toContainText("Needle report");
    await expect(details).toContainText("needle semantic text");
    await details.getByRole("button", { name: "Expand neighbors", exact: true }).click();
    await expect(page.locator('[data-graph-id="' + runtime.neighborId + '"]')).toHaveCount(1);
    for (const id of runtime.relationshipIds)
      await expect(page.locator('[data-graph-id="' + id + '"]')).toHaveCount(1);
    const screenshot = test.info().outputPath("graph-canvas-real-runtime.png");
    await page.screenshot({ path: screenshot, animations: "disabled" });
    await test.info().attach("Graph canvas with isolated real data", {
      path: screenshot,
      contentType: "image/png"
    });
    const relationshipId = runtime.relationshipIds[0];
    if (relationshipId === undefined) throw new Error("Graph fixture has no relationship");
    const relationship = page.locator('[data-graph-id="' + relationshipId + '"]');
    await relationship.focus();
    await relationship.press("Enter");
    await expect(details).toContainText("GRAPH_LINK");
    await expect(details).toContainText("first parallel edge");
  } finally {
    await runtime.close();
  }
});

test("keeps historical graph reads pinned and does not carry current nodes into an older State", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  try {
    const reads: string[] = [];
    page.on("request", (outgoing) => {
      if (outgoing.url().endsWith("/api/v1/graph/query"))
        reads.push((outgoing.postDataJSON() as { at: string }).at);
    });
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('[data-graph-id="' + runtime.targetId + '"]')).toHaveCount(1);
    await page.getByRole("button", { name: "View history: main", exact: true }).click();
    const history = page.getByRole("dialog", { name: "Version relationships", exact: true });
    await history.getByRole("button", { name: /Graph fixture model/ }).click();
    await page.keyboard.press("Escape");
    await expect(history).toBeHidden();
    await expect(page.locator("[data-graph-id]")).toHaveCount(0);
    const previous = reads.length;
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
    await expect(page.locator("[data-graph-id]")).toHaveCount(0);
    expect(reads.slice(previous).length).toBeGreaterThan(0);
    expect(reads.slice(previous).every((state) => state === runtime.modelState)).toBe(true);
    await expect(page.locator(".graph-route-status")).toContainText("0");
  } finally {
    await runtime.close();
  }
});

test("preserves real graph selection and camera while opening border navigation", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  try {
    let reads = 0;
    page.on("request", (outgoing) => {
      if (outgoing.url().endsWith("/api/v1/graph/query")) reads += 1;
    });
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    const node = page.locator('[data-graph-id="' + runtime.targetId + '"]');
    await expect(node).toHaveCount(1);
    await node.focus();
    await node.press("Enter");
    await page.getByRole("button", { name: "Zoom in", exact: true }).click();
    const before = await graphCamera(node);
    const previousReads = reads;
    const handle = page.locator(".sidebar-handle");
    await handle.click();
    await expect(page.locator(".version-sidebar")).toBeHidden();
    await handle.click();
    await expect(page.locator(".version-sidebar")).toBeVisible();
    await page.setViewportSize({ width: 375, height: 894 });
    await expect(handle).toHaveAttribute("aria-haspopup", "dialog");
    await handle.click();
    const drawer = page.getByRole("dialog", { name: "Mobile version navigation", exact: true });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(handle).toBeFocused();
    await expect(node).toHaveAttribute("aria-pressed", "true");
    const after = await graphCamera(node);
    expect(after.a).toBeCloseTo(before.a, 3);
    expect(reads).toBe(previousReads);
  } finally {
    await runtime.close();
  }
});
