import { expect, it } from "vitest";

import type { Camera, Point } from "./graph-layout.js";
import { pinchCamera, wheelZoomFactor, zoomCamera } from "./graph-viewport.js";

const camera: Camera = { x: 25, y: -40, scale: 0.8 };

function worldPoint(point: Point, view: Camera): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

function expectSamePoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

it("keeps the mouse's world anchor stationary while zooming", () => {
  const anchor = { x: 140, y: -90 };
  const next = zoomCamera(camera, 1.5, anchor);
  expect(next.scale).toBeCloseTo(1.2);
  expectSamePoint(worldPoint(anchor, next), worldPoint(anchor, camera));
  expect(camera).toEqual({ x: 25, y: -40, scale: 0.8 });
});

it("uses the canvas center as the default zoom anchor", () => {
  const next = zoomCamera(camera, 0.5);
  expect(next).toEqual({ x: 12.5, y: -20, scale: 0.4 });
  expectSamePoint(worldPoint({ x: 0, y: 0 }, next), worldPoint({ x: 0, y: 0 }, camera));
  expect(zoomCamera(camera, 1, { x: Number.MAX_VALUE, y: Number.MAX_VALUE })).toBe(camera);
});

it("clamps wheel and button zoom without drifting at either bound", () => {
  const anchor = { x: 123, y: 75 };
  const upper = zoomCamera(camera, 100, anchor);
  const lower = zoomCamera(camera, 0.0001, anchor);
  expect(upper.scale).toBe(3);
  expect(lower.scale).toBe(0.05);
  expectSamePoint(worldPoint(anchor, upper), worldPoint(anchor, camera));
  expectSamePoint(worldPoint(anchor, lower), worldPoint(anchor, camera));
  expect(zoomCamera(upper, 2, anchor)).toEqual(upper);
  expect(zoomCamera(lower, 0.5, anchor)).toEqual(lower);
});

it("ignores invalid zoom factors or anchors and repairs an invalid camera", () => {
  for (const factor of [0, -1, NaN, Infinity, -Infinity]) {
    expect(zoomCamera(camera, factor)).toBe(camera);
  }
  expect(zoomCamera(camera, 2, { x: NaN, y: 0 })).toBe(camera);
  expect(zoomCamera({ ...camera, scale: 0 }, 2)).toEqual({ x: 0, y: 0, scale: 1 });
  expect(zoomCamera({ ...camera, x: Infinity }, 2)).toEqual({ x: 0, y: 0, scale: 1 });
});

it("normalizes wheel pixels, lines, and pages consistently", () => {
  const expected = Math.exp(-40 * 0.0025);
  expect(wheelZoomFactor(40, 0, 600)).toBeCloseTo(expected);
  expect(wheelZoomFactor(2.5, 1, 600)).toBeCloseTo(expected);
  expect(wheelZoomFactor(0.1, 2, 400)).toBeCloseTo(expected);
  expect(wheelZoomFactor(-40, 0, 600)).toBeCloseTo(1 / expected);
  expect(wheelZoomFactor(40, 9, 600)).toBeCloseTo(expected);
});

it("keeps zero wheels unchanged and limits unusually large deltas", () => {
  expect(wheelZoomFactor(0, 0, 600)).toBe(1);
  expect(wheelZoomFactor(10000, 0, 600)).toBeCloseTo(Math.exp(-0.6));
  expect(wheelZoomFactor(-10000, 0, 600)).toBeCloseTo(Math.exp(0.6));
  expect(wheelZoomFactor(NaN, 0, 600)).toBe(1);
  expect(wheelZoomFactor(Infinity, 0, 600)).toBe(1);
  expect(wheelZoomFactor(0.1, 2, NaN)).toBeCloseTo(Math.exp(-80 * 0.0025));
  expect(wheelZoomFactor(0.1, 2, 0)).toBeCloseTo(Math.exp(-80 * 0.0025));
  expect(wheelZoomFactor(Number.MAX_VALUE, 1, 600)).toBe(1);
});

it("combines two-finger scaling and midpoint translation around the initial world point", () => {
  const initial = { first: { x: -50, y: -10 }, second: { x: 50, y: -10 } };
  const current = { first: { x: -60, y: 20 }, second: { x: 140, y: 20 } };
  const next = pinchCamera(camera, initial, current);
  expect(next.scale).toBeCloseTo(1.6);
  expectSamePoint(worldPoint({ x: 40, y: 20 }, next), worldPoint({ x: 0, y: -10 }, camera));
});

it("pans a same-distance pinch and respects scale bounds without losing its anchor", () => {
  const initial = { first: { x: -20, y: 0 }, second: { x: 20, y: 0 } };
  const translated = { first: { x: 10, y: 25 }, second: { x: 50, y: 25 } };
  expect(pinchCamera(camera, initial, translated)).toEqual({ ...camera, x: 55, y: -15 });
  const wide = { first: { x: -5000, y: 80 }, second: { x: 5100, y: 80 } };
  const next = pinchCamera(camera, initial, wide);
  expect(next.scale).toBe(3);
  expectSamePoint(worldPoint({ x: 50, y: 80 }, next), worldPoint({ x: 0, y: 0 }, camera));
  const narrow = { first: { x: 49.999, y: 80 }, second: { x: 50.001, y: 80 } };
  expect(pinchCamera(camera, initial, narrow).scale).toBe(0.05);
});

it("ignores degenerate or nonfinite pinch points instead of jumping", () => {
  const initial = { first: { x: -20, y: 0 }, second: { x: 20, y: 0 } };
  const zero = { first: { x: 0, y: 0 }, second: { x: 0, y: 0 } };
  const invalid = { first: { x: NaN, y: 0 }, second: { x: 20, y: 0 } };
  const overflow = {
    first: { x: -Number.MAX_VALUE, y: 0 },
    second: { x: Number.MAX_VALUE, y: 0 }
  };
  expect(pinchCamera(camera, zero, initial)).toBe(camera);
  expect(pinchCamera(camera, initial, zero)).toBe(camera);
  expect(pinchCamera(camera, invalid, initial)).toBe(camera);
  expect(pinchCamera(camera, initial, invalid)).toBe(camera);
  expect(pinchCamera(camera, initial, overflow)).toBe(camera);
  expect(pinchCamera({ ...camera, scale: NaN }, initial, initial)).toEqual({
    x: 0,
    y: 0,
    scale: 1
  });
});
