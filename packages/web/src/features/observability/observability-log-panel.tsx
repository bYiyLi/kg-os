import { useMemo, useState } from "react";
import type {
  ObservabilityLog,
  ObservabilityLogListResult,
  ObservabilityRequestGetResult
} from "@kgos/sdk";
import { useTranslation } from "react-i18next";
import { Button } from "../../shared/ui/button.js";
import { LogEntry, LogFilters } from "./observability-log-entries.js";
import { FullscreenButton } from "./observability-request-panel.js";
import type { LogLevelFilter } from "./observability-log-stream.js";

interface LogPanelHeaderProps {
  scope: "all" | "request";
  onShowAll: () => void;
  level: LogLevelFilter;
  search: string;
  onLevel: (level: LogLevelFilter) => void;
  onSearch: (search: string) => void;
  jsonMode: boolean;
  onJsonMode: (value: boolean) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
}

function LogPanelHeader({
  scope,
  onShowAll,
  level,
  search,
  onLevel,
  onSearch,
  jsonMode,
  onJsonMode,
  fullscreen,
  onFullscreen
}: LogPanelHeaderProps) {
  const { t } = useTranslation();
  return (
    <header className="obs-panel-head">
      <div className="obs-panel-title-group">
        <h2>{t("observability.logs")}</h2>
        {scope === "request" && (
          <button type="button" className="obs-log-clear-filter" onClick={onShowAll}>
            {t("observability.viewAllLogs")}
          </button>
        )}
      </div>
      <div className="obs-controls">
        <LogFilters
          level={level}
          search={search}
          onLevel={(value) => {
            onLevel(value as LogLevelFilter);
          }}
          onSearch={onSearch}
        />
        <button
          type="button"
          className={"obs-json-toggle" + (jsonMode ? " is-active" : "")}
          aria-pressed={jsonMode}
          onClick={() => {
            onJsonMode(!jsonMode);
          }}
        >
          JSON
        </button>
        <FullscreenButton active={fullscreen} onClick={onFullscreen} />
      </div>
    </header>
  );
}

interface LogRowsProps {
  logs: ObservabilityLog[];
  scope: "all" | "request";
  selected: string | null;
  availability: "available" | "unavailable" | undefined;
  truncated: boolean;
  jsonMode: boolean;
  onStage: (spanID: string, requestID: string | null) => void;
}

function LogRows({
  logs,
  scope,
  selected,
  availability,
  truncated,
  jsonMode,
  onStage
}: LogRowsProps) {
  const { t } = useTranslation();
  return (
    <div className="obs-log-list" aria-live="polite">
      <div className="obs-log-head" aria-hidden="true">
        <span>{t("observability.columns.time")}</span>
        <span>{t("observability.level")}</span>
        <span>{t("observability.columns.module")}</span>
        <span>{t("observability.columns.message")}</span>
      </div>
      {scope === "request" && selected === null && (
        <p className="obs-empty">{t("observability.selectRequest")}</p>
      )}
      {availability === "unavailable" && (
        <p className="obs-empty" role="status">
          {t("observability.unavailable")}
        </p>
      )}
      {availability === "available" && truncated && (
        <p className="obs-alert" role="status">
          {t("observability.truncated")}
        </p>
      )}
      {availability === "available" && logs.length === 0 && (
        <p className="obs-empty">{t("observability.noLogs")}</p>
      )}
      {logs.map((x) => (
        <LogEntry
          key={x.id}
          entry={x}
          requestID={scope === "all" ? (x.request_id ?? null) : selected}
          jsonMode={jsonMode}
          onStage={(spanID) => {
            onStage(spanID, scope === "all" ? (x.request_id ?? null) : selected);
          }}
        />
      ))}
    </div>
  );
}

