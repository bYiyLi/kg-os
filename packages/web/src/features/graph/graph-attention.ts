import type { GraphData } from "./graph-data.js";

function adjacencyOf(data: GraphData): Map<string, Set<string>> {
  const adjacency = new Map(data.nodes.map((node) => [node.id, new Set<string>()]));
  for (const edge of data.relationships) {
    if (!adjacency.has(edge.start) || !adjacency.has(edge.end)) continue;
    adjacency.get(edge.start)?.add(edge.end);
    adjacency.get(edge.end)?.add(edge.start);
  }
  return adjacency;
}

function shortestHops(adjacency: ReadonlyMap<string, ReadonlySet<string>>, roots: string[]) {
  const pending = [...new Set(roots.filter((id) => adjacency.has(id)))];
  const distances = new Map<string, number>(pending.map((id) => [id, 0]));
  for (const id of pending) {
    const distance = distances.get(id) ?? 0;
    for (const neighbor of adjacency.get(id) ?? []) {
      if (distances.has(neighbor)) continue;
      distances.set(neighbor, distance + 1);
      pending.push(neighbor);
    }
  }
  return distances;
}

// The visual depth is the shortest undirected path in the graph currently
// loaded from one immutable State, not a claim about unseen backend neighbors.
export function graphAttention(data: GraphData, selected: string | null) {
  const adjacency = adjacencyOf(data);
  const roots = selected !== null && adjacency.has(selected) ? [selected] : [];
  if (roots.length === 0) {
    const edge = data.relationships.find((item) => item.id === selected);
    if (edge !== undefined) roots.push(edge.start, edge.end);
  }
  const distances = shortestHops(adjacency, roots);
  const nearNodes = new Set([...distances].filter(([, depth]) => depth <= 1).map(([id]) => id));
  const nearEdges = new Set(
    data.relationships
      .filter((edge) => nearNodes.has(edge.start) && nearNodes.has(edge.end))
      .map((edge) => edge.id)
  );
  return { active: distances.size > 0, nearNodes, nearEdges, distances };
}

export type AttentionTier = "hop-2" | "hop-3" | "hop-4" | "hop-5" | "hop-6" | "unreachable";

// A missing depth means another visible connected component, not a graph node
// absent from the search result. 0 and 1 stay fully visible.
export function attentionTier(depth: number | undefined): AttentionTier | null {
  if (depth === undefined) return "unreachable";
  if (depth <= 1) return null;
  if (depth === 2) return "hop-2";
  if (depth === 3) return "hop-3";
  if (depth === 4) return "hop-4";
  if (depth === 5) return "hop-5";
  return "hop-6";
}

export function edgeAttentionTier(
  distances: ReadonlyMap<string, number>,
  start: string,
  end: string
): AttentionTier | null {
  const a = distances.get(start);
  const b = distances.get(end);
  if (a === undefined || b === undefined) return "unreachable";
  return attentionTier(Math.max(a, b));
}

// Display a small set of entry labels until the user selects a node.
// All other real graph elements remain drawn and accessible.
export function readableNodeIds(data: GraphData, selected: string | null): ReadonlySet<string> {
  const attention = graphAttention(data, selected);
  return attention.active
    ? attention.nearNodes
    : new Set(data.nodes.slice(0, 16).map((node) => node.id));
}
