import { expect, it } from "vitest";

import { nodeCaption } from "./graph-data.js";
import type { GraphData, GraphRelationship } from "./graph-data.js";
import { fitGraph, initialGraphPositions, layoutGraph, relationshipPaths } from "./graph-layout.js";
import type { Point } from "./graph-layout.js";

function relation(id: string, start: string, end: string): GraphRelationship {
  return { id, start, end, type: "CONNECTS", properties: {} };
}

function data(ids: string[], relationships: GraphRelationship[] = []): GraphData {
  return {
    nodes: ids.map((id) => ({ id, labels: [], properties: {} })),
    relationships,
    limited: false
  };
}

it("uses deterministic finite positions regardless of input node order", () => {
  const first = layoutGraph(data(["n:1", "n:2", "n:3"], [relation("r:1", "n:1", "n:2")]));
  const reordered = layoutGraph(data(["n:3", "n:1", "n:2"], [relation("r:1", "n:1", "n:2")]));
  expect(first).toEqual(reordered);
  expect(first.size).toBe(3);
  for (const point of first.values()) {
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
  }
  expect(
    new Set([...first.values()].map((point) => `${String(point.x)},${String(point.y)}`)).size
  ).toBe(3);
});

it("preserves dragged existing nodes exactly when neighbors are expanded", () => {
  const previous = new Map([
    ["n:1", { x: -130, y: 72 }],
    ["n:2", { x: 80, y: -30 }],
    ["n:removed", { x: 100, y: 100 }]
  ]);
  const after = layoutGraph(
    data(["n:1", "n:2", "n:3"], [relation("r:1", "n:1", "n:3")]),
    previous,
    new Set(["n:1", "n:2"])
  );
  expect(after.get("n:1")).toEqual(previous.get("n:1"));
  expect(after.get("n:2")).toEqual(previous.get("n:2"));
  expect(after.has("n:removed")).toBe(false);
  expect(after.get("n:3")).toBeDefined();
  expect(previous.has("n:3")).toBe(false);
});

it("handles empty data and replaces invalid saved coordinates", () => {
  expect(layoutGraph(data([]))).toEqual(new Map());
  const positions = layoutGraph(data(["n:1"]), new Map([["n:1", { x: NaN, y: Infinity }]]));
  expect(Number.isFinite(positions.get("n:1")?.x)).toBe(true);
  expect(Number.isFinite(positions.get("n:1")?.y)).toBe(true);
});

it("separates a new result that begins at an existing node's dragged position", () => {
  const angle = 2.3999632297;
  const existing = {
    x: Math.cos(angle) * 54 * Math.sqrt(2),
    y: Math.sin(angle) * 54 * Math.sqrt(2)
  };
  const positions = layoutGraph(
    data(["n:1", "n:2"]),
    new Map([["n:1", existing]]),
    new Set(["n:1"])
  );
  expect(positions.get("n:1")).toEqual(existing);
  expect(positions.get("n:2")).not.toEqual(existing);
  expect(Number.isFinite(positions.get("n:2")?.x)).toBe(true);
});

it("lays out available nodes when a relationship is a self loop or has an unloaded endpoint", () => {
  const positions = layoutGraph(
    data(["n:1"], [relation("r:1", "n:1", "n:1"), relation("r:2", "n:1", "n:missing")])
  );
  expect(positions.size).toBe(1);
  expect(Number.isFinite(positions.get("n:1")?.x)).toBe(true);
});

it("relaxes a 22-node result when real relationships arrive instead of freezing its scatter", () => {
  const ids = Array.from({ length: 22 }, (_, index) => "n:" + String(index + 1));
  const before = layoutGraph(data(ids));
  const edges = ids.slice(1).map((id, index) => relation("r:" + String(index), "n:1", id));
  const after = layoutGraph(data(ids, edges), before);
  const cost = (points: Map<string, { x: number; y: number }>) =>
    edges.reduce((sum, edge) => {
      const left = points.get(edge.start);
      const right = points.get(edge.end);
      if (left === undefined || right === undefined) throw new Error("Missing layout node");
      return sum + (Math.hypot(left.x - right.x, left.y - right.y) - 115) ** 2;
    }, 0);
  expect(cost(after)).toBeLessThan(cost(before) * 0.5);
  expect([...after].some(([id, point]) => point.x !== before.get(id)?.x)).toBe(true);
});