interface ExecutionLogPanelProps {
  detail: ObservabilityRequestGetResult | null;
  globalLogs: ObservabilityLogListResult | null;
  scope: "all" | "request";
  onShowAll: () => void;
  level: LogLevelFilter;
  onLevel: (value: LogLevelFilter) => void;
  selected: string | null;
  selectedSpan?: string | null;
  failed?: boolean;
  failureRef?: string | null;
  fullscreen: boolean;
  onFullscreen: () => void;
  paging: boolean;
  onMore: () => void;
  onStage: (spanID: string, requestID: string | null) => void;
}

function LogScope({
  scope,
  selected,
  selectedSpan,
  visible,
  loaded,
  onShowAll
}: {
  scope: "all" | "request";
  selected: string | null;
  selectedSpan: string | null;
  visible: number;
  loaded: number;
  onShowAll: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="obs-log-scope" aria-label={t("observability.logScope")}>
      <span>{t("observability.logScope")}</span>
      {scope === "request" && selected !== null ? (
        <button type="button" className="obs-scope-chip" title={selected} onClick={onShowAll}>
          {t("observability.selectedRequest")}: {selected.slice(0, 12)}… ×
        </button>
      ) : (
        <span className="obs-scope-global">{t("observability.globalScope")}</span>
      )}
      {scope === "request" && selectedSpan !== null && (
        <span className="obs-scope-stage" title={selectedSpan}>
          {t("observability.selectedStage")}: {selectedSpan.slice(0, 8)}…
        </span>
      )}
      <span className="obs-log-count">
        {t("observability.visibleLogCount", { visible, loaded })}
      </span>
    </div>
  );
}

export function ExecutionLogPanel({
  detail,
  globalLogs,
  scope,
  onShowAll,
  level,
  onLevel,
  selected,
  selectedSpan = null,
  failed = false,
  failureRef = null,
  fullscreen,
  onFullscreen,
  paging,
  onMore,
  onStage
}: ExecutionLogPanelProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [jsonMode, setJsonMode] = useState(false);
  const entries = scope === "all" ? (globalLogs?.items ?? []) : (detail?.logs ?? []);
  const coverage = scope === "all" ? globalLogs?.coverage : detail?.coverage;
  const availability = scope === "all" ? globalLogs?.availability : detail?.availability;
  const cursor = scope === "all" ? globalLogs?.next_cursor : detail?.next_cursor;
  const logs = useMemo(
    () =>
      entries.filter((x) => {
        if (level !== "" && level !== x.level) return false;
        const q = search.trim().toLowerCase();
        return (
          q === "" ||
          [x.component, x.event, JSON.stringify(x.fields), x.operation_id ?? ""].some((v) =>
            v.toLowerCase().includes(q)
          )
        );
      }),
    [entries, level, search]
  );
  return (
    <section className={"obs-panel obs-logs" + (fullscreen ? " obs-fullscreen" : "")}>
      <LogPanelHeader
        scope={scope}
        onShowAll={onShowAll}
        level={level}
        search={search}
        onLevel={onLevel}
        onSearch={setSearch}
        jsonMode={jsonMode}
        onJsonMode={setJsonMode}
        fullscreen={fullscreen}
        onFullscreen={onFullscreen}
      />
      <LogScope
        scope={scope}
        selected={selected}
        selectedSpan={selectedSpan}
        visible={logs.length}
        loaded={entries.length}
        onShowAll={onShowAll}
      />
      {failed && (
        <p role="status" className="obs-panel-warning">
          {t("observability.logsFailed")}
          {failureRef !== null && <code>{failureRef}</code>}
        </p>
      )}
      <LogRows
        logs={logs}
        scope={scope}
        selected={selected}
        availability={availability}
        truncated={coverage?.truncated === true}
        jsonMode={jsonMode}
        onStage={onStage}
      />
      {cursor !== undefined && (
        <Button variant="ghost" disabled={paging} onClick={onMore}>
          {t("observability.loadMore")}
        </Button>
      )}
    </section>
  );
}
