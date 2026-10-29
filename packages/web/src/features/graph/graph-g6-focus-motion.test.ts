import { expect, it } from "vitest";

import { radialFollowFraction, radialMotionEnvelope } from "./graph-g6-focus-motion.js";

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
