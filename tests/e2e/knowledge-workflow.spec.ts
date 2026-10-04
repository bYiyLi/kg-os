import { connect, expect, reconnect, runQuery, test } from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("queries typed graphs, edits once, preserves old State frames and restores after authentication", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", research.state);
  await page.getByText("参数 JSON", { exact: false }).first().click();
  await page.getByLabel("参数对象", { exact: true }).fill(
    JSON.stringify({
      nodeRefs: [research.model, research.paper, research.unlabelled],
      relationRefs: [...research.describes, research.selfLoop, research.reverse]
    })
  );
  await runQuery(page, "MATCH (n) WHERE elementId(n) IN $nodeRefs RETURN n LIMIT 50");
  const nodes = page.locator(".query-frame").filter({
    has: page.locator(".frame-statement", {
      hasText: "MATCH (n) WHERE elementId(n) IN $nodeRefs RETURN n LIMIT 50"
    })
  });
  await expect(nodes.locator("[data-node]")).toHaveCount(3);
  const selected = nodes.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await selected.focus();
  await page.keyboard.press("Enter");
  await expect(nodes.getByRole("complementary", { name: "当前帧检查器" })).toContainText(
    "9223372036854775807"
  );
  await expect(nodes.getByRole("button", { name: "编辑对象", exact: true })).toBeEnabled();
  await nodes.getByRole("button", { name: "扩展邻居（最多 50 行）", exact: true }).click();
  await expect(nodes.locator(".edge")).toHaveCount(4);

  await runQuery(
    page,
    "MATCH (a)-[r]->(b) WHERE elementId(r) IN $relationRefs RETURN a, r, b LIMIT 50"
  );
  const relations = page.locator(".query-frame").first();
  await expect(relations.locator(".edge")).toHaveCount(4);
  for (const ref of research.describes)
    await expect(
      relations.getByRole("button", {
        name: `${ref} DESCRIBES ${research.paper} 到 ${research.model}`,
        exact: true
      })
    ).toBeVisible();
  const self = relations.getByRole("button", {
    name: `${research.selfLoop} RELATES ${research.model} 到 ${research.model}`,
    exact: true
  });
  await expect(self.locator(".edge")).toHaveAttribute("d", / C /u);
  await expect(
    relations.getByRole("button", {
      name: `${research.reverse} RELATES ${research.model} 到 ${research.paper}`,
      exact: true
    })
  ).toBeVisible();
  const parallel = await Promise.all(
    research.describes.map(
      async (ref) =>
        await relations
          .getByRole("button", {
            name: `${ref} DESCRIBES ${research.paper} 到 ${research.model}`,
            exact: true
          })
          .locator(".edge")
          .getAttribute("d")
    )
  );
  expect(parallel[0]).not.toBe(parallel[1]);

  let patches = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/object/patch") patches += 1;
  });
  await nodes.getByRole("button", { name: "编辑对象", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await dialog.getByLabel("name · YAML 值", { exact: true }).fill('"Lumen-7B corrected"');
  await dialog.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(dialog.getByRole("region", { name: "Patch 预览", exact: true })).toContainText(
    "前端检查通过"
  );
  expect(patches).toBe(0);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  await dialog
    .getByRole("button", { name: "确认提交到 main", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  const receipt = dialog.getByRole("status", { name: "真实提交回执", exact: true });
  await expect(receipt).toContainText("知识已提交");
  await expect(receipt).toContainText("回执已保存");
  expect(patches).toBe(1);
  const committed = await runtime.client.evolution.overview();
  expect(committed.state).not.toBe(research.state);
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", research.state);
  await expect(nodes.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  await expect(relations.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  const read = await runtime.client.object.read({ at: committed.state, refs: [research.model] });
  expect(JSON.stringify(read.results)).toContain("Lumen-7B corrected");
  expect(JSON.stringify(read.results)).toContain("9223372036854775807");
  await receipt.getByRole("button", { name: "显式刷新 Branch", exact: true }).click();
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", committed.state);
  await dialog.getByRole("button", { name: "关闭对象草稿", exact: true }).click();
  await expect(dialog).toBeHidden();
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  await expect(
    page
      .locator(".query-frame")
      .first()
      .getByRole("button", { name: `${research.model} Lumen-7B corrected`, exact: true })
  ).toBeVisible();
  await expect(nodes.getByRole("complementary", { name: "当前帧检查器" })).toContainText(
    "Lumen-7B"
  );
  await expect(nodes.getByRole("complementary", { name: "当前帧检查器" })).not.toContainText(
    "Lumen-7B corrected"
  );
  const info = await runtime.client.web.data.info();
  if (info.storeId === undefined) throw new Error("Web store is absent");
  await expect
    .poll(
      async () =>
        (await runtime.client.web.data.list({ storeId: info.storeId ?? "", kind: "frame" })).items
          .length
    )
    .toBe(3);
  await expect
    .poll(async () => {
      const headers = (
        await runtime.client.web.data.list({ storeId: info.storeId ?? "", kind: "editor" })
      ).items;
      if (headers[0] === undefined) return "";
      return (
        await runtime.client.web.data.read({
          storeId: info.storeId ?? "",
          kind: "editor",
          id: headers[0].id
        })
      ).data?.["statement"];
    })
    .toBe("MATCH (n:Model) RETURN n LIMIT 5");
  let queries = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/graph/query") queries += 1;
  });
  await page.reload();
  await expect(page.locator(".connection-status")).toHaveText("未连接");
  await reconnect(page, runtime);
  await expect(page.getByRole("textbox", { name: "Cypher 语句", exact: true })).toHaveValue(
    "MATCH (n:Model) RETURN n LIMIT 5"
  );
  await expect(page.locator(".query-frame")).toHaveCount(3);
  expect(queries).toBe(0);
  await expect(nodes.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  expect(
    await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
  ).toEqual({ local: 0, session: 0 });
  expect(await page.context().cookies()).toEqual([]);
});

test("runs explicitly confirmed advanced execution and explores its actual returned State", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await page.getByRole("combobox", { name: "模式", exact: true }).selectOption("execute");
  await page
    .getByRole("textbox", { name: "Cypher 语句", exact: true })
    .fill("CREATE (n:Model {name: 'Advanced E2E'}) RETURN 17 AS count");
  await page.getByRole("button", { name: "预览高级执行", exact: true }).click();
  const confirm = page.getByRole("dialog", { name: "确认高级执行", exact: true });
  await expect(confirm).toContainText(research.state);
  let executions = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/graph/execute") executions += 1;
  });
  await confirm
    .getByRole("button", { name: "确认执行一次", exact: true })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.locator(".query-frame").first().getByRole("status").first()).toContainText(
    "完成"
  );
  expect(executions).toBe(1);
  const head = (await runtime.client.evolution.overview()).state;
  expect(head).not.toBe(research.state);
  const frame = page.locator(".query-frame").first();
  await expect(frame.locator(".execute-summary")).toContainText(head);
  await frame.getByRole("button", { name: "JSON / 行", exact: true }).click();
  await expect(frame).toContainText("17");
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", research.state);
  await frame.getByRole("button", { name: "在结果 State 新建只读帧", exact: true }).click();
  await expect(page.locator(".query-frame")).toHaveCount(2);
  await expect(
    page.locator(".query-frame").first().locator(".frame-header .badge")
  ).toHaveAttribute("title", head);
});
