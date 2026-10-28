import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import type { GraphData } from "./graph-data.js";
import { fitGraph } from "./graph-layout.js";
import type { Camera, Point } from "./graph-layout.js";
import { wheelZoomFactor, zoomCamera } from "./graph-viewport.js";

export interface SceneSize {
  width: number;
  height: number;
}

type CameraUpdate = Camera | ((previous: Camera) => Camera);
const DEFAULT_SIZE: SceneSize = { width: 900, height: 600 };
const DEFAULT_CAMERA: Camera = { x: 0, y: 0, scale: 1 };

export function useCanvasSize(surface: RefObject<SVGSVGElement | null>): SceneSize {
  const [size, setSize] = useState(DEFAULT_SIZE);
  useLayoutEffect(() => {
    const element = surface.current;
    if (element === null) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setSize((previous) =>
        previous.width === bounds.width && previous.height === bounds.height
          ? previous
          : { width: bounds.width, height: bounds.height }
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [surface]);
  return size;
}

export function useSceneCamera(
  positions: ReadonlyMap<string, Point>,
  size: SceneSize,
  data: GraphData
) {
  const [camera, update] = useState(DEFAULT_CAMERA);
  const current = useRef(camera);
  const fitted = useRef(false);
  const setCamera = useCallback((next: CameraUpdate) => {
    current.current = typeof next === "function" ? next(current.current) : next;
    update(current.current);
  }, []);
  const zoom = useCallback(
    (factor: number, point: Point = { x: 0, y: 0 }) => {
      setCamera((previous) => zoomCamera(previous, factor, point));
    },
    [setCamera]
  );
  const fit = useCallback(() => {
    setCamera(fitGraph(positions, size.width, size.height, data));
  }, [positions, size, data, setCamera]);
  useLayoutEffect(() => {
    if (positions.size === 0) {
      fitted.current = false;
      setCamera(DEFAULT_CAMERA);
    } else if (!fitted.current) {
      fitted.current = true;
      fit();
    }
  }, [positions, fit, setCamera]);
  return { camera, current, setCamera, zoom, fit };
}

export function scenePoint(
  element: SVGSVGElement,
  event: { clientX: number; clientY: number },
  size: SceneSize
): Point {
  const bounds = element.getBoundingClientRect();
  const width = bounds.width > 0 ? bounds.width : size.width;
  const height = bounds.height > 0 ? bounds.height : size.height;
  return { x: event.clientX - bounds.left - width / 2, y: event.clientY - bounds.top - height / 2 };
}

export function useSceneWheel(
  surface: RefObject<SVGSVGElement | null>,
  disabled: boolean,
  size: SceneSize,
  zoom: (factor: number, point: Point) => void
) {
  useLayoutEffect(() => {
    const element = surface.current;
    if (element === null || disabled) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = wheelZoomFactor(event.deltaY, event.deltaMode, size.height);
      if (factor !== 1) zoom(factor, scenePoint(element, event, size));
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
    };
  }, [surface, disabled, size, zoom]);
}
