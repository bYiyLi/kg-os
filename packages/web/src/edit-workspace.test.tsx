// @vitest-environment happy-dom
import { useSyncExternalStore } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ObjectDraft } from "./edit-controller.js";
import { draftData } from "./edit-data.js";
import { fieldId } from "./edit-fields.js";
import { KnowledgeEditor, ObjectEditorModal } from "./edit-workspace.js";
import { DraftDiagnostics, DraftReceipt, DraftReview } from "./edit-review.js";
import { type Records } from "./records.js";
import { detail, rejected, stateA, stateB, versionHarness } from "./version-test-support.js";
import { clickVersionButton, mountVersionView, versionAct } from "./version-view-support.js";

const baseBody = 'labels: ["Person"]\nproperties: {"name": "Alice"}\n';
const knowledgeKind = "knowledge-node";
const patchRoute = "object/patch";
const cleanups: (() => Promise<void>)[] = [];

async function setup() {
  const setup = await versionHarness();
  setup.handlers.set("evolution/branch/list", () => ({ items: [{ name: "main", state: stateA }] }));
  setup.handlers.set("evolution/tag/list", () => ({ items: [] }));
  setup.handlers.set("evolution/get", (request) =>
    detail(
      typeof request["state"] === "string" && request["state"] !== "branch/main"
        ? request["state"]
        : stateA
    )
  );
  setup.handlers.set("object/read", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => ({
      kind: knowledgeKind,
      ref,
      value: { labels: ["Person"], properties: { name: "Alice" } }
    }))
  }));
  setup.handlers.set("object/read-text", (request) => ({
    state: request["at"],
    results: (request["refs"] as string[]).map((ref) => ({
      kind: knowledgeKind,
      ref,
      body: baseBody
    }))
  }));
  setup.handlers.set(patchRoute, () => ({
    state: stateB,
    created: [{ kind: knowledgeKind, alias: "new", ref: "n:9" }],
    transitions: [{ from: "r:1", to: "r:7" }]
  }));
  return setup;
}

async function input(id: string, value: string) {
  const field = document.getElementById(id);
  if (!(
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ))
    throw new Error(`缺少字段 ${id}`);
  await versionAct(() => {
    field.focus();
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field) as object, "value")?.set?.call(
      field,
      value
    );
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })
    );
  });
}

function dispose(records: Records, close: () => Promise<void>, draft?: ObjectDraft) {
  cleanups.push(async () => {
    await close();
    draft?.dispose();
    records.stop();
  });
}
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
  document.body.replaceChildren();
});

it("requires concrete Patch confirmation, sends once, displays actual receipt and keeps old context until explicit navigation", async () => {
  const setupData = await setup();
  const onCommitted = vi.fn();
  const view = await mountVersionView(
    <KnowledgeEditor {...setupData} ref="n:1" onClose={() => undefined} onCommitted={onCommitted} />
  );
  dispose(setupData.records, view.close);
  await input(fieldId("n:1", ["properties", "name"]), '"Bob"');
  await clickVersionButton("查看 Patch");
  expect(view.host.textContent).toContain("前端检查通过");
  expect(view.host.textContent).toContain(stateA);
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
  await clickVersionButton("确认提交到 main");
  expect(setupData.calls.filter((call) => call.route === patchRoute)).toHaveLength(1);
  expect(onCommitted).toHaveBeenCalledOnce();
  expect(view.host.textContent).toContain("知识已提交 · 回执已保存");
  expect(view.host.textContent).toContain("alias new → n:9");
  expect(view.host.textContent).toContain("r:1 → r:7");
  expect(setupData.context.state).toBe(stateA);
  await clickVersionButton("查看返回 State");
  expect(setupData.context.state).toBe(stateB);
  await clickVersionButton("显式刷新 Branch");
  expect(setupData.context.state).toBe(stateA);
});

