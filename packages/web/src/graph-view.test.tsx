// @vitest-environment happy-dom
import { act as reactAct, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Connection } from "./connection.js";
import { Frame } from "./frame.js";
import { GraphView } from "./graph-view.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}
function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("Missing graph control");
  return value;
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let frame: Frame;
const connection = new Connection("http://127.0.0.1:42");
const firstNodeSelector = '[data-node="n:0"]';
const node = (id: number) => ({
  $type: "Node",
  elementId: `n:${String(id)}`,
  labels: [],
  properties: { name: `节点 ${String(id)}` }
});
const edge = (id: number, start = "n:0", end = "n:1") => ({
  $type: "Relationship",
  elementId: `r:${String(id)}`,
  type: "LINK",
  start,
  end,
  properties: {}
});

function Graph() {
  useSyncExternalStore(frame.subscribe, frame.snapshot);
  return <GraphView frame={frame} connection={connection} />;
}
async function setup() {
  frame = new Frame({
    mode: "query",
    statement: "RETURN n",
    params: {},
    inputRef: "branch/main",
    readState: "commit/original"
  });
  frame.append([node(0), node(1), edge(0), edge(1), edge(2, "n:0", "n:0")], () => true);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(<Graph />);
  });
}
async function click(label: string) {
  const button = required(
    [...container.querySelectorAll("button")].find(
      (item) => item.getAttribute("aria-label") === label || item.textContent === label
    )
  );
  await act(() => {
    button.click();
  });
}
async function key(element: Element, value: string) {
  await act(() => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })
    );
  });
}
function measuredViewport(width = 264, height = 420) {
  let bounds = new DOMRect(0, 0, width, height);
  let notify: () => void = () => undefined;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.spyOn(SVGSVGElement.prototype, "getBoundingClientRect").mockImplementation(() => bounds);
  class Observer {
    constructor(callback: () => void) {
      notify = callback;
    }
    observe = observe;
    disconnect = disconnect;
  }
  vi.stubGlobal("ResizeObserver", Observer);
  return {
    observe,
    disconnect,
    async resize(nextWidth: number, nextHeight: number) {
      bounds = new DOMRect(0, 0, nextWidth, nextHeight);
      await act(notify);
    }
  };
}
afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  frame.invalidate();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("draws directional parallel edges and self loops with distinct selectable identities", async () => {
  await setup();
  const paths = [...container.querySelectorAll("path.edge")].map((path) => path.getAttribute("d"));
  expect(paths).toHaveLength(3);
  expect(new Set(paths).size).toBe(3);
  expect(paths[2]).toContain(" C ");
  expect(container.querySelectorAll(".edge-label")).toHaveLength(3);
  expect(container.textContent).toContain("无 Label");
  const relation = required(container.querySelector('[aria-label="r:0 LINK n:0 到 n:1"]'));
  await key(relation, "Enter");
  expect(frame.selected).toBe("r:0");
  await key(relation, " ");
  await key(relation, "Escape");
  expect(frame.selected).toBe("r:0");
  expect(container.querySelector("path.edge")?.getAttribute("marker-end")).toContain("url(#");
});

it("supports visible-node keyboard navigation and selection without cross-frame ownership", async () => {
  await setup();
  const first = required(container.querySelector<SVGGElement>(firstNodeSelector));
  const second = required(container.querySelector<SVGGElement>('[data-node="n:1"]'));
  first.focus();
  await key(first, "ArrowRight");
  expect(document.activeElement).toBe(second);
  await key(second, "ArrowLeft");
  expect(document.activeElement).toBe(first);
  await key(first, " ");
  expect(frame.selected).toBe("n:0");
  await key(second, "Enter");
  expect(frame.selected).toBe("n:1");
  await key(first, "a");
  expect(frame.selected).toBe("n:1");
  const other = new Frame(frame.request);
  expect(other.selected).toBe("");
});

