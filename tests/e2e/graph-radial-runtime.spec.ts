import { expect, test } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import { worldPoint } from "./graph-g6-geometry.js";

test.use({
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 900 }
});
test.setTimeout(120_000);

// When a search already shows 200 entries, its actual backend neighbors
// still have room to appear in the same visible graph, not just in a response.
test("expands a real off-screen neighbor in a ring without hiding search seeds", async ({
  page,
  request
}) => {
  const runtime = await createGraphRuntime(request);
  try {
    const additions = Array.from(
      { length: 205 },
      (_, index) =>
        "(:GraphDoc {key:'radial-filler-" +
        String(index) +
        "',title:'Filler " +
        String(index) +
        "'})"
    );
    const write = await request.post(runtime.endpoint + "/api/v1/graph/execute", {
      headers: { Authorization: "Bearer " + runtime.token },
      data: {
        branch: "main",
        message: "Fill only this isolated graph to verify real neighbor expansion",
        cypher: "CREATE " + additions.join(", ") + " RETURN 1 AS count"
      }
    });
    expect(write.ok(), await write.text()).toBe(true);
    const result = (await write.json()) as { state: string };
    const reads: { at: string; params: { id: string; limit: number } }[] = [];
    page.on("request", (outgoing) => {
      if (!outgoing.url().endsWith("/api/v1/graph/query")) return;
      const input = outgoing.postDataJSON() as {
        at: string;
        cypher: string;
        params: { id: string; limit: number };
      };
      if (input.cypher.includes("MATCH (n)-[r]-(m)")) reads.push(input);
    });

    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
    await expect(page.locator(".graph-node")).toHaveCount(200);
    await expect(page.locator(".graph-relationship")).toHaveCount(1);
    const origin = page.locator('[data-node-id="' + runtime.targetId + '"]');
    const neighbor = page.locator('[data-node-id="' + runtime.neighborId + '"]');
    await expect(origin).toHaveCount(1);
    await expect(neighbor).toHaveCount(0);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true", {
      timeout: 25_000
    });
    const anchor = await worldPoint(origin);
    await origin.press("Shift+Enter");
    await expect.poll(() => reads.length).toBe(1);
    expect(reads[0]).toMatchObject({
      at: result.state,
      params: { id: runtime.targetId, limit: 26 }
    });
    await expect(origin).toHaveAttribute("aria-expanded", "true");
    await expect(neighbor).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator(".graph-node")).toHaveCount(201);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true", {
      timeout: 30_000
    });
    const end = await worldPoint(neighbor);
    const retained = await worldPoint(origin);
    expect(Math.hypot(retained.x - anchor.x, retained.y - anchor.y)).toBeLessThan(2);
    expect(Math.hypot(end.x - retained.x, end.y - retained.y)).toBeGreaterThan(110);
    expect(Math.hypot(end.x - retained.x, end.y - retained.y)).toBeLessThan(225);
  } finally {
    await runtime.close();
  }
});
