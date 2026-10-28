import { useLayoutEffect, useRef, useState } from "react";
import type { PointerEvent, RefObject } from "react";

import type { Camera, Point } from "./graph-layout.js";
import { pinchCamera } from "./graph-viewport.js";
import { scenePoint } from "./use-scene-camera.js";
import type { SceneSize } from "./use-scene-camera.js";

type GestureMode = "idle" | "pan" | "node" | "pinch";

interface Press {
  pointer: number;
  id: string | null;
  start: Point;
  origin: Point;
  camera: Camera;
  moved: boolean;
}

interface Pinch {
  camera: Camera;
  first: Point;
  second: Point;
}

interface GestureState {
  points: Map<number, Point>;
  captured: Set<number>;
  press: Press | null;
  pinch: Pinch | null;
  mode: GestureMode;
  suppressed: boolean;
  setMode: (mode: GestureMode) => void;
}

interface GestureOptions {
  surface: RefObject<SVGSVGElement | null>;
  size: SceneSize;
  disabled: boolean;
  camera: RefObject<Camera>;
  setCamera: (camera: Camera) => void;
  positions: ReadonlyMap<string, Point>;
  beginDrag: (id: string) => void;
  dragNode: (id: string, point: Point) => void;
  finishDrag: (id: string) => void;
}

function mode(state: GestureState, next: GestureMode) {
  if (state.mode === next) return;
  state.mode = next;
  state.setMode(next);
}

function capture(state: GestureState, options: GestureOptions, pointer: number) {
  const element = options.surface.current;
  if (element === null || typeof element.setPointerCapture !== "function") return;
  element.setPointerCapture(pointer);
  state.captured.add(pointer);
}

function release(state: GestureState, options: GestureOptions, pointer: number) {
  if (!state.captured.delete(pointer)) return;
  const element = options.surface.current;
  if (element === null || typeof element.releasePointerCapture !== "function") return;
  if (element.hasPointerCapture(pointer)) element.releasePointerCapture(pointer);
}

function finishNode(press: Press | null, options: GestureOptions) {
  if (press?.moved === true && press.id !== null) options.finishDrag(press.id);
}

function cancel(state: GestureState, options: GestureOptions, suppress: boolean, finish = true) {
  const press = state.press;
  state.press = null;
  state.pinch = null;
  state.points.clear();
  state.suppressed = suppress;
  for (const pointer of [...state.captured]) release(state, options, pointer);
  if (finish) {
    mode(state, "idle");
    finishNode(press, options);
  } else state.mode = "idle";
}

function pair(state: GestureState) {
  const points = [...state.points.values()];
  const first = points[0];
  const second = points[1];
  return first === undefined || second === undefined ? null : { first, second };
}

function beginPinch(state: GestureState, options: GestureOptions) {
  const points = pair(state);
  if (points === null) return;
  const press = state.press;
  state.press = null;
  state.pinch = { camera: { ...options.camera.current }, ...points };
  state.suppressed = true;
  for (const pointer of state.points.keys()) capture(state, options, pointer);
  mode(state, "pinch");
  finishNode(press, options);
}

function pointerDown(
  state: GestureState,
  options: GestureOptions,
  event: PointerEvent<SVGSVGElement>
) {
  if (options.disabled || event.button !== 0 || state.points.size >= 2) return;
  const element = options.surface.current;
  if (element === null) return;
  const point = scenePoint(element, event, options.size);
  if (state.points.size === 0) state.suppressed = false;
  state.points.set(event.pointerId, point);
  if (state.points.size === 2) {
    event.preventDefault();
    beginPinch(state, options);
    return;
  }
  const target =
    event.target instanceof Element ? event.target.closest<SVGElement>("[data-graph-id]") : null;
  (target ?? element).focus({ preventScroll: true });
  const id = target?.getAttribute("data-node-id") ?? null;
  const camera = { ...options.camera.current };
  const origin = id === null ? camera : options.positions.get(id);
  if (origin === undefined) return;
  state.press = {
    pointer: event.pointerId,
    id,
    start: point,
    origin: { x: origin.x, y: origin.y },
    camera,
    moved: false
  };
}

