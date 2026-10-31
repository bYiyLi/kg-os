// cspell:words unconfigured

import type {
  GraphQueryRequest,
  GraphQueryResult,
  JsonObject,
  JsonValue,
  RequestOptions,
  ResolvedState
} from "@kgos/sdk";

import { emptyGraph, mergeGraph, projectGraph } from "./graph-data.js";
import type { GraphData, GraphNode } from "./graph-data.js";
import { enrichRelatedKnowledge, validateNeighbor } from "./graph-related.js";
import { distinctCandidates, rankLists } from "./graph-ranking.js";
import {
  connectQuery,
  fulltextBatchQuery,
  fulltextQuery,
  INDEX_LIMIT,
  indexQuery,
  keywordQuery,
  NEIGHBOR_LIMIT,
  neighborQuery,
  RECENT_LIMIT,
  recentQuery,
  SEARCH_LIMIT,
  semanticBatchQuery,
  semanticQuery
} from "./graph-queries.js";

export interface GraphReader {
  query: (request: GraphQueryRequest, options?: RequestOptions) => Promise<GraphQueryResult>;
}

export interface SearchRoute {
  kind: "recent" | "keyword" | "fulltext" | "semantic" | "related";
  status: "loading" | "ok" | "unconfigured" | "error";
  count: number;
  limited: boolean;
}

export interface KnowledgeSearchResult {
  data: GraphData;
  routes: SearchRoute[];
}

export interface KnowledgeSearchOptions {
  signal: AbortSignal;
  onProgress?: (result: KnowledgeSearchResult) => void;
  domain?: string | undefined;
}

interface RouteResult {
  route: SearchRoute;
  nodes: GraphNode[];
}

interface CheckedRequest {
  request: GraphQueryRequest;
  columns: string[];
  rows: number;
}

type RunQuery = (input: CheckedRequest) => Promise<JsonValue[][]>;

function invalidResponse(): never {
  throw new Error("Invalid knowledge search response");
}

function checkedRows(result: GraphQueryResult, input: CheckedRequest): JsonValue[][] {
  if (
    result.state !== input.request.at ||
    !Array.isArray(result.columns) ||
    result.columns.length !== input.columns.length ||
    !result.columns.every((value, index) => value === input.columns[index]) ||
    !Array.isArray(result.rows) ||
    result.rows.length > input.rows ||
    !result.rows.every((row) => Array.isArray(row) && row.length === input.columns.length)
  )
    invalidResponse();
  return result.rows;
}

async function timedQuery(
  reader: GraphReader,
  input: CheckedRequest,
  signal: AbortSignal
): Promise<JsonValue[][]> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => {
    controller.abort(signal.reason);
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => {
    controller.abort(new DOMException("Knowledge read timed out", "TimeoutError"));
  }, 15_000);
  try {
    const response = await cancelableQuery(reader, input.request, controller.signal);
    controller.signal.throwIfAborted();
    return checkedRows(response, input);
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}

async function cancelableQuery(
  reader: GraphReader,
  request: GraphQueryRequest,
  signal: AbortSignal
): Promise<GraphQueryResult> {
  let cleanup: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    const stop = () => {
      const reason: unknown = signal.reason;
      reject(
        reason instanceof Error
          ? reason
          : new DOMException("Knowledge read cancelled", "AbortError")
      );
    };
    signal.addEventListener("abort", stop, { once: true });
    cleanup = () => {
      signal.removeEventListener("abort", stop);
    };
  });
  try {
    signal.throwIfAborted();
    return await Promise.race([reader.query(request, { signal }), aborted]);
  } finally {
    cleanup?.();
  }
}

function queryRunner(reader: GraphReader, signal: AbortSignal): RunQuery {
  let active = 0;
  let bytes = 0;
  let exhausted = false;
  const queue: (() => void)[] = [];
  async function acquire() {
    if (active < 4) {
      active++;
      return;
    }
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  function release() {
    const next = queue.shift();
    if (next === undefined) active--;
    else next();
  }
  return async (input) => {
    await acquire();
    try {
      signal.throwIfAborted();
      if (exhausted) throw new Error("Knowledge search response budget exceeded");
      const rows = await timedQuery(reader, input, signal);
      bytes += new TextEncoder().encode(JSON.stringify(rows)).byteLength;
      if (bytes > 32 * 1024 * 1024) {
        exhausted = true;
        throw new Error("Knowledge search response budget exceeded");
      }
      return rows;
    } finally {
      release();
    }
  };
}

function assertKnowledgeNode(node: GraphNode): GraphNode {
  if (node.labels.includes("__kgos_internal")) invalidResponse();
  return node;
}

function tagged(value: JsonValue | undefined, type: string): value is JsonObject {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && value["$type"] === type
  );
}

