// @vitest-environment jsdom
// cspell:words goroutines

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ObservabilityLog, ObservabilityOverviewResult } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { OverviewCharts, timeLabel } from "./observability-charts.js";
import { LogEntry } from "./observability-log-entries.js";
import { DashboardHeader, MetricCards, SystemTimeline } from "./observability-summary.js";

const t0 = "2026-11-07T01:49:00Z";
const t1 = "2026-11-07T01:54:00Z";
const t2 = "2026-11-07T01:59:00Z";
const mib = 1048576;

function sampleOverview(): ObservabilityOverviewResult {
  return {
    availability: "available",
    version: "0.3.17",
    coverage: { dropped: 0, truncated: false, from: t0, to: t2 },
    total: 20,
    success: 17,
    errors: 3,
    slow: 2,
    incomplete: 0,
    trend: [
      { time: t0, total: 2, success: 1, errors: 1, slow: 0 },
      { time: t1, total: 5, success: 4, errors: 1, slow: 1 },
      { time: t2, total: 8, success: 7, errors: 1, slow: 1 }
    ],
    resources: [
      {
        time: t0,
        heap_bytes: 50 * mib,
        rss_bytes: 120 * mib,
        cgroup_used_bytes: 200 * mib,
        cgroup_max_bytes: 1024 * mib,
        cpu_percent: null,
        goroutines: 4,
        gc_pauses_ns: 1000000
      },
      {
        time: t1,
        heap_bytes: 70 * mib,
        rss_bytes: 180 * mib,
        cgroup_used_bytes: 240 * mib,
        cgroup_max_bytes: 1024 * mib,
        cpu_percent: 20,
        goroutines: 5,
        gc_pauses_ns: 2500000
      },
      {
        time: t2,
        heap_bytes: 90 * mib,
        rss_bytes: 300 * mib,
        cgroup_used_bytes: 310 * mib,
        cgroup_max_bytes: 1024 * mib,
        cpu_percent: 25,
        goroutines: 6,
        gc_pauses_ns: 5000000
      }
    ],
    events: [{ time: t0, event: "runtime.started", run_id: "run_first" }],
    snapshot: {
      uptime_seconds: 90050,
      process: { heap_alloc_bytes: 90 * mib, goroutines: 6 },
      http: {
        requests_total: 20,
        non_2xx_total: 3,
        in_flight: 0,
        latency_ms_buckets: { le_50: 2, le_250: 6, le_1000: 3, over_1000: 1 }
      },
      mcp: { tool_calls_total: 6, tool_errors_total: 1, tool_timeouts_total: 0, in_flight: 0 },
      business: { operations_total: 2, outcomes: { committed: 2 } },
      sandbox: { resource_limits_total: 0 }
    }
  };
}

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});
function mount(node: ReactNode) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>{node}</UiProvider>
      </TranslationProvider>
    );
  });
}
function clickText(selector: string, text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>(selector)).find(
    (x) => x.textContent.trim() === text
  );
  if (button === undefined) throw new Error("Missing interactive control: " + text);
  act(() => {
    button.click();
  });
}

it("connects five-minute samples, keeps true RSS and discloses off-scale cgroup capacity", () => {
  const data = sampleOverview();
  mount(<OverviewCharts overview={data} />);
  const path = container.querySelector<SVGPathElement>(".obs-resource-panel .obs-plot.obs-purple");
  expect(path?.getAttribute("d")).toMatch(/^M.*L.*L/);
  expect(container.querySelector(".obs-resource-panel .obs-chart-y")?.textContent).toContain(
    "310 MiB"
  );
  expect(container.querySelector(".obs-series-limit")?.textContent).toContain("off scale");
  expect(container.querySelector(".obs-resource-panel .obs-reference-line")).toBeNull();
  expect(container.querySelectorAll(".obs-resource-panel .obs-chart-x time")).toHaveLength(3);
  expect(container.querySelectorAll(".obs-traffic-panel path.obs-plot")).toHaveLength(4);
  expect(timeLabel("invalid-date")).toBe("—");
});

it("shows the measured cgroup limit on chart when usage approaches the bound", () => {
  const data = sampleOverview();
  data.resources = data.resources.map((sample, index) => ({
    ...sample,
    rss_bytes: (850 + index * 30) * mib,
    cgroup_used_bytes: (880 + index * 30) * mib
  }));
  mount(<OverviewCharts overview={data} />);
  expect(container.querySelector(".obs-resource-panel .obs-reference-line")).not.toBeNull();
  expect(container.querySelector(".obs-resource-panel .obs-chart-y")?.textContent).toContain(
    "1024 MiB"
  );
  expect(container.querySelector(".obs-series-limit")?.textContent).not.toContain("off scale");
});

