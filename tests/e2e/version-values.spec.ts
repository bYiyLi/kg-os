import {
  type EvolutionChange,
  type EvolutionHistoryResult,
  type GraphExecuteRequest,
  type JsonObject,
  type MergeConflict,
  type RequestOptions
} from "@kgos/sdk";
import { type Locator, type Page } from "@playwright/test";

import { connect, expect, test, type RuntimeFixture } from "./runtime-fixture.js";

test.describe.configure({ timeout: 90_000 });

const createNodes =
  "UNWIND range(0, 21) AS ordinal CREATE (n {ordinal: ordinal, score: $score, negative: $negative}) RETURN n";
const updateNodes =
  "MATCH (n) WHERE n.ordinal >= 0 SET n.score = $score, n.negative = $negative RETURN n";

async function capture<T>(read: (options: RequestOptions) => Promise<T>) {
  let source = "";
  const value = await read({
    onJSONResponse: (text) => {
      source = text;
    }
  });
  expect(source).not.toBe("");
  return { value, source };
}

async function executeNumbers(
  runtime: RuntimeFixture,
  branch: string,
  cypher: string,
  rawParams: string
) {
  const request: GraphExecuteRequest = {
    branch,
    cypher,
    params: JSON.parse(rawParams) as JsonObject
  };
  const encodedJSON =
    JSON.stringify({ branch, cypher }).slice(0, -1) + ',"params":' + rawParams + "}";
  const result = await capture((options) =>
    runtime.client.graph.execute(request, { ...options, encodedJSON })
  );
  expect(result.value.rows).toHaveLength(22);
  return { ...result, request: encodedJSON };
}

async function numericNodes(runtime: RuntimeFixture) {
  const result = await executeNumbers(
    runtime,
    "main",
    createNodes,
    '{"score":1.0,"negative":-0.0}'
  );
  const refs = result.value.rows.map((row) => {
    const node = row[0];
    if (typeof node !== "object" || node === null || Array.isArray(node))
      throw new Error("Actual Graph row did not contain a Node");
    const ref = node["elementId"];
    if (typeof ref !== "string" || !/^n:\d+$/u.test(ref))
      throw new Error("Actual Graph Node omitted its public element identity");
    expect(node["labels"]).toEqual([]);
    return ref;
  });
  expect(new Set(refs).size).toBe(22);
  return { ...result, refs, state: result.value.state };
}

function numericPattern(key: string, value: string) {
  return new RegExp('"' + key + '"\\s*:\\s*' + value.replaceAll(".", "\\.") + "(?=\\s*[,}])", "u");
}

function expectNumbers(source: string, score: string, negative: string) {
  expect(source).toMatch(numericPattern("score", score));
  expect(source).toMatch(numericPattern("negative", negative));
}

async function expectDisplayedNumbers(section: Locator, score: string, negative: string) {
  await expect(section.locator("pre")).toContainText(numericPattern("score", score));
  await expect(section.locator("pre")).toContainText(numericPattern("negative", negative));
}

async function compareChange(
  page: Page,
  owner: Locator,
  change: EvolutionChange,
  states: { before: string; after: string }
) {
  const { before, after } = states;
  expect(change.change).toBe("update");
  expect(change.kind).toBe("knowledge-node");
  expect(change.path).toBe("/properties");
  expect(change.beforeRef).toBe(change.afterRef);
  await owner
    .getByRole("button", {
      name: `${change.change} · ${change.kind} · ${change.afterRef ?? ""}`,
      exact: true
    })
    .click();
  const child = page.getByRole("dialog", { name: "公开对象变化", exact: true });
  const fragments = child.locator(".change-columns").first().locator(":scope > section");
  await expect(fragments.nth(0).getByRole("heading")).toHaveText("Before 变化片段");
  await expectDisplayedNumbers(fragments.nth(0), "1.0", "-0.0");
  await expectDisplayedNumbers(fragments.nth(1), "1", "0");
  await child.getByRole("button", { name: "读取两侧完整对象", exact: true }).click();
  const full = child.locator(".change-side");
  await expect(full.nth(0).locator("code").first()).toHaveText(before);
  await expect(full.nth(1).locator("code").first()).toHaveText(after);
  await expect(full.nth(0)).toContainText(change.beforeRef ?? "");
  await expect(full.nth(1)).toContainText(change.afterRef ?? "");
  await expectDisplayedNumbers(full.nth(0), "1.0", "-0.0");
  await expectDisplayedNumbers(full.nth(1), "1", "0");
  await child.getByRole("button", { name: "关闭公开对象变化", exact: true }).click();
  await expect(child).toBeHidden();
  await expect(owner).toBeVisible();
}

