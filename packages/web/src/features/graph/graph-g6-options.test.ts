// @vitest-environment jsdom

import { expect, it } from "vitest";

import { graphPalette } from "./graph-g6-data.js";
import { newGraphOptions } from "./graph-g6-options.js";

it("uses the same accent color for all reachable hop edges with the requested progressive widths and opacity", () => {
  const host = document.createElement("div");
  const surface = document.createElement("div");
  const accent = graphPalette(surface).accent;
  const options = newGraphOptions({
    host,
    surface,
    props: {
      data: {
        nodes: [{ id: "n:1", labels: ["Example"], properties: {} }],
        relationships: [],
        limited: false
      },
      selected: "n:1",
      onSelect: () => undefined
    },
    pinned: new Set(),
    reduced: true
  });
  const state = options.edge?.state as Record<
    string,
    { stroke?: string; opacity?: number; lineWidth?: number }
  >;
  const steps: readonly [string, number, number][] = [
    ["hop-1", 1, 2.6],
    ["hop-2", 0.9, 2.4],
    ["hop-3", 0.8, 2.15],
    ["hop-4", 0.65, 1.9],
    ["hop-5", 0.4, 1.6],
    ["hop-6", 0.1, 1.3]
  ];
  for (const [tier, opacity, lineWidth] of steps)
    expect(state[tier]).toMatchObject({ stroke: accent, opacity, lineWidth });
  expect(state["unreachable"]).toMatchObject({ opacity: 0.1, lineWidth: 1.25 });
  expect(state["unreachable"]?.stroke).toBeUndefined();
  expect(state["selected"]).toMatchObject({ stroke: accent, opacity: 1, lineWidth: 3.4 });
});