it("persists explicit camera commands and fits only when requested", async () => {
  await setup();
  const original = structuredClone(frame.camera);
  await click("放大图谱");
  expect(frame.camera.zoom).toBe(1.2);
  await click("缩小图谱");
  expect(frame.camera.zoom).toBeCloseTo(1);
  await click("向左平移");
  await click("向右平移");
  await click("向上平移");
  await click("向下平移");
  expect(frame.camera).toEqual(original);
  expect(
    [...container.querySelectorAll("button")].find((item) => item.textContent === "定位选中")
      ?.disabled
  ).toBe(true);
  await act(() => {
    frame.selected = "n:0";
    frame.changed();
  });
  await click("定位选中");
  expect(frame.camera.x).toBe(required(frame.positions.get("n:0")).x - 500);
  const pinned = structuredClone(frame.camera);
  await act(() => {
    frame.append([node(2)], () => true, true);
  });
  expect(frame.camera).toEqual(pinned);
  await click("适配范围");
  expect(frame.camera.x).toBe(20);
  expect(frame.record()["camera"]).toEqual(frame.camera);
  await act(() => {
    frame.camera.zoom = 4;
    frame.changed();
  });
  await click("放大图谱");
  expect(frame.camera.zoom).toBe(4);
  await act(() => {
    frame.camera.zoom = 0.1;
    frame.changed();
  });
  await click("缩小图谱");
  expect(frame.camera.zoom).toBe(0.1);
});

it("uses CSS viewport dimensions without fitting or saving camera, selection or layout on resize", async () => {
  const sizing = measuredViewport();
  await setup();
  const svg = required(container.querySelector("svg"));
  expect(svg.getAttribute("viewBox")).toBe("0 0 264 420");
  expect(sizing.observe).toHaveBeenCalledWith(svg);
  const first = required(container.querySelector(firstNodeSelector));
  await key(first, "Enter");
  const source = frame.record();
  const persist = vi.spyOn(frame, "persist");
  await sizing.resize(640, 360);
  expect(svg.getAttribute("viewBox")).toBe("0 0 640 360");
  expect(frame.record()).toEqual(source);
  expect(persist).not.toHaveBeenCalled();
  await sizing.resize(640, 360);
  await sizing.resize(0, 420);
  await sizing.resize(264, 0);
  await sizing.resize(Infinity, 420);
  await sizing.resize(264, NaN);
  expect(svg.getAttribute("viewBox")).toBe("0 0 640 360");
  expect(frame.record()).toEqual(source);
  expect(persist).not.toHaveBeenCalled();
  await act(() => {
    root?.unmount();
    root = undefined;
  });
  expect(sizing.disconnect).toHaveBeenCalledOnce();
});

it("uses the measured viewport for visibility, explicit fit, centering and pointer movement", async () => {
  measuredViewport();
  await setup();
  await act(() => {
    frame.append([node(2)], () => true, true);
  });
  expect(container.querySelector('[data-node="n:2"]')).toBeNull();
  expect(frame.projection.nodes).toHaveLength(3);
  const first = required(container.querySelector(firstNodeSelector));
  await key(first, "Enter");
  await act(() => {
    frame.camera = { x: 0, y: 0, zoom: 2 };
    frame.changed();
  });
  await click("定位选中");
  expect(frame.camera).toEqual({ x: 54, y: -10, zoom: 2 });
  await click("适配范围");
  expect(frame.camera).toEqual({ x: 20, y: 5, zoom: 264 / 560 });
  expect(container.querySelector('[data-node="n:2"]')).not.toBeNull();
  const fittedHit = required(first.querySelector(".node-hit"));
  expect(Number(fittedHit.getAttribute("height")) * frame.camera.zoom).toBe(44);
  expect(Number(fittedHit.getAttribute("width")) * frame.camera.zoom).toBeGreaterThanOrEqual(44);
  await act(() => {
    frame.camera = { x: 0, y: 0, zoom: 2 };
    frame.changed();
  });
  const svg = required(container.querySelector("svg"));
  Object.defineProperty(svg, "setPointerCapture", { value: vi.fn() });
  const initial = structuredClone(required(frame.positions.get("n:0")));
  await act(() => {
    first.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 20, bubbles: true })
    );
  });
  await act(() => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 40, clientY: 70, bubbles: true })
    );
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
  });
  expect(frame.positions.get("n:0")).toEqual({ x: initial.x + 15, y: initial.y + 25 });
});

