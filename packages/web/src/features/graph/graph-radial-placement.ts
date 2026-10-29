import type { GraphData } from "./graph-data.js";
import type { GraphPoint } from "./graph-g6-data.js";
import { graphAttention } from "./graph-attention.js";

// Plan only positions of newly exposed nodes; previously visible coordinates
// (including manually pinned nodes) are never rewritten by the ring planner.
export function radialNeighborPositions(
  graph: GraphData,
  previous: ReadonlyMap<string, GraphPoint>,
  expanded: ReadonlySet<string>
): Map<string, GraphPoint> {
  const result = new Map<string, GraphPoint>();
  const groups = new Map<string, string[]>();
  const newIDs = graph.nodes
    .map((node) => node.id)
    .filter((id) => !previous.has(id))
    .sort();
  for (const id of newIDs) {
    const anchor = preferredAnchor(id, graph, previous, expanded);
    if (anchor === undefined) continue;
    groups.set(anchor, [...(groups.get(anchor) ?? []), id]);
  }
  for (const [anchor, ids] of groups) {
    const point = previous.get(anchor);
    if (point !== undefined) placeRings(result, ids, anchor, point);
  }
  return result;
}

function preferredAnchor(
  id: string,
  graph: GraphData,
  previous: ReadonlyMap<string, GraphPoint>,
  expanded: ReadonlySet<string>
): string | undefined {
  const anchors = new Set<string>();
  for (const edge of graph.relationships) {
    if (edge.start === id && previous.has(edge.end)) anchors.add(edge.end);
    if (edge.end === id && previous.has(edge.start)) anchors.add(edge.start);
  }
  return [...anchors].sort((a, b) => {
    if (expanded.has(a) !== expanded.has(b)) return expanded.has(a) ? -1 : 1;
    return a.localeCompare(b);
  })[0];
}

function placeRings(
  result: Map<string, GraphPoint>,
  ids: readonly string[],
  anchor: string,
  point: GraphPoint
): void {
  let offset = 0;
  let ring = 0;
  while (offset < ids.length) {
    const capacity = 8 + ring * 4;
    const batch = ids.slice(offset, offset + capacity);
    const radius = 168 + ring * 145;
    const phase = angle(anchor) + (ring % 2) * (Math.PI / capacity);
    for (const [index, id] of batch.entries()) {
      const theta = phase + (index * 2 * Math.PI) / batch.length;
      result.set(id, {
        x: point.x + radius * Math.cos(theta),
        y: point.y + radius * Math.sin(theta)
      });
    }
    offset += batch.length;
    ring++;
  }
}

function angle(id: string): number {
  let value = 2166136261;
  for (const character of id) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return ((value >>> 0) / 4294967296) * Math.PI * 2;
}

// Plan every real reachable hop in concentric rings around a fixed world-space
// center. No positions are written here and no unseen relationships are inferred.
// Dragging changes the center, while the relative ring offsets stay stable.
export function focusLayerPositions(
  data: GraphData,
  previous: ReadonlyMap<string, GraphPoint>,
  focusId: string,
  pinned: ReadonlySet<string>
): Map<string, GraphPoint> {
  const center = previous.get(focusId);
  if (center === undefined || !Number.isFinite(center.x) || !Number.isFinite(center.y))
    return new Map();
  const attention = graphAttention(data, focusId);
  if (!attention.active) return new Map();
  const context = {
    previous,
    pinned,
    center,
    branch: firstHopBranches(data, attention.distances, previous, center)
  };
  const result = new Map<string, GraphPoint>();
  let innerRadius = 0;
  const maxDepth = Math.max(0, ...attention.distances.values());
  for (let distance = 1; distance <= maxDepth; distance++) {
    const ids = orderedLayer(data, attention.distances, distance, context);
    const radius = Math.max(
      distance === 1 ? 178 : innerRadius + 168,
      (ids.length * 108) / (2 * Math.PI)
    );
    placeFocusLayer(result, ids, radius, context);
    innerRadius = radius;
  }
  return result;
}

