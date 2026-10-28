import { expect, it } from "vitest";

import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import {
  addExpansion,
  clearPendingExpansion,
  emptySources,
  hideElement,
  removeExpansion,
  replaceSeeds,
  restoreHidden,
  startPendingExpansion,
  visibleGraph
} from "./graph-exploration-state.js";

function node(id: number, name = "Node " + String(id)): GraphNode {
  return { id: "n:" + String(id), labels: ["Example"], properties: { name } };
}

function edge(id: number, start = 1, end = 2): GraphRelationship {
  return {
    id: "r:" + String(id),
    start: "n:" + String(start),
    end: "n:" + String(end),
    type: "LINK",
    properties: {}
  };
}

function graph(nodes: GraphNode[], relationships: GraphRelationship[] = []): GraphData {
  return { nodes, relationships, limited: false };
}

it("keeps seeds and shared expansion content when collapsing one source", () => {
  const seeded = replaceSeeds(emptySources(), graph([node(1), node(2)]));
  const first = addExpansion(seeded, "n:1", graph([node(1), node(3)], [edge(1, 1, 3)]));
  const second = addExpansion(
    first,
    "n:2",
    graph([node(2), node(3), node(4)], [edge(2, 2, 3), edge(3, 3, 4)])
  );
  const collapsed = removeExpansion(second, "n:1");
  expect(visibleGraph(collapsed).nodes.map((item) => item.id)).toEqual([
    "n:1",
    "n:2",
    "n:3",
    "n:4"
  ]);
  expect(visibleGraph(collapsed).relationships.map((item) => item.id)).toEqual(["r:2", "r:3"]);
  expect(first.expansions.has("n:1")).toBe(true);
  expect(removeExpansion(collapsed, "n:2").seed).toEqual(seeded.seed);
});

it("reuses canonical payload references across sources instead of retaining duplicate objects", () => {
  const original = node(1);
  const seeded = replaceSeeds(emptySources(), graph([original]));
  const duplicate = node(1);
  const expanded = addExpansion(seeded, "n:1", graph([duplicate, node(2)], [edge(1)]));
  expect(expanded.expansions.get("n:1")?.nodes[0]).toBe(original);
  expect(expanded.expansions.get("n:1")?.nodes[0]).not.toBe(duplicate);
  expect(visibleGraph(expanded).nodes).toHaveLength(2);
});

it("keeps a loading origin after its parent is collapsed, then transfers it to its own contribution", () => {
  const seeded = replaceSeeds(emptySources(), graph([node(1)]));
  const parent = addExpansion(seeded, "n:1", graph([node(1), node(2)], [edge(1)]));
  const loading = startPendingExpansion(parent, "n:2");
  expect(loading.pending.get("n:2")).toBe(parent.expansions.get("n:1")?.nodes[1]);
  const collapsed = removeExpansion(loading, "n:1");
  expect(visibleGraph(collapsed)).toEqual(graph([node(1), node(2)]));
  expect(collapsed.expansions.size).toBe(0);
  const loaded = addExpansion(collapsed, "n:2", graph([node(2), node(3)], [edge(2, 2, 3)]));
  expect(loaded.pending.size).toBe(0);
  expect(visibleGraph(loaded).nodes.map((item) => item.id)).toEqual(["n:1", "n:2", "n:3"]);
  expect(visibleGraph(loaded).relationships.map((item) => item.id)).toEqual(["r:2"]);
  expect(visibleGraph(removeExpansion(loaded, "n:2"))).toEqual(visibleGraph(seeded));
});

it("releases a cancelled origin and validates identities while only a pending origin retains them", () => {
  const parent = addExpansion(
    replaceSeeds(emptySources(), graph([node(1)])),
    "n:1",
    graph([node(1), node(2)], [edge(1)])
  );
  const loading = removeExpansion(startPendingExpansion(parent, "n:2"), "n:1");
  expect(() => addExpansion(loading, "n:2", graph([node(2, "Conflict")]))).toThrow();
  const cancelled = clearPendingExpansion(loading, "n:2");
  expect(visibleGraph(cancelled)).toEqual(graph([node(1)]));
  expect(clearPendingExpansion(cancelled, "n:2")).toBe(cancelled);
  expect(startPendingExpansion(cancelled, "n:2")).toBe(cancelled);
  expect(startPendingExpansion(loading, "n:2")).toBe(loading);
});

it("counts pending origins inside the existing node budget without retaining duplicate payloads", () => {
  const parent = addExpansion(
    replaceSeeds(emptySources(), graph([node(1)])),
    "n:1",
    graph([node(1), node(2)], [edge(1)])
  );
  const loading = removeExpansion(startPendingExpansion(parent, "n:2"), "n:1");
  const addition = graph(Array.from({ length: 201 }, (_, index) => node(index + 1)));
  const bounded = addExpansion(loading, "n:1", addition);
  expect(visibleGraph(bounded).nodes).toHaveLength(200);
  expect(visibleGraph(bounded).limited).toBe(true);
  expect(bounded.pending.get("n:2")).toBe(bounded.expansions.get("n:1")?.nodes[1]);
  expect(bounded.expansions.get("n:1")?.nodes.some((item) => item.id === "n:201")).toBe(false);
});

