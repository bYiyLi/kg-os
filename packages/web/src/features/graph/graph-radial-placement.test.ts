import { expect, it } from "vitest";

import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import { graphAttention, readableNodeIds } from "./graph-attention.js";
import { focusLayerPositions, radialNeighborPositions } from "./graph-radial-placement.js";

function node(id: number): GraphNode {
  return {
    id: "n:" + String(id),
    labels: ["Example"],
    properties: { title: "Item " + String(id) }
  };
}
function link(id: number, start: number, end: number): GraphRelationship {
  return {
    id: "r:" + String(id),
    start: "n:" + String(start),
    end: "n:" + String(end),
    type: "LINK",
    properties: {}
  };
}
function data(nodes: number[], edges: GraphRelationship[]): GraphData {
  return { nodes: nodes.map(node), relationships: edges, limited: false };
}

it("keeps every real search result visible and highlights only actual one-hop relationships", () => {
  const graph = data([1, 2, 3, 4], [link(1, 1, 2), link(2, 2, 3), link(3, 2, 2)]);
  expect(graphAttention(graph, "n:2")).toMatchObject({
    active: true,
    nearNodes: new Set(["n:2", "n:1", "n:3"]),
    nearEdges: new Set(["r:1", "r:2", "r:3"])
  });
  expect(graphAttention(graph, "r:1").nearNodes).toEqual(new Set(["n:1", "n:2", "n:3"]));
  expect(graphAttention(graph, null).active).toBe(false);
  expect(readableNodeIds(graph, null).size).toBe(4);
  expect(readableNodeIds(graph, "n:2")).toEqual(new Set(["n:1", "n:2", "n:3"]));
});

it("places only real newly queried neighbors in a first ring around the existing origin", () => {
  const graph = data([1, 2, 3, 4], [link(1, 1, 2), link(2, 1, 3), link(3, 1, 4)]);
  const previous = new Map([["n:1", { x: 720, y: -310 }]]);
  const placed = radialNeighborPositions(graph, previous, new Set(["n:1"]));
  expect(placed.size).toBe(3);
  for (const neighbor of ["n:2", "n:3", "n:4"]) {
    const point = placed.get(neighbor);
    expect(point).toBeDefined();
    expect(Math.hypot((point?.x ?? NaN) - 720, (point?.y ?? NaN) + 310)).toBeCloseTo(220, 4);
  }
  expect(previous.size).toBe(1);
});

it("uses additional visual rings for a crowded one-hop without inventing extra hops", () => {
  const ids = Array.from({ length: 21 }, (_, i) => i + 2);
  const graph = data(
    [1, ...ids],
    ids.map((id, i) => link(i + 1, 1, id))
  );
  const placed = radialNeighborPositions(
    graph,
    new Map([["n:1", { x: 0, y: 0 }]]),
    new Set(["n:1"])
  );
  const radii = [...placed.values()].map((point) => Math.round(Math.hypot(point.x, point.y)));
  expect(radii.filter((radius) => radius === 220)).toHaveLength(8);
  expect(radii.filter((radius) => radius === 405)).toHaveLength(12);
  expect(radii.filter((radius) => radius === 590)).toHaveLength(1);
});

it("prefers the real expanded origin over another connected visible node", () => {
  const graph = data([1, 2, 3], [link(1, 1, 3), link(2, 2, 3)]);
  const previous = new Map([
    ["n:1", { x: -400, y: 0 }],
    ["n:2", { x: 400, y: 0 }]
  ]);
  const placed = radialNeighborPositions(graph, previous, new Set(["n:2"]));
  const point = placed.get("n:3");
  expect(point).toBeDefined();
  expect(Math.hypot((point?.x ?? NaN) - 400, point?.y ?? NaN)).toBeCloseTo(220, 4);
  expect(radialNeighborPositions(graph, new Map(), new Set(["n:2"]))).toEqual(new Map());
});

it("places newly exposed neighbors without overlapping existing nodes or each other", () => {
  const graph = data(
    Array.from({ length: 14 }, (_, index) => index + 1),
    Array.from({ length: 12 }, (_, index) => link(index + 1, 1, index + 3))
  );
  const previous = new Map([
    ["n:1", { x: 0, y: 0 }],
    ["n:2", { x: 220, y: 0 }]
  ]);
  const placed = radialNeighborPositions(graph, previous, new Set(["n:1"]));
  expect(placed.size).toBe(12);
  const points = [...previous.values(), ...placed.values()];
  for (const [index, a] of points.entries()) {
    for (const b of points.slice(index + 1)) {
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(168 - 0.001);
    }
  }
  expect(previous.get("n:2")).toEqual({ x: 220, y: 0 });
  expect(radialNeighborPositions(graph, previous, new Set(["n:1"]))).toEqual(placed);
});

