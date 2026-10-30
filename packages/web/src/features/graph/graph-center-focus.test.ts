import { expect, it } from "vitest";

import { centerFocusScale, centerFocusStyle } from "./graph-center-focus.js";

it("keeps the strongest magnification at the viewport center without pointer input", () => {
  expect(centerFocusScale(200, 150, 400, 300)).toBeCloseTo(1.8);
  expect(centerFocusScale(0, 150, 400, 300)).toBeCloseTo(0.82);
  expect(centerFocusScale(400, 150, 400, 300)).toBeCloseTo(0.82);
  expect(centerFocusScale(250, 150, 400, 300)).toBeGreaterThan(
    centerFocusScale(300, 150, 400, 300)
  );
  expect(centerFocusScale(250, 150, 400, 300)).toBeLessThan(1.8);
  expect(centerFocusScale(20, 20, 0, 100)).toBe(1);
  expect(centerFocusScale(Number.NaN, 20, 400, 300)).toBe(1);
});

it("projects the stronger center scale onto node and label sizes without changing positions", () => {
  expect(centerFocusStyle(1.8)).toEqual({
    size: 57.6,
    labelFontSize: 21.6,
    labelOffsetY: 18
  });
});