function direction(point: GraphPoint, center: GraphPoint): number {
  return Math.atan2(point.y - center.y, point.x - center.x);
}

interface FocusContext {
  previous: ReadonlyMap<string, GraphPoint>;
  pinned: ReadonlySet<string>;
  center: GraphPoint;
  branch: ReadonlyMap<string, number>;
}

// Keep the branches of the same first-hop neighbor adjacent on outer rings.
// This avoids scattering one branch all over the circle as the graph grows.
function firstHopBranches(
  data: GraphData,
  distances: ReadonlyMap<string, number>,
  previous: ReadonlyMap<string, GraphPoint>,
  center: GraphPoint
): ReadonlyMap<string, number> {
  const rank = new Map<string, number>();
  const direct = data.nodes
    .map((node) => node.id)
    .filter((id) => distances.get(id) === 1 && previous.has(id))
    .sort((a, b) => {
      const pa = previous.get(a);
      const pb = previous.get(b);
      if (pa === undefined || pb === undefined) return a.localeCompare(b);
      return direction(pa, center) - direction(pb, center) || a.localeCompare(b);
    });
  direct.forEach((id, index) => rank.set(id, index));
  for (let depth = 2; depth <= Math.max(0, ...distances.values()); depth++) {
    for (const node of data.nodes) {
      if (distances.get(node.id) !== depth) continue;
      const parents = data.relationships.flatMap((edge) => {
        if (edge.start === node.id && distances.get(edge.end) === depth - 1) return [edge.end];
        if (edge.end === node.id && distances.get(edge.start) === depth - 1) return [edge.start];
        return [];
      });
      const ancestor = parents.sort(
        (a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b)
      )[0];
      const ancestorRank = ancestor === undefined ? undefined : rank.get(ancestor);
      if (ancestorRank !== undefined) rank.set(node.id, ancestorRank);
    }
  }
  return rank;
}

function orderedLayer(
  data: GraphData,
  distances: ReadonlyMap<string, number>,
  depth: number,
  context: FocusContext
): string[] {
  const { previous, center, branch } = context;
  return data.nodes
    .map((node) => node.id)
    .filter((id) => distances.get(id) === depth && previous.has(id))
    .sort((a, b) => {
      const first = previous.get(a);
      const second = previous.get(b);
      if (first === undefined || second === undefined) return a.localeCompare(b);
      return (
        (branch.get(a) ?? Infinity) - (branch.get(b) ?? Infinity) ||
        direction(first, center) - direction(second, center) ||
        a.localeCompare(b)
      );
    });
}

function focusPhase(
  ids: readonly string[],
  previous: ReadonlyMap<string, GraphPoint>,
  pinned: ReadonlySet<string>,
  center: GraphPoint
): number {
  const step = (2 * Math.PI) / ids.length;
  const fixedIndex = ids.findIndex((id) => pinned.has(id));
  const fixed = previous.get(ids[fixedIndex] ?? "");
  if (fixed !== undefined && fixedIndex >= 0) return direction(fixed, center) - step * fixedIndex;
  let x = 0;
  let y = 0;
  for (const [index, id] of ids.entries()) {
    const point = previous.get(id);
    if (point === undefined) continue;
    const angle = direction(point, center) - step * index;
    x += Math.cos(angle);
    y += Math.sin(angle);
  }
  return Math.atan2(y, x);
}

function placeFocusLayer(
  result: Map<string, GraphPoint>,
  ids: readonly string[],
  radius: number,
  context: FocusContext
): void {
  const { previous, pinned, center } = context;
  if (ids.length === 0) return;
  const phase = focusPhase(ids, previous, pinned, center);
  for (const [index, id] of ids.entries()) {
    if (pinned.has(id)) continue;
    const theta = phase + (index * 2 * Math.PI) / ids.length;
    const point = {
      x: center.x + radius * Math.cos(theta),
      y: center.y + radius * Math.sin(theta)
    };
    const old = previous.get(id);
    // Keep even already-settled nodes in the plan: they must follow the ring
    // if the center is dragged later.
    if (old !== undefined) result.set(id, point);
  }
}
