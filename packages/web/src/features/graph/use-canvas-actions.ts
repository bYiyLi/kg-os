import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, RefObject } from "react";

import type { GraphMenuAction } from "./graph-context-menu.js";
import type { GraphSceneContextTarget, GraphSceneHandle } from "./graph-scene.js";
import type { useGraphExplorer } from "./use-graph-explorer.js";

type Explorer = ReturnType<typeof useGraphExplorer>;

function handleCanvasKey(
  event: KeyboardEvent<HTMLDivElement>,
  explorer: Explorer,
  disabled: boolean,
  handlers: { closeDetails: () => void; hideSelection: () => void; closeMenu: () => void }
) {
  if (
    disabled ||
    event.defaultPrevented ||
    !(event.target instanceof Element) ||
    !event.target.closest(".graph-scene")
  )
    return;
  if (event.key === "Escape") {
    event.preventDefault();
    handlers.closeMenu();
    handlers.closeDetails();
  } else if (
    (event.key === "Delete" || event.key === "Backspace") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !explorer.busy
  ) {
    event.preventDefault();
    handlers.hideSelection();
  } else if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    !event.shiftKey &&
    event.key.toLowerCase() === "z" &&
    explorer.canUndoHide
  ) {
    event.preventDefault();
    explorer.undoHide();
  }
}

function performMenuAction(
  command: GraphMenuAction,
  id: string | null,
  explorer: Explorer,
  scene: RefObject<GraphSceneHandle | null>
) {
  switch (command) {
    case "expand":
      if (id !== null) void explorer.expand(id);
      break;
    case "collapse":
      if (id !== null) explorer.collapse(id);
      break;
    case "focus":
      if (id !== null) scene.current?.focusNode(id);
      break;
    case "pin":
      if (id !== null) scene.current?.togglePin(id);
      break;
    case "hide":
      if (id !== null) explorer.hide(id);
      break;
    case "undo":
      explorer.undoHide();
      break;
    case "fit":
      scene.current?.fit();
      break;
    case "relayout":
      scene.current?.relayout();
      break;
  }
}

export function useCanvasActions(
  explorer: Explorer,
  surface: RefObject<HTMLDivElement | null>,
  scene: RefObject<GraphSceneHandle | null>,
  disabled: boolean
) {
  const [menu, setMenu] = useState<GraphSceneContextTarget | null>(null);
  const returnFocus = useRef<string | null>(null);
  useEffect(() => {
    if (disabled || explorer.busy) setMenu(null);
  }, [disabled, explorer.busy]);

  function focusGraph(id?: string | null) {
    const target = Array.from(
      surface.current?.querySelectorAll<HTMLElement>("[data-graph-id]") ?? []
    ).find((element) => element.getAttribute("data-graph-id") === id);
    (target ?? surface.current?.querySelector<HTMLElement>(".graph-scene"))?.focus();
  }
  function closeDetails() {
    const selected = explorer.selected;
    explorer.select(null);
    focusGraph(selected);
  }
  function hideSelection(id = explorer.selected) {
    if (id === null) return;
    explorer.hide(id);
    focusGraph();
  }
  function openMenu(target: GraphSceneContextTarget) {
    if (disabled || explorer.data.nodes.length === 0) return;
    returnFocus.current = target.id;
    explorer.select(target.id);
    setMenu(target);
  }
  function action(command: GraphMenuAction) {
    const id = menu?.id ?? explorer.selected;
    performMenuAction(command, id, explorer, scene);
    setMenu(null);
  }
  const closeMenu = () => {
    setMenu(null);
  };
  return {
    menu,
    openMenu,
    closeMenu,
    action,
    keyDown: (event: KeyboardEvent<HTMLDivElement>) => {
      handleCanvasKey(event, explorer, disabled, { closeDetails, hideSelection, closeMenu });
    },
    closeDetails,
    hideSelection,
    returnMenuFocus: () => {
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.closest("input, textarea, [contenteditable]"))
        return;
      focusGraph(returnFocus.current);
    }
  };
}
