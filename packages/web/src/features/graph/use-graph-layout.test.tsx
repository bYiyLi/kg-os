// @vitest-environment jsdom
// cspell:words relayout

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { GraphData } from "./graph-data.js";
import { useGraphLayout } from "./use-graph-layout.js";

let root: Root;
let host: HTMLDivElement;
let layout: ReturnType<typeof useGraphLayout>;
let frames: Map<number, FrameRequestCallback>;
let sequence: number;
const media = {
  matches: false,
  addEventListener: vi.fn<(event: string, callback: () => void) => void>(),
  removeEventListener: vi.fn<(event: string, callback: () => void) => void>()
};

function graph(linked = false): GraphData {
  return {
    nodes: [1, 2, 3].map((id) => ({ id: "n:" + String(id), labels: [], properties: {} })),
    relationships: linked
      ? [{ id: "r:1", start: "n:1", end: "n:2", type: "LINK", properties: {} }]
      : [],
    limited: false
  };
}

function Probe({ data }: { data: GraphData }) {
  layout = useGraphLayout(data);
  return null;
}

function render(data: GraphData) {
  act(() => {
    root.render(<Probe data={data} />);
  });
}

function frame(now: number) {
  const pending = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of pending) callback(now);
  });
}

function settle() {
  frame(0);
  frame(300);
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  frames = new Map();
  sequence = 0;
  media.matches = false;
  vi.clearAllMocks();
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(media));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    const id = ++sequence;
    frames.set(id, callback);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

it("animates a topology change from the existing points and stops scheduling frames", () => {
  render(graph());
  const before = layout.positions;
  expect(frames.size).toBe(0);
  render(graph(true));
  expect(layout.positions).toEqual(before);
  expect(frames.size).toBe(1);
  frame(0);
  frame(130);
  expect(layout.positions).not.toEqual(before);
  frame(300);
  expect(frames.size).toBe(0);
  const settled = layout.positions;
  frame(600);
  expect(layout.positions).toBe(settled);
});

it("pins a dragged point immediately and prevents an abandoned frame from overriding it", () => {
  render(graph());
  render(graph(true));
  const abandoned = [...frames.values()];
  act(() => {
    layout.beginDrag("n:1");
    layout.dragNode("n:1", { x: 380, y: 220 });
  });
  expect(layout.pinned.has("n:1")).toBe(true);
  expect(layout.positions.get("n:1")).toEqual({ x: 380, y: 220 });
  act(() => {
    for (const callback of abandoned) callback(900);
  });
  expect(layout.positions.get("n:1")).toEqual({ x: 380, y: 220 });
  act(() => {
    layout.finishDrag("n:1");
  });
  settle();
  expect(layout.positions.get("n:1")).toEqual({ x: 380, y: 220 });
});

it("preserves explicit pins during graph growth and relayout, then releases them on request", () => {
  render(graph(true));
  act(() => {
    layout.moveNode("n:1", { x: 300, y: 170 });
  });
  const pinned = layout.positions.get("n:1");
  const expanded = graph(true);
  expanded.nodes.push({ id: "n:4", labels: [], properties: {} });
  expanded.relationships.push({
    id: "r:2",
    start: "n:1",
    end: "n:4",
    type: "LINK",
    properties: {}
  });
  render(expanded);
  settle();
  expect(layout.positions.get("n:1")).toEqual(pinned);
  act(() => {
    layout.relayout();
  });
  settle();
  expect(layout.positions.get("n:1")).toEqual(pinned);
  act(() => {
    layout.togglePin("n:1");
  });
  settle();
  expect(layout.pinned.has("n:1")).toBe(false);
  expect(layout.positions.get("n:1")).not.toEqual(pinned);
});

it("ignores property and result ordering changes rather than restarting the layout", () => {
  const data = graph(true);
  render(data);
  const before = layout.positions;
  render({
    ...data,
    nodes: [...data.nodes].reverse().map((node) => ({ ...node, properties: { name: "Updated" } }))
  });
  expect(layout.positions).toBe(before);
  expect(frames.size).toBe(0);
});

it("drops removed pins and cancels animation work when the component unmounts", () => {
  render(graph());
  act(() => {
    layout.beginDrag("n:1");
  });
  render({ ...graph(true), nodes: graph().nodes.filter((node) => node.id !== "n:1") });
  expect(layout.pinned.has("n:1")).toBe(false);
  expect(layout.positions.has("n:1")).toBe(false);
  act(() => {
    root.unmount();
  });
  expect(frames.size).toBe(0);
  root = createRoot(host);
});

it("respects reduced motion and settles synchronously without a persistent animation loop", () => {
  media.matches = true;
  render(graph());
  const before = layout.positions;
  render(graph(true));
  expect(layout.positions).not.toEqual(before);
  expect(frames.size).toBe(0);
  expect(media.addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
});

it("cancels in-progress motion when the user changes their motion preference", () => {
  render(graph());
  render(graph(true));
  expect(frames.size).toBe(1);
  const change = media.addEventListener.mock.calls[0]?.[1];
  if (change === undefined) throw new Error("Missing motion preference listener");
  act(() => {
    media.matches = true;
    change();
  });
  expect(frames.size).toBe(0);
  act(() => {
    root.unmount();
  });
  expect(media.removeEventListener).toHaveBeenCalledWith("change", change);
  root = createRoot(host);
});

it("settles graph changes when animation frame or motion preference APIs are unavailable", () => {
  vi.stubGlobal("requestAnimationFrame", undefined);
  vi.stubGlobal("matchMedia", undefined);
  render(graph());
  const before = layout.positions;
  render(graph(true));
  expect(layout.positions).not.toEqual(before);
  expect(frames.size).toBe(0);
});

it("ignores absent nodes, foreign drag completion, and non-finite pointer coordinates", () => {
  render(graph());
  const before = layout.positions;
  act(() => {
    layout.beginDrag("n:missing");
    layout.dragNode("n:missing", { x: 1, y: 2 });
    layout.dragNode("n:1", { x: Infinity, y: 2 });
    layout.finishDrag("n:missing");
    layout.moveNode("n:missing", { x: 1, y: 2 });
    layout.togglePin("n:missing");
  });
  expect(layout.positions).toBe(before);
  expect(layout.pinned.size).toBe(0);
});
