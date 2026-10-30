// cspell:words unconfigured

import { afterEach, expect, it, vi } from "vitest";
import type {
  GraphQueryRequest,
  GraphQueryResult,
  JsonObject,
  JsonValue,
  ResolvedState
} from "@kgos/sdk";

import { expandKnowledge, searchKnowledge } from "./graph-search.js";
import type { GraphReader, KnowledgeSearchResult } from "./graph-search.js";
import {
  fulltextQuery,
  indexQuery,
  keywordQuery,
  neighborQuery,
  recentQuery,
  semanticQuery
} from "./graph-queries.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const other = ("commit/" + "b".repeat(64)) as ResolvedState;
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

function reply(
  request: GraphQueryRequest,
  columns: string[],
  rows: JsonValue[][]
): GraphQueryResult {
  return { state: request.at as ResolvedState, columns, rows };
}

interface Fixture {
  recent?: JsonValue[][];
  keyword?: JsonValue[][];
  fulltext?: JsonValue[][];
  semantic?: JsonValue[][];
  catalogs?: { fulltext?: string[]; semantic?: string[] };
  neighbors?: JsonValue[][];
  fail?: string[];
}

function fixture(options: Fixture = {}): GraphReader {
  return {
    query: vi.fn<GraphReader["query"]>().mockImplementation(async (request) => {
      await Promise.resolve();
      if (options.fail?.includes(request.cypher) === true) throw new Error("Unavailable");
      if (request.cypher === recentQuery) return reply(request, ["n"], options.recent ?? []);
      if (request.cypher === keywordQuery) return reply(request, ["n"], options.keyword ?? []);
      if (request.cypher === neighborQuery)
        return reply(request, ["n", "r", "m"], options.neighbors ?? []);
      if (request.cypher === indexQuery) {
        const type = request.params?.["type"];
        const names = type === "FULLTEXT" ? options.catalogs?.fulltext : options.catalogs?.semantic;
        return reply(
          request,
          ["name", "type", "labelsOrTypes"],
          (names ?? []).map((name) => [name, type ?? "", ["Thing"]])
        );
      }
      if (request.cypher === fulltextQuery)
        return reply(request, ["node", "score"], options.fulltext ?? []);
      if (request.cypher === semanticQuery)
        return reply(request, ["node", "score"], options.semantic ?? []);
      throw new Error("Unexpected graph request");
    })
  };
}

function search(reader: GraphReader, at: ResolvedState, query: string, requestSignal: AbortSignal) {
  return searchKnowledge(reader, at, query, { signal: requestSignal });
}

afterEach(() => vi.useRealTimers());

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