it("switches resource plots to CPU, Goroutine, and recorded GC deltas without inventing missing samples", () => {
  const data = sampleOverview();
  mount(<OverviewCharts overview={data} />);
  clickText(".obs-resource-tabs button", "CPU");
  expect(container.querySelector(".obs-resource-panel .obs-plot")?.getAttribute("d")).toContain(
    "L"
  );
  clickText(".obs-resource-tabs button", "Goroutine");
  expect(container.querySelector(".obs-resource-panel .obs-plot")?.getAttribute("d")).toContain(
    "L"
  );
  clickText(".obs-resource-tabs button", "GC");
  expect(container.querySelector(".obs-resource-panel .obs-plot")?.getAttribute("d")).toContain(
    "L"
  );
  expect(container.querySelector(".obs-resource-panel .obs-reference-line")).toBeNull();
  const noCpu = sampleOverview();
  noCpu.resources = noCpu.resources.map((sample) => ({ ...sample, cpu_percent: null }));
  mount(<OverviewCharts overview={noCpu} />);
  clickText(".obs-resource-tabs button", "CPU");
  expect(container.querySelector(".obs-resource-panel .obs-chart-empty")?.textContent).toContain(
    "No recorded samples"
  );
});

it("shows real runtime uptime, restart evidence, unknown OOM, and empty-rate semantics", () => {
  const data = sampleOverview();
  mount(<MetricCards overview={data} />);
  expect(container.textContent).toContain("1d 1h");
  expect(container.textContent).toContain("85.0%");
  expect(container.textContent).toContain("Host confirmation unavailable");
  const missing = sampleOverview();
  missing.total = 0;
  missing.success = 0;
  missing.slow = 0;
  missing.events = [];
  missing.snapshot.uptime_seconds = 4200;
  mount(<MetricCards overview={missing} />);
  expect(container.textContent).toContain("1h 10m");
  expect(container.querySelector(".obs-health-meta")?.textContent).toContain("—");
  expect(container.querySelector(".obs-kpis")?.textContent).toContain("—");
});

it("supports turning live polling off while retaining manual refresh and time range", () => {
  const refresh = vi.fn();
  const toggle = vi.fn();
  const range = vi.fn();
  mount(
    <DashboardHeader
      range="24h"
      onRange={range}
      onRefresh={refresh}
      autoRefresh={true}
      onAutoRefresh={toggle}
    />
  );
  const switcher = container.querySelector<HTMLButtonElement>(".obs-auto-refresh");
  if (switcher === null) throw new Error("Missing polling switch");
  act(() => {
    switcher.click();
  });
  expect(toggle).toHaveBeenCalledWith(false);
  mount(
    <DashboardHeader
      range="24h"
      onRange={range}
      onRefresh={refresh}
      autoRefresh={false}
      onAutoRefresh={toggle}
    />
  );
  expect(container.querySelector(".obs-auto-refresh")?.getAttribute("aria-checked")).toBe("false");
  const manualRefresh = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Refresh observations"]'
  );
  if (manualRefresh === null) throw new Error("Missing manual refresh button");
  act(() => {
    manualRefresh.click();
  });
  expect(refresh).toHaveBeenCalledTimes(1);
  const selection = container.querySelector<HTMLButtonElement>('button[aria-label="Time range"]');
  if (selection === null) throw new Error("Missing range picker");
  expect(selection.textContent).toContain("Last 24 hours");
  expect(container.querySelector(".obs-time-picker select")).toBeNull();
});

it("selects a time window through the Base UI menu and keeps a single trigger", async () => {
  const onRange = vi.fn();
  mount(
    <DashboardHeader
      range="24h"
      onRange={onRange}
      onRefresh={vi.fn()}
      autoRefresh={true}
      onAutoRefresh={vi.fn()}
    />
  );
  const trigger = container.querySelector<HTMLButtonElement>(".obs-time-picker");
  if (trigger === null) throw new Error("Missing time-range trigger");
  await act(async () => {
    trigger.click();
    await Promise.resolve();
  });
  const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
    (item) => item.textContent.includes("Last hour")
  );
  if (option === undefined) throw new Error("Missing time-range option");
  await act(async () => {
    option.click();
    await Promise.resolve();
  });
  expect(onRange).toHaveBeenCalledWith("1h");
});

it("shows accurate stale and partial-history states without another picker border", () => {
  const props = {
    range: "1h" as const,
    onRange: vi.fn(),
    onRefresh: vi.fn(),
    autoRefresh: false,
    onAutoRefresh: vi.fn()
  };
  mount(<DashboardHeader {...props} dataStatus="stale" />);
  expect(container.querySelector(".obs-header-data-status")?.textContent).toContain(
    "Snapshot not refreshed"
  );
  mount(<DashboardHeader {...props} dataStatus="partial" />);
  expect(container.querySelector(".obs-header-data-status")?.textContent).toContain(
    "Incomplete history"
  );
});

