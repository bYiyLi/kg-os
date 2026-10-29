// @vitest-environment jsdom

import { expect, it } from "vitest";

import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import { graphPalette } from "./graph-g6-data.js";
import { FakeG6Graph } from "./graph-g6-test-double.js";
import { elementStates, forceLayout, newGraphOptions } from "./graph-g6-options.js";

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

it("gives ranked search nodes their own force radius and new nodes a safe fallback", () => {
  const moving = forceLayout(false, ["n:1", "n:2"]) as unknown as {
    animation: boolean;
    radial: { radius: (node: { id: string }) => number };
  };
  const reduced = forceLayout(true, ["n:1"]) as { animation: boolean };
  expect(moving.animation).toBe(true);
  expect(reduced.animation).toBe(false);
  expect(moving.radial.radius({ id: "n:1" })).toBe(80);
  expect(moving.radial.radius({ id: "n:2" })).toBeGreaterThan(80);
  expect(moving.radial.radius({ id: "n:missing" })).toBeGreaterThan(
    moving.radial.radius({ id: "n:2" })
  );
});

it("keeps the fisheye-computed label size for selected nodes with a base-size fallback", () => {
  const options = newGraphOptions({
    host: document.createElement("div"),
    surface: document.createElement("div"),
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
    reduced: false
  });
  const states = options.node?.state as Record<string, { labelFontSize: unknown }>;
  const font = states["selected"]?.labelFontSize as (node: {
    style?: { labelFontSize?: number };
  }) => number;
  expect(font({ style: { labelFontSize: 21.6 } })).toBe(21.6);
  expect(font({})).toBe(12);
});

it("applies selected, pinned, busy, expanded and focused element states independently", () => {
  const data: GraphData = {
    nodes: [
      { id: "n:1", labels: ["Example"], properties: {} },
      { id: "n:2", labels: ["Example"], properties: {} },
      { id: "n:3", labels: ["Example"], properties: {} }
    ],
    relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "LINK", properties: {} }],
    limited: false
  };
  const graph = new FakeG6Graph({ data: { nodes: [], edges: [] } });
  graph.states.set("r:1", ["focused"]);
  const states = elementStates(
    graph as unknown as G6Graph,
    {
      data,
      selected: "n:1",
      expanded: new Set(["n:1"]),
      expandingIds: new Set(["n:2"]),
      onSelect: () => undefined
    },
    new Set(["n:2"])
  );
  expect(states["n:1"]).toEqual(expect.arrayContaining(["selected", "expanded"]));
  expect(states["n:2"]).toEqual(expect.arrayContaining(["busy", "pinned"]));
  expect(states["n:3"]).toContain("unreachable");
  expect(states["r:1"]).toEqual(expect.arrayContaining(["hop-1", "focused"]));
});