it("runs all four routes at one immutable State and ranks search matches above recent fallback", async () => {
  const reader = fixture({
    recent: [[node(9)], [node(2)]],
    keyword: [[node(1)], [node(2)]],
    catalogs: { fulltext: ["text"], semantic: ["semantic"] },
    fulltext: [
      [node(2), 0.000002],
      [node(3), 0.000001]
    ],
    semantic: [
      [node(3), 1],
      [node(2), 0.2]
    ]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:2", "n:3", "n:1", "n:9"]);
  expect(result.data.relationships).toEqual([]);
  expect(result.routes).toEqual([
    { kind: "recent", status: "ok", count: 2, limited: false },
    { kind: "keyword", status: "ok", count: 2, limited: false },
    { kind: "fulltext", status: "ok", count: 2, limited: false },
    { kind: "semantic", status: "ok", count: 2, limited: false }
  ]);
  expect(vi.mocked(reader.query).mock.calls).toHaveLength(6);
  for (const [request, options] of vi.mocked(reader.query).mock.calls) {
    expect(request.at).toBe(state);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  }
});

it("preserves high-relevance nodes when recent knowledge fills all 200 slots", async () => {
  const recent = Array.from({ length: 201 }, (_, index) => [node(500 - index)]);
  const reader = fixture({ recent, keyword: [[node(1)]] });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes).toHaveLength(200);
  expect(result.data.nodes[0]?.id).toBe("n:1");
  expect(result.data.nodes.at(-1)?.id).toBe("n:302");
  expect(result.routes[0]).toEqual({ kind: "recent", status: "ok", count: 200, limited: true });
  expect(result.data.limited).toBe(true);
});

it("keeps recent knowledge when semantic search fails and other routes have no hits", async () => {
  const reader = fixture({
    recent: [[node(42)], [node(41)]],
    catalogs: { semantic: ["embedding"] },
    fail: [semanticQuery]
  });
  const result = await search(reader, state, "unmatched words", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:42", "n:41"]);
  expect(result.routes.map((route) => route.status)).toEqual(["ok", "ok", "unconfigured", "error"]);
  expect(result.data.limited).toBe(true);
});

it("keeps user text and real index names as parameters rather than executable Cypher", async () => {
  const text = "' OR true // 中文";
  const index = "index`with'quotes";
  const reader = fixture({ catalogs: { fulltext: [index] } });
  await search(reader, state, text, signal());
  const calls = vi.mocked(reader.query).mock.calls.map(([request]) => request);
  expect(calls.find((request) => request.cypher === keywordQuery)?.params?.["query"]).toBe(text);
  expect(calls.find((request) => request.cypher === fulltextQuery)?.params).toEqual({
    index,
    query: text,
    limit: 51
  });
  expect(
    calls.some((request) => request.cypher.includes(text) || request.cypher.includes(index))
  ).toBe(false);
});

it("reports missing indexes separately from an actual completed zero-match keyword search", async () => {
  const result = await search(fixture(), state, "nothing", signal());
  expect(result.routes).toEqual([
    { kind: "recent", status: "ok", count: 0, limited: false },
    { kind: "keyword", status: "ok", count: 0, limited: false },
    { kind: "fulltext", status: "unconfigured", count: 0, limited: false },
    { kind: "semantic", status: "unconfigured", count: 0, limited: false }
  ]);
  expect(result.data).toEqual({ nodes: [], relationships: [], limited: false });
});

it("loads recent knowledge when no keyword was supplied without running indexed routes", async () => {
  const reader = fixture({ recent: [[node(12)], [node(9)]] });
  const result = await search(reader, state, " \n ", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:12", "n:9"]);
  expect(result.routes).toEqual([{ kind: "recent", status: "ok", count: 2, limited: false }]);
  expect(vi.mocked(reader.query).mock.calls).toHaveLength(1);
  expect(vi.mocked(reader.query).mock.calls[0]?.[0]).toMatchObject({
    at: state,
    cypher: recentQuery,
    params: { limit: 201 }
  });
});

it("preserves successful routes when semantic provider or index discovery fails", async () => {
  const reader = fixture({
    keyword: [[node(1)]],
    catalogs: { semantic: ["semantic"] },
    fail: [semanticQuery]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[3]).toEqual({ kind: "semantic", status: "error", count: 0, limited: true });
  expect(result.data.limited).toBe(true);
  const failedCatalog = await search(
    fixture({ keyword: [[node(2)]], fail: [indexQuery] }),
    state,
    "x",
    signal()
  );
  expect(failedCatalog.data.nodes.map((item) => item.id)).toEqual(["n:2"]);
  expect(failedCatalog.routes.map((route) => route.status)).toEqual(["ok", "ok", "error", "error"]);
});

it("publishes keyword matches while semantic is still loading and keeps them after provider failure", async () => {
  const reader = fixture({ keyword: [[node(1)]], catalogs: { semantic: ["semantic"] } });
  const original = reader.query;
  const provider = Promise.withResolvers<GraphQueryResult>();
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    return request.cypher === semanticQuery ? provider.promise : original(request, options);
  });
  const progress = vi.fn<(result: KnowledgeSearchResult) => void>();
  const pending = searchKnowledge(reader, state, "example", {
    signal: signal(),
    onProgress: progress
  });
  await vi.waitFor(() => {
    expect(
      progress.mock.calls.some(
        ([value]) => value.data.nodes[0]?.id === "n:1" && value.routes[3]?.status === "loading"
      )
    ).toBe(true);
  });
  provider.reject(new Error("Provider unavailable"));
  const result = await pending;
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[3]?.status).toBe("error");
  expect(progress).toHaveBeenLastCalledWith(result);
});

it("never publishes a late route after the caller cancels an already visible partial search", async () => {
  const reader = fixture({ keyword: [[node(1)]], catalogs: { semantic: ["semantic"] } });
  const original = reader.query;
  const provider = Promise.withResolvers<GraphQueryResult>();
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    return request.cypher === semanticQuery ? provider.promise : original(request, options);
  });
  const controller = new AbortController();
  const progress = vi.fn<(result: KnowledgeSearchResult) => void>();
  const pending = searchKnowledge(reader, state, "example", {
    signal: controller.signal,
    onProgress: progress
  });
  await vi.waitFor(() => {
    expect(progress.mock.calls.some(([value]) => value.data.nodes.length === 1)).toBe(true);
  });
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  const published = progress.mock.calls.length;
  provider.resolve({ state, columns: ["node", "score"], rows: [[node(2), 1]] });
  await Promise.resolve();
  await Promise.resolve();
  expect(progress).toHaveBeenCalledTimes(published);
});

it("retains matches from an index when another index in that route fails", async () => {
  const reader = fixture({ catalogs: { fulltext: ["good", "bad"] }, fulltext: [[node(1), 0.1]] });
  const original = reader.query;
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    if (request.params?.["index"] === "bad") return Promise.reject(new Error("Index unavailable"));
    return original(request, options);
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[2]).toEqual({ kind: "fulltext", status: "error", count: 1, limited: true });
});

