import type { RefObject } from "react";

import { GraphContextMenu } from "./graph-context-menu.js";
import { GraphInspector } from "./graph-inspector.js";
import type { GraphSceneHandle } from "./graph-scene.js";
import type { useCanvasActions } from "./use-canvas-actions.js";
import type { useGraphExplorer } from "./use-graph-explorer.js";

interface CanvasDetailsProps {
  explorer: ReturnType<typeof useGraphExplorer>;
  actions: ReturnType<typeof useCanvasActions>;
  surface: RefObject<HTMLDivElement | null>;
  scene: RefObject<GraphSceneHandle | null>;
  pinned: ReadonlySet<string>;
  disabled: boolean;
}

export function CanvasDetails({
  explorer,
  actions,
  surface,
  scene,
  pinned,
  disabled
}: CanvasDetailsProps) {
  const node = explorer.data.nodes.find((item) => item.id === explorer.selected);
  const relationship = explorer.data.relationships.find((item) => item.id === explorer.selected);
  const menuId = actions.menu?.id ?? "";
  return (
    <>
      <GraphInspector
        node={node}
        relationship={relationship}
        expanding={explorer.expanding}
        failed={explorer.expandFailed}
        expanded={node !== undefined && explorer.expanded.has(node.id)}
        pinned={node !== undefined && pinned.has(node.id)}
        disabled={disabled}
        onClose={actions.closeDetails}
        onExpand={() => {
          void explorer.expand();
        }}
        onCollapse={() => {
          explorer.collapse();
        }}
        onTogglePin={() => {
          if (node !== undefined) scene.current?.togglePin(node.id);
        }}
        onHide={() => {
          actions.hideSelection();
        }}
      />
      <GraphContextMenu
        target={actions.menu}
        surface={surface}
        expanded={explorer.expanded.has(menuId) || explorer.expandingIds.has(menuId)}
        pinned={pinned.has(menuId)}
        busy={disabled}
        canUndo={explorer.canUndoHide}
        onAction={actions.action}
        onClose={actions.closeMenu}
        onReturnFocus={actions.returnMenuFocus}
      />
    </>
  );
}
