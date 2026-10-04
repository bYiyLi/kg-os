import { type Page } from "@playwright/test";

import { connect, expect, runQuery, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 90_000 });

test("triggers actual frame byte and whole-page receive limits with real scalar results", async ({
  page,
  runtime
}, info) => {
  await connect(page, runtime);
  await page.getByText("参数 JSON", { exact: false }).first().click();
  await page
    .getByRole("textbox", { name: "参数对象", exact: true })
    .fill(JSON.stringify({ content: "x".repeat(50_000) }));
  const counts: number[] = [];
  for (let index = 0; index < 5; index += 1) {
    await page
      .getByRole("textbox", { name: "Cypher 语句", exact: true })
      .fill(
        `UNWIND range(1,190) AS value RETURN value, $content AS content, ${String(index)} AS request`
      );
    await page.getByRole("button", { name: "运行查询", exact: true }).click();
    const frame = page.locator(".query-frame").first();
    await expect(frame.getByRole("status").first()).toContainText("结果不完整");
    await expect(frame).toContainText("接收预算");
    const text = await frame.getByRole("status").first().innerText();
    const match = /· (\d+) 行/u.exec(text);
    if (match?.[1] === undefined) throw new Error("Frame did not report its accepted row count");
    counts.push(Number(match[1]));
  }
  expect(counts.slice(0, 4)).toEqual([167, 167, 167, 167]);
  expect(counts[4]).toBeLessThan(167);
  expect(counts.reduce((total, count) => total + count * 50_000, 0)).toBeLessThanOrEqual(32 << 20);
  await expect(page.locator(".query-frame")).toHaveCount(5);
  await info.attach("real-byte-budgets.json", {
    body: JSON.stringify({
      counts,
      frameBytes: 8 << 20,
      pageBytes: 32 << 20,
      payloadPerRow: 50_000
    }),
    contentType: "application/json"
  });
});

async function heapBytes(page: Page): Promise<number> {
  const session = await page.context().newCDPSession(page);
  try {
    await session.send("Performance.enable");
    const result = await session.send("Performance.getMetrics");
    const bytes = result.metrics.find((metric) => metric.name === "JSHeapUsedSize")?.value;
    if (bytes === undefined) throw new Error("Chromium did not report JS heap usage");
    return bytes;
  } finally {
    await session.detach();
  }
}

test("measures bounded rendering of a real 1500-node result and keeps JSON pages small", async ({
  page,
  runtime
}, info) => {
  await runtime.client.graph.execute({
    branch: "main",
    cypher:
      "UNWIND range(1,1500) AS value CREATE (n:E2EBudget {name:'budget', value:value}) RETURN count(n) AS created"
  });
  await connect(page, runtime);
  const baseline = await heapBytes(page);
  const started = performance.now();
  await runQuery(page, "MATCH (n:E2EBudget) RETURN n LIMIT 1500");
  const completedMs = performance.now() - started;
  const frame = page.locator(".query-frame").first();
  await expect(frame).toContainText("达到图投影显示范围");
  await expect(frame.getByRole("complementary", { name: "当前帧检查器" })).toContainText(
    "1000 节点"
  );
  const renderedNodes = await frame.locator("[data-node]").count();
  expect(renderedNodes).toBeGreaterThan(0);
  expect(renderedNodes).toBeLessThan(1000);
  const interactionStarted = performance.now();
  await frame.getByRole("button", { name: "放大图谱", exact: true }).click();
  await page.evaluate(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          resolve();
        })
      )
    );
  });
  const interactionMs = performance.now() - interactionStarted;
  expect(interactionMs).toBeLessThan(1500);
  await frame.getByRole("button", { name: "JSON / 行", exact: true }).click();
  await expect(frame.locator(".rows-view > .value-view")).toHaveCount(20);
  const heapDelta = (await heapBytes(page)) - baseline;
  expect(heapDelta).toBeLessThan(256 << 20);
  await info.attach("real-runtime-pressure.json", {
    body: JSON.stringify({
      nodeVersion: process.version,
      rows: 1500,
      projectionNodes: 1000,
      renderedNodes,
      completedMs,
      interactionMs,
      heapDelta
    }),
    contentType: "application/json"
  });
});

test("actively stops a real stream at the 10000-row frame receive budget", async ({
  page,
  runtime
}) => {
  await connect(page, runtime);
  await page
    .getByRole("textbox", { name: "Cypher 语句", exact: true })
    .fill("UNWIND range(1,10050) AS value RETURN value");
  await page.getByRole("button", { name: "运行查询", exact: true }).click();
  const frame = page.locator(".query-frame").first();
  await expect(frame.getByRole("status").first()).toContainText("结果不完整");
  await expect(frame).toContainText("接收预算");
  const store = await runtime.client.web.data.info();
  if (store.storeId === undefined) throw new Error("Web store is absent");
  await expect
    .poll(async () => {
      const header = (
        await runtime.client.web.data.list({ storeId: store.storeId ?? "", kind: "frame" })
      ).items[0];
      if (header === undefined) return 0;
      return (
        await runtime.client.web.data.read({
          storeId: store.storeId ?? "",
          kind: "frame",
          id: header.id
        })
      ).data?.["rowCount"];
    })
    .toBe(10_000);
  await frame.getByRole("button", { name: "JSON / 行", exact: true }).click();
  await expect(frame.locator(".rows-view > .value-view")).toHaveCount(20);
});

test("freezes queued work, caps four active requests and can cancel a queued fifth", async ({
  page,
  runtime
}) => {
  await connect(page, runtime);
  let started = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/graph/query", async (route) => {
    started += 1;
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await held;
    await route.fulfill({ response });
  });
  try {
    for (let value = 1; value <= 5; value += 1) {
      await page
        .getByRole("textbox", { name: "Cypher 语句", exact: true })
        .fill(`RETURN ${String(value)} AS frozen`);
      await page.getByRole("button", { name: "运行查询", exact: true }).click();
    }
    await expect.poll(() => started).toBe(4);
    const queued = page.locator(".query-frame").first();
    await expect(queued.getByRole("status").first()).toContainText("等待执行");
    await queued.getByRole("button", { name: "取消", exact: true }).click();
    release?.();
    await expect(queued.getByRole("status").first()).toContainText("已取消");
    await expect(page.locator(".frame-status", { hasText: "已完成" })).toHaveCount(4);
    expect(started).toBe(4);
    await expect(queued.locator(".frame-statement")).toHaveText("RETURN 5 AS frozen");
  } finally {
    release?.();
  }
});
