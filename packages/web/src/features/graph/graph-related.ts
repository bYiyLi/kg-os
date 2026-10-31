import type { GraphQueryRequest, JsonObject, JsonValue, ResolvedState } from "@kgos/sdk";

import { emptyGraph, mergeGraph, projectGraph } from "./graph-data.js";
import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import { RECENT_LIMIT, RELATED_ROWS_LIMIT, relatedQuery } from "./graph-queries.js";

type RunQuery = (input: {
  request: GraphQueryRequest;
  columns: string[];
  rows: number;
}) => Promise<JsonValue[][]>;

interface RelatedLayer {
  candidates: GraphNode[];
  relationships: GraphRelationship[];
  limited: boolean;
}

interface RelatedVote {
  node: GraphNode;
  score: number;
  origins: Set<number>;
}

interface RelatedSearch {
  run: RunQuery;
  state: ResolvedState;
  seeds: GraphData;
  signal: AbortSignal;
  domain?: string | undefined;
  connect: (ids: string[]) => Promise<GraphData>;
}

function invalidResponse(): never {
  throw new Error("Invalid knowledge search response");
}

function tagged(value: JsonValue | undefined, type: string): value is JsonObject {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) && value["$type"] === type
  );
}

export function validateNeighbor(row: JsonValue[], id: string): void {
  const [source, relationship, target] = row;
  if (!tagged(source, "Node") || !tagged(relationship, "Relationship") || !tagged(target, "Node"))
    invalidResponse();
  const graph = projectGraph([row]);
  if (graph.limited || graph.nodes.some((node) => node.labels.includes("__kgos_internal")))
    invalidResponse();
  const edge = graph.relationships[0];
  const neighbor = target["elementId"];
  if (
    source["elementId"] !== id ||
    edge === undefined ||
    !((edge.start === id && edge.end === neighbor) || (edge.end === id && edge.start === neighbor))
  )
    invalidResponse();
}

function relatedSample(row: JsonValue[], frontier: GraphNode[]) {
  const rank = row[3];
  if (typeof rank !== "number" || !Number.isInteger(rank) || rank < 0 || rank >= frontier.length)
    invalidResponse();
  const origin = frontier[rank];
  if (origin === undefined) invalidResponse();
  validateNeighbor(row.slice(0, 3), origin.id);
  const graph = projectGraph([row.slice(0, 3)]);
  if (graph.limited || graph.relationships.length !== 1) invalidResponse();
  const target = row[2] as JsonObject;
  const node = graph.nodes.find((candidate) => candidate.id === target["elementId"]);
  if (node === undefined) invalidResponse();
  return { graph, node, rank };
}

function retainSample(
  graph: GraphData,
  nodes: Map<string, GraphNode>,
  relationships: Map<string, GraphRelationship>
): void {
  for (const node of graph.nodes) {
    const previous = nodes.get(node.id);
    if (previous !== undefined)
      mergeGraph(
        { nodes: [previous], relationships: [], limited: false },
        { nodes: [node], relationships: [], limited: false }
      );
    nodes.set(node.id, node);
  }
  const edge = graph.relationships[0];
  if (edge === undefined) invalidResponse();
  const previous = relationships.get(edge.id);
  if (previous !== undefined) {
    const endpoints = [nodes.get(edge.start), nodes.get(edge.end)].filter(
      (node): node is GraphNode => node !== undefined
    );
    mergeGraph(
      { nodes: endpoints, relationships: [previous], limited: false },
      { nodes: endpoints, relationships: [edge], limited: false }
    );
  }
  relationships.set(edge.id, edge);
}

function addVote(votes: Map<string, RelatedVote>, node: GraphNode, rank: number): void {
  const vote = votes.get(node.id) ?? { node, score: 0, origins: new Set<number>() };
  if (!vote.origins.has(rank)) {
    vote.score += 1 / (rank + 1);
    vote.origins.add(rank);
  }
  votes.set(node.id, vote);
}