it("uses a unique adjacency constraint for parallel and reverse relationships", () => {
  const graph = data(["n:1", "n:2", "n:3"], [relation("r:1", "n:1", "n:2")]);
  const single = layoutGraph(graph);
  graph.relationships.push(relation("r:2", "n:1", "n:2"), relation("r:3", "n:2", "n:1"));
  expect(layoutGraph(graph)).toEqual(single);
});

it("starts a new neighbor near its existing anchor and keeps the old position immutable", () => {
  const previous = new Map([["n:1", { x: 400, y: -300 }]]);
  const born = initialGraphPositions(
    data(["n:1", "n:2"], [relation("r:1", "n:1", "n:2")]),
    previous
  );
  const point = born.get("n:2");
  expect(point).toBeDefined();
  expect(Math.hypot((point?.x ?? 0) - 400, (point?.y ?? 0) + 300)).toBeCloseTo(85);
  expect(previous).toEqual(new Map([["n:1", { x: 400, y: -300 }]]));
});

it("keeps 200-node layout output finite with pinned points and many directed relationships", () => {
  const ids = Array.from({ length: 200 }, (_, index) => "n:" + String(index));
  const edges = ids.slice(1).map((id, index) => relation("r:" + String(index), "n:0", id));
  const graph = data(ids, edges);
  const previous = new Map([["n:0", { x: -220, y: 130 }]]);
  const positions = layoutGraph(graph, previous, new Set(["n:0"]));
  expect(positions.get("n:0")).toEqual(previous.get("n:0"));
  expect(positions.size).toBe(200);
  expect([...positions.values()].every((point) => Number.isFinite(point.x + point.y))).toBe(true);
});

it("fits a large graph inside a narrow view with space for search and controls", () => {
  const points = new Map([
    ["n:1", { x: -800, y: -400 }],
    ["n:2", { x: 800, y: 400 }]
  ]);
  const width = 300;
  const height = 600;
  const camera = fitGraph(points, width, height, data([...points.keys()]));
  for (const point of points.values()) {
    const x = point.x * camera.scale + width / 2 + camera.x;
    const y = point.y * camera.scale + height / 2 + camera.y;
    expect(x).toBeGreaterThan(20);
    expect(x).toBeLessThan(width - 20);
    expect(y).toBeGreaterThan(80);
    expect(y).toBeLessThan(height - 60);
  }
});

it("returns a safe camera for empty graphs and invalid viewport measurements", () => {
  const point = new Map([["n:1", { x: 0, y: 0 }]]);
  expect(fitGraph(new Map(), 800, 600, data([]))).toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitGraph(point, 0, 600, data([]))).toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitGraph(point, NaN, 600, data([]))).toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitGraph(point, 800, 0, data([]))).toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitGraph(point, 800, NaN, data([]))).toEqual({ x: 0, y: 0, scale: 1 });
  expect(fitGraph(point, 800, 600, data([])).scale).toBe(2);
});

it("keeps parallel, reverse and self relationships individually visible", () => {
  const relationships = [
    relation("r:1", "n:1", "n:2"),
    relation("r:2", "n:1", "n:2"),
    relation("r:3", "n:2", "n:1"),
    relation("r:4", "n:1", "n:1"),
    relation("r:5", "n:1", "n:1")
  ];
  const positions = new Map([
    ["n:1", { x: 0, y: 0 }],
    ["n:2", { x: 150, y: 0 }]
  ]);
  const paths = relationshipPaths(relationships, positions);
  expect(paths.size).toBe(5);
  expect(new Set([...paths.values()].map((item) => item.path)).size).toBe(5);
  expect(paths.get("r:1")?.path.startsWith("M 14 0 ")).toBe(true);
  expect(paths.get("r:3")?.path.startsWith("M 136 0 ")).toBe(true);
  expect(paths.get("r:4")?.path).toContain(" C ");
  expect(paths.get("r:1")?.path).not.toContain("NaN");
});

