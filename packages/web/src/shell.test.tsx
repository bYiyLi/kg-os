// @vitest-environment happy-dom
import { type WebRecord } from "@kgos/sdk";
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Frame } from "./frame.js";
import { Records } from "./records.js";
import { Shell } from "./shell.js";
import { Workspace } from "./workspace.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing shell control");
  return value;
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let workspace: Workspace;
const state = "commit/original";
const historical = "commit/historical";

async function setup(supplied = true, resolvedState = state) {
  const info = vi.fn<() => Response>(() =>
    Response.json({
      daemonBootId: "boot",
      storageStatus: "unavailable",
      error: { code: "RESOURCE_ERROR", message: "保存不可用" }
    })
  );
  const fetcher = vi.fn<typeof fetch>((input) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info")) return Promise.resolve(info());
    if (path.endsWith("/get"))
      return Promise.resolve(Response.json({ state: resolvedState, parents: [], hasData: false }));
    if (path.endsWith("/branch/list"))
      return Promise.resolve(Response.json({ items: [{ name: "main", state: resolvedState }] }));
    if (path.endsWith("/tag/list")) return Promise.resolve(Response.json({ items: [] }));
    if (path.endsWith("/ancestry"))
      return Promise.resolve(Response.json({ root: resolvedState, items: [] }));
    return Promise.resolve(Response.json({ items: [] }));
  });
  workspace = new Workspace("http://127.0.0.1:42", fetcher);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(supplied ? <Shell workspace={workspace} /> : <Shell />);
  });
  return { info, fetcher };
}
async function click(text: string) {
  await act(() => {
    required(
      [...container.querySelectorAll("button")].find((item) => item.textContent === text)
    ).click();
  });
}
async function input(selector: string, text: string) {
  const element = required(
    container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  );
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  workspace.disconnect();
  workspace.records?.stop();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("renders the disconnected product workflow and opens the usage modal", async () => {
  await setup(false);
  expect(container.textContent).toContain("KG OS");
  expect(container.textContent).toContain("在图谱中开始探索");
  expect(container.textContent).toContain("未连接");
  expect(container.querySelector<HTMLButtonElement>(".query-editor .primary")?.disabled).toBe(true);
  await click("使用说明");
  expect(container.querySelector("dialog")?.textContent).toContain("每次运行创建独立结果帧");
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector("dialog")).toBeNull();
});

it("connects explicitly, clears the entered credential, and retains inputs when disconnected", async () => {
  const { fetcher } = await setup();
  await input("#statement", "RETURN local");
  await click("连接 Runtime");
  expect(container.querySelector<HTMLInputElement>("#credential")?.type).toBe("password");
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "连接")
      ?.disabled
  ).toBe(true);
  await input("#credential", "opaque-secret");
  await click("连接");
  expect(workspace.connection.client).toBeDefined();
  expect(container.querySelector("dialog")).toBeNull();
  expect(workspace.context.state).toBe(state);
  expect(container.textContent).toContain("保存不可用");
  expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get("Authorization")).toBe(
    "Bearer opaque-secret"
  );
  expect(workspace.editorData()).not.toHaveProperty("token");
  expect(workspace.statement).toBe("RETURN local");
  await click("断开");
  expect(workspace.connection.client).toBeUndefined();
  expect(workspace.statement).toBe("RETURN local");
  expect(container.textContent).toContain("未连接");
});

it("keeps entered statement and parameters through a rejected credential and supports closing the dialog", async () => {
  const { info } = await setup();
  await input("#statement", "RETURN original");
  await input("#params", "{");
  info.mockReturnValueOnce(
    Response.json({ code: "AUTHENTICATION_FAILED", message: "invalid" }, { status: 401 })
  );
  await click("连接 Runtime");
  await input("#credential", "invalid-token");
  await click("连接");
  expect(workspace.connection.client).toBeUndefined();
  expect(workspace.statement).toBe("RETURN original");
  expect(workspace.paramsText).toBe("{");
  expect(container.querySelector<HTMLInputElement>("#credential")?.value).toBe("");
  expect(container.querySelector("dialog")?.textContent).toContain("凭证不可用");
  await click("暂不连接");
  expect(container.querySelector("dialog")).toBeNull();
});

