import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { type Context } from "./context.js";
import { numberField, shorten } from "./json.js";
import { type Records } from "./records.js";
import { type DagNode, type VersionHistory } from "./version-history.js";

const laneColors = ["#0066ff", "#8548cf", "#00887b", "#a66b00", "#b42318"];

function historyMatches(node: DagNode, filter: string) {
  return `${node.item.state} ${node.item.message ?? ""} ${node.item.author ?? ""}`
    .toLocaleLowerCase()
    .includes(filter.toLocaleLowerCase());
}

export function StateLabels({
  context,
  state,
  compact = false
}: {
  context: Context;
  state: string;
  compact?: boolean;
}) {
  return (
    <span
      className="state-labels"
      style={compact ? { gridColumn: "1/-1", gridRow: 2, maxHeight: 22, overflow: "hidden" } : {}}
    >
      {context.branches
        .filter((ref) => ref.state === state)
        .map((ref) => (
          <span className="ref-chip branch" key={`branch/${ref.name}`}>
            branch/{ref.name}
          </span>
        ))}
      {context.tags
        .filter((ref) => ref.state === state)
        .map((ref) => (
          <span className="ref-chip tag" key={`tag/${ref.name}`}>
            tag/{ref.name}
          </span>
        ))}
    </span>
  );
}

function timelineNodeStyle(node: DagNode, expanded: boolean, matches: boolean): CSSProperties {
  return {
    position: "absolute",
    top: node.row * (expanded ? 144 : 104),
    left: expanded ? node.lane * 240 + 8 : 0,
    width: expanded ? 222 : "100%",
    height: expanded ? 128 : 96,
    minHeight: 0,
    overflow: "hidden",
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) auto",
    gridTemplateRows: "minmax(44px,1fr) 22px 18px",
    gap: "2px 4px",
    borderLeft: `3px solid ${laneColors[node.lane % laneColors.length] ?? "#0066ff"}`,
    opacity: matches ? 1 : 0.45
  };
}

function DagEdges({
  nodes,
  all,
  rowHeight,
  start,
  end
}: {
  nodes: DagNode[];
  all: DagNode[];
  rowHeight: number;
  start: number;
  end: number;
}) {
  const positions = new Map(all.map((node) => [node.item.state, node.row]));
  const lower = start * rowHeight;
  const upper = end * rowHeight;
  return (
    <svg
      className="dag-edges"
      aria-hidden="true"
      style={{
        position: "absolute",
        top: lower,
        left: 0,
        width: "100%",
        height: upper - lower,
        overflow: "hidden",
        pointerEvents: "none"
      }}
    >
      <defs>
        <marker
          id="version-parent-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0066ff" />
        </marker>
      </defs>
      {nodes.flatMap((node) =>
        node.parents.map((parent) => {
          const targetRow = positions.get(parent.state);
          const fromY = node.row * rowHeight + 40;
          const toY =
            targetRow === undefined ? (node.row + 0.8) * rowHeight : targetRow * rowHeight + 40;
          return (
            <path
              key={`${node.item.state}/${parent.state}`}
              d={`M ${String(node.lane * 240 + 4)} ${String(fromY - lower)} C ${String(node.lane * 240 + 4)} ${String((fromY + toY) / 2 - lower)}, ${String(parent.lane * 240 + 4)} ${String((fromY + toY) / 2 - lower)}, ${String(parent.lane * 240 + 4)} ${String(toY - lower)}`}
              stroke={laneColors[node.lane % laneColors.length]}
              strokeWidth="2"
              markerEnd="url(#version-parent-arrow)"
              strokeDasharray={targetRow === undefined ? "4 4" : undefined}
              fill="none"
            />
          );
        })
      )}
    </svg>
  );
}

function TimelineNode({
  node,
  context,
  expanded,
  selected,
  matches,
  onDetails
}: {
  node: DagNode;
  context: Context;
  expanded: boolean;
  selected: boolean;
  matches: boolean;
  onDetails: (state: string) => void;
}) {
  const color = laneColors[node.lane % laneColors.length];
  return (
    <article
      className={`version-node ${selected ? "selected" : ""} ${matches ? "" : "filtered-node"}`}
      style={timelineNodeStyle(node, expanded, matches)}
    >
      <button
        className="state-select"
        aria-pressed={selected}
        title={`${node.item.state}\n${node.item.message ?? "无提交说明"}`}
        style={{ gridColumn: 1, gridRow: 1, overflow: "hidden" }}
        onClick={() => {
          void context.select(node.item.state);
        }}
      >
        <span className="topology-dot" style={{ color }}>
          ●
        </span>{" "}
        <code>{shorten(node.item.state)}</code>
        {selected && <span> · 当前浏览</span>}
        <strong style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {node.item.message ?? "无提交说明"}
        </strong>
      </button>
      <StateLabels context={context} state={node.item.state} compact />
      <small
        style={{
          gridColumn: "1/-1",
          gridRow: 3,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis"
        }}
      >
        {new Date(node.item.committedAt / 1000).toLocaleString()} ·{" "}
        {node.item.author ?? "未提供作者"}
        {expanded && ` · ${String(node.item.parents.length)} parents`}
      </small>
      <button
        className="state-details"
        style={{ gridColumn: 2, gridRow: 1 }}
        onClick={() => {
          onDetails(node.item.state);
        }}
      >
        详情
      </button>
    </article>
  );
}

