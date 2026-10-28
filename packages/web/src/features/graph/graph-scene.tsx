// cspell:words relayout

import { useId, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { KeyboardEvent, MouseEvent, Ref, RefObject } from "react";
import { useTranslation } from "react-i18next";

import type { GraphData } from "./graph-data.js";
import { useGraphGestures } from "./graph-gestures.js";
import { arrowStep } from "./graph-layout.js";
import { ArrowMarkers, GraphControls, GraphEdges, GraphNodes } from "./graph-scene-items.js";
import { useGraphLayout } from "./use-graph-layout.js";
import { useCanvasSize, useSceneCamera, useSceneWheel } from "./use-scene-camera.js";
import type { SceneSize } from "./use-scene-camera.js";
import "./graph-scene.css";

export interface GraphSceneContextTarget {
  id: string | null;
  x: number;
  y: number;
}

export interface GraphSceneHandle {
  focusNode: (id: string) => void;
  togglePin: (id: string) => void;
  isPinned: (id: string) => boolean;
  fit: () => void;
  relayout: () => void;
}

interface GraphSceneProps {
  data: GraphData;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onToggleExpand?: ((id: string) => void) | undefined;
  onContextMenu?: ((target: GraphSceneContextTarget) => void) | undefined;
  onPinnedChange?: ((ids: ReadonlySet<string>) => void) | undefined;
  expanded?: ReadonlySet<string>;
  expandingIds?: ReadonlySet<string>;
  disabled?: boolean;
  ref?: Ref<GraphSceneHandle>;
}

type Layout = ReturnType<typeof useGraphLayout>;
type Viewport = ReturnType<typeof useSceneCamera>;
const EMPTY_IDS: ReadonlySet<string> = new Set();

function graphTarget(target: EventTarget): SVGElement | null {
  return target instanceof Element ? target.closest<SVGElement>("[data-graph-id]") : null;
}

function contextPosition(
  event: MouseEvent<SVGSVGElement> | KeyboardEvent<SVGSVGElement>,
  surface: SVGSVGElement,
  size: SceneSize
): GraphSceneContextTarget {
  const object = graphTarget(event.target);
  const bounds = surface.getBoundingClientRect();
  let x = size.width / 2;
  let y = size.height / 2;
  if ("clientX" in event) {
    x = event.clientX - bounds.left;
    y = event.clientY - bounds.top;
  } else if (object !== null) {
    const objectBounds = object.getBoundingClientRect();
    x = objectBounds.left + objectBounds.width / 2 - bounds.left;
    y = objectBounds.top + objectBounds.height / 2 - bounds.top;
  }
  return { id: object?.getAttribute("data-graph-id") ?? null, x, y };
}

function focusNode(id: string, layout: Layout, viewport: Viewport, surface: SVGSVGElement | null) {
  const point = layout.positions.get(id);
  if (point === undefined) return;
  viewport.setCamera((previous) => ({
    ...previous,
    x: -point.x * previous.scale,
    y: -point.y * previous.scale
  }));
  const target = [...(surface?.querySelectorAll<SVGElement>("[data-node-id]") ?? [])].find(
    (element) => element.getAttribute("data-node-id") === id
  );
  target?.focus({ preventScroll: true });
}

interface SceneCommands {
  props: GraphSceneProps;
  layout: Layout;
  viewport: Viewport;
  surface: RefObject<SVGSVGElement | null>;
  size: SceneSize;
  suppressed: () => boolean;
}

function openContext(
  event: MouseEvent<SVGSVGElement> | KeyboardEvent<SVGSVGElement>,
  controls: SceneCommands
) {
  if (controls.props.disabled === true || controls.surface.current === null) return;
  event.preventDefault();
  event.stopPropagation();
  controls.props.onContextMenu?.(contextPosition(event, controls.surface.current, controls.size));
}

function sceneKey(event: KeyboardEvent<SVGSVGElement>, controls: SceneCommands) {
  if (controls.props.disabled === true || event.nativeEvent.isComposing) return;
  if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
    openContext(event, controls);
    return;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const step = arrowStep(event.key);
  if (step !== null) {
    event.preventDefault();
    controls.viewport.setCamera((previous) => ({
      ...previous,
      x: previous.x - step.x,
      y: previous.y - step.y
    }));
  } else if (event.key === "0" || event.key.toLowerCase() === "f") {
    event.preventDefault();
    controls.viewport.fit();
  } else if (["+", "=", "-", "−"].includes(event.key)) {
    event.preventDefault();
    controls.viewport.zoom(event.key === "-" || event.key === "−" ? 1 / 1.2 : 1.2);
  }
}

function GraphDrawing({ controls, marker }: { controls: SceneCommands; marker: string }) {
  const { props, viewport, layout, size, suppressed } = controls;
  const select = (id: string, keyboard = false) => {
    if (keyboard || !suppressed()) props.onSelect(id);
  };
  const toggle = (id: string, keyboard = false) => {
    if (keyboard || !suppressed()) props.onToggleExpand?.(id);
  };
  return (
    <>
      <ArrowMarkers id={marker} />
      <g
        transform={`translate(${String(size.width / 2 + viewport.camera.x)} ${String(size.height / 2 + viewport.camera.y)}) scale(${String(viewport.camera.scale)})`}
      >
        <GraphEdges
          data={props.data}
          positions={layout.positions}
          selected={props.selected}
          disabled={props.disabled === true}
          marker={marker}
          onSelect={select}
        />
        <GraphNodes
          data={props.data}
          positions={layout.positions}
          selected={props.selected}
          disabled={props.disabled === true}
          expanded={props.expanded ?? EMPTY_IDS}
          expandingIds={props.expandingIds ?? EMPTY_IDS}
          pinned={layout.pinned}
          onSelect={select}
          onMove={layout.moveNode}
          onToggleExpand={props.onToggleExpand === undefined ? undefined : toggle}
        />
      </g>
    </>
  );
}

function GraphSurface({
  commands,
  gestures,
  marker
}: {
  commands: SceneCommands;
  gestures: ReturnType<typeof useGraphGestures>;
  marker: string;
}) {
  const { props, surface, size, viewport } = commands;
  const { disabled = false, onSelect } = props;
  const { t } = useTranslation();
  return (
    <svg
      ref={surface}
      className={
        "graph-scene" +
        (disabled ? " is-disabled" : "") +
        (gestures.mode === "idle" ? "" : " is-dragging")
      }
      data-gesture={gestures.mode}
      role="group"
      aria-label={t("workspace.canvas")}
      tabIndex={disabled ? -1 : 0}
      viewBox={`0 0 ${String(size.width)} ${String(size.height)}`}
      onPointerDownCapture={gestures.onPointerDown}
      onPointerMove={gestures.onPointerMove}
      onPointerUp={gestures.onPointerUp}
      onPointerCancel={gestures.onPointerCancel}
      onLostPointerCapture={gestures.onLostPointerCapture}
      onPointerLeave={gestures.onPointerLeave}
      onContextMenu={(event) => {
        openContext(event, commands);
      }}
      onKeyDown={(event) => {
        sceneKey(event, commands);
      }}
      onClick={() => {
        if (!disabled && !gestures.suppressed()) onSelect(null);
      }}
      onDoubleClick={(event) => {
        if (!disabled && graphTarget(event.target) === null && !gestures.suppressed()) {
          event.preventDefault();
          viewport.fit();
        }
      }}
    >
      <GraphDrawing controls={commands} marker={marker} />
    </svg>
  );
}

export function GraphScene(props: GraphSceneProps) {
  const { data, disabled = false, onPinnedChange } = props;
  const surface = useRef<SVGSVGElement>(null);
  const marker = useId();
  const size = useCanvasSize(surface);
  const layout = useGraphLayout(data);
  const viewport = useSceneCamera(layout.positions, size, data);
  const gestures = useGraphGestures({
    surface,
    size,
    disabled,
    camera: viewport.current,
    setCamera: viewport.setCamera,
    positions: layout.positions,
    beginDrag: layout.beginDrag,
    dragNode: layout.dragNode,
    finishDrag: layout.finishDrag
  });
  const commands = { props, layout, viewport, surface, size, suppressed: gestures.suppressed };
  useSceneWheel(surface, disabled || data.nodes.length === 0, size, viewport.zoom);
  useImperativeHandle(props.ref, () => ({
    focusNode: (id) => {
      if (!disabled) focusNode(id, layout, viewport, surface.current);
    },
    togglePin: (id) => {
      if (!disabled) layout.togglePin(id);
    },
    isPinned: (id) => layout.pinned.has(id),
    fit: () => {
      if (!disabled) viewport.fit();
    },
    relayout: () => {
      if (!disabled) layout.relayout();
    }
  }));
  useLayoutEffect(() => {
    onPinnedChange?.(layout.pinned);
  }, [layout.pinned, onPinnedChange]);
  return (
    <>
      <GraphSurface commands={commands} gestures={gestures} marker={marker} />
      <GraphControls
        camera={viewport.camera}
        disabled={disabled || data.nodes.length === 0}
        onZoom={viewport.zoom}
        onReset={() => {
          viewport.zoom(1 / viewport.camera.scale);
        }}
        onFit={viewport.fit}
        onRelayout={layout.relayout}
      />
    </>
  );
}
