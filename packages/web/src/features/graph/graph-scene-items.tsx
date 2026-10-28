import { useMemo } from "react";
import type { CSSProperties, KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import { nodeCaption } from "./graph-data.js";
import type { GraphData, GraphNode } from "./graph-data.js";
import { arrowStep, relationshipPaths } from "./graph-layout.js";
import type { Camera, Point } from "./graph-layout.js";

interface GraphItemsProps {
  data: GraphData;
  positions: ReadonlyMap<string, Point>;
  selected: string | null;
  disabled: boolean;
  onSelect: (id: string, keyboard?: boolean) => void;
}

interface GraphNodesProps extends GraphItemsProps {
  expanded: ReadonlySet<string>;
  expandingIds: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  onMove: (id: string, step: Point) => void;
  onToggleExpand?: ((id: string, keyboard?: boolean) => void) | undefined;
}

const captionSegments = new Intl.Segmenter(undefined, { granularity: "grapheme" });

function nodeColor(node: GraphNode): number {
  const label = [...node.labels].sort()[0] ?? "";
  let color = 0;
  for (const letter of label) color = (color * 31 + letter.charCodeAt(0)) % 4;
  return color;
}

function displayCaption(node: GraphNode): string {
  const caption = nodeCaption(node);
  const characters = Array.from(captionSegments.segment(caption), (entry) => entry.segment);
  return characters.length > 30 ? characters.slice(0, 29).join("") + "…" : caption;
}

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  event.stopPropagation();
  action();
}

function nodeKey(event: KeyboardEvent<SVGGElement>, id: string, controls: GraphNodesProps) {
  if (controls.disabled || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === "Enter" && event.shiftKey && controls.onToggleExpand !== undefined) {
    event.preventDefault();
    event.stopPropagation();
    controls.onToggleExpand(id, true);
    return;
  }
  const step = arrowStep(event.key);
  if (step === null) {
    activate(event, () => {
      controls.onSelect(id, true);
    });
  } else {
    event.preventDefault();
    event.stopPropagation();
    controls.onMove(id, step);
  }
}

function GraphNodeItem({
  node,
  point,
  controls
}: {
  node: GraphNode;
  point: Point;
  controls: GraphNodesProps;
}) {
  const { t } = useTranslation();
  const { selected, disabled, expanded, expandingIds, pinned, onSelect, onToggleExpand } = controls;
  const caption = nodeCaption(node);
  const title =
    caption + " · " + node.id + (onToggleExpand === undefined ? "" : "\n" + t("graph.nodeHint"));
  return (
    <g
      className={"graph-node" + (selected === node.id ? " is-selected" : "")}
      data-graph-id={node.id}
      data-node-id={node.id}
      data-pinned={pinned.has(node.id)}
      transform={`translate(${String(point.x)} ${String(point.y)})`}
      style={
        { "--graph-node-color": `var(--graph-node-${String(nodeColor(node))})` } as CSSProperties
      }
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-pressed={selected === node.id}
      aria-expanded={onToggleExpand === undefined ? undefined : expanded.has(node.id)}
      aria-busy={expandingIds.has(node.id)}
      aria-label={t("graph.node", { name: caption, id: node.id })}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onSelect(node.id, false);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        if (!disabled) onToggleExpand?.(node.id, false);
      }}
      onKeyDown={(event) => {
        nodeKey(event, node.id, controls);
      }}
    >
      <title>{title}</title>
      <circle className="graph-node-target" r="22" />
      <circle className="graph-node-halo" r="17" />
      <circle className="graph-node-ring" r="16" />
      <circle className="graph-node-dot" r="12" />
      {expandingIds.has(node.id) && <circle className="graph-node-busy" r="19" />}
      {expanded.has(node.id) && (
        <circle className="graph-node-expanded-mark" cx="13" cy="-13" r="3" />
      )}
      {pinned.has(node.id) && <circle className="graph-node-pin-mark" cx="-14" cy="-13" r="2.5" />}
      <text className="graph-node-label" textAnchor="middle" y="32">
        {displayCaption(node)}
      </text>
    </g>
  );
}

