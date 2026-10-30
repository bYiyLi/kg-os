import { afterEach, expect, it, vi } from "vitest";
import type { GraphQueryResult, JsonObject, JsonValue, ResolvedState } from "@kgos/sdk";

import { connectKnowledge } from "./graph-search.js";
import type { GraphReader } from "./graph-search.js";
import { connectQuery } from "./graph-queries.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const otherState = ("commit/" + "b".repeat(64)) as ResolvedState;

function node(id: number | string, properties: JsonObject = {}): JsonObject {
  return {
    $type: "Node",
    elementId: typeof id === "number" ? "n:" + String(id) : id,
    labels: ["Thing"],
    properties
  };
}

function edge(id: number, start = "n:1", end = "n:2"): JsonObject {
  return {
    $type: "Relationship",
    elementId: "r:" + String(id),
    start,
    end,
    type: "CONNECTS",
    properties: {}
  };
}

function result(rows: JsonValue[][] = []): GraphQueryResult {
  return { state, columns: ["a", "r", "b"], rows };
}

function reader(rows: JsonValue[][] = []): GraphReader {
  return { query: vi.fn<GraphReader["query"]>().mockResolvedValue(result(rows)) };
}

const signal = () => new AbortController().signal;

afterEach(() => vi.useRealTimers());

it("requests only relationships between the allowed seeds using parameters and the pinned State", async () => {
  const api = reader([[node(1), edge(1), node(2)]]);
  const graph = await connectKnowledge(api, state, ["n:1", "n:2", "n:1"], signal());

  expect(api.query).toHaveBeenCalledOnce();
  const call = vi.mocked(api.query).mock.calls[0];
  expect(call?.[0]).toEqual({
    at: state,
    cypher: connectQuery,
    params: { ids: ["n:1", "n:2"], limit: 401 }
  });
  expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(graph.nodes.map((item) => item.id)).toEqual(["n:1", "n:2"]);
  expect(graph.relationships.map((item) => [item.id, item.start, item.end])).toEqual([
    ["r:1", "n:1", "n:2"]
  ]);
  expect(graph.limited).toBe(false);
});

it("passes a Domain scope to the actual seed-connection query", async () => {
  const api = reader([[node(1), edge(1), node(2)]]);
  const graph = await connectKnowledge(api, state, ["n:1", "n:2"], {
    signal: signal(),
    domain: "domain:Scoped"
  });
  expect(graph.relationships).toHaveLength(1);
  expect(vi.mocked(api.query).mock.calls[0]?.[0]).toEqual({
    at: state,
    cypher: connectQuery,
    params: { ids: ["n:1", "n:2"], limit: 401 },
    domain: "domain:Scoped"
  });
});

it("retains actual parallel relationships and self-loops without treating edges as pairs", async () => {
  const api = reader([
    [node(1), edge(1), node(2)],
    [node(1), edge(2), node(2)],
    [node(1), edge(3, "n:1", "n:1"), node(1)]
  ]);
  const graph = await connectKnowledge(api, state, ["n:1", "n:2"], signal());
  expect(graph.nodes).toHaveLength(2);
  expect(graph.relationships.map((item) => item.id)).toEqual(["r:1", "r:2", "r:3"]);
  expect(graph.relationships[2]).toMatchObject({ start: "n:1", end: "n:1" });
});

it("supports a one-seed self-loop and canonical identities larger than JavaScript integers", async () => {
  const id = "n:18446744073709551615";
  const api = reader([[node(id), edge(1, id, id), node(id)]]);
  const graph = await connectKnowledge(api, state, [id], signal());
  expect(graph.nodes[0]?.id).toBe(id);
  expect(graph.relationships[0]).toMatchObject({ start: id, end: id });
  expect(vi.mocked(api.query).mock.calls[0]?.[0].params?.["ids"]).toEqual([id]);
});

it("accepts the canonical zero identity without numeric conversion", async () => {
  const api = reader([[node(0), edge(1, "n:0", "n:0"), node(0)]]);
  expect((await connectKnowledge(api, state, ["n:0"], signal())).nodes[0]?.id).toBe("n:0");
});

it("does not send a query for an empty seed list and does not fabricate seed metadata", async () => {
  const api = reader();
  expect(await connectKnowledge(api, state, [], signal())).toEqual({
    nodes: [],
    relationships: [],
    limited: false
  });
  expect(api.query).not.toHaveBeenCalled();
  expect(await connectKnowledge(api, state, ["n:1", "n:2"], signal())).toEqual({
    nodes: [],
    relationships: [],
    limited: false
  });
});

it("rejects oversized seed input instead of silently searching only its first 200 entries", async () => {
  const api = reader();
  const ids = Array.from({ length: 201 }, (_, index) => "n:" + String(index));
  await expect(connectKnowledge(api, state, ids, signal())).rejects.toThrow();
  expect(api.query).not.toHaveBeenCalled();
});

it.each(["r:1", "node:Thing", "n:-1", "n:01", "n:", "n:1' OR true", "n:18446744073709551616"])(
  "rejects an invalid seed identity before query dispatch: %s",
  async (id) => {
    const api = reader();
    await expect(connectKnowledge(api, state, [id], signal())).rejects.toThrow();
    expect(api.query).not.toHaveBeenCalled();
  }
);

