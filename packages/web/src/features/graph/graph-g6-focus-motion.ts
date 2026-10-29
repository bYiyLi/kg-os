import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import { graphAttention } from "./graph-attention.js";
import { graphPositions } from "./graph-g6-geometry.js";
import type { GraphPoint } from "./graph-g6-data.js";
import { focusLayerPositions } from "./graph-radial-placement.js";

// Measurable damping: a first-hop neighbor is substantially slower than the
// pointer, and each successive loaded hop responds more slowly again.
export function radialFollowFraction(distance: number, hop: number, reduced: boolean): number {
  if (reduced || distance <= 2) return 1;
  const depth = Math.max(1, hop);
  return Math.min(0.105 / depth, 16 / (Math.sqrt(depth) * distance));
}

const START_MS = 210;
const RELEASE_MS = 210;

function smoothstep(progress: number): number {
  const t = Math.max(0, Math.min(1, progress));
  return t * t * (3 - 2 * t);
}

// Ease in from rest and, after release, ease out from the exact intensity
// reached at release. Both endpoints have zero slope, without a long tail.
export function radialMotionEnvelope(activeMs: number, releasedMs: number | null = null): number {
  const ramp = smoothstep(activeMs / START_MS);
  return releasedMs === null ? ramp : ramp * (1 - smoothstep(releasedMs / RELEASE_MS));
}

// G6 owns pointer dragging and Canvas drawing. This bounded presentation-only
// spring moves the already-loaded neighborhood toward ordered rings without
// restarting the global force simulation or moving the camera.
export class GraphFocusMotion {
  private focusId: string | null = null;
  private offsets = new Map<string, GraphPoint & { depth: number }>();
  private frame: number | null = null;
  private drawing = false;
  private pending = false;
  private generation = 0;
  private reduced = false;
  private startedAt = 0;
  private releasedAt: number | null = null;

  constructor(private readonly graph: G6Graph) {}

  get activeFocusId(): string | null {
    return this.focusId;
  }

  focus(data: GraphData, id: string | null, pinned: ReadonlySet<string>, reduced = false): void {
    if (
      id !== null &&
      id === this.focusId &&
      reduced === this.reduced &&
      this.releasedAt === null
    ) {
      this.wake();
      return;
    }
    this.stop();
    this.reduced = reduced;
    if (id === null) return;
    this.startedAt = performance.now();
    const previous = graphPositions(this.graph);
    const origin = previous.get(id);
    if (origin === undefined) return;
    this.focusId = id;
    const positions = focusLayerPositions(data, previous, id, pinned);
    const distances = graphAttention(data, id).distances;
    this.offsets = new Map(
      [...positions].map(([nodeId, point]) => [
        nodeId,
        {
          x: point.x - origin.x,
          y: point.y - origin.y,
          depth: distances.get(nodeId) ?? 4
        }
      ])
    );
    this.wake();
  }

  release(): void {
    if (this.focusId === null || this.releasedAt !== null) return;
    if (this.reduced) {
      this.stop();
      return;
    }
    this.releasedAt = performance.now();
    this.wake();
  }

  wake(): void {
    if (this.focusId === null) return;
    this.pending = true;
    this.schedule();
  }

  stop(): void {
    this.generation++;
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.focusId = null;
    this.offsets.clear();
    this.pending = false;
    this.releasedAt = null;
  }

  private schedule(): void {
    if (
      this.frame !== null ||
      this.drawing ||
      this.focusId === null ||
      typeof requestAnimationFrame !== "function"
    )
      return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.tick();
    });
  }

  private tick(): void {
    const focusId = this.focusId;
    if (focusId === null || this.graph.destroyed) return;
    const now = performance.now();
    const releaseElapsed = this.releasedAt === null ? null : now - this.releasedAt;
    if (releaseElapsed !== null && releaseElapsed >= RELEASE_MS) {
      this.stop();
      return;
    }
    const activeElapsed = (this.releasedAt ?? now) - this.startedAt;
    const intensity = this.reduced ? 1 : radialMotionEnvelope(activeElapsed, releaseElapsed);
    const origin = this.graph.getElementPosition(focusId);
    const previous = graphPositions(this.graph);
    const changes: { id: string; style: { x: number; y: number } }[] = [];
    for (const [id, offset] of this.offsets) {
      const current = previous.get(id);
      if (current === undefined) continue;
      const dx = origin[0] + offset.x - current.x;
      const dy = origin[1] + offset.y - current.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.8) continue;
      // Elastic response: near neighbors move first; distant rings have
      // progressively more drag and lag. Never translate the whole graph
      // as one rigid object behind the pointer.
      const fraction = radialFollowFraction(distance, offset.depth, this.reduced) * intensity;
      changes.push({
        id,
        style: { x: current.x + dx * fraction, y: current.y + dy * fraction }
      });
    }
    this.pending = false;
    if (changes.length === 0) {
      if (this.releasedAt !== null) this.stop();
      else if (intensity < 0.001) this.wake();
      return;
    }
    this.graph.updateNodeData(changes);
    this.drawing = true;
    const generation = this.generation;
    void Promise.resolve(this.graph.draw())
      .catch(() => undefined)
      .finally(() => {
        this.drawing = false;
        if (generation !== this.generation || this.focusId === null) {
          if (this.pending) this.schedule();
          return;
        }
        if (!this.reduced) this.pending = true;
        if (this.pending) this.schedule();
      });
  }
}
