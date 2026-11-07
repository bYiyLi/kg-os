import { useRef } from "react";
import type { ObservabilityOverviewResult, ObservabilitySystemEvent } from "@kgos/sdk";
import {
  Activity,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  PlayCircle,
  RefreshCcw,
  Repeat2,
  TriangleAlert
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "../../shared/ui/select.js";
import type { Range } from "./observability-data.js";
import { timeLabel } from "./observability-charts.js";

function uptimeText(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${String(days)}d ${String(hours)}h`;
  return hours > 0 ? `${String(hours)}h ${String(minutes)}m` : `${String(minutes)}m`;
}

function HeaderDataStatus({ status }: { status?: "stale" | "partial" | null }) {
  const { t } = useTranslation();
  if (status === null || status === undefined) return null;
  return (
    <span
      className="obs-header-data-status"
      role="status"
      title={t(status === "stale" ? "observability.summaryStale" : "observability.partialData")}
    >
      <TriangleAlert size={13} aria-hidden="true" />
      {t(status === "stale" ? "observability.summaryStaleShort" : "observability.partialDataShort")}
    </span>
  );
}

function TimeRangeSelect({ range, onRange }: { range: Range; onRange: (range: Range) => void }) {
  const { t } = useTranslation();
  const labels = {
    "1h": t("observability.hour"),
    "6h": t("observability.sixHours"),
    "24h": t("observability.day")
  };
  return (
    <Select
      value={range}
      onValueChange={(value) => {
        if (value !== null) onRange(value);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={t("observability.timeRange")}
        className="obs-time-picker"
      >
        <CalendarDays size={15} aria-hidden="true" />
        <SelectValue>{labels[range]}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        <SelectItem value="1h">{labels["1h"]}</SelectItem>
        <SelectItem value="6h">{labels["6h"]}</SelectItem>
        <SelectItem value="24h">{labels["24h"]}</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function DashboardHeader({
  range,
  onRange,
  onRefresh,
  autoRefresh,
  onAutoRefresh,
  overview,
  dataStatus
}: {
  range: Range;
  onRange: (range: Range) => void;
  onRefresh: () => void;
  autoRefresh: boolean;
  onAutoRefresh: (enabled: boolean) => void;
  overview?: ObservabilityOverviewResult | null;
  dataStatus?: "stale" | "partial" | null;
}) {
  const { t } = useTranslation();
  return (
    <header className="obs-header">
      <div className="obs-header-brand">
        <Activity className="obs-header-pulse" aria-hidden="true" />
        <div>
          <h1>{t("observability.title")}</h1>
          <p>{t("observability.subtitle")}</p>
        </div>
      </div>
      {overview !== null && overview !== undefined && <SystemTimeline overview={overview} />}
      <div className="obs-header-actions">
        <HeaderDataStatus status={dataStatus ?? null} />
        <span className={"obs-live-state" + (autoRefresh ? " is-live" : "")}>
          <span aria-hidden="true" />
          {autoRefresh ? t("observability.live") : t("observability.paused")}
        </span>
        <TimeRangeSelect range={range} onRange={onRange} />
        <button
          type="button"
          role="switch"
          className="obs-auto-refresh"
          aria-checked={autoRefresh}
          onClick={() => {
            onAutoRefresh(!autoRefresh);
          }}
        >
          <RefreshCcw size={15} aria-hidden="true" />
          <span>{t("observability.autoRefresh")}</span>
          <span aria-hidden="true" className={"obs-switch" + (autoRefresh ? " is-on" : "")}>
            <span />
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t("observability.refresh")}
          onClick={() => {
            onRefresh();
          }}
        >
          <RefreshCcw size={17} aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}

type MetricTone = "purple" | "green" | "red" | "amber";
function MetricCard({
  icon,
  label,
  value,
  note,
  tone
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  note?: string;
  tone: MetricTone;
}) {
  return (
    <article className="obs-kpi">
      <div className={"obs-kpi-icon tone-" + tone}>{icon}</div>
      <div className="obs-kpi-body">
        <span>{label}</span>
        <strong>{value}</strong>
        {note !== undefined && <small>{note}</small>}
      </div>
    </article>
  );
}

export function MetricCards({ overview }: { overview: ObservabilityOverviewResult }) {
  const { t } = useTranslation();
  const rate =
    overview.total > 0 ? `${((100 * overview.success) / overview.total).toFixed(1)}%` : "—";
  const slowRate =
    overview.total > 0 ? `${((100 * overview.slow) / overview.total).toFixed(1)}%` : "—";
  const latestStart = overview.events.find((event) => event.event === "runtime.started");
  return (
    <section className="obs-kpis" aria-label={t("observability.overview")}>
      <article className="obs-kpi obs-health-card">
        <div className="obs-health-mark">
          <Check size={28} strokeWidth={3} aria-hidden="true" />
        </div>
        <div className="obs-health-main">
          <strong>{t("observability.systemHealth")}</strong>
          <span>
            {t("observability.running")} · v{overview.version}
          </span>
        </div>
        <div className="obs-health-meta">
          <div>
            <span>{t("observability.uptime")}</span>
            <strong>{uptimeText(overview.snapshot.uptime_seconds)}</strong>
          </div>
          <div>
            <span>{t("observability.latestRestart")}</span>
            <strong title={latestStart?.time}>
              {latestStart ? timeLabel(latestStart.time) : "—"}
            </strong>
          </div>
        </div>
      </article>
      <MetricCard
        icon={<Repeat2 />}
        label={t("observability.total")}
        value={overview.total.toLocaleString()}
        tone="purple"
      />
      <MetricCard
        icon={<CheckCircle2 />}
        label={t("observability.successRate")}
        value={rate}
        tone="green"
      />
      <MetricCard
        icon={<TriangleAlert />}
        label={t("observability.errors")}
        value={overview.errors}
        tone="red"
      />
      <MetricCard
        icon={<Clock3 />}
        label={t("observability.slow")}
        value={overview.slow}
        note={slowRate}
        tone="amber"
      />
      <MetricCard
        icon={<RefreshCcw />}
        label={t("observability.oom")}
        value="—"
        note={t("observability.oomUnknown")}
        tone="red"
      />
    </section>
  );
}

function eventTone(name: string) {
  if (name.includes("pressure") || name.includes("failed")) return "warning";
  if (name === "runtime.started") return "success";
  return "info";
}

function eventIcon(name: string) {
  if (name.includes("pressure") || name.includes("failed")) return <TriangleAlert />;
  if (name === "runtime.started") return <PlayCircle />;
  return <Info />;
}

function EventList({ events }: { events: ObservabilitySystemEvent[] }) {
  const { t } = useTranslation();
  return (
    <ol className="obs-event-list">
      {events.map((event, index) => (
        <li key={`${event.run_id}:${event.time}:${String(index)}`}>
          <div className={"obs-event-icon is-" + eventTone(event.event)}>
            {eventIcon(event.event)}
          </div>
          <div>
            <time dateTime={event.time}>{new Date(event.time).toLocaleString()}</time>
            <strong>
              {t("observability.eventTypes." + event.event, { defaultValue: event.event })}
            </strong>
            <small>{event.event}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function SystemTimeline({ overview }: { overview: ObservabilityOverviewResult }) {
  const { t } = useTranslation();
  const historyRef = useRef<HTMLDialogElement>(null);
  const latest = overview.events[0];
  const eventLabel =
    latest === undefined
      ? t("observability.noEvents")
      : t("observability.eventTypes." + latest.event, { defaultValue: latest.event });
  return (
    <div className="obs-header-events obs-events">
      <button
        type="button"
        className="obs-header-event-trigger"
        aria-label={t("observability.eventHistory")}
        disabled={latest === undefined}
        onClick={() => {
          const dialog = historyRef.current;
          if (dialog === null) return;
          if (typeof dialog.showModal === "function") dialog.showModal();
          else dialog.setAttribute("open", "");
        }}
      >
        <span className={"obs-header-event-icon is-" + eventTone(latest?.event ?? "")}>
          {latest === undefined ? <Info /> : eventIcon(latest.event)}
        </span>
        <span className="obs-header-event-copy">
          <span className="obs-header-event-heading">{t("observability.events")}</span>
          <span className="obs-header-event-summary" title={latest?.event}>
            {latest !== undefined && <time dateTime={latest.time}>{timeLabel(latest.time)}</time>}
            <span>{eventLabel}</span>
          </span>
        </span>
        {latest !== undefined && <ChevronRight className="obs-header-event-chevron" />}
      </button>
      <dialog
        ref={historyRef}
        className="obs-event-dialog"
        aria-label={t("observability.eventHistory")}
      >
        <div className="obs-event-dialog-header">
          <h2>{t("observability.eventHistory")}</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const dialog = historyRef.current;
              if (dialog === null) return;
              if (typeof dialog.close === "function") dialog.close();
              else dialog.removeAttribute("open");
            }}
          >
            {t("observability.close")}
          </Button>
        </div>
        <p className="obs-event-dialog-note">{t("observability.eventHistoryLimit")}</p>
        <EventList events={overview.events} />
      </dialog>
    </div>
  );
}
