import { type JsonValue } from "@kgos/sdk";

import {
  changedObject,
  connect,
  expect,
  reconnect,
  runQuery,
  selectState,
  test,
  type RuntimeFixture
} from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

async function savedDraft(runtime: RuntimeFixture, subtype: string) {
  const store = await runtime.client.web.data.info();
  if (store.storeId === undefined) throw new Error("Web store is absent");
  const { storeId } = store;
  const headers = await runtime.client.web.data.list({ storeId, kind: "draft" });
  const records = await Promise.all(
    headers.items
      .filter((header) => !header.deleted)
      .map(async (header) =>
        runtime.client.web.data.read({ storeId, kind: "draft", id: header.id })
      )
  );
  return records.find((record) => record.data?.["subtype"] === subtype)?.data;
}

async function setRawStateData(runtime: RuntimeFixture, state: string, raw: string) {
  await runtime.client.evolution.state.setData(
    { state, data: JSON.parse(raw) as JsonValue },
    { encodedJSON: `{"state":${JSON.stringify(state)},"data":${raw}}` }
  );
}

test("preserves State Data typed integers and Float literals and detects a real numeric type change", async ({
  page,
  runtime,
  research
}) => {
  await setRawStateData(
    runtime,
    research.state,
    '{"left":9007199254740992,"right":9007199254740993,"typed":1.0,"negative":-0.0}'
  );
  const response = await page.request.post(runtime.endpoint + "/api/v1/evolution/get", {
    headers: { authorization: "Bearer " + runtime.token },
    data: { state: research.state }
  });
  expect(response.ok()).toBe(true);
  const raw = await response.text();
  expect(raw).toMatch(/"right"\s*:\s*\{"\$type":"Integer","value":"9007199254740993"\}/u);
  expect(raw).toMatch(/"typed"\s*:\s*1\.0/u);
  expect(raw).toMatch(/"negative"\s*:\s*-0\.0/u);
  await connect(page, runtime);
  await page.getByRole("button", { name: "State 详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "State 详情", exact: true });
  const input = detail.getByRole("textbox", { name: "注释 JSON", exact: true });
  await expect(input).toHaveValue(/"value"\s*:\s*"9007199254740992"/u);
  await expect(input).toHaveValue(/"value"\s*:\s*"9007199254740993"/u);
  await expect(input).toHaveValue(/"typed"\s*:\s*1\.0/u);
  await expect(input).toHaveValue(/"negative"\s*:\s*-0\.0/u);
  await input.fill('{"pending":true}');
  await expect
    .poll(async () => savedDraft(runtime, "state-data"))
    .toMatchObject({
      version: 1,
      subtype: "state-data",
      state: research.state,
      text: '{"pending":true}'
    });
  let writes = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/evolution/state/set-data") writes += 1;
  });
  await setRawStateData(
    runtime,
    research.state,
    '{"left":9007199254740992,"right":9007199254740993,"typed":1,"negative":-0.0}'
  );
  await detail.getByRole("button", { name: "重读当前注释", exact: true }).click();
  await expect(detail.locator(".state-data-comparison")).toContainText("当前注释与原观察值不同");
  await expect(input).toHaveValue('{"pending":true}');
  await expect(detail.getByRole("button", { name: "确认设置注释", exact: true })).toBeDisabled();
  expect(writes).toBe(0);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
});

