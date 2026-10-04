import { type EvolutionAncestryRequest, type EvolutionAncestryResult } from "@kgos/sdk";
import { type Locator } from "@playwright/test";

import {
  connect,
  expect,
  runQuery,
  selectState,
  test,
  type RuntimeFixture
} from "./runtime-fixture.js";

test.describe.configure({ timeout: 60_000 });

test("keeps a running frame pinned while browsing another actual State and retains old views on failed navigation", async ({
  page,
  runtime,
  research
}) => {
  const next = await runtime.client.evolution.state.create({
    branch: "main",
    message: "empty Snapshot for navigation"
  });
  await connect(page, runtime);
  await selectState(page, research.state);
  let received: (() => void) | undefined;
  let release: (() => void) | undefined;
  const backendDone = new Promise<void>((resolve) => {
    received = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/graph/query", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    received?.();
    await held;
    await route.fulfill({ response });
  });
  try {
    await page
      .getByRole("textbox", { name: "Cypher 语句", exact: true })
      .fill("MATCH (n:Model) RETURN n LIMIT 5");
    await page.getByRole("button", { name: "运行查询", exact: true }).click();
    await backendDone;
    await selectState(page, next.state);
    const old = page.locator(".query-frame").first();
    await expect(old.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
    release?.();
    await expect(old.getByRole("status").first()).toContainText("完成");
    await expect(
      old.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true })
    ).toBeVisible();
    await page.unroute("**/api/v1/graph/query");
    await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
    await expect(
      page.locator(".query-frame").first().locator(".frame-header .badge")
    ).toHaveAttribute("title", next.state);
    await page
      .getByRole("combobox", { name: "浏览版本", exact: true })
      .fill("commit/" + "f".repeat(64));
    await page.getByRole("button", { name: "选择版本", exact: true }).click();
    await expect(page.locator(".context-bar").getByRole("alert")).toBeVisible();
    await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", next.state);
    await expect(page.locator(".query-frame")).toHaveCount(2);
    await selectState(page, next.state);
  } finally {
    release?.();
  }
});

test("ignores a late real object detail after the same frame selects another object", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(
    page,
    "MATCH (n) WHERE n.name IN ['Lumen-7B','Lumen Technical Report'] RETURN n LIMIT 5"
  );
  const frame = page.locator(".query-frame").first();
  let received: (() => void) | undefined;
  let release: (() => void) | undefined;
  const backendDone = new Promise<void>((resolve) => {
    received = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/v1/object/read", async (route) => {
    const request = route.request().postDataJSON() as { refs: string[] };
    if (!request.refs.includes(research.model)) {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    received?.();
    await held;
    try {
      await route.fulfill({ response });
    } catch {
      /* previous selection was aborted */
    }
  });
  try {
    const model = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
    await model.focus();
    await model.press("Enter");
    await backendDone;
    const paper = frame.getByRole("button", {
      name: `${research.paper} Lumen Technical Report`,
      exact: true
    });
    await paper.focus();
    await paper.press("Enter");
    const inspector = frame.getByRole("complementary", { name: "当前帧检查器" });
    await expect(inspector).toContainText("Lumen Technical Report");
    release?.();
    await expect(inspector).toContainText(research.paper);
    await expect(inspector).not.toContainText("9223372036854775807");
    await expect(paper).toHaveClass(/selected/u);
  } finally {
    release?.();
  }
});

async function visibleStates(timeline: Locator): Promise<string[]> {
  return await timeline
    .locator(".state-select")
    .evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute("title")?.split("\n")[0] ?? "")
    );
}

