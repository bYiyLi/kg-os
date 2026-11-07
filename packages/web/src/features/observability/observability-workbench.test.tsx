// @vitest-environment jsdom
// cspell:words goroutines

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { KGOSClient, ObservabilityOverviewResult } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { ObservabilityWorkbench } from "./observability-workbench.js";

const requestID = "req_12345678901234567890123456789012";
const rootSpan = "1234567890abcdef";
const childSpan = "fedcba0987654321";
const testTime = "2026-11-07T01:59:00Z";

function overview(): ObservabilityOverviewResult {
  return {
    availability: "available",
    version: "0.3.17",
    coverage: {
      dropped: 0,
      truncated: false,
      from: "2026-11-07T01:00:00Z",
      to: "2026-11-07T02:00:00Z"
    },
    total: 42,
    success: 38,
    errors: 3,
    slow: 5,
    incomplete: 1,
    trend: [
      { time: "2026-11-07T01:58:00Z", total: 3, success: 2, errors: 1, slow: 1 },
      { time: testTime, total: 5, success: 4, errors: 1, slow: 2 }
    ],
    resources: [
      {
        time: "2026-11-07T01:58:00Z",
        heap_bytes: 1048576,
        rss_bytes: null,
        cgroup_used_bytes: 2097152,
        cgroup_max_bytes: 1073741824,
        cpu_percent: null,
        goroutines: 4,
        gc_pauses_ns: 10
      },
      {
        time: testTime,
        heap_bytes: 2097152,
        rss_bytes: null,
        cgroup_used_bytes: 3145728,
        cgroup_max_bytes: 1073741824,
        cpu_percent: 12.5,
        goroutines: 5,
        gc_pauses_ns: 20
      }
    ],
    events: [{ time: "2026-11-07T01:00:00Z", run_id: "run_001", event: "runtime.started" }],
    snapshot: {
      uptime_seconds: 180,
      process: { heap_alloc_bytes: 2097152, goroutines: 5 },
      http: {
        requests_total: 42,
        non_2xx_total: 3,
        in_flight: 0,
        latency_ms_buckets: { le_50: 1, le_250: 2, le_1000: 10, over_1000: 1 }
      },
      mcp: { tool_calls_total: 11, tool_errors_total: 2, tool_timeouts_total: 0, in_flight: 0 },
      business: { operations_total: 1, outcomes: { committed: 1 } },
      sandbox: { resource_limits_total: 0 }
    }
  };
}

function timelineFixture() {
  return {
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    items: [
      {
        id: 9,
        time: testTime,
        level: "INFO",
        component: "http",
        event: "http.request.finished",
        request_id: "req_" + "b".repeat(32),
        fields: { duration_ms: 6 }
      },
      {
        id: 8,
        time: testTime,
        level: "WARN",
        component: "mcp",
        event: "mcp.tool.finished",
        request_id: requestID,
        span_id: rootSpan,
        fields: { error_code: "SLOW" }
      }
    ]
  };
}

function mockClient() {
  const list = vi.fn().mockResolvedValue({
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    items: [
      {
        request_id: requestID,
        run_id: "run_001",
        trace_id: "a".repeat(32),
        route: "mcp",
        surface: "mcp",
        method: "POST",
        tool: "kgos_query",
        started_at: testTime,
        duration_ms: 2400,
        outcome: "succeeded"
      }
    ]
  });
  const get = vi.fn().mockResolvedValue({
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    request: { request_id: requestID, route: "mcp", outcome: "succeeded" },
    spans: [
      {
        trace_id: "a".repeat(32),
        span_id: rootSpan,
        name: "mcp.tool",
        started_at: testTime,
        duration_ms: 2400,
        outcome: "succeeded"
      },
      {
        trace_id: "a".repeat(32),
        span_id: childSpan,
        parent_span_id: rootSpan,
        name: "kernel.graph.query",
        started_at: "2026-11-07T01:59:01Z",
        duration_ms: 200,
        outcome: "succeeded"
      }
    ],
    logs: [
      {
        id: 1,
        time: testTime,
        level: "INFO",
        component: "mcp",
        event: "mcp.tool.finished",
        span_id: rootSpan,
        fields: { tool: "kgos_query" }
      },
      {
        id: 2,
        time: "2026-11-07T01:59:01Z",
        level: "WARN",
        component: "lithograph",
        event: "lithograph.operation.finished",
        span_id: childSpan,
        fields: { cause_class: "timeout" }
      }
    ]
  });
  const client = {
    system: {
      observability: {
        overview: vi.fn().mockResolvedValue(overview()),
        requests: { list, get },
        logs: {
          list: vi.fn().mockResolvedValue(timelineFixture())
        }
      }
    }
  } as unknown as KGOSClient;
  return { client, list, get };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

async function mount(client: KGOSClient) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <ObservabilityWorkbench client={client} />
        </UiProvider>
      </TranslationProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function findButton(name: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (x) =>
      x.textContent.trim() === name ||
      x.querySelector("strong")?.textContent === name ||
      x.getAttribute("aria-label") === name
  );
  if (button === undefined) throw new Error("Missing button: " + name);
  return button;
}

