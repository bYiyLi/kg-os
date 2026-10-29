import type { GraphOptions } from "@antv/g6";

export function graphBehaviors(
  onZoom: () => void,
  onPinch: () => void
): NonNullable<GraphOptions["behaviors"]> {
  return [
    // G6 owns the pointer tracking; the focused rings respond via a bounded
    // presentation spring. Never restart d3-force for each drag movement.
    { type: "drag-element", key: "drag-element", animation: false },
    { type: "drag-canvas", key: "drag-canvas" },
    {
      type: "zoom-canvas",
      key: "zoom-canvas",
      trigger: ["wheel"],
      sensitivity: 0.5,
      animation: false,
      onFinish: onZoom
    },
    {
      type: "zoom-canvas",
      key: "pinch-canvas",
      trigger: ["pinch"],
      sensitivity: 11,
      animation: false,
      onFinish: onPinch
    }
  ];
}
