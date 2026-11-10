import { useMemo, useState } from "react";
import type {
  ObservabilityRequest,
  ObservabilityRequestGetResult,
  ObservabilityRequestListResult
} from "@kgos/sdk";
import { Expand, Filter, Minimize2, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/ui/button.js";
import {
  RequestRow,
  VisibleStages,
  spanTimelineWindow,
  treeNodes
} from "./observability-tree-rows.js";
import type { SpanTimelineWindow, StageNode } from "./observability-tree-rows.js";
import type { OutcomeFilter, RouteFilter } from "./observability-data.js";

export type Fullscreen = "requests" | "logs" | null;

export function FullscreenButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label={t("observability.fullscreen")}
      aria-pressed={active}
      onClick={onClick}
    >
      {active ? <Minimize2 aria-hidden="true" /> : <Expand aria-hidden="true" />}
    </Button>
  );
}

function RequestFilters({
  route,
  outcome,
  slow,
  onRoute,
  onOutcome,
  onSlow
}: {
  route: RouteFilter;
  outcome: OutcomeFilter;
  slow: boolean;
  onRoute: (route: RouteFilter) => void;
  onOutcome: (outcome: OutcomeFilter) => void;
  onSlow: (slow: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="obs-filter-popover">
      <label>
        {t("observability.route")}
        <select
          value={route}
          aria-label={t("observability.route")}
          onChange={(e) => {
            onRoute(e.target.value as RouteFilter);
          }}
        >
          <option value="">{t("observability.allRoutes")}</option>
          <option value="api">API</option>
          <option value="mcp">MCP</option>
          <option value="web_auth">Web</option>
          <option value="oauth">OAuth</option>
        </select>
      </label>
      <label>
        {t("observability.outcome")}
        <select
          value={outcome}
          aria-label={t("observability.outcome")}
          onChange={(e) => {
            onOutcome(e.target.value as OutcomeFilter);
          }}
        >
          <option value="">{t("observability.allOutcomes")}</option>
          <option value="succeeded">{t("observability.success")}</option>
          <option value="error">{t("observability.errors")}</option>
          <option value="incomplete">{t("observability.incomplete")}</option>
        </select>
      </label>
      <label className="obs-slow-filter">
        <input
          type="checkbox"
          checked={slow}
          onChange={(e) => {
            onSlow(e.target.checked);
          }}
        />
        {t("observability.slow")}
      </label>
    </div>
  );
}

interface RequestPanelHeaderProps {
  total?: number | undefined;
  loaded: number;
  search: string;
  onSearch: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  filters: React.ComponentProps<typeof RequestFilters>;
  fullscreen: boolean;
  onFullscreen: () => void;
}

function RequestPanelHeader({
  total,
  loaded,
  search,
  onSearch,
  showFilters,
  onToggleFilters,
  filters,
  fullscreen,
  onFullscreen
}: RequestPanelHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="obs-panel-head">
      <div className="obs-panel-title-group">
        <h2>{t("observability.requestTrace")}</h2>
        <span className="obs-count-pill">
          {t("observability.loadedRequests", { loaded, total: total ?? loaded })}
        </span>
      </div>
      <div className="obs-controls">
        <label className="obs-panel-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              onSearch(e.target.value);
            }}
            aria-label={t("observability.searchRequests")}
            placeholder={t("observability.searchRequests")}
          />
        </label>
        <div className="obs-filter-wrapper">
          <button
            type="button"
            aria-label={t("observability.filter")}
            aria-expanded={showFilters}
            className="obs-filter-toggle"
            onClick={() => {
              onToggleFilters();
            }}
          >
            <Filter size={15} />
          </button>
          {showFilters && <RequestFilters {...filters} />}
        </div>
        <FullscreenButton active={fullscreen} onClick={onFullscreen} />
      </div>
    </header>
  );
}

function LastPersistedStages({
  detail,
  requestID
}: {
  detail: ObservabilityRequestGetResult | null;
  requestID: string;
}) {
  const { t } = useTranslation();
  if (detail?.request.request_id !== requestID || detail.last_stages === undefined) return null;
  return (
    <>
      {detail.last_stages.map((stage) => (
        <div className="obs-last-stage" key={stage.operation_id}>
          <span>{t("observability.lastRecordedStage")}: </span>
          <code title={stage.operation_id}>{stage.operation_id.slice(0, 11)}…</code>
          <strong>{stage.stage}</strong>
          <time dateTime={stage.observed_at}>{stage.observed_at}</time>
        </div>
      ))}
    </>
  );
}

interface RequestPanelBodyProps {
  requests: ObservabilityRequestListResult | null;
  detail: ObservabilityRequestGetResult | null;
  items: ObservabilityRequest[];
  selected: string | null;
  selectedSpan: string | null;
  nodes: StageNode[];
  timeline: SpanTimelineWindow | null;
  detailFailed: boolean;
  detailFailureRef?: string | null;
  expandedSpans: ReadonlySet<string>;
  isExpanded: (id: string) => boolean;
  toggleRequest: (id: string) => void;
  choose: (item: ObservabilityRequest) => void;
  toggleSpan: (id: string) => void;
  onSelectSpan: (id: string) => void;
}

