// @vitest-environment jsdom
// cspell:words afterdraw afterlayout aftertransform aftersizechange

import { act, createRef } from "react";
import type { ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import type { GraphData } from "./graph-data.js";
import { GraphScene } from "./graph-scene.js";
import type { GraphSceneHandle } from "./graph-scene.js";

import { graphs } from "./graph-g6-test-double.js";
import type { FakeG6Graph } from "./graph-g6-test-double.js";

vi.mock("@antv/g6", async () => {
  const { FakeG6Graph } = await import("./graph-g6-test-double.js");
  return {
    Graph: FakeG6Graph,
    NodeEvent: {
      CLICK: "node:click",
      DBLCLICK: "node:dblclick",
      CONTEXT_MENU: "node:contextmenu",
      POINTER_DOWN: "node:pointerdown",
      POINTER_UP: "node:pointerup",
      POINTER_OUT: "node:pointerout",
      DRAG_START: "node:dragstart",
      DRAG_END: "node:dragend"
    },
    EdgeEvent: { CLICK: "edge:click", CONTEXT_MENU: "edge:contextmenu" },
    CanvasEvent: {
      CLICK: "canvas:click",
      DBLCLICK: "canvas:dblclick",
      CONTEXT_MENU: "canvas:contextmenu"
    },
    GraphEvent: {
      AFTER_DRAW: "afterdraw",
      AFTER_LAYOUT: "afterlayout",
      AFTER_TRANSFORM: "aftertransform",
      AFTER_SIZE_CHANGE: "aftersizechange"
    }
  };
});

const NODE = '[data-node-id="n:1"]';
const NODE_DOWN = "node:pointerdown";
const NODE_CLICK = "node:click";
const EDGE = '[data-relationship-id="r:1"]';
const data: GraphData = {
  nodes: [
    { id: "n:1", labels: ["Example"], properties: { name: "First" } },
    { id: "n:2", labels: ["Example"], properties: { name: "Second" } }
  ],
  relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "LINK", properties: {} }],
  limited: false
};

let host: HTMLDivElement;
let root: Root;
const handle = createRef<GraphSceneHandle>();
const onSelect = vi.fn();
const onFocusNode = vi.fn();
const onToggleExpand = vi.fn();
const onContextMenu = vi.fn();
const onPinnedChange = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("CanvasRenderingContext2D", Object);
  graphs.length = 0;
  vi.clearAllMocks();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

async function render(overrides: Partial<ComponentProps<typeof GraphScene>> = {}) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <GraphScene
            data={data}
            selected={null}
            onSelect={onSelect}
            onFocusNode={onFocusNode}
            onToggleExpand={onToggleExpand}
            onContextMenu={onContextMenu}
            onPinnedChange={onPinnedChange}
            ref={handle}
            {...overrides}
          />
        </UiProvider>
      </TranslationProvider>
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

function graph(): FakeG6Graph {
  const result = graphs.at(-1);
  if (result === undefined) throw new Error("G6 instance not created");
  return result as FakeG6Graph;
}

function item(selector: string) {
  const found = host.querySelector<HTMLElement>(selector);
  if (found === null) throw new Error("Missing " + selector);
  return found;
}

async function fire(selector: string, event: Event) {
  await act(async () => {
    item(selector).dispatchEvent(event);
    await Promise.resolve();
    await Promise.resolve();
  });
}

it("installs G6 initial physics, native drag handling and camera behaviors", async () => {
  await render();
  const g = graph();
  expect((g.options["layout"] as { type: string }).type).toBe("d3-force");
  expect(g.behaviors).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: "drag-element", animation: false }),
      expect.objectContaining({ type: "drag-canvas" }),
      expect.objectContaining({ type: "zoom-canvas" })
    ])
  );
  expect(host.querySelectorAll(".graph-node")).toHaveLength(2);
  expect(host.querySelectorAll(".graph-relationship")).toHaveLength(1);
  act(() => {
    root.unmount();
  });
  expect(g.destroyed).toBe(true);
  expect(g.calls).toContain("stop");
  root = createRoot(host);
});

it("keeps pointer selection and double-click business actions independent from the simulation", async () => {
  await render();
  vi.useFakeTimers();
  act(() => {
    graph().emit(NODE_CLICK, { target: { id: "n:1" } });
    graph().emit("edge:click", { target: { id: "r:1" } });
    graph().emit("node:dblclick", { target: { id: "n:2" } });
  });
  act(() => {
    vi.advanceTimersByTime(400);
  });
  expect(onSelect).toHaveBeenCalledTimes(1);
  expect(onSelect).toHaveBeenCalledWith("r:1");
  expect(onToggleExpand).toHaveBeenCalledWith("n:2");
  act(() => {
    graph().emit("canvas:click");
  });
  expect(onSelect).toHaveBeenLastCalledWith(null);
});

it("opens node details only for a completed single click", async () => {
  await render();
  vi.useFakeTimers();
  act(() => {
    graph().emit(NODE_CLICK, { target: { id: "n:1" } });
  });
  expect(onSelect).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(320);
  });
  expect(onSelect).toHaveBeenCalledWith("n:1");
  expect(onFocusNode).not.toHaveBeenCalled();
});

