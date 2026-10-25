import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "../../shared/ui/dialog.js";
import { Icon } from "../../shared/ui/icon.js";
import { commitTitle } from "./version-presentation.js";
import { layoutVersionTopology } from "./version-topology.js";
import type {
  VersionTopology,
  VersionTopologyEdge,
  VersionTopologyNode
} from "./version-topology.js";
import type { VersionHistory } from "./use-version-history.js";
import "./version-dag.css";

const ROW_HEIGHT = 72;
const LANE_WIDTH = 28;
const GRAPH_PADDING = 22;
const OVERSCAN = 4;

function edgePath(edge: VersionTopologyEdge, offset: number): string {
  const x1 = GRAPH_PADDING + edge.child.lane * LANE_WIDTH;
  const y1 = edge.child.row * ROW_HEIGHT + ROW_HEIGHT / 2 - offset + 7;
  const x2 = GRAPH_PADDING + edge.parent.lane * LANE_WIDTH;
  const y2 = edge.parent.row * ROW_HEIGHT + ROW_HEIGHT / 2 - offset - 8;
  const middle = (y1 + y2) / 2;
  return `M${String(x1)} ${String(y1)} C${String(x1)} ${String(middle)},${String(x2)} ${String(middle)},${String(x2)} ${String(y2)}`;
}

function TopologyRow({
  node,
  history,
  graphWidth
}: {
  node: VersionTopologyNode;
  history: VersionHistory;
  graphWidth: number;
}) {
  const { t } = useTranslation();
  const selected =
    history.currentWorld === history.expandedWorld && history.selectedCommit === node.state;
  const content = (
    <>
      <span className="version-dag-row-title">
        {node.commit === null
          ? t("versions.unloadedParent")
          : commitTitle(node.commit.message, t("versions.noMessage"))}
      </span>
      <span className="version-dag-row-meta">
        <code title={node.state}>{node.state.slice(7, 14)}</code>
        {node.commit !== null && node.state === history.expandedHead && (
          <span className="version-dag-badge">{t("versions.latest")}</span>
        )}
        {node.commit !== null && selected && (
          <span className="version-dag-badge">{t("versions.currentBrowsing")}</span>
        )}
      </span>
      {node.commit !== null && node.commit.parents.length > 0 && (
        <span className="sr-only">
          {t("versions.parentLegend")}: {node.commit.parents.join(", ")}
        </span>
      )}
    </>
  );
  return (
    <div
      role="listitem"
      className="version-dag-item"
      data-version-state={node.state}
      data-loaded={String(node.commit !== null)}
      style={{ top: node.row * ROW_HEIGHT }}
    >
      {node.commit === null ? (
        <div className="version-dag-row is-unloaded" style={{ paddingLeft: graphWidth }}>
          {content}
        </div>
      ) : (
        <Button
          variant="ghost"
          className="version-dag-row"
          style={{ paddingLeft: graphWidth }}
          type="button"
          aria-pressed={selected}
          aria-busy={
            history.switchingWorld === history.expandedWorld &&
            history.selectingCommit === node.state
          }
          title={node.commit.message ?? node.state}
          onClick={() => {
            if (history.expandedWorld !== null)
              history.selectWorldCommit(history.expandedWorld, node.state);
          }}
        >
          {content}
        </Button>
      )}
    </div>
  );
}

function TopologyLines({
  topology,
  first,
  last,
  graphWidth,
  selected
}: {
  topology: VersionTopology;
  first: number;
  last: number;
  graphWidth: number;
  selected: string | null;
}) {
  const marker = useId().replaceAll(":", "");
  const offset = first * ROW_HEIGHT;
  const edges = topology.edges.filter((edge) => edge.child.row < last && edge.parent.row >= first);
  return (
    <svg
      className="version-dag-lines"
      width={graphWidth}
      height={(last - first) * ROW_HEIGHT}
      style={{ top: offset }}
      aria-hidden="true"
    >
      <defs>
        <marker id={marker} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path className="version-dag-arrow" d="M0 0L6 3L0 6Z" />
        </marker>
      </defs>
      {edges.map((edge) => (
        <path
          key={`${edge.child.state}/${edge.parent.state}`}
          className="version-dag-edge"
          data-child={edge.child.state}
          data-parent={edge.parent.state}
          d={edgePath(edge, offset)}
          markerEnd={`url(#${marker})`}
        />
      ))}
      {topology.nodes.slice(first, last).map((node) => (
        <circle
          key={node.state}
          className={
            "version-dag-node" +
            (node.commit === null ? " is-unloaded" : "") +
            (selected === node.state ? " is-selected" : "")
          }
          cx={GRAPH_PADDING + node.lane * LANE_WIDTH}
          cy={node.row * ROW_HEIGHT + ROW_HEIGHT / 2 - offset}
          r="5"
        />
      ))}
    </svg>
  );
}

