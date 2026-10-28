import { useRef } from "react";
import type { KeyboardEvent, PointerEvent, Ref, RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";

const MIN_WIDTH = 240;
const MAX_WIDTH = 420;
const KEYBOARD_STEP = 16;
const DRAG_THRESHOLD = 5;

interface Drag {
  pointerId: number;
  startX: number;
  startWidth: number;
  moved: boolean;
}

function clampWidth(value: number) {
  return Math.max(MIN_WIDTH, Math.min(value, MAX_WIDTH, window.innerWidth - 440));
}

function resizeFromKeyboard(
  event: KeyboardEvent<HTMLButtonElement>,
  collapsed: boolean,
  width: number,
  onResize: (width: number) => void
) {
  if (!collapsed && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    onResize(clampWidth(width + (event.key === "ArrowLeft" ? -KEYBOARD_STEP : KEYBOARD_STEP)));
  }
}

function SidebarHandleContour() {
  return (
    <svg
      className="sidebar-handle-contour"
      viewBox="0 0 44 112"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        className="sidebar-handle-surface"
        d="M39 0 V20 C39 38 25 38 25 56 C25 74 39 74 39 92 V112 H44 V0 Z"
      />
      <path
        className="sidebar-handle-edge"
        d="M39 0 V20 C39 38 25 38 25 56 C25 74 39 74 39 92 V112"
      />
    </svg>
  );
}

function finishSidebarDrag(
  event: PointerEvent<HTMLButtonElement>,
  drag: RefObject<Drag | null>,
  suppressClick: RefObject<boolean>,
  onDraggingChange: (dragging: boolean) => void
) {
  const current = drag.current;
  if (current?.pointerId !== event.pointerId) return;
  suppressClick.current = current.moved && event.type !== "pointercancel";
  drag.current = null;
  onDraggingChange(false);
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
}

export function SidebarHandle({
  ref,
  collapsed,
  drawerOpen,
  width,
  onToggle,
  onResize,
  onDraggingChange
}: {
  ref?: Ref<HTMLButtonElement>;
  collapsed: boolean;
  drawerOpen?: boolean | undefined;
  width: number;
  onToggle: () => void;
  onResize: (width: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);
  const isDrawer = drawerOpen !== undefined;
  const contracted = isDrawer || collapsed;
  const sidebarLabel = t(collapsed ? "versions.expandSidebar" : "versions.collapseSidebar");
  const label = isDrawer ? t("versions.navigation") : sidebarLabel;

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    finishSidebarDrag(event, drag, suppressClick, onDraggingChange);
  }

  return (
    <button
      ref={ref}
      className="sidebar-handle"
      type="button"
      data-collapsed={contracted}
      aria-controls={isDrawer ? "kgos-version-drawer" : "kgos-version-sidebar"}
      aria-expanded={isDrawer ? drawerOpen : !collapsed}
      aria-haspopup={isDrawer ? "dialog" : undefined}
      aria-label={label}
      title={isDrawer || collapsed ? label : t("versions.collapseHint")}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onToggle();
      }}
      onKeyDown={(event) => {
        resizeFromKeyboard(event, contracted, width, onResize);
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (contracted || event.button !== 0) {
          return;
        }
        drag.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startWidth: width,
          moved: false
        };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (contracted || current?.pointerId !== event.pointerId) {
          return;
        }
        const delta = event.clientX - current.startX;
        if (Math.abs(delta) <= DRAG_THRESHOLD && !current.moved) {
          return;
        }
        if (!current.moved) {
          current.moved = true;
          onDraggingChange(true);
        }
        onResize(clampWidth(current.startWidth + delta));
      }}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onLostPointerCapture={() => {
        if (drag.current !== null) {
          drag.current = null;
          onDraggingChange(false);
        }
      }}
    >
      <SidebarHandleContour />
      <Icon name={contracted ? "chevronRight" : "chevronLeft"} />
    </button>
  );
}
