import type { Locator } from "@playwright/test";

export interface Point {
  x: number;
  y: number;
}
export interface Matrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export async function nodeCenter(node: Locator): Promise<Point> {
  const bounds = await node.boundingBox();
  if (bounds === null) throw new Error("Graph node has no visible position");
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

export async function worldPoint(node: Locator): Promise<Point> {
  return node.evaluate((element) => {
    const { x, y } = (element as HTMLElement).dataset;
    const world = { x: Number(x), y: Number(y) };
    if (
      x === undefined ||
      y === undefined ||
      !Number.isFinite(world.x) ||
      !Number.isFinite(world.y)
    )
      throw new Error("G6 has no settled world coordinate");
    return world;
  });
}

export async function graphCamera(node: Locator): Promise<Matrix> {
  return node.evaluate((element) => {
    const target = element as HTMLElement;
    const rect = target.getBoundingClientRect();
    const surface = target.closest(".graph-scene");
    const zoom = Number((surface as HTMLElement | null)?.dataset["zoom"]);
    const worldX = Number(target.dataset["x"]);
    const worldY = Number(target.dataset["y"]);
    if (!Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(worldX) || !Number.isFinite(worldY))
      throw new Error("G6 has no readable viewport");
    return {
      a: zoom,
      b: 0,
      c: 0,
      d: zoom,
      e: rect.left + rect.width / 2 - worldX * zoom,
      f: rect.top + rect.height / 2 - worldY * zoom
    };
  });
}

export function atScreen(matrix: Matrix, point: Point): Point {
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f
  };
}

export function inWorld(matrix: Matrix, point: Point): Point {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  return {
    x: (matrix.d * (point.x - matrix.e) - matrix.c * (point.y - matrix.f)) / determinant,
    y: (-matrix.b * (point.x - matrix.e) + matrix.a * (point.y - matrix.f)) / determinant
  };
}
