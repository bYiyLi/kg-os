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
import {
  connectQuery,
  fulltextQuery,
  INDEX_LIMIT,
  indexQuery,
  keywordQuery,
  NEIGHBOR_LIMIT,
  neighborQuery,
  SEARCH_LIMIT,
  semanticQuery
} from "./graph-queries.js";

export interface GraphReader {
  query: (request: GraphQueryRequest, options?: RequestOptions) => Promise<GraphQueryResult>;
}

export interface SearchRoute {
  kind: "keyword" | "fulltext" | "semantic";
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

async function keywordRoute(run: RunQuery, state: ResolvedState, query: string) {
  const rows = await run({
    request: { at: state, cypher: keywordQuery, params: { query, limit: SEARCH_LIMIT + 1 } },
    columns: ["n"],
    rows: SEARCH_LIMIT + 1
  });
  const nodes = nodesFromRows(rows.slice(0, SEARCH_LIMIT), false);
  return routeResult("keyword", nodes, "ok", rows.length > SEARCH_LIMIT);
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

// Reciprocal ranks keep unrelated BM25 and semantic score scales apart. Within
// a route each real index supplies a ranked list; routes then get equal weight.
function rankLists(lists: GraphNode[][]): GraphNode[] {
  const scores = new Map<string, number>();
  const all = lists.flat();
  const nodes = distinctCandidates(all);
  for (const list of lists) {
    const seen = new Set<string>();
    for (const [index, node] of list.entries()) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      scores.set(node.id, (scores.get(node.id) ?? 0) + 1 / (60 + index + 1));
    }
  }
  return [...nodes.values()].sort((left, right) => {
    const delta = (scores.get(right.id) ?? 0) - (scores.get(left.id) ?? 0);
    if (delta !== 0) return delta;
    return left.id < right.id ? -1 : Number(left.id > right.id);
  });
}

function distinctCandidates(items: GraphNode[]): Map<string, GraphNode> {
  const nodes = new Map<string, GraphNode>();
  for (const node of items) {
    const previous = nodes.get(node.id);
    if (previous !== undefined) {
      // Validate duplicates even beyond the visible graph's 200-node budget.
      mergeGraph(
        { nodes: [previous], relationships: [], limited: false },
        { nodes: [node], relationships: [], limited: false }
      );
    }
    nodes.set(node.id, node);
  }
  return nodes;
}

async function indexedRoute(
  run: RunQuery,
  input: { state: ResolvedState; query: string; kind: "fulltext" | "semantic" }
): Promise<RouteResult> {
  const { kind, state, query } = input;
  const type = kind === "fulltext" ? "FULLTEXT" : "SEMANTIC";
  const catalog = await run({
    request: { at: state, cypher: indexQuery, params: { type } },
    columns: ["name", "type", "labelsOrTypes"],
    rows: INDEX_LIMIT + 1
  });
  const names = indexNames(catalog, type).slice(0, INDEX_LIMIT);
  if (names.length === 0) return routeResult(kind, [], "unconfigured");
  const outcomes = await Promise.allSettled(
    names.map(async (index) => {
      const rows = await run({
        request: {
          at: state,
          cypher: kind === "fulltext" ? fulltextQuery : semanticQuery,
          params: { index, query, limit: SEARCH_LIMIT + 1 }
        },
        columns: ["node", "score"],
        rows: SEARCH_LIMIT + 1
      });
      return {
        nodes: nodesFromRows(rows.slice(0, SEARCH_LIMIT), true),
        overflow: rows.length > SEARCH_LIMIT
      };
    })
  );
  const succeeded = outcomes.filter((outcome) => outcome.status === "fulfilled");
  const ranked = rankLists(succeeded.map((outcome) => outcome.value.nodes));
  const failed = succeeded.length !== names.length;
  const limited =
    failed ||
    catalog.length > INDEX_LIMIT ||
    ranked.length > SEARCH_LIMIT ||
    succeeded.some((outcome) => outcome.value.overflow);
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
  const ranked = rankLists(results.map((result) => result.nodes));
  return {
    data: {
      nodes: ranked.slice(0, SEARCH_LIMIT),
      relationships: [],
      limited: ranked.length > SEARCH_LIMIT || results.some((result) => result.route.limited)
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
  const { signal, onProgress } = options;
  signal.throwIfAborted();
  const term = query.trim();
  if (term === "") return { data: emptyGraph(), routes: [] };
  const run = queryRunner(reader, signal);
  const kinds: SearchRoute["kind"][] = ["keyword", "fulltext", "semantic"];
  const results = kinds.map((kind) => routeResult(kind, [], "loading"));
  const operations = [
    () => keywordRoute(run, state, term),
    () => indexedRoute(run, { state, query: term, kind: "fulltext" }),
    () => indexedRoute(run, { state, query: term, kind: "semantic" })
  ];
  await Promise.all(
    kinds.map(async (kind, index) => {
      const operation = operations[index];
      if (operation === undefined) invalidResponse();
      results[index] = await protectRoute(kind, operation, signal);
      signal.throwIfAborted();
      onProgress?.(combinedResults(results));
    })
  );
  signal.throwIfAborted();
  return combinedResults(results);
}

function validateNeighbor(row: JsonValue[], id: string) {
  const [source, relationship, target] = row;
  if (!tagged(source, "Node") || !tagged(relationship, "Relationship") || !tagged(target, "Node"))
    invalidResponse();
  const data = projectGraph([row]);
  for (const node of data.nodes) assertKnowledgeNode(node);
  const edge = data.relationships[0];
  if (source["elementId"] !== id || edge === undefined) invalidResponse();
  const neighbor = target["elementId"];
  if (!(
    (edge.start === id && edge.end === neighbor) ||
    (edge.end === id && edge.start === neighbor)
  ))
    invalidResponse();
}

export async function expandKnowledge(
  reader: GraphReader,
  state: ResolvedState,
  id: string,
  signal: AbortSignal
): Promise<GraphData> {
  if (!/^n:(?:0|[1-9][0-9]{0,19})$/.test(id)) invalidResponse();
  const rows = await timedQuery(
    reader,
    {
      request: { at: state, cypher: neighborQuery, params: { id, limit: NEIGHBOR_LIMIT + 1 } },
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
  if (!Array.isArray(nodeIds) || nodeIds.length > SEARCH_LIMIT) invalidResponse();
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

// Read relationships among the already chosen seed identities, without loading
// any external neighbors or changing the three search routes and their ranks.
export async function connectKnowledge(
  reader: GraphReader,
  state: ResolvedState,
  nodeIds: readonly string[],
  signal: AbortSignal
): Promise<GraphData> {
  signal.throwIfAborted();
  const ids = connectionSeeds(nodeIds);
  if (ids.size === 0) return emptyGraph();
  const limit = 400;
  const rows = await timedQuery(
    reader,
    {
      request: { at: state, cypher: connectQuery, params: { ids: [...ids], limit: limit + 1 } },
      columns: ["a", "r", "b"],
      rows: limit + 1
    },
    signal
  );
  for (const row of rows) validateConnection(row, ids);
  const data = projectGraph(rows);
  return { ...data, limited: data.limited || rows.length > limit };
}
