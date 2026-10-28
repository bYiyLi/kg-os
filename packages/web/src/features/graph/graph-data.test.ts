import { expect, it } from "vitest";
import type { JsonObject, JsonValue } from "@kgos/sdk";

import { emptyGraph, mergeGraph, nodeCaption, projectGraph } from "./graph-data.js";
import type { GraphNode } from "./graph-data.js";

function node(id: number, properties: JsonObject = { name: "Same name" }): JsonObject {
  return { $type: "Node", elementId: "n:" + String(id), labels: ["Project"], properties };
}

function relationship(id: number, start = "n:1", end = "n:2"): JsonObject {
  return {
    $type: "Relationship",
    elementId: "r:" + String(id),
    start,
    end,
    type: "CONNECTS",
    properties: { order: id }
  };
}

function captionNode(properties: JsonObject, labels: string[] = ["Project"]): GraphNode {
  return { id: "n:1", labels, properties };
}

it("projects real typed elements without merging distinct nodes with the same name", () => {
  const first = node(1);
  first["labels"] = ["Project", "Important"];
  const graph = projectGraph([[first, relationship(1), node(2)]]);

  expect(graph.limited).toBe(false);
  expect(graph.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(graph.nodes[0]).toEqual({
    id: "n:1",
    labels: ["Project", "Important"],
    properties: { name: "Same name" }
  });
  expect(graph.relationships).toEqual([
    {
      id: "r:1",
      start: "n:1",
      end: "n:2",
      type: "CONNECTS",
      properties: { order: 1 }
    }
  ]);
});

it("finds typed graph values in nested result containers without inventing entities from maps", () => {
  const map: JsonObject = {
    elementId: "n:99",
    labels: ["Pretend"],
    properties: { name: "This is an ordinary business map" },
    actual: [node(1), { links: [relationship(1), node(2)] }]
  };
  const graph = projectGraph([[null, true, "text", 7, map]]);

  expect(graph.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(graph.relationships.map((item) => item.id)).toEqual(["r:1"]);
  expect(projectGraph([[{ $type: "Business", elementId: "n:9" }]])).toEqual(emptyGraph());
});

it.each([
  { $type: "Node", elementId: "node:Person", labels: [], properties: {} },
  { $type: "Node", elementId: "r:1", labels: [], properties: {} },
  { $type: "Node", elementId: "n:01", labels: [], properties: {} },
  { $type: "Node", elementId: "n:18446744073709551616", labels: [], properties: {} },
  { $type: "Node", elementId: "n:1", labels: "Project", properties: {} },
  { $type: "Node", elementId: "n:1", labels: ["Project", 1], properties: {} },
  { $type: "Node", elementId: "n:1", labels: [], properties: null },
  { $type: "Node", elementId: "n:1", labels: [], properties: [] }
] satisfies JsonObject[])("rejects malformed declared Node values: %j", (value) => {
  expect(() => projectGraph([[value]])).toThrow();
});

it.each([
  { ...relationship(1), elementId: "n:1" },
  { ...relationship(1), start: "node:Person" },
  { ...relationship(1), end: "r:2" },
  { ...relationship(1), type: "" },
  { ...relationship(1), properties: null }
] satisfies JsonObject[])("rejects malformed declared Relationship values: %j", (value) => {
  expect(() => projectGraph([[value]])).toThrow();
});

it("deduplicates exact identities while accepting property key order differences", () => {
  const first = node(1, { name: "KG OS", count: 7 });
  const repeated = node(1, { count: 7, name: "KG OS" });
  const graph = projectGraph([
    [first, relationship(1)],
    [repeated, relationship(1)]
  ]);

  expect(graph.nodes).toHaveLength(1);
  expect(graph.relationships).toHaveLength(1);
});

it("compares labels as a set while preserving the original property array order", () => {
  const first = { ...node(1, { values: [1, 2] }), labels: ["A", "B"] };
  const reordered = { ...first, labels: ["B", "A"] };
  expect(projectGraph([[first, reordered]]).nodes).toHaveLength(1);
  expect(() => projectGraph([[first, { ...reordered, properties: { values: [2, 1] } }]])).toThrow();
});

it("rejects conflicting payloads for the same identity instead of fabricating a combined object", () => {
  expect(() => projectGraph([[node(1)], [node(1, { name: "Changed" })]])).toThrow();
  expect(() => projectGraph([[relationship(1)], [{ ...relationship(1), end: "n:3" }]])).toThrow();

  const original = projectGraph([[node(1)]]);
  expect(() => mergeGraph(original, projectGraph([[node(1, { name: "Changed" })]]))).toThrow();
  expect(original.nodes[0]?.properties).toEqual({ name: "Same name" });
});

it("retains parallel relationships, self-loops and actual endpoint identities", () => {
  const graph = projectGraph([
    [node(1), node(2), relationship(1), relationship(2), relationship(3, "n:1", "n:1")]
  ]);

  expect(graph.relationships.map((item) => [item.id, item.start, item.end])).toEqual([
    ["r:1", "n:1", "n:2"],
    ["r:2", "n:1", "n:2"],
    ["r:3", "n:1", "n:1"]
  ]);
  const missingEndpoint = projectGraph([[node(1), relationship(1)]]);
  expect(missingEndpoint.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(missingEndpoint.relationships[0]?.end).toBe("n:2");
});

it("keeps zero and large canonical identities as strings without losing numeric precision", () => {
  const large = { ...node(1), elementId: "n:9007199254740993" };
  const edge = {
    ...relationship(1),
    elementId: "r:18446744073709551615",
    start: "n:0",
    end: "n:9007199254740993"
  };
  const graph = projectGraph([[node(0), large, edge]]);
  expect(graph.nodes.map((item) => item.id)).toEqual(["n:0", "n:9007199254740993"]);
  expect(graph.relationships[0]).toMatchObject({
    id: "r:18446744073709551615",
    start: "n:0",
    end: "n:9007199254740993"
  });
});

it("caps displayed nodes and relationships and marks the limited graph", () => {
  const manyNodes: JsonValue[][] = Array.from({ length: 201 }, (_, i) => [node(i + 1)]);
  const nodes = projectGraph(manyNodes);
  expect(nodes.nodes).toHaveLength(200);
  expect(nodes.limited).toBe(true);

  const manyRelationships: JsonValue[][] = Array.from({ length: 401 }, (_, i) => [
    relationship(i + 1)
  ]);
  const relationships = projectGraph([[node(1), node(2)], ...manyRelationships]);
  expect(relationships.relationships).toHaveLength(400);
  expect(relationships.limited).toBe(true);
});

it("merges expansion without mutating previous data or clearing an existing limit marker", () => {
  const initial = projectGraph([[node(1), node(2), relationship(1)]]);
  const addition = projectGraph([[node(2), node(3), relationship(2, "n:2", "n:3")]]);
  const merged = mergeGraph(initial, addition);

  expect(initial.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(merged.nodes.map((item) => item.id)).toEqual(["n:1", "n:2", "n:3"]);
  expect(merged.relationships.map((item) => item.id)).toEqual(["r:1", "r:2"]);
  expect(mergeGraph({ ...initial, limited: true }, addition).limited).toBe(true);
});

it("applies the same graph budget when many small expansions are merged", () => {
  const initial = projectGraph(Array.from({ length: 200 }, (_, i) => [node(i + 1)]));
  const merged = mergeGraph(initial, projectGraph([[node(201)]]));
  expect(merged.nodes).toHaveLength(200);
  expect(merged.limited).toBe(true);
});

it("omits edges whose endpoint was excluded by the graph's node budget", () => {
  const initial = projectGraph(Array.from({ length: 200 }, (_, i) => [node(i + 1)]));
  const addition = projectGraph([[node(201), relationship(1, "n:1", "n:201")]]);
  const merged = mergeGraph(initial, addition);
  expect(merged.nodes).toHaveLength(200);
  expect(merged.relationships).toEqual([]);
  expect(merged.limited).toBe(true);
});

it("rejects excessively nested properties without truncating them into a saveable object", () => {
  let nested: JsonValue = "original";
  for (let index = 0; index < 80; index++) nested = { child: nested };
  expect(() => projectGraph([[node(1, { nested })]])).toThrow("Invalid graph response");
});

it("keeps tagged values and full strings intact in properties", () => {
  const properties: JsonObject = {
    name: "Long ".repeat(100),
    integer: { $type: "Integer", value: "9223372036854775807" },
    nested: { source: [true, null, { $type: "Date", value: "2026-10-28" }] }
  };
  const graph = projectGraph([[node(1, properties)]]);
  expect(graph.nodes[0]?.properties).toEqual(properties);
  expect(graph.nodes).toHaveLength(1);
});

it("treats typed entity properties as payload rather than projecting property maps into extra nodes", () => {
  const nested: JsonObject = { snapshot: node(99), edgeSnapshot: relationship(99) };
  const graph = projectGraph([[node(1, nested)]]);
  expect(graph.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(graph.nodes[0]?.properties).toEqual(nested);
  expect(graph.relationships).toEqual([]);
});

it("marks bounded projection when nested containers exceed the supported depth", () => {
  let nested: JsonValue = node(99);
  for (let index = 0; index < 70; index++) nested = [nested];
  const graph = projectGraph([[node(1), nested]]);
  expect(graph.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(graph.limited).toBe(true);
});

it("chooses captions from actual strings without requiring a universal name field", () => {
  expect(nodeCaption(captionNode({ summary: "Summary", title: "Title", name: "Name" }))).toBe(
    "Name"
  );
  expect(nodeCaption(captionNode({ name: " ", title: "Title" }))).toBe("Title");
  expect(nodeCaption(captionNode({ name: 42, zeta: "Later", alpha: "Earlier" }))).toBe("Earlier");
  expect(nodeCaption(captionNode({ count: 1 }))).toBe("Project");
  expect(nodeCaption(captionNode({}, []))).toBe("n:1");
});

it("returns separate empty containers so one scene cannot mutate another scene's empty graph", () => {
  const first = emptyGraph();
  first.nodes.push(captionNode({ name: "Local" }));
  expect(emptyGraph()).toEqual({ nodes: [], relationships: [], limited: false });
});
