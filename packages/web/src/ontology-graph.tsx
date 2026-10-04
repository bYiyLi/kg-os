import { useLayoutEffect, useRef } from "react";

import { KIND_LABELS } from "./edit-patch.js";
import { type OntologyBrowser } from "./ontology-controller.js";
import {
  ontologyProjection,
  type OntologyNode,
  type OntologyProjection
} from "./ontology-projection.js";

function useInitialOrigin(key: string, first: { x: number; y: number } | undefined) {
  const viewport = useRef<HTMLDivElement>(null);
  const initialized = useRef({ key: "", ready: false });
  useLayoutEffect(() => {
    if (initialized.current.key !== key) initialized.current = { key, ready: false };
    const element = viewport.current;
    if (initialized.current.ready || element === null || first === undefined) return;
    element.scrollLeft = Math.max(0, first.x - 20);
    element.scrollTop = Math.max(0, first.y - 20);
    initialized.current.ready = true;
  }, [key, first]);
  return viewport;
}

function GraphList({
  browser,
  projection
}: {
  browser: OntologyBrowser;
  projection: OntologyProjection;
}) {
  return (
    <ul className="ontology-card-list">
      {projection.nodes.map((node) => (
        <li key={node.summary.ref}>
          <button
            onClick={() => {
              void browser.inspect(node.summary.ref);
            }}
          >
            {node.summary.ref} · {node.summary.title ?? node.summary.name}
          </button>
          {node.summary.kind === "domain" && (
            <button
              disabled={browser.loading || node.expanded}
              onClick={() => {
                void browser.expand(node.summary.ref);
              }}
            >
              {node.expanded ? "直接成员已展开" : "展开直接成员"}
            </button>
          )}
          {node.summary.kind === "relationship-definition" && (
            <small>
              from {node.summary.from ?? "null · 此端不限制类型"} → to{" "}
              {node.summary.to ?? "null · 此端不限制类型"}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}

function GraphCard({
  node,
  selected,
  x,
  y,
  onSelect
}: {
  node: OntologyNode;
  selected: boolean;
  x: number;
  y: number;
  onSelect: (ref: string) => void;
}) {
  const item = node.summary;
  return (
    <g
      className={`ontology-node ${item.kind} ${selected ? "selected" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${KIND_LABELS[item.kind]} ${item.ref}${node.external ? " 域外或未加载端点" : ""}`}
      onClick={() => {
        onSelect(item.ref);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item.ref);
        }
      }}
      transform={`translate(${String(x)},${String(y)})`}
    >
      <rect width="210" height="82" rx={item.kind === "domain" ? 8 : 22} />
      <text x="14" y="25">
        {(item.title ?? item.name).slice(0, 24)}
      </text>
      <text x="14" y="46" className="graph-kind">
        {KIND_LABELS[item.kind]}
        {node.external ? " · 未加载范围" : ""}
      </text>
      <text x="14" y="65" className="graph-ref">
        {item.ref.slice(0, 28)}
      </text>
      <title>
        {item.ref} · {item.description ?? "未提供说明"}
      </title>
    </g>
  );
}

export function OntologyGraph({ browser }: { browser: OntologyBrowser }) {
  const projection = ontologyProjection(browser);
  const positions = new Map<string, { x: number; y: number }>();
  const columns = [0, 0, 0];
  for (const node of projection.nodes) {
    const column = nodeColumn(node);
    const row = columns[column] ?? 0;
    positions.set(node.summary.ref, { x: 20 + column * 250, y: 20 + row * 110 });
    columns[column] = row + 1;
  }
  const height = Math.max(160, Math.max(...columns) * 110 + 30);
  const first = projection.nodes[0];
  const viewport = useInitialOrigin(
    JSON.stringify([browser.state, browser.scope]),
    first === undefined ? undefined : positions.get(first.summary.ref)
  );
  return (
    <section className="ontology-graph" aria-label="Definition 与 Domain 组织图">
      <p className="graph-legend">
        实线：类型端点约束 · 虚线：Domain 直接成员组织 · 未加载范围保留准确 Ref
      </p>
      {projection.limited && <p className="warning">图显示达到有界预算；阅读范围未完整展开。</p>}
      <div className="ontology-canvas" ref={viewport}>
        <svg
          viewBox={`0 0 750 ${String(height)}`}
          role="group"
          aria-label={`已加载 ${String(projection.nodes.length)} 个模型 / 领域`}
          width="750"
          height={height}
        >
          <defs>
            <marker
              id="ontology-arrow"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6" />
            </marker>
          </defs>
          {projection.links.map((link, index) => {
            const from = positions.get(link.from);
            const to = positions.get(link.to);
            if (from === undefined || to === undefined) return null;
            return (
              <path
                key={index}
                className={`ontology-edge ${link.kind}`}
                markerEnd="url(#ontology-arrow)"
                d={edgePath(from, to)}
                fill="none"
              >
                <title>
                  {link.from} → {link.to} ·{" "}
                  {link.kind === "membership" ? "Domain 组织" : "类型端点约束"}
                </title>
              </path>
            );
          })}
          {projection.nodes.map((node) => {
            const position = positions.get(node.summary.ref);
            if (position === undefined) return null;
            return (
              <GraphCard
                key={node.summary.ref}
                node={node}
                selected={browser.selected === node.summary.ref}
                x={position.x}
                y={position.y}
                onSelect={(ref) => {
                  void browser.inspect(ref);
                }}
              />
            );
          })}
        </svg>
      </div>
      <GraphList browser={browser} projection={projection} />
    </section>
  );
}

function nodeColumn(node: OntologyNode): number {
  if (node.summary.kind === "node-definition") return 0;
  return node.summary.kind === "relationship-definition" ? 1 : 2;
}

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  return `M${String(from.x + 105)},${String(from.y + 82)} C${String(from.x + 105)},${String(from.y + 106)} ${String(to.x + 105)},${String(to.y - 20)} ${String(to.x + 105)},${String(to.y)}`;
}