it("short presses change inspection without triggering radial motion or moving nodes", async () => {
  await render();
  const first = graph().getElementPosition("n:1");
  const second = graph().getElementPosition("n:2");
  vi.useFakeTimers();
  act(() => {
    graph().emit(NODE_DOWN, { target: { id: "n:1" }, button: 0 });
    vi.advanceTimersByTime(120);
    graph().emit("node:pointerup", { target: { id: "n:1" } });
    graph().emit(NODE_CLICK, { target: { id: "n:1" } });
    vi.advanceTimersByTime(320);
  });
  expect(onSelect).toHaveBeenCalledWith("n:1");
  expect(onFocusNode).not.toHaveBeenCalled();
  vi.useRealTimers();
  await render({ selected: "n:1" });
  expect(graph().getElementPosition("n:1")).toEqual(first);
  expect(graph().getElementPosition("n:2")).toEqual(second);
});

it("begins radial motion after an intentional hold, but prevents the hold click opening details", async () => {
  await render();
  vi.useFakeTimers();
  act(() => {
    graph().emit(NODE_DOWN, { target: { id: "n:1" }, button: 0 });
    vi.advanceTimersByTime(279);
  });
  expect(onFocusNode).not.toHaveBeenCalled();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(onFocusNode).toHaveBeenCalledExactlyOnceWith("n:1");
  act(() => {
    graph().emit("node:pointerup", { target: { id: "n:1" } });
    graph().emit(NODE_CLICK, { target: { id: "n:1" } });
    vi.advanceTimersByTime(400);
  });
  expect(onSelect).not.toHaveBeenCalled();
});

it("starts the same motion immediately on drag and never double-starts after the hold timer", async () => {
  await render();
  vi.useFakeTimers();
  act(() => {
    graph().emit(NODE_DOWN, { target: { id: "n:2" }, button: 0 });
    vi.advanceTimersByTime(50);
    graph().emit("node:dragstart", { target: { id: "n:2" } });
    vi.advanceTimersByTime(350);
  });
  expect(onFocusNode).toHaveBeenCalledExactlyOnceWith("n:2");
});

it("does not pin a dragged node automatically; explicit Pin/Unpin still works", async () => {
  const snapshot = JSON.stringify(data);
  await render();
  act(() => {
    graph().emit("node:dragend", { target: { id: "n:1" } });
  });
  expect(handle.current?.isPinned("n:1")).toBe(false);
  expect(onPinnedChange).not.toHaveBeenCalled();
  act(() => {
    handle.current?.togglePin("n:1");
  });
  expect(handle.current?.isPinned("n:1")).toBe(true);
  expect(onPinnedChange).toHaveBeenLastCalledWith(new Set(["n:1"]));
  act(() => {
    handle.current?.togglePin("n:1");
  });
  expect(handle.current?.isPinned("n:1")).toBe(false);
  await act(async () => {
    handle.current?.relayout();
    await Promise.resolve();
  });
  expect(graph().calls).toContain("data");
  expect(JSON.stringify(data)).toBe(snapshot);
});

it("supports accessible keyboard selection, expansion, node move and canvas navigation", async () => {
  await render();
  await fire(NODE, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSelect).toHaveBeenCalledWith("n:1");
  await fire(NODE, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  expect(onToggleExpand).toHaveBeenCalledWith("n:1");
  await fire(NODE, new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(handle.current?.isPinned("n:1")).toBe(true);
  await fire(EDGE, new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
  await fire(".graph-scene", new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  expect(graph().calls).toContain("translate");
  await fire(".graph-scene", new KeyboardEvent("keydown", { key: "0", bubbles: true }));
  expect(graph().calls).toContain("fit");
});

it("offers contextual keyboard and pointer menus with typed identity and local coordinates", async () => {
  await render();
  act(() => {
    graph().emit("node:contextmenu", { target: { id: "n:1" }, clientX: 30, clientY: 60 });
  });
  expect(onContextMenu).toHaveBeenLastCalledWith({ id: "n:1", x: 30, y: 60 });
  await fire(NODE, new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
  expect(onContextMenu).toHaveBeenCalledTimes(2);
});

it("changes presentation states without restarting layout, yet lays out new topology", async () => {
  await render();
  const g = graph();
  const beforeStates = g.calls.filter((item) => item === "states").length;
  // A parent layout change rerenders React without changing Graph data or
  // selection. That must not ask G6 to redraw all element states.
  await render();
  expect(g.calls.filter((item) => item === "states")).toHaveLength(beforeStates);
  const before = g.calls.filter((item) => item === "render").length;
  await render({ selected: "n:1" });
  expect(g.states.get("n:1")).toContain("selected");
  expect(g.calls.filter((item) => item === "states").length).toBeGreaterThan(beforeStates);
  expect(g.calls.filter((item) => item === "render")).toHaveLength(before);
  await render({
    data: { ...data, nodes: [...data.nodes, { id: "n:3", labels: [], properties: {} }] }
  });
  expect(g.calls.filter((item) => item === "render").length).toBeGreaterThan(before);
});

it("disables G6 manipulation and graph keyboard operations while disabled", async () => {
  await render({ disabled: true });
  expect(graph().behaviors).toEqual([]);
  await fire(NODE, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  act(() => {
    graph().emit(NODE_CLICK, { target: { id: "n:1" } });
  });
  expect(onSelect).not.toHaveBeenCalled();
});