function updatedEntry(page: EvolutionHistoryResult, state: string, parent: string) {
  const entry = page.items.find((item) => item.change?.change === "update");
  if (entry?.change === undefined || entry.change === null)
    throw new Error("Actual History page omitted its update Change");
  expect(entry.state).toBe(state);
  expect(entry.parents).toEqual([parent]);
  return entry.change;
}

function firstChange(items: EvolutionChange[]) {
  const change = items[0];
  if (change === undefined) throw new Error("Actual Diff page omitted its public Change");
  return change;
}

async function readBothObjects(
  runtime: RuntimeFixture,
  before: string,
  after: string,
  ref: string | undefined
) {
  if (ref === undefined) throw new Error("Actual Change did not contain an Object Ref");
  const left = await capture((options) =>
    runtime.client.object.read({ at: before, refs: [ref] }, options)
  );
  const right = await capture((options) =>
    runtime.client.object.read({ at: after, refs: [ref] }, options)
  );
  expect(left.value.state).toBe(before);
  expect(right.value.state).toBe(after);
  expectNumbers(left.source, "1.0", "-0.0");
  expectNumbers(right.source, "1", "0");
  return { left, right };
}

test("preserves actual Float fragments and full objects in paged Diff and History", async ({
  page,
  runtime
}, info) => {
  const base = await numericNodes(runtime);
  const after = await executeNumbers(runtime, "main", updateNodes, '{"score":1,"negative":0}');
  expect(after.value.state).not.toBe(base.state);
  expectNumbers(base.source, "1.0", "-0.0");
  expectNumbers(after.source, "1", "0");
  const request = { before: base.state, after: after.value.state, scope: "knowledge", limit: 20 };
  const first = await capture((options) => runtime.client.evolution.diff(request, options));
  expect(first.value.items).toHaveLength(20);
  expect(first.value.cursor).toEqual(expect.any(String));
  const next = await capture((options) =>
    runtime.client.evolution.diff({ ...request, cursor: first.value.cursor ?? "" }, options)
  );
  expect(next.value.items).toHaveLength(2);
  expect(next.value.cursor).toBeUndefined();
  for (const result of [first, next]) {
    expectNumbers(result.source, "1.0", "-0.0");
    expectNumbers(result.source, "1", "0");
    expect(result.value.before).toBe(base.state);
    expect(result.value.after).toBe(after.value.state);
  }
  const changes = [firstChange(first.value.items), firstChange(next.value.items)] as const;
  for (const change of changes) expect(base.refs).toContain(change.afterRef);
  const complete = await readBothObjects(
    runtime,
    base.state,
    after.value.state,
    changes[1].afterRef
  );
  const historyRequest = { root: after.value.state, scope: "knowledge", limit: 20 };
  const history = await capture((options) =>
    runtime.client.evolution.history(historyRequest, options)
  );
  const historyNext = await capture((options) =>
    runtime.client.evolution.history(
      { ...historyRequest, cursor: history.value.cursor ?? "" },
      options
    )
  );
  expect(history.value.items).toHaveLength(20);
  expect(historyNext.value.items).toHaveLength(20);
  expect(history.value.root).toBe(after.value.state);
  expect(historyNext.value.root).toBe(after.value.state);
  const historyChanges = [
    updatedEntry(history.value, after.value.state, base.state),
    updatedEntry(historyNext.value, after.value.state, base.state)
  ] as const;
  const browserRequests: { path: string; body: string }[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/evolution/diff" || path === "/api/v1/evolution/history")
      browserRequests.push({ path, body: request.postData() ?? "" });
  });
  await connect(page, runtime);
  await page.getByRole("button", { name: "两 State 差异", exact: true }).click();
  const diff = page.getByRole("dialog", { name: "两 State 差异", exact: true });
  await diff.getByLabel("Before StateRef", { exact: true }).fill(base.state);
  await diff.getByLabel("After StateRef", { exact: true }).fill(after.value.state);
  await diff.getByRole("combobox", { name: "范围", exact: true }).selectOption("knowledge");
  await diff.getByRole("button", { name: "比较两 State", exact: true }).click();
  await expect(diff.locator(".change-list > p").first()).toContainText("已加载 20 条变化记录");
  await diff.getByRole("textbox", { name: "在已加载 Change 内筛选", exact: true }).fill("1.0");
  await expect(diff.locator(".change-list > p").first()).toContainText("过滤范围 20 条");
  await diff.getByRole("textbox", { name: "在已加载 Change 内筛选", exact: true }).fill("");
  await compareChange(page, diff, changes[0], { before: base.state, after: after.value.state });
  await diff.getByRole("button", { name: "加载更多 Change", exact: true }).click();
  await expect(diff.locator(".change-list > p").first()).toContainText("已加载 22 条变化记录");
  await diff.getByRole("button", { name: "下一片段", exact: true }).click();
  await compareChange(page, diff, changes[1], { before: base.state, after: after.value.state });
  await expect(diff.getByRole("button", { name: "加载更多 Change", exact: true })).toBeDisabled();
  await diff.getByRole("button", { name: "关闭两 State 差异", exact: true }).click();
  await page.getByRole("button", { name: "业务历史", exact: true }).click();
  const historyView = page.getByRole("dialog", { name: "业务历史", exact: true });
  await historyView.getByLabel("History root", { exact: true }).fill(after.value.state);
  await historyView.getByRole("combobox", { name: "范围", exact: true }).selectOption("knowledge");
  await historyView.getByRole("button", { name: "读取业务历史", exact: true }).click();
  await expect(historyView.locator(".change-list > p").first()).toContainText(
    "已加载 20 条变化记录"
  );
  await compareChange(page, historyView, historyChanges[0], {
    before: base.state,
    after: after.value.state
  });
  await historyView.getByRole("button", { name: "加载更多 Change", exact: true }).click();
  await expect(historyView.locator(".change-list > p").first()).toContainText(
    "已加载 40 条变化记录"
  );
  await historyView.getByRole("button", { name: "下一片段", exact: true }).click();
  await compareChange(page, historyView, historyChanges[1], {
    before: base.state,
    after: after.value.state
  });
  expect(
    browserRequests.map((entry) => ({ ...entry, body: JSON.parse(entry.body) as unknown }))
  ).toEqual([
    { path: "/api/v1/evolution/diff", body: request },
    { path: "/api/v1/evolution/diff", body: { ...request, cursor: first.value.cursor } },
    { path: "/api/v1/evolution/history", body: historyRequest },
    { path: "/api/v1/evolution/history", body: { ...historyRequest, cursor: history.value.cursor } }
  ]);
  expect((await runtime.client.evolution.overview()).state).toBe(after.value.state);
  await info.attach("actual-version-number-sources.json", {
    body: JSON.stringify({
      base,
      after,
      diff: [first, next],
      history: [history, historyNext],
      complete,
      browserRequests
    }),
    contentType: "application/json"
  });
});