it("rejects an outside target instead of automatically expanding beyond the allowed seed set", async () => {
  const api = reader([[node(1), edge(1, "n:1", "n:3"), node(3)]]);
  await expect(connectKnowledge(api, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects an outside source even when the relationship's target is an allowed seed", async () => {
  const api = reader([[node(3), edge(1, "n:3", "n:2"), node(2)]]);
  await expect(connectKnowledge(api, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects a reversed payload for a directed source-to-target query", async () => {
  const api = reader([[node(1), edge(1, "n:2", "n:1"), node(2)]]);
  await expect(connectKnowledge(api, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects internal marker nodes even if an adapter returns one for an allowed identity", async () => {
  const internal = { ...node(1), labels: ["__kgos_internal"] };
  const api = reader([[internal, edge(1), node(2)]]);
  await expect(connectKnowledge(api, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects conflicting node or edge payloads across rows instead of merging contradictory objects", async () => {
  const changedNode = reader([
    [node(1, { name: "First" }), edge(1), node(2)],
    [node(1, { name: "Changed" }), edge(2), node(2)]
  ]);
  await expect(connectKnowledge(changedNode, state, ["n:1", "n:2"], signal())).rejects.toThrow();
  const changedEdge = reader([
    [node(1), edge(1), node(2)],
    [node(1), { ...edge(1), properties: { changed: true } }, node(2)]
  ]);
  await expect(connectKnowledge(changedEdge, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it.each([
  [{ $type: "Node" }, edge(1), node(2)],
  [node(1), { $type: "Relationship" }, node(2)],
  [node(1), edge(1), { elementId: "n:2", labels: [], properties: {} }]
] satisfies JsonValue[][])("rejects malformed declared graph rows: %j", async (...row) => {
  const api = reader([row]);
  await expect(connectKnowledge(api, state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects mismatched State and result columns", async () => {
  const api = reader();
  vi.mocked(api.query).mockResolvedValueOnce({ ...result(), state: otherState });
  await expect(connectKnowledge(api, state, ["n:1"], signal())).rejects.toThrow();
  vi.mocked(api.query).mockResolvedValueOnce({ ...result(), columns: ["n", "r", "m"] });
  await expect(connectKnowledge(api, state, ["n:1"], signal())).rejects.toThrow();
});

it("displays at most four hundred actual relationships and marks an extra row as limited", async () => {
  const rows = Array.from({ length: 401 }, (_, index) => [node(1), edge(index + 1), node(2)]);
  const graph = await connectKnowledge(reader(rows), state, ["n:1", "n:2"], signal());
  expect(graph.nodes).toHaveLength(2);
  expect(graph.relationships).toHaveLength(400);
  expect(graph.relationships[399]?.id).toBe("r:400");
  expect(graph.limited).toBe(true);
});

it("does not mark exactly four hundred relationships as truncated", async () => {
  const rows = Array.from({ length: 400 }, (_, index) => [node(1), edge(index + 1), node(2)]);
  const graph = await connectKnowledge(reader(rows), state, ["n:1", "n:2"], signal());
  expect(graph.relationships).toHaveLength(400);
  expect(graph.limited).toBe(false);
});

it("does not ignore an out-of-scope endpoint in the extra overflow row", async () => {
  const rows = Array.from({ length: 400 }, (_, index) => [node(1), edge(index + 1), node(2)]);
  rows.push([node(1), edge(401, "n:1", "n:3"), node(3)]);
  await expect(connectKnowledge(reader(rows), state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("does not ignore a conflicting payload in the extra overflow row", async () => {
  const rows = Array.from({ length: 400 }, (_, index) => [node(1), edge(index + 1), node(2)]);
  rows.push([node(1, { changed: true }), edge(401), node(2)]);
  await expect(connectKnowledge(reader(rows), state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("rejects a response exceeding the requested limit instead of accepting an unbounded result", async () => {
  const rows = Array.from({ length: 402 }, (_, index) => [node(1), edge(index + 1), node(2)]);
  await expect(connectKnowledge(reader(rows), state, ["n:1", "n:2"], signal())).rejects.toThrow();
});

it("propagates read failure instead of reporting an empty connected graph", async () => {
  const api = reader();
  vi.mocked(api.query).mockRejectedValueOnce(new Error("Graph unavailable"));
  await expect(connectKnowledge(api, state, ["n:1"], signal())).rejects.toThrow(
    "Graph unavailable"
  );
});

it("honors a cancelled signal even when no seeds remain to query", async () => {
  const controller = new AbortController();
  controller.abort();
  const api = reader();
  await expect(connectKnowledge(api, state, [], controller.signal)).rejects.toMatchObject({
    name: "AbortError"
  });
  expect(api.query).not.toHaveBeenCalled();
});

it("does not return late graph data after a caller cancels an in-flight read", async () => {
  const pendingReply = Promise.withResolvers<GraphQueryResult>();
  const api: GraphReader = { query: vi.fn(() => pendingReply.promise) };
  const controller = new AbortController();
  const pending = connectKnowledge(api, state, ["n:1", "n:2"], controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  pendingReply.resolve(result([[node(1), edge(1), node(2)]]));
  await Promise.resolve();
  expect(api.query).toHaveBeenCalledOnce();
});

it("times out a non-responsive reader and clears its timer", async () => {
  vi.useFakeTimers();
  const pendingReply = Promise.withResolvers<GraphQueryResult>();
  const api: GraphReader = { query: vi.fn(() => pendingReply.promise) };
  const pending = connectKnowledge(api, state, ["n:1"], signal());
  const outcome = pending.catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(15_001);
  expect(await outcome).toMatchObject({ name: "TimeoutError" });
  expect(vi.getTimerCount()).toBe(0);
});
