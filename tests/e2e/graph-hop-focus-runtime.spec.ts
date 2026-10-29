import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import { nodeCenter, worldPoint } from "./graph-g6-geometry.js";

test.use({
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1900, height: 1300 }
});
test.setTimeout(120_000);

async function nodeAlpha(page: Page, id: string): Promise<number> {
  return page.evaluate((nodeId) => {
    const proxy = document.querySelector<HTMLElement>('[data-node-id="' + nodeId + '"]');
    if (proxy === null) throw new Error("Missing visual graph node");
    const bounds = proxy.getBoundingClientRect();
    const x = bounds.x + bounds.width / 2;
    const y = bounds.y + bounds.height / 2;
    let alpha = 0;
    for (const canvas of document.querySelectorAll<HTMLCanvasElement>(".graph-scene canvas")) {
      const context = canvas.getContext("2d");
      if (context === null) continue;
      const rect = canvas.getBoundingClientRect();
      const px = Math.round(((x - rect.x) * canvas.width) / rect.width);
      const py = Math.round(((y - rect.y) * canvas.height) / rect.height);
      if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
      alpha = Math.max(alpha, context.getImageData(px, py, 1, 1).data[3] ?? 0);
    }
    return alpha;
  }, id);
}

test("inspection preserves positions; a held node orders real loaded hops and highlights edges", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  try {
    const response = await request.post(runtime.endpoint + "/api/v1/graph/execute", {
      headers: { Authorization: "Bearer " + runtime.token },
      data: {
        branch: "main",
        message: "Isolated BFS visibility fixture",
        cypher:
          "MATCH (origin:GraphDoc {key:'neighbor'}) " +
          "CREATE (b:GraphDoc {key:'focus-hop-2',title:'Focus Hop Two'}), " +
          "(c:GraphDoc {key:'focus-hop-3',title:'Focus Hop Three'}), " +
          "(d:GraphDoc {key:'focus-hop-4',title:'Focus Hop Four'}), " +
          "(e:GraphDoc {key:'focus-hop-5',title:'Focus Hop Five'}), " +
          "(f:GraphDoc {key:'focus-hop-6',title:'Focus Hop Six'}), " +
          "(g:GraphDoc {key:'focus-hop-7',title:'Focus Hop Seven'}), " +
          "(u:GraphDoc {key:'focus-isolated',title:'Focus Isolated'}), " +
          "(origin)-[r2:GRAPH_LINK]->(b), (b)-[r3:GRAPH_LINK]->(c), " +
          "(c)-[r4:GRAPH_LINK]->(d), (d)-[r5:GRAPH_LINK]->(e), " +
          "(e)-[r6:GRAPH_LINK]->(f), (f)-[r7:GRAPH_LINK]->(g) " +
          "RETURN b,c,d,e,f,g,u,r2,r3,r4,r5,r6,r7"
      }
    });
    expect(response.ok(), await response.text()).toBe(true);
    const body = (await response.json()) as { rows?: { elementId: string }[][] };
    const ids = body.rows?.[0]?.map((node) => node.elementId);
    expect(ids).toHaveLength(13);
    const [hop2, hop3, hop4, hop5, hop6, hop7, disconnected, r2, r3, r4, r5, r6, r7] = ids ?? [];
    if (
      hop2 === undefined ||
      hop3 === undefined ||
      hop4 === undefined ||
      hop5 === undefined ||
      hop6 === undefined ||
      hop7 === undefined ||
      disconnected === undefined ||
      r2 === undefined ||
      r3 === undefined ||
      r4 === undefined ||
      r5 === undefined ||
      r6 === undefined ||
      r7 === undefined
    )
      throw new Error("Missing actual graph identity");
    await signInGraph(page, runtime);
    await expect(page.locator(".graph-node")).toHaveCount(10);
    await expect(page.locator(".graph-relationship")).toHaveCount(9);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true", {
      timeout: 25000
    });

    const locator = (id: string) => page.locator('[data-node-id="' + id + '"]');
    const centerBefore = await worldPoint(locator(runtime.targetId));
    const neighborBefore = await worldPoint(locator(runtime.neighborId));
    const secondBefore = await worldPoint(locator(hop2));
    const farBefore = await worldPoint(locator(hop5));
    let searches = 0;
    page.on("request", (req) => {
      if (req.url().endsWith("/api/v1/graph/query")) searches++;
    });
    await locator(runtime.targetId).press("Enter");
    await expect(locator(runtime.targetId)).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(150);
    expect(await worldPoint(locator(runtime.targetId))).toEqual(centerBefore);
    expect(await worldPoint(locator(runtime.neighborId))).toEqual(neighborBefore);
    expect(await worldPoint(locator(hop2))).toEqual(secondBefore);
    expect(await worldPoint(locator(hop5))).toEqual(farBefore);

    // The production G6 implementation is bundled. Assert the real returned
    // Relationship proxies are still present, while exact G6 state colors and
    // line widths are covered by dedicated G6 options/projection unit tests.
    for (const id of [runtime.relationshipIds[0], r2, r3, r4, r5, r6, r7]) {
      if (id === undefined) throw new Error("Missing real relationship identity");
      await expect(page.locator('[data-relationship-id="' + id + '"]')).toHaveCount(1);
    }

    await expect.poll(() => nodeAlpha(page, runtime.targetId)).toBeGreaterThan(220);
    await expect.poll(() => nodeAlpha(page, runtime.neighborId)).toBeGreaterThan(220);
    await expect.poll(() => nodeAlpha(page, hop2)).toBeGreaterThan(210);
    await expect.poll(() => nodeAlpha(page, hop2)).toBeLessThan(250);
    await expect.poll(() => nodeAlpha(page, hop3)).toBeGreaterThan(185);
    await expect.poll(() => nodeAlpha(page, hop3)).toBeLessThan(225);

    const held = await nodeCenter(locator(runtime.targetId));
    await page.mouse.move(held.x, held.y);
    await page.mouse.down();
    await page.waitForTimeout(360);
    await page.mouse.up();
    await expect(page.getByRole("complementary", { name: "Object details" })).toHaveCount(0);

    const center = await worldPoint(locator(runtime.targetId));
    expect(Math.hypot(center.x - centerBefore.x, center.y - centerBefore.y)).toBeLessThan(1);
    await expect
      .poll(async () => {
        const neighbor = await worldPoint(locator(runtime.neighborId));
        return Math.hypot(neighbor.x - center.x, neighbor.y - center.y);
      })
      .toBeCloseTo(178, 0);
    await expect
      .poll(async () => {
        const second = await worldPoint(locator(hop2));
        return Math.hypot(second.x - center.x, second.y - center.y);
      })
      .toBeCloseTo(346, 0);
    await expect
      .poll(async () => {
        const point = await worldPoint(locator(hop5));
        return Math.hypot(point.x - center.x, point.y - center.y);
      })
      .toBeCloseTo(850, 0);
    expect(searches).toBe(0);

    await locator(hop2).press("Enter");
    await expect(locator(hop2)).toHaveAttribute("aria-pressed", "true");
    const focusPosition = await worldPoint(locator(hop2));
    await page.waitForTimeout(140);
    expect(await worldPoint(locator(hop2))).toEqual(focusPosition);
    await expect.poll(() => nodeAlpha(page, hop2)).toBeGreaterThan(220);
    await expect.poll(() => nodeAlpha(page, runtime.targetId)).toBeGreaterThan(210);
    await expect.poll(() => nodeAlpha(page, runtime.targetId)).toBeLessThan(250);

    await page.getByRole("button", { name: "Close object details", exact: true }).click();
    await expect(locator(hop2)).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => nodeAlpha(page, runtime.targetId)).toBeGreaterThan(220);
    await expect.poll(() => nodeAlpha(page, disconnected)).toBeGreaterThan(220);
  } finally {
    await runtime.close();
  }
});
