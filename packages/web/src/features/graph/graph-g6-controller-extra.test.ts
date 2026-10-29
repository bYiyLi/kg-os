// @vitest-environment jsdom
// cspell:words afterdraw afterlayout aftertransform aftersizechange

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { GraphData } from "./graph-data.js";
import { GraphG6Controller } from "./graph-g6-controller.js";
import { FakeG6Graph, graphs } from "./graph-g6-test-double.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

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
      DRAG: "node:drag",
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

const data: GraphData = {
  nodes: [
    { id: "n:1", labels: ["Topic"], properties: { title: "Main" } },
    { id: "n:2", labels: ["Topic"], properties: { title: "Related" } }
  ],
  relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "RELATED", properties: {} }],
  limited: false
};

let controller: GraphG6Controller | null;
let host: HTMLElement;
let surface: HTMLElement;
const createFeedback = () => ({
  ready: vi.fn<(ready: boolean) => void>(),
  pins: vi.fn<(ids: ReadonlySet<string>) => void>(),
  scale: vi.fn<(zoom: number) => void>()
});
let feedback: ReturnType<typeof createFeedback>;
let props: GraphSceneProps;
const onSelect = vi.fn();
const onContextMenu = vi.fn();
const onPinnedChange = vi.fn();
const onExpand = vi.fn();

function currentGraph(): FakeG6Graph {
  const result = graphs.at(-1);
  if (!(result instanceof FakeG6Graph)) throw new Error("Expected G6 test instance");
  return result;
}

function keyboard(
  key: string,
  modifiers: Partial<
    Pick<ReactKeyboardEvent<HTMLElement>, "altKey" | "ctrlKey" | "metaKey" | "shiftKey">
  > = {},
  composing = false
) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: {
      key,
      ...modifiers,
      nativeEvent: { isComposing: composing },
      preventDefault,
      stopPropagation
    } as unknown as ReactKeyboardEvent<HTMLElement>,
    preventDefault,
    stopPropagation
  };
}

async function mount(overrides: Partial<GraphSceneProps> = {}, reduced = false) {
  props = { ...props, ...overrides };
  controller = new GraphG6Controller(props, feedback, reduced);
  controller.mount(host, surface);
  await vi.waitFor(() => {
    expect(feedback.ready).toHaveBeenCalledWith(true);
  });
  return currentGraph();
}

beforeEach(() => {
  graphs.length = 0;
  vi.clearAllMocks();
  vi.stubGlobal("CanvasRenderingContext2D", Object);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1)
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  host = document.createElement("div");
  surface = document.createElement("div");
  surface.style.width = "640px";
  surface.style.height = "420px";
  host.append(surface);
  document.body.append(host);
  feedback = createFeedback();
  props = {
    data,
    selected: null,
    onSelect,
    onToggleExpand: onExpand,
    onPinnedChange,
    onContextMenu
  };
  controller = null;
});

afterEach(() => {
  controller?.unmount();
  host.remove();
  vi.unstubAllGlobals();
});

it("accepts safe commands before mount and after unmount without allocating G6", () => {
  controller = new GraphG6Controller(props, feedback, false);
  const key = keyboard("ArrowRight");
  controller.resizeCanvas();
  controller.fit();
  controller.zoomBy(1.2);
  controller.resetZoom();
  controller.togglePin("n:1");
  controller.focusNode("n:1");
  controller.focusState("n:1", true);
  controller.reflow();
  controller.refreshColors();
  controller.handleKey(key.event, "n:1");
  controller.setReduced(true);
  controller.setProps({ ...props, selected: "n:1", disabled: true });
  expect(controller.pinned.size).toBe(0);
  expect(controller.zoom).toBe(1);
  expect(key.preventDefault).not.toHaveBeenCalled();
  expect(graphs).toHaveLength(0);
  controller.unmount();
});

it("keeps graphics enabled/disabled and reduced motion independent of node data", async () => {
  const graph = await mount();
  controller?.resizeCanvas();
  expect(graph.calls).toContain("resize");
  expect(
    graph.behaviors.some((behavior) => (behavior as { type: string }).type === "drag-element")
  ).toBe(true);
  controller?.setProps({ ...props, disabled: true });
  expect(graph.behaviors).toEqual([]);
  const before = [...graph.calls];
  controller?.focusNode("n:1");
  controller?.fit();
  controller?.zoomBy(1.25);
  controller?.resetZoom();
  expect(graph.calls).toEqual(before);
  controller?.setProps({ ...props, disabled: false, selected: "n:1" });
  expect(graph.behaviors.length).toBeGreaterThan(0);
  expect(graph.states.get("n:1")).toContain("selected");
  controller?.setReduced(true);
  expect(graph.calls).toContain("stop");
  expect((graph.options["layout"] as { animation: boolean }).animation).toBe(false);
  controller?.setReduced(true);
  controller?.setReduced(false);
  expect((graph.options["layout"] as { animation: boolean }).animation).toBe(true);
  expect(graph.destroyed).toBe(false);
});

