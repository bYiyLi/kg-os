// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n, TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import type { GraphData, GraphNode } from "./graph-data.js";
import { GraphScene } from "./graph-scene.js";

const NODE_ONE = '[data-node-id="n:1"]';
const NODE_TWO = '[data-node-id="n:2"]';
const SURFACE = ".graph-scene";
const EDGE_ONE = '[data-relationship-id="r:1"]';

function node(id: string, name: string): GraphNode {
  return { id, labels: ["Example"], properties: { name } };
}

function fixture(): GraphData {
  return {
    nodes: [node("n:1", "First object"), node("n:2", "Second object")],
    relationships: [
      { id: "r:1", start: "n:1", end: "n:2", type: "LINKS", properties: {} },
      { id: "r:2", start: "n:1", end: "n:2", type: "LINKS", properties: {} },
      { id: "r:3", start: "n:1", end: "n:1", type: "SELF", properties: {} }
    ],
    limited: false
  };
}

let host: HTMLDivElement;
let root: Root;
const onSelect = vi.fn<(id: string | null) => void>();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSelect.mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(data: GraphData, selected: string | null = null, disabled = false) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <GraphScene data={data} selected={selected} onSelect={onSelect} disabled={disabled} />
        </UiProvider>
      </TranslationProvider>
    );
  });
}

function find(selector: string): Element {
  const element = host.querySelector(selector);
  if (element === null) throw new Error("Missing scene element " + selector);
  return element;
}

function control(key: string): HTMLButtonElement {
  const label = i18n.t(key);
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.getAttribute("aria-label") === label
  );
  if (button === undefined) throw new Error("Missing canvas control " + key);
  return button;
}

function camera(): string | null {
  return find(".graph-scene > g").getAttribute("transform");
}

function fire(target: Element, event: Event) {
  act(() => {
    target.dispatchEvent(event);
  });
}

function pointer(target: Element, type: string, x: number, y: number) {
  Object.defineProperty(target, "setPointerCapture", { value: vi.fn(), configurable: true });
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(event, "pointerId", { value: 1 });
  act(() => {
    target.dispatchEvent(event);
  });
}

it("renders real identities and distinct directed parallel edges and self-loops", () => {
  render(fixture(), "n:1");
  expect(host.querySelectorAll(".graph-node")).toHaveLength(2);
  expect(host.querySelectorAll(".graph-relationship")).toHaveLength(3);
  expect(find(NODE_ONE).getAttribute("aria-pressed")).toBe("true");
  expect(find(NODE_TWO).textContent).toContain("Second object");
  const paths = [...host.querySelectorAll(".graph-edge")].map((edge) => edge.getAttribute("d"));
  expect(new Set(paths).size).toBe(3);
  expect(
    [...host.querySelectorAll(".graph-edge")].every((edge) => edge.hasAttribute("marker-end"))
  ).toBe(true);
  expect(host.querySelectorAll(".graph-relationship.is-highlighted")).toHaveLength(3);
});

