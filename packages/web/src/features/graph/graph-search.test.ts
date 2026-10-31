// cspell:words unconfigured

import { afterEach, expect, it, vi } from "vitest";
import type {
  GraphQueryRequest,
  GraphQueryResult,
  JsonObject,
  JsonValue,
  ResolvedState
} from "@kgos/sdk";

import { searchKnowledge } from "./graph-search.js";
import type { GraphReader, KnowledgeSearchResult } from "./graph-search.js";
import {
  connectQuery,
  fulltextBatchQuery,
  fulltextQuery,
  indexQuery,
  keywordQuery,
  recentQuery,
  relatedQuery,
  semanticBatchQuery,
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
  related?: JsonValue[][][];
  connections?: JsonValue[][];
  fail?: string[];
}

function fixture(options: Fixture = {}): GraphReader {
  let hop = 0;
  return {
    query: vi.fn<GraphReader["query"]>().mockImplementation(async (request) => {
      await Promise.resolve();
      if (options.fail?.includes(request.cypher) === true) throw new Error("Unavailable");
      if (request.cypher === recentQuery) return reply(request, ["n"], options.recent ?? []);
      if (request.cypher === keywordQuery) return reply(request, ["n"], options.keyword ?? []);
      if (request.cypher === relatedQuery)
        return reply(request, ["n", "r", "m", "priority"], options.related?.[hop++] ?? []);
      if (request.cypher === connectQuery)
        return reply(request, ["a", "r", "b"], options.connections ?? []);
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
      if (request.cypher === fulltextBatchQuery || request.cypher === semanticBatchQuery) {
        const source = request.cypher === fulltextBatchQuery ? options.fulltext : options.semantic;
        const names = request.params?.["indexes"];
        if (!Array.isArray(names)) throw new Error("Missing index names");
        return reply(
          request,
          ["indexName", "node", "score"],
          names.flatMap((name) => (source ?? []).map((row) => [name, ...row]))
        );
      }
      throw new Error("Unexpected graph request");
    })
  };
}

function search(reader: GraphReader, at: ResolvedState, query: string, requestSignal: AbortSignal) {
  return searchKnowledge(reader, at, query, { signal: requestSignal });
}

afterEach(() => vi.useRealTimers());

it("runs only keyword, full-text and semantic on a searched State, without recent filler", async () => {
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
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:2", "n:3", "n:1"]);
  expect(result.data.relationships).toEqual([]);
  expect(result.routes).toEqual([
    { kind: "keyword", status: "ok", count: 2, limited: false },
    { kind: "fulltext", status: "ok", count: 2, limited: false },
    { kind: "semantic", status: "ok", count: 2, limited: false },
    { kind: "related", status: "ok", count: 0, limited: false }
  ]);
  expect(vi.mocked(reader.query).mock.calls).toHaveLength(7);
  expect(
    vi.mocked(reader.query).mock.calls.some(([request]) => request.cypher === recentQuery)
  ).toBe(false);
  for (const [request, options] of vi.mocked(reader.query).mock.calls) {
    expect(request.at).toBe(state);
    expect(options?.signal).toBeInstanceOf(AbortSignal);
  }
});

it("does not fill unmatched search slots with the 200 most recent nodes", async () => {
  const recent = Array.from({ length: 201 }, (_, index) => [node(500 - index)]);
  const reader = fixture({ recent, keyword: [[node(1)]] });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes).toHaveLength(1);
  expect(result.data.nodes[0]?.id).toBe("n:1");
  expect(result.routes[0]).toEqual({ kind: "keyword", status: "ok", count: 1, limited: false });
  expect(result.data.limited).toBe(false);
});

it("does not fall back to unrelated recent nodes when semantic search fails", async () => {
  const reader = fixture({
    recent: [[node(42)], [node(41)]],
    catalogs: { semantic: ["embedding"] },
    fail: [semanticBatchQuery, semanticQuery]
  });
  const result = await search(reader, state, "unmatched words", signal());
  expect(result.data.nodes).toEqual([]);
  expect(result.routes.map((route) => route.status)).toEqual(["ok", "unconfigured", "error", "ok"]);
  expect(result.data.limited).toBe(true);
});

