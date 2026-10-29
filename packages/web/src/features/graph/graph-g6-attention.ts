import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import { readableNodeIds } from "./graph-attention.js";
import { caption } from "./graph-g6-data.js";
import { graphPositions } from "./graph-g6-geometry.js";
import { focusLayerPositions } from "./graph-radial-placement.js";

// Selection/expansion changes affect visual labels only, never coordinates.
export function updateGraphLabels(graph: G6Graph, data: GraphData, focus: string | null): void {
  const shown = readableNodeIds(data, focus);
  graph.updateNodeData(
    data.nodes.map((node) => ({
      id: node.id,
      style: { labelText: shown.has(node.id) ? caption(node) : "" }
    }))
  );
}

// State-only selection changes never invoke graph.render() or a full d3
// layout. Existing pinned/remote positions and the viewport are untouched.
export function updateGraphFocus(
  graph: G6Graph,
  data: GraphData,
  focus: string | null,
  pinned: ReadonlySet<string>
): void {
  if (focus !== null && data.nodes.some((node) => node.id === focus)) {
    const positions = focusLayerPositions(data, graphPositions(graph), focus, pinned);
    if (positions.size > 0)
      graph.updateNodeData(
        [...positions].map(([id, point]) => ({ id, style: { x: point.x, y: point.y } }))
      );
  }
  updateGraphLabels(graph, data, focus);
}
