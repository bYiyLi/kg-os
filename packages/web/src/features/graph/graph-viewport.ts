import type { Camera, Point } from "./graph-layout.js";

interface PinchPoints {
  first: Point;
  second: Point;
}

function finitePoint(point: Point): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function usableCamera(camera: Camera): boolean {
  return finitePoint(camera) && Number.isFinite(camera.scale) && camera.scale > 0;
}

function anchoredCamera(camera: Camera, scale: number, before: Point, after: Point): Camera {
  const nextScale = Math.max(0.05, Math.min(3, scale));
  if (nextScale === camera.scale && before.x === after.x && before.y === after.y) return camera;
  const ratio = nextScale / camera.scale;
  const next = {
    x: after.x - (before.x - camera.x) * ratio,
    y: after.y - (before.y - camera.y) * ratio,
    scale: nextScale
  };
  return finitePoint(next) ? next : camera;
}

/** CSS-pixel anchor coordinates are relative to the center of the canvas. */
export function zoomCamera(camera: Camera, factor: number, anchor: Point = { x: 0, y: 0 }): Camera {
  if (!usableCamera(camera)) return { x: 0, y: 0, scale: 1 };
  if (!Number.isFinite(factor) || factor <= 0 || !finitePoint(anchor)) return camera;
  if (factor === 1) return camera;
  return anchoredCamera(camera, camera.scale * factor, anchor, anchor);
}

/** Normalize browser wheel units before applying a bounded exponential zoom. */
export function wheelZoomFactor(deltaY: number, deltaMode: number, pageHeight: number): number {
  if (!Number.isFinite(deltaY)) return 1;
  const height = Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 800;
  let pixels = deltaY;
  if (deltaMode === 1) pixels *= 16;
  else if (deltaMode === 2) pixels *= height;
  if (!Number.isFinite(pixels)) return 1;
  return Math.exp(-Math.max(-240, Math.min(240, pixels)) * 0.0025);
}

function pinchGeometry(points: PinchPoints): { midpoint: Point; distance: number } | null {
  if (!finitePoint(points.first) || !finitePoint(points.second)) return null;
  const distance = Math.hypot(points.second.x - points.first.x, points.second.y - points.first.y);
  const midpoint = {
    x: points.first.x / 2 + points.second.x / 2,
    y: points.first.y / 2 + points.second.y / 2
  };
  if (!Number.isFinite(distance) || distance === 0 || !finitePoint(midpoint)) return null;
  return { midpoint, distance };
}

/** Keep the initial midpoint's world coordinate under the current midpoint. */
export function pinchCamera(camera: Camera, initial: PinchPoints, current: PinchPoints): Camera {
  if (!usableCamera(camera)) return { x: 0, y: 0, scale: 1 };
  const before = pinchGeometry(initial);
  const after = pinchGeometry(current);
  if (before === null || after === null) return camera;
  const factor = after.distance / before.distance;
  if (!Number.isFinite(factor)) return camera;
  return anchoredCamera(camera, camera.scale * factor, before.midpoint, after.midpoint);
}