function RequestPanelBody({
  requests,
  detail,
  items,
  selected,
  selectedSpan,
  nodes,
  timeline,
  detailFailed,
  detailFailureRef = null,
  expandedSpans,
  isExpanded,
  toggleRequest,
  choose,
  toggleSpan,
  onSelectSpan
}: RequestPanelBodyProps) {
  const { t } = useTranslation();
  return (
    <div className="obs-request-list" role="tree" aria-label={t("observability.recentRequests")}>
      <div className="obs-tree-head" aria-hidden="true">
        <span>{t("observability.columns.time")}</span>
        <span>Request ID</span>
        <span>{t("observability.columns.operation")}</span>
        <span>{t("observability.columns.result")}</span>
        <span>{t("observability.columns.duration")}</span>
        <span>{t("observability.columns.summary")}</span>
      </div>
      {detailFailed && selected !== null && (
        <p className="obs-alert" role="status">
          {t("observability.requestDetailFailed")}
          {detailFailureRef !== null && <code>{detailFailureRef}</code>}
        </p>
      )}
      {requests?.availability === "unavailable" && (
        <p className="obs-empty" role="status">
          {t("observability.unavailable")}
        </p>
      )}
      {requests?.availability === "available" && items.length === 0 && (
        <p className="obs-empty">{t("observability.noRequests")}</p>
      )}
      {(requests?.coverage.truncated === true || detail?.coverage.truncated === true) && (
        <p className="obs-alert" role="status">
          {t("observability.truncated")}
        </p>
      )}
      {items.map((item) => (
        <div
          key={item.request_id}
          role="group"
          className={
            "obs-tree-group" +
            (selected === item.request_id && isExpanded(item.request_id) ? " is-expanded" : "")
          }
        >
          <RequestRow
            item={item}
            selected={selected === item.request_id && selectedSpan === null}
            expanded={isExpanded(item.request_id)}
            onExpand={() => {
              toggleRequest(item.request_id);
            }}
            onSelect={() => {
              choose(item);
            }}
          />
          {selected === item.request_id && isExpanded(item.request_id) && (
            <>
              <LastPersistedStages detail={detail} requestID={item.request_id} />
              {detail !== null && nodes.length === 0 && !detailFailed && (
                <p className="obs-trace-empty">{t("observability.noStages")}</p>
              )}
              <VisibleStages
                nodes={nodes}
                timeline={timeline}
                expanded={expandedSpans}
                selected={selectedSpan}
                onExpand={toggleSpan}
                onSelect={onSelectSpan}
              />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

interface RequestTreePanelProps {
  requests: ObservabilityRequestListResult | null;
  detail: ObservabilityRequestGetResult | null;
  total?: number;
  selected: string | null;
  selectedSpan: string | null;
  detailFailed?: boolean;
  detailFailureRef?: string | null;
  onSelectRequest: (request: ObservabilityRequest) => void;
  onSelectSpan: (spanID: string) => void;
  filters: React.ComponentProps<typeof RequestFilters>;
  fullscreen: boolean;
  onFullscreen: () => void;
  paging: boolean;
  onMore: () => void;
}

function matchesLoadedRequest(item: ObservabilityRequest, query: string): boolean {
  if (query === "") return true;
  return [item.request_id, item.tool ?? "", item.route, item.method, item.error_code ?? ""].some(
    (value) => value.toLowerCase().includes(query)
  );
}

export function RequestTreePanel({
  requests,
  detail,
  total,
  selected,
  selectedSpan,
  detailFailed = false,
  detailFailureRef = null,
  onSelectRequest,
  onSelectSpan,
  filters,
  fullscreen,
  onFullscreen,
  paging,
  onMore
}: RequestTreePanelProps) {
  const { t } = useTranslation();
  const [expandedRequests, setExpandedRequests] = useState<Map<string, boolean>>(() => new Map());
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(() => new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState("");
  const nodes = useMemo(() => treeNodes(detail?.spans ?? []), [detail?.spans]);
  const timeline = useMemo(
    () => (detail === null ? null : spanTimelineWindow(detail.request, detail.spans)),
    [detail]
  );
  const items = useMemo(
    () =>
      (requests?.items ?? []).filter((x) => matchesLoadedRequest(x, search.trim().toLowerCase())),
    [requests?.items, search]
  );
  const isExpanded = (id: string) => expandedRequests.get(id) ?? selected === id;
  function toggleRequest(id: string) {
    setExpandedRequests((prev) => new Map(prev).set(id, !(prev.get(id) ?? selected === id)));
  }
  function choose(item: ObservabilityRequest) {
    onSelectRequest(item);
    setExpandedRequests((prev) => new Map(prev).set(item.request_id, true));
  }
  function toggleSpan(id: string) {
    setExpandedSpans((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <section className={"obs-panel obs-requests" + (fullscreen ? " obs-fullscreen" : "")}>
      <RequestPanelHeader
        total={total}
        loaded={requests?.items.length ?? 0}
        search={search}
        onSearch={setSearch}
        showFilters={showFilters}
        onToggleFilters={() => {
          setShowFilters(!showFilters);
        }}
        filters={filters}
        fullscreen={fullscreen}
        onFullscreen={onFullscreen}
      />
      <RequestPanelBody
        requests={requests}
        detail={detail}
        items={items}
        selected={selected}
        selectedSpan={selectedSpan}
        nodes={nodes}
        timeline={timeline}
        detailFailed={detailFailed}
        detailFailureRef={detailFailureRef}
        expandedSpans={expandedSpans}
        isExpanded={isExpanded}
        toggleRequest={toggleRequest}
        choose={choose}
        toggleSpan={toggleSpan}
        onSelectSpan={onSelectSpan}
      />
      {requests?.next_cursor !== undefined && (
        <Button variant="ghost" disabled={paging} onClick={onMore}>
          {t("observability.loadMore")}
        </Button>
      )}
    </section>
  );
}
