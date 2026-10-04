import { describe, expect, it } from "vitest";
import { type JsonValue } from "@kgos/sdk";

import { elementTitle, project, PROJECTION_LIMITS } from "./projection.js";

const node = (ref: string, properties = {}) => ({
  $type: "Node",
  elementId: ref,
  labels: ["Model"],
  properties
});
const edge = {
  $type: "Relationship",
  elementId: "r:0",
  type: "LINK",
  start: "n:0",
  end: "n:1",
  properties: {}
};

describe("typed graph projection", () => {
  it("uses actual identity, direction and placeholders while preserving reserved business maps", () => {
    const result = project([
      [
        { $type: "Path", nodes: [node("n:0", { name: "A" })], relationships: [edge] },
        { $type: "Map", entries: { $type: "Node", elementId: "n:9", labels: [], properties: {} } }
      ]
    ]);
    expect(result.nodes.map((item) => item.ref)).toEqual(["n:0", "n:1"]);
    expect(result.relationships[0]).toMatchObject({ ref: "r:0", start: "n:0", end: "n:1" });
    expect(
      elementTitle(
        result.nodes[0] ?? { kind: "node", ref: "", labels: [], properties: {}, loaded: false }
      )
    ).toBe("A");
    expect(
      elementTitle(
        result.nodes[1] ?? { kind: "node", ref: "", labels: [], properties: {}, loaded: false }
      )
    ).toContain("未加载");
    expect(
      elementTitle(
        result.relationships[0] ?? {
          kind: "relationship",
          ref: "",
          type: "",
          start: "",
          end: "",
          properties: {}
        }
      )
    ).toBe("LINK");
  });

  it("deduplicates repeated consistent payloads and refuses contradictory identities", () => {
    const result = project([
      [node("n:0", { a: 1, b: 2 }), node("n:0", { b: 2, a: 1 }), edge, { ...edge, properties: {} }],
      [node("n:2", { name: "B" }), node("n:2", { name: "C" })]
    ]);
    expect(result.nodes.filter((item) => item.ref === "n:0")).toHaveLength(1);
    expect(result.relationships).toHaveLength(1);
    expect(result.nodes.some((item) => item.ref === "n:2")).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(project([[edge, { ...edge, type: "OTHER" }]]).relationships).toHaveLength(0);
  });

  it("bounds nesting, traversal and graph size without inventing scalar entities", () => {
    let nested: JsonValue = node("n:0");
    for (let index = 0; index < PROJECTION_LIMITS.depth + 2; index += 1) nested = [nested];
    expect(project([[nested]]).limited).toBe(true);
    expect(project([[Array.from({ length: PROJECTION_LIMITS.values + 1 }, () => 1)]]).limited).toBe(
      true
    );
    const large = project([
      Array.from({ length: PROJECTION_LIMITS.nodes + 1 }, (_, index) => node(`n:${String(index)}`))
    ]);
    expect(large.nodes).toHaveLength(PROJECTION_LIMITS.nodes);
    expect(large.limited).toBe(true);
    expect(
      project([[null, 1, { arbitrary: ["hello"] }, { $type: "Vector", values: [1, 2] }]]).nodes
    ).toEqual([]);
    expect(project([[{ $type: "Node", elementId: "wrong" }]]).issues).not.toEqual([]);
  });
});

it("extracts nested graph values from genuine Map entries while preserving ordinary reserved keys", () => {
  const result = project([
    [
      {
        $type: "Map",
        entries: {
          real: node("n:0", { temporal: { $type: "Date", value: "2026-10-04" } }),
          literal: {
            $type: "Map",
            entries: { $type: "Node", elementId: "n:9", labels: [], properties: {} }
          }
        }
      }
    ]
  ]);
  expect(result.nodes.map((item) => item.ref)).toEqual(["n:0"]);
  expect(result.nodes[0]?.properties).toEqual({ temporal: { $type: "Date", value: "2026-10-04" } });
  expect(project([[{ $type: "Map", entries: [] }, { $type: "Path" }]])).toMatchObject({
    nodes: [],
    relationships: []
  });
});

it("rejects malformed typed node and relationship identities, endpoint shapes and properties", () => {
  const invalid: JsonValue[] = [
    { $type: "Node", elementId: "n:01", labels: [], properties: {} },
    { $type: "Node", elementId: "n:0", labels: [1], properties: {} },
    { $type: "Node", elementId: "n:0", labels: [], properties: null },
    { ...edge, elementId: "r:00" },
    { ...edge, type: 1 },
    { ...edge, start: 1 },
    { ...edge, end: 1 },
    { ...edge, start: "n:-1" },
    { ...edge, end: "n:01" },
    { ...edge, properties: [] }
  ];
  const result = project([invalid]);
  expect(result.nodes).toEqual([]);
  expect(result.relationships).toEqual([]);
  expect(result.issues).toContain("无法解释的 typed 图值，请查看原始 JSON");
});

it("bounds relationship count and cannot add endpoints beyond the node budget", () => {
  const relationships = Array.from({ length: PROJECTION_LIMITS.relationships + 1 }, (_, index) => ({
    ...edge,
    elementId: `r:${String(index)}`
  }));
  const result = project([relationships]);
  expect(result.relationships).toHaveLength(PROJECTION_LIMITS.relationships);
  expect(result.nodes).toHaveLength(2);
  expect(result.limited).toBe(true);
  const full = project([
    Array.from({ length: PROJECTION_LIMITS.nodes }, (_, index) => node(`n:${String(index)}`)),
    [{ ...edge, start: "n:1001", end: "n:1002" }]
  ]);
  expect(full.nodes).toHaveLength(PROJECTION_LIMITS.nodes);
  expect(full.relationships).toEqual([]);
  expect(full.limited).toBe(true);
});

it("does not revive inconsistent identities and uses complete typed titles and fallback refs", () => {
  const result = project([
    [node("n:0", { name: "A" }), node("n:0", { name: "B" }), node("n:0", { name: "A" })]
  ]);
  expect(result.nodes).toEqual([]);
  expect(result.issues).toHaveLength(1);
  const nodes = project([
    [node("n:0", { title: "", name: "", label: "显示标签" }), node("n:1", { title: 123, name: "" })]
  ]).nodes;
  expect(
    elementTitle(nodes[0] ?? { kind: "node", ref: "", labels: [], properties: {}, loaded: false })
  ).toBe("显示标签");
  expect(
    elementTitle(nodes[1] ?? { kind: "node", ref: "", labels: [], properties: {}, loaded: false })
  ).toBe("n:1");
  expect(project([[edge, { ...edge, type: "OTHER" }, edge]]).relationships).toEqual([]);
});

it("omits relationships whose endpoint identity has contradictory payloads", () => {
  const result = project([[node("n:0", { name: "A" }), edge, node("n:0", { name: "B" })]]);
  expect(result.nodes.map((item) => item.ref)).toEqual(["n:1"]);
  expect(result.relationships).toEqual([]);
  expect(result.issues).toHaveLength(1);
});