test("manages refs and State Data through the real APIs and preserves empty-delta States", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await page.getByRole("button", { name: "Branch / Tag / State", exact: true }).click();
  const refs = page.getByRole("dialog", { name: "Branch / Tag / State", exact: true });
  const form = refs.locator(".ref-form");
  await form.getByLabel("名称", { exact: true }).fill("browser-branch");
  await form.getByLabel("明确 from StateRef", { exact: true }).fill(research.state);
  await form.getByRole("button", { name: "确认创建", exact: true }).click();
  await expect
    .poll(async () =>
      (await runtime.client.evolution.branch.list()).items.some(
        (ref) => ref.name === "browser-branch" && ref.state === research.state
      )
    )
    .toBe(true);
  await form.getByRole("combobox", { name: "类别", exact: true }).selectOption("tag");
  await form.getByLabel("名称", { exact: true }).fill("browser-tag");
  await form.getByLabel("明确 target StateRef", { exact: true }).fill(research.state);
  await form.getByRole("button", { name: "确认创建", exact: true }).click();
  await expect
    .poll(async () =>
      (await runtime.client.evolution.tag.list()).items.some(
        (ref) => ref.name === "browser-tag" && ref.state === research.state
      )
    )
    .toBe(true);
  const create = refs.locator(".state-create");
  await create.getByLabel("提交说明", { exact: true }).fill("empty Snapshot from browser");
  await create.getByRole("button", { name: "确认创建 State", exact: true }).click();
  await expect
    .poll(async () => (await runtime.client.evolution.overview()).state)
    .not.toBe(research.state);
  const head = (await runtime.client.evolution.overview()).state;
  const empty = await runtime.client.evolution.diff({
    before: research.state,
    after: head,
    scope: "all"
  });
  expect(empty.items).toEqual([]);
  await form.getByRole("combobox", { name: "动作", exact: true }).selectOption("move");
  await form.getByLabel("明确 target StateRef", { exact: true }).fill(head);
  await form.getByRole("button", { name: "确认移动 Tag", exact: true }).click();
  await expect
    .poll(
      async () =>
        (await runtime.client.evolution.tag.list()).items.find((ref) => ref.name === "browser-tag")
          ?.state
    )
    .toBe(head);
  await refs.getByRole("button", { name: "关闭Branch / Tag / State", exact: true }).click();
  await selectState(page, head);
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", head);
  await page.getByRole("button", { name: "State 详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "State 详情", exact: true });
  await expect(detail).toContainText("ABSENT · 未设置");
  await detail.getByRole("textbox", { name: "注释 JSON", exact: true }).fill('{ "note":');
  await expect
    .poll(async () => savedDraft(runtime, "state-data"))
    .toMatchObject({
      version: 1,
      subtype: "state-data",
      state: head,
      text: '{ "note":',
      pending: false
    });
  let sidecarWrites = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/evolution/state/set-data") sidecarWrites += 1;
  });
  await page.reload();
  await reconnect(page, runtime);
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", head);
  await expect(detail).toBeVisible();
  await expect(detail).toContainText(head);
  await expect(detail.getByRole("textbox", { name: "注释 JSON", exact: true })).toHaveValue(
    '{ "note":'
  );
  expect(sidecarWrites).toBe(0);
  await expect(detail.getByRole("button", { name: "确认设置注释", exact: true })).toBeDisabled();
  await detail.getByRole("button", { name: "已比较，继续编辑当前注释", exact: true }).click();
  await detail.getByRole("textbox", { name: "注释 JSON", exact: true }).fill("null");
  await detail.getByRole("button", { name: "确认设置注释", exact: true }).click();
  await expect
    .poll(async () => (await runtime.client.evolution.get({ state: head })).hasData)
    .toBe(true);
  expect(sidecarWrites).toBe(1);
  expect((await runtime.client.evolution.get({ state: head })).data).toBeNull();
  await expect(detail).toContainText("显式 JSON null");
  await expect
    .poll(async () => savedDraft(runtime, "state-data"))
    .toMatchObject({
      version: 1,
      subtype: "state-data",
      state: head,
      text: "null",
      intent: "set",
      hasData: true,
      data: null,
      pending: false
    });
  expect((await runtime.client.evolution.overview()).state).toBe(head);
  await detail.getByRole("button", { name: "清除注释草稿", exact: true }).click();
  await detail.getByRole("button", { name: "确认清除注释", exact: true }).click();
  await expect
    .poll(async () => (await runtime.client.evolution.get({ state: head })).hasData)
    .toBe(false);
  expect(
    (await runtime.client.evolution.diff({ before: research.state, after: head, scope: "all" }))
      .items
  ).toEqual([]);
});

