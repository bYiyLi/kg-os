import { useMemo } from "react";
import type { ObservabilityRequest, ObservabilitySpan } from "@kgos/sdk";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  SquareStack,
  TriangleAlert
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/ui/button.js";
import { timeLabel } from "./observability-charts.js";

function statusColor(outcome: string): string {
  if (["succeeded", "committed", "applied"].includes(outcome)) return "ok";
  if (["error", "failed", "rejected"].includes(outcome)) return "error";
  return "unknown";
}

function OutcomeBadge({ outcome }: { outcome: string }) {
  const { t } = useTranslation();
  const state = statusColor(outcome);
  let statusText = t("observability.incomplete");
  if (state === "ok") statusText = t("observability.success");
  if (state === "error") statusText = t("observability.errors");
  return (
    <span className={"obs-outcome is-" + state} title={outcome}>
      {state === "ok" && <CheckCircle2 size={12} />}
      {state === "error" && <TriangleAlert size={12} />}
      {state === "unknown" && <CircleHelp size={12} />}
      {statusText}
    </span>
  );
}

function duration(value?: number): string {
  if (value === undefined) return "—";
  if (value >= 1000) return (value / 1000).toFixed(2) + " s";
  return String(value) + " ms";
}

function ExpandButton({ expanded, onClick }: { expanded: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      type="button"
      aria-label={t("observability.expand")}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {expanded ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
    </Button>
  );
}

export interface StageNode {
  span: ObservabilitySpan;
  depth: number;
  parent: string;
}

export interface SpanTimelineWindow {
  start: number;
  end: number;
}

function recordedEnd(
  started: number,
  finishedAt: string | undefined,
  durationMs: number | undefined
): number | null {
  if (!Number.isFinite(started)) return null;
  if (finishedAt !== undefined) {
    const finished = Date.parse(finishedAt);
    if (Number.isFinite(finished) && finished >= started) return finished;
  }
  if (durationMs !== undefined && Number.isFinite(durationMs)) {
    return started + Math.max(0, durationMs);
  }
  return null;
}

// Derive a common, immutable time axis from recorded timestamps only.
// An unfinished span without a duration must not acquire an invented end time.
export function spanTimelineWindow(
  request: ObservabilityRequest,
  spans: ObservabilitySpan[]
): SpanTimelineWindow | null {
  const requestStart = Date.parse(request.started_at);
  if (!Number.isFinite(requestStart)) return null;
  let start = requestStart;
  let end = recordedEnd(requestStart, request.finished_at, request.duration_ms) ?? requestStart;
  for (const span of spans) {
    const when = Date.parse(span.started_at);
    if (!Number.isFinite(when)) continue;
    start = Math.min(start, when);
    end = Math.max(end, recordedEnd(when, span.finished_at, span.duration_ms) ?? when);
  }
  return end > start ? { start, end } : null;
}

function StageTimeline({
  span,
  window
}: {
  span: ObservabilitySpan;
  window: SpanTimelineWindow | null;
}) {
  const { t } = useTranslation();
  const started = Date.parse(span.started_at);
  const finished = recordedEnd(started, span.finished_at, span.duration_ms);
  const recordedDuration = finished === null ? null : finished - started;
  if (window === null || !Number.isFinite(started)) {
    return (
      <span className="obs-waterfall-unknown" title={t("observability.traceUnavailable")}>
        —
      </span>
    );
  }
  const total = window.end - window.start;
  const offset = Math.max(0, Math.min(100, ((started - window.start) / total) * 100));
  const width =
    recordedDuration === null
      ? 0
      : Math.max(1, Math.min(100 - offset, (recordedDuration / total) * 100));
  const description =
    recordedDuration === null
      ? t("observability.traceUnavailable")
      : `+${String(Math.round(started - window.start))} ms · ${duration(recordedDuration)}`;
  return (
    <span
      className="obs-waterfall-track"
      role="img"
      aria-label={`${t("observability.traceTimeline")}: ${description}`}
      title={description}
    >
      {recordedDuration === null ? (
        <span className="obs-waterfall-pending" style={{ left: `${String(offset)}%` }} />
      ) : (
        <span
          className={
            "obs-waterfall-bar" + (statusColor(span.outcome) === "error" ? " is-error" : "")
          }
          style={{ left: `${String(offset)}%`, width: `${String(width)}%` }}
        />
      )}
    </span>
  );
}
export function treeNodes(spans: ObservabilitySpan[]): StageNode[] {
  const ids = new Set(spans.map((x) => x.span_id));
  const children = new Map<string, ObservabilitySpan[]>();
  for (const span of spans) {
    const key = span.parent_span_id ?? "";
    const parent = ids.has(key) ? key : "";
    const list = children.get(parent) ?? [];
    list.push(span);
    children.set(parent, list);
  }
  const done = new Set<string>();
  const nodes: StageNode[] = [];
  function visit(parent: string, depth: number) {
    if (depth >= 16) return;
    for (const span of children.get(parent) ?? []) {
      if (done.has(span.span_id)) continue;
      done.add(span.span_id);
      nodes.push({ span, parent, depth });
      visit(span.span_id, depth + 1);
    }
  }
  visit("", 0);
  return nodes;
}

export function RequestRow({
  item,
  selected,
  expanded,
  onExpand,
  onSelect
}: {
  item: ObservabilityRequest;
  selected: boolean;
  expanded: boolean;
  onExpand: () => void;
  onSelect: () => void;
}) {
  const task = item.tool !== undefined && item.tool !== "" ? item.tool : item.route;
  const surface = item.surface !== "" ? item.surface : item.route;
  const summary =
    item.error_code !== undefined && item.error_code !== ""
      ? item.error_code
      : item.method + " · " + surface;
  return (
    <div
      className={"obs-tree-row obs-request-row" + (selected ? " is-selected" : "")}
      role="treeitem"
      aria-selected={selected}
      aria-expanded={expanded}
    >
      <div className="obs-tree-time">
        <ExpandButton expanded={expanded} onClick={onExpand} />
        <time dateTime={item.started_at}>{timeLabel(item.started_at)}</time>
      </div>
      <button type="button" className="obs-tree-id" title={item.request_id} onClick={onSelect}>
        {item.request_id.slice(0, 12)}…
      </button>
      <button type="button" className="obs-tree-label" onClick={onSelect}>
        <SquareStack size={14} aria-hidden="true" />
        <strong>{task}</strong>
      </button>
      <OutcomeBadge outcome={item.outcome} />
      <span className="obs-tree-duration">{duration(item.duration_ms)}</span>
      <span className="obs-tree-summary" title={summary}>
        {summary}
      </span>
    </div>
  );
}

function StageRow({
  node,
  selected,
  expanded,
  hasChildren,
  timeline,
  onExpand,
  onSelect
}: {
  node: StageNode;
  selected: boolean;
  expanded: boolean;
  hasChildren: boolean;
  timeline: SpanTimelineWindow | null;
  onExpand: () => void;
  onSelect: () => void;
}) {
  const span = node.span;
  return (
    <div
      className={"obs-tree-row obs-span-row" + (selected ? " is-selected" : "")}
      role="treeitem"
      aria-level={Math.min(node.depth + 2, 16)}
      aria-selected={selected}
      {...(hasChildren ? { "aria-expanded": expanded } : {})}
    >
      <span className="obs-tree-time">
        {hasChildren ? (
          <ExpandButton expanded={expanded} onClick={onExpand} />
        ) : (
          <span className="obs-tree-leaf" aria-hidden="true" />
        )}
      </span>
      <span className="obs-tree-id" title={span.span_id}>
        {span.operation_id !== undefined && span.operation_id !== ""
          ? span.operation_id.slice(0, 10)
          : span.span_id.slice(0, 8)}
        …
      </span>
      <button
        type="button"
        className="obs-tree-label obs-stage-label"
        style={{ paddingLeft: Math.min(node.depth, 8) * 14 + 12 }}
        onClick={onSelect}
      >
        <span className="obs-tree-branch" aria-hidden="true">
          └─
        </span>
        <strong>{span.name}</strong>
      </button>
      <OutcomeBadge outcome={span.outcome} />
      <span className="obs-tree-duration">{duration(span.duration_ms)}</span>
      <span
        className="obs-tree-summary obs-waterfall-cell"
        title={span.operation_id ?? span.span_id}
      >
        <StageTimeline span={span} window={timeline} />
      </span>
    </div>
  );
}

export function VisibleStages({
  nodes,
  timeline,
  expanded,
  selected,
  onExpand,
  onSelect
}: {
  nodes: StageNode[];
  timeline: SpanTimelineWindow | null;
  expanded: ReadonlySet<string>;
  selected: string | null;
  onExpand: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const parents = useMemo(() => new Map(nodes.map((x) => [x.span.span_id, x.parent])), [nodes]);
  const parentsWithChildren = useMemo(
    () => new Set(nodes.map((x) => x.parent).filter((id) => id !== "")),
    [nodes]
  );
  const visible = (node: StageNode) => {
    let parent = node.parent;
    while (parent !== "") {
      if (!expanded.has(parent)) return false;
      parent = parents.get(parent) ?? "";
    }
    return true;
  };
  return (
    <>
      {nodes.filter(visible).map((node) => (
        <StageRow
          key={node.span.span_id}
          node={node}
          selected={selected === node.span.span_id}
          timeline={timeline}
          expanded={expanded.has(node.span.span_id)}
          hasChildren={parentsWithChildren.has(node.span.span_id)}
          onExpand={() => {
            onExpand(node.span.span_id);
          }}
          onSelect={() => {
            onSelect(node.span.span_id);
          }}
        />
      ))}
    </>
  );
}
