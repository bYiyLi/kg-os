import { type Route } from "@playwright/test";

import { connect, editorRecord, expect, reconnect, runQuery, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("keeps partial real rows when the transport omits its terminal event", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await page.route("**/api/v1/graph/query", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const lines = (await response.text()).trimEnd().split("\n");
    expect(lines.some((line) => (JSON.parse(line) as { type: string }).type === "summary")).toBe(
      true
    );
    const body =
      lines.filter((line) => (JSON.parse(line) as { type: string }).type !== "summary").join("\n") +
      "\n";
    await route.fulfill({ response, body });
  });
  await page
    .getByRole("textbox", { name: "Cypher 语句", exact: true })
    .fill("MATCH (n:Model) RETURN n");
  await page.getByRole("button", { name: "运行查询", exact: true }).click();
  const frame = page.locator(".query-frame").first();
  await expect(frame.getByRole("status").first()).toContainText("结果不完整");
  await expect(frame.locator("[data-node]")).toHaveCount(1);
  await expect(frame.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
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
  if (id === undefined) throw new Error("partial frame was not saved");
  expect(await runtime.client.web.cache.read({ storeId: info.storeId, frameId: id })).toEqual({
    hit: false
  });
});

for (const action of ["取消", "取消并关闭"]) {
  test(`preserves ${action} despite late data from a completed real query`, async ({
    page,
    runtime
  }) => {
    await connect(page, runtime);
    let release: (() => void) | undefined;
    let received: (() => void) | undefined;
    const backendRead = new Promise<void>((resolveRead) => {
      received = resolveRead;
    });
    const blocked = new Promise<void>((resolveSend) => {
      release = resolveSend;
    });
    await page.route("**/api/v1/graph/query", async (route) => {
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      received?.();
      await blocked;
      try {
        await route.fulfill({ response });
      } catch {
        /* cancellation closed the real client request */
      }
    });
    try {
      await page
        .getByRole("textbox", { name: "Cypher 语句", exact: true })
        .fill("RETURN 19 AS real_value");
      await page.getByRole("button", { name: "运行查询", exact: true }).click();
      await backendRead;
      await page
        .locator(".query-frame")
        .first()
        .getByRole("button", { name: action, exact: true })
        .click();
      release?.();
      if (action === "取消") {
        await expect(page.locator(".query-frame").getByRole("status").first()).toContainText(
          "已取消"
        );
        await expect(page.locator(".query-frame").getByRole("status").first()).not.toContainText(
          "已完成"
        );
      } else await expect(page.locator(".query-frame")).toHaveCount(0);
      const info = await runtime.client.web.data.info();
      if (info.storeId === undefined) throw new Error("Web store is absent");
      await expect
        .poll(async () => {
          const list = await runtime.client.web.data.list({
            storeId: info.storeId ?? "",
            kind: "frame"
          });
          const header = list.items[0];
          if (header === undefined) return "";
          return (
            await runtime.client.web.data.read({
              storeId: info.storeId ?? "",
              kind: "frame",
              id: header.id
            })
          ).data?.["status"];
        })
        .toBe("cancelled");
    } finally {
      release?.();
    }
  });
}

test("clears unusable credentials on a real 401, retains input and reconnects explicitly", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  const statement = "MATCH (n:Model) RETURN n";
  await page.getByRole("textbox", { name: "Cypher 语句", exact: true }).fill(statement);
  await expect
    .poll(async () => {
      try {
        return (await editorRecord(runtime))?.data?.["statement"];
      } catch {
        return "";
      }
    })
    .toBe(statement);
  const unauthorized = async (route: Route) => {
    await route.continue({
      headers: { ...route.request().headers(), authorization: "Bearer invalid-e2e-credential" }
    });
  };
  await page.route("**/api/v1/graph/query", unauthorized);
  await page.getByRole("button", { name: "运行查询", exact: true }).click();
  await expect(page.locator(".connection-status")).toContainText("凭证不可用");
  await expect(page.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    statement
  );
  await expect(page.getByRole("button", { name: "运行查询", exact: true })).toBeDisabled();
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  await page.unroute("**/api/v1/graph/query", unauthorized);
  await reconnect(page, runtime);
  await runQuery(page, statement);
  await expect(
    page
      .locator(".query-frame")
      .first()
      .getByRole("button", { name: `${research.model} Lumen-7B`, exact: true })
  ).toBeVisible();
});

test("recovers a genuine multi-window CAS conflict through explicit comparison and a new copy", async ({
  page,
  runtime
}) => {
  await connect(page, runtime);
  const original = "RETURN 'original' AS value";
  await page.getByRole("textbox", { name: "Cypher 语句", exact: true }).fill(original);
  await expect
    .poll(async () => {
      try {
        return (await editorRecord(runtime))?.data?.["statement"];
      } catch {
        return "";
      }
    })
    .toBe(original);
  const second = await page.context().newPage();
  await connect(second, runtime);
  await expect(second.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    original
  );
  const firstInput = "RETURN 'first window' AS value";
  const secondInput = "RETURN 'second window' AS value";
  await Promise.all([
    page.getByRole("textbox", { name: "Cypher 语句", exact: true }).fill(firstInput),
    second.getByRole("textbox", { name: "Cypher 语句", exact: true }).fill(secondInput)
  ]);
  await expect
    .poll(
      async () =>
        (await page.getByRole("button", { name: "查看对照", exact: true }).count()) +
        (await second.getByRole("button", { name: "查看对照", exact: true }).count())
    )
    .toBe(1);
  await expect(page.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    firstInput
  );
  await expect(second.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    secondInput
  );
  const conflict =
    (await page.getByRole("button", { name: "查看对照", exact: true }).count()) === 1
      ? page
      : second;
  await conflict.getByRole("button", { name: "查看对照", exact: true }).click();
  const comparison = conflict.getByRole("dialog", { name: "保存版本对照", exact: true });
  await expect(comparison).toContainText("first window");
  await expect(comparison).toContainText("second window");
  await comparison.getByRole("button", { name: "另存本窗口副本", exact: true }).click();
  await expect(comparison).toBeHidden();
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("Web store is absent");
  await expect
    .poll(
      async () =>
        (
          await runtime.client.web.data.list({ storeId: info.storeId ?? "", kind: "editor" })
        ).items.filter((record) => !record.deleted).length
    )
    .toBe(2);
});
