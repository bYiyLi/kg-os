import { connect, editorRecord, expect, reconnect, runQuery, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("detects an actual daemon reboot, follows its new port and restores saved input without replay", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  await expect
    .poll(async () => (await editorRecord(runtime))?.data?.["statement"])
    .toBe("MATCH (n:Model) RETURN n LIMIT 5");
  const before = await runtime.client.web.data.info();
  const endpoint = runtime.endpoint;
  await runtime.restart();
  expect(runtime.endpoint).not.toBe(endpoint);
  const after = await runtime.client.web.data.info();
  expect(after.daemonBootId).not.toBe(before.daemonBootId);
  expect(after.storeId).toBe(before.storeId);
  expect(after.databaseId).toBe(before.databaseId);
  await page.getByRole("button", { name: "运行查询", exact: true }).click();
  await expect(page.locator(".connection-status")).toHaveText("连接已变化，请重新连接");
  await expect(page.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    "MATCH (n:Model) RETURN n LIMIT 5"
  );
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  let queries = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/graph/query") queries += 1;
  });
  await page.reload();
  await reconnect(page, runtime);
  await expect(page.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    "MATCH (n:Model) RETURN n LIMIT 5"
  );
  expect(queries).toBe(0);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  await expect(
    page
      .locator(".query-frame")
      .first()
      .getByRole("button", { name: `${research.model} Lumen-7B`, exact: true })
  ).toBeVisible();
});

test("keeps saved frame metadata on a real cache miss and reruns only after an explicit action", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("Web store is absent");
  await expect
    .poll(
      async () =>
        (await runtime.client.web.data.list({ storeId: info.storeId ?? "", kind: "frame" })).items
          .length
    )
    .toBe(1);
  const id = (await runtime.client.web.data.list({ storeId: info.storeId, kind: "frame" })).items[0]
    ?.id;
  if (id === undefined) throw new Error("Frame record is absent");
  await expect
    .poll(
      async () =>
        (await runtime.client.web.cache.read({ storeId: info.storeId ?? "", frameId: id })).hit
    )
    .toBe(true);
  expect((await runtime.client.web.cache.clear({ storeId: info.storeId })).cleared).toBe(1);
  await expect
    .poll(async () => (await editorRecord(runtime))?.data?.["statement"])
    .toBe("MATCH (n:Model) RETURN n LIMIT 5");
  let queries = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/graph/query") queries += 1;
  });
  await page.reload();
  await reconnect(page, runtime);
  const restored = page.locator(".query-frame").first();
  await expect(restored.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  await expect(restored).toContainText("原计数 1 行");
  expect(queries).toBe(0);
  await restored.getByRole("button", { name: "加载完整缓存", exact: true }).click();
  await expect(restored).toContainText("完整缓存不可用");
  expect(queries).toBe(0);
  await restored.getByRole("button", { name: "按原 State 重跑", exact: true }).click();
  await expect(page.locator(".query-frame")).toHaveCount(2);
  await expect(page.locator(".query-frame").first().getByRole("status").first()).toContainText(
    "完成"
  );
  expect(queries).toBe(1);
  await expect(
    page.locator(".query-frame").first().locator(".frame-header .badge")
  ).toHaveAttribute("title", research.state);
});

test("preserves real streamed Float literals through cache persistence and authenticated restoration", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await page.locator(".editor-bottom summary").click();
  await page.getByLabel("参数对象", { exact: true }).fill('{"negative":-0.0}');
  let queries = 0;
  let queryBody = "";
  let cacheBody = "";
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/graph/query") {
      queries += 1;
      queryBody = request.postData() ?? "";
    }
    if (path === "/api/v1/web/cache/write") cacheBody = request.postData() ?? "";
  });
  const graphResponse = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/graph/query"
  );
  await runQuery(page, "RETURN 1.0 AS float, 1 AS integer, $negative AS negative");
  const response = await graphResponse;
  expect(response.ok()).toBe(true);
  expect(queryBody).toMatch(/"negative"\s*:\s*-0\.0/u);
  const literalRow = /\[\s*1\.0\s*,\s*1\s*,\s*-0\.0\s*\]/u;
  expect(await response.text()).toMatch(literalRow);
  await expect(page.locator(".query-frame").first().locator(".rows-view pre")).toHaveText(
    literalRow
  );
  await expect.poll(() => cacheBody).toMatch(literalRow);
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("Web store is absent");
  const storeId = info.storeId;
  await expect
    .poll(async () => (await runtime.client.web.data.list({ storeId, kind: "frame" })).items.length)
    .toBe(1);
  const frameId = (await runtime.client.web.data.list({ storeId, kind: "frame" })).items[0]?.id;
  if (frameId === undefined) throw new Error("Frame record is absent");
  let cacheWire = "";
  await expect
    .poll(async () => {
      const cache = await runtime.client.web.cache.read(
        { storeId, frameId },
        {
          onJSONResponse: (source) => {
            cacheWire = source;
          }
        }
      );
      return cache.hit;
    })
    .toBe(true);
  expect(cacheWire).toMatch(literalRow);
  await expect
    .poll(async () => (await editorRecord(runtime))?.data?.["paramsText"])
    .toBe('{"negative":-0.0}');
  await page.reload();
  await reconnect(page, runtime);
  const restored = page.locator(".query-frame").first();
  await expect(restored.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  await expect(restored).toContainText("原计数 1 行");
  expect(queries).toBe(1);
  await restored.getByRole("button", { name: "加载完整缓存", exact: true }).click();
  await expect(restored.locator(".rows-view pre")).toHaveText(literalRow);
  expect(queries).toBe(1);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
});
