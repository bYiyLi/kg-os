import { useState } from "react";
import type { ObservabilityOverviewResult, ObservabilityResourcePoint } from "@kgos/sdk";
import { useTranslation } from "react-i18next";

// cspell:words goroutines

export function timeLabel(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleTimeString();
}

interface Series {
  title: string;
  color: string;
  values: (number | null)[];
}
const PRIMARY_SERIES_COLOR = "obs-purple";

function pointsToPath(values: (number | null)[], times: string[], max: number, gap: number) {
  const first = new Date(times[0] ?? "").getTime();
  const last = new Date(times.at(-1) ?? "").getTime();
  const span = Math.max(1, last - first);
  let path = "";
  let previous = 0;
  let connected = false;
  values.forEach((value, index) => {
    const ms = new Date(times[index] ?? "").getTime();
    if (value === null || !Number.isFinite(value) || !Number.isFinite(ms)) {
      connected = false;
      return;
    }
    const x = (520 * (ms - first)) / span;
    const y = 140 - (value * 129) / max;
    const command = connected && ms - previous <= gap ? "L" : "M";
    path += `${command}${x.toFixed(2)} ${y.toFixed(2)} `;
    connected = true;
    previous = ms;
  });
  return path;
}

interface ChartLinesProps {
  times: string[];
  series: Series[];
  gap: number;
  max: number;
  areaPath: string;
  reference?: number;
}

function ChartLines({ times, series, gap, max, areaPath, reference }: ChartLinesProps) {
  return (
    <svg viewBox="0 0 520 148" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="obs-resource-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#9652ed" stopOpacity=".48" />
          <stop offset="100%" stopColor="#9652ed" stopOpacity=".025" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((index) => (
        <line
          key={index}
          x1="0"
          x2="520"
          y1={11 + 32.25 * index}
          y2={11 + 32.25 * index}
          className="obs-grid-line"
        />
      ))}
      {reference !== undefined && reference > 0 && (
        <line
          x1="0"
          x2="520"
          y1={140 - (reference * 129) / max}
          y2={140 - (reference * 129) / max}
          className="obs-reference-line"
        />
      )}
      {areaPath !== "" && <path d={areaPath} className="obs-chart-area" />}
      {series.map((x) => (
        <path
          key={x.title}
          className={"obs-plot " + x.color}
          d={pointsToPath(x.values, times, max, gap)}
        />
      ))}
    </svg>
  );
}

function Chart({
  times,
  series,
  empty,
  gap,
  unit = "",
  area = false,
  reference
}: {
  times: string[];
  series: Series[];
  empty: string;
  gap: number;
  unit?: string;
  area?: boolean;
  reference?: number;
}) {
  const { t } = useTranslation();
  const valid = series.flatMap((x) =>
    x.values.filter((n): n is number => n !== null && Number.isFinite(n))
  );
  if (times.length < 2 || valid.length < 2)
    return <p className="obs-empty obs-chart-empty">{empty}</p>;
  const observedMax = Math.max(1, ...valid);
  // When only Go heap is available, a 1 GiB cgroup capacity line can make
  // every real heap sample indistinguishable from zero. Show the real
  // variation at its measured scale and disclose the limit as off-scale.
  const referenceOnScale =
    reference !== undefined && reference <= observedMax * 3 ? reference : undefined;
  const max = Math.max(observedMax, referenceOnScale ?? 0);
  const yLabels = [max, max * 0.75, max * 0.5, max * 0.25, 0];
  const contiguous = times.every(
    (time, index) =>
      index === 0 || new Date(time).getTime() - new Date(times[index - 1] ?? "").getTime() <= gap
  );
  const areaPath =
    area && contiguous && series[0]?.values.every((x) => x !== null) === true
      ? pointsToPath(series[0].values, times, max, gap) + " L520 140 L0 140 Z"
      : "";
  const getAxis = (v: number) => {
    if (unit !== "MiB") return String(Math.round(v * 10) / 10);
    const amount = max < 10 ? v.toFixed(1) : String(Math.round(v));
    return amount + " MiB";
  };
  const timescale =
    times.length >= 3
      ? [times[0], times[Math.floor((times.length - 1) / 2)], times.at(-1)]
      : [times[0], times.at(-1)];
  return (
    <div className="obs-chart" role="img" aria-label={series.map((x) => x.title).join(", ")}>
      <div className="obs-chart-body">
        <div className="obs-chart-y">
          {yLabels.map((label, index) => (
            <span key={index}>{getAxis(label)}</span>
          ))}
        </div>
        <ChartLines
          times={times}
          series={series}
          max={max}
          gap={gap}
          areaPath={areaPath}
          {...(referenceOnScale !== undefined ? { reference: referenceOnScale } : {})}
        />
      </div>
      <div className="obs-chart-x">
        {timescale.map((iso, i) => (
          <time key={i} dateTime={iso ?? ""}>
            {iso !== undefined && iso !== ""
              ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
              : "—"}
          </time>
        ))}
      </div>
      <div className="obs-chart-legend">
        {series.map((x) => (
          <span key={x.title} className={x.color}>
            {x.title}
            {x.values.every((value) => value === null) ? " —" : ""}
          </span>
        ))}
        {reference !== undefined && (
          <span className="obs-series-limit">
            {t("observability.memoryLimit")}: {getAxis(reference)}
            {referenceOnScale === undefined && " · " + t("observability.limitOffScale")}
          </span>
        )}
      </div>
    </div>
  );
}

