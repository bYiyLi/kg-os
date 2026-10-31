import { expect, test } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import { worldPoint } from "./graph-g6-geometry.js";

test.use({
  colorScheme: "light",
  reducedMotion: "reduce",
  viewport: { width: 1280, height: 900 }
});
test.setTimeout(120_000);

// Recent browsing may show 200 unconnected entries. Manual expansion still
// reads a real neighbor without evicting or fabricating any of those entries.
test("expands a real off-screen neighbor in a ring without hiding 200 recent entries", async ({
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
    const connect = await request.post(runtime.endpoint + "/api/v1/graph/execute", {
      headers: { Authorization: "Bearer " + runtime.token },
      data: {
        branch: "main",
        message: "Add a newest entry connected to an older, off-screen node",
        cypher:
          "MATCH (old) WHERE elementId(old)=$neighborId " +
          "CREATE (focus:GraphDoc {key:'recent-focus',title:'Recent Focus'})-[:LINK]->(old) " +
          "RETURN elementId(focus) AS id",
        params: { neighborId: runtime.neighborId }
      }
    });
    expect(connect.ok(), await connect.text()).toBe(true);
    const result = (await connect.json()) as { state: string; rows: string[][] };
    const focusId = result.rows[0]?.[0];
    if (focusId === undefined) throw new Error("Test fixture omitted focus node identity");
    expect(focusId).toMatch(/^n:/);
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
    await expect(page.locator(".graph-route-status")).toContainText("200 recent nodes");
    await expect(page.locator(".graph-node")).toHaveCount(200);
    await expect(page.locator(".graph-relationship")).toHaveCount(0);
    const origin = page.locator('[data-node-id="' + focusId + '"]');
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
      params: { id: focusId, limit: 26 }
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
