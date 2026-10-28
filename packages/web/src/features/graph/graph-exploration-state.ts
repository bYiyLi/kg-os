import { emptyGraph, mergeGraph } from "./graph-data.js";
import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";

export interface GraphSources {
  seed: GraphData;
  expansions: ReadonlyMap<string, GraphData>;
  pending: ReadonlyMap<string, GraphNode>;
  hidden: ReadonlySet<string>;
  lastHidden: string | null;
}

export function emptySources(): GraphSources {
  return {
    seed: emptyGraph(),
    expansions: new Map(),
    pending: new Map(),
    hidden: new Set(),
    lastHidden: null
  };
}

function fullGraph(
  seed: GraphData,
  expansions: ReadonlyMap<string, GraphData>,
  pending: ReadonlyMap<string, GraphNode>
): GraphData {
  // A request retains its real origin even when its parent expansion is removed.
  // Reserve those already-visible nodes before accepting more neighbors.
  const chunks = [seed, { ...emptyGraph(), nodes: [...pending.values()] }, ...expansions.values()];
  return mergeGraph(emptyGraph(), {
    nodes: chunks.flatMap((chunk) => chunk.nodes),
    relationships: chunks.flatMap((chunk) => chunk.relationships),
    limited: chunks.some((chunk) => chunk.limited)
  });
}

function acceptedItems<T extends GraphNode | GraphRelationship>(
  items: T[],
  accepted: ReadonlyMap<string, T>
): T[] {
  return items.flatMap((item) => {
    const canonical = accepted.get(item.id);
    return canonical === undefined ? [] : [canonical];
  });
}

function boundedSources(
  sources: GraphSources,
  seed: GraphData,
  expansions: ReadonlyMap<string, GraphData>,
  pending = sources.pending
): GraphSources {
  const accepted = fullGraph(seed, expansions, pending);
  const nodes = new Map(accepted.nodes.map((node) => [node.id, node]));
  const relationships = new Map(accepted.relationships.map((edge) => [edge.id, edge]));
  function contribution(chunk: GraphData): GraphData {
    const keptNodes = acceptedItems(chunk.nodes, nodes);
    const keptRelationships = acceptedItems(chunk.relationships, relationships);
    return {
      nodes: keptNodes,
      relationships: keptRelationships,
      limited:
        chunk.limited ||
        keptNodes.length !== chunk.nodes.length ||
        keptRelationships.length !== chunk.relationships.length
    };
  }
  return {
    ...sources,
    seed: contribution(seed),
    expansions: new Map([...expansions].map(([id, chunk]) => [id, contribution(chunk)])),
    pending: new Map(
      [...pending].flatMap(([id]) => {
        const node = nodes.get(id);
        return node === undefined ? [] : [[id, node]];
      })
    )
  };
}

export function visibleGraph(sources: GraphSources): GraphData {
  const graph = fullGraph(sources.seed, sources.expansions, sources.pending);
  return {
    nodes: graph.nodes.filter((node) => !sources.hidden.has(node.id)),
    relationships: graph.relationships.filter(
      (edge) =>
        !sources.hidden.has(edge.id) &&
        !sources.hidden.has(edge.start) &&
        !sources.hidden.has(edge.end)
    ),
    limited: graph.limited
  };
}

export function replaceSeeds(sources: GraphSources, seed: GraphData): GraphSources {
  if (sources.seed === seed) return sources;
  return boundedSources(sources, seed, sources.expansions);
}

export function addExpansion(sources: GraphSources, id: string, addition: GraphData): GraphSources {
  // Validate against all retained entities, including hidden ones and the old
  // contribution of this node, before replacing any provenance.
  mergeGraph(fullGraph(sources.seed, sources.expansions, sources.pending), addition);
  const origin = sources.pending.get(id);
  const contribution =
    origin === undefined ? addition : mergeGraph({ ...emptyGraph(), nodes: [origin] }, addition);
  const expansions = new Map(sources.expansions).set(id, contribution);
  const pending = new Map(sources.pending);
  pending.delete(id);
  return boundedSources(sources, sources.seed, expansions, pending);
}

export function startPendingExpansion(sources: GraphSources, id: string): GraphSources {
  if (sources.pending.has(id)) return sources;
  const origin = visibleGraph(sources).nodes.find((node) => node.id === id);
  if (origin === undefined) return sources;
  return { ...sources, pending: new Map(sources.pending).set(id, origin) };
}

export function clearPendingExpansion(sources: GraphSources, id: string): GraphSources {
  if (!sources.pending.has(id)) return sources;
  const pending = new Map(sources.pending);
  pending.delete(id);
  return { ...sources, pending };
}

export function removeExpansion(sources: GraphSources, id: string): GraphSources {
  if (!sources.expansions.has(id) && !sources.pending.has(id)) return sources;
  const expansions = new Map(sources.expansions);
  expansions.delete(id);
  return { ...clearPendingExpansion(sources, id), expansions };
}

export function hideElement(sources: GraphSources, id: string): GraphSources {
  if (sources.hidden.has(id)) return sources;
  const graph = visibleGraph(sources);
  if (![...graph.nodes, ...graph.relationships].some((item) => item.id === id)) return sources;
  return {
    ...clearPendingExpansion(sources, id),
    hidden: new Set(sources.hidden).add(id),
    lastHidden: id
  };
}

export function restoreHidden(sources: GraphSources): GraphSources {
  if (sources.lastHidden === null) return sources;
  const hidden = new Set(sources.hidden);
  hidden.delete(sources.lastHidden);
  return { ...sources, hidden, lastHidden: null };
}
