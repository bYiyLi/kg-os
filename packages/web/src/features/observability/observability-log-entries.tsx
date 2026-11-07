import type { ObservabilityLog } from "@kgos/sdk";
import { Search, CircleAlert, Info, TriangleAlert, Link2 } from "lucide-react";
import { useTranslation } from "react-i18next";

export function LogFilters({
  level,
  search,
  onLevel,
  onSearch
}: {
  level: string;
  search: string;
  onLevel: (level: string) => void;
  onSearch: (search: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <label className="obs-panel-search obs-log-search">
        <Search size={14} aria-hidden="true" />
        <input
          type="search"
          value={search}
          aria-label={t("observability.searchLogs")}
          placeholder={t("observability.searchLogs")}
          onChange={(e) => {
            onSearch(e.target.value);
          }}
        />
      </label>
      <select
        className="obs-level-filter"
        value={level}
        aria-label={t("observability.level")}
        onChange={(e) => {
          onLevel(e.target.value);
        }}
      >
        <option value="">{t("observability.allLevels")}</option>
        <option>DEBUG</option>
        <option>INFO</option>
        <option>WARN</option>
        <option>ERROR</option>
      </select>
    </>
  );
}

function logTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString() + "." + String(date.getMilliseconds()).padStart(3, "0");
}

function levelIcon(level: string) {
  if (level === "ERROR") return <CircleAlert size={11} />;
  if (level === "WARN") return <TriangleAlert size={11} />;
  return <Info size={11} />;
}

function LogDetails({
  entry,
  requestID,
  errorCode,
  onStage
}: {
  entry: ObservabilityLog;
  requestID: string | null;
  errorCode: string;
  onStage: (spanID: string) => void;
}) {
  const { t } = useTranslation();
  const fields = [
    ["request_id", requestID ?? "—"],
    ["operation_id", entry.operation_id ?? "—"],
    ["span_id", entry.span_id ?? "—"],
    ["error_code", errorCode]
  ];
  return (
    <div className="obs-log-expanded">
      <dl className="obs-log-fields">
        {fields.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <pre>
        {JSON.stringify(
          {
            time: entry.time,
            level: entry.level,
            component: entry.component,
            event: entry.event,
            request_id: requestID,
            operation_id: entry.operation_id ?? null,
            span_id: entry.span_id ?? null,
            ...entry.fields
          },
          null,
          2
        )}
      </pre>
      {entry.span_id !== undefined &&
        entry.span_id !== "" &&
        requestID !== null &&
        requestID !== "" && (
          <button
            type="button"
            onClick={() => {
              onStage(entry.span_id ?? "");
            }}
          >
            <Link2 size={12} aria-hidden="true" />
            {t("observability.locateStage")}
          </button>
        )}
    </div>
  );
}

export function LogEntry({
  entry,
  requestID,
  jsonMode,
  onStage
}: {
  entry: ObservabilityLog;
  requestID: string | null;
  jsonMode: boolean;
  onStage: (spanID: string) => void;
}) {
  const code = entry.fields["error_code"];
  const message = entry.fields["message"];
  const errorCode = typeof code === "string" ? code : "—";
  const text = typeof message === "string" && message.length > 0 ? message : entry.event;
  const stage = entry.fields["stage"];
  const module = typeof stage === "string" && stage.length > 0 ? stage : entry.component;
  return (
    <details className="obs-log" open={jsonMode ? true : undefined}>
      <summary className="obs-log-row">
        <time dateTime={entry.time} className="obs-log-time">
          {logTime(entry.time)}
        </time>
        <span className={"obs-level level-" + entry.level.toLowerCase()}>
          {levelIcon(entry.level)}
          {entry.level}
        </span>
        <span className="obs-log-module" title={module}>
          {module}
        </span>
        <span className="obs-log-message" title={text}>
          <span className="obs-log-message-text">{text}</span>
          {errorCode !== "—" && <code className="obs-log-code">{errorCode}</code>}
          {requestID !== null && requestID !== "" && (
            <span className="obs-log-link" title={requestID}>
              {requestID.slice(0, 11)}…
            </span>
          )}
        </span>
      </summary>
      <LogDetails entry={entry} requestID={requestID} errorCode={errorCode} onStage={onStage} />
    </details>
  );
}