it("renders actual diagnostic numbers and four request curves without inventing unavailable RSS/OOM", async () => {
  const { client } = mockClient();
  await mount(client);
  expect(host.textContent).toContain("42");
  expect(host.textContent).toContain("Runtime Observability");
  expect(host.textContent).toContain("Slow");
  expect(host.textContent).toContain("OOM restarts");
  expect(host.textContent).toContain("Host confirmation unavailable");
  expect(host.textContent).toContain("runtime.started");
  expect(host.querySelectorAll(".obs-charts .obs-plot")).toHaveLength(7);
  expect(host.querySelector(".obs-charts")?.textContent).toContain("Process RSS");
  expect(host.querySelector(".obs-charts")?.textContent).toContain("—");
});

it("connects five-minute resource buckets without compressing heap under a distant limit", async () => {
  const { client } = mockClient();
  const data = overview();
  const first = data.resources[0];
  const last = data.resources[1];
  if (first === undefined || last === undefined) throw new Error("Missing resource fixtures");
  data.resources = [
    { ...first, time: "2026-11-07T01:54:00Z", heap_bytes: 1048576 },
    { ...last, time: testTime, heap_bytes: 2097152 }
  ];
  client.system.observability.overview = vi.fn().mockResolvedValue(data);
  await mount(client);
  const line = host.querySelector<SVGPathElement>(".obs-resource-panel .obs-plot.obs-purple");
  expect(line?.getAttribute("d")).toMatch(/^M.*L/);
  const axis = host.querySelector(".obs-resource-panel .obs-chart-y")?.textContent ?? "";
  expect(axis).toContain("3.0 MiB");
  expect(axis).not.toContain("1024 MiB");
  expect(host.querySelector(".obs-resource-panel .obs-chart-legend")?.textContent).toContain(
    "off scale"
  );
});

it("shows cross-request logs by default, then scopes and restores them on selection", async () => {
  const { client } = mockClient();
  const logList = client.system.observability.logs.list;
  await mount(client);
  expect(host.querySelector(".obs-selected-pill")).toBeNull();
  expect(host.querySelectorAll(".obs-log")).toHaveLength(2);
  expect(host.querySelector(".obs-log-list")?.textContent).toContain("http.request.finished");
  expect(logList).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }), expect.anything());
  await act(async () => {
    findButton("kgos_query").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelector(".obs-log-clear-filter")?.textContent).toBe("View all logs");
  expect(host.querySelector(".obs-tree-group.is-expanded")).not.toBeNull();
  await act(async () => {
    findButton("View all logs").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelector(".obs-log-clear-filter")).toBeNull();
  expect(host.querySelectorAll(".obs-log")).toHaveLength(2);
});