it("selects and drags the minimum CSS hit region outside the visual body and retains its viewport overlap", async () => {
  measuredViewport();
  await setup();
  const first = required(container.querySelector(firstNodeSelector));
  const hit = required(first.querySelector(".node-hit"));
  const body = required(first.querySelector(".node-shape"));
  expect([hit.getAttribute("width"), hit.getAttribute("height")]).toEqual(["144", "56"]);
  await act(() => {
    frame.camera = { x: 0, y: 0, zoom: 0.1 };
    frame.changed();
  });
  expect([body.getAttribute("width"), body.getAttribute("height")]).toEqual(["144", "56"]);
  expect([hit.getAttribute("x"), hit.getAttribute("y")]).toEqual(["-220", "-220"]);
  expect([hit.getAttribute("width"), hit.getAttribute("height")]).toEqual(["440", "440"]);
  const initial = structuredClone(required(frame.positions.get("n:0")));
  const camera = structuredClone(frame.camera);
  const other = structuredClone(required(frame.positions.get("n:1")));
  const x = initial.x * camera.zoom;
  const y = initial.y * camera.zoom + 17;
  expect(17).toBeGreaterThan((Number(body.getAttribute("height")) * camera.zoom) / 2);
  expect(17).toBeLessThan((Number(hit.getAttribute("height")) * camera.zoom) / 2);
  await act(() => {
    hit.dispatchEvent(new MouseEvent("click", { clientX: x, clientY: y, bubbles: true }));
  });
  expect(frame.selected).toBe("n:0");
  const svg = required(container.querySelector("svg"));
  const capture = vi.fn();
  Object.defineProperty(svg, "setPointerCapture", { value: capture });
  await act(() => {
    hit.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 3, clientX: x, clientY: y, bubbles: true })
    );
  });
  expect(capture).toHaveBeenCalledWith(3);
  await act(() => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 3,
        clientX: x + 4,
        clientY: y + 5,
        bubbles: true
      })
    );
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 3, bubbles: true }));
  });
  expect(frame.positions.get("n:0")).toEqual({ x: initial.x + 40, y: initial.y + 50 });
  expect(frame.positions.get("n:1")).toEqual(other);
  expect(frame.camera).toEqual(camera);
  expect(frame.selected).toBe("n:0");
  await act(() => {
    frame.append([node(2)], () => true, true);
    frame.positions.set("n:0", { x: -200, y: -200 });
    frame.positions.set("n:1", { x: 2640 + 200, y: 95 });
    frame.positions.set("n:2", { x: 2640 + 230, y: 95 });
    frame.changed();
  });
  expect(container.querySelector(firstNodeSelector)).not.toBeNull();
  expect(container.querySelector('[data-node="n:1"]')).not.toBeNull();
  expect(container.querySelector('[data-node="n:2"]')).toBeNull();
});

it("measures the initial viewport when ResizeObserver is unavailable", async () => {
  const sizing = measuredViewport(288, 400);
  vi.stubGlobal("ResizeObserver", undefined);
  await setup();
  expect(container.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 288 400");
  expect(sizing.observe).not.toHaveBeenCalled();
});

it("changes only local layout while dragging and stops moving on pointer cancel", async () => {
  await setup();
  const svg = required(container.querySelector("svg"));
  Object.defineProperty(svg, "setPointerCapture", { value: vi.fn() });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 420));
  const first = required(container.querySelector(firstNodeSelector));
  const initial = structuredClone(required(frame.positions.get("n:0")));
  await act(() => {
    svg.dispatchEvent(new PointerEvent("pointermove", { clientX: 90, clientY: 90, bubbles: true }));
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
  });
  expect(frame.positions.get("n:0")).toEqual(initial);
  await act(() => {
    first.dispatchEvent(
      new PointerEvent("pointerdown", { pointerId: 1, clientX: 10, clientY: 20, bubbles: true })
    );
  });
  await act(() => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientX: 40, clientY: 70, bubbles: true })
    );
  });
  expect(frame.positions.get("n:0")).toEqual({ x: initial.x + 30, y: initial.y + 50 });
  await act(() => {
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
  });
  expect(frame.record()["positions"]).toMatchObject({
    "n:0": { x: initial.x + 30, y: initial.y + 50 }
  });
  await act(() => {
    first.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, bubbles: true }));
  });
  await act(() => {
    svg.dispatchEvent(new PointerEvent("pointercancel", { pointerId: 2, bubbles: true }));
  });
  await act(() => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", { clientX: 400, clientY: 400, bubbles: true })
    );
  });
  expect(frame.positions.get("n:0")).toEqual({ x: initial.x + 30, y: initial.y + 50 });
  expect(connection.client).toBeUndefined();
});

