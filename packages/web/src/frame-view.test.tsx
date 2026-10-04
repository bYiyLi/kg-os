// @vitest-environment happy-dom
import { type JsonValue } from "@kgos/sdk";
import { act as reactAct } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Connection } from "./connection.js";
import { Context } from "./context.js";
import { Frame, type FrameSnapshot } from "./frame.js";
import { FrameEngine } from "./frame-engine.js";
import { FrameView } from "./frame-view.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}
function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing frame control");
  return value;
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let frame: Frame;
let engine: FrameEngine;
let context: Context;
const original = "commit/original";
const snapshot: FrameSnapshot = {
  mode: "query",
  statement: "RETURN n",
  params: {},
  inputRef: "branch/main",
  readState: original
};
const node = (id: number) => ({
  $type: "Node",
  elementId: `n:${String(id)}`,
  labels: ["Model"],
  properties: { name: `节点 ${String(id)}` }
});
const onCopy = vi.fn<(value: Frame) => void>();
const onEdit = vi.fn<(ref?: string, state?: string) => void>();

async function setup(request = snapshot) {
  const fetcher = vi.fn<typeof fetch>((input, init) => {
    const path = input instanceof Request ? input.url : input.toString();
    if (path.endsWith("/info"))
      return Promise.resolve(Response.json({ daemonBootId: "boot", storageStatus: "unavailable" }));
    if (path.endsWith("/object/read"))
      return Promise.resolve(
        Response.json({ state: original, results: [{ value: { name: "公共对象" } }] })
      );
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected JSON request");
    const at = (JSON.parse(body) as { at?: string }).at ?? original;
    return Promise.resolve(
      new Response(
        `${JSON.stringify({ type: "columns", columns: [] })}\n${JSON.stringify({ type: "summary", state: at })}\n`,
        { headers: { "Content-Type": "application/x-ndjson" } }
      )
    );
  });
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  context = new Context(connection);
  context.state = "commit/current";
  engine = new FrameEngine(connection, () => undefined);
  frame = new Frame(request);
  frame.status = "complete";
  frame.append([node(0), node(1)], () => true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(
      <FrameView frame={frame} engine={engine} context={context} onCopy={onCopy} onEdit={onEdit} />
    );
  });
  return fetcher;
}
async function click(text: string) {
  await act(() => {
    required(
      [...container.querySelectorAll("button")].find((button) => button.textContent === text)
    ).click();
  });
}
afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  frame.invalidate();
  engine.cancelAll();
  vi.clearAllMocks();
  document.body.replaceChildren();
});

it("keeps fullscreen camera and selection and returns keyboard focus to its original trigger", async () => {
  await setup();
  await act(() => {
    frame.camera = { x: 10, y: 20, zoom: 2 };
    frame.selected = "n:0";
    frame.changed();
  });
  const trigger = required(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "全屏")
  );
  trigger.focus();
  await click("全屏");
  expect(container.querySelector("dialog")?.open).toBe(true);
  expect(frame.camera).toEqual({ x: 10, y: 20, zoom: 2 });
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector("dialog")).toBeNull();
  expect(frame.selected).toBe("n:0");
  expect(frame.camera).toEqual({ x: 10, y: 20, zoom: 2 });
  expect(document.activeElement).toBe(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "全屏")
  );
});

it("reruns at the original or explicitly current State and copies without replacing the old frame", async () => {
  await setup();
  await click("按原 State 重跑");
  await click("按当前 State 新跑");
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(engine.frames.map((item) => item.request.readState)).toEqual(["commit/current", original]);
  expect(frame.request).toEqual(snapshot);
  expect(frame.rowCount).toBe(1);
  await click("复制到新查询");
  expect(onCopy).toHaveBeenCalledWith(frame);
  expect(engine.frames).toHaveLength(2);
});

it("collapses a running frame without cancelling and closes by aborting only that frame", async () => {
  await setup();
  const controller = new AbortController();
  await act(() => {
    frame.status = "running";
    frame.controller = controller;
    frame.changed();
  });
  await click("折叠");
  expect(container.querySelector(".frame-body")).toBeNull();
  expect(controller.signal.aborted).toBe(false);
  expect(frame.active).toBe(true);
  await click("展开");
  expect(container.querySelector(".frame-body")).not.toBeNull();
  await click("取消并关闭");
  expect(controller.signal.aborted).toBe(true);
  expect(frame.closed).toBe(true);
  expect(frame.status).toBe("cancelled");
  expect(container.querySelector(".query-frame")).toBeNull();
});

it("pages keyboard object navigation, reads public details at frame State, and enables editing on success", async () => {
  const fetcher = await setup();
  await act(() => {
    frame.append(
      Array.from({ length: 23 }, (_, index) => node(index + 2)),
      () => true
    );
    frame.changed();
  });
  expect(container.querySelectorAll(".object-list button")).toHaveLength(20);
  await click("下一组对象");
  expect(container.querySelectorAll(".object-list button")).toHaveLength(5);
  await click("上一组对象");
  await click("n:0 · 节点 0");
  expect(frame.detail).toEqual({ name: "公共对象" });
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain(`"at":"${original}"`);
  await click("编辑对象");
  expect(onEdit).toHaveBeenCalledWith("n:0", original);
  await click("扩展邻居（最多 50 行）");
  expect(fetcher.mock.calls[2]?.[1]?.body).toContain("LIMIT 50");
  const neighbor = new AbortController();
  await act(() => {
    frame.neighborController = neighbor;
    frame.neighborLoading = true;
    frame.changed();
  });
  await click("取消展开");
  expect(neighbor.signal.aborted).toBe(true);
  expect(frame.neighborLoading).toBe(false);
});

