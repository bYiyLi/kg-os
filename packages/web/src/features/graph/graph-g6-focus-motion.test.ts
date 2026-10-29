import type { Graph as G6Graph } from "@antv/g6";
import { afterEach, expect, it, vi } from "vitest";

import type { GraphData } from "./graph-data.js";
import {
  GraphFocusMotion,
  radialFollowFraction,
  radialMotionEnvelope
} from "./graph-g6-focus-motion.js";
import { FakeG6Graph } from "./graph-g6-test-double.js";

const model: GraphData = {
  nodes: [
    { id: "n:1", labels: ["Example"], properties: {} },
    { id: "n:2", labels: ["Example"], properties: {} },
    { id: "n:3", labels: ["Example"], properties: {} },
    { id: "n:4", labels: ["Example"], properties: {} }
  ],
  relationships: [
    { id: "r:1", start: "n:1", end: "n:2", type: "LINK", properties: {} },
    { id: "r:2", start: "n:2", end: "n:3", type: "LINK", properties: {} }
  ],
  limited: false
};

function motionHarness() {
  let now = 0;
  let counter = 1;
  const frames = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    const id = counter++;
    frames.set(id, fn);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const graph = new FakeG6Graph({
    data: {
      nodes: [
        { id: "n:1", style: { x: 0, y: 0 } },
        { id: "n:2", style: { x: 20, y: 0 } },
        { id: "n:3", style: { x: 30, y: 0 } },
        { id: "n:4", style: { x: 700, y: 700 } }
      ],
      edges: []
    }
  });
  const motion = new GraphFocusMotion(graph as unknown as G6Graph);
  async function frame(at: number) {
    now = at;
    const next = [...frames.values()];
    frames.clear();
    next.forEach((fn) => {
      fn(at);
    });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }
  return {
    graph,
    motion,
    frames,
    frame,
    setTime: (t: number) => {
      now = t;
    },
    position: (id: string) => graph.getElementPosition(id)
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("damps successively more distant hop rings instead of translating the graph rigidly", () => {
  const movement = Array.from(
    { length: 6 },
    (_, index) => 160 * radialFollowFraction(160, index + 1, false)
  );
  expect(movement[0]).toBeCloseTo(16, 4);
  expect(movement[1]).toBeCloseTo(8.4, 4);
  expect(movement[5]).toBeCloseTo(2.8, 4);
  for (let index = 1; index < movement.length; index++) {
    expect(movement[index]).toBeLessThan(movement[index - 1] ?? 0);
  }
});

it("keeps micro-adjustments stable and honors reduced-motion preferences", () => {
  expect(radialFollowFraction(1.5, 4, false)).toBe(1);
  expect(radialFollowFraction(160, 6, true)).toBe(1);
  expect(radialFollowFraction(160, 0, false)).toBe(radialFollowFraction(160, 1, false));
});

it("eases movement in from rest instead of jumping to full speed", () => {
  expect(radialMotionEnvelope(0)).toBe(0);
  expect(radialMotionEnvelope(105)).toBeCloseTo(0.5, 5);
  expect(radialMotionEnvelope(210)).toBe(1);
  expect(radialMotionEnvelope(500)).toBe(1);
  expect(radialMotionEnvelope(1)).toBeLessThan(0.001);
  expect(radialMotionEnvelope(10)).toBeLessThan(radialMotionEnvelope(80));
  expect(radialMotionEnvelope(80)).toBeLessThan(radialMotionEnvelope(210));
});

it("smoothly brakes from the reached speed and fully stops within 210 milliseconds", () => {
  const atRelease = radialMotionEnvelope(105);
  expect(radialMotionEnvelope(105, 0)).toBe(atRelease);
  expect(radialMotionEnvelope(105, 105)).toBeCloseTo(atRelease * 0.5, 5);
  expect(radialMotionEnvelope(105, 210)).toBe(0);
  expect(radialMotionEnvelope(105, 400)).toBe(0);
  expect(radialMotionEnvelope(210, 1)).toBeGreaterThan(0.999);
  expect(radialMotionEnvelope(210, 209)).toBeLessThan(0.001);
  for (let elapsed = 1; elapsed <= 210; elapsed++) {
    expect(radialMotionEnvelope(105, elapsed)).toBeLessThanOrEqual(
      radialMotionEnvelope(105, elapsed - 1)
    );
  }
});

it("gradually arranges loaded neighbors and stops after bounded release", async () => {
  const t = motionHarness();
  expect(t.motion.activeFocusId).toBeNull();
  t.motion.focus(model, "n:1", new Set(["n:4"]));
  expect(t.motion.activeFocusId).toBe("n:1");
  expect(t.frames.size).toBe(1);
  await t.frame(0);
  expect(t.position("n:2")).toEqual([20, 0]);
  await t.frame(120);
  const mid = t.position("n:2");
  expect(mid[0]).toBeGreaterThan(20);
  expect(mid[0]).toBeLessThan(178);
  expect(t.position("n:4")).toEqual([700, 700]);
  t.motion.focus(model, "n:1", new Set());
  expect(t.motion.activeFocusId).toBe("n:1");
  t.motion.wake();
  t.setTime(175);
  t.motion.release();
  t.motion.release();
  await t.frame(210);
  expect(t.motion.activeFocusId).toBe("n:1");
  await t.frame(400);
  expect(t.motion.activeFocusId).toBeNull();
  expect(t.frames.size).toBe(0);
  expect(t.graph.calls).toContain("draw");
});

it("does not start motion with no focused node or a missing world position", async () => {
  const t = motionHarness();
  t.motion.wake();
  t.motion.release();
  t.motion.focus(model, null, new Set());
  t.motion.focus(model, "n:missing", new Set());
  expect(t.motion.activeFocusId).toBeNull();
  expect(t.frames.size).toBe(0);
  t.motion.focus(model, "n:1", new Set(["n:2", "n:3"]), true);
  expect(t.motion.activeFocusId).toBe("n:1");
  await t.frame(0);
  t.motion.release();
  expect(t.motion.activeFocusId).toBeNull();
  expect(t.frames.size).toBe(0);
});

it("can restart after release but never leaves canceled animation frames alive", async () => {
  const t = motionHarness();
  t.motion.focus(model, "n:1", new Set());
  await t.frame(110);
  t.motion.release();
  t.motion.focus(model, "n:1", new Set());
  expect(t.motion.activeFocusId).toBe("n:1");
  await t.frame(140);
  t.motion.stop();
  t.motion.stop();
  expect(t.frames.size).toBe(0);
  await t.frame(230);
  expect(t.motion.activeFocusId).toBeNull();
});

it("cancels if the graph was destroyed and tolerates rejected draw promises", async () => {
  const t = motionHarness();
  const draw = vi.fn(() => Promise.reject(new Error("canvas unavailable")));
  t.graph.draw = draw;
  t.motion.focus(model, "n:1", new Set());
  await t.frame(140);
  expect(draw).toHaveBeenCalled();
  t.motion.stop();
  t.graph.destroyed = true;
  t.motion.focus(model, "n:1", new Set());
  await t.frame(170);
  expect(t.motion.activeFocusId).toBe("n:1");
  t.motion.stop();
});
