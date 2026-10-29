// @vitest-environment jsdom

import type { Graph as G6Graph } from "@antv/g6";
import { expect, it, vi } from "vitest";

import type { GraphData } from "./graph-data.js";
import { FakeG6Graph } from "./graph-g6-test-double.js";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  contextPosition,
  eventID,
  graphPositions,
  keyStep,
  syncKeyboard,
  topologyKey,
  zoomG6
} from "./graph-g6-geometry.js";

function fakeGraph() {
  return new FakeG6Graph({
    data: {
      nodes: [
        { id: "n:1", style: { x: 12, y: 24 } },
        { id: "n:2", style: { x: -50, y: 15 } }
      ],
      edges: []
    }
  });
}

function graphObject(graph: FakeG6Graph): G6Graph {
  return graph as unknown as G6Graph;
}

function keyboardTargets(surface: HTMLElement) {
  const [first, second, missing] = [...surface.querySelectorAll<HTMLElement>("button")];
  if (!first || !second || !missing) throw new Error("Missing keyboard targets");
  return { first, second, missing };
}

it("accepts only finite, fully positioned graph nodes for camera and local layout", () => {
  const graph = fakeGraph();
  const nodes = graph.getNodeData() ?? [];
  nodes.push(
    { id: "n:missing-position" },
    { id: "n:nan", style: { x: Number.NaN, y: 10 } },
    { id: "n:infinite", style: { x: 5, y: Number.POSITIVE_INFINITY } }
  );
  expect(graphPositions(graphObject(graph))).toEqual(
    new Map([
      ["n:1", { x: 12, y: 24 }],
      ["n:2", { x: -50, y: 15 }]
    ])
  );
});

it("tracks actual rendered hit targets and skips absent or nonfinite screen coordinates", () => {
  const graph = fakeGraph();
  const surface = document.createElement("div");
  surface.innerHTML = `
    <button data-graph-id="n:1"></button>
    <button data-graph-id="n:2"></button>
    <button data-graph-id="n:gone"></button>
  `;
  const { first, second, missing } = keyboardTargets(surface);
  vi.spyOn(graph, "getViewportByCanvas")
    .mockReturnValueOnce([90, 70])
    .mockReturnValueOnce([Number.NaN, 80]);
  vi.spyOn(graph, "getElementRenderStyle")
    .mockReturnValueOnce({ x: 40, y: 42 })
    .mockReturnValueOnce({ x: Number.NaN, y: 42 })
    .mockImplementationOnce(() => {
      throw new Error("node removed during layout");
    });
  syncKeyboard(graphObject(graph), surface);
  expect(first.style.transform).toBe("translate(90px,70px)");
  expect(first.dataset["x"]).toBe("40");
  expect(second.style.transform).toBe("");
  expect(second.dataset["x"]).toBeUndefined();
  expect(missing.style.transform).toBe("");
});

it("constrains camera zoom and maps arrow keys without capturing unknown input", () => {
  const graph = fakeGraph();
  expect(keyStep("ArrowLeft")).toEqual({ x: -16, y: 0 });
  expect(keyStep("ArrowRight")).toEqual({ x: 16, y: 0 });
  expect(keyStep("ArrowUp")).toEqual({ x: 0, y: -16 });
  expect(keyStep("ArrowDown")).toEqual({ x: 0, y: 16 });
  expect(keyStep("Enter")).toBeNull();
  graph.zoom = 2;
  zoomG6(graphObject(graph), 10);
  expect(graph.zoom).toBe(MAX_ZOOM);
  zoomG6(graphObject(graph), 0.001);
  expect(graph.zoom).toBe(MIN_ZOOM);
});

it("recognizes only genuine event IDs and mouse coordinates", () => {
  const samples: unknown[] = [
    null,
    undefined,
    123,
    {},
    { target: null },
    { target: {} },
    { target: { id: 12 } },
    { target: { id: false } }
  ];
  for (const event of samples) expect(eventID(event)).toBeNull();
  expect(eventID({ target: { id: "n:1" } })).toBe("n:1");
  expect(eventID({ target: { id: "r:2" } })).toBe("r:2");
});

it("positions context menus using valid pointers, graph world coordinates and safe fallback", () => {
  const graph = fakeGraph();
  const surface = document.createElement("div");
  vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
    left: 100,
    top: 200,
    width: 400,
    height: 300
  } as DOMRect);
  expect(contextPosition(graphObject(graph), surface, null)).toEqual({
    id: null,
    x: 200,
    y: 150
  });
  expect(
    contextPosition(graphObject(graph), surface, "n:1", { clientX: 140, clientY: 260 })
  ).toEqual({ id: "n:1", x: 40, y: 60 });
  expect(
    contextPosition(graphObject(graph), surface, "n:2", { clientX: "bad", clientY: 200 })
  ).toEqual({ id: "n:2", x: -50, y: 15 });
  expect(contextPosition(graphObject(graph), surface, "n:1", { clientX: 1 })).toEqual({
    id: "n:1",
    x: 12,
    y: 24
  });
  vi.spyOn(graph, "getElementPosition").mockImplementationOnce(() => {
    throw new Error("element already deleted");
  });
  expect(contextPosition(graphObject(graph), surface, "n:gone")).toEqual({
    id: "n:gone",
    x: 200,
    y: 150
  });
});

it("preserves search node ranking while normalizing relationship ordering in topology checks", () => {
  const original: GraphData = {
    nodes: [
      { id: "n:1", labels: ["Topic"], properties: {} },
      { id: "n:2", labels: ["Topic"], properties: {} }
    ],
    relationships: [
      { id: "r:2", start: "n:2", end: "n:1", type: "RELATED", properties: {} },
      { id: "r:1", start: "n:1", end: "n:2", type: "RELATED", properties: {} }
    ],
    limited: false
  };
  expect(topologyKey(original)).toBe(
    topologyKey({
      ...original,
      relationships: [...original.relationships].reverse()
    })
  );
  expect(topologyKey(original)).not.toBe(
    topologyKey({
      ...original,
      nodes: [...original.nodes].reverse()
    })
  );
  expect(topologyKey(original)).not.toBe(
    topologyKey({
      ...original,
      relationships: original.relationships.slice(0, 1)
    })
  );
});
