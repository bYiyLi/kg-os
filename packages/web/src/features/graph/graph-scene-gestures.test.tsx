// @vitest-environment jsdom

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

const NODE = '[data-node-id="n:1"]';
const OTHER = '[data-node-id="n:2"]';
const EDGE = '[data-relationship-id="r:1"]';
const SURFACE = ".graph-scene";
const GESTURE = "data-gesture";
const data: GraphData = {
  nodes: [
    { id: "n:1", labels: ["Example"], properties: { name: "First" } },
    { id: "n:2", labels: ["Example"], properties: { name: "Second" } }
  ],
  relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "LINKS", properties: {} }],
  limited: false
};

let host: HTMLDivElement;
let root: Root;
const handle = createRef<GraphSceneHandle>();
const select = vi.fn();
const expand = vi.fn();
const context = vi.fn();
const pins = vi.fn();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

function render(overrides: Partial<ComponentProps<typeof GraphScene>> = {}) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <GraphScene
            ref={handle}
            data={data}
            selected={null}
            onSelect={select}
            onToggleExpand={expand}
            onContextMenu={context}
            onPinnedChange={pins}
            {...overrides}
          />
        </UiProvider>
      </TranslationProvider>
    );
  });
}

function find(selector: string): Element {
  const value = host.querySelector(selector);
  if (value === null) throw new Error("Missing graph object " + selector);
  return value;
}

function fire(target: Element, event: Event) {
  act(() => {
    target.dispatchEvent(event);
  });
}

function pointer(
  type: string,
  options: { target?: Element; id?: number; x: number; y: number; touch?: boolean }
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: options.x,
    clientY: options.y
  });
  Object.defineProperties(event, {
    pointerId: { value: options.id ?? 1 },
    pointerType: { value: options.touch === true ? "touch" : "mouse" }
  });
  fire(options.target ?? find(SURFACE), event);
}

function camera() {
  const value = find(SURFACE + " > g").getAttribute("transform") ?? "";
  const numbers = Array.from(value.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi), (match) =>
    Number(match[0])
  );
  return { x: numbers[0] ?? 0, y: numbers[1] ?? 0, scale: numbers[2] ?? 1 };
}

function captureSurface() {
  const captured = new Set<number>();
  const capture = vi.fn((id: number) => {
    captured.add(id);
  });
  const release = vi.fn((id: number) => {
    captured.delete(id);
  });
  Object.defineProperties(find(SURFACE), {
    setPointerCapture: { value: capture, configurable: true },
    releasePointerCapture: { value: release, configurable: true },
    hasPointerCapture: { value: (id: number) => captured.has(id), configurable: true }
  });
  return { captured, capture, release };
}

