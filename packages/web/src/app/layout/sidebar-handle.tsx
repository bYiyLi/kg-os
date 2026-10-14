import { useRef } from "react";
import type { KeyboardEvent, PointerEvent } from "react";
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

export function SidebarHandle({
  collapsed,
  width,
  onToggle,
  onResize,
  onDraggingChange
}: {
  collapsed: boolean;
  width: number;
  onToggle: () => void;
  onResize: (width: number) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const { t } = useTranslation();
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  function finishDrag(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const current = drag.current;
    if (current?.pointerId !== event.pointerId) {
      return;
    }
    suppressClick.current = current.moved && !canceled;
    drag.current = null;
    onDraggingChange(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <button
      className="sidebar-handle"
      type="button"
      aria-controls="kgos-version-sidebar"
      aria-expanded={!collapsed}
      aria-label={t(collapsed ? "versions.expandSidebar" : "versions.collapseSidebar")}
      title={t(collapsed ? "versions.expandSidebar" : "versions.collapseHint")}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false;
          return;
        }
        onToggle();
      }}
      onKeyDown={(event) => {
        resizeFromKeyboard(event, collapsed, width, onResize);
      }}
      onPointerDown={(event) => {
        suppressClick.current = false;
        if (collapsed || event.button !== 0) {
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
        if (current?.pointerId !== event.pointerId) {
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
      onPointerCancel={(event) => {
        finishDrag(event, true);
      }}
      onLostPointerCapture={() => {
        if (drag.current !== null) {
          drag.current = null;
          onDraggingChange(false);
        }
      }}
    >
      <SidebarHandleContour />
      <Icon name={collapsed ? "chevronRight" : "chevronLeft"} />
    </button>
  );
}
