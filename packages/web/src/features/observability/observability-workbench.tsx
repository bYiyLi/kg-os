import { useCallback, useEffect, useRef, useState } from "react";
import type { KGOSClient, ObservabilityOverviewResult } from "@kgos/sdk";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { OverviewCharts } from "./observability-charts.js";
import { useObservabilityDetail, useObservabilitySummary } from "./observability-data.js";
import type { OutcomeFilter, Range, RouteFilter } from "./observability-data.js";
import { ExecutionLogPanel, RequestTreePanel } from "./observability-panels.js";
import type { Fullscreen } from "./observability-panels.js";
import { DashboardHeader, MetricCards } from "./observability-summary.js";
import { useObservabilityLogStream } from "./observability-log-stream.js";
import type { LogLevelFilter } from "./observability-log-stream.js";
import "./observability-workbench.css";

function DashboardStatus({
  loading,
  available,
  failed,
  failureRef,
  onRetry
}: {
  loading: boolean;
  available: boolean;
  failed: boolean;
  failureRef: string | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (available) return null;
  if (loading) {
    return (
      <p role="status" className="obs-dashboard-loading">
        {t("observability.loading")}
      </p>
    );
  }
  return (
    <div role={failed ? "alert" : "status"} className="obs-unavailable-state">
      <AlertTriangle size={15} aria-hidden="true" />
      <span>{t(failed ? "observability.failed" : "observability.unavailable")}</span>
      {failed && failureRef !== null && <code>{failureRef}</code>}
      <button type="button" onClick={onRetry} aria-label={t("observability.refresh")}>
        <RotateCcw size={14} aria-hidden="true" />
        {t("observability.refresh")}
      </button>
    </div>
  );
}

function StaleDiagnosticRef({ value }: { value: string | null }) {
  return value === null ? null : (
    <p className="obs-panel-warning" role="status">
      <code>{value}</code>
    </p>
  );
}

function overviewDataStatus(
  overview: ObservabilityOverviewResult | null,
  failed: boolean
): "stale" | "partial" | null {
  if (overview?.availability !== "available") return null;
  if (failed) return "stale";
  if (overview.coverage.truncated || overview.coverage.dropped > 0) return "partial";
  return null;
}

interface DetailPanelsProps {
  summary: ReturnType<typeof useObservabilitySummary>;
  details: ReturnType<typeof useObservabilityDetail>;
  allLogs: ReturnType<typeof useObservabilityLogStream>;
  logScope: "all" | "request";
  onLogScope: (scope: "all" | "request") => void;
  logLevel: LogLevelFilter;
  onLogLevel: (level: LogLevelFilter) => void;
  filters: React.ComponentProps<typeof RequestTreePanel>["filters"];
  fullscreen: Fullscreen;
  onFullscreen: (value: Fullscreen) => void;
}

// Maximization is scoped to the right workbench. Preserve narrow-screen
// scroll position when restoring the normal two-panel layout.
function useWorkbenchMaximize() {
  const [fullscreen, setFullscreen] = useState<Fullscreen>(null);
  const dashboardRef = useRef<HTMLDivElement | null>(null);
  const savedScrollTop = useRef<number | null>(null);
  const onFullscreen = useCallback((next: Fullscreen) => {
    const element = dashboardRef.current;
    if (next !== null && element !== null) {
      savedScrollTop.current ??= element.scrollTop;
      element.scrollTop = 0;
    }
    setFullscreen(next);
  }, []);
  useEffect(() => {
    if (fullscreen === null && savedScrollTop.current !== null) {
      if (dashboardRef.current !== null) dashboardRef.current.scrollTop = savedScrollTop.current;
      savedScrollTop.current = null;
    }
  }, [fullscreen]);
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onFullscreen(null);
    };
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("keydown", onEscape);
    };
  }, [onFullscreen]);
  return { fullscreen, onFullscreen, dashboardRef };
}