it("announces local errors, focuses their summary and persists invalid full YAML before normal close", async () => {
  const setupData = await setup();
  const close = vi.fn();
  const view = await mountVersionView(
    <ObjectEditorModal {...setupData} ref="n:1" onClose={close} />
  );
  dispose(setupData.records, view.close);
  await input(`yaml-${encodeURIComponent("n:1")}`, "{ unfinished");
  await clickVersionButton("查看 Patch");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("前端检查失败");
  expect(view.host.textContent).toContain("前端检查失败");
  await clickVersionButton("返回编辑");
  await clickVersionButton("关闭对象草稿");
  expect(view.host.textContent).toContain("尚未确认保存的输入");
  await clickVersionButton("继续编辑");
  expect(close).not.toHaveBeenCalled();
  await clickVersionButton("保存草稿");
  expect(setupData.records.slots[0]?.confirmed?.data).toMatchObject({
    entries: [{ body: "{ unfinished" }]
  });
  await clickVersionButton("关闭对象草稿");
  expect(close).toHaveBeenCalledOnce();
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
});

it("adds explicit multiple targets and new alias kinds, and keeps deletion confined to the reviewed Patch", async () => {
  const setupData = await setup();
  const view = await mountVersionView(
    <ObjectEditorModal {...setupData} ref="n:1" onClose={() => undefined} />
  );
  dispose(setupData.records, view.close);
  const id = setupData.records.slots[0]?.id ?? "";
  await input(`target-ref-${id}`, "n:2");
  await clickVersionButton("加入已有对象");
  expect((setupData.records.slots[0]?.data["entries"] as unknown[]).length).toBe(2);
  await input(`new-kind-${id}`, "knowledge-relationship");
  await input(`alias-${id}`, "edge");
  await clickVersionButton("新增关系");
  await input(fieldId("new:knowledge-relationship:edge", ["type"]), "LINK");
  await input(fieldId("new:knowledge-relationship:edge", ["start"]), "n:1");
  await input(fieldId("new:knowledge-relationship:edge", ["end"]), "n:2");
  await clickVersionButton("查看 Patch");
  expect(view.host.textContent).toContain("3 个明确 target");
  await clickVersionButton("返回编辑");
  await clickVersionButton("移除新增对象");
  await clickVersionButton("删除对象");
  await clickVersionButton("查看 Patch");
  expect(view.host.textContent).toContain("incident");
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
  await clickVersionButton("返回编辑");
  await clickVersionButton("保留对象");
});

it("restores pending drafts for inspection only and offers bounded reconciliation without resending", async () => {
  const setupData = await setup();
  const data = draftData({
    baseState: stateA,
    branch: "main",
    entries: [
      {
        kind: knowledgeKind,
        ref: "n:1",
        base: baseBody,
        body: baseBody.replace("Alice", "Bob"),
        deleted: false
      }
    ],
    inputs: {},
    status: "pending",
    patch: "frozen pending bytes",
    receipt: undefined
  });
  const slot = setupData.records.add("draft", data);
  setupData.handlers.set("evolution/history", () => ({
    root: stateA,
    items: [{ state: stateB, parents: [stateA], change: null }]
  }));
  const view = await mountVersionView(
    <ObjectEditorModal {...setupData} ref={undefined} slot={slot} onClose={() => undefined} />
  );
  dispose(setupData.records, view.close);
  expect(view.host.textContent).toContain("写入结果待核对");
  expect(view.host.querySelector<HTMLTextAreaElement>(".yaml-editor")?.disabled).toBe(true);
  await clickVersionButton("核对 Branch / 对象 / 历史");
  expect(view.host.textContent).toContain("不能推断正式 Ref");
  expect(view.host.textContent).toContain("有界范围");
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
});

it("requires manual source rebuilding for stale drafts, preserving the old input for comparison", async () => {
  const setupData = await setup();
  const old = setupData.records.add(
    "draft",
    draftData({
      baseState: stateB,
      branch: "main",
      entries: [
        {
          kind: knowledgeKind,
          ref: "n:1",
          base: baseBody,
          body: baseBody.replace("Alice", "old input"),
          deleted: false
        }
      ],
      inputs: {},
      status: "editing",
      patch: "",
      receipt: undefined
    })
  );
  const view = await mountVersionView(
    <ObjectEditorModal {...setupData} ref="n:1" slot={old} onClose={() => undefined} />
  );
  dispose(setupData.records, view.close);
  expect(view.host.textContent).toContain("STALE_BASE_STATE");
  await clickVersionButton("对照新基底手动重建");
  expect(view.host.textContent).toContain("原草稿 · 手动对照迁移");
  expect(view.host.textContent).toContain("old input");
  expect(view.host.querySelector<HTMLTextAreaElement>(".yaml-editor")?.value).toBe(baseBody);
  expect(setupData.records.slots).toHaveLength(2);
});

