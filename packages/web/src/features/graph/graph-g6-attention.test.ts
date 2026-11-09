import { expect, it, vi } from "vitest";
import type { Graph as G6Graph } from "@antv/g6";

import type { GraphData } from "./graph-data.js";
import { updateGraphLabels } from "./graph-g6-attention.js";

it("shows labels for focused nodes and clears labels outside the focus neighborhood", () => {
  const data: GraphData = {
    nodes: [
      { id: "n:1", labels: ["Person"], properties: { name: "Ada" } },
      { id: "n:2", labels: ["Person"], properties: { name: "Lin" } },
      { id: "n:3", labels: ["Person"], properties: { name: "Grace" } }
    ],
    relationships: [
      { id: "r:1", type: "KNOWS", start: "n:1", end: "n:2", properties: {} },
      { id: "r:2", type: "KNOWS", start: "n:2", end: "n:3", properties: {} }
    ],
    limited: false
  };
  const updateNodeData = vi.fn();
  updateGraphLabels({ updateNodeData } as unknown as G6Graph, data, "n:1");
  const updated = updateNodeData.mock.calls[0]?.[0] as {
    id: string;
    style: { labelText: string };
  }[];
  expect(updated).toHaveLength(3);
  expect(updated.find((node) => node.id === "n:1")?.style.labelText).not.toBe("");
  expect(updated.find((node) => node.id === "n:2")?.style.labelText).not.toBe("");
  expect(updated.find((node) => node.id === "n:3")?.style.labelText).toBe("");
});
