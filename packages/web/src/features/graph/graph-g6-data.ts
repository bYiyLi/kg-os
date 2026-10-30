import type { GraphData as G6Data } from "@antv/g6";

import { nodeCaption } from "./graph-data.js";
import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import type { GraphPoint } from "./graph-g6-types.js";
import {
  attentionTier,
  edgeAttentionTier,
  graphAttention,
  readableNodeIds
} from "./graph-attention.js";
import { topologySeedPositions } from "./graph-topology-placement.js";

export type { GraphPoint } from "./graph-g6-types.js";

export interface GraphPalette {
  node: [string, string, string, string];
  canvas: string;
  text: string;
  edge: string;
  accent: string;
}

const captionSegments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function colorIndex(node: GraphNode): number {
  const label = [...node.labels].sort()[0] ?? "";
  let value = 0;
  for (const character of label) value = (value * 31 + character.charCodeAt(0)) % 4;
  return value;
}

export function caption(node: GraphNode): string {
  const chars = Array.from(captionSegments.segment(nodeCaption(node)), (item) => item.segment);
  return chars.length > 30 ? chars.slice(0, 29).join("") + "…" : nodeCaption(node);
}

export function graphPalette(element: Element): GraphPalette {
  const style = getComputedStyle(element);
  const css = (variable: string, fallback: string) =>
    style.getPropertyValue(variable).trim() || fallback;
  return {
    node: [
      css("--graph-node-0", "#719de4"),
      css("--graph-node-1", "#b09acb"),
      css("--graph-node-2", "#5bb7ae"),
      css("--graph-node-3", "#d8ac69")
    ],
    canvas: css("--color-canvas", "#0c1530"),
    text: css("--color-text", "#f8fbff"),
    edge: css("--graph-edge", "#8094b6"),
    accent: css("--color-primary", "#719de4")
  };
}

/** Only visual data is copied to G6. Knowledge identity and properties stay in KG OS. */
interface Projection {
  data: GraphData;
  previous: ReadonlyMap<string, GraphPoint>;
  pinned: ReadonlySet<string>;
  selected: string | null;
  expanded: ReadonlySet<string>;
  expanding: ReadonlySet<string>;
  palette: GraphPalette;
}

function edgeVisualStates(
  edge: GraphRelationship,
  selected: string | null,
  attention: ReturnType<typeof graphAttention>
): string[] {
  if (selected === edge.id) return ["selected"];
  if (!attention.active) return [];
  const tier = edgeAttentionTier(attention.distances, edge.start, edge.end);
  return [tier ?? "hop-1"];
}

export function graphToG6({
  data,
  previous,
  pinned,
  selected,
  expanded,
  expanding,
  palette
}: Projection): G6Data {
  const attention = graphAttention(data, selected);
  const labeled = readableNodeIds(data, selected);
  const positions = topologySeedPositions(data, previous);
  const nodes = data.nodes
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((node) => {
      const point = positions.get(node.id) ?? { x: 0, y: 0 };
      const fixed = pinned.has(node.id);
      const tier = attention.active ? attentionTier(attention.distances.get(node.id)) : null;
      return {
        id: node.id,
        type: "circle",
        states: [
          ...(selected === node.id ? ["selected"] : []),
          ...(expanded.has(node.id) ? ["expanded"] : []),
          ...(expanding.has(node.id) ? ["busy"] : []),
          ...(fixed ? ["pinned"] : []),
          ...(tier === null ? [] : [tier])
        ],
        style: {
          x: point.x,
          y: point.y,
          ...(fixed ? { fx: point.x, fy: point.y } : {}),
          // G6 merges new state styles into the drawable's existing attrs.
          // Without an explicit normal opacity, leaving "dimmed" can keep
          // the previous 0.16 opacity even when the state is now "selected".
          opacity: 1,
          labelOpacity: 1,
          size: 32,
          fill: palette.node[colorIndex(node)] ?? palette.accent,
          stroke: palette.canvas,
          lineWidth: 3,
          labelText: labeled.has(node.id) ? caption(node) : "",
          labelPlacement: "bottom" as const,
          labelOffsetY: 10,
          labelFill: palette.text,
          labelFontSize: 12,
          labelBackground: true,
          labelBackgroundFill: palette.canvas,
          labelPadding: [1, 4, 1, 4],
          cursor: "grab" as const
        }
      };
    });
  const pairs = new Map<string, number>();
  const edges = data.relationships
    .toSorted((a, b) => a.id.localeCompare(b.id))
    .map((edge) => {
      const pair = [edge.start, edge.end].sort().join("\0");
      const index = pairs.get(pair) ?? 0;
      pairs.set(pair, index + 1);
      const active = selected === edge.id || selected === edge.start || selected === edge.end;
      const direction = index % 2 === 0 ? -1 : 1;
      const curveOffset = index === 0 ? 0 : direction * Math.ceil(index / 2) * 24;
      const states = edgeVisualStates(edge, selected, attention);
      return {
        id: edge.id,
        source: edge.start,
        target: edge.end,
        type: edge.start === edge.end ? "line" : "quadratic",
        states,
        style: {
          opacity: 1,
          labelOpacity: 1,
          stroke: active ? palette.accent : palette.edge,
          lineWidth: active ? 1.8 : 1.25,
          endArrow: true,
          curveOffset,
          ...(edge.start === edge.end
            ? { loop: true, loopPlacement: "top" as const, loopDist: 45 + index * 15 }
            : {})
        }
      };
    });
  return { nodes, edges };
}