it("preserves user pinning through layout and rejects unknown element IDs", async () => {
  const graph = await mount();
  controller?.togglePin("n:missing");
  expect(controller?.pinned.size).toBe(0);
  const before = graph.getElementPosition("n:1");
  controller?.togglePin("n:1", { x: 20, y: -12 });
  expect(controller?.pinned.has("n:1")).toBe(true);
  expect(graph.getElementPosition("n:1")).toEqual([(before[0] ?? 0) + 20, (before[1] ?? 0) - 12]);
  expect(onPinnedChange).toHaveBeenCalledWith(new Set(["n:1"]));
  await vi.waitFor(() => {
    expect(feedback.ready).toHaveBeenLastCalledWith(true);
  });
  controller?.reflow(true);
  await vi.waitFor(() => {
    expect(graph.calls).toContain("render");
  });
  expect(controller?.pinned.has("n:1")).toBe(true);
  controller?.togglePin("n:1");
  expect(controller?.pinned.size).toBe(0);
  controller?.refreshColors();
  expect(graph.calls).toContain("draw");
});

it("focuses an accessible node and switches focused G6 states without layout", async () => {
  const graph = await mount();
  const proxy = document.createElement("button");
  proxy.dataset["graphId"] = "n:2";
  surface.append(proxy);
  controller?.focusNode("n:2");
  expect(graph.calls).toContain("focus:n:2");
  expect(document.activeElement).toBe(proxy);
  controller?.focusState("n:1", true);
  expect(graph.getElementState("n:1")).toContain("focused");
  controller?.focusState("n:1", false);
  expect(graph.getElementState("n:1")).not.toContain("focused");
  controller?.fit();
  controller?.zoomBy(1.2);
  expect(controller?.zoom).toBeCloseTo(1.2);
  controller?.resetZoom();
  expect(controller?.zoom).toBe(1);
  expect(graph.calls).toContain("fit");
});

it("routes canvas and element keyboard shortcuts without stealing composed text", async () => {
  const graph = await mount();
  const ctrl = keyboard("ArrowRight", { ctrlKey: true });
  controller?.handleKey(ctrl.event, null);
  expect(ctrl.preventDefault).not.toHaveBeenCalled();
  const composing = keyboard("Enter", {}, true);
  controller?.handleKey(composing.event, "n:1");
  expect(onSelect).not.toHaveBeenCalled();
  const expand = keyboard("Enter", { shiftKey: true });
  controller?.handleKey(expand.event, "n:1");
  expect(onExpand).toHaveBeenCalledWith("n:1");
  expect(expand.preventDefault).toHaveBeenCalled();
  controller?.handleKey(keyboard(" ").event, "r:1");
  expect(onSelect).toHaveBeenCalledWith("r:1");
  controller?.handleKey(keyboard("ArrowLeft").event, "r:1");
  controller?.handleKey(keyboard("ArrowUp").event, null);
  expect(graph.calls).toContain("translate");
  controller?.handleKey(keyboard("0").event, null);
  controller?.handleKey(keyboard("=").event, null);
  controller?.handleKey(keyboard("−").event, null);
  controller?.handleKey(keyboard("ContextMenu").event, "n:1");
  controller?.handleKey(keyboard("F10", { shiftKey: true }).event, "n:1");
  expect(onContextMenu).toHaveBeenCalledTimes(2);
  expect(graph.calls).toContain("fit");
});

it("reflows actual topology additions and filters pins removed from the graph", async () => {
  const graph = await mount();
  controller?.togglePin("n:1");
  await vi.waitFor(() => {
    expect(graph.calls).toContain("render");
  });
  const enlarged = {
    ...data,
    nodes: [...data.nodes, { id: "n:3", labels: ["Topic"], properties: {} }],
    relationships: [
      ...data.relationships,
      { id: "r:2", start: "n:2", end: "n:3", type: "RELATED", properties: {} }
    ]
  } satisfies GraphData;
  controller?.setProps({ ...props, data: enlarged, expanded: new Set(["n:2"]) });
  await vi.waitFor(() => {
    expect(graph.getNodeData()?.some((node) => node.id === "n:3")).toBe(true);
  });
  expect(graph.calls).toContain("layout");
  controller?.setProps({
    ...props,
    data: {
      nodes: data.nodes.filter((node) => node.id === "n:2"),
      relationships: [],
      limited: false
    }
  });
  await vi.waitFor(() => {
    expect(controller?.pinned.size).toBe(0);
  });
});
