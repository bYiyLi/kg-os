import { Menu } from "@base-ui/react/menu";
import { useTranslation } from "react-i18next";
import { useEffect, useRef } from "react";
import type { RefObject } from "react";

import type { GraphSceneContextTarget } from "./graph-scene.js";

export type GraphMenuAction =
  "expand" | "collapse" | "focus" | "pin" | "hide" | "undo" | "fit" | "relayout";

interface GraphContextMenuProps {
  target: GraphSceneContextTarget | null;
  surface: RefObject<HTMLDivElement | null>;
  expanded: boolean;
  pinned: boolean;
  busy: boolean;
  canUndo: boolean;
  onAction: (action: GraphMenuAction) => void;
  onClose: () => void;
  onReturnFocus: () => void;
}

function menuActions(props: GraphContextMenuProps) {
  const node = props.target?.id?.startsWith("n:") ?? false;
  const actions: { action: GraphMenuAction; label: string; disabled?: boolean }[] = [];
  if (node) {
    actions.push(
      {
        action: props.expanded ? "collapse" : "expand",
        label: props.expanded ? "collapse" : "expand",
        disabled: props.busy
      },
      { action: "focus", label: "focusNode" },
      { action: "pin", label: props.pinned ? "unpin" : "pin" }
    );
  }
  if (props.target !== null && props.target.id !== null)
    actions.push({ action: "hide", label: "hide", disabled: props.busy });
  actions.push(
    { action: "undo", label: "undoHide", disabled: !props.canUndo || props.busy },
    { action: "fit", label: "fit" },
    { action: "relayout", label: "relayout" }
  );
  return actions;
}

export function GraphContextMenu(props: GraphContextMenuProps) {
  const { t } = useTranslation();
  const restoreFocus = useRef(true);
  const popup = useRef<HTMLDivElement>(null);
  const { target, surface, onClose } = props;
  useEffect(() => {
    if (target !== null) restoreFocus.current = true;
  }, [target]);
  const anchor = {
    getBoundingClientRect: () => {
      const bounds = surface.current?.getBoundingClientRect();
      return new DOMRect(
        (bounds?.left ?? 0) + (target?.x ?? 0),
        (bounds?.top ?? 0) + (target?.y ?? 0),
        0,
        0
      );
    }
  };
  return (
    <Menu.Root
      open={target !== null}
      modal={false}
      onOpenChangeComplete={(open) => {
        if (open)
          popup.current
            ?.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')
            ?.focus();
      }}
      onOpenChange={(open, details) => {
        // The native right-button press that opens our controlled menu may also
        // be reported as an outside press by Base UI Menu (no Menu.Trigger).
        // Cancel only that right-button dismissal; ordinary outside clicks still close it.
        if (
          !open &&
          details.reason === "outside-press" &&
          "button" in details.event &&
          details.event.button === 2
        ) {
          details.cancel();
          return;
        }
        if (open) restoreFocus.current = true;
        else {
          restoreFocus.current =
            details.reason !== "outside-press" && details.reason !== "focus-out";
          onClose();
        }
      }}
    >
      <Menu.Portal>
        <Menu.Positioner
          anchor={anchor}
          sideOffset={4}
          collisionPadding={10}
          className="graph-menu-positioner"
        >
          <Menu.Popup
            ref={popup}
            className="graph-context-menu"
            aria-label={t("graph.actions")}
            finalFocus={() => {
              if (restoreFocus.current) props.onReturnFocus();
              return false;
            }}
          >
            {menuActions(props).map(({ action, label, disabled }) => (
              <Menu.Item
                key={action}
                className="graph-menu-item"
                disabled={disabled}
                onClick={() => {
                  props.onAction(action);
                }}
              >
                {t("graph." + label)}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