async function largeHistory(runtime: RuntimeFixture, researchState: string) {
  await runtime.client.evolution.branch.create({ name: "qa-history", from: researchState });
  let forkState = "";
  for (let index = 0; index < 130; index += 1) {
    const state = await runtime.client.evolution.state.create({
      branch: "qa-history",
      message: `qa history snapshot ${String(index + 1)}`
    });
    if (index === 59) forkState = state.state;
  }
  expect(forkState).not.toBe("");
  await runtime.client.evolution.branch.create({ name: "qa-lane", from: forkState });
  for (let index = 0; index < 5; index += 1)
    await runtime.client.evolution.state.create({ branch: "qa-lane", message: "qa side snapshot" });
  const side = await runtime.client.graph.execute({
    branch: "qa-lane",
    cypher: "CREATE (n:QALane {name:'side history'}) RETURN n"
  });
  const target = await runtime.client.graph.execute({
    branch: "qa-history",
    cypher: "CREATE (n:QAHistory {name:'main history'}) RETURN n"
  });
  const session = await runtime.client.evolution.merge.start({
    branch: "qa-history",
    source: "branch/qa-lane"
  });
  expect(session.unresolved).toBe(0);
  const merged = await runtime.client.evolution.merge.finalize({
    session: session.session,
    expectedRevision: session.revision,
    message: "qa history merge"
  });
  expect(merged.status).toBe("merged");
  const metadata = await runtime.client.evolution.get({ state: merged.state });
  expect([...metadata.parents].sort()).toEqual([target.state, side.state].sort());

  const branchPage = await runtime.client.evolution.ancestry({
    root: "branch/qa-history",
    limit: 20
  });
  if (branchPage.cursor === undefined) throw new Error("Large ancestry omitted its continuation");
  const viewed = await runtime.client.evolution.state.create({
    branch: "qa-history",
    message: "qa pinned root"
  });
  const nextBranchPage = await runtime.client.evolution.ancestry({
    root: "branch/qa-history",
    limit: 20,
    cursor: branchPage.cursor
  });
  expect(branchPage.root).toBe(merged.state);
  expect(nextBranchPage.root).toBe(merged.state);
  const expected = await runtime.client.evolution.ancestry({ root: viewed.state, limit: 200 });
  expect(expected.cursor).toBeUndefined();
  expect(expected.items.length).toBeGreaterThan(100);
  expect(new Set(expected.items.map((item) => item.state)).size).toBe(expected.items.length);
  expect(nextBranchPage.items.map((item) => item.state)).toEqual(
    expected.items.slice(21, 41).map((item) => item.state)
  );
  return { metadata, merged, viewed, expected };
}

