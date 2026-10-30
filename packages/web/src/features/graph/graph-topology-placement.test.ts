import { expect, it } from "vitest";

import type { GraphData } from "./graph-data.js";
import { topologySeedPositions } from "./graph-topology-placement.js";

function data(ids: number[], edges: [number, number][]): GraphData {
  return {
    nodes: ids.map((id) => ({ id: "n:" + String(id), labels: ["Example"], properties: {} })),
    relationships: edges.map(([start, end], index) => ({
      id: "r:" + String(index + 1),
      type: "LINK",
      start: "n:" + String(start),
      end: "n:" + String(end),
      properties: {}
    })),
    limited: false
  };
}

function spacing(points: ReadonlyMap<string, { x: number; y: number }>): number {
  const values = [...points.values()];
  let minimum = Infinity;
  for (const [index, a] of values.entries()) {
    for (const b of values.slice(index + 1))
      minimum = Math.min(minimum, Math.hypot(a.x - b.x, a.y - b.y));
  }
  return minimum;
}

it("places connected groups together, with no initial overlaps or input-order jitter", () => {
  const graph = data(
    [12, 3, 1, 11, 2, 10, 4],
    [
      [1, 2],
      [2, 3],
      [3, 4],
      [10, 11],
      [11, 12]
    ]
  );
  const positions = topologySeedPositions(graph, new Map());
  expect(positions.size).toBe(7);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
  const centroid = (ids: number[]) => {
    const points = ids.flatMap((id) => {
      const point = positions.get("n:" + String(id));
      return point === undefined ? [] : [point];
    });
    expect(points).toHaveLength(ids.length);
    return {
      x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
      y: points.reduce((sum, p) => sum + p.y, 0) / points.length
    };
  };
  const first = centroid([1, 2, 3, 4]);
  const second = centroid([10, 11, 12]);
  expect(Math.hypot(first.x - second.x, first.y - second.y)).toBeGreaterThan(500);
  expect(
    topologySeedPositions(
      {
        ...graph,
        nodes: [...graph.nodes].reverse(),
        relationships: [...graph.relationships].reverse()
      },
      new Map()
    )
  ).toEqual(positions);
});

it("preserves existing placements while filling only genuinely new neighbors", () => {
  const graph = data(
    [1, 2, 3, 4, 5],
    [
      [1, 2],
      [1, 3],
      [3, 4],
      [5, 5]
    ]
  );
  const previous = new Map([
    ["n:1", { x: 540, y: -320 }],
    ["n:2", { x: 730, y: -320 }],
    ["n:3", { x: NaN, y: Infinity }]
  ]);
  const positions = topologySeedPositions(graph, previous);
  expect(positions.size).toBe(5);
  expect(positions.get("n:1")).toEqual({ x: 540, y: -320 });
  expect(positions.get("n:2")).toEqual({ x: 730, y: -320 });
  expect(Number.isFinite(positions.get("n:3")?.x)).toBe(true);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
  expect(previous.get("n:3")?.x).toBeNaN();
});

it("ignores parallel duplicates, self-loops and links to unloaded nodes without inventing connections", () => {
  const graph = data(
    [1, 2, 3],
    [
      [1, 2],
      [2, 1],
      [1, 1],
      [2, 99]
    ]
  );
  const original = JSON.stringify(graph);
  const positions = topologySeedPositions(graph, new Map());
  expect(positions.size).toBe(3);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
  // Repeated real links and disconnected/unloaded endpoints must not scatter
  // the connected pair or create synthetic nodes in the visualization.
  expect(topologySeedPositions(data([1, 2, 3], [[1, 2]]), new Map())).toEqual(positions);
  expect(JSON.stringify(graph)).toBe(original);
  expect(positions.has("n:99")).toBe(false);
});

it("keeps a previously pinned isolated node clear when a new connected group occupies its region", () => {
  const graph = data(
    [1, 2, 3, 10],
    [
      [1, 2],
      [2, 3]
    ]
  );
  const pinned = new Map([["n:10", { x: 0, y: 0 }]]);
  const positions = topologySeedPositions(graph, pinned);
  expect(positions.get("n:10")).toEqual({ x: 0, y: 0 });
  expect(positions.size).toBe(4);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
  expect(topologySeedPositions(graph, pinned)).toEqual(positions);
});

it("does not cram large sets of unrelated results into a central pile", () => {
  const graph = data(
    Array.from({ length: 80 }, (_, index) => index + 1),
    []
  );
  const positions = topologySeedPositions(graph, new Map());
  expect(positions.size).toBe(80);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
});

it("keeps dense connected search results complete and clear of node overlaps", () => {
  const ids = Array.from({ length: 200 }, (_, index) => index + 1);
  const edges: [number, number][] = ids.slice(1).map((id) => [id - 1, id]);
  edges.push(...ids.slice(2).map((id): [number, number] => [id - 2, id]));
  const positions = topologySeedPositions(data(ids, edges), new Map());
  expect(positions.size).toBe(200);
  expect(spacing(positions)).toBeGreaterThanOrEqual(168 - 0.001);
  expect(
    [...positions.values()].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  ).toBe(true);
});
