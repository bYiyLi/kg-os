import { expect, it, vi } from "vitest";
import type { GraphQueryRequest, JsonObject, JsonValue, ResolvedState } from "@kgos/sdk";

import { neighborQuery } from "./graph-queries.js";
import { expandKnowledge } from "./graph-search.js";
import type { GraphReader } from "./graph-search.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const signal = () => new AbortController().signal;

function node(id: number, name = "Node " + String(id)): JsonObject {
  return { $type: "Node", elementId: "n:" + String(id), labels: ["Thing"], properties: { name } };
}

function edge(id: number, start = 1, end = 2): JsonObject {
  return {
    $type: "Relationship",
    elementId: "r:" + String(id),
    type: "LINK",
    start: "n:" + String(start),
    end: "n:" + String(end),
    properties: {}
  };
}

function fixture(options: { neighbors?: JsonValue[][] } = {}): GraphReader {
  return {
    query: vi.fn(async (request: GraphQueryRequest) => {
      await Promise.resolve();
      if (request.cypher !== neighborQuery) throw new Error("Unexpected graph request");
      return {
        state: request.at as ResolvedState,
        columns: ["n", "r", "m"],
        rows: options.neighbors ?? []
      };
    })
  };
}

it("scopes real one-hop expansion to the selected Domain", async () => {
  const api = fixture({
    neighbors: [[node(1), edge(7), node(2)]]
  });
  const graph = await expandKnowledge(api, state, "n:1", {
    signal: signal(),
    domain: "domain:Scoped"
  });
  expect(graph.relationships).toHaveLength(1);
  expect(vi.mocked(api.query).mock.calls[0]?.[0]).toEqual({
    at: state,
    cypher: neighborQuery,
    params: { id: "n:1", limit: 26 },
    domain: "domain:Scoped"
  });
});

it("expands only one bounded hop while preserving actual parallel edges and self-loops", async () => {
  const reader = fixture({
    neighbors: [
      [node(1), edge(1), node(2)],
      [node(1), edge(2), node(2)],
      [node(1), edge(3, 1, 1), node(1)]
    ]
  });
  const result = await expandKnowledge(reader, state, "n:1", signal());
  expect(result.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(result.relationships.map((item) => item.id)).toEqual(["r:1", "r:2", "r:3"]);
  expect(result.relationships[2]).toMatchObject({ start: "n:1", end: "n:1" });
  expect(reader.query).toHaveBeenCalledWith(
    expect.objectContaining({ at: state, params: { id: "n:1", limit: 26 } }),
    expect.anything()
  );
});

it("marks an expansion with more than 25 relationships as limited", async () => {
  const rows = Array.from({ length: 26 }, (_, index) => [
    node(1),
    edge(index, 1, index + 2),
    node(index + 2)
  ]);
  const result = await expandKnowledge(fixture({ neighbors: rows }), state, "n:1", signal());
  expect(result.relationships).toHaveLength(25);
  expect(result.limited).toBe(true);
  await expect(expandKnowledge(fixture(), state, "r:1", signal())).rejects.toThrow();
});

it("rejects a neighbor response that attaches the selected source to unrelated endpoints", async () => {
  const reader = fixture({ neighbors: [[node(1), edge(1, 2, 3), node(2)]] });
  await expect(expandKnowledge(reader, state, "n:1", signal())).rejects.toThrow();
});