// Multiple high-ranked search origins carry more weight. Parallel edges from
// the same origin count only once, while each index retains its own Top-K.
async function readRelatedLayer(
  run: RunQuery,
  state: ResolvedState,
  frontier: GraphNode[],
  domain?: string
): Promise<RelatedLayer> {
  const perSeed = Math.max(1, Math.ceil(RELATED_ROWS_LIMIT / frontier.length));
  const rows = await run({
    request: {
      at: state,
      cypher: relatedQuery,
      params: {
        seeds: frontier.map((node, rank) => ({ id: node.id, rank })),
        perSeed,
        limit: RELATED_ROWS_LIMIT + 1
      },
      ...(domain === undefined ? {} : { domain })
    },
    columns: ["n", "r", "m", "priority"],
    rows: RELATED_ROWS_LIMIT + 1
  });
  const nodes = new Map<string, GraphNode>();
  const relationships = new Map<string, GraphRelationship>();
  const votes = new Map<string, RelatedVote>();
  const counts = new Map<number, number>();
  for (const row of rows.slice(0, RELATED_ROWS_LIMIT)) {
    const sample = relatedSample(row, frontier);
    retainSample(sample.graph, nodes, relationships);
    addVote(votes, sample.node, sample.rank);
    counts.set(sample.rank, (counts.get(sample.rank) ?? 0) + 1);
  }
  return {
    candidates: [...votes.values()]
      .sort((a, b) => b.score - a.score || a.node.id.localeCompare(b.node.id))
      .map((vote) => vote.node),
    relationships: [...relationships.values()],
    limited:
      rows.length > RELATED_ROWS_LIMIT || [...counts.values()].some((count) => count >= perSeed)
  };
}

function extendFrontier(
  layer: RelatedLayer,
  accepted: Map<string, GraphNode>,
  observed: Map<string, GraphRelationship>
): GraphNode[] {
  for (const edge of layer.relationships) observed.set(edge.id, edge);
  const next: GraphNode[] = [];
  for (const node of layer.candidates) {
    if (accepted.has(node.id)) continue;
    accepted.set(node.id, node);
    next.push(node);
    if (accepted.size === RECENT_LIMIT) break;
  }
  return next;
}

// Real one-hop neighbors are preferred to two-hop neighbors. The result can
// remain below 200 when the graph is sparse; recent nodes are never filler.
export async function enrichRelatedKnowledge({
  run,
  state,
  seeds,
  signal,
  domain,
  connect
}: RelatedSearch): Promise<{ data: GraphData; failed: boolean }> {
  if (seeds.nodes.length === 0) return { data: emptyGraph(), failed: false };
  const accepted = new Map(seeds.nodes.map((node) => [node.id, node]));
  const observed = new Map<string, GraphRelationship>();
  let frontier = seeds.nodes;
  let limited = false;
  let failed = false;
  for (let hop = 0; hop < 2 && accepted.size < RECENT_LIMIT && frontier.length > 0; hop++) {
    try {
      const layer = await readRelatedLayer(run, state, frontier, domain);
      limited ||= layer.limited;
      frontier = extendFrontier(layer, accepted, observed);
    } catch {
      signal.throwIfAborted();
      failed = true;
      break;
    }
  }
  const included = new Set(accepted.keys());
  let data = mergeGraph(seeds, {
    nodes: [...accepted.values()].slice(seeds.nodes.length),
    relationships: [...observed.values()].filter(
      (edge) => included.has(edge.start) && included.has(edge.end)
    ),
    limited
  });
  // Also preserve links between selected nodes that did not form the search
  // frontier; never add invented endpoints to make a graph look connected.
  try {
    data = mergeGraph(data, await connect([...accepted.keys()]));
  } catch {
    signal.throwIfAborted();
    failed = true;
  }
  return { data, failed };
}
