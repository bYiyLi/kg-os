import { nodeCaption } from "./graph-data.js";
import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";

export interface Point {
  x: number;
  y: number;
}

export interface Camera extends Point {
  scale: number;
}

interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface RelationshipPath {
  path: string;
  label: Point;
  bounds: Bounds;
}

interface NodeBounds {
  id: string;
  point: Point;
  halfWidth: number;
  fixed: boolean;
}

const captionSegments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function finite(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function angleFor(id: string): number {
  let hash = 2166136261;
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return ((hash >>> 0) / 4294967296) * Math.PI * 2;
}

function initialPoint(
  id: string,
  index: number,
  neighbors: ReadonlyMap<string, string[]>,
  previous: ReadonlyMap<string, Point>
): Point {
  const anchors = (neighbors.get(id) ?? [])
    .map((neighbor) => previous.get(neighbor))
    .filter((point): point is Point => point !== undefined && finite(point));
  const angle = anchors.length === 0 ? index * 2.3999632297 : angleFor(id);
  const radius = anchors.length === 0 ? 54 * Math.sqrt(index + 1) : 85;
  const count = Math.max(1, anchors.length);
  const center = anchors.reduce(
    (sum, point) => ({ x: sum.x + point.x / count, y: sum.y + point.y / count }),
    { x: 0, y: 0 }
  );
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius
  };
}

function nodeNeighbors(relationships: GraphRelationship[]): Map<string, string[]> {
  const neighbors = new Map<string, Set<string>>();
  for (const relationship of relationships) {
    const { start, end } = relationship;
    if (start === end) continue;
    neighbors.set(start, (neighbors.get(start) ?? new Set()).add(end));
    neighbors.set(end, (neighbors.get(end) ?? new Set()).add(start));
  }
  return new Map([...neighbors].map(([id, values]) => [id, [...values].sort()]));
}

function repulsion(id: string, point: Point, positions: ReadonlyMap<string, Point>): Point {
  const force = { x: 0, y: 0 };
  for (const [otherID, other] of positions) {
    if (otherID === id) continue;
    let dx = point.x - other.x;
    let dy = point.y - other.y;
    if (dx === 0 && dy === 0) {
      dx = Math.cos(angleFor(id));
      dy = Math.sin(angleFor(id));
    }
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (!Number.isFinite(distance)) continue;
    const magnitude = 4200 / Math.max(100, distance * distance);
    force.x += (dx / distance) * magnitude;
    force.y += (dy / distance) * magnitude;
  }
  return force;
}

function attraction(point: Point, neighbors: string[], positions: ReadonlyMap<string, Point>) {
  const force = { x: 0, y: 0 };
  for (const neighbor of neighbors) {
    const target = positions.get(neighbor);
    if (target === undefined) continue;
    const dx = target.x - point.x;
    const dy = target.y - point.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    if (!Number.isFinite(distance)) continue;
    const strength = (distance - 115) * 0.025;
    force.x += (dx / distance) * strength;
    force.y += (dy / distance) * strength;
  }
  return force;
}

function relax(
  movable: string[],
  positions: Map<string, Point>,
  neighbors: ReadonlyMap<string, string[]>
) {
  for (let step = 0; step < 90; step++) {
    const updates = new Map<string, Point>();
    for (const id of movable) {
      const point = positions.get(id);
      if (point === undefined) continue;
      const force = repulsion(id, point, positions);
      const links = attraction(point, neighbors.get(id) ?? [], positions);
      force.x += links.x;
      force.y += links.y;
      // A small central attraction keeps disconnected results in the same view.
      const dx = force.x - point.x * 0.002;
      const dy = force.y - point.y * 0.002;
      const speed = Math.max(1, Math.hypot(dx, dy) / 5);
      const next = { x: point.x + dx / speed, y: point.y + dy / speed };
      if (finite(next)) updates.set(id, next);
    }
    for (const [id, point] of updates) positions.set(id, point);
  }
}

