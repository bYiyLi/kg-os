import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import type { GraphPoint } from "./graph-g6-data.js";
import type { GraphSceneContextTarget } from "./graph-g6-types.js";

export const EMPTY_IDS: ReadonlySet<string> = new Set();
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 3;

export function keyStep(key: string): GraphPoint | null {
  switch (key) {
    case "ArrowLeft":
      return { x: -16, y: 0 };
    case "ArrowRight":
      return { x: 16, y: 0 };
    case "ArrowUp":
      return { x: 0, y: -16 };
    case "ArrowDown":
      return { x: 0, y: 16 };
    default:
      return null;
  }
}

export function graphPositions(graph: G6Graph): Map<string, GraphPoint> {
  return new Map(
    graph.getNodeData().flatMap((node) => {
      const x = node.style?.x;
      const y = node.style?.y;
      return typeof x === "number" &&
        Number.isFinite(x) &&
        typeof y === "number" &&
        Number.isFinite(y)
        ? [[node.id, { x, y }] as const]
        : [];
    })
  );
}

export function syncKeyboard(graph: G6Graph, surface: HTMLElement) {
  for (const element of surface.querySelectorAll<HTMLElement>("[data-graph-id]")) {
    const id = element.dataset["graphId"];
    if (id === undefined) continue;
    try {
      const modelPoint = graph.getElementPosition(id);
      // The D3 layout can draw intermediate positions before its model snapshot
      // updates. The rendered element, not the stale model point, owns the hit target.
      const render = graph.getElementRenderStyle(id);
      const x: unknown = render["x"];
      const y: unknown = render["y"];
      const point =
        typeof x === "number" && Number.isFinite(x) && typeof y === "number" && Number.isFinite(y)
          ? ([x, y] as [number, number])
          : modelPoint;
      const screen = graph.getViewportByCanvas(point);
      if (Array.from(screen).every(Number.isFinite)) {
        element.style.transform =
          "translate(" + String(screen[0]) + "px," + String(screen[1]) + "px)";
        element.dataset["x"] = String(point[0]);
        element.dataset["y"] = String(point[1]);
      }
    } catch {
      // The element may disappear before an in-flight layout tick finishes.
    }
  }
}

export function zoomG6(graph: G6Graph, factor: number) {
  const ratio = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, graph.getZoom() * factor));
  void graph.zoomTo(ratio, false);
}

export function eventID(event: unknown): string | null {
  if (typeof event !== "object" || event === null || !("target" in event)) return null;
  const target = event.target;
  if (typeof target !== "object" || target === null || !("id" in target)) return null;
  return typeof target.id === "string" ? target.id : null;
}

function eventClient(event: unknown): GraphPoint | undefined {
  if (typeof event !== "object" || event === null || !("clientX" in event) || !("clientY" in event))
    return undefined;
  if (typeof event.clientX !== "number" || typeof event.clientY !== "number") return undefined;
  return { x: event.clientX, y: event.clientY };
}

export function contextPosition(
  graph: G6Graph,
  surface: HTMLElement,
  id: string | null,
  event?: unknown
): GraphSceneContextTarget {
  const bounds = surface.getBoundingClientRect();
  let x = bounds.width / 2;
  let y = bounds.height / 2;
  const client = eventClient(event);
  if (client !== undefined) {
    x = client.x - bounds.left;
    y = client.y - bounds.top;
  } else if (id !== null) {
    try {
      const screen = graph.getViewportByCanvas(graph.getElementPosition(id));
      x = screen[0];
      y = screen[1];
    } catch {
      // For a removed element, use the center of the current canvas.
    }
  }
  return { id, x, y };
}

export function topologyKey(data: GraphData): string {
  return JSON.stringify([
    // Search ranking is the radial layout input even when topology is unchanged.
    data.nodes.map((node) => node.id),
    data.relationships.map((edge) => [edge.id, edge.start, edge.end]).sort()
  ]);
}