function savedInput(text: string) {
  return draftData({
    baseState: stateA,
    branch: "main",
    entries: [
      {
        kind: knowledgeKind,
        ref: "n:1",
        base: baseBody,
        body: baseBody.replace("Alice", text),
        deleted: false
      }
    ],
    inputs: {},
    status: "editing",
    patch: "",
    receipt: undefined
  });
}

it("restores matching confirmed drafts, ignores other sources and handles malformed saved tasks without replacing input", async () => {
  const setupData = await setup();
  setupData.records.add("draft", { version: 1, subtype: "merge" });
  setupData.records.add("draft", { ...savedInput("old source"), baseState: stateB });
  setupData.records.add("draft", { ...savedInput("old receipt"), status: "committed" });
  const saved = setupData.records.add("draft", savedInput("saved local input"));
  await saved.flush();
  const malformed = setupData.records.add("draft", {
    ...savedInput("invalid record"),
    entries: [null]
  });
  const view = await mountVersionView(
    <KnowledgeEditor {...setupData} ref="n:1" onClose={() => undefined} />
  );
  dispose(setupData.records, view.close);
  expect(view.host.querySelector<HTMLTextAreaElement>(".yaml-editor")?.value).toContain(
    "saved local input"
  );
  expect(setupData.records.slots).toHaveLength(5);
  await clickVersionButton(`main · editing · ${malformed.id.slice(0, 8)}`);
  expect(view.host.textContent).toContain("草稿格式无法读取");
  expect(saved.data).toEqual(savedInput("saved local input"));
  await clickVersionButton(`main · editing · ${saved.id.slice(0, 8)}`);
  expect(view.host.querySelector<HTMLTextAreaElement>(".yaml-editor")?.value).toContain(
    "saved local input"
  );
});

it("keeps an unavailable-store local draft until an explicit close choice and reports malformed initial records", async () => {
  const setupData = await setup();
  const close = vi.fn();
  setupData.connection.info = { daemonBootId: "boot", storageStatus: "unavailable" };
  const view = await mountVersionView(
    <KnowledgeEditor
      connection={setupData.connection}
      context={setupData.context}
      records={undefined}
      ref={undefined}
      onClose={close}
    />
  );
  dispose(setupData.records, view.close);
  expect(view.host.textContent).toContain("Web 保存库不可写");
  await clickVersionButton("关闭对象草稿");
  expect(view.host.textContent).toContain("尚未确认保存的输入");
  await clickVersionButton("保存后关闭");
  expect(close).not.toHaveBeenCalled();
  await clickVersionButton("关闭并保留已保存版本");
  expect(close).toHaveBeenCalledOnce();
  const slot = setupData.records.add("draft", { version: 1, subtype: "object", entries: [null] });
  const broken = await mountVersionView(
    <ObjectEditorModal {...setupData} ref={undefined} slot={slot} onClose={close} />
  );
  cleanups.push(broken.close);
  expect(broken.host.textContent).toContain("草稿缺少明确 Branch");
});

it("keeps failed save/delete choices open and only closes after a reliable explicit save", async () => {
  const setupData = await setup();
  const close = vi.fn();
  const view = await mountVersionView(<KnowledgeEditor {...setupData} ref="n:1" onClose={close} />);
  dispose(setupData.records, view.close);
  await input(fieldId("n:1", ["properties", "name"]), '"pending input"');
  setupData.handlers.set("web/data/save", () => rejected("RESOURCE_ERROR"));
  await clickVersionButton("关闭对象草稿");
  await clickVersionButton("保存后关闭");
  expect(close).not.toHaveBeenCalled();
  expect(view.host.textContent).toContain("Web 保存：");
  await clickVersionButton("继续编辑");
  await clickVersionButton("放弃草稿");
  await clickVersionButton("确认放弃草稿");
  expect(view.host.textContent).toContain("草稿删除未获得确认");
  expect(close).not.toHaveBeenCalled();
  await clickVersionButton("继续保留草稿");
  setupData.handlers.delete("web/data/save");
  await clickVersionButton("关闭对象草稿");
  await clickVersionButton("保存后关闭");
  expect(close).toHaveBeenCalledOnce();
});