it("keeps user text and real index names as parameters rather than executable Cypher", async () => {
  const text = "' OR true // 中文";
  const index = "index`with'quotes";
  const reader = fixture({ catalogs: { fulltext: [index] } });
  await search(reader, state, text, signal());
  const calls = vi.mocked(reader.query).mock.calls.map(([request]) => request);
  expect(calls.find((request) => request.cypher === keywordQuery)?.params?.["query"]).toBe(text);
  expect(calls.find((request) => request.cypher === fulltextBatchQuery)?.params).toEqual({
    indexes: [index],
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
    { kind: "keyword", status: "ok", count: 0, limited: false },
    { kind: "fulltext", status: "unconfigured", count: 0, limited: false },
    { kind: "semantic", status: "unconfigured", count: 0, limited: false },
    { kind: "related", status: "ok", count: 0, limited: false }
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
    fail: [semanticBatchQuery, semanticQuery]
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[2]).toEqual({ kind: "semantic", status: "error", count: 0, limited: true });
  expect(result.data.limited).toBe(true);
  const failedCatalog = await search(
    fixture({ keyword: [[node(2)]], fail: [indexQuery] }),
    state,
    "x",
    signal()
  );
  expect(failedCatalog.data.nodes.map((item) => item.id)).toEqual(["n:2"]);
  expect(failedCatalog.routes.map((route) => route.status)).toEqual(["ok", "error", "error", "ok"]);
});

it("publishes keyword matches while semantic is still loading and keeps them after provider failure", async () => {
  const reader = fixture({ keyword: [[node(1)]], catalogs: { semantic: ["semantic"] } });
  const original = reader.query;
  const provider = Promise.withResolvers<GraphQueryResult>();
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    if (request.cypher === semanticBatchQuery) return provider.promise;
    if (request.cypher === semanticQuery) return Promise.reject(new Error("Provider unavailable"));
    return original(request, options);
  });
  const progress = vi.fn<(result: KnowledgeSearchResult) => void>();
  const pending = searchKnowledge(reader, state, "example", {
    signal: signal(),
    onProgress: progress
  });
  await vi.waitFor(() => {
    expect(
      progress.mock.calls.some(
        ([value]) => value.data.nodes[0]?.id === "n:1" && value.routes[2]?.status === "loading"
      )
    ).toBe(true);
  });
  provider.reject(new Error("Provider unavailable"));
  const result = await pending;
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[2]?.status).toBe("error");
  expect(progress).toHaveBeenLastCalledWith(result);
});

it("never publishes a late route after the caller cancels an already visible partial search", async () => {
  const reader = fixture({ keyword: [[node(1)]], catalogs: { semantic: ["semantic"] } });
  const original = reader.query;
  const provider = Promise.withResolvers<GraphQueryResult>();
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    return request.cypher === semanticBatchQuery ? provider.promise : original(request, options);
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
  provider.resolve({
    state,
    columns: ["indexName", "node", "score"],
    rows: [["semantic", node(2), 1]]
  });
  await Promise.resolve();
  await Promise.resolve();
  expect(progress).toHaveBeenCalledTimes(published);
});

it("retains matches from an index when another index in that route fails", async () => {
  const reader = fixture({ catalogs: { fulltext: ["good", "bad"] }, fulltext: [[node(1), 0.1]] });
  const original = reader.query;
  reader.query = vi.fn<GraphReader["query"]>().mockImplementation((request, options) => {
    if (request.cypher === fulltextBatchQuery)
      return Promise.reject(new Error("Index unavailable"));
    if (request.params?.["index"] === "bad") return Promise.reject(new Error("Index unavailable"));
    return original(request, options);
  });
  const result = await search(reader, state, "example", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes[1]).toEqual({ kind: "fulltext", status: "error", count: 1, limited: true });
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
  expect(result.routes[0]).toMatchObject({ count: 50, limited: true });
  expect(result.routes[1]).toMatchObject({ count: 1, limited: true });
  expect(result.data.limited).toBe(true);
  expect(
    vi.mocked(reader.query).mock.calls.filter(([request]) => request.cypher === fulltextBatchQuery)
  ).toHaveLength(1);
  expect(
    vi
      .mocked(reader.query)
      .mock.calls.find(([request]) => request.cypher === fulltextBatchQuery)?.[0].params?.[
      "indexes"
    ]
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
    "error",
    "error",
    "unconfigured",
    "ok"
  ]);
  const mismatched = fixture({ keyword: [[node(1)]] });
  const original = mismatched.query;
  mismatched.query = vi.fn<GraphReader["query"]>().mockImplementation(async (request, options) => ({
    ...(await original(request, options)),
    state: other
  }));
  const rejected = await search(mismatched, state, "example", signal());
  expect(rejected.data.nodes).toEqual([]);
  expect(rejected.routes.map((route) => route.status)).toEqual(["error", "error", "error", "ok"]);
});