function nodesFromRows(rows: JsonValue[][], scored: boolean): GraphNode[] {
  const nodes: GraphNode[] = [];
  for (const row of rows) {
    if (!tagged(row[0], "Node")) invalidResponse();
    const graph = projectGraph([[row[0]]]);
    if (graph.nodes.length !== 1 || graph.relationships.length !== 0 || graph.limited)
      invalidResponse();
    const node = graph.nodes[0];
    if (node === undefined) invalidResponse();
    if (scored && (typeof row[1] !== "number" || !Number.isFinite(row[1]))) invalidResponse();
    nodes.push(assertKnowledgeNode(node));
  }
  // Also reject conflicting payloads that arrive under one identity.
  mergeGraph(emptyGraph(), { nodes, relationships: [], limited: false });
  return nodes;
}

function routeResult(
  kind: SearchRoute["kind"],
  nodes: GraphNode[],
  status: SearchRoute["status"] = "ok",
  limited = false
): RouteResult {
  return { route: { kind, status, count: nodes.length, limited }, nodes };
}

async function keywordRoute(run: RunQuery, state: ResolvedState, query: string, domain?: string) {
  const rows = await run({
    request: {
      at: state,
      cypher: keywordQuery,
      params: { query, limit: SEARCH_LIMIT + 1 },
      ...(domain === undefined ? {} : { domain })
    },
    columns: ["n"],
    rows: SEARCH_LIMIT + 1
  });
  const nodes = nodesFromRows(rows.slice(0, SEARCH_LIMIT), false);
  return routeResult("keyword", nodes, "ok", rows.length > SEARCH_LIMIT);
}

async function recentRoute(
  run: RunQuery,
  state: ResolvedState,
  domain?: string
): Promise<RouteResult> {
  const rows = await run({
    request: {
      at: state,
      cypher: recentQuery,
      params: { limit: RECENT_LIMIT + 1 },
      ...(domain === undefined ? {} : { domain })
    },
    columns: ["n"],
    rows: RECENT_LIMIT + 1
  });
  const nodes = nodesFromRows(rows.slice(0, RECENT_LIMIT), false);
  return routeResult("recent", nodes, "ok", rows.length > RECENT_LIMIT);
}

function indexNames(rows: JsonValue[][], type: string): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    const name = row[0];
    const labels = row[2];
    if (
      typeof name !== "string" ||
      name === "" ||
      row[1] !== type ||
      !Array.isArray(labels) ||
      !labels.every((label) => typeof label === "string") ||
      names.has(name)
    )
      invalidResponse();
    names.add(name);
  }
  return [...names];
}