it("keeps JSON rendering local and exposes evicted metadata with an explicit cache action", async () => {
  await setup();
  await click("JSON / 行");
  expect(frame.view).toBe("json");
  expect(container.querySelector('[aria-label="原始 JSON 结果"]')).not.toBeNull();
  await click("图谱");
  expect(frame.view).toBe("graph");
  const load = vi.spyOn(engine, "loadCache").mockResolvedValue();
  await act(() => {
    frame.releaseRows();
  });
  expect(container.textContent).toContain("原计数 1 行");
  expect(load).not.toHaveBeenCalled();
  await click("加载完整缓存");
  expect(load).toHaveBeenCalledWith(frame);
  await act(() => {
    frame.error = "部分结果";
    frame.changed();
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toBe("部分结果");
});

it("shows actual execute summary and counters and explores only via a new read frame", async () => {
  await setup({
    mode: "execute",
    statement: "CREATE (n)",
    params: {},
    inputRef: "branch/main",
    branch: "main",
    observedHead: "commit/observed"
  });
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "在结果 State 新建只读帧"
    )?.disabled
  ).toBe(true);
  await click("复制并再次执行");
  expect(onCopy).toHaveBeenCalledWith(frame);
  await act(() => {
    frame.resultState = "commit/result";
    frame.counters = { created: 2 };
    frame.changed();
  });
  expect(container.textContent).toContain("commit/result");
  expect(container.textContent).toContain('"created": 2');
  await click("在结果 State 新建只读帧");
  await vi.waitFor(() => {
    expect(engine.active).toBe(0);
  });
  expect(engine.frames[0]?.request).toMatchObject({ mode: "query", readState: "commit/result" });
  expect(onEdit).not.toHaveBeenCalled();
  await click("关闭");
  expect(frame.status).toBe("complete");
});

it("shows typed relationship details and unloaded endpoint labels without allowing unsupported edits", async () => {
  await setup();
  await act(() => {
    frame.append(
      [
        {
          $type: "Relationship",
          elementId: "r:0",
          type: "LINK",
          start: "n:0",
          end: "n:9",
          properties: { point: { $type: "Point", srid: 4326, coordinates: [1, 2] } }
        }
      ],
      () => true
    );
    frame.selected = "r:0";
    frame.detailError = "UNSUPPORTED_OPERATION";
    frame.neighborError = "展开失败";
    frame.changed();
  });
  const inspector = required(container.querySelector("aside"));
  expect(inspector.textContent).toContain("Type：LINK");
  expect(inspector.textContent).toContain("n:0 → n:9");
  expect(inspector.textContent).toContain('"srid": 4326');
  expect(inspector.textContent).toContain("UNSUPPORTED_OPERATION");
  expect(inspector.textContent).toContain("展开失败");
  expect(
    [...inspector.querySelectorAll("button")].some(
      (button) => button.textContent === "扩展邻居（最多 50 行）"
    )
  ).toBe(false);
  await act(() => {
    frame.selected = "n:9";
    frame.changed();
  });
  expect(inspector.textContent).toContain("端点未加载");
  expect(
    [...inspector.querySelectorAll("button")].find((button) => button.textContent === "编辑对象")
      ?.disabled
  ).toBe(true);
});

it("updates page-budget visibility from intersection notifications and disconnects its observer", async () => {
  let callback: IntersectionObserverCallback | undefined;
  const observers: IntersectionObserver[] = [];
  const disconnect = vi.fn();
  class Visibility implements IntersectionObserver {
    readonly root = null;
    readonly rootMargin = "200px";
    readonly thresholds = [0];
    constructor(handler: IntersectionObserverCallback) {
      callback = handler;
      observers.push(this);
    }
    readonly observe = vi.fn<(target: Element) => void>();
    readonly unobserve = vi.fn<(target: Element) => void>();
    readonly disconnect = disconnect;
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", Visibility);
  await setup();
  required(callback)(
    [{ isIntersecting: false } as IntersectionObserverEntry],
    required(observers[0])
  );
  expect(frame.visible).toBe(false);
  required(callback)([], required(observers[0]));
  expect(frame.visible).toBe(true);
  await act(() => {
    root?.unmount();
  });
  root = undefined;
  expect(disconnect).toHaveBeenCalledOnce();
  vi.unstubAllGlobals();
});

it("shows original row and same-State object JSON in their frame without numeric re-encoding", async () => {
  const fetcher = await setup();
  const source = '[ 1.0, 1, -0.0, {"nested":[9007199254740993,1e400]} ]';
  await act(() => {
    frame.append(JSON.parse(source) as JsonValue[], () => true, false, source);
    frame.changed();
  });
  await click("JSON / 行");
  expect([...container.querySelectorAll(".rows-view .value-view pre")].at(-1)?.textContent).toBe(
    source
  );
  await click("图谱");
  const detail =
    '{ "labels":[], "properties":{"float":1.0,"integer":1,"zero":-0.0,"big":{"$type":"Integer","value":"9007199254740993"}} }';
  fetcher.mockResolvedValueOnce(
    new Response(
      `{"state":"${original}","results":[{"kind":"knowledge-node","ref":"n:0","value":${detail}}]}`,
      { headers: { "Content-Type": "application/json" } }
    )
  );
  await click("n:0 · 节点 0");
  expect(frame.detailSource).toBe(detail);
  expect(container.querySelector("aside .value-view pre")?.textContent).toBe(detail);
  expect(context.state).toBe("commit/current");
});