it("does not display internal marker nodes even when a transport returns them", async () => {
  const internal = { ...node(1), labels: ["__kgos_internal"] };
  const result = await search(fixture({ keyword: [[internal]] }), state, "example", signal());
  expect(result.data.nodes).toEqual([]);
  expect(result.routes[0]?.status).toBe("error");
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
  expect(result.routes.map((route) => route.status)).toEqual(["error", "error", "error", "ok"]);
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
  expect(result.routes[0]?.status).toBe("ok");
  expect(result.routes[1]).toMatchObject({ status: "error", limited: true });
  expect(result.data.limited).toBe(true);
});

it("enriches ranked search hits through real links, preferring shared high-ranked origins", async () => {
  const reader = fixture({
    keyword: [[node(9)], [node(2)]],
    related: [
      [
        [node(9), edge(1, 9, 30), node(30), 0],
        [node(9), edge(2, 9, 40), node(40), 0],
        [node(9), edge(3, 9, 40), node(40), 0],
        [node(2), edge(4, 2, 31), node(31), 1],
        [node(2), edge(5, 2, 30), node(30), 1]
      ],
      []
    ]
  });
  const result = await search(reader, state, "needle", signal());
  expect(result.data.nodes.map((node) => node.id)).toEqual(["n:9", "n:2", "n:30", "n:40", "n:31"]);
  expect(result.data.relationships.map((edge) => edge.id)).toEqual([
    "r:1",
    "r:2",
    "r:3",
    "r:4",
    "r:5"
  ]);
  expect(result.routes.at(-1)).toEqual({
    kind: "related",
    status: "ok",
    count: 3,
    limited: false
  });
  const calls = vi.mocked(reader.query).mock.calls.map(([request]) => request);
  expect(calls.filter((request) => request.cypher === relatedQuery)).toHaveLength(2);
  expect(calls.filter((request) => request.cypher === connectQuery)).toHaveLength(1);
  expect(calls.every((request) => request.at === state)).toBe(true);
});

it("fills only genuine one- and two-hop neighbors, never unrelated recent nodes", async () => {
  const reader = fixture({
    recent: [[node(99)]],
    keyword: [[node(1)]],
    related: [[[node(1), edge(1, 1, 2), node(2), 0]], [[node(2), edge(2, 2, 3), node(3), 0]]]
  });
  const result = await search(reader, state, "needle", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1", "n:2", "n:3"]);
  expect(result.data.relationships).toHaveLength(2);
  expect(result.routes.at(-1)?.count).toBe(2);
  expect(vi.mocked(reader.query).mock.calls.map(([request]) => request.cypher)).not.toContain(
    recentQuery
  );
});

it("does not request related nodes when none of the three search lanes match", async () => {
  const reader = fixture({ recent: [[node(99)]] });
  const result = await search(reader, state, "absent", signal());
  expect(result.data.nodes).toEqual([]);
  expect(
    vi.mocked(reader.query).mock.calls.some(([request]) => request.cypher === relatedQuery)
  ).toBe(false);
  expect(
    vi.mocked(reader.query).mock.calls.some(([request]) => request.cypher === connectQuery)
  ).toBe(false);
});

it("keeps valid keyword matches when a related query returns corrupt graph data", async () => {
  const reader = fixture({
    keyword: [[node(1)]],
    related: [[[node(1), edge(1, 90, 91), node(2), 0]]]
  });
  const result = await search(reader, state, "needle", signal());
  expect(result.data.nodes.map((item) => item.id)).toEqual(["n:1"]);
  expect(result.routes.at(-1)).toMatchObject({ kind: "related", status: "error", limited: true });
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
  expect(candidates).toHaveLength(5);
  expect(candidates.every((call) => call.domain === "domain:DevelopmentDelivery")).toBe(true);
});