async function indexedRoute(
  run: RunQuery,
  input: {
    state: ResolvedState;
    query: string;
    kind: "fulltext" | "semantic";
    domain?: string | undefined;
  }
): Promise<RouteResult> {
  const { kind, state, query, domain } = input;
  const type = kind === "fulltext" ? "FULLTEXT" : "SEMANTIC";
  const catalog = await run({
    request: { at: state, cypher: indexQuery, params: { type } },
    columns: ["name", "type", "labelsOrTypes"],
    rows: INDEX_LIMIT + 1
  });
  const names = indexNames(catalog, type).slice(0, INDEX_LIMIT);
  if (names.length === 0) return routeResult(kind, [], "unconfigured");
  async function singleIndex(index: string) {
    const rows = await run({
      request: {
        at: state,
        cypher: kind === "fulltext" ? fulltextQuery : semanticQuery,
        params: { index, query, limit: SEARCH_LIMIT + 1 },
        ...(domain === undefined ? {} : { domain })
      },
      columns: ["node", "score"],
      rows: SEARCH_LIMIT + 1
    });
    return {
      nodes: nodesFromRows(rows.slice(0, SEARCH_LIMIT), true),
      overflow: rows.length > SEARCH_LIMIT
    };
  }

  let succeeded: { nodes: GraphNode[]; overflow: boolean }[];
  let failed = false;
  try {
    const rows = await run({
      request: {
        at: state,
        cypher: kind === "fulltext" ? fulltextBatchQuery : semanticBatchQuery,
        params: { indexes: names, query, limit: SEARCH_LIMIT + 1 },
        ...(domain === undefined ? {} : { domain })
      },
      columns: ["indexName", "node", "score"],
      rows: names.length * (SEARCH_LIMIT + 1)
    });
    const byIndex = new Map(names.map((name) => [name, [] as JsonValue[][]]));
    for (const row of rows) {
      const name = row[0];
      if (typeof name !== "string" || !byIndex.has(name)) invalidResponse();
      byIndex.get(name)?.push([row[1] as JsonValue, row[2] as JsonValue]);
    }
    succeeded = names.map((name) => {
      const hits = byIndex.get(name);
      if (hits === undefined || hits.length > SEARCH_LIMIT + 1) invalidResponse();
      return {
        nodes: nodesFromRows(hits.slice(0, SEARCH_LIMIT), true),
        overflow: hits.length > SEARCH_LIMIT
      };
    });
  } catch (error) {
    // A broken individual index must not hide results from the others. This
    // bounded fallback is used only if the normal one-request batch fails.
    if (
      error instanceof Error &&
      (error.message === "Invalid knowledge search response" ||
        error.message === "Knowledge search response budget exceeded")
    )
      throw error;
    const outcomes = await Promise.allSettled(names.map(singleIndex));
    succeeded = outcomes.flatMap((outcome) =>
      outcome.status === "fulfilled" ? [outcome.value] : []
    );
    failed = succeeded.length !== names.length;
  }
  const ranked = rankLists(succeeded.map((outcome) => outcome.nodes));
  const limited =
    failed ||
    catalog.length > INDEX_LIMIT ||
    ranked.length > SEARCH_LIMIT ||
    succeeded.some((outcome) => outcome.overflow);
  return routeResult(kind, ranked.slice(0, SEARCH_LIMIT), failed ? "error" : "ok", limited);
}

async function protectRoute(
  kind: SearchRoute["kind"],
  operation: () => Promise<RouteResult>,
  signal: AbortSignal
): Promise<RouteResult> {
  try {
    const result = await operation();
    signal.throwIfAborted();
    return result;
  } catch {
    signal.throwIfAborted();
    return routeResult(kind, [], "error", true);
  }
}

function combinedResults(results: RouteResult[]): KnowledgeSearchResult {
  // Empty-search browsing uses recent nodes. Keyword searches contain only
  // actual retrieval candidates; related nodes are added separately.
  const ranked = rankLists(
    results.filter((result) => result.route.kind !== "recent").map((result) => result.nodes)
  );
  const recent = results.find((result) => result.route.kind === "recent")?.nodes ?? [];
  const merged = [...distinctCandidates([...ranked, ...recent]).values()];
  return {
    data: {
      nodes: merged.slice(0, RECENT_LIMIT),
      relationships: [],
      limited: merged.length > RECENT_LIMIT || results.some((result) => result.route.limited)
    },
    routes: results.map((result) => result.route)
  };
}

export async function searchKnowledge(
  reader: GraphReader,
  state: ResolvedState,
  query: string,
  options: KnowledgeSearchOptions
): Promise<KnowledgeSearchResult> {
  const { signal, onProgress, domain } = options;
  signal.throwIfAborted();
  const term = query.trim();
  const run = queryRunner(reader, signal);
  const kinds: ("recent" | "keyword" | "fulltext" | "semantic")[] =
    term === "" ? ["recent"] : ["keyword", "fulltext", "semantic"];
  const results = kinds.map((kind) => routeResult(kind, [], "loading"));
  const operations: Record<(typeof kinds)[number], () => Promise<RouteResult>> = {
    recent: () => recentRoute(run, state, domain),
    keyword: () => keywordRoute(run, state, term, domain),
    fulltext: () => indexedRoute(run, { state, query: term, kind: "fulltext", domain }),
    semantic: () => indexedRoute(run, { state, query: term, kind: "semantic", domain })
  };
  await Promise.all(
    kinds.map(async (kind, index) => {
      results[index] = await protectRoute(kind, operations[kind], signal);
      signal.throwIfAborted();
      onProgress?.(combinedResults(results));
    })
  );
  signal.throwIfAborted();
  const candidates = combinedResults(results);
  if (term === "") return candidates;
  onProgress?.({
    ...candidates,
    routes: [...candidates.routes, { kind: "related", status: "loading", count: 0, limited: false }]
  });
  const related = await enrichRelatedKnowledge({
    run,
    state,
    seeds: candidates.data,
    signal,
    domain,
    connect: (ids) =>
      connectKnowledge(reader, state, ids, domain === undefined ? signal : { signal, domain })
  });
  signal.throwIfAborted();
  const data = mergeGraph(candidates.data, related.data);
  const enriched: KnowledgeSearchResult = {
    data: { ...data, limited: data.limited || related.failed },
    routes: [
      ...candidates.routes,
      {
        kind: "related",
        status: related.failed ? "error" : "ok",
        count: data.nodes.length - candidates.data.nodes.length,
        limited: related.data.limited || related.failed
      }
    ]
  };
  onProgress?.(enriched);
  return enriched;
}

