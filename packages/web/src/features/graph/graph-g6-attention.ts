import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import { readableNodeIds } from "./graph-attention.js";
import { caption } from "./graph-g6-data.js";

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