it("rejects duplicate targets and invalid aliases, creates blank aliases explicitly, and links field errors to their controls", async () => {
  const setupData = await setup();
  const view = await mountVersionView(
    <KnowledgeEditor {...setupData} ref="n:1" onClose={() => undefined} />
  );
  dispose(setupData.records, view.close);
  const id = setupData.records.slots[0]?.id ?? "";
  await input(`target-ref-${id}`, "n:1");
  await clickVersionButton("加入已有对象");
  expect(view.host.textContent).toContain("target 已在草稿内");
  await input(`alias-${id}`, "bad\u0000alias");
  await clickVersionButton("新增节点");
  expect(view.host.textContent).toContain("alias");
  expect(setupData.records.slots).toHaveLength(1);
  await input(`alias-${id}`, "");
  await clickVersionButton("新增节点");
  expect(view.host.textContent).toContain("2 个对象");
  await clickVersionButton("移除新增对象");
  await input(fieldId("n:1", ["properties", "name"]), "null");
  await clickVersionButton("查看 Patch");
  const link = view.host.querySelector<HTMLAnchorElement>(".patch-review a");
  await versionAct(() => {
    link?.click();
  });
  expect(document.activeElement?.id).toBe(fieldId("n:1", ["properties", "name"]));
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
});

it("deletes only the explicit Web draft after its confirmation and leaves Knowledge untouched", async () => {
  const setupData = await setup();
  const close = vi.fn();
  setupData.handlers.set("web/data/delete", (request) => ({
    id: request["id"],
    kind: "draft",
    revision: "2",
    deleted: true,
    data: null,
    lastMutationId: request["mutationId"]
  }));
  const view = await mountVersionView(
    <KnowledgeEditor {...setupData} ref={undefined} onClose={close} />
  );
  dispose(setupData.records, view.close);
  await clickVersionButton("放弃草稿");
  expect(view.host.textContent).toContain("不修改 Knowledge State");
  await clickVersionButton("继续保留草稿");
  expect(close).not.toHaveBeenCalled();
  await clickVersionButton("放弃草稿");
  await clickVersionButton("确认放弃草稿");
  expect(close).toHaveBeenCalledOnce();
  expect(setupData.records.slots[0]?.status).toBe("已删除");
  expect(setupData.calls.some((call) => call.route === patchRoute)).toBe(false);
});

function Review({ draft }: { draft: ObjectDraft }) {
  useSyncExternalStore(draft.subscribe, draft.snapshot);
  return (
    <>
      <DraftReview draft={draft} />
      <DraftReceipt draft={draft} />
      <DraftDiagnostics draft={draft} />
    </>
  );
}

it("reports actual no-op and knowledge-success/Web-save-failure separately and retries only receipt storage", async () => {
  const setupData = await setup();
  const draft = new ObjectDraft(setupData.connection, setupData.context, setupData.records);
  await draft.start("n:1");
  setupData.handlers.set(patchRoute, () => {
    setupData.handlers.set("web/data/save", () => rejected("RESOURCE_ERROR"));
    return { state: stateA, created: [], transitions: [] };
  });
  draft.preview();
  const view = await mountVersionView(<Review draft={draft} />);
  dispose(setupData.records, view.close, draft);
  await clickVersionButton("确认提交到 main");
  expect(view.host.textContent).toContain("无变化 · no-op");
  expect(view.host.textContent).toContain("知识已提交，Web 回执未保存");
  setupData.handlers.delete("web/data/save");
  await clickVersionButton("重试保存回执");
  expect(view.host.textContent).toContain("回执已保存");
  expect(setupData.calls.filter((call) => call.route === patchRoute)).toHaveLength(1);
});