it("keeps single clicks and double clicks intact until a real drag starts", () => {
  render({ expandingIds: new Set(["n:1"]) });
  const capture = captureSurface();
  pointer("pointerdown", { target: find(NODE), x: 100, y: 100 });
  pointer("pointermove", { x: 102, y: 100 });
  pointer("pointerup", { x: 102, y: 100 });
  expect(capture.capture).not.toHaveBeenCalled();
  expect(handle.current?.isPinned("n:1")).toBe(false);
  fire(find(NODE), new MouseEvent("click", { bubbles: true }));
  expect(select).toHaveBeenLastCalledWith("n:1");
  fire(find(NODE), new MouseEvent("dblclick", { bubbles: true }));
  expect(expand).toHaveBeenLastCalledWith("n:1");
  fire(find(NODE), new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  expect(expand).toHaveBeenCalledTimes(2);
  expect(find(NODE).getAttribute("aria-busy")).toBe("true");
});

it("can pan from a relationship after the threshold while a stationary relation press still selects", () => {
  render();
  const capture = captureSurface();
  const before = camera();
  pointer("pointerdown", { target: find(EDGE), x: 200, y: 220 });
  expect(capture.capture).not.toHaveBeenCalled();
  pointer("pointermove", { x: 202, y: 221 });
  expect(camera()).toEqual(before);
  pointer("pointermove", { x: 225, y: 230 });
  expect(capture.capture).toHaveBeenCalledWith(1);
  expect(camera().x).toBeCloseTo(before.x + 25);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("pan");
  pointer("pointerup", { x: 225, y: 230 });
  expect(capture.release).toHaveBeenCalledWith(1);
  fire(find(SURFACE), new MouseEvent("click", { bubbles: true }));
  expect(select).not.toHaveBeenCalled();
  pointer("pointerdown", { target: find(EDGE), x: 200, y: 220 });
  pointer("pointerup", { x: 200, y: 220 });
  fire(find(EDGE), new MouseEvent("click", { bubbles: true }));
  expect(select).toHaveBeenLastCalledWith("r:1");
});

it("moves nodes with the pointer, pins only dragged nodes, and exposes explicit unpin", () => {
  render();
  const capture = captureSurface();
  const before = find(NODE).getAttribute("transform");
  pointer("pointerdown", { target: find(NODE), x: 100, y: 100 });
  expect(capture.capture).not.toHaveBeenCalled();
  pointer("pointermove", { x: 130, y: 125 });
  expect(find(NODE).getAttribute("transform")).not.toBe(before);
  expect(handle.current?.isPinned("n:1")).toBe(true);
  expect(handle.current?.isPinned("n:2")).toBe(false);
  expect(pins).toHaveBeenLastCalledWith(new Set(["n:1"]));
  pointer("pointerup", { x: 130, y: 125 });
  fire(find(NODE), new MouseEvent("click", { bubbles: true }));
  expect(select).not.toHaveBeenCalled();
  act(() => {
    handle.current?.togglePin("n:1");
  });
  expect(handle.current?.isPinned("n:1")).toBe(false);
});

it.each([{ altKey: true }, { ctrlKey: true }, { metaKey: true }])(
  "leaves modified node keys to browser shortcuts (%j)",
  (modifier) => {
    render();
    const position = find(NODE).getAttribute("transform");
    const viewport = camera();
    pins.mockClear();
    for (const key of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "]) {
      const event = new KeyboardEvent("keydown", {
        key,
        ...modifier,
        bubbles: true,
        cancelable: true
      });
      fire(find(NODE), event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(find(NODE).getAttribute("transform")).toBe(position);
    expect(camera()).toEqual(viewport);
    expect(handle.current?.isPinned("n:1")).toBe(false);
    expect(pins).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(expand).not.toHaveBeenCalled();
  }
);

it("zooms ordinary wheel continuously around its mouse anchor and ignores zero delta", () => {
  render();
  const before = camera();
  const event = new WheelEvent("wheel", {
    deltaY: 40,
    clientX: 220,
    clientY: 170,
    bubbles: true,
    cancelable: true
  });
  fire(find(SURFACE), event);
  const after = camera();
  expect(event.defaultPrevented).toBe(true);
  expect(after.scale).toBeLessThan(before.scale);
  expect((220 - after.x) / after.scale).toBeCloseTo((220 - before.x) / before.scale);
  expect((170 - after.y) / after.scale).toBeCloseTo((170 - before.y) / before.scale);
  fire(find(SURFACE), new WheelEvent("wheel", { deltaY: 0, bubbles: true, cancelable: true }));
  expect(camera()).toEqual(after);
});

it("combines two-finger zoom and midpoint pan, then continues one-finger panning without a jump", () => {
  render();
  const captured = captureSurface();
  const before = camera();
  pointer("pointerdown", { id: 1, x: 300, y: 300, touch: true });
  pointer("pointerdown", { id: 2, x: 500, y: 300, touch: true });
  expect(captured.captured.size).toBe(2);
  pointer("pointermove", { id: 2, x: 600, y: 300, touch: true });
  pointer("pointermove", { id: 1, x: 340, y: 300, touch: true });
  pointer("pointermove", { id: 2, x: 640, y: 300, touch: true });
  const after = camera();
  expect(after.scale).toBeGreaterThan(before.scale);
  expect((490 - after.x) / after.scale).toBeCloseTo((400 - before.x) / before.scale);
  pointer("pointerup", { id: 2, x: 640, y: 300, touch: true });
  const pan = camera();
  pointer("pointermove", { id: 1, x: 380, y: 300, touch: true });
  expect(camera().x).toBeCloseTo(pan.x + 40);
  expect(camera().scale).toBe(pan.scale);
  pointer("pointerup", { id: 1, x: 380, y: 300, touch: true });
  expect(captured.captured.size).toBe(0);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("idle");
  fire(find(SURFACE), new MouseEvent("click", { bubbles: true }));
  expect(select).not.toHaveBeenCalled();
});

it("releases all gesture state on cancellation, capture loss, and workspace disable", () => {
  render();
  const captured = captureSurface();
  pointer("pointerdown", { x: 100, y: 100 });
  pointer("pointermove", { x: 140, y: 130 });
  pointer("pointercancel", { x: 140, y: 130 });
  expect(captured.captured.size).toBe(0);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("idle");
  pointer("pointerdown", { x: 100, y: 100 });
  pointer("pointermove", { x: 150, y: 130 });
  captured.captured.delete(1);
  pointer("lostpointercapture", { x: 150, y: 130 });
  const afterLoss = camera();
  pointer("pointermove", { x: 170, y: 160 });
  expect(camera()).toEqual(afterLoss);
  pointer("pointerdown", { target: find(NODE), x: 100, y: 100 });
  pointer("pointermove", { x: 140, y: 130 });
  render({ disabled: true });
  const disabledCamera = camera();
  pointer("pointermove", { x: 190, y: 190 });
  expect(camera()).toEqual(disabledCamera);
  expect(captured.captured.size).toBe(0);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("idle");
});

it("forwards pointer and keyboard context menus with object identity and canvas-relative position", () => {
  render();
  const event = new MouseEvent("contextmenu", {
    clientX: 150,
    clientY: 210,
    bubbles: true,
    cancelable: true
  });
  fire(find(NODE), event);
  expect(context).toHaveBeenLastCalledWith({ id: "n:1", x: 150, y: 210 });
  expect(event.defaultPrevented).toBe(true);
  Object.defineProperty(find(OTHER), "getBoundingClientRect", {
    value: () => new DOMRect(110, 120, 40, 30),
    configurable: true
  });
  fire(find(OTHER), new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true }));
  expect(context).toHaveBeenLastCalledWith({ id: "n:2", x: 130, y: 135 });
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "ContextMenu", bubbles: true }));
  expect(context).toHaveBeenLastCalledWith({ id: null, x: 450, y: 300 });
});