it("never invents an edge when an endpoint is absent", () => {
  const positions = new Map([["n:1", { x: 0, y: 0 }]]);
  expect(relationshipPaths([relation("r:1", "n:1", "n:missing")], positions).size).toBe(0);
});

it("omits unusable coordinates and supports overlapping endpoints without invalid geometry", () => {
  const relationships = [
    relation("r:1", "n:missing", "n:1"),
    relation("r:2", "n:1", "n:invalid"),
    relation("r:3", "n:invalid", "n:1"),
    relation("r:4", "n:1", "n:2")
  ];
  const paths = relationshipPaths(
    relationships,
    new Map([
      ["n:1", { x: 0, y: 0 }],
      ["n:2", { x: 0, y: 0 }],
      ["n:invalid", { x: NaN, y: 1 }]
    ])
  );
  expect([...paths.keys()]).toEqual(["r:4"]);
  expect(paths.get("r:4")?.path).not.toMatch(/NaN|Infinity/);
});

function cityDemo(): GraphData {
  const names = [
    ["n:38", "城市记忆图谱"],
    ["n:39", "城市实体对齐"],
    ["n:40", "图谱质量体检"],
    ["n:41", "版本追踪试验"],
    ["n:42", "检索对照实验"],
    ["n:43", "林澄"],
    ["n:44", "沈禾"],
    ["n:45", "顾宁"],
    ["n:46", "唐屿"],
    ["n:47", "城市记忆研究提纲"],
    ["n:48", "图谱建模手册"],
    ["n:49", "别名映射笔记"],
    ["n:50", "质量检查清单"],
    ["n:51", "版本对照报告"],
    ["n:52", "混合检索观察"],
    ["n:53", "图谱导航指南"],
    ["n:54", "知识图谱"],
    ["n:55", "本体建模"],
    ["n:56", "全文检索"],
    ["n:57", "向量检索"],
    ["n:58", "质量校验"],
    ["n:59", "版本快照"]
  ];
  const endpoints = [
    ["n:43", "n:38"],
    ["n:43", "n:38"],
    ["n:44", "n:38"],
    ["n:44", "n:39"],
    ["n:45", "n:40"],
    ["n:46", "n:41"],
    ["n:43", "n:42"],
    ["n:38", "n:54"],
    ["n:38", "n:55"],
    ["n:38", "n:56"],
    ["n:39", "n:54"],
    ["n:39", "n:57"],
    ["n:40", "n:54"],
    ["n:40", "n:58"],
    ["n:41", "n:54"],
    ["n:41", "n:59"],
    ["n:42", "n:57"],
    ["n:47", "n:38"],
    ["n:48", "n:38"],
    ["n:49", "n:39"],
    ["n:50", "n:40"],
    ["n:51", "n:41"],
    ["n:52", "n:42"],
    ["n:53", "n:39"],
    ["n:48", "n:47"],
    ["n:49", "n:47"],
    ["n:50", "n:48"],
    ["n:52", "n:49"],
    ["n:53", "n:53"],
    ["n:56", "n:55"],
    ["n:57", "n:55"],
    ["n:58", "n:54"],
    ["n:45", "n:47"],
    ["n:46", "n:49"],
    ["n:44", "n:50"],
    ["n:43", "n:52"]
  ];
  return {
    nodes: names.map(([id = "", name = ""]) => ({ id, labels: [], properties: { name } })),
    relationships: endpoints.map(([start = "", end = ""], index) =>
      relation("r:" + String(index), start, end)
    ),
    limited: false
  };
}

