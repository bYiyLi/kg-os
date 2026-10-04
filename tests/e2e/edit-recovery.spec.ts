import { connect, expect, runQuery, selectState, test } from "./runtime-fixture.js";
import { unavailableStore } from "./store-failure.js";

test.describe.configure({ timeout: 60_000 });

test("opens a reliably saved draft from its normal position in historical and disconnected contexts", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const frame = page.locator(".query-frame").first();
  const node = frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true });
  await node.focus();
  await node.press("Enter");
  await frame.getByRole("button", { name: "编辑对象", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await draft.getByLabel("name · YAML 值", { exact: true }).fill('"Saved historical input"');
  await draft.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(draft.locator(".draft-status").first()).toContainText("已保存");
  await draft.getByRole("button", { name: "关闭对象草稿", exact: true }).click();
  await expect(draft).toBeHidden();
  await selectState(page, research.state);
  await expect(page.getByRole("button", { name: "新建知识对象", exact: true })).toBeDisabled();
  const saved = page.locator(".saved-drafts").first();
  await saved.locator("summary").click();
  await saved.getByRole("button").first().click();
  await expect(draft.getByLabel("name · YAML 值", { exact: true })).toHaveValue(
    '"Saved historical input"'
  );
  await draft.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(draft.getByRole("button", { name: "确认提交到 main", exact: true })).toBeDisabled();
  await draft.getByRole("button", { name: "关闭对象草稿", exact: true }).click();
  await page.getByRole("button", { name: "断开", exact: true }).click();
  await saved.getByRole("button").first().click();
  await expect(draft.getByLabel("name · YAML 值", { exact: true })).toHaveValue(
    '"Saved historical input"'
  );
  await expect(draft).toContainText("Web 保存库不可写");
  await draft.getByRole("button", { name: "查看 Patch", exact: true }).click();
  await expect(draft.getByRole("button", { name: "确认提交到 main", exact: true })).toBeDisabled();
  expect((await runtime.client.evolution.overview()).state).toBe(research.state);
});

test("retains a draft when an unrelated State advances its strict Branch base", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const frame = page.locator(".query-frame").first();
  await frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true }).click();
  await frame.getByRole("button", { name: "编辑对象", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await draft.getByLabel("name · YAML 值", { exact: true }).fill('"Unsent stale draft"');
  await draft.getByRole("button", { name: "查看 Patch", exact: true }).click();
  const advanced = await runtime.client.evolution.state.create({
    branch: "main",
    message: "unrelated empty Snapshot"
  });
  let patches = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/object/patch") patches += 1;
  });
  await draft.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(draft.getByRole("alert").first()).toContainText("STALE_BASE_STATE");
  expect(patches).toBe(0);
  expect((await runtime.client.evolution.overview()).state).toBe(advanced.state);
  await expect(draft.getByLabel("name · YAML 值", { exact: true })).toHaveValue(
    '"Unsent stale draft"'
  );
  await expect(frame.locator(".frame-header .badge")).toHaveAttribute("title", research.state);
});

test("requires a confirmed draft save before sending any Knowledge patch", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const frame = page.locator(".query-frame").first();
  await frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true }).click();
  await frame.getByRole("button", { name: "编辑对象", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "对象草稿", exact: true });
  const restore = await unavailableStore(runtime);
  let patches = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/object/patch") patches += 1;
  });
  try {
    await draft
      .getByLabel("name · YAML 值", { exact: true })
      .fill('"Input preserved after IO failure"');
    await draft.getByRole("button", { name: "查看 Patch", exact: true }).click();
    await draft.getByRole("button", { name: "确认提交到 main", exact: true }).click();
    await expect(draft.getByRole("alert").first()).toContainText("IO_ERROR");
    await expect(draft).toContainText("未可靠保存");
    expect(patches).toBe(0);
    expect((await runtime.client.evolution.overview()).state).toBe(research.state);
    await expect(draft.getByLabel("name · YAML 值", { exact: true })).toHaveValue(
      '"Input preserved after IO failure"'
    );
  } finally {
    await restore();
  }
});

test("reconciles an actual committed write whose response was lost without resending it", async ({
  page,
  runtime,
  research
}) => {
  await connect(page, runtime);
  await runQuery(page, "MATCH (n:Model) RETURN n LIMIT 5");
  const frame = page.locator(".query-frame").first();
  await frame.getByRole("button", { name: `${research.model} Lumen-7B`, exact: true }).click();
  await frame.getByRole("button", { name: "编辑对象", exact: true }).click();
  const draft = page.getByRole("dialog", { name: "对象草稿", exact: true });
  await draft.getByLabel("name · YAML 值", { exact: true }).fill('"Lost response real commit"');
  await draft.getByRole("button", { name: "查看 Patch", exact: true }).click();
  let patches = 0;
  await page.route("**/api/v1/object/patch", async (route) => {
    patches += 1;
    expect((await route.fetch()).ok()).toBe(true);
    await route.abort("connectionfailed");
  });
  await draft.getByRole("button", { name: "确认提交到 main", exact: true }).click();
  await expect(draft.getByRole("alert").first()).toContainText("写入结果未知");
  const head = (await runtime.client.evolution.overview()).state;
  expect(head).not.toBe(research.state);
  expect(
    JSON.stringify((await runtime.client.object.read({ at: head, refs: [research.model] })).results)
  ).toContain("Lost response real commit");
  await draft.getByRole("button", { name: "核对 Branch / 对象 / 历史", exact: true }).click();
  await expect(draft.locator(".unknown-outcome")).toContainText(head);
  expect(patches).toBe(1);
  await expect(draft.getByRole("status", { name: "真实提交回执", exact: true })).toHaveCount(0);
});