type ScopedSignal = AbortSignal | { signal: AbortSignal; domain: string };

function resolveSearchScope(scope: ScopedSignal) {
  return "signal" in scope ? scope : { signal: scope, domain: undefined };
}

export async function expandKnowledge(
  reader: GraphReader,
  state: ResolvedState,
  id: string,
  scope: ScopedSignal
): Promise<GraphData> {
  const { signal, domain } = resolveSearchScope(scope);
  if (!/^n:(?:0|[1-9][0-9]{0,19})$/.test(id)) invalidResponse();
  const rows = await timedQuery(
    reader,
    {
      request: {
        at: state,
        cypher: neighborQuery,
        params: { id, limit: NEIGHBOR_LIMIT + 1 },
        ...(domain === undefined ? {} : { domain })
      },
      columns: ["n", "r", "m"],
      rows: NEIGHBOR_LIMIT + 1
    },
    signal
  );
  const displayed = rows.slice(0, NEIGHBOR_LIMIT);
  for (const row of displayed) validateNeighbor(row, id);
  const data = projectGraph(displayed);
  return { ...data, limited: data.limited || rows.length > NEIGHBOR_LIMIT };
}

function connectionSeeds(nodeIds: readonly string[]): Set<string> {
  if (!Array.isArray(nodeIds) || nodeIds.length > RECENT_LIMIT) invalidResponse();
  const ids = new Set<string>();
  for (const id of nodeIds) {
    if (
      typeof id !== "string" ||
      !/^n:(?:0|[1-9][0-9]{0,19})$/.test(id) ||
      BigInt(id.slice(2)) > 18446744073709551615n
    )
      invalidResponse();
    ids.add(id);
  }
  return ids;
}

function validateConnection(row: JsonValue[], ids: ReadonlySet<string>) {
  const [source, relationship, target] = row;
  if (!tagged(source, "Node") || !tagged(relationship, "Relationship") || !tagged(target, "Node"))
    invalidResponse();
  const start = source["elementId"];
  const end = target["elementId"];
  if (typeof start !== "string" || typeof end !== "string" || !ids.has(start) || !ids.has(end))
    invalidResponse();
  validateNeighbor(row, start);
  if (relationship["start"] !== start || relationship["end"] !== end) invalidResponse();
}

// Read relationships among the chosen seed identities, without adding neighbors
// or changing any route's rank.
export async function connectKnowledge(
  reader: GraphReader,
  state: ResolvedState,
  nodeIds: readonly string[],
  scope: ScopedSignal
): Promise<GraphData> {
  const { signal, domain } = resolveSearchScope(scope);
  signal.throwIfAborted();
  const ids = connectionSeeds(nodeIds);
  if (ids.size === 0) return emptyGraph();
  const limit = 400;
  const rows = await timedQuery(
    reader,
    {
      request: {
        at: state,
        cypher: connectQuery,
        params: { ids: [...ids], limit: limit + 1 },
        ...(domain === undefined ? {} : { domain })
      },
      columns: ["a", "r", "b"],
      rows: limit + 1
    },
    signal
  );
  for (const row of rows) validateConnection(row, ids);
  const data = projectGraph(rows);
  return { ...data, limited: data.limited || rows.length > limit };
}