test("shows a real Diff, resolves a conflicting Merge and renders both parents without moving old frames", async ({
  page,
  runtime,
  research
}) => {
  await runtime.client.evolution.branch.create({ name: "experiment", from: research.state });
  const base = (
    await runtime.client.object.readText({ at: research.state, refs: [research.model] })
  ).results[0]?.body;
  if (base === undefined) throw new Error("real canonical Model body is absent");
  const ours = await runtime.client.object.patch({
    branch: "main",
    baseState: research.state,
    patch: changedObject(research.model, base, base.replace("Lumen-7B", "Lumen target")),
    message: "target change"
  });
  const theirs = await runtime.client.object.patch({
    branch: "experiment",
    baseState: research.state,
    patch: changedObject(research.model, base, base.replace("Lumen-7B", "Lumen source")),
    message: "source change"
  });
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const oldFrame = page.locator(".query-frame").first();
  await expect(
    oldFrame.getByRole("button", { name: `${research.model} Lumen target`, exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "两 State 差异", exact: true }).click();
  const diff = page.getByRole("dialog", { name: "两 State 差异", exact: true });
  await diff.getByLabel("Before StateRef", { exact: true }).fill(research.state);
  await diff.getByLabel("After StateRef", { exact: true }).fill(ours.state);
  await diff.getByRole("button", { name: "比较两 State", exact: true }).click();
  await expect(diff.getByRole("region", { name: "已加载公开 Change", exact: true })).toContainText(
    "/properties"
  );
  await diff.getByRole("button", { name: "关闭两 State 差异", exact: true }).click();
  await page.getByRole("button", { name: "Merge Session", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "Merge Session", exact: true });
  await merge.getByLabel("来源 StateRef", { exact: true }).fill("branch/experiment");
  await merge.getByRole("button", { name: "开始 Merge", exact: true }).click();
  await expect(merge.locator(".merge-pinned")).toContainText(ours.state);
  await expect(merge.locator(".merge-pinned")).toContainText(theirs.state);
  await expect(
    merge.getByRole("button", { name: "确认完成合并 · finalize", exact: true })
  ).toBeDisabled();
  await expect(merge.locator(".merge-conflict-editor")).toContainText("/properties");
  await merge.getByRole("radio", { name: "采用 Source · theirs", exact: true }).check();
  const session = (await runtime.client.evolution.merge.list({ limit: 10 })).items[0];
  if (session === undefined) throw new Error("Real Merge Session is absent");
  await expect
    .poll(async () => savedDraft(runtime, "merge"))
    .toMatchObject({
      version: 1,
      subtype: "merge",
      session: session.session,
      targetState: ours.state,
      sourceState: theirs.state,
      revision: 1,
      pending: "",
      choices: [expect.objectContaining({ choice: "theirs", revision: 1 })]
    });
  let mergeWrites = 0;
  page.on("request", (request) => {
    if (/\/api\/v1\/evolution\/merge\/(?:resolve|finalize)$/u.test(new URL(request.url()).pathname))
      mergeWrites += 1;
  });
  await page.reload();
  await reconnect(page, runtime);
  await expect(merge).toBeVisible();
  await expect(merge.locator(".merge-pinned")).toContainText(session.session);
  await merge.getByRole("button", { name: "关闭Merge Session", exact: true }).click();
  await oldFrame.getByRole("button", { name: "加载完整缓存", exact: true }).click();
  await expect(
    oldFrame.getByRole("button", { name: `${research.model} Lumen target`, exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Merge Session", exact: true }).click();
  await expect(merge.locator(".merge-pinned")).toContainText(session.session);
  await expect(
    merge.getByRole("radio", { name: "采用 Source · theirs", exact: true })
  ).toBeChecked();
  expect(mergeWrites).toBe(0);
  expect((await runtime.client.evolution.merge.get({ session: session.session })).revision).toBe(1);
  await merge.getByRole("button", { name: "确认保存当前解决方案 · resolve", exact: true }).click();
  await expect(merge.locator(".merge-pinned")).toContainText("revision 2");
  await expect(merge.locator(".merge-pinned")).toContainText("unresolved 0");
  expect(mergeWrites).toBe(1);
  await expect
    .poll(async () => savedDraft(runtime, "merge"))
    .toMatchObject({
      version: 1,
      subtype: "merge",
      session: session.session,
      branch: "main",
      targetState: ours.state,
      sourceState: theirs.state,
      revision: 2,
      pending: "",
      choices: []
    });
  await merge.getByLabel("Merge 提交说明", { exact: true }).fill("browser conflicting merge");
  await merge.getByRole("button", { name: "确认完成合并 · finalize", exact: true }).click();
  await expect(merge.locator(".merge-outcome")).toContainText("merged");
  expect(mergeWrites).toBe(2);
  const head = (await runtime.client.evolution.overview()).state;
  const state = await runtime.client.evolution.get({ state: head });
  expect([...state.parents].sort()).toEqual([ours.state, theirs.state].sort());
  expect(
    JSON.stringify((await runtime.client.object.read({ at: head, refs: [research.model] })).results)
  ).toContain("Lumen source");
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", ours.state);
  await merge.getByRole("button", { name: "关闭Merge Session", exact: true }).click();
  await expect(oldFrame.locator(".frame-header .badge")).toHaveAttribute("title", ours.state);
  await expect(
    oldFrame.getByRole("button", { name: `${research.model} Lumen target`, exact: true })
  ).toBeVisible();
  await selectState(page, head);
  await page.getByText("完整 StateRef 定位 / root", { exact: true }).click();
  await page.getByRole("button", { name: "以当前浏览 State 加载 ancestry", exact: true }).click();
  await page.getByRole("button", { name: "展开 DAG", exact: true }).click();
  const dag = page.getByRole("dialog", { name: "版本 ancestry DAG", exact: true });
  const ancestry = await runtime.client.evolution.ancestry({ root: head, limit: 20 });
  await expect(dag.locator(".dag-edges > path")).toHaveCount(
    ancestry.items.reduce((count, item) => count + item.parents.length, 0)
  );
  await expect(dag).toContainText("parent");
});