type ResourceView = "memory" | "cpu" | "goroutine" | "gc";
function resourceSeries(
  samples: ObservabilityResourcePoint[],
  view: ResourceView,
  t: (key: string) => string
): Series[] {
  if (view === "cpu")
    return [
      {
        title: t("observability.cpu"),
        color: PRIMARY_SERIES_COLOR,
        values: samples.map((x) => x.cpu_percent)
      }
    ];
  if (view === "goroutine")
    return [
      {
        title: t("observability.goroutines"),
        color: PRIMARY_SERIES_COLOR,
        values: samples.map((x) => x.goroutines)
      }
    ];
  if (view === "gc")
    return [
      {
        title: "GC (ms)",
        color: PRIMARY_SERIES_COLOR,
        values: samples.map((x, i) =>
          i === 0
            ? null
            : Math.max(0, (x.gc_pauses_ns - (samples[i - 1]?.gc_pauses_ns ?? x.gc_pauses_ns)) / 1e6)
        )
      }
    ];
  const hasRSS = samples.some((x) => x.rss_bytes !== null);
  const memory = [
    {
      title: t("observability.rss"),
      color: hasRSS ? PRIMARY_SERIES_COLOR : "obs-blue",
      values: samples.map((x) => (x.rss_bytes === null ? null : x.rss_bytes / 1048576))
    },
    {
      title: t("observability.heap"),
      color: hasRSS ? "obs-blue" : PRIMARY_SERIES_COLOR,
      values: samples.map((x) => x.heap_bytes / 1048576)
    },
    {
      title: t("observability.container"),
      color: "obs-cyan",
      values: samples.map((x) =>
        x.cgroup_used_bytes === null ? null : x.cgroup_used_bytes / 1048576
      )
    }
  ];
  return hasRSS ? memory : memory.slice(1, 2).concat(memory.slice(0, 1), memory.slice(2));
}

function ResourcePanel({ overview }: { overview: ObservabilityOverviewResult }) {
  const { t } = useTranslation();
  const [view, setView] = useState<ResourceView>("memory");
  const samples = overview.resources;
  const reference =
    view === "memory" && samples.some((x) => x.cgroup_max_bytes !== null)
      ? (samples.at(-1)?.cgroup_max_bytes ?? undefined)
      : undefined;
  const limit = reference === undefined ? undefined : reference / 1048576;
  const tabs: { id: ResourceView; label: string }[] = [
    { id: "memory", label: t("observability.memory") },
    { id: "cpu", label: "CPU" },
    { id: "goroutine", label: "Goroutine" },
    { id: "gc", label: "GC" }
  ];
  return (
    <section className="obs-panel obs-resource-panel">
      <div className="obs-section-heading">
        <h2>{t("observability.resources")}</h2>
        <div className="obs-resource-tabs" aria-label={t("observability.resources")}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={view === tab.id}
              className={view === tab.id ? "is-active" : ""}
              onClick={() => {
                setView(tab.id);
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>
      <Chart
        times={samples.map((x) => x.time)}
        series={resourceSeries(samples, view, t)}
        gap={360000}
        empty={t("observability.noData")}
        area={view === "memory"}
        unit={view === "memory" ? "MiB" : ""}
        {...(limit !== undefined ? { reference: limit } : {})}
      />
    </section>
  );
}

function RequestTrendPanel({ overview }: { overview: ObservabilityOverviewResult }) {
  const { t } = useTranslation();
  const points = overview.trend;
  const series = [
    {
      title: t("observability.total"),
      color: PRIMARY_SERIES_COLOR,
      values: points.map((x) => x.total)
    },
    { title: t("observability.success"), color: "obs-green", values: points.map((x) => x.success) },
    { title: t("observability.errors"), color: "obs-red", values: points.map((x) => x.errors) },
    { title: t("observability.slow"), color: "obs-orange", values: points.map((x) => x.slow) }
  ];
  return (
    <section className="obs-panel obs-traffic-panel">
      <div className="obs-section-heading">
        <h2>{t("observability.requestTrend")}</h2>
        <div className="obs-heading-legend">
          {series.map((x) => (
            <span key={x.title} className={x.color}>
              {x.title}
            </span>
          ))}
        </div>
      </div>
      <Chart
        times={points.map((x) => x.time)}
        series={series}
        gap={120000}
        empty={t("observability.noData")}
      />
      <div className="obs-coverage-note">
        {t("observability.coverage")}:{" "}
        {overview.coverage.from !== undefined && overview.coverage.from !== ""
          ? timeLabel(overview.coverage.from)
          : "—"}
        {overview.coverage.dropped > 0 &&
          ` · ${t("observability.dropped")}: ${String(overview.coverage.dropped)}`}
      </div>
    </section>
  );
}

export function OverviewCharts({ overview }: { overview: ObservabilityOverviewResult }) {
  return (
    <div className="obs-charts">
      <ResourcePanel overview={overview} />
      <RequestTrendPanel overview={overview} />
    </div>
  );
}
