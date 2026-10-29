import type { Graph as G6Graph } from "@antv/g6";

type Point = [number, number];

function touch(event: unknown): { id: number; point: Point } | null {
  if (event === null || typeof event !== "object") return null;
  const e = event as {
    pointerType?: unknown;
    pointerId?: unknown;
    viewport?: { x?: unknown; y?: unknown };
  };
  if (
    e.pointerType !== "touch" ||
    typeof e.pointerId !== "number" ||
    typeof e.viewport?.x !== "number" ||
    typeof e.viewport.y !== "number"
  )
    return null;
  return { id: e.pointerId, point: [e.viewport.x, e.viewport.y] };
}

function midpoint(points: Iterable<Point>): Point | null {
  const pair = [...points];
  if (pair.length !== 2 || pair[0] === undefined || pair[1] === undefined) return null;
  return [(pair[0][0] + pair[1][0]) / 2, (pair[0][1] + pair[1][1]) / 2];
}

/**
 * Keep G6's own pinch zoom, correcting only its anchor: zoom-canvas uses
 * the moving finger as origin, whereas a two-finger gesture needs the midpoint.
 * No independent zoom or physics simulation is introduced.
 */
export class G6PinchMidpoint {
  private readonly touches = new Map<number, Point>();
  private anchor: Point | null = null;
  private desired: Point | null = null;
  private lastFrame: number | null = null;

  constructor(private readonly graph: G6Graph) {}

  private readonly down = (event: unknown) => {
    const finger = touch(event);
    if (finger === null) return;
    this.touches.set(finger.id, finger.point);
    const middle = midpoint(this.touches.values());
    if (middle === null) return;
    const canvas = this.graph.getCanvasByViewport(middle);
    this.anchor = [canvas[0], canvas[1]];
    this.desired = middle;
  };

  private readonly move = (event: unknown) => {
    const finger = touch(event);
    if (finger === null || !this.touches.has(finger.id)) return;
    this.touches.set(finger.id, finger.point);
    this.desired = midpoint(this.touches.values());
  };

  private readonly up = (event: unknown) => {
    const finger = touch(event);
    if (finger === null) return;
    this.touches.delete(finger.id);
    if (this.touches.size >= 2) return;
    const anchor = this.anchor;
    const desired = this.desired;
    this.anchor = null;
    this.desired = null;
    if (anchor === null || desired === null) return;
    if (this.lastFrame !== null) cancelAnimationFrame(this.lastFrame);
    this.lastFrame = requestAnimationFrame(() => {
      this.lastFrame = null;
      this.alignPoints(anchor, desired);
    });
  };

  private alignPoints(anchor: Point, desired: Point) {
    if (this.graph.destroyed) return;
    const actual = this.graph.getViewportByCanvas(anchor);
    const dx = desired[0] - actual[0];
    const dy = desired[1] - actual[1];
    if (Number.isFinite(dx) && Number.isFinite(dy) && Math.hypot(dx, dy) > 0.25) {
      void this.graph.translateBy([dx, dy], false);
    }
  }

  align() {
    if (this.anchor !== null && this.desired !== null) {
      this.alignPoints(this.anchor, this.desired);
    }
  }

  attach() {
    this.graph.on("pointerdown", this.down);
    this.graph.on("pointermove", this.move);
    this.graph.on("pointerup", this.up);
    this.graph.on("pointercancel", this.up);
  }

  detach() {
    this.graph.off("pointerdown", this.down);
    this.graph.off("pointermove", this.move);
    this.graph.off("pointerup", this.up);
    this.graph.off("pointercancel", this.up);
    if (this.lastFrame !== null) cancelAnimationFrame(this.lastFrame);
    this.lastFrame = null;
    this.touches.clear();
    this.anchor = null;
    this.desired = null;
  }
}
