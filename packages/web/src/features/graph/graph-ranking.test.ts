import { expect, it } from "vitest";

import type { GraphNode } from "./graph-data.js";
import { distinctCandidates, rankLists } from "./graph-ranking.js";

function node(id: number, name = "Node " + String(id)): GraphNode {
  return { id: "n:" + String(id), labels: ["Thing"], properties: { name } };
}

it("does not count duplicate hits inside the same index twice", () => {
  expect(rankLists([[node(1), node(1), node(2)], [node(2)]]).map((item) => item.id)).toEqual([
    "n:2",
    "n:1"
  ]);
});

it("breaks equal reciprocal ranks by stable element identity", () => {
  expect(rankLists([[node(2)], [node(1)]]).map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(rankLists([[node(1)], [node(2)]]).map((item) => item.id)).toEqual(["n:1", "n:2"]);
});

it("checks duplicate element payloads instead of silently replacing properties", () => {
  expect(() => distinctCandidates([node(1), node(1, "Contradiction")])).toThrow();
  expect(distinctCandidates([node(1), node(1)])).toHaveProperty("size", 1);
});
