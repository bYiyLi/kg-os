import { expect, it } from "vitest";

import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import {
  attentionTier,
  edgeAttentionTier,
  graphAttention,
  readableNodeIds
} from "./graph-attention.js";

function node(id: number): GraphNode {
  return { id: "n:" + String(id), labels: ["Example"], properties: {} };
}
function edge(id: number, start: number, end: number): GraphRelationship {
  return {
    id: "r:" + String(id),
    start: "n:" + String(start),
    end: "n:" + String(end),
    type: "LINK",
    properties: {}
  };
}
const graph: GraphData = {
  nodes: Array.from({ length: 8 }, (_, i) => node(i + 1)),
  relationships: [
    edge(1, 1, 2),
    edge(2, 2, 3),
    edge(3, 3, 4),
    edge(4, 4, 5),
    edge(5, 5, 6),
    edge(6, 3, 7),
    edge(7, 2, 2),
    edge(8, 1, 2)
  ],
  limited: false
};

it("computes real minimum hop distances without inventing unseen paths", () => {
  const before = JSON.stringify(graph);
  const attention = graphAttention(graph, "n:1");
  expect(attention.active).toBe(true);
  expect(Object.fromEntries(attention.distances)).toEqual({
    "n:1": 0,
    "n:2": 1,
    "n:3": 2,
    "n:4": 3,
    "n:5": 4,
    "n:6": 5,
    "n:7": 3
  });
  expect(attention.nearNodes).toEqual(new Set(["n:1", "n:2"]));
  expect(attention.nearEdges).toEqual(new Set(["r:1", "r:7", "r:8"]));
  expect(readableNodeIds(graph, "n:1")).toEqual(new Set(["n:1", "n:2"]));
  expect(JSON.stringify(graph)).toBe(before);
});

it("maps 0/1 hop to full visibility and applies six progressive tiers to loaded paths", () => {
  const { distances } = graphAttention(graph, "n:1");
  expect(attentionTier(distances.get("n:1"))).toBeNull();
  expect(attentionTier(distances.get("n:2"))).toBeNull();
  expect(attentionTier(distances.get("n:3"))).toBe("hop-2");
  expect(attentionTier(distances.get("n:4"))).toBe("hop-3");
  expect(attentionTier(distances.get("n:5"))).toBe("hop-4");
  expect(attentionTier(distances.get("n:6"))).toBe("hop-5");
  expect(attentionTier(6)).toBe("hop-6");
  expect(attentionTier(7)).toBe("hop-6");
  expect(attentionTier(distances.get("n:8"))).toBe("unreachable");
  expect(edgeAttentionTier(distances, "n:1", "n:2")).toBeNull();
  expect(edgeAttentionTier(distances, "n:2", "n:3")).toBe("hop-2");
  expect(edgeAttentionTier(distances, "n:2", "n:2")).toBeNull();
  expect(edgeAttentionTier(distances, "n:3", "n:4")).toBe("hop-3");
  expect(edgeAttentionTier(distances, "n:5", "n:6")).toBe("hop-5");
  expect(
    edgeAttentionTier(
      new Map([
        ["n:5", 5],
        ["n:6", 6]
      ]),
      "n:5",
      "n:6"
    )
  ).toBe("hop-6");
  expect(edgeAttentionTier(distances, "n:1", "n:8")).toBe("unreachable");
});

it("selecting a relationship seeds its endpoints and is independent of edge direction", () => {
  const selected = graphAttention(graph, "r:3");
  expect(selected.distances.get("n:3")).toBe(0);
  expect(selected.distances.get("n:4")).toBe(0);
  expect(selected.distances.get("n:2")).toBe(1);
  expect(selected.distances.get("n:5")).toBe(1);
  expect(selected.distances.get("n:1")).toBe(2);
  expect(selected.distances.get("n:8")).toBeUndefined();
  expect(selected.nearEdges.has("r:3")).toBe(true);
  const reversed = {
    ...graph,
    relationships: graph.relationships.map((e) => ({ ...e, start: e.end, end: e.start }))
  };
  expect(graphAttention(reversed, "r:3").distances).toEqual(selected.distances);
});

it("clears attention when focus is absent and ignores self loops for distance", () => {
  const inactive = graphAttention(graph, null);
  expect(inactive.active).toBe(false);
  expect(inactive.distances.size).toBe(0);
  expect(graphAttention(graph, "n:404").active).toBe(false);
  expect(graphAttention(graph, "n:2").distances.get("n:2")).toBe(0);
  expect(readableNodeIds(graph, null).size).toBe(8);
});
