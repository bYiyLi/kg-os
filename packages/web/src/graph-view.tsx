import { useId, useLayoutEffect, useState, type KeyboardEvent, type PointerEvent } from "react";

import { type Connection } from "./connection.js";
import { type Frame, type Position } from "./frame.js";
import { elementTitle, type GraphRelationship } from "./projection.js";

interface Viewport {
  width: number;
  height: number;
}

function useViewport() {
  const [svg, setSvg] = useState<SVGSVGElement | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 1_000, height: 420 });
  useLayoutEffect(() => {
    if (svg === null) return;
    const measure = () => {
      const { width, height } = svg.getBoundingClientRect();
      if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) return;
      setViewport((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height }
      );
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    return () => {
      observer.disconnect();
    };
  }, [svg]);
  return { viewport, setSvg };
}

function edgePath(frame: Frame, edge: GraphRelationship, index: number) {
  const start = frame.positions.get(edge.start) ?? { x: 0, y: 0 };
  const end = frame.positions.get(edge.end) ?? start;
  if (edge.start === edge.end)
    return `M ${String(start.x - 20)} ${String(start.y - 20)} C ${String(start.x - 85)} ${String(start.y - 115)}, ${String(start.x + 85)} ${String(start.y - 115)}, ${String(start.x + 20)} ${String(start.y - 20)}`;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const bend = 20 + (index % 5) * 16;
  return `M ${String(start.x + (dx * 34) / length)} ${String(start.y + (dy * 34) / length)} Q ${String((start.x + end.x) / 2 - (dy * bend) / length)} ${String((start.y + end.y) / 2 + (dx * bend) / length)} ${String(end.x - (dx * 38) / length)} ${String(end.y - (dy * 38) / length)}`;
}

function edgePosition(frame: Frame, edge: GraphRelationship): Position {
  const start = frame.positions.get(edge.start) ?? { x: 0, y: 0 };
  const end = frame.positions.get(edge.end) ?? start;
  return {
    x: (start.x + end.x) / 2,
    y: edge.start === edge.end ? start.y - 70 : (start.y + end.y) / 2 - 10
  };
}

function fit(frame: Frame, viewport: Viewport) {
  const positions = [...frame.positions.values()];
  if (positions.length === 0) return;
  const minX = Math.min(...positions.map((position) => position.x)) - 100;
  const minY = Math.min(...positions.map((position) => position.y)) - 90;
  const spanX = Math.max(...positions.map((position) => position.x)) + 100 - minX;
  const spanY = Math.max(...positions.map((position) => position.y)) + 90 - minY;
  frame.camera = {
    x: minX,
    y: minY,
    zoom: Math.max(0.1, Math.min(4, viewport.width / spanX, viewport.height / spanY))
  };
  frame.persist();
}

function inView(frame: Frame, ref: string, viewport: Viewport): boolean {
  const position = frame.positions.get(ref);
  const { x, y, zoom } = frame.camera;
  const padding = Math.max(160, 22 / zoom);
  return (
    position !== undefined &&
    position.x >= x - padding &&
    position.x <= x + viewport.width / zoom + padding &&
    position.y >= y - padding &&
    position.y <= y + viewport.height / zoom + padding
  );
}

export function GraphView({ frame, connection }: { frame: Frame; connection: Connection }) {
  const marker = useId().replaceAll(":", "");
  const { viewport, setSvg } = useViewport();
  const [drag, setDrag] = useState<{ ref: string; origin: Position; pointer: Position }>();
  const projection = frame.projection;
  const camera = frame.camera;
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  const choose = (ref: string) => {
    frame.select(ref, connection);
  };
  function key(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      const ref = event.currentTarget.getAttribute("data-node");
      if (ref !== null) choose(ref);
    }
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const nodes = event.currentTarget.parentElement?.querySelectorAll<SVGGElement>("[data-node]");
      const count = nodes?.length ?? 1;
      const index = nodes === undefined ? 0 : Array.from(nodes).indexOf(event.currentTarget);
      const next = (index + (event.key === "ArrowRight" ? 1 : -1) + count) % count;
      nodes?.[next]?.focus();
    }
  }
  function pointer(event: PointerEvent<SVGSVGElement>) {
    if (drag === undefined) return;
    const scale = width / viewport.width;
    frame.positions.set(drag.ref, {
      x: drag.origin.x + (event.clientX - drag.pointer.x) * scale,
      y: drag.origin.y + (event.clientY - drag.pointer.y) * scale
    });
    frame.changed();
  }
  return (
    <div className="graph-canvas">
      <GraphTools frame={frame} viewport={viewport} />
      <svg
        ref={setSvg}
        role="group"
        aria-label="当前帧知识子图"
        viewBox={`${String(camera.x)} ${String(camera.y)} ${String(width)} ${String(height)}`}
        onPointerMove={pointer}
        onPointerUp={() => {
          if (drag !== undefined) {
            setDrag(undefined);
            frame.persist();
          }
        }}
        onPointerCancel={() => {
          setDrag(undefined);
        }}
      >
        <ArrowMarker marker={marker} />
        <GraphEdges frame={frame} viewport={viewport} marker={marker} choose={choose} />
        <GraphNodes
          frame={frame}
          viewport={viewport}
          choose={choose}
          onKey={key}
          onDrag={setDrag}
        />
      </svg>
      {projection.nodes.length === 0 && (
        <p className="graph-empty">
          {frame.rowCount === 0 ? "尚无图元素" : "结果包含标量或其他值，可查看 JSON"}
        </p>
      )}
      {projection.limited && <p role="status">达到图投影显示范围；JSON 保留已接收数据</p>}
      {projection.issues.map((issue, index) => (
        <p key={`${String(index)}:${issue}`} className="warning">
          {issue}
        </p>
      ))}
    </div>
  );
}

