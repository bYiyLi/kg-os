import type { GraphData } from "./graph-data.js";
import type { GraphPoint } from "./graph-g6-types.js";

// Keep the initial graph legible before G6's bounded force relaxation runs.
// These positions are presentation-only; no node or relationship is inferred.
const NODE_CLEARANCE = 168;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Region {
  center: GraphPoint;
  radius: number;
}

interface PlacementContext {
  positions: ReadonlyMap<string, GraphPoint>;
  links: readonly [string, string][];
}

interface PlacedEdge {
  from: string;
  to: string;
  a: GraphPoint;
  b: GraphPoint;
}

interface Neighbor {
  id: string;
  point: GraphPoint;
}

function distance(a: GraphPoint, b: GraphPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function mean(points: readonly GraphPoint[]): GraphPoint {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function connectedComponents(adjacent: ReadonlyMap<string, ReadonlySet<string>>): string[][] {
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const id of [...adjacent.keys()].sort()) {
    if (visited.has(id)) continue;
    const group: string[] = [];
    const stack = [id];
    visited.add(id);
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      group.push(current);
      for (const neighbor of [...(adjacent.get(current) ?? [])].sort()) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        stack.push(neighbor);
      }
    }
    components.push(group.sort());
  }
  components.sort((a, b) => b.length - a.length || (a[0] ?? "").localeCompare(b[0] ?? ""));
  return components;
}

function graphTopology(data: GraphData) {
  const adjacent = new Map<string, Set<string>>(
    data.nodes.map((node) => [node.id, new Set<string>()])
  );
  const links: [string, string][] = [];
  const seen = new Set<string>();
  for (const edge of data.relationships) {
    if (!adjacent.has(edge.start) || !adjacent.has(edge.end) || edge.start === edge.end) continue;
    const from = edge.start < edge.end ? edge.start : edge.end;
    const to = edge.start < edge.end ? edge.end : edge.start;
    const key = from + "\0" + to;
    if (seen.has(key)) continue;
    seen.add(key);
    adjacent.get(from)?.add(to);
    adjacent.get(to)?.add(from);
    links.push([from, to]);
  }
  return { adjacent, links, components: connectedComponents(adjacent) };
}

function regionCenter(regions: readonly Region[], radius: number): GraphPoint {
  for (let trial = 0; trial < 100_000; trial++) {
    const length = 260 * Math.sqrt(trial);
    const angle = trial * GOLDEN_ANGLE;
    const candidate = { x: length * Math.cos(angle), y: length * Math.sin(angle) };
    if (
      regions.every((region) => distance(candidate, region.center) >= radius + region.radius + 100)
    )
      return candidate;
  }
  // The graph is bounded to 400 visible nodes, so the search above should suffice.
  return { x: (regions.length + 1) * 20_000, y: 0 };
}

function crosses(a: GraphPoint, b: GraphPoint, c: GraphPoint, d: GraphPoint): boolean {
  const side = (p: GraphPoint, q: GraphPoint, r: GraphPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function placedEdges(id: string, context: PlacementContext): PlacedEdge[] {
  return context.links.flatMap(([from, to]) => {
    if (from === id || to === id) return [];
    const a = context.positions.get(from);
    const b = context.positions.get(to);
    return a === undefined || b === undefined ? [] : [{ from, to, a, b }];
  });
}

function candidateScore(
  candidate: GraphPoint,
  center: GraphPoint,
  neighbors: readonly Neighbor[],
  edges: readonly PlacedEdge[]
): number {
  const crossings = neighbors.reduce(
    (count, neighbor) =>
      count +
      edges.filter(
        (edge) =>
          edge.from !== neighbor.id &&
          edge.to !== neighbor.id &&
          crosses(candidate, neighbor.point, edge.a, edge.b)
      ).length,
    0
  );
  const length =
    neighbors.length === 0
      ? distance(candidate, center) ** 2
      : neighbors.reduce((sum, neighbor) => sum + distance(candidate, neighbor.point) ** 2, 0) /
        neighbors.length;
  return crossings * 100_000 + length + distance(candidate, center) ** 2 * 0.06;
}

function placeNear(
  id: string,
  center: GraphPoint,
  neighbors: readonly Neighbor[],
  context: PlacementContext
): GraphPoint {
  const anchor = neighbors.length === 0 ? center : mean(neighbors.map((entry) => entry.point));
  const occupied = [...context.positions.values()];
  const edges = placedEdges(id, context);
  for (let ring = 0; ring < 40; ring++) {
    const radius = ring === 0 ? 0 : 176 + (ring - 1) * 85;
    const count = ring === 0 ? 1 : Math.max(16, Math.ceil((2 * Math.PI * radius) / 168));
    const candidates = Array.from({ length: count }, (_, index) => {
      const angle = index * ((2 * Math.PI) / count) + GOLDEN_ANGLE;
      return {
        x: anchor.x + radius * Math.cos(angle),
        y: anchor.y + radius * Math.sin(angle)
      };
    }).filter((candidate) =>
      occupied.every((point) => distance(candidate, point) >= NODE_CLEARANCE)
    );
    // The first collision-free ring keeps connected nodes close instead of
    // letting a distant crossing-free candidate scatter them around the canvas.
    if (candidates.length > 0)
      return candidates.reduce((best, current) =>
        candidateScore(current, center, neighbors, edges) <
        candidateScore(best, center, neighbors, edges)
          ? current
          : best
      );
  }
  // Preserve completeness and spacing even when every nearby candidate is busy.
  const rightmost = Math.max(anchor.x, ...occupied.map((point) => point.x));
  return { x: rightmost + NODE_CLEARANCE + 12, y: anchor.y };
}

/** Seed each real connected group together; keep all supplied positions untouched. */
export function topologySeedPositions(
  data: GraphData,
  previous: ReadonlyMap<string, GraphPoint>
): Map<string, GraphPoint> {
  const { adjacent, links, components } = graphTopology(data);
  const positions = new Map<string, GraphPoint>();
  for (const id of adjacent.keys()) {
    const point = previous.get(id);
    if (point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y))
      positions.set(id, point);
  }
  const regions: Region[] = [];
  for (const component of components) {
    const known = component.flatMap((id) => {
      const point = positions.get(id);
      return point === undefined ? [] : [point];
    });
    const radius = 110 * Math.sqrt(component.length) + 80;
    const center = known.length > 0 ? mean(known) : regionCenter(regions, radius);
    const pending = new Set(component.filter((id) => !positions.has(id)));
    while (pending.size > 0) {
      const next = [...pending].sort((a, b) => {
        const placedNeighbors = (id: string) =>
          [...(adjacent.get(id) ?? [])].filter((neighbor) => positions.has(neighbor)).length;
        return (
          placedNeighbors(b) - placedNeighbors(a) ||
          (adjacent.get(b)?.size ?? 0) - (adjacent.get(a)?.size ?? 0) ||
          a.localeCompare(b)
        );
      })[0];
      if (next === undefined) break;
      const neighbors = [...(adjacent.get(next) ?? [])].flatMap((id) => {
        const point = positions.get(id);
        return point === undefined ? [] : [{ id, point }];
      });
      positions.set(next, placeNear(next, center, neighbors, { positions, links }));
      pending.delete(next);
    }
    regions.push({
      center,
      radius: Math.max(
        radius,
        ...component.map((id) => distance(positions.get(id) ?? center, center))
      )
    });
  }
  return positions;
}