export function GraphNodes(props: GraphNodesProps) {
  return props.data.nodes.map((node) => {
    const point = props.positions.get(node.id);
    return point === undefined ? null : (
      <GraphNodeItem key={node.id} node={node} point={point} controls={props} />
    );
  });
}

export function GraphEdges({
  data,
  positions,
  selected,
  disabled,
  marker,
  onSelect
}: GraphItemsProps & {
  marker: string;
}) {
  const { t } = useTranslation();
  const paths = useMemo(() => relationshipPaths(data.relationships, positions), [data, positions]);
  return data.relationships.map((edge) => {
    const geometry = paths.get(edge.id);
    if (geometry === undefined) return null;
    const active = selected === edge.id || selected === edge.start || selected === edge.end;
    return (
      <g
        key={edge.id}
        className={"graph-relationship" + (active ? " is-highlighted" : "")}
        data-graph-id={edge.id}
        data-relationship-id={edge.id}
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        aria-pressed={selected === edge.id}
        aria-label={t("graph.relationship", { name: edge.type, id: edge.id })}
        onClick={(event) => {
          event.stopPropagation();
          if (!disabled) onSelect(edge.id, false);
        }}
        onKeyDown={(event) => {
          if (!disabled)
            activate(event, () => {
              onSelect(edge.id, true);
            });
        }}
      >
        <title>{edge.type + " · " + edge.id}</title>
        <path className="graph-edge-target" d={geometry.path} />
        <path
          className="graph-edge"
          d={geometry.path}
          markerEnd={`url(#${marker}${active ? "-selected" : ""})`}
        />
        {selected === edge.id && (
          <text
            className="graph-edge-label"
            textAnchor="middle"
            x={geometry.label.x}
            y={geometry.label.y - 7}
          >
            {edge.type}
          </text>
        )}
      </g>
    );
  });
}

export function ArrowMarkers({ id }: { id: string }) {
  return (
    <defs>
      {["", "-selected"].map((suffix) => (
        <marker
          key={suffix}
          id={id + suffix}
          viewBox="0 0 8 8"
          markerWidth="7"
          markerHeight="7"
          refX="7"
          refY="4"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            className={suffix === "" ? "graph-arrow" : "graph-arrow-selected"}
            d="M0 0L8 4L0 8Z"
          />
        </marker>
      ))}
    </defs>
  );
}

export function GraphControls({
  camera,
  disabled,
  onZoom,
  onReset,
  onFit,
  onRelayout
}: {
  camera: Camera;
  disabled: boolean;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onFit: () => void;
  onRelayout: () => void;
}) {
  const { t } = useTranslation();
  const controls = [
    {
      key: "zoomOut",
      label: "−",
      blocked: camera.scale <= 0.05,
      action: () => {
        onZoom(1 / 1.2);
      }
    },
    {
      key: "zoomReset",
      label: String(Math.round(camera.scale * 100)) + "%",
      blocked: false,
      action: onReset
    },
    {
      key: "zoomIn",
      label: "+",
      blocked: camera.scale >= 3,
      action: () => {
        onZoom(1.2);
      }
    }
  ];
  return (
    <div className="graph-canvas-controls">
      <div className="graph-zoom-controls">
        {controls.map((control) => (
          <Button
            key={control.key}
            variant="ghost"
            className={
              control.key === "zoomReset" ? "graph-canvas-percentage" : "graph-canvas-button"
            }
            aria-label={t("graph." + control.key)}
            title={t("graph." + control.key)}
            disabled={disabled || control.blocked}
            onClick={control.action}
          >
            {control.label}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        className="graph-canvas-button graph-fit-button"
        aria-label={t("graph.fit")}
        title={t("graph.fit")}
        disabled={disabled}
        onClick={onFit}
      >
        <Icon name="fit" />
      </Button>
      <Button
        variant="ghost"
        className="graph-canvas-button graph-relayout-button"
        aria-label={t("graph.relayout")}
        title={t("graph.relayout")}
        disabled={disabled}
        onClick={onRelayout}
      >
        <Icon name="graph" />
      </Button>
    </div>
  );
}
