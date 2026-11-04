import type { JsonObject, JsonValue, ResolvedState } from "@kgos/sdk";
import { expect, it, vi } from "vitest";

import { emptyGraph } from "./graph-data.js";
import type { GraphData } from "./graph-data.js";
import { enrichRelatedKnowledge, validateNeighbor } from "./graph-related.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;

function node(id: number): JsonObject {
  return {
    $type: "Node",
    elementId: "n:" + String(id),
    labels: ["Thing"],
    properties: { name: "Node " + String(id) }
  };
}

function edge(id: number, from: number, to: number): JsonObject {
  return {
    $type: "Relationship",
    elementId: "r:" + String(id),
    type: "LINK",
    start: "n:" + String(from),
    end: "n:" + String(to),
    properties: {}
  };
}

const seeds: GraphData = {
  nodes: [{ id: "n:1", labels: ["Thing"], properties: { name: "Node 1" } }],
  relationships: [],
  limited: false
};

function sample(neighbor: number, edgeId: number, rank = 0): JsonValue[] {
  return [node(1), edge(edgeId, 1, neighbor), node(neighbor), rank];
}

it("keeps direct hits if a batched related read fails", async () => {
  const connected = vi.fn(async () => {
    await Promise.resolve();
    return emptyGraph();
  });
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run: async () => {
      await Promise.resolve();
      throw new Error("Temporary graph error");
    },
    connect: connected
  });
  expect(result.failed).toBe(true);
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(connected).toHaveBeenCalledWith(["n:1"]);
});

it("keeps real related nodes and edges if final inter-node connection lookup fails", async () => {
  let reads = 0;
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run: async () => {
      await Promise.resolve();
      return reads++ === 0 ? [sample(2, 10)] : [];
    },
    connect: async () => {
      await Promise.resolve();
      throw new Error("Connection temporarily unavailable");
    }
  });
  expect(result.failed).toBe(true);
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(result.data.relationships.map((item) => item.id)).toEqual(["r:10"]);
});

it("does not count a parallel edge as an independent relevance vote", async () => {
  let reads = 0;
  const run = vi.fn(async () => {
    await Promise.resolve();
    return reads++ === 0 ? [sample(2, 10), sample(2, 11), sample(2, 10)] : [];
  });
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run,
    connect: async () => {
      await Promise.resolve();
      return emptyGraph();
    }
  });
  expect(result.failed).toBe(false);
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(result.data.relationships.map((item) => item.id)).toEqual(["r:10", "r:11"]);
});

it("keeps a real self-loop without revisiting an already accepted search seed", async () => {
  const run = vi.fn(async () => {
    await Promise.resolve();
    return [[node(1), edge(10, 1, 1), node(1), 0]];
  });
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run,
    connect: async () => {
      await Promise.resolve();
      return emptyGraph();
    }
  });
  expect(result.failed).toBe(false);
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.data.relationships.map((item) => item.id)).toEqual(["r:10"]);
  expect(run).toHaveBeenCalledOnce();
});

it("rejects an out-of-range rank without accepting fabricated neighbors", async () => {
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run: async () => {
      await Promise.resolve();
      return [sample(2, 10, 7)];
    },
    connect: async () => {
      await Promise.resolve();
      return emptyGraph();
    }
  });
  expect(result.failed).toBe(true);
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
});

it("stops at 200 nodes even when a one-hop query returns more candidates", async () => {
  const run = vi.fn(async () => {
    await Promise.resolve();
    return Array.from({ length: 201 }, (_, index) => sample(index + 2, index + 1));
  });
  const result = await enrichRelatedKnowledge({
    state,
    seeds,
    signal: new AbortController().signal,
    run,
    connect: async () => {
      await Promise.resolve();
      return emptyGraph();
    }
  });
  expect(result.failed).toBe(false);
  expect(result.data.nodes).toHaveLength(200);
  expect(run).toHaveBeenCalledOnce();
  expect(result.data.relationships).toHaveLength(199);
});

it("validates typed graph endpoints, internal nodes and directed relationships", () => {
  expect(() => {
    validateNeighbor([node(1), edge(1, 1, 2), node(2)], "n:1");
  }).not.toThrow();
  expect(() => {
    validateNeighbor([node(1), edge(1, 1, 2), node(2)], "n:3");
  }).toThrow();
  expect(() => {
    validateNeighbor([node(1), edge(1, 3, 4), node(2)], "n:1");
  }).toThrow();
  expect(() => {
    validateNeighbor([node(1), edge(1, 1, 2), { ...node(2), labels: ["__kgos_internal"] }], "n:1");
  }).toThrow();
});