it("warns on leave only while records contain unconfirmed input and removes listeners on unmount", async () => {
  await setup();
  const clean = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  workspace.records = new Records(workspace.connection, "store");
  const slot = workspace.records.add("editor", { statement: "pending" });
  const dirty = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(dirty);
  expect(dirty.defaultPrevented).toBe(true);
  slot.confirmed = {
    kind: "editor",
    id: slot.id,
    revision: "1",
    deleted: false,
    lastMutationId: "saved",
    data: slot.data
  };
  const saved = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(saved);
  expect(saved.defaultPrevented).toBe(false);
  slot.edit({ statement: "another" });
  await act(() => {
    root?.unmount();
  });
  root = undefined;
  const unmounted = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(unmounted);
  expect(unmounted.defaultPrevented).toBe(false);
});

it("keeps pinned State while refs move and surfaces missing and failed contexts locally", async () => {
  await setup();
  await act(() => {
    workspace.context.state = state;
    workspace.context.branches = [{ name: "main", state: "commit/new" }];
    workspace.context.observedAt = Date.now();
    workspace.changed();
  });
  expect(container.textContent).toContain("引用目标已变化");
  expect(workspace.context.state).toBe(state);
  expect(
    [...container.querySelectorAll("button")].some(
      (button) => button.textContent === "显式加载最新目标"
    )
  ).toBe(true);
  await act(() => {
    workspace.context.branches = [];
    workspace.context.tags = [{ name: "release", state }];
    workspace.context.observationError = "ref offline";
    workspace.changed();
  });
  expect(container.textContent).toContain("引用已不存在");
  expect(container.textContent).toContain("引用信息可能过期：ref offline");
  expect(container.querySelector('option[value="tag/release"]')).not.toBeNull();
  await act(() => {
    workspace.context.switchError = "missing state";
    workspace.changed();
  });
  expect(container.textContent).toContain("版本解析失败");
  await click("恢复原上下文");
  expect(workspace.context.switchError).toBe("");
});

it("switches knowledge and ontology tabs without changing the browsing State", async () => {
  await setup();
  workspace.context.state = state;
  await click("本体图谱");
  expect(workspace.tab).toBe("ontology");
  expect(workspace.context.state).toBe(state);
  await click("知识图谱");
  expect(workspace.tab).toBe("knowledge");
  expect(container.querySelector("#statement")).not.toBeNull();
});

it("copies an existing frame into the editor and opens historical object editing at that frame's State", async () => {
  const { fetcher } = await setup();
  const base = required(fetcher.getMockImplementation());
  fetcher.mockImplementation((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/read-text")) {
      const body = init?.body;
      if (typeof body !== "string") throw new Error("Expected object request");
      const request = JSON.parse(body) as { at: string };
      return Promise.resolve(
        Response.json({
          state: request.at,
          results: [{ kind: "knowledge-node", ref: "n:0", body: "labels: []\nproperties: {}\n" }]
        })
      );
    }
    return base(input, init);
  });
  await reactAct(async () => {
    await workspace.connect("opaque");
  });
  const frame = new Frame({
    mode: "query",
    statement: "RETURN $x",
    params: { x: 1, zero: -0, integer: 9007199254740992, huge: Infinity },
    paramsText: '{ "x": 1.0, "zero": -0.0, "integer": 9007199254740993, "huge": 1e400 }',
    inputRef: "tag/old",
    readState: historical
  });
  frame.status = "complete";
  frame.append([{ $type: "Node", elementId: "n:0", labels: [], properties: {} }], () => true);
  frame.selected = "n:0";
  frame.detail = { labels: [], properties: {} };
  await act(() => {
    workspace.engine.frames.push(frame);
    workspace.engine.changed();
  });
  expect(container.querySelector('pre[aria-label="参数"]')?.textContent).toBe(
    frame.request.paramsText
  );
  await click("复制到新查询");
  expect(workspace.statement).toBe("RETURN $x");
  expect(workspace.paramsText).toBe(frame.request.paramsText);
  expect(workspace.context.state).toBe(state);
  await click("编辑对象");
  expect(container.querySelector("dialog")?.textContent).toContain(historical);
  expect(workspace.context.state).toBe(state);
  expect(frame.state).toBe(historical);
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector("dialog")).toBeNull();
});