interface DisplayBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function displayBoxes(graph: GraphData, positions: ReadonlyMap<string, Point>) {
  return graph.nodes.map((node) => {
    const point = positions.get(node.id);
    if (point === undefined) throw new Error("Missing layout node");
    // The live scene uses a 22px target and 12px Chinese text at baseline y=32.
    const halfWidth = nodeCaption(node).length * 6 + 2;
    return [
      { left: point.x - 22, right: point.x + 22, top: point.y - 22, bottom: point.y + 22 },
      {
        left: point.x - halfWidth,
        right: point.x + halfWidth,
        top: point.y + 18,
        bottom: point.y + 36
      }
    ];
  });
}

function intersect(first: DisplayBox, second: DisplayBox): boolean {
  return (
    first.left < second.right &&
    first.right > second.left &&
    first.top < second.bottom &&
    first.bottom > second.top
  );
}

it("keeps the local Chinese 22-node 36-edge demo readable when seed links arrive", () => {
  const graph = cityDemo();
  expect(graph.nodes).toHaveLength(22);
  expect(graph.relationships).toHaveLength(36);
  const scatter = layoutGraph({ ...graph, relationships: [] });
  const positions = layoutGraph(graph, scatter);
  const boxes = displayBoxes(graph, positions);
  for (const [index, nodeBoxes] of boxes.entries()) {
    for (const otherBoxes of boxes.slice(index + 1)) {
      expect(nodeBoxes.some((box) => otherBoxes.some((other) => intersect(box, other)))).toBe(
        false
      );
    }
  }
  expect(layoutGraph({ ...graph, nodes: [...graph.nodes].reverse() }, scatter)).toEqual(positions);
});

it("moves automatic captions away from dragged pins without changing conflicting manual pins", () => {
  const graph = data(["n:1", "n:2", "n:3"]);
  graph.nodes.forEach((node) => {
    node.properties["name"] = "图谱导航指南";
  });
  const previous = new Map(graph.nodes.map((node) => [node.id, { x: 0, y: 0 }]));
  const positions = layoutGraph(graph, previous, new Set(["n:1", "n:2"]));
  expect(positions.get("n:1")).toEqual({ x: 0, y: 0 });
  expect(positions.get("n:2")).toEqual({ x: 0, y: 0 });
  expect(previous.get("n:3")).toEqual({ x: 0, y: 0 });
  const [first = [], second = [], third = []] = displayBoxes(graph, positions);
  for (const boxes of [first, second]) {
    expect(boxes.some((box) => third.some((other) => intersect(box, other)))).toBe(false);
  }
});

it("fits self-loop curves below search without cutting off long Chinese captions in 300px", () => {
  const graph = data(["n:1", "n:2"], [relation("r:1", "n:1", "n:1")]);
  for (const node of graph.nodes) {
    node.properties["name"] =
      node.id === "n:1" ? "图谱导航指南" : "城市知识实验室的跨来源知识检索与图谱导航研究资料";
  }
  const positions = new Map([
    ["n:1", { x: 0, y: -200 }],
    ["n:2", { x: 20, y: 200 }]
  ]);
  const width = 300;
  const height = 600;
  const camera = fitGraph(positions, width, height, graph);
  const screen = (point: Point) => ({
    x: point.x * camera.scale + width / 2 + camera.x,
    y: point.y * camera.scale + height / 2 + camera.y
  });
  // For the rendered 34px cubic loop, the top is at t=0.5, 53.5px above its node.
  expect(screen({ x: 0, y: -200 - 53.5 }).y).toBeGreaterThanOrEqual(96);
  for (const boxes of displayBoxes(graph, positions)) {
    for (const box of boxes) {
      expect(screen({ x: box.left, y: box.top }).x).toBeGreaterThanOrEqual(36);
      expect(screen({ x: box.right, y: box.bottom }).x).toBeLessThanOrEqual(width - 36);
      expect(screen({ x: box.left, y: box.top }).y).toBeGreaterThanOrEqual(96);
      expect(screen({ x: box.right, y: box.bottom }).y).toBeLessThanOrEqual(height - 70);
    }
  }
});