it("uses native dialog methods when available and closes event history", () => {
  mount(<SystemTimeline overview={sampleOverview()} />);
  const dialog = container.querySelector<HTMLDialogElement>(".obs-event-dialog");
  const trigger = container.querySelector<HTMLButtonElement>(".obs-header-event-trigger");
  if (dialog === null || trigger === null) throw new Error("Missing event dialog");
  const showModal = vi.fn(() => {
    dialog.setAttribute("open", "");
  });
  const close = vi.fn(() => {
    dialog.removeAttribute("open");
  });
  dialog.showModal = showModal;
  dialog.close = close;
  act(() => {
    trigger.click();
  });
  expect(showModal).toHaveBeenCalledOnce();
  clickText(".obs-event-dialog-header button", "Close");
  expect(close).toHaveBeenCalledOnce();
});

it("shows the latest system event in the header and opens bounded history", () => {
  const data = sampleOverview();
  data.events = [
    { time: t0, event: "runtime.memory_pressure", run_id: "a" },
    { time: t1, event: "runtime.started", run_id: "a" },
    { time: t2, event: "runtime.stopped", run_id: "a" },
    { time: t2, event: "runtime.serve.failed", run_id: "b" }
  ];
  mount(<SystemTimeline overview={data} />);
  const trigger = container.querySelector<HTMLButtonElement>(".obs-header-event-trigger");
  expect(trigger?.textContent).toContain("System events");
  expect(trigger?.textContent).toContain("Memory pressure detected");
  expect(container.querySelector(".obs-header-event-icon.is-warning")).not.toBeNull();
  if (trigger === null) throw new Error("Missing event history control");
  act(() => {
    trigger.click();
  });
  const dialog = container.querySelector<HTMLDialogElement>(".obs-event-dialog");
  expect(dialog?.open).toBe(true);
  expect(dialog?.querySelectorAll(".obs-event-list li")).toHaveLength(4);
  expect(dialog?.textContent).toContain("up to 50 most recent recorded events");
  clickText(".obs-event-dialog-header button", "Close");
  expect(dialog?.open).toBe(false);
  data.events = [];
  mount(<SystemTimeline overview={data} />);
  expect(container.querySelector(".obs-header-event-trigger")?.textContent).toContain(
    "No recorded system events"
  );
  expect(container.querySelector<HTMLButtonElement>(".obs-header-event-trigger")?.disabled).toBe(
    true
  );
});

function entry(
  level: string,
  fields: Record<string, string | number | boolean | null>,
  extras: Partial<ObservabilityLog> = {}
): ObservabilityLog {
  return {
    id: 3,
    time: t2,
    level,
    component: "kernel",
    event: "kernel.stage.finished",
    fields,
    ...extras
  };
}

it("shows structured WARN/ERROR fields, JSON and exact linked stages without guessing missing IDs", () => {
  const onStage = vi.fn();
  const requestID = "req_" + "a".repeat(32);
  mount(
    <>
      <LogEntry
        entry={entry(
          "WARN",
          { message: "Graph query slow", stage: "graph.query", error_code: "SLOW" },
          {
            operation_id: "op_1234567890123",
            span_id: "1234567890abcdef"
          }
        )}
        requestID={requestID}
        jsonMode={true}
        onStage={onStage}
      />
      <LogEntry
        entry={entry("ERROR", { error_code: "IO_ERROR" }, { time: "invalid-date" })}
        requestID={null}
        jsonMode={false}
        onStage={onStage}
      />
      <LogEntry
        entry={entry("INFO", { message: 0 })}
        requestID={null}
        jsonMode={false}
        onStage={onStage}
      />
    </>
  );
  const rows = container.querySelectorAll(".obs-log-row");
  expect(rows).toHaveLength(3);
  expect(rows[0]?.textContent).toContain("Graph query slow");
  expect(rows[0]?.textContent).toContain("graph.query");
  expect(rows[0]?.textContent).toContain("SLOW");
  expect(rows[1]?.textContent).toContain("IO_ERROR");
  expect(rows[1]?.textContent).toContain("—");
  const first = container.querySelector(".obs-log:first-child");
  expect(first?.hasAttribute("open")).toBe(true);
  expect(container.querySelector(".obs-log-expanded pre")?.textContent).toContain("request_id");
  clickText(".obs-log-expanded button", "Locate linked stage");
  expect(onStage).toHaveBeenCalledWith("1234567890abcdef");
});
