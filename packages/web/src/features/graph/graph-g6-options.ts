import type { Graph as G6Graph, GraphOptions } from "@antv/g6";

import { priorityRadius } from "./graph-center-focus.js";
import { attentionTier, edgeAttentionTier, graphAttention } from "./graph-attention.js";
import { graphPalette, graphToG6 } from "./graph-g6-data.js";
import type { GraphData } from "./graph-data.js";
import { EMPTY_IDS, MAX_ZOOM, MIN_ZOOM } from "./graph-g6-geometry.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

export function forceLayout(
  reduced: boolean,
  orderedIDs: readonly string[] = []
): NonNullable<GraphOptions["layout"]> {
  const ranks = new Map(orderedIDs.map((id, index) => [id, index]));
  return {
    type: "d3-force",
    animation: !reduced,
    iterations: 100,
    link: { distance: 190, strength: 0.24 },
    manyBody: { strength: -260 },
    collide: { radius: 77, strength: 0.98 },
    alphaDecay: 0.1,
    center: { strength: 0.04 },
    radial: {
      x: 0,
      y: 0,
      strength: 0.16,
      radius: (node) => priorityRadius(ranks.get(String(node["id"])) ?? orderedIDs.length)
    }
  };
}

interface NewGraphOptions {
  host: HTMLElement;
  surface: HTMLElement;
  props: GraphSceneProps;
  pinned: ReadonlySet<string>;
  reduced: boolean;
}

export function newGraphOptions({
  host,
  surface,
  props,
  pinned,
  reduced
}: NewGraphOptions): GraphOptions {
  const palette = graphPalette(surface);
  return {
    container: host,
    // The fixed-size G6 host is observed once by the React controller.
    // Sidebar card transitions must never resize or redraw this canvas.
    autoResize: false,
    padding: [96, 52, 70, 52],
    zoomRange: [MIN_ZOOM, MAX_ZOOM],
    animation: false,
    node: {
      state: {
        selected: {
          stroke: palette.accent,
          lineWidth: 3,
          // The built-in G6 selected theme forces labels back to 12px.
          // Preserve the current viewport-centered fisheye font scale.
          labelFontSize: (node) => Number(node.style?.labelFontSize ?? 12)
        },
        focused: { stroke: palette.accent, lineWidth: 3 },
        expanded: { lineWidth: 4 },
        busy: { lineDash: [5, 4] },
        pinned: { lineWidth: 4 },
        "hop-2": { opacity: 0.9, labelOpacity: 0.8 },
        "hop-3": { opacity: 0.8, labelOpacity: 0.65 },
        "hop-4": { opacity: 0.65, labelOpacity: 0.45 },
        "hop-5": { opacity: 0.4, labelOpacity: 0.2 },
        "hop-6": { opacity: 0.1, labelOpacity: 0.05 },
        unreachable: { opacity: 0.1, labelOpacity: 0.05 }
      }
    },
    edge: {
      state: {
        selected: { stroke: palette.accent, opacity: 1, lineWidth: 3.4 },
        "hop-1": { stroke: palette.accent, opacity: 1, lineWidth: 2.6 },
        focused: { stroke: palette.accent, lineWidth: 2.5 },
        "hop-2": { stroke: palette.accent, opacity: 0.9, lineWidth: 2.4, labelOpacity: 0.8 },
        "hop-3": { stroke: palette.accent, opacity: 0.8, lineWidth: 2.15, labelOpacity: 0.65 },
        "hop-4": { stroke: palette.accent, opacity: 0.65, lineWidth: 1.9, labelOpacity: 0.45 },
        "hop-5": { stroke: palette.accent, opacity: 0.4, lineWidth: 1.6, labelOpacity: 0.2 },
        "hop-6": { stroke: palette.accent, opacity: 0.1, lineWidth: 1.3, labelOpacity: 0.05 },
        unreachable: { opacity: 0.1, lineWidth: 1.25, labelOpacity: 0.05 }
      }
    },
    layout: forceLayout(
      reduced,
      props.data.nodes.map((node) => node.id)
    ),
    behaviors: [],
    data: graphToG6({
      data: props.data,
      previous: new Map(),
      pinned,
      selected: props.highlighted ?? props.selected ?? null,
      expanded: props.expanded ?? EMPTY_IDS,
      expanding: props.expandingIds ?? EMPTY_IDS,
      palette
    })
  };
}

interface StateContext {
  props: GraphSceneProps;
  pinned: ReadonlySet<string>;
  attentionId: string | null;
  attention: ReturnType<typeof graphAttention>;
  focused: (id: string) => boolean;
}

function nodeStates(id: string, state: StateContext): string[] {
  const { props, pinned, attentionId, attention, focused } = state;
  const tier = attention.active ? attentionTier(attention.distances.get(id)) : null;
  return [
    ...(attentionId === id ? ["selected"] : []),
    ...(props.expanded?.has(id) === true ? ["expanded"] : []),
    ...(props.expandingIds?.has(id) === true ? ["busy"] : []),
    ...(pinned.has(id) ? ["pinned"] : []),
    ...(tier === null ? [] : [tier]),
    ...(focused(id) ? ["focused"] : [])
  ];
}

function edgeStates(edge: GraphData["relationships"][number], state: StateContext): string[] {
  const { attentionId, attention, focused } = state;
  const tier = attention.active
    ? edgeAttentionTier(attention.distances, edge.start, edge.end)
    : null;
  let emphasis: string[] = [];
  if (attentionId === edge.id) emphasis = ["selected"];
  else if (attention.active && tier === null) emphasis = ["hop-1"];
  return [...emphasis, ...(tier === null ? [] : [tier]), ...(focused(edge.id) ? ["focused"] : [])];
}

export function elementStates(
  graph: G6Graph,
  props: GraphSceneProps,
  pinned: ReadonlySet<string>
): Record<string, string[]> {
  const states: Record<string, string[]> = {};
  const attentionId = props.highlighted ?? props.selected ?? null;
  const attention = graphAttention(props.data, attentionId);
  const focused = (id: string) => graph.getElementState(id).includes("focused");
  const context = { props, pinned, attentionId, attention, focused };
  for (const node of props.data.nodes) states[node.id] = nodeStates(node.id, context);
  for (const edge of props.data.relationships) states[edge.id] = edgeStates(edge, context);
  return states;
}