it("orders all reachable hops around the chosen node without moving pinned or disconnected nodes", () => {
  const graph = data(
    [1, 2, 3, 4, 5, 6, 7, 8],
    [link(1, 1, 2), link(2, 1, 3), link(3, 2, 4), link(4, 3, 5), link(5, 4, 6)]
  );
  const previous = new Map([
    ["n:1", { x: 500, y: 500 }],
    ["n:2", { x: 710, y: 530 }],
    ["n:3", { x: 365, y: 580 }],
    ["n:4", { x: 790, y: 830 }],
    ["n:5", { x: 210, y: 175 }],
    ["n:6", { x: 900, y: 900 }],
    ["n:7", { x: -500, y: -500 }],
    ["n:8", { x: 950, y: -800 }]
  ]);
  const old = new Map(previous);
  const pinned = new Set(["n:1", "n:2", "n:7"]);
  const result = focusLayerPositions(graph, previous, "n:1", pinned);
  expect(result.has("n:1")).toBe(false);
  expect(result.has("n:2")).toBe(false);
  expect(result.has("n:6")).toBe(true);
  expect(result.has("n:7")).toBe(false);
  expect(result.has("n:8")).toBe(false);
  expect(
    Math.hypot((result.get("n:3")?.x ?? NaN) - 500, (result.get("n:3")?.y ?? NaN) - 500)
  ).toBeCloseTo(178, 3);
  for (const id of ["n:4", "n:5"]) {
    const point = result.get(id);
    expect(point).toBeDefined();
    expect(Math.hypot((point?.x ?? NaN) - 500, (point?.y ?? NaN) - 500)).toBeCloseTo(346, 3);
  }
  const third = result.get("n:6");
  expect(Math.hypot((third?.x ?? NaN) - 500, (third?.y ?? NaN) - 500)).toBeCloseTo(514, 3);
  expect(previous).toEqual(old);
  expect(focusLayerPositions(graph, previous, "n:1", pinned)).toEqual(result);
});

it("keeps stable angular ordering when the graph rows are reordered", () => {
  const graph = data([1, 2, 3, 4], [link(1, 1, 2), link(2, 1, 3), link(3, 1, 4)]);
  const previous = new Map([
    ["n:1", { x: 0, y: 0 }],
    ["n:2", { x: 310, y: -20 }],
    ["n:3", { x: 20, y: 310 }],
    ["n:4", { x: -280, y: 25 }]
  ]);
  const original = focusLayerPositions(graph, previous, "n:1", new Set());
  const reversed = focusLayerPositions(
    {
      ...graph,
      nodes: [...graph.nodes].reverse(),
      relationships: [...graph.relationships].reverse()
    },
    previous,
    "n:1",
    new Set()
  );
  expect(original).toEqual(reversed);
  expect(focusLayerPositions(graph, new Map(), "n:1", new Set())).toEqual(new Map());
});

it("chooses an existing anchor deterministically and ignores unconnected discoveries", () => {
  const graph = data([1, 2, 3, 4], [link(1, 3, 1), link(2, 2, 3)]);
  const previous = new Map([
    ["n:1", { x: -500, y: 80 }],
    ["n:2", { x: 500, y: -80 }]
  ]);
  const tie = radialNeighborPositions(graph, previous, new Set());
  expect(tie.has("n:3")).toBe(true);
  expect(tie.has("n:4")).toBe(false);
  expect(Math.hypot((tie.get("n:3")?.x ?? NaN) + 500, (tie.get("n:3")?.y ?? NaN) - 80)).toBeCloseTo(
    220,
    4
  );
  const expanded = radialNeighborPositions(graph, previous, new Set(["n:2"]));
  expect(
    Math.hypot((expanded.get("n:3")?.x ?? NaN) - 500, (expanded.get("n:3")?.y ?? NaN) + 80)
  ).toBeCloseTo(220, 4);
});

it("rejects a nonfinite focus center before assigning any reachable coordinates", () => {
  const graph = data([1, 2], [link(1, 1, 2)]);
  for (const invalid of [NaN, Infinity, -Infinity]) {
    expect(
      focusLayerPositions(
        graph,
        new Map([
          ["n:1", { x: 20, y: invalid }],
          ["n:2", { x: 100, y: 200 }]
        ]),
        "n:1",
        new Set()
      )
    ).toEqual(new Map());
  }
});

it("keeps reachable outer-hop positions when an intermediate hop is not yet visible", () => {
  const graph = data([1, 2, 3, 4], [link(1, 1, 2), link(2, 2, 3), link(3, 3, 4)]);
  const previous = new Map([
    ["n:1", { x: 0, y: 0 }],
    ["n:2", { x: 250, y: 0 }],
    ["n:4", { x: 720, y: 0 }]
  ]);
  const planned = focusLayerPositions(graph, previous, "n:1", new Set(["n:2"]));
  expect(planned.has("n:2")).toBe(false);
  expect(planned.has("n:3")).toBe(false);
  expect(Math.hypot(planned.get("n:4")?.x ?? NaN, planned.get("n:4")?.y ?? NaN)).toBeCloseTo(
    514,
    3
  );
  expect(previous.get("n:4")).toEqual({ x: 720, y: 0 });
});

it("moves no pinned neighbors while keeping the center and unrelated nodes fixed", () => {
  const graph = data([1, 2, 3, 4], [link(1, 1, 2), link(2, 1, 3)]);
  const previous = new Map([
    ["n:1", { x: 0, y: 0 }],
    ["n:2", { x: 200, y: 0 }],
    ["n:3", { x: -200, y: 0 }],
    ["n:4", { x: 0, y: 500 }]
  ]);
  const pins = new Set(["n:2", "n:3"]);
  expect(focusLayerPositions(graph, previous, "n:1", pins)).toEqual(new Map());
  expect(previous.get("n:4")).toEqual({ x: 0, y: 500 });
});