async function expectConflict(merge: Locator, conflict: MergeConflict) {
  await merge
    .getByRole("button", {
      name: `${conflict.kind} · ${conflict.path || "整个 Object"} · ${conflict.conflictId} · 未解决`,
      exact: true
    })
    .click();
  await expect(merge.locator(".merge-conflict-editor")).toContainText(conflict.conflictId);
  await expect(merge.locator(".conflict-value.base pre")).toHaveText("1.0");
  await expect(merge.locator(".conflict-value.ours pre")).toHaveText("1");
  await expect(merge.locator(".conflict-value.theirs pre")).toHaveText("2.0");
}

test("preserves actual Float and Integer Merge sides through conflict pagination and session reread", async ({
  page,
  runtime
}, info) => {
  const base = await numericNodes(runtime);
  await runtime.client.evolution.branch.create({ name: "numeric-source", from: base.state });
  const ours = await executeNumbers(runtime, "main", updateNodes, '{"score":1,"negative":0}');
  const theirs = await executeNumbers(
    runtime,
    "numeric-source",
    updateNodes,
    '{"score":2.0,"negative":-0.0}'
  );
  const session = await runtime.client.evolution.merge.start({
    branch: "main",
    source: theirs.value.state
  });
  expect(session).toMatchObject({
    branch: "main",
    targetState: ours.value.state,
    sourceState: theirs.value.state,
    status: "conflicted",
    unresolved: 22,
    revision: 1
  });
  const request = { session: session.session, limit: 20 };
  const first = await capture((options) =>
    runtime.client.evolution.merge.conflicts(request, options)
  );
  const next = await capture((options) =>
    runtime.client.evolution.merge.conflicts(
      { ...request, cursor: first.value.cursor ?? "" },
      options
    )
  );
  expect(first.value.items).toHaveLength(20);
  expect(next.value.items).toHaveLength(2);
  expect(first.value.cursor).toEqual(expect.any(String));
  expect(next.value.cursor).toBeUndefined();
  for (const result of [first, next]) {
    expect(result.value.session).toBe(session.session);
    expect(result.value.revision).toBe(session.revision);
    expect(result.source).toMatch(/"base"\s*:\s*1\.0(?=\s*[,}])/u);
    expect(result.source).toMatch(/"ours"\s*:\s*1(?=\s*[,}])/u);
    expect(result.source).toMatch(/"theirs"\s*:\s*2\.0(?=\s*[,}])/u);
    for (const conflict of result.value.items) {
      expect(conflict.path).toBe("/properties/score");
      expect(conflict.kind).toBe("knowledge-node");
      expect(base.refs).toContain(conflict.baseRef);
      expect(conflict.oursRef).toBe(conflict.baseRef);
      expect(conflict.theirsRef).toBe(conflict.baseRef);
    }
  }
  const conflicts = [first.value.items[0], next.value.items[0]];
  if (conflicts[0] === undefined || conflicts[1] === undefined)
    throw new Error("Actual Merge pages omitted their conflict identity");
  const browserRequests: string[] = [];
  let writes = 0;
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path === "/api/v1/evolution/merge/conflicts")
      browserRequests.push(request.postData() ?? "");
    if (/\/api\/v1\/evolution\/merge\/(?:resolve|finalize)$/u.test(path)) writes += 1;
  });
  await connect(page, runtime);
  await page.getByRole("button", { name: "Merge Session", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "Merge Session", exact: true });
  await merge.locator("summary").filter({ hasText: "重开已存在 Session" }).click();
  await merge.getByLabel("Session token", { exact: true }).fill(session.session);
  await merge.getByRole("button", { name: "读取 Session", exact: true }).click();
  await expect(merge.locator(".merge-pinned")).toContainText(session.session);
  await expect(merge.locator(".merge-pinned")).toContainText(ours.value.state);
  await expect(merge.locator(".merge-pinned")).toContainText(theirs.value.state);
  await expect(merge.locator(".merge-pinned")).toContainText("revision 1");
  await expect(merge.getByRole("navigation", { name: "公开 Merge conflicts" })).toContainText(
    "已加载冲突 20"
  );
  await expectConflict(merge, conflicts[0]);
  await merge.getByRole("button", { name: "加载更多冲突", exact: true }).click();
  await expect(merge.getByRole("navigation", { name: "公开 Merge conflicts" })).toContainText(
    "已加载冲突 22"
  );
  await merge.getByRole("button", { name: "下一冲突片段", exact: true }).click();
  await expectConflict(merge, conflicts[1]);
  await expect(merge.getByRole("button", { name: "加载更多冲突", exact: true })).toBeDisabled();
  await merge.getByRole("button", { name: "重读 Session / refs", exact: true }).click();
  await expect(merge.getByRole("navigation", { name: "公开 Merge conflicts" })).toContainText(
    "已加载冲突 20"
  );
  await merge.getByRole("button", { name: "上一冲突片段", exact: true }).click();
  await expectConflict(merge, conflicts[0]);
  expect(browserRequests.map((body) => JSON.parse(body) as unknown)).toEqual([
    request,
    { ...request, cursor: first.value.cursor },
    request
  ]);
  expect(writes).toBe(0);
  expect(await runtime.client.evolution.merge.get({ session: session.session })).toEqual(session);
  expect((await runtime.client.evolution.overview()).state).toBe(ours.value.state);
  await info.attach("actual-merge-number-sources.json", {
    body: JSON.stringify({
      base,
      ours,
      theirs,
      session,
      conflicts: [first, next],
      browserRequests
    }),
    contentType: "application/json"
  });
});