it("culls graph DOM by viewport while retaining projected identities and reports scalar/limited data", async () => {
  await setup();
  await act(() => {
    frame.camera = { x: 10000, y: 10000, zoom: 1 };
    frame.changed();
  });
  expect(container.querySelectorAll("[data-node]")).toHaveLength(0);
  expect(frame.projection.nodes).toHaveLength(2);
  await act(() => {
    frame.releaseRows();
  });
  expect(container.textContent).toContain("结果包含标量");
  const camera = structuredClone(frame.camera);
  frame.positions.clear();
  await click("适配范围");
  expect(frame.camera).toEqual(camera);
  await act(() => {
    frame.rowCount = 0;
    frame.changed();
  });
  expect(container.textContent).toContain("尚无图元素");
  await act(() => {
    frame.append(
      Array.from({ length: 1001 }, (_, index) => node(index)),
      () => true
    );
    frame.changed();
  });
  expect(container.textContent).toContain("达到图投影显示范围");
  await act(() => {
    frame.append([{ $type: "Node", elementId: "invalid" }], () => true);
    frame.changed();
  });
  expect(container.textContent).toContain("无法解释的 typed 图值");
});

it("selects nodes and edges through click targets and labels unavailable endpoints clearly", async () => {
  await setup();
  const first = required(container.querySelector<SVGGElement>(firstNodeSelector));
  await act(() => {
    first.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(frame.selected).toBe("n:0");
  const relation = required(
    container.querySelector<SVGGElement>('[aria-label="r:0 LINK n:0 到 n:1"]')
  );
  await act(() => {
    relation.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(frame.selected).toBe("r:0");
  await act(() => {
    frame.append([edge(3, "n:0", "n:9")], () => true);
    frame.changed();
  });
  expect(container.querySelector('[data-node="n:9"]')?.textContent).toContain("未加载");
  await act(() => {
    frame.selected = "n:missing";
    frame.changed();
  });
  const camera = structuredClone(frame.camera);
  await click("定位选中");
  expect(frame.camera).toEqual(camera);
});

it("selects the pressed node when SVG pointer capture receives the later click, and ignores right-button drag", async () => {
  await setup();
  const svg = required(container.querySelector("svg"));
  const selected = required(container.querySelector('[data-node="n:1"]'));
  const other = required(container.querySelector(firstNodeSelector));
  const capture = vi.fn();
  Object.defineProperty(svg, "setPointerCapture", { value: capture });
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 1000, 420));
  const nodeClick = vi.fn<() => void>();
  selected.addEventListener("click", nodeClick);
  await act(() => {
    selected.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 7,
        button: 0,
        clientX: 10,
        clientY: 20,
        bubbles: true
      })
    );
  });
  expect(capture).toHaveBeenCalledWith(7);
  expect(frame.selected).toBe("n:1");
  const click = new MouseEvent("click", { button: 0, bubbles: true });
  await act(() => {
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, button: 0, bubbles: true }));
    svg.dispatchEvent(click);
  });
  expect(click.target).toBe(svg);
  expect(nodeClick).not.toHaveBeenCalled();
  expect(frame.selected).toBe("n:1");
  expect(selected.classList.contains("selected")).toBe(true);
  const positions = structuredClone(frame.positions);
  await act(() => {
    other.dispatchEvent(
      new PointerEvent("pointerdown", {
        pointerId: 8,
        button: 2,
        clientX: 0,
        clientY: 0,
        bubbles: true
      })
    );
  });
  await act(() => {
    svg.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 8,
        button: 2,
        clientX: 200,
        clientY: 200,
        bubbles: true
      })
    );
    svg.dispatchEvent(new PointerEvent("pointerup", { pointerId: 8, button: 2, bubbles: true }));
  });
  expect(capture).toHaveBeenCalledOnce();
  expect(frame.selected).toBe("n:1");
  expect(frame.positions).toEqual(positions);
});