it("opens a new object task using the current editable Branch while keeping persistence failures local", async () => {
  await setup();
  await reactAct(async () => {
    await workspace.connect("opaque");
  });
  expect(workspace.context.editable).toBe(true);
  await click("新建知识对象");
  expect(container.querySelector("dialog")?.textContent).toContain("对象草稿");
  expect(container.querySelector("dialog")?.textContent).toContain(state);
  expect(container.querySelector("dialog")?.textContent).toContain("Web 保存库不可写");
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.textContent).toContain("尚未确认保存的输入");
  await click("关闭并保留已保存版本");
  expect(container.querySelector("dialog")).toBeNull();
  await act(() => {
    workspace.error = "本窗口输入保留";
    workspace.connection.info = { daemonBootId: "boot", storageStatus: "mismatch" };
    workspace.changed();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("本窗口输入保留");
  expect(container.textContent).toContain("当前保存不可用，已输入内容留在本窗口");
});

it("selects an explicitly entered version and loads ref updates only after its manual action", async () => {
  const { fetcher } = await setup();
  await reactAct(async () => {
    await workspace.connect("opaque");
  });
  await input('[aria-label="浏览版本"]', "tag/release");
  await click("选择版本");
  expect(workspace.context.inputRef).toBe("tag/release");
  expect(fetcher.mock.calls.some(([, init]) => init?.body === '{"state":"tag/release"}')).toBe(
    true
  );
  await click("检查更新");
  await act(() => {
    workspace.context.inputRef = "branch/main";
    workspace.context.branches = [{ name: "main", state: "commit/advanced" }];
    workspace.changed();
  });
  expect(workspace.context.state).toBe(state);
  await click("显式加载最新目标");
  expect(workspace.context.inputRef).toBe("branch/main");
  expect(workspace.context.state).toBe(state);
});

it("observes on focus, backs off failed ref polling, and pauses while hidden", async () => {
  await setup();
  vi.useFakeTimers();
  const observe = vi.spyOn(workspace.context, "observe").mockResolvedValue();
  await reactAct(async () => {
    await workspace.connection.connect("opaque");
  });
  expect(observe).toHaveBeenCalledOnce();
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(observe).toHaveBeenCalledTimes(2);
  workspace.context.observationError = "offline";
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(15000);
  });
  expect(observe).toHaveBeenCalledTimes(3);
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(29999);
  });
  expect(observe).toHaveBeenCalledTimes(3);
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(observe).toHaveBeenCalledTimes(4);
  const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
  await act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await reactAct(async () => {
    await vi.advanceTimersByTimeAsync(240000);
  });
  expect(observe).toHaveBeenCalledTimes(4);
  visibility.mockReturnValue("visible");
  workspace.context.observationError = "";
  await act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  expect(observe).toHaveBeenCalledTimes(5);
});