function ArrowMarker({ marker }: { marker: string }) {
  return (
    <defs>
      <marker
        id={marker}
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="7"
        markerHeight="7"
        orient="auto-start-reverse"
      >
        <path d="M 0 0 L 10 5 L 0 10 z" fill="#7283a0" />
      </marker>
    </defs>
  );
}

function GraphTools({ frame, viewport }: { frame: Frame; viewport: Viewport }) {
  const camera = frame.camera;
  const width = viewport.width / camera.zoom;
  const height = viewport.height / camera.zoom;
  const moveCamera = (x: number, y: number) => {
    frame.camera = { ...camera, x: camera.x + x, y: camera.y + y };
    frame.persist();
  };
  const zoom = (factor: number) => {
    frame.camera = { ...camera, zoom: Math.max(0.1, Math.min(4, camera.zoom * factor)) };
    frame.persist();
  };
  return (
    <div className="graph-tools actions" aria-label="图谱视口">
      <button
        onClick={() => {
          zoom(1.2);
        }}
        aria-label="放大图谱"
      >
        ＋
      </button>
      <button
        onClick={() => {
          zoom(1 / 1.2);
        }}
        aria-label="缩小图谱"
      >
        −
      </button>
      <button
        onClick={() => {
          fit(frame, viewport);
        }}
      >
        适配范围
      </button>
      <button
        onClick={() => {
          const position = frame.positions.get(frame.selected);
          if (position !== undefined) {
            frame.camera = { ...camera, x: position.x - width / 2, y: position.y - height / 2 };
            frame.persist();
          }
        }}
        disabled={frame.selected === ""}
      >
        定位选中
      </button>
      <button
        onClick={() => {
          moveCamera(-120, 0);
        }}
        aria-label="向左平移"
      >
        ←
      </button>
      <button
        onClick={() => {
          moveCamera(120, 0);
        }}
        aria-label="向右平移"
      >
        →
      </button>
      <button
        onClick={() => {
          moveCamera(0, -100);
        }}
        aria-label="向上平移"
      >
        ↑
      </button>
      <button
        onClick={() => {
          moveCamera(0, 100);
        }}
        aria-label="向下平移"
      >
        ↓
      </button>
    </div>
  );
}

function GraphEdges({
  frame,
  viewport,
  marker,
  choose
}: {
  frame: Frame;
  viewport: Viewport;
  marker: string;
  choose: (ref: string) => void;
}) {
  const projection = frame.projection;
  return (
    <>
      {projection.relationships
        .filter((edge) => inView(frame, edge.start, viewport) || inView(frame, edge.end, viewport))
        .map((edge, index) => (
          <g
            key={edge.ref}
            role="button"
            tabIndex={0}
            aria-label={`${edge.ref} ${edge.type} ${edge.start} 到 ${edge.end}`}
            className={frame.selected === edge.ref ? "selected" : ""}
            onClick={() => {
              choose(edge.ref);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                choose(edge.ref);
              }
            }}
          >
            <path className="edge-hit" d={edgePath(frame, edge, index)} />
            <path className="edge" d={edgePath(frame, edge, index)} markerEnd={`url(#${marker})`} />
            <text
              className="edge-label"
              x={edgePosition(frame, edge).x}
              y={edgePosition(frame, edge).y}
              textAnchor="middle"
            >
              {edge.type.slice(0, 24)}
            </text>
            <title>
              {edge.ref} · {edge.type} · {edge.start} → {edge.end}
            </title>
          </g>
        ))}
    </>
  );
}

function GraphNodes({
  frame,
  viewport,
  choose,
  onKey,
  onDrag
}: {
  frame: Frame;
  viewport: Viewport;
  choose: (ref: string) => void;
  onKey: (event: KeyboardEvent<SVGGElement>) => void;
  onDrag: (drag: { ref: string; origin: Position; pointer: Position }) => void;
}) {
  const projection = frame.projection;
  return (
    <>
      {projection.nodes
        .filter((node) => inView(frame, node.ref, viewport))
        .map((node) => {
          const position = frame.positions.get(node.ref) ?? { x: 0, y: 0 };
          return (
            <g
              key={node.ref}
              data-node={node.ref}
              role="button"
              tabIndex={0}
              aria-label={`${node.ref} ${elementTitle(node)}`}
              className={`graph-node ${frame.selected === node.ref ? "selected" : ""} ${node.loaded ? "" : "unloaded"}`}
              transform={`translate(${String(position.x)},${String(position.y)})`}
              onClick={() => {
                choose(node.ref);
              }}
              onKeyDown={onKey}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                choose(node.ref);
                event.currentTarget.ownerSVGElement?.setPointerCapture(event.pointerId);
                onDrag({
                  ref: node.ref,
                  origin: position,
                  pointer: { x: event.clientX, y: event.clientY }
                });
              }}
            >
              <NodeHit zoom={frame.camera.zoom} />
              <rect className="node-shape" x="-72" y="-28" width="144" height="56" rx="28" />
              <text textAnchor="middle" y="-3">
                {elementTitle(node).slice(0, 18)}
              </text>
              <text className="node-subtitle" textAnchor="middle" y="16">
                {node.ref} ·{" "}
                {node.labels.join(", ").slice(0, 18) || (node.loaded ? "无 Label" : "未加载")}
              </text>
              <title>
                {elementTitle(node)} · {node.ref}
              </title>
            </g>
          );
        })}
    </>
  );
}

function NodeHit({ zoom }: { zoom: number }) {
  const width = Math.max(144, 44 / zoom);
  const height = Math.max(56, 44 / zoom);
  return <rect className="node-hit" x={-width / 2} y={-height / 2} width={width} height={height} />;
}