function DetailPanels({
  summary,
  details,
  allLogs,
  logScope,
  onLogScope,
  logLevel,
  onLogLevel,
  filters,
  fullscreen,
  onFullscreen
}: DetailPanelsProps) {
  return (
    <section className="obs-dual">
      <RequestTreePanel
        requests={summary.requests}
        total={summary.overview?.total ?? 0}
        detail={details.detail}
        selected={details.selected}
        selectedSpan={details.selectedSpan}
        onSelectRequest={(request) => {
          details.chooseRequest(request);
          onLogScope("request");
        }}
        filters={filters}
        onSelectSpan={(spanID) => {
          details.setSelectedSpan(spanID);
          onLogScope("request");
        }}
        detailFailed={details.failed}
        detailFailureRef={details.failureRef}
        fullscreen={fullscreen === "requests"}
        onFullscreen={() => {
          onFullscreen(fullscreen === "requests" ? null : "requests");
        }}
        paging={summary.paging}
        onMore={() => {
          void summary.moreRequests();
        }}
      />
      <ExecutionLogPanel
        detail={details.detail}
        globalLogs={allLogs.listing}
        scope={logScope}
        onShowAll={() => {
          onLogScope("all");
        }}
        level={logLevel}
        onLevel={onLogLevel}
        selected={details.selected}
        selectedSpan={details.selectedSpan}
        failed={logScope === "all" ? allLogs.failed : details.failed}
        failureRef={logScope === "all" ? allLogs.failureRef : details.failureRef}
        onStage={(spanID, requestID) => {
          if (requestID !== null) details.chooseRequest({ request_id: requestID });
          details.setSelectedSpan(spanID);
          onLogScope("request");
        }}
        fullscreen={fullscreen === "logs"}
        onFullscreen={() => {
          onFullscreen(fullscreen === "logs" ? null : "logs");
        }}
        paging={logScope === "all" ? allLogs.paging : details.paging || details.loading}
        onMore={() => {
          if (logScope === "all") void allLogs.moreLogs();
          else void details.moreLogs();
        }}
      />
    </section>
  );
}

export function ObservabilityWorkbench({ client }: { client: KGOSClient }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("24h");
  const [route, setRoute] = useState<RouteFilter>("");
  const [outcome, setOutcome] = useState<OutcomeFilter>("");
  const [slow, setSlow] = useState(false);
  const [revision, setRevision] = useState(0);
  const { fullscreen, onFullscreen, dashboardRef } = useWorkbenchMaximize();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [logScope, setLogScope] = useState<"all" | "request">("all");
  const [logLevel, setLogLevel] = useState<LogLevelFilter>("");

  const summary = useObservabilitySummary(
    client,
    { range, route, outcome, slow },
    revision,
    autoRefresh
  );
  const details = useObservabilityDetail(client, summary.requests, revision);
  const allLogs = useObservabilityLogStream(client, {
    range,
    level: logLevel,
    revision,
    autoRefresh
  });
  const available = summary.overview?.availability === "available";

  const filters = {
    route,
    outcome,
    slow,
    onRoute: setRoute,
    onOutcome: setOutcome,
    onSlow: setSlow
  };

  return (
    <div
      ref={dashboardRef}
      className={"observability-dashboard" + (fullscreen !== null ? " has-maximized-panel" : "")}
      aria-label={t("observability.title")}
    >
      <DashboardHeader
        range={range}
        onRange={setRange}
        autoRefresh={autoRefresh}
        onAutoRefresh={setAutoRefresh}
        overview={available ? summary.overview : null}
        dataStatus={overviewDataStatus(summary.overview, summary.failed)}
        onRefresh={() => {
          setRevision((value) => value + 1);
        }}
      />
      <DashboardStatus
        loading={summary.loading}
        available={available}
        failed={summary.failed}
        failureRef={summary.failureRef}
        onRetry={() => {
          setRevision((value) => value + 1);
        }}
      />
      {available && summary.failed && <StaleDiagnosticRef value={summary.failureRef} />}
      {available && summary.overview !== null && (
        <>
          <MetricCards overview={summary.overview} />
          <div className="obs-middle">
            <OverviewCharts overview={summary.overview} />
          </div>
          <div className="obs-workspace-heading">
            <h2>{t("observability.workbenchTitle")}</h2>
            <span>{t("observability.workbenchSubtitle")}</span>
          </div>
          <DetailPanels
            summary={summary}
            details={details}
            allLogs={allLogs}
            logScope={logScope}
            onLogScope={setLogScope}
            logLevel={logLevel}
            onLogLevel={setLogLevel}
            filters={filters}
            fullscreen={fullscreen}
            onFullscreen={onFullscreen}
          />
        </>
      )}
    </div>
  );
}