it("loads the next saved-frame page into independent frames without rerunning requests", async () => {
  const { fetcher } = await setup();
  const saved: WebRecord = {
    kind: "frame",
    id: "second-page-frame",
    revision: "9007199254740993",
    lastMutationId: "saved",
    deleted: false,
    data: {
      mode: "query",
      statement: "RETURN saved",
      params: {},
      readState: historical,
      inputRef: "tag/old",
      status: "complete",
      rowCount: 42,
      camera: { x: 10, y: 20, zoom: 2 }
    }
  };
  const base = required(fetcher.getMockImplementation());
  fetcher.mockImplementation((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/data/list")) {
      const body = init?.body;
      if (typeof body !== "string") throw new Error("Expected list request");
      expect(JSON.parse(body)).toEqual({
        storeId: "store",
        kind: "frame",
        limit: 50,
        cursor: "after-first-page"
      });
      return Promise.resolve(Response.json({ items: [saved] }));
    }
    if (path.endsWith("/data/read")) return Promise.resolve(Response.json(saved));
    return base(input, init);
  });
  await reactAct(async () => {
    await workspace.connect("opaque");
    workspace.records = new Records(workspace.connection, "store");
    for (let index = 0; index < 50; index++)
      workspace.records.add("frame", saved.data ?? {}, {
        ...saved,
        id: `first-page-${String(index)}`
      });
    workspace.engine.restore();
    workspace.records.cursors.set("frame", "after-first-page");
    workspace.changed();
  });
  await reactAct(async () => {
    required(
      [...container.querySelectorAll("button")].find(
        (button) => button.textContent === "加载更多保存的帧"
      )
    ).click();
    await vi.waitFor(() => {
      expect(workspace.records?.error).toBe("");
      expect(workspace.engine.frames).toHaveLength(51);
    });
  });
  expect(workspace.engine.frames[0]).toMatchObject({
    restored: true,
    rowCount: 42,
    camera: { x: 10, y: 20, zoom: 2 }
  });
  expect(workspace.engine.frames[0]?.request.statement).toBe("RETURN saved");
  expect(workspace.engine.frames[0]?.state).toBe(historical);
  expect(workspace.statement).toBe("MATCH (n) RETURN n LIMIT 50");
  expect(container.textContent).toContain("RETURN saved");
  expect(
    fetcher.mock.calls.some(([input]) =>
      (input instanceof Request ? input.url : input.toString()).includes("/graph/")
    )
  ).toBe(false);
});

it("opens a saved object draft from a read-only context, retaining its original base and unfinished input without sending Patch", async () => {
  const baseState = `commit/${"a".repeat(64)}`;
  const { info, fetcher } = await setup(true, baseState);
  info.mockImplementation(() =>
    Response.json({ daemonBootId: "boot", storageStatus: "ready", storeId: "store" })
  );
  const canonical = "labels: []\nproperties: {}\n";
  const unfinished = "labels: []\nproperties: { unfinished\n";
  const saved: WebRecord = {
    kind: "draft",
    id: "saved-draft",
    revision: "2",
    lastMutationId: "saved",
    deleted: false,
    data: {
      version: 1,
      subtype: "object",
      branch: "main",
      baseState,
      entries: [
        { kind: "knowledge-node", ref: "n:0", base: canonical, body: unfinished, deleted: false }
      ]
    }
  };
  const original = required(fetcher.getMockImplementation());
  fetcher.mockImplementation((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/read-text"))
      return Promise.resolve(
        Response.json({
          state: baseState,
          results: [{ kind: "knowledge-node", ref: "n:0", body: canonical }]
        })
      );
    return original(input, init);
  });
  await reactAct(async () => {
    await workspace.connect("opaque");
    await workspace.select(baseState);
    workspace.records?.add("draft", required(saved.data), saved);
  });
  expect(workspace.connection.writableStore).toBe(true);
  expect(workspace.context.editable).toBe(false);
  expect(container.querySelector<HTMLButtonElement>(".create-tools button")?.disabled).toBe(true);
  await act(() => {
    required(container.querySelector<HTMLElement>(".saved-drafts summary")).click();
    expect(container.querySelector<HTMLDetailsElement>(".saved-drafts")?.open).toBe(true);
    required(container.querySelector<HTMLButtonElement>(".saved-drafts button")).click();
  });
  await reactAct(async () => {
    await vi.waitFor(() => {
      expect(container.querySelector("dialog")?.textContent).toContain(baseState);
      expect(container.querySelector("dialog")?.textContent).not.toContain(
        "正在读取并核对同一 State"
      );
    });
  });
  expect(container.querySelector("dialog .object-editor strong")?.textContent).toBe("main");
  expect(container.querySelector<HTMLTextAreaElement>("dialog .yaml-editor")?.value).toBe(
    unfinished
  );
  expect(workspace.records?.slots.find((slot) => slot.id === saved.id)?.data).toEqual(saved.data);
  expect(workspace.context.inputRef).toBe(baseState);
  expect(
    fetcher.mock.calls.some(([input]) =>
      (input instanceof Request ? input.url : input.toString()).endsWith("/patch")
    )
  ).toBe(false);
});