it("selects nodes and relationships using click or keyboard and clears selection on background", () => {
  render(fixture());
  fire(find(NODE_ONE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("n:1");
  fire(find(EDGE_ONE), new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
  fire(find(NODE_TWO), new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("n:2");
  fire(find(SURFACE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith(null);
});

it("zooms and resets the actual graph transform instead of only changing its percentage", () => {
  render(fixture());
  const initial = camera();
  act(() => {
    control("graph.zoomIn").click();
  });
  expect(camera()).not.toBe(initial);
  act(() => {
    control("graph.zoomReset").click();
  });
  expect(camera()).toContain("scale(1)");
  expect(control("graph.zoomReset").textContent).toBe("100%");
  act(() => {
    control("graph.zoomOut").click();
  });
  expect(camera()).toContain("scale(0.8333333333333334)");
  act(() => {
    control("graph.fit").click();
  });
  expect(camera()).toBe(initial);
});

it("drags only local node positions and keeps existing positions and camera when neighbors arrive", () => {
  const data = fixture();
  const original = JSON.stringify(data);
  render(data);
  const before = find(NODE_ONE).getAttribute("transform");
  pointer(find(NODE_ONE), "pointerdown", 20, 20);
  pointer(find(SURFACE), "pointermove", 60, 50);
  pointer(find(SURFACE), "pointerup", 60, 50);
  const moved = find(NODE_ONE).getAttribute("transform");
  const previousCamera = camera();
  expect(moved).not.toBe(before);
  expect(JSON.stringify(data)).toBe(original);
  render({ ...data, nodes: [...data.nodes, node("n:3", "New neighbor")] });
  expect(find(NODE_ONE).getAttribute("transform")).toBe(moved);
  expect(camera()).toBe(previousCamera);
  expect(host.querySelectorAll(".graph-node")).toHaveLength(3);
});

it("pans the viewport without changing data and provides keyboard movement alternatives", () => {
  const data = fixture();
  render(data);
  const svg = find(SURFACE);
  const before = camera();
  pointer(svg, "pointerdown", 10, 10);
  pointer(svg, "pointermove", 50, 35);
  pointer(svg, "pointerup", 50, 35);
  expect(camera()).not.toBe(before);
  const nodeBefore = find(NODE_ONE).getAttribute("transform");
  fire(find(NODE_ONE), new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  expect(find(NODE_ONE).getAttribute("transform")).not.toBe(nodeBefore);
  const panBefore = camera();
  fire(svg, new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  expect(camera()).not.toBe(panBefore);
});

it("suppresses click selection after a drag, including the implicit pointer-capture release", () => {
  render(fixture());
  const svg = find(SURFACE);
  pointer(find(NODE_ONE), "pointerdown", 0, 0);
  pointer(svg, "pointermove", 80, 50);
  pointer(svg, "pointerup", 80, 50);
  pointer(svg, "lostpointercapture", 80, 50);
  fire(find(NODE_ONE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).not.toHaveBeenCalled();
});

it("allows keyboard activation of nodes and relationships after dragging without a new pointer press", () => {
  render(fixture());
  const svg = find(SURFACE);
  pointer(find(NODE_ONE), "pointerdown", 0, 0);
  pointer(svg, "pointermove", 80, 50);
  pointer(svg, "pointerup", 80, 50);
  fire(find(NODE_TWO), new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("n:2");
  fire(find(EDGE_ONE), new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
  onSelect.mockClear();
  pointer(find(EDGE_ONE), "pointerdown", 30, 40);
  fire(find(EDGE_ONE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
});

it("does not capture a relationship press as a background pan before its click selection", () => {
  render(fixture());
  const capture = vi.fn();
  Object.defineProperty(find(SURFACE), "setPointerCapture", { value: capture, configurable: true });
  pointer(find(EDGE_ONE), "pointerdown", 30, 40);
  expect(capture).not.toHaveBeenCalled();
  fire(find(EDGE_ONE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
});

it("uses both ordinary and modified wheel gestures for graph zoom", () => {
  render(fixture());
  const svg = find(SURFACE);
  const plain = new WheelEvent("wheel", { deltaY: 50, bubbles: true, cancelable: true });
  const initial = camera();
  fire(svg, plain);
  expect(plain.defaultPrevented).toBe(true);
  expect(camera()).not.toBe(initial);
  const zoom = new WheelEvent("wheel", {
    deltaY: 50,
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  });
  fire(svg, zoom);
  expect(zoom.defaultPrevented).toBe(true);
  expect(camera()).not.toBe(initial);
});

it("keeps an empty canvas empty and disables controls while there are no graph elements", () => {
  render({ nodes: [], relationships: [], limited: false });
  expect(host.querySelectorAll(".graph-node")).toHaveLength(0);
  expect(host.querySelectorAll(".graph-relationship")).toHaveLength(0);
  expect(host.querySelectorAll("button:disabled")).toHaveLength(5);
  expect(host.textContent).not.toContain("KG OS");
});

it("does not select, move, pan, or zoom when the surrounding workspace is disabled", () => {
  render(fixture(), null, true);
  const previousCamera = camera();
  const previousNode = find(NODE_ONE).getAttribute("transform");
  expect(find(NODE_ONE).getAttribute("tabindex")).toBe("-1");
  fire(find(NODE_ONE), new MouseEvent("click", { bubbles: true }));
  fire(find(NODE_ONE), new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  pointer(find(NODE_ONE), "pointerdown", 0, 0);
  pointer(find(SURFACE), "pointermove", 80, 50);
  expect(onSelect).not.toHaveBeenCalled();
  expect(camera()).toBe(previousCamera);
  expect(find(NODE_ONE).getAttribute("transform")).toBe(previousNode);
  expect(host.querySelectorAll("button:disabled")).toHaveLength(5);
});

it("measures the live viewport, follows resize observations, and disconnects on unmount", () => {
  let bounds = new DOMRect(0, 0, 640, 480);
  let notify: () => void = vi.fn();
  const disconnect = vi.fn();
  class Observer {
    constructor(callback: () => void) {
      notify = callback;
    }
    observe = vi.fn();
    disconnect = disconnect;
  }
  vi.stubGlobal("ResizeObserver", Observer);
  vi.spyOn(SVGElement.prototype, "getBoundingClientRect").mockImplementation(() => bounds);
  render(fixture());
  expect(find(SURFACE).getAttribute("viewBox")).toBe("0 0 640 480");
  const original = camera();
  act(() => {
    notify();
  });
  expect(camera()).toBe(original);
  bounds = new DOMRect(0, 0, 800, 500);
  act(() => {
    notify();
  });
  expect(find(SURFACE).getAttribute("viewBox")).toBe("0 0 800 500");
  act(() => {
    root.render(<div />);
  });
  expect(disconnect).toHaveBeenCalledOnce();
});

it("shows selected relationship types while omitting edges whose endpoints are not loaded", () => {
  const data = fixture();
  data.relationships.push({
    id: "r:4",
    start: "n:1",
    end: "n:999",
    type: "UNLOADED",
    properties: {}
  });
  render(data, "r:1");
  expect(host.querySelectorAll(".graph-relationship")).toHaveLength(3);
  expect(find(".graph-edge-label").textContent).toBe("LINKS");
  fire(find(EDGE_ONE), new KeyboardEvent("keydown", { key: "x", bubbles: true }));
  expect(onSelect).not.toHaveBeenCalled();
  fire(find(EDGE_ONE), new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1");
});

it("keeps long multilingual captions readable and preserves compound emoji in the display", () => {
  const caption = "Alpha 👨‍👩‍👧‍👦 " + "知识".repeat(25);
  render({
    nodes: [{ id: "n:1", labels: [], properties: { name: caption } }],
    relationships: [],
    limited: false
  });
  const text = find(".graph-node-label").textContent;
  expect(text).toContain("👨‍👩‍👧‍👦");
  expect(text).toMatch(/…$/);
  expect(find(".graph-node title").textContent).toContain("Alpha");
});

it("rejects unrelated pointer and button input, and respects the camera zoom limits", () => {
  render(fixture());
  const svg = find(SURFACE);
  const before = camera();
  fire(svg, new MouseEvent("pointerdown", { button: 2, bubbles: true }));
  pointer(svg, "pointermove", 70, 30);
  expect(camera()).toBe(before);
  pointer(svg, "pointerdown", 0, 0);
  const foreign = new MouseEvent("pointermove", { clientX: 90, clientY: 50, bubbles: true });
  Object.defineProperty(foreign, "pointerId", { value: 999 });
  fire(svg, foreign);
  expect(camera()).toBe(before);
  fire(svg, new KeyboardEvent("keydown", { key: "x", bubbles: true }));
  expect(camera()).toBe(before);
  act(() => {
    for (let index = 0; index < 30; index++) control("graph.zoomIn").click();
  });
  expect(control("graph.zoomIn").disabled).toBe(true);
  expect(control("graph.zoomReset").textContent).toBe("300%");
  act(() => {
    for (let index = 0; index < 60; index++) control("graph.zoomOut").click();
  });
  expect(control("graph.zoomOut").disabled).toBe(true);
  expect(control("graph.zoomReset").textContent).toBe("5%");
});

it("resets the camera after clearing a scene and ignores selection while disabled", () => {
  render(fixture());
  act(() => {
    control("graph.zoomIn").click();
  });
  render({ nodes: [], relationships: [], limited: false });
  expect(camera()).toContain("scale(1)");
  render(fixture(), null, true);
  fire(find(SURFACE), new MouseEvent("click", { bubbles: true }));
  fire(find(EDGE_ONE), new MouseEvent("click", { bubbles: true }));
  fire(find(EDGE_ONE), new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSelect).not.toHaveBeenCalled();
});
