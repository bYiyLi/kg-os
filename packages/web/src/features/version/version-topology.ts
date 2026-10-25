import type { VersionCommit } from "./version-data.js";

export interface VersionTopologyNode {
  state: string;
  commit: VersionCommit | null;
  row: number;
  lane: number;
}

export interface VersionTopologyEdge {
  child: VersionTopologyNode;
  parent: VersionTopologyNode;
}

export interface VersionTopology {
  nodes: VersionTopologyNode[];
  edges: VersionTopologyEdge[];
  laneCount: number;
}

function reserveLane(lanes: (string | null)[], state: string, preferred?: number): number {
  const existing = lanes.indexOf(state);
  if (existing >= 0) return existing;
  let lane = preferred;
  if (lane === undefined || lanes[lane] != null) {
    const vacant = lanes.indexOf(null);
    lane = vacant < 0 ? lanes.length : vacant;
  }
  lanes[lane] = state;
  return lane;
}

function validateOrder(commits: readonly VersionCommit[], indices: ReadonlyMap<string, number>) {
  for (const [row, commit] of commits.entries()) {
    for (const parent of commit.parents) {
      const index = indices.get(parent);
      if (index !== undefined && index <= row) {
        throw new Error("Invalid reverse-topological version ancestry");
      }
    }
  }
}

function connectParents(
  nodes: readonly VersionTopologyNode[],
  positions: ReadonlyMap<string, VersionTopologyNode>
): VersionTopologyEdge[] {
  const edges: VersionTopologyEdge[] = [];
  for (const child of nodes) {
    for (const state of new Set(child.commit?.parents ?? [])) {
      const parent = positions.get(state);
      if (parent !== undefined) edges.push({ child, parent });
    }
  }
  return edges;
}

// Input is one pinned ancestry, in the daemon's reverse-topological page order.
// Time and ref names never establish a parent relationship.
export function layoutVersionTopology(commits: readonly VersionCommit[]): VersionTopology {
  const unique = [...new Map(commits.map((commit) => [commit.state, commit])).values()];
  const indices = new Map(unique.map((commit, index) => [commit.state, index]));
  const nodes: VersionTopologyNode[] = [];
  const positions = new Map<string, VersionTopologyNode>();
  const lanes: (string | null)[] = [];
  const missing = new Set<string>();
  validateOrder(unique, indices);

  for (const [row, commit] of unique.entries()) {
    const parents = [...new Set(commit.parents)];
    const lane = reserveLane(lanes, commit.state);
    const node = { state: commit.state, commit, row, lane };
    nodes.push(node);
    positions.set(commit.state, node);
    lanes[lane] = null;
    for (const [index, parent] of parents.entries()) {
      reserveLane(lanes, parent, index === 0 ? lane : undefined);
      if (!indices.has(parent)) missing.add(parent);
    }
  }

  // Explicit unselectable endpoints distinguish unread parents from real roots.
  for (const state of missing) {
    const node = { state, commit: null, row: nodes.length, lane: reserveLane(lanes, state) };
    nodes.push(node);
    positions.set(state, node);
  }

  return {
    nodes,
    edges: connectParents(nodes, positions),
    laneCount: nodes.reduce((max, node) => Math.max(max, node.lane + 1), 1)
  };
}
