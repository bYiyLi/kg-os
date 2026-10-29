import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { createGraphRuntime, signInGraph } from "./graph-runtime.js";
import { nodeCenter } from "./graph-g6-geometry.js";

test.use({ colorScheme: "light", reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
test.setTimeout(90_000);

// Verify actual rendered Canvas opacity: G6 may remove the dimmed state from
// its model without resetting the drawable's previous 0.16 opacity.
async function renderedNodeAlpha(page: Page, id: string): Promise<number> {
  return page.evaluate((nodeId) => {
    const proxy = document.querySelector<HTMLElement>('[data-node-id="' + nodeId + '"]');
    if (proxy === null) throw new Error("Graph node is missing");
    const bounds = proxy.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
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

test("switching selected nodes restores real G6 Canvas brightness", async ({ page, request }) => {
  const runtime = await createGraphRuntime(request);
  try {
    await signInGraph(page, runtime);
    const search = page.getByRole("searchbox", { name: "Search knowledge", exact: true });
    await search.fill("needle");
    await search.press("Enter");
    await expect(page.locator('.graph-route-status [data-status="ok"]')).toHaveCount(4);
    await expect(page.locator(".graph-scene")).toHaveAttribute("data-ready", "true");

    const first = page.locator('[data-node-id="' + runtime.targetId + '"]');
    const second = page.getByRole("button", { name: /Related insight, node / });
    const secondId = await second.getAttribute("data-node-id");
    if (secondId === null) throw new Error("Fixture node ID is missing");

    const pointA = await nodeCenter(first);
    await page.mouse.click(pointA.x, pointA.y);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => renderedNodeAlpha(page, runtime.targetId)).toBeGreaterThan(220);
    await expect.poll(() => renderedNodeAlpha(page, secondId)).toBeLessThan(90);

    const pointB = await nodeCenter(second);
    await page.mouse.click(pointB.x, pointB.y);
    await expect(second).toHaveAttribute("aria-pressed", "true");
    await expect(first).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => renderedNodeAlpha(page, secondId)).toBeGreaterThan(220);
    await expect.poll(() => renderedNodeAlpha(page, runtime.targetId)).toBeLessThan(90);

    await page.mouse.click(pointA.x, pointA.y);
    await expect(first).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => renderedNodeAlpha(page, runtime.targetId)).toBeGreaterThan(220);
  } finally {
    await runtime.close();
  }
});