function pointerMove(
  state: GestureState,
  options: GestureOptions,
  event: PointerEvent<SVGSVGElement>
) {
  if (options.disabled || !state.points.has(event.pointerId)) return;
  const element = options.surface.current;
  if (element === null) return;
  const point = scenePoint(element, event, options.size);
  state.points.set(event.pointerId, point);
  if (state.pinch !== null) {
    const points = pair(state);
    if (points === null) return;
    event.preventDefault();
    options.setCamera(pinchCamera(state.pinch.camera, state.pinch, points));
    return;
  }
  const press = state.press;
  if (press?.pointer !== event.pointerId) return;
  const dx = point.x - press.start.x;
  const dy = point.y - press.start.y;
  if (!press.moved && Math.hypot(dx, dy) < 4) return;
  if (!press.moved) {
    press.moved = true;
    state.suppressed = true;
    capture(state, options, event.pointerId);
    if (press.id !== null) options.beginDrag(press.id);
    mode(state, press.id === null ? "pan" : "node");
  }
  event.preventDefault();
  if (press.id === null)
    options.setCamera({ ...press.camera, x: press.origin.x + dx, y: press.origin.y + dy });
  else
    options.dragNode(press.id, {
      x: press.origin.x + dx / press.camera.scale,
      y: press.origin.y + dy / press.camera.scale
    });
}

function pointerUp(
  state: GestureState,
  options: GestureOptions,
  event: PointerEvent<SVGSVGElement>
) {
  if (!state.points.has(event.pointerId)) return;
  const press = state.press;
  state.press = null;
  state.pinch = null;
  state.points.delete(event.pointerId);
  release(state, options, event.pointerId);
  finishNode(press, options);
  const remaining = [...state.points.entries()][0];
  if (remaining === undefined) {
    mode(state, "idle");
    return;
  }
  const camera = { ...options.camera.current };
  state.press = {
    pointer: remaining[0],
    id: null,
    start: remaining[1],
    origin: camera,
    camera,
    moved: true
  };
  state.suppressed = true;
  mode(state, "pan");
}

export function useGraphGestures(options: GestureOptions) {
  const [gestureMode, setMode] = useState<GestureMode>("idle");
  const state = useRef<GestureState>({
    points: new Map(),
    captured: new Set(),
    press: null,
    pinch: null,
    mode: "idle",
    suppressed: false,
    setMode
  });
  const current = useRef(options);
  current.current = options;
  useLayoutEffect(() => {
    if (options.disabled) cancel(state.current, current.current, false);
  }, [options.disabled]);
  useLayoutEffect(
    () => () => {
      cancel(state.current, current.current, false, false);
    },
    []
  );
  return {
    mode: gestureMode,
    suppressed: () => state.current.suppressed,
    onPointerDown: (event: PointerEvent<SVGSVGElement>) => {
      pointerDown(state.current, current.current, event);
    },
    onPointerMove: (event: PointerEvent<SVGSVGElement>) => {
      pointerMove(state.current, current.current, event);
    },
    onPointerUp: (event: PointerEvent<SVGSVGElement>) => {
      pointerUp(state.current, current.current, event);
    },
    onPointerCancel: () => {
      cancel(state.current, current.current, true);
    },
    onLostPointerCapture: (event: PointerEvent<SVGSVGElement>) => {
      if (state.current.captured.has(event.pointerId)) cancel(state.current, current.current, true);
    },
    onPointerLeave: (event: PointerEvent<SVGSVGElement>) => {
      if (!state.current.captured.has(event.pointerId) && state.current.pinch === null)
        cancel(state.current, current.current, false);
    }
  };
}