it("caps index fan-out and candidate lists while making the restricted scope visible", async () => {
  const names = Array.from({ length: 17 }, (_, index) => "index" + String(index));
  const reader = fixture({
    keyword: Array.from({ length: 51 }, (_, index) => [node(index)]),
    catalogs: { fulltext: names },
    fulltext: [[node(100), 0.9]]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes).toHaveLength(51);
  expect(result.routes[1]).toMatchObject({ count: 50, limited: true });
  expect(result.routes[2]).toMatchObject({ count: 1, limited: true });
  expect(result.data.limited).toBe(true);
  expect(
    vi.mocked(reader.query).mock.calls.filter(([request]) => request.cypher === fulltextQuery)
  ).toHaveLength(16);
});

it("rejects malformed graphs, mismatched State and invalid score rows as route errors", async () => {
  const reader = fixture({
    keyword: [[{ $type: "Node" }]],
    catalogs: { fulltext: ["text"] },
    fulltext: [[node(2), "wrong"]]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.routes.map((route) => route.status)).toEqual([
    "ok",
    "error",
    "error",
    "unconfigured"
  ]);
  const mismatched = fixture({ keyword: [[node(1)]] });
  const original = mismatched.query;
  mismatched.query = vi.fn<GraphReader["query"]>().mockImplementation(async (request, options) => ({
    ...(await original(request, options)),
    state: other
  }));
  const rejected = await search(mismatched, state, "example", signal());
  expect(rejected.data.nodes).toEqual([]);
  expect(rejected.routes.map((route) => route.status)).toEqual([
    "error",
    "error",
    "error",
    "error"
  ]);
});

it("does not display internal marker nodes even when a transport returns them", async () => {
  const internal = { ...node(1), labels: ["__kgos_internal"] };
  const result = await search(fixture({ keyword: [[internal]] }), state, "example", signal());
  expect(result.data.nodes).toEqual([]);
  expect(result.routes[1]?.status).toBe("error");
});

it("rejects conflicting payloads instead of inventing a merged knowledge object", async () => {
  const reader = fixture({
    keyword: [[node(1, "old")]],
    catalogs: { fulltext: ["text"] },
    fulltext: [[node(1, "changed"), 1]]
  });
  await expect(search(reader, state, "example", signal())).rejects.toThrow(
    "Invalid graph response"
  );
});

it("propagates cancellation even if an adapter ignores the signal and resolves late", async () => {
  const controller = new AbortController();
  const reader: GraphReader = {
    query: vi.fn(() => Promise.withResolvers<GraphQueryResult>().promise)
  };
  const pending = search(reader, state, "example", controller.signal);
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("times out reads without turning a partial failure into a successful empty graph", async () => {
  vi.useFakeTimers();
  const reader: GraphReader = {
    query: vi.fn(() => Promise.withResolvers<GraphQueryResult>().promise)
  };
  const pending = search(reader, state, "example", signal());
  await vi.advanceTimersByTimeAsync(15_001);
  const result = await pending;
  expect(result.routes.map((route) => route.status)).toEqual(["error", "error", "error", "error"]);
  expect(result.data.limited).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});

it("limits the shared transport concurrency across both index routes", async () => {
  const reader = fixture({
    catalogs: { fulltext: ["a", "b", "c", "d"], semantic: ["e", "f", "g", "h"] }
  });
  const original = reader.query;
  let active = 0;
  let maximum = 0;
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation(async (request, options) => {
    active++;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    const result = await original(request, options);
    active--;
    return result;
  });
  await search(reader, state, "example", signal());
  expect(maximum).toBeLessThanOrEqual(4);
});

it("limits the accumulated response encoding across many otherwise valid index reads", async () => {
  const large = { ...node(1), properties: { body: "x".repeat(8 * 1024 * 1024) } };
  const reader = fixture({
    keyword: [[large]],
    catalogs: { fulltext: ["a", "b", "c", "d", "e"] },
    fulltext: [[large, 0.5]]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[1]?.status).toBe("ok");
  expect(result.routes[2]).toMatchObject({ status: "error", limited: true });
  expect(result.data.limited).toBe(true);
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

it("applies Domain to four knowledge routes, but not to index discovery", async () => {
  const reader = fixture({
    recent: [[node(3)]],
    keyword: [[node(2)]],
    catalogs: { fulltext: ["full_text"], semantic: ["semantic"] },
    fulltext: [[node(1), 0.9]],
    semantic: [[node(1), 0.8]]
  });
  await searchKnowledge(reader, state, "rule", {
    signal: signal(),
    domain: "domain:DevelopmentDelivery"
  });
  const calls = vi.mocked(reader.query).mock.calls.map(([request]) => request);
  const catalogs = calls.filter((call) => call.cypher === indexQuery);
  const candidates = calls.filter((call) => call.cypher !== indexQuery);
  expect(catalogs).toHaveLength(2);
  expect(catalogs.every((call) => call.domain === undefined)).toBe(true);
  expect(candidates).toHaveLength(4);
  expect(candidates.every((call) => call.domain === "domain:DevelopmentDelivery")).toBe(true);
});
