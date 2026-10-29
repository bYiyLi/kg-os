import type { Graph as G6Graph } from "@antv/g6";

import { contextPosition, eventID } from "./graph-g6-geometry.js";
import { registerNodeHold } from "./graph-g6-hold.js";
import type { GraphSceneProps } from "./graph-g6-types.js";

interface EventConstants {
  NodeEvent: Record<
    | "CLICK"
    | "DBLCLICK"
    | "CONTEXT_MENU"
    | "POINTER_DOWN"
    | "POINTER_UP"
    | "POINTER_OUT"
    | "DRAG_START"
    | "DRAG"
    | "DRAG_END",
    string
  >;
  EdgeEvent: Record<"CLICK" | "CONTEXT_MENU", string>;
  CanvasEvent: Record<"CLICK" | "DBLCLICK" | "CONTEXT_MENU", string>;
  GraphEvent: Record<
    "AFTER_DRAW" | "AFTER_LAYOUT" | "AFTER_TRANSFORM" | "AFTER_SIZE_CHANGE",
    string
  >;
}

interface EventsContext {
  surface: HTMLElement;
  props: () => GraphSceneProps;
  sync: () => void;
  suppressClick: () => void;
  canClick: () => boolean;
  dragFocus: (id: string) => void;
  dragMove: () => void;
  stopFocus: () => void;
  releaseFocus: () => void;
}

function preventDefault(event: unknown) {
  if (typeof event !== "object" || event === null) return;
  if (!("preventDefault" in event)) return;
  const cancel = event.preventDefault as (() => void) | undefined;
  if (typeof cancel === "function") cancel.call(event);
}

export function registerG6Events(graph: G6Graph, events: EventConstants, context: EventsContext) {
  const { NodeEvent, EdgeEvent, CanvasEvent, GraphEvent } = events;
  let nodeClickTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelNodeClick = () => {
    if (nodeClickTimer !== null) clearTimeout(nodeClickTimer);
    nodeClickTimer = null;
  };
  const hold = registerNodeHold(graph, {
    events: NodeEvent,
    enabled: () => context.props().disabled !== true,
    activate: context.dragFocus,
    cancelClick: cancelNodeClick,
    release: context.releaseFocus
  });
  const select = (id: string | null) => {
    if (context.props().disabled === true || !context.canClick()) return;
    context.stopFocus();
    context.props().onSelect(id);
  };
  const menu = (id: string | null, event: unknown) => {
    if (context.props().disabled === true) return;
    preventDefault(event);
    context.props().onContextMenu?.(contextPosition(graph, context.surface, id, event));
  };
  graph.on(NodeEvent.CLICK, (event) => {
    // Delay only node clicks: the first click of a double-click must not
    // open an inspector that intercepts the second pointer gesture.
    cancelNodeClick();
    if (hold.consumeClick()) return;
    const id = eventID(event);
    if (id !== null && context.props().disabled !== true)
      nodeClickTimer = setTimeout(() => {
        nodeClickTimer = null;
        if (!graph.destroyed) select(id);
      }, 320);
  });
  graph.on(EdgeEvent.CLICK, (event) => {
    select(eventID(event));
  });
  graph.on(CanvasEvent.CLICK, () => {
    hold.reset();
    cancelNodeClick();
    select(null);
  });
  graph.on(NodeEvent.DBLCLICK, (event) => {
    hold.reset();
    cancelNodeClick();
    const id = eventID(event);
    if (context.props().disabled !== true && id !== null) context.props().onToggleExpand?.(id);
  });
  graph.on(CanvasEvent.DBLCLICK, () => {
    if (context.props().disabled !== true) void graph.fitView(undefined, false);
  });
  graph.on(NodeEvent.CONTEXT_MENU, (event) => {
    hold.cancel();
    menu(eventID(event), event);
  });
  graph.on(EdgeEvent.CONTEXT_MENU, (event) => {
    menu(eventID(event), event);
  });
  graph.on(CanvasEvent.CONTEXT_MENU, (event) => {
    menu(null, event);
  });
  graph.on(NodeEvent.DRAG_START, (event) => {
    hold.dragStarted();
    cancelNodeClick();
    const id = eventID(event);
    if (id !== null) context.dragFocus(id);
  });
  graph.on(NodeEvent.DRAG, () => {
    context.dragMove();
    context.sync();
  });
  // Release softly decelerates the current arrangement for a bounded time.
  // G6 can finish the drag on the canvas after the node changes position.
  graph.on("dragend", () => {
    context.releaseFocus();
    context.sync();
  });
  graph.on(NodeEvent.DRAG_END, () => {
    context.releaseFocus();
    cancelNodeClick();
    context.suppressClick();
    context.sync();
  });
  graph.on(GraphEvent.AFTER_DRAW, context.sync);
  graph.on(GraphEvent.AFTER_LAYOUT, context.sync);
  graph.on(GraphEvent.AFTER_TRANSFORM, context.sync);
  graph.on(GraphEvent.AFTER_SIZE_CHANGE, context.sync);
  return () => {
    hold.cancel();
    cancelNodeClick();
  };
}