test("pages a real large fork and merge history and limits rendered rows without changing an old query frame", async ({
  page,
  runtime,
  research
}, info) => {
  test.setTimeout(120_000);
  const { metadata, merged, viewed, expected } = await largeHistory(runtime, research.state);
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const frame = page.locator(".query-frame").first();
  const model = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await model.click();
  await frame.getByRole("button", { name: "放大图谱", exact: true }).click();
  const svg = frame.locator(".graph-canvas svg");
  const before = await svg.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { width: bounds.width, height: bounds.height, viewBox: element.getAttribute("viewBox") };
  });
  await selectState(page, "branch/qa-history");
  await expect(page.locator(".context-bar .badge")).toHaveAttribute("title", viewed.state);
  const panel = page.getByRole("complementary", { name: "知识版本", exact: true });
  await panel.getByText("完整 StateRef 定位 / root", { exact: true }).click();
  const requests: EvolutionAncestryRequest[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/evolution/ancestry")
      requests.push(request.postDataJSON() as EvolutionAncestryRequest);
  });
  const pages: EvolutionAncestryResult[] = [];
  async function receivePage(action: () => Promise<void>) {
    const pending = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/v1/evolution/ancestry"
    );
    await action();
    const response = await pending;
    expect(response.ok()).toBe(true);
    pages.push((await response.json()) as EvolutionAncestryResult);
    const count = pages.reduce((total, result) => total + result.items.length, 0);
    await expect(panel).toContainText(`已加载 ${String(count)} 条`);
  }
  await receivePage(async () => {
    await panel
      .getByRole("button", { name: "以当前浏览 State 加载 ancestry", exact: true })
      .click();
  });
  await runtime.client.evolution.state.create({ branch: "qa-history", message: "qa later head" });
  await panel.getByRole("button", { name: "展开 DAG", exact: true }).click();
  const dag = page.getByRole("dialog", { name: "版本 ancestry DAG", exact: true });
  const mergeNode = dag.locator(".version-node").filter({
    has: page.locator(".state-select", { hasText: "qa history merge" })
  });
  await expect(mergeNode).toContainText("2 parents");
  await expect(mergeNode.locator(".state-select")).toHaveAttribute(
    "title",
    `${merged.state}\nqa history merge`
  );
  const lanes = await dag
    .locator(".version-node")
    .evaluateAll((nodes) => [...new Set(nodes.map((node) => (node as HTMLElement).style.left))]);
  expect(lanes.length).toBeGreaterThan(1);
  await mergeNode.getByRole("button", { name: "详情", exact: true }).click();
  const detail = page.getByRole("dialog", { name: "State 详情", exact: true });
  const parents = detail
    .locator(".state-metadata")
    .getByRole("button", { name: /^commit\/[0-9a-f]{64}$/u });
  await expect(parents).toHaveCount(2);
  expect((await parents.allTextContents()).sort()).toEqual([...metadata.parents].sort());
  await detail.getByRole("button", { name: "关闭State 详情", exact: true }).click();
  await panel.getByRole("button", { name: "展开 DAG", exact: true }).click();
  await dag.locator(".version-timeline").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(async () => await dag.getByRole("button", { name: /^继续加载 parent /u }).count())
    .toBeGreaterThan(0);
  await expect(dag.locator(".dag-edges path[stroke-dasharray]").first()).toHaveAttribute(
    "stroke-dasharray",
    "4 4"
  );
  await receivePage(async () => {
    await dag
      .getByRole("button", { name: /^继续加载 parent /u })
      .first()
      .click();
  });
  await dag.getByRole("button", { name: "关闭版本 ancestry DAG", exact: true }).click();
  while (pages.at(-1)?.cursor !== undefined)
    await receivePage(async () => {
      await panel.getByRole("button", { name: "加载更多版本", exact: true }).click();
    });
  expect(requests.length).toBe(pages.length);
  for (const [index, request] of requests.entries()) {
    expect(request.root).toBe(viewed.state);
    expect(request.limit).toBe(20);
    expect(request.cursor).toBe(index === 0 ? undefined : pages[index - 1]?.cursor);
    expect(pages[index]?.root).toBe(viewed.state);
  }
  expect(pages.flatMap((result) => result.items.map((item) => item.state))).toEqual(
    expected.items.map((item) => item.state)
  );
  const timeline = panel.locator('.version-timeline[aria-label="版本提交列表"]');
  const initialVisible = await visibleStates(timeline);
  expect(initialVisible.length).toBeGreaterThan(0);
  expect(initialVisible.length).toBeLessThan(expected.items.length);
  expect(initialVisible.length).toBeLessThanOrEqual(16);
  await timeline.evaluate((element) => {
    element.scrollTop = 85 * 104;
  });
  await expect.poll(async () => await visibleStates(timeline)).not.toEqual(initialVisible);
  const scrolledVisible = await visibleStates(timeline);
  expect(scrolledVisible.length).toBeLessThanOrEqual(16);
  for (const state of scrolledVisible)
    expect(expected.items.some((item) => item.state === state)).toBe(true);
  await expect(frame.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
  await expect(model).toHaveClass(/selected/u);
  expect(
    await svg.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        width: bounds.width,
        height: bounds.height,
        viewBox: element.getAttribute("viewBox")
      };
    })
  ).toEqual(before);
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
  await info.attach("real-history-window.json", {
    body: JSON.stringify({
      createdEmptyStates: 137,
      loaded: expected.items.length,
      uiPages: pages.length,
      rendered: initialVisible.length,
      scrolledRendered: scrolledVisible.length,
      lanes: lanes.length,
      mergeParents: metadata.parents,
      branchCursorPinned: true,
      uiCursorPinned: true,
      oldFrameState: research.state
    }),
    contentType: "application/json"
  });
});