it("supports graph-local fit and zoom shortcuts, background double click, and imperative node focus", () => {
  render();
  const before = camera();
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "+", bubbles: true }));
  expect(camera().scale).toBeGreaterThan(before.scale);
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "f", bubbles: true }));
  expect(camera()).toEqual(before);
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "-", bubbles: true }));
  fire(find(SURFACE), new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  expect(camera()).toEqual(before);
  act(() => {
    handle.current?.focusNode("n:2");
  });
  const focused = camera();
  const position = find(OTHER).getAttribute("transform") ?? "";
  const coordinates = Array.from(position.matchAll(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi), (match) =>
    Number(match[0])
  );
  expect(focused.x + (coordinates[0] ?? 0) * focused.scale).toBeCloseTo(450);
  expect(focused.y + (coordinates[1] ?? 0) * focused.scale).toBeCloseTo(300);
  expect(document.activeElement).toBe(find(OTHER));
});

it("ignores disabled commands and modified browser shortcuts without changing the view", () => {
  render();
  const before = camera();
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true }));
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "f", metaKey: true, bubbles: true }));
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "0", altKey: true, bubbles: true }));
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "+", isComposing: true, bubbles: true }));
  act(() => {
    handle.current?.focusNode("n:missing");
  });
  expect(camera()).toEqual(before);
  render({ disabled: true });
  fire(find(NODE), new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  fire(find(SURFACE), new KeyboardEvent("keydown", { key: "+", bubbles: true }));
  act(() => {
    handle.current?.togglePin("n:1");
    handle.current?.focusNode("n:1");
    handle.current?.fit();
    handle.current?.relayout();
  });
  expect(handle.current?.isPinned("n:1")).toBe(false);
  expect(context).not.toHaveBeenCalled();
  expect(camera()).toEqual(before);
});

it("abandons an uncaptured press on leaving and changes a node drag into a two-finger gesture", () => {
  render();
  const captured = captureSurface();
  const before = camera();
  pointer("pointerdown", { target: find(NODE), x: 100, y: 100, touch: true });
  pointer("pointerout", { x: 102, y: 100, touch: true });
  pointer("pointermove", { x: 140, y: 130, touch: true });
  expect(camera()).toEqual(before);
  expect(handle.current?.isPinned("n:1")).toBe(false);
  pointer("pointerdown", { target: find(NODE), id: 1, x: 100, y: 100, touch: true });
  pointer("pointermove", { id: 1, x: 140, y: 130, touch: true });
  const dragged = find(NODE).getAttribute("transform");
  pointer("pointerdown", { id: 2, x: 400, y: 300, touch: true });
  pointer("pointerdown", { id: 3, x: 500, y: 300, touch: true });
  expect(captured.captured.size).toBe(2);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("pinch");
  pointer("pointermove", { id: 2, x: 450, y: 320, touch: true });
  expect(camera()).not.toEqual(before);
  expect(find(NODE).getAttribute("transform")).toBe(dragged);
  expect(handle.current?.isPinned("n:1")).toBe(true);
  pointer("pointercancel", { id: 2, x: 450, y: 320, touch: true });
  expect(captured.captured.size).toBe(0);
  expect(find(SURFACE).getAttribute(GESTURE)).toBe("idle");
});
