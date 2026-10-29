import type { Graph as G6Graph } from "@antv/g6";

import { eventID } from "./graph-g6-geometry.js";

// A short click inspects a node. A sustained press starts the radial layout,
// while native G6 dragging can start it immediately when movement is detected.
const HOLD_TO_LAYOUT_MS = 280;

interface HoldOptions {
  events: Record<"POINTER_DOWN" | "POINTER_UP" | "POINTER_OUT", string>;
  enabled: () => boolean;
  activate: (id: string) => void;
  cancelClick: () => void;
  release: () => void;
}

export function registerNodeHold(
  graph: G6Graph,
  { events, enabled, activate, cancelClick, release }: HoldOptions
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pressed: string | null = null;
  let consumed = false;
  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pressed = null;
  };
  graph.on(events.POINTER_DOWN, (event) => {
    cancel();
    consumed = false;
    if (!enabled()) return;
    const input: unknown = event;
    if (
      typeof input === "object" &&
      input !== null &&
      "button" in input &&
      typeof input.button === "number" &&
      input.button !== 0
    )
      return;
    const id = eventID(event);
    if (id === null) return;
    pressed = id;
    timer = setTimeout(() => {
      timer = null;
      if (pressed !== id || graph.destroyed || !enabled()) return;
      consumed = true;
      cancelClick();
      activate(id);
    }, HOLD_TO_LAYOUT_MS);
  });
  const finish = () => {
    cancel();
    release();
  };
  graph.on(events.POINTER_UP, finish);
  graph.on(events.POINTER_OUT, cancel);
  graph.on("pointerup", finish);
  graph.on("pointercancel", finish);
  return {
    cancel,
    reset: () => {
      cancel();
      consumed = false;
    },
    dragStarted: () => {
      cancel();
      consumed = true;
    },
    consumeClick: () => {
      const result = consumed;
      consumed = false;
      return result;
    }
  };
}
