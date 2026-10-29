import type { Graph as G6Graph } from "@antv/g6";
import { afterEach, expect, it, vi } from "vitest";

import { G6PinchMidpoint } from "./graph-g6-pinch.js";

type Handler = (event: unknown) => void;
function harness() {
  const listeners = new Map<string, Set<Handler>>();
  const translated: number[][] = [];
  let frameId = 1;
  const frames = new Map<number, FrameRequestCallback>();
  const raf = vi.fn((handler: FrameRequestCallback) => {
    const id = frameId++;
    frames.set(id, handler);
    return id;
  });
  const cancel = vi.fn((id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal("requestAnimationFrame", raf);
  vi.stubGlobal("cancelAnimationFrame", cancel);
  const graph = {
    destroyed: false,
    on: vi.fn((name: string, handler: Handler) => {
      const current = listeners.get(name) ?? new Set();
      current.add(handler);
      listeners.set(name, current);
    }),
    off: vi.fn((name: string, handler: Handler) => {
      listeners.get(name)?.delete(handler);
    }),
    getCanvasByViewport: vi.fn((point: number[]) => [...point]),
    getViewportByCanvas: vi.fn((point: number[]) => [...point]),
    translateBy: vi.fn((value: number[]) => {
      translated.push(value);
      return Promise.resolve();
    })
  };
  const emit = (name: string, value: unknown) => {
    for (const handler of listeners.get(name) ?? []) handler(value);
  };
  const flush = () => {
    const queued = [...frames.entries()];
    frames.clear();
    for (const [, callback] of queued) callback(0);
  };
  const pinch = new G6PinchMidpoint(graph as unknown as G6Graph);
  const finger = (id: number, x: number, y: number) => ({
    pointerType: "touch",
    pointerId: id,
    viewport: { x, y }
  });
  return { graph, pinch, emit, flush, frames, cancel, raf, translated, finger, listeners };
}

afterEach(() => vi.unstubAllGlobals());

it("registers and detaches all pointer handlers without moving after detach", () => {
  const t = harness();
  t.pinch.attach();
  for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
    expect(t.listeners.get(name)?.size).toBe(1);
  t.emit("pointerdown", t.finger(1, 20, 20));
  t.emit("pointerdown", t.finger(2, 80, 60));
  t.emit("pointermove", t.finger(1, 30, 20));
  t.pinch.detach();
  t.pinch.align();
  t.emit("pointerup", t.finger(1, 30, 20));
  t.flush();
  expect(t.translated).toEqual([]);
  for (const name of ["pointerdown", "pointermove", "pointerup", "pointercancel"])
    expect(t.listeners.get(name)?.size).toBe(0);
});

it("ignores mouse pointers, null/malformed inputs and unknown touch movement", () => {
  const t = harness();
  t.pinch.attach();
  const invalid: unknown[] = [
    null,
    0,
    {},
    { pointerType: "mouse", pointerId: 1, viewport: { x: 10, y: 15 } },
    { pointerType: "touch", pointerId: "bad", viewport: { x: 10, y: 15 } },
    { pointerType: "touch", pointerId: 1 },
    { pointerType: "touch", pointerId: 1, viewport: { x: "bad", y: 0 } },
    { pointerType: "touch", pointerId: 1, viewport: { x: 0, y: null } }
  ];
  for (const item of invalid) {
    t.emit("pointerdown", item);
    t.emit("pointermove", item);
    t.emit("pointerup", item);
  }
  t.emit("pointermove", t.finger(99, 0, 0));
  t.emit("pointerup", t.finger(99, 0, 0));
  t.emit("pointerdown", t.finger(1, 25, 40));
  t.pinch.align();
  t.emit("pointerup", t.finger(1, 25, 40));
  expect(t.translated).toEqual([]);
  expect(t.frames.size).toBe(0);
});

it("aligns ongoing pinch to both fingers midpoint and schedules final correction on release", () => {
  const t = harness();
  t.pinch.attach();
  t.emit("pointerdown", t.finger(1, 10, 20));
  t.emit("pointerdown", t.finger(2, 50, 40));
  expect(t.graph.getCanvasByViewport).toHaveBeenCalledWith([30, 30]);
  t.emit("pointermove", t.finger(1, 50, 40));
  t.pinch.align();
  expect(t.translated.at(-1)).toEqual([20, 10]);
  t.emit("pointerup", t.finger(2, 50, 40));
  expect(t.frames.size).toBe(1);
  t.flush();
  expect(t.translated.at(-1)).toEqual([20, 10]);
  t.pinch.align();
  expect(t.translated).toHaveLength(2);
  t.emit("pointerup", t.finger(1, 50, 40));
  expect(t.frames.size).toBe(0);
});

it("does not correct zero, nonfinite or destroyed viewport offsets", () => {
  const t = harness();
  t.pinch.attach();
  t.emit("pointerdown", t.finger(1, 0, 0));
  t.emit("pointerdown", t.finger(2, 100, 100));
  t.pinch.align();
  expect(t.translated).toEqual([]);
  t.graph.getViewportByCanvas.mockReturnValueOnce([Number.NaN, 0]);
  t.pinch.align();
  expect(t.translated).toEqual([]);
  t.graph.destroyed = true;
  t.emit("pointermove", t.finger(2, 125, 100));
  t.pinch.align();
  expect(t.translated).toEqual([]);
  t.graph.destroyed = false;
  t.pinch.align();
  expect(t.translated).toHaveLength(1);
});

it("cleans a pending release frame on detach and handles extra touches", () => {
  const t = harness();
  t.pinch.attach();
  t.emit("pointerdown", t.finger(1, 0, 0));
  t.emit("pointerdown", t.finger(2, 100, 100));
  t.emit("pointerdown", t.finger(3, 150, 180));
  t.emit("pointermove", t.finger(2, 120, 100));
  t.emit("pointerup", t.finger(3, 150, 180));
  expect(t.frames.size).toBe(0);
  t.emit("pointermove", t.finger(2, 120, 100));
  t.emit("pointerup", t.finger(1, 0, 0));
  expect(t.frames.size).toBe(1);
  t.pinch.detach();
  expect(t.cancel).toHaveBeenCalled();
  expect(t.frames.size).toBe(0);
  t.flush();
  expect(t.translated).toEqual([]);
});