it("links expandable request stages to exactly scoped execution logs", async () => {
  const { client, get } = mockClient();
  await mount(client);
  await act(async () => {
    findButton("kgos_query").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  // Nested stages remain collapsed until the operator explicitly opens
  // their parent, instead of drawing an incorrectly flattened trace tree.
  const parentStage = host.querySelector(".obs-span-row");
  const parentExpand = parentStage?.querySelector<HTMLButtonElement>(
    'button[aria-label="Expand or collapse request stages"]'
  );
  if (parentExpand === null || parentExpand === undefined) {
    throw new Error("Missing parent stage expander");
  }
  await act(async () => {
    parentExpand.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.textContent).toContain("kernel.graph.query");
  const child = findButton("kernel.graph.query");
  await act(async () => {
    child.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(get).toHaveBeenCalledWith(
    expect.objectContaining({
      request_id: requestID,
      span_id: childSpan,
      limit: 100
    }),
    expect.anything()
  );
  expect(host.textContent).toContain("Execution logs");
  act(() => {
    findButton("Toggle panel fullscreen").click();
  });
  expect(host.querySelector(".obs-fullscreen")).not.toBeNull();
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
  });
  expect(host.querySelector(".obs-fullscreen")).toBeNull();
});

it("clearly distinguishes unavailable diagnostics from zero requests", async () => {
  const value = mockClient();
  const unavailable = { ...overview(), availability: "unavailable" };
  value.client.system.observability.overview = vi.fn().mockResolvedValue(unavailable);
  await mount(value.client);
  expect(host.textContent).toContain("Historical diagnostics are unavailable");
  expect(host.querySelector(".obs-kpis")).toBeNull();
});

it("represents genuinely empty history, missing metrics and incomplete coverage without invented zeros", async () => {
  const { client, list, get } = mockClient();
  client.system.observability.overview = vi.fn().mockResolvedValue({
    ...overview(),
    coverage: { dropped: 7, truncated: true },
    total: 0,
    success: 0,
    errors: 0,
    slow: 0,
    trend: [],
    resources: [],
    events: []
  });
  list.mockResolvedValue({
    availability: "available",
    coverage: { dropped: 7, truncated: true },
    items: []
  });
  await mount(client);
  expect(host.querySelector(".obs-kpis")).not.toBeNull();
  expect(host.querySelector(".obs-header-data-status")?.textContent).toContain(
    "Incomplete history"
  );
  expect(host.querySelector(".obs-unavailable-state")).toBeNull();
  expect(host.textContent).toContain("No recorded samples in this range");
  expect(host.textContent).toContain("No recorded system events");
  expect(host.textContent).toContain("No recorded requests");
  expect(host.textContent).toContain("Dropped events: 7");
  expect(host.textContent).toContain("Success rate");
  expect(host.textContent).not.toContain("Host confirmation available");
  expect(get).not.toHaveBeenCalled();
});

it("applies bounded route, outcome and slow-request filters through guarded SDK calls", async () => {
  const { client, list } = mockClient();
  await mount(client);
  act(() => {
    findButton("Filter requests").click();
  });
  async function change(label: string, value: string) {
    const control = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    if (control === null) throw new Error("Missing filter: " + label);
    await act(async () => {
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  await change("Request source", "mcp");
  await change("Request result", "error");
  const toggle = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (toggle === null) throw new Error("Missing slow request switch");
  await act(async () => {
    toggle.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const latest = list.mock.lastCall?.[0] as {
    route?: string;
    outcome?: string;
    slow?: boolean;
    from?: string;
    to?: string;
  };
  expect(latest).toMatchObject({ route: "mcp", outcome: "error", slow: true });
  expect(new Date(latest.to ?? "").getTime() - new Date(latest.from ?? "").getTime()).toBe(
    86400000
  );
  await act(async () => {
    findButton("Refresh observations").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ limit: 50, slow: true }),
    expect.anything()
  );
});

it("paginates results while retaining the selected request and limits log searches to recorded fields", async () => {
  const { client, list, get } = mockClient();
  const first = await client.system.observability.requests.list({});
  list.mockClear();
  list.mockResolvedValueOnce({ ...first, next_cursor: "cursor_one" }).mockResolvedValue({
    ...first,
    items: [
      {
        ...first.items[0],
        request_id: "req_" + "b".repeat(32),
        tool: "kgos_mutate",
        outcome: "error"
      }
    ]
  });
  const original = await client.system.observability.requests.get({ request_id: requestID });
  get.mockClear();
  get.mockResolvedValueOnce({ ...original, next_cursor: "1" }).mockResolvedValue({
    ...original,
    logs: [
      {
        id: 3,
        time: testTime,
        level: "WARN",
        component: "sandbox",
        event: "sandbox.host.panic",
        fields: { cause_class: "panic" }
      }
    ]
  });
  await mount(client);
  const more = host.querySelector<HTMLButtonElement>(".obs-requests > button");
  if (more === null) throw new Error("No request pagination control");
  await act(async () => {
    more.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.textContent).toContain("kgos_mutate");
  expect(host.textContent).toContain("kgos_query");
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ cursor: "cursor_one", limit: 50 }));
  await act(async () => {
    findButton("kgos_query").click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.textContent).toContain("View all logs");
  const logMore = host.querySelector<HTMLButtonElement>(".obs-logs > button");
  if (logMore === null) throw new Error("No log pagination control");
  await act(async () => {
    logMore.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(get).toHaveBeenCalledWith(expect.objectContaining({ cursor: "1", limit: 100 }));
  const search = host.querySelector<HTMLInputElement>('input[aria-label="Search recorded fields"]');
  if (search === null) throw new Error("Missing log search");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      search,
      "panic"
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const levelSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Log level"]');
  if (levelSelect === null) throw new Error("Missing log level filter");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
      levelSelect,
      "ERROR"
    );
    levelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelectorAll(".obs-log")).toHaveLength(0);
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(
      levelSelect,
      "WARN"
    );
    levelSelect.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelectorAll(".obs-log")).toHaveLength(1);
});

it("reports failed history and detail fetches instead of treating errors as empty results", async () => {
  const { client, get } = mockClient();
  get.mockRejectedValue(new Error("diagnostic disk unavailable"));
  await mount(client);
  expect(host.getAttribute("aria-label")).toBeNull();
  expect(host.textContent).toContain("Request stages could not be loaded");
  expect(host.querySelector(".obs-unavailable-state")).toBeNull();
  expect(host.textContent).not.toContain("diagnostic disk unavailable");
});
