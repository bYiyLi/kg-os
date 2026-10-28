// cspell:words relayout

import { useLayoutEffect, useMemo, useRef, useState } from "react";

import type { GraphData } from "./graph-data.js";
import { initialGraphPositions, layoutGraph } from "./graph-layout.js";
import type { Point } from "./graph-layout.js";

type Positions = Map<string, Point>;

function useReducedMotion() {
  const media = useMemo(
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null,
    []
  );
  const [reduced, setReduced] = useState(media?.matches ?? false);
  useLayoutEffect(() => {
    if (media === null) return;
    const change = () => {
      setReduced(media.matches);
    };
    media.addEventListener("change", change);
    return () => {
      media.removeEventListener("change", change);
    };
  }, [media]);
  return reduced;
}

function interpolate(from: ReadonlyMap<string, Point>, target: Positions, progress: number) {
  const eased = 1 - (1 - progress) ** 3;
  return new Map(
    [...target].map(([id, end]) => {
      const start = from.get(id) ?? end;
      return [
        id,
        { x: start.x + (end.x - start.x) * eased, y: start.y + (end.y - start.y) * eased }
      ];
    })
  );
}

function usePositionAnimation(initial: () => Positions) {
  const [positions, setPositions] = useState(initial);
  const latest = useRef(positions);
  const frame = useRef<number | null>(null);
  const generation = useRef(0);
  function publish(value: Positions) {
    latest.current = value;
    setPositions(value);
  }
  function cancel() {
    generation.current++;
    if (frame.current !== null && typeof cancelAnimationFrame === "function")
      cancelAnimationFrame(frame.current);
    frame.current = null;
  }
  function animate(from: Positions, target: Positions) {
    cancel();
    if (from.size === 0 || target.size === 0 || typeof requestAnimationFrame !== "function") {
      publish(target);
      return;
    }
    publish(from);
    const current = generation.current;
    let started: number | null = null;
    const step = (now: number) => {
      if (current !== generation.current) return;
      started ??= now;
      const progress = Math.min(1, Math.max(0, (now - started) / 260));
      publish(progress === 1 ? target : interpolate(from, target, progress));
      frame.current = progress === 1 ? null : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }
  useLayoutEffect(() => cancel, []);
  return { positions, latest, publish, cancel, animate };
}

function structureKey(data: GraphData) {
  return JSON.stringify([
    data.nodes.map((node) => node.id).sort(),
    data.relationships.map((edge) => [edge.id, edge.start, edge.end]).sort()
  ]);
}

export function useGraphLayout(data: GraphData) {
  const animation = usePositionAnimation(() => layoutGraph(data));
  const reduced = useReducedMotion();
  const fixed = useRef(new Set<string>());
  const dragging = useRef<string | null>(null);
  const [pinned, setPinned] = useState<ReadonlySet<string>>(fixed.current);
  const structure = useMemo(() => structureKey(data), [data]);
  const settled = useRef({ structure, reduced });
  function publishPins(next: Set<string>) {
    fixed.current = next;
    setPinned(next);
  }
  function reflow(restart = false) {
    animation.cancel();
    const current = animation.latest.current;
    const origin = restart
      ? new Map([...current].filter(([id]) => fixed.current.has(id)))
      : current;
    const target = layoutGraph(data, origin, fixed.current);
    if (reduced || dragging.current !== null) {
      animation.publish(dragging.current === null ? target : initialGraphPositions(data, current));
    } else animation.animate(initialGraphPositions(data, current), target);
  }
  useLayoutEffect(() => {
    if (settled.current.structure === structure && settled.current.reduced === reduced)
      return animation.cancel;
    settled.current = { structure, reduced };
    const ids = new Set(data.nodes.map((node) => node.id));
    const retained = new Set([...fixed.current].filter((id) => ids.has(id)));
    if (retained.size !== fixed.current.size) publishPins(retained);
    if (dragging.current !== null && !ids.has(dragging.current)) dragging.current = null;
    reflow();
    return animation.cancel;
  }, [structure, reduced]);
  function beginDrag(id: string) {
    if (!animation.latest.current.has(id)) return;
    animation.cancel();
    dragging.current = id;
    if (!fixed.current.has(id)) publishPins(new Set(fixed.current).add(id));
  }
  function dragNode(id: string, point: Point) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !animation.latest.current.has(id))
      return;
    beginDrag(id);
    animation.publish(new Map(animation.latest.current).set(id, { ...point }));
  }
  function finishDrag(id: string) {
    if (dragging.current !== id) return;
    dragging.current = null;
    reflow();
  }
  function moveNode(id: string, delta: Point) {
    const point = animation.latest.current.get(id);
    if (point === undefined) return;
    dragNode(id, { x: point.x + delta.x, y: point.y + delta.y });
    finishDrag(id);
  }
  function togglePin(id: string) {
    if (!animation.latest.current.has(id)) return;
    const next = new Set(fixed.current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    publishPins(next);
    reflow();
  }
  return {
    positions: animation.positions,
    pinned,
    beginDrag,
    dragNode,
    finishDrag,
    moveNode,
    togglePin,
    relayout: () => {
      reflow(true);
    }
  };
}