it("hiding an origin retained only by a request replaces the last undo target without reviving it", () => {
  const parent = addExpansion(
    replaceSeeds(emptySources(), graph([node(1), node(3)])),
    "n:1",
    graph([node(1), node(2)], [edge(1)])
  );
  const firstHide = hideElement(parent, "n:3");
  const loading = removeExpansion(startPendingExpansion(firstHide, "n:2"), "n:1");
  const hidden = hideElement(loading, "n:2");
  expect(hidden.lastHidden).toBe("n:2");
  expect(hidden.pending.size).toBe(0);
  const restored = restoreHidden(hidden);
  expect(visibleGraph(restored)).toEqual(graph([node(1)]));
  expect(restored.hidden.has("n:3")).toBe(true);
});

it("hides nodes with their incident edges and restores only the most recent hide", () => {
  const seeded = replaceSeeds(
    emptySources(),
    graph([node(1), node(2), node(3)], [edge(1), edge(2, 2, 3)])
  );
  const first = hideElement(seeded, "n:1");
  const second = hideElement(first, "n:2");
  expect(visibleGraph(second)).toEqual(graph([node(3)]));
  const restored = restoreHidden(second);
  expect(visibleGraph(restored).nodes.map((item) => item.id)).toEqual(["n:2", "n:3"]);
  expect(visibleGraph(restored).relationships.map((item) => item.id)).toEqual(["r:2"]);
  expect(restored.hidden.has("n:1")).toBe(true);
  expect(restored.lastHidden).toBeNull();
  expect(seeded.hidden.size).toBe(0);
});

it("hides a relationship without removing its endpoints or parallel relationship", () => {
  const seeded = replaceSeeds(emptySources(), graph([node(1), node(2)], [edge(1), edge(2)]));
  const hidden = hideElement(seeded, "r:1");
  expect(visibleGraph(hidden).nodes).toHaveLength(2);
  expect(visibleGraph(hidden).relationships.map((item) => item.id)).toEqual(["r:2"]);
  expect(visibleGraph(restoreHidden(hidden))).toEqual(visibleGraph(seeded));
});

it("preserves local hiding and other expansion sources when seeds are replaced", () => {
  const expanded = addExpansion(
    replaceSeeds(emptySources(), graph([node(1)])),
    "n:1",
    graph([node(1), node(2)], [edge(1)])
  );
  const hidden = hideElement(expanded, "n:2");
  const replaced = replaceSeeds(hidden, graph([node(1), node(3)]));
  expect(replaced.expansions.has("n:1")).toBe(true);
  expect(visibleGraph(replaced).nodes.map((item) => item.id)).toEqual(["n:1", "n:3"]);
  expect(visibleGraph(restoreHidden(replaced)).nodes.map((item) => item.id)).toEqual([
    "n:1",
    "n:3",
    "n:2"
  ]);
});

it("keeps the node budget in backing sources and marks excluded neighbors as partial", () => {
  const nodes = Array.from({ length: 200 }, (_, index) => node(index + 1));
  const seeded = replaceSeeds(emptySources(), graph(nodes));
  const expanded = addExpansion(seeded, "n:1", graph([node(1), node(201)], [edge(1, 1, 201)]));
  const contribution = expanded.expansions.get("n:1");
  expect(contribution?.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(contribution?.relationships).toEqual([]);
  expect(visibleGraph(expanded).nodes).toHaveLength(200);
  expect(visibleGraph(expanded).limited).toBe(true);
  expect(visibleGraph(removeExpansion(expanded, "n:1")).limited).toBe(false);
});

it("does not retain excess relationships in source chunks", () => {
  const edges = Array.from({ length: 400 }, (_, index) => edge(index + 1));
  const seeded = replaceSeeds(emptySources(), graph([node(1), node(2)], edges));
  const expanded = addExpansion(seeded, "n:1", graph([node(1), node(2)], [edge(401)]));
  expect(expanded.expansions.get("n:1")?.relationships).toEqual([]);
  expect(visibleGraph(expanded).relationships).toHaveLength(400);
  expect(visibleGraph(expanded).limited).toBe(true);
});

it("rejects conflicting identities even when the original node is hidden", () => {
  const seeded = replaceSeeds(emptySources(), graph([node(1)]));
  const hidden = hideElement(seeded, "n:1");
  expect(() => addExpansion(hidden, "n:1", graph([node(1, "Conflict")]))).toThrow();
  expect(hidden.expansions.size).toBe(0);
  expect(visibleGraph(restoreHidden(hidden)).nodes[0]?.properties["name"]).toBe("Node 1");
});

it("does not alter another scene and treats missing or repeated actions as no-ops", () => {
  const empty = emptySources();
  const other = emptySources();
  expect(hideElement(empty, "n:1")).toBe(empty);
  expect(removeExpansion(empty, "n:1")).toBe(empty);
  expect(restoreHidden(empty)).toBe(empty);
  expect(replaceSeeds(empty, empty.seed)).toBe(empty);
  const seeded = replaceSeeds(empty, graph([node(1)]));
  const hidden = hideElement(seeded, "n:1");
  expect(hideElement(hidden, "n:1")).toBe(hidden);
  expect(other).toEqual(emptySources());
});