function TopologyViewport({
  topology,
  history
}: {
  topology: VersionTopology;
  history: VersionHistory;
}) {
  const { t } = useTranslation();
  const viewportRef = useRef<HTMLDivElement>(null);
  const located = useRef<{ state: string; world: string | null } | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 360 });
  const graphWidth = Math.max(80, topology.laneCount * LANE_WIDTH + GRAPH_PADDING * 2);
  const first = Math.max(0, Math.floor(viewport.top / ROW_HEIGHT) - OVERSCAN);
  const last = Math.min(
    topology.nodes.length,
    Math.ceil((viewport.top + viewport.height) / ROW_HEIGHT) + OVERSCAN
  );
  const visible = topology.nodes.slice(first, last);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (element === null) return;
    const update = () => {
      setViewport({ top: element.scrollTop, height: element.clientHeight || 360 });
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  useLayoutEffect(() => {
    const element = viewportRef.current;
    const target =
      history.currentWorld === history.expandedWorld
        ? history.selectedCommit
        : topology.nodes[0]?.state;
    const selected = topology.nodes.find((node) => node.state === target);
    if (element === null || selected === undefined) return;
    if (
      located.current?.state === selected.state &&
      located.current.world === history.expandedWorld
    )
      return;
    const height = element.clientHeight || 360;
    element.scrollTop = Math.max(0, selected.row * ROW_HEIGHT - (height - ROW_HEIGHT) / 2);
    located.current = { state: selected.state, world: history.expandedWorld };
    setViewport({ top: element.scrollTop, height });
  }, [history.currentWorld, history.expandedWorld, history.selectedCommit, topology.nodes]);

  return (
    <div
      className="version-dag-viewport"
      ref={viewportRef}
      tabIndex={0}
      aria-label={t("versions.relationsTitle")}
      onScroll={(event) => {
        const element = event.currentTarget;
        setViewport({ top: element.scrollTop, height: element.clientHeight || 360 });
      }}
    >
      <div
        className="version-dag-list"
        role="list"
        aria-label={t("versions.history")}
        style={{
          height: topology.nodes.length * ROW_HEIGHT,
          minWidth: graphWidth + 260
        }}
      >
        <TopologyLines
          topology={topology}
          first={first}
          last={last}
          graphWidth={graphWidth}
          selected={history.currentWorld === history.expandedWorld ? history.selectedCommit : null}
        />
        {visible.map((node) => (
          <TopologyRow key={node.state} node={node} history={history} graphWidth={graphWidth} />
        ))}
      </div>
    </div>
  );
}

export function VersionDag({
  open,
  onOpenChange,
  history,
  returnFocus
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  history: VersionHistory;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  const topology = useMemo(() => {
    if (history.expandedWorld === null) return null;
    try {
      return layoutVersionTopology(history.topologyCommits);
    } catch {
      return null;
    }
  }, [history.expandedWorld, history.topologyCommits]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="version-dag-dialog translate-x-0 translate-y-0"
        overlayClassName="version-dag-backdrop"
        initialFocus={closeRef}
        finalFocus={returnFocus}
      >
        <header className="version-dag-header">
          <div>
            <DialogTitle className="version-dag-title">{t("versions.relationsTitle")}</DialogTitle>
            <p className="version-dag-world" title={history.expandedWorld ?? undefined}>
              {history.expandedWorld}
            </p>
          </div>
          <Button
            ref={closeRef}
            variant="ghost"
            className="version-dag-close"
            type="button"
            aria-label={t("versions.closeRelations")}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            <Icon name="close" />
          </Button>
        </header>
        <DialogDescription className="version-dag-description">
          {t("versions.relationsDescription")}
        </DialogDescription>
        <p className="version-dag-legend">{t("versions.parentLegend")}</p>
        {history.expandedWorldMissing && (
          <p className="version-dag-message" role="status">
            {t("versions.worldMissing")}
          </p>
        )}
        {topology === null || topology.nodes.length === 0 ? (
          <p className="version-dag-message" role="status">
            {history.loading ? t("versions.loading") : t("versions.relationsUnavailable")}
          </p>
        ) : (
          <TopologyViewport topology={topology} history={history} />
        )}
        <footer className="version-dag-footer">
          <span>{t("versions.loadedVersions", { count: history.topologyCommits.length })}</span>
          {history.topologyHasMore && (
            <Button
              variant="ghost"
              type="button"
              disabled={history.loadingMore || history.loading}
              onClick={history.loadMoreWorld}
            >
              {history.loadingMore ? t("versions.loading") : t("versions.loadMore")}
            </Button>
          )}
        </footer>
        {(history.error || history.selectionError) && (
          <p className="version-dag-message" role="alert">
            {history.selectionError ? t("versions.selectFailed") : t("versions.loadFailed")}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
