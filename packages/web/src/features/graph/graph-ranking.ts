import { mergeGraph } from "./graph-data.js";
import type { GraphNode } from "./graph-data.js";

// Reciprocal ranks keep unrelated BM25 and semantic score scales apart. Within
// a route each real index supplies a ranked list; routes then get equal weight.
export function rankLists(lists: GraphNode[][]): GraphNode[] {
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

export function distinctCandidates(items: GraphNode[]): Map<string, GraphNode> {
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
