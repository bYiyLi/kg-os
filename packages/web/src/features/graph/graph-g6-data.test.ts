import { describe, expect, it } from "vitest";

import type { GraphData } from "./graph-data.js";
import { graphToG6 } from "./graph-g6-data.js";
import type { GraphPalette } from "./graph-g6-data.js";

const palette: GraphPalette = {
  node: ["#111111", "#222222", "#333333", "#444444"],
  canvas: "#000000",
  text: "#ffffff",
  edge: "#999999",
  accent: "#3388ff"
};
const graph: GraphData = {
  nodes: [
    { id: "n:2", labels: ["Document"], properties: { name: "Second" } },
    { id: "n:1", labels: ["Document"], properties: { name: "First" } }
  ],
  relationships: [
    { id: "r:2", start: "n:1", end: "n:2", type: "LINK", properties: {} },
    { id: "r:1", start: "n:1", end: "n:2", type: "LINK", properties: {} },
    { id: "r:3", start: "n:1", end: "n:1", type: "SELF", properties: {} }
  ],
  limited: false
};

describe("G6 projection", () => {
  it("preserves typed identities, parallel edges and self-loops without exposing business properties", () => {
    const before = JSON.stringify(graph);
    const result = graphToG6({
      data: graph,
      previous: new Map(),
      pinned: new Set(),
      selected: null,
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    expect(result.nodes?.map((item) => item.id)).toEqual(["n:1", "n:2"]);
    expect(result.edges?.map((item) => item.id)).toEqual(["r:1", "r:2", "r:3"]);
    expect(result.edges?.[0]?.source).toBe("n:1");
    expect(result.edges?.[1]?.style?.["curveOffset"]).not.toBe(
      result.edges?.[0]?.style?.["curveOffset"]
    );
    expect(result.edges?.[2]?.style?.loop).toBe(true);
    expect(result.nodes?.[0]?.style).toMatchObject({ opacity: 1, labelOpacity: 1 });
    expect(result.edges?.[0]?.style).toMatchObject({ opacity: 1, labelOpacity: 1 });
    expect(JSON.stringify(result)).not.toContain("LINK");
    expect(JSON.stringify(graph)).toBe(before);
  });

  it("preserves manually pinned nodes in their precise location and local selection styles", () => {
    const previous = new Map([["n:1", { x: 402, y: -80 }]]);
    const result = graphToG6({
      data: graph,
      previous,
      pinned: new Set(["n:1"]),
      selected: "n:1",
      expanded: new Set(["n:2"]),
      expanding: new Set(["n:1"]),
      palette
    });
    const first = result.nodes?.find((node) => node.id === "n:1");
    const second = result.nodes?.find((node) => node.id === "n:2");
    expect(first?.style).toMatchObject({ x: 402, y: -80, fx: 402, fy: -80 });
    expect(first?.states).toEqual(["selected", "busy", "pinned"]);
    expect(second?.states).toEqual(["expanded"]);
    expect(second?.style?.x).not.toEqual(first?.style?.x);
  });

  it("reuses positions across data reordering and never accepts invalid coordinates", () => {
    const previous = new Map<string, { x: number; y: number }>([
      ["n:2", { x: 5, y: -10 }],
      ["n:1", { x: NaN, y: Infinity }]
    ]);
    const original = graphToG6({
      data: graph,
      previous,
      pinned: new Set(),
      selected: null,
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    const reordered = graphToG6({
      data: { ...graph, nodes: [...graph.nodes].reverse() },
      previous,
      pinned: new Set(),
      selected: null,
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    expect(original).toEqual(reordered);
    expect(Number.isFinite(original.nodes?.[0]?.style?.x)).toBe(true);
    expect(original.nodes?.find((node) => node.id === "n:2")?.style).toMatchObject({
      x: 5,
      y: -10
    });
  });

  it("handles empty graphs and highlights a selected edge independently", () => {
    const empty = graphToG6({
      data: { nodes: [], relationships: [], limited: false },
      previous: new Map(),
      pinned: new Set(),
      selected: null,
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    expect(empty.nodes).toEqual([]);
    expect(empty.edges).toEqual([]);
    const selected = graphToG6({
      data: graph,
      previous: new Map(),
      pinned: new Set(),
      selected: "r:1",
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    expect(selected.edges?.[0]?.states).toEqual(["selected"]);
    // Parallel edges have the same two real selected endpoints.
    expect(selected.edges?.[1]?.states).toEqual(["hop-1"]);
  });

  it("assigns each real multi-hop edge the same gradual visibility tier as its farthest endpoint", () => {
    const nodes = Array.from({ length: 9 }, (_, index) => ({
      id: "n:" + String(index + 1),
      labels: ["Example"],
      properties: { title: "Node " + String(index + 1) }
    }));
    const relationships = Array.from({ length: 7 }, (_, index) => ({
      id: "r:" + String(index + 1),
      start: "n:" + String(index + 1),
      end: "n:" + String(index + 2),
      type: "LINK",
      properties: {}
    }));
    const projected = graphToG6({
      data: { nodes, relationships, limited: false },
      previous: new Map(),
      pinned: new Set(),
      selected: "n:1",
      expanded: new Set(),
      expanding: new Set(),
      palette
    });
    expect(projected.edges?.map((edge) => edge.states)).toEqual([
      ["hop-1"],
      ["hop-2"],
      ["hop-3"],
      ["hop-4"],
      ["hop-5"],
      ["hop-6"],
      ["hop-6"]
    ]);
    expect(projected.nodes?.find((node) => node.id === "n:9")?.states).toEqual(["unreachable"]);
    expect(projected.edges?.every((edge) => edge.style?.opacity === 1)).toBe(true);
  });
});