export function VersionTimeline({
  history,
  context,
  filter,
  expanded = false,
  onDetails,
  records
}: {
  history: VersionHistory;
  context: Context;
  filter: string;
  expanded?: boolean;
  onDetails: (state: string) => void;
  records?: Records | undefined;
}) {
  const { ref, setScroll, rowHeight, compact, nodes, start, end, visible, maxLane, edgeNodes } =
    useTimelineWindow(history, context, filter, expanded);
  useVersionListPosition({ records, history, expanded, ref, setScroll, count: nodes.length });
  return (
    <>
      <div
        ref={ref}
        className={`version-timeline ${expanded ? "expanded" : ""}`}
        aria-label={expanded ? "State ancestry DAG" : "版本提交列表"}
        onScroll={(event) => {
          setScroll(event.currentTarget.scrollTop);
          if (!expanded) {
            const layout = records?.slots.find((slot) => slot.kind === "workspace");
            layout?.edit({
              ...layout.data,
              versionListScroll: event.currentTarget.scrollTop,
              versionRoot: history.root
            });
          }
        }}
        style={{
          position: "relative",
          overflow: "auto",
          height: expanded ? "min(65vh, 680px)" : "min(58vh, 580px)"
        }}
      >
        <div
          style={{
            position: "relative",
            height: nodes.length * rowHeight + 48,
            width: expanded ? Math.max(460, (maxLane + 1) * 240) : "100%"
          }}
        >
          {expanded && (
            <DagEdges
              nodes={edgeNodes}
              all={history.nodes}
              rowHeight={rowHeight}
              start={start}
              end={end}
            />
          )}
          {visible.map((node) => (
            <TimelineNode
              key={node.item.state}
              node={node}
              context={context}
              expanded={expanded}
              selected={context.state === node.item.state}
              matches={historyMatches(node, filter)}
              onDetails={onDetails}
            />
          ))}
        </div>
      </div>
      <TimelineFooter
        history={history}
        filter={filter}
        expanded={expanded}
        visible={visible}
        matches={compact.length}
        empty={nodes.length === 0}
      />
    </>
  );
}

function useVersionListPosition({
  records,
  history,
  expanded,
  ref,
  setScroll,
  count
}: {
  records: Records | undefined;
  history: VersionHistory;
  expanded: boolean;
  ref: React.RefObject<HTMLDivElement | null>;
  setScroll: (value: number) => void;
  count: number;
}) {
  useSyncExternalStore(
    records?.subscribe ?? (() => () => undefined),
    records?.snapshot ?? (() => 0)
  );
  const restored = useRef(false);
  const layout = records?.slots.find((slot) => slot.kind === "workspace");
  useEffect(() => {
    if (expanded || restored.current || count === 0 || ref.current === null || layout === undefined)
      return;
    const scroll = numberField(layout.data, "versionListScroll");
    if (scroll > count * 104 && history.cursor !== undefined) return;
    ref.current.scrollTop = scroll;
    setScroll(ref.current.scrollTop);
    restored.current = true;
  }, [expanded, count, layout, ref, setScroll, history.cursor]);
}

function TimelineFooter({
  history,
  filter,
  expanded,
  visible,
  matches,
  empty
}: {
  history: VersionHistory;
  filter: string;
  expanded: boolean;
  visible: DagNode[];
  matches: number;
  empty: boolean;
}) {
  return (
    <>
      {filter !== "" && <p>{matches} 条已加载匹配；DAG 保留真实 parent 连接，淡化不匹配节点。</p>}
      {empty && <p>{filter === "" ? "尚未加载版本" : "已加载范围内没有匹配"}</p>}
      {expanded && <p>箭头方向：较新 State → parent。虚线表示尚未加载的 parent。</p>}
      {expanded &&
        visible.flatMap((node) =>
          node.parents
            .filter((parent) => !history.items.some((item) => item.state === parent.state))
            .map((parent) => (
              <button
                key={`${node.item.state}/${parent.state}`}
                onClick={() => {
                  void history.more();
                }}
                disabled={history.busy || history.cursor === undefined}
              >
                继续加载 parent {shorten(parent.state)}
              </button>
            ))
        )}
      {history.error !== "" && <p role="alert">{history.error}</p>}
      <button
        disabled={history.busy || history.cursor === undefined || history.limited}
        onClick={() => {
          void history.more();
        }}
      >
        {history.busy ? "正在读取" : "加载更多版本"}
      </button>
      <small>
        已加载 {history.items.length} 条
        {history.limited ? " · 本视图达到 4000 条范围，请选择其他 root" : ""}
      </small>
    </>
  );
}

function useTimelineWindow(
  history: VersionHistory,
  context: Context,
  filter: string,
  expanded: boolean
) {
  useSyncExternalStore(history.subscribe, history.snapshot);
  useSyncExternalStore(context.subscribe, context.snapshot);
  const ref = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState(0);
  const rowHeight = expanded ? 144 : 104;
  const compact = history.nodes
    .filter((node) => historyMatches(node, filter))
    .map((node, row) => ({ ...node, row }));
  const nodes = expanded ? history.nodes : compact;
  const start = Math.max(0, Math.floor(scroll / rowHeight) - 3);
  const end = Math.min(nodes.length, start + 16);
  const visible = nodes.slice(start, end);
  const maxLane = Math.max(0, ...history.nodes.map((node) => node.lane));
  useEffect(() => {
    if (!expanded) return;
    const row = history.nodes.findIndex((node) => node.item.state === context.state);
    if (ref.current !== null && row >= 0) {
      ref.current.scrollTop = Math.max(0, row * rowHeight - rowHeight);
      setScroll(ref.current.scrollTop);
    }
  }, [expanded, history, rowHeight, context.state]);
  const positions = new Map(history.nodes.map((node) => [node.item.state, node.row]));
  const edgeNodes = history.nodes.filter(
    (node) =>
      node.row < end &&
      node.parents.some((parent) => (positions.get(parent.state) ?? node.row + 1) >= start)
  );
  return { ref, setScroll, rowHeight, compact, nodes, start, end, visible, maxLane, edgeNodes };
}