function letterWidth(letter: string): number {
  if (letter.length === 1 && letter.charCodeAt(0) <= 127) {
    if (/\s/u.test(letter)) return 4;
    return /[MW@#%&]/u.test(letter) ? 10 : 7;
  }
  return (letter.codePointAt(0) ?? 0) > 0xffff ? 14 : 12;
}

function captionHalfWidth(node: GraphNode): number {
  const letters: string[] = [];
  for (const item of captionSegments.segment(nodeCaption(node))) {
    letters.push(item.segment);
    if (letters.length > 30) break;
  }
  const shown = letters.length > 30 ? [...letters.slice(0, 29), "…"] : letters;
  return Math.max(22, shown.reduce((sum, letter) => sum + letterWidth(letter), 0) / 2 + 6);
}

function separatePair(first: NodeBounds, second: NodeBounds): boolean {
  if (first.fixed && second.fixed) return false;
  const dx = first.point.x - second.point.x;
  const dy = first.point.y - second.point.y;
  const overlapX = first.halfWidth + second.halfWidth + 8 - Math.abs(dx);
  // Reserve the target above the node and its caption at baseline y=32 below it.
  const overlapY = 74 - Math.abs(dy);
  if (overlapX <= 0 || overlapY <= 0) return false;
  const direction = first.id < second.id ? -1 : 1;
  const horizontal = overlapX < overlapY;
  const shift = (horizontal ? overlapX : overlapY) + 0.1;
  const x = horizontal ? (Math.sign(dx) || direction) * shift : 0;
  const y = horizontal ? 0 : (Math.sign(dy) || direction) * shift;
  const share = first.fixed || second.fixed ? 1 : 0.5;
  if (!first.fixed) {
    first.point.x += x * share;
    first.point.y += y * share;
  }
  if (!second.fixed) {
    second.point.x -= x * share;
    second.point.y -= y * share;
  }
  return true;
}

function separateCaptions(
  data: GraphData,
  positions: Map<string, Point>,
  pinned: ReadonlySet<string>
) {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const bounds: NodeBounds[] = [];
  for (const [id, point] of positions) {
    const node = nodes.get(id);
    if (node !== undefined)
      bounds.push({ id, point, halfWidth: captionHalfWidth(node), fixed: pinned.has(id) });
  }
  for (let step = 0; step < 60; step++) {
    if (!separateBounds(bounds)) break;
  }
}

function separateBounds(bounds: NodeBounds[]): boolean {
  let changed = false;
  for (const [index, left] of bounds.entries()) {
    for (const right of bounds.slice(index + 1)) changed = separatePair(left, right) || changed;
  }
  return changed;
}

/** New nodes begin near already visible neighbors; existing points stay continuous. */
export function initialGraphPositions(
  data: GraphData,
  previous: ReadonlyMap<string, Point> = new Map()
): Map<string, Point> {
  const positions = new Map<string, Point>();
  const neighbors = nodeNeighbors(data.relationships);
  const ids = data.nodes.map((node) => node.id).sort();
  for (const [index, id] of ids.entries()) {
    const point = previous.get(id);
    if (point !== undefined && finite(point)) positions.set(id, { ...point });
    else positions.set(id, initialPoint(id, index, neighbors, previous));
  }
  return positions;
}

/** Relax automatic positions; only explicit user pins are held exactly in place. */
export function layoutGraph(
  data: GraphData,
  previous: ReadonlyMap<string, Point> = new Map(),
  pinned: ReadonlySet<string> = new Set()
): Map<string, Point> {
  const positions = initialGraphPositions(data, previous);
  const movable = [...positions.keys()].filter((id) => !pinned.has(id));
  const neighbors = nodeNeighbors(data.relationships);
  relax(movable, positions, neighbors);
  separateCaptions(data, positions, pinned);
  return positions;
}

function pointBounds(points: Point[]): Bounds {
  return {
    left: Math.min(...points.map((point) => point.x)),
    right: Math.max(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    bottom: Math.max(...points.map((point) => point.y))
  };
}

function graphBounds(positions: ReadonlyMap<string, Point>, data: GraphData): Bounds | null {
  const nodes = new Map(data.nodes.map((node) => [node.id, node]));
  const corners: Point[] = [];
  for (const [id, point] of positions) {
    if (!finite(point)) continue;
    const node = nodes.get(id);
    const halfWidth = node === undefined ? 22 : captionHalfWidth(node);
    corners.push(
      { x: point.x - halfWidth, y: point.y - 22 },
      { x: point.x + halfWidth, y: point.y + 38 }
    );
  }
  for (const { bounds } of relationshipPaths(data.relationships, positions).values()) {
    corners.push({ x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.bottom });
  }
  return corners.length === 0 ? null : pointBounds(corners);
}

/** Fit node targets, captions and rendered curves inside the usable canvas area. */
export function fitGraph(
  positions: ReadonlyMap<string, Point>,
  width: number,
  height: number,
  data: GraphData
): Camera {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return { x: 0, y: 0, scale: 1 };
  const bounds = graphBounds(positions, data);
  if (bounds === null) return { x: 0, y: 0, scale: 1 };
  const { left, right, top, bottom } = bounds;
  const horizontalMargin = Math.min(56, width * 0.12);
  const topMargin = Math.min(96, height * 0.22);
  const bottomMargin = Math.min(70, height * 0.16);
  const scale = Math.max(
    0.05,
    Math.min(
      2,
      (width - horizontalMargin * 2) / (right - left),
      (height - topMargin - bottomMargin) / (bottom - top)
    )
  );
  return {
    x: -(left / 2 + right / 2) * scale,
    y: (topMargin - bottomMargin) / 2 - (top / 2 + bottom / 2) * scale,
    scale
  };
}

function relationshipGroup(relationship: GraphRelationship): string {
  return [relationship.start, relationship.end].sort().join("\0");
}

function loopPath(point: Point, index: number): RelationshipPath {
  const radius = 34 + index * 16;
  return {
    path: [
      "M",
      point.x + 10,
      point.y - 10,
      "C",
      point.x + radius,
      point.y - radius * 2,
      point.x - radius,
      point.y - radius * 2,
      point.x - 10,
      point.y - 10
    ].join(" "),
    label: { x: point.x, y: point.y - radius * 1.5 },
    // A Bezier curve stays inside the hull of its endpoints and control points.
    bounds: {
      left: point.x - radius,
      right: point.x + radius,
      top: point.y - radius * 2,
      bottom: point.y - 10
    }
  };
}

function curvedPath(start: Point, end: Point, offset: number, forward: boolean): RelationshipPath {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const dx = distance === 0 ? 1 : (end.x - start.x) / distance;
  const dy = distance === 0 ? 0 : (end.y - start.y) / distance;
  const clip = Math.min(14, distance / 4);
  const bend = offset * (forward ? 1 : -1);
  const control = {
    x: (start.x + end.x) / 2 - dy * bend,
    y: (start.y + end.y) / 2 + dx * bend
  };
  return {
    path: [
      "M",
      start.x + dx * clip,
      start.y + dy * clip,
      "Q",
      control.x,
      control.y,
      end.x - dx * clip,
      end.y - dy * clip
    ].join(" "),
    label: {
      x: (start.x + end.x) / 4 + control.x / 2,
      y: (start.y + end.y) / 4 + control.y / 2
    },
    bounds: pointBounds([start, control, end])
  };
}

/** Individual identities retain distinct paths, including parallel edges and loops. */
export function relationshipPaths(
  relationships: GraphRelationship[],
  positions: ReadonlyMap<string, Point>
): Map<string, RelationshipPath> {
  const groups = new Map<string, GraphRelationship[]>();
  for (const relationship of relationships) {
    const key = relationshipGroup(relationship);
    groups.set(key, [...(groups.get(key) ?? []), relationship]);
  }
  const paths = new Map<string, RelationshipPath>();
  for (const relationships of groups.values()) {
    relationships.sort((a, b) => {
      if (a.id === b.id) return 0;
      return a.id < b.id ? -1 : 1;
    });
    for (const [index, relationship] of relationships.entries()) {
      const start = positions.get(relationship.start);
      const end = positions.get(relationship.end);
      if (start === undefined || end === undefined || !finite(start) || !finite(end)) continue;
      paths.set(
        relationship.id,
        relationship.start === relationship.end
          ? loopPath(start, index)
          : curvedPath(
              start,
              end,
              (index - (relationships.length - 1) / 2) * 38,
              relationship.start < relationship.end
            )
      );
    }
  }
  return paths;
}

export function arrowStep(key: string): Point | null {
  const directions: Record<string, Point> = {
    ArrowLeft: { x: -24, y: 0 },
    ArrowRight: { x: 24, y: 0 },
    ArrowUp: { x: 0, y: -24 },
    ArrowDown: { x: 0, y: 24 }
  };
  return directions[key] ?? null;
}
