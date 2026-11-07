// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type {
  ObservabilityLogListResult,
  ObservabilityRequest,
  ObservabilityRequestGetResult,
  ObservabilityRequestListResult,
  ObservabilitySpan
} from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { ExecutionLogPanel } from "./observability-log-panel.js";
import { RequestTreePanel } from "./observability-request-panel.js";

const requestID = "req_" + "c".repeat(32);
const time = "2026-11-07T08:59:15Z";
const spans: ObservabilitySpan[] = [
  {
    trace_id: "a".repeat(32),
    span_id: "1111111111111111",
    name: "mcp.tool",
    operation_id: "op_" + "b".repeat(32),
    started_at: time,
    duration_ms: 2000,
    outcome: "succeeded"
  },
  {
    trace_id: "a".repeat(32),
    span_id: "2222222222222222",
    parent_span_id: "1111111111111111",
    operation_id: "op_" + "d".repeat(32),
    name: "kernel.graph.query",
    started_at: time,
    outcome: "error"
  }
];
const requests: ObservabilityRequest[] = [
  {
    request_id: requestID,
    run_id: "run_1",
    route: "mcp",
    surface: "mcp",
    method: "POST",
    started_at: time,
    outcome: "succeeded",
    duration_ms: 2000,
    tool: "kgos_query"
  },
  {
    request_id: "req_" + "d".repeat(32),
    run_id: "run_1",
    route: "api",
    surface: "",
    method: "GET",
    started_at: time,
    outcome: "incomplete"
  },
  {
    request_id: "req_" + "e".repeat(32),
    run_id: "run_1",
    route: "api",
    surface: "api",
    method: "POST",
    started_at: time,
    outcome: "error",
    error_code: "SAFE_ERROR"
  }
];
const detail: ObservabilityRequestGetResult = {
  availability: "available",
  coverage: { dropped: 2, truncated: true },
  request: {
    request_id: requestID,
    run_id: "run_1",
    route: "mcp",
    surface: "mcp",
    method: "POST",
    started_at: time,
    outcome: "succeeded",
    duration_ms: 2000,
    tool: "kgos_query"
  },
  spans,
  logs: [
    {
      id: 5,
      time,
      level: "WARN",
      component: "kernel",
      event: "graph.finished",
      request_id: requestID,
      span_id: "1111111111111111",
      operation_id: "op_" + "b".repeat(32),
      fields: { error_code: "SLOW" }
    }
  ]
};
const listing: ObservabilityLogListResult = {
  availability: "available",
  coverage: { dropped: 0, truncated: false },
  items: [
    {
      id: 8,
      time,
      level: "INFO",
      component: "http",
      event: "http.request.finished",
      request_id: "req_" + "f".repeat(32),
      fields: { duration_ms: 2 }
    },
    {
      id: 7,
      time,
      level: "WARN",
      component: "mcp",
      event: "mcp.tool.finished",
      request_id: requestID,
      span_id: "1111111111111111",
      fields: { error_code: "WARN" }
    }
  ],
  next_cursor: "7"
};

let root: Root;
let host: HTMLDivElement;
async function mount(node: ReactNode) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>{node}</UiProvider>
      </TranslationProvider>
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function click(selector: string) {
  const el = host.querySelector<HTMLButtonElement>(selector);
  if (el === null) throw new Error("Missing button " + selector);
  act(() => {
    el.click();
  });
}
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

it("shows global logs, query fields, JSON details, pagination and exact Stage selection", async () => {
  const more = vi.fn();
  const onStage = vi.fn();
  await mount(
    <ExecutionLogPanel
      globalLogs={listing}
      detail={null}
      scope="all"
      onShowAll={vi.fn()}
      level=""
      onLevel={vi.fn()}
      selected={null}
      fullscreen={false}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={more}
      onStage={onStage}
    />
  );
  expect(host.querySelectorAll(".obs-log")).toHaveLength(2);
  expect(host.querySelector(".obs-selected-pill")).toBeNull();
  expect(host.querySelector(".obs-scope-global")?.textContent).toBe("All recorded requests");
  click(".obs-json-toggle");
  expect(host.querySelector(".obs-json-toggle")?.getAttribute("aria-pressed")).toBe("true");
  expect(host.querySelectorAll(".obs-log[open]")).toHaveLength(2);
  click(".obs-log-expanded button");
  expect(onStage).toHaveBeenCalledWith("1111111111111111", requestID);
  click(".obs-logs > button");
  expect(more).toHaveBeenCalledTimes(1);
});

it("filters selected request logs, shows evidence gaps, then clears the scoped filter", async () => {
  const showAll = vi.fn();
  const change = vi.fn();
  await mount(
    <ExecutionLogPanel
      globalLogs={listing}
      detail={detail}
      scope="request"
      onShowAll={showAll}
      level=""
      onLevel={change}
      selected={requestID}
      fullscreen={true}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={vi.fn()}
      onStage={vi.fn()}
    />
  );
  expect(host.querySelector(".obs-logs")?.classList.contains("obs-fullscreen")).toBe(true);
  expect(host.querySelectorAll(".obs-log")).toHaveLength(1);
  expect(host.textContent).toContain("Only part");
  expect(host.querySelector(".obs-scope-chip")?.textContent).toContain(requestID.slice(0, 12));
  click(".obs-scope-chip");
  expect(showAll).toHaveBeenCalledOnce();
  click(".obs-log-clear-filter");
  expect(showAll).toHaveBeenCalledTimes(2);
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="Log level"]');
  if (select === null) throw new Error("Missing level filter");
  act(() => {
    select.value = "ERROR";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(change).toHaveBeenCalledWith("ERROR");
});

it("distinguishes missing diagnostic history from no matching log records", async () => {
  const unavailable: ObservabilityLogListResult = {
    availability: "unavailable",
    coverage: { dropped: 0, truncated: false },
    items: []
  };
  await mount(
    <ExecutionLogPanel
      globalLogs={unavailable}
      detail={null}
      scope="all"
      onShowAll={vi.fn()}
      level=""
      onLevel={vi.fn()}
      selected={null}
      fullscreen={false}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={vi.fn()}
      onStage={vi.fn()}
    />
  );
  expect(host.textContent).toContain("unavailable");
  await mount(
    <ExecutionLogPanel
      globalLogs={listing}
      detail={null}
      scope="all"
      onShowAll={vi.fn()}
      level="ERROR"
      onLevel={vi.fn()}
      selected={null}
      fullscreen={false}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={vi.fn()}
      onStage={vi.fn()}
    />
  );
  expect(host.querySelectorAll(".obs-log")).toHaveLength(0);
  expect(host.textContent).toContain("No matching");
});

it("draws explicit parent-child links and truthful terminal stage nodes", async () => {
  const choose = vi.fn();
  const stage = vi.fn();
  const items: ObservabilityRequestListResult = {
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    items: requests,
    next_cursor: "cursor"
  };
  const filters = {
    route: "" as const,
    outcome: "" as const,
    slow: false,
    onRoute: vi.fn(),
    onOutcome: vi.fn(),
    onSlow: vi.fn()
  };
  await mount(
    <RequestTreePanel
      requests={items}
      detail={detail}
      selected={requestID}
      selectedSpan={null}
      onSelectRequest={choose}
      onSelectSpan={stage}
      filters={filters}
      fullscreen={false}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={vi.fn()}
    />
  );
  expect(host.querySelectorAll(".obs-request-row")).toHaveLength(3);
  expect(host.querySelector(".obs-tree-group.is-expanded")).not.toBeNull();
  expect(host.textContent).toContain("SAFE_ERROR");
  expect(host.textContent).toContain("Incomplete");
  expect(host.querySelectorAll(".obs-span-row")).toHaveLength(1);
  const waterfall = host.querySelector(".obs-span-row .obs-waterfall-track");
  expect(waterfall?.getAttribute("aria-label")).toContain("2.00 s");
  expect(waterfall?.querySelector(".obs-waterfall-bar")).not.toBeNull();
  click(".obs-span-row button[aria-label='Expand or collapse request stages']");
  expect(host.querySelectorAll(".obs-span-row")).toHaveLength(2);
  expect(host.querySelectorAll(".obs-waterfall-pending")).toHaveLength(1);
  expect(host.querySelectorAll(".obs-tree-leaf")).toHaveLength(1);
  const child = Array.from(host.querySelectorAll<HTMLButtonElement>(".obs-stage-label")).find(
    (el) => el.textContent.includes("kernel.graph.query")
  );
  if (child === undefined) throw new Error("Missing stage leaf");
  act(() => {
    child.click();
  });
  expect(stage).toHaveBeenCalledWith("2222222222222222");
  click(".obs-span-row button[aria-label='Expand or collapse request stages']");
  expect(host.querySelectorAll(".obs-span-row")).toHaveLength(1);
});

it("restricts request text filtering to loaded fields and retains bounded page behavior", async () => {
  const more = vi.fn();
  const items: ObservabilityRequestListResult = {
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    items: requests,
    next_cursor: "cursor"
  };
  const filters = {
    route: "" as const,
    outcome: "" as const,
    slow: false,
    onRoute: vi.fn(),
    onOutcome: vi.fn(),
    onSlow: vi.fn()
  };
  await mount(
    <RequestTreePanel
      requests={items}
      detail={detail}
      selected={requestID}
      selectedSpan={null}
      onSelectRequest={vi.fn()}
      onSelectSpan={vi.fn()}
      filters={filters}
      fullscreen={false}
      onFullscreen={vi.fn()}
      paging={false}
      onMore={more}
    />
  );
  const search = host.querySelector<HTMLInputElement>(
    'input[aria-label="Search loaded request IDs / tools…"]'
  );
  if (search === null) throw new Error("Missing request search");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      search,
      "SAFE_ERROR"
    );
    search.dispatchEvent(new Event("input", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelectorAll(".obs-request-row")).toHaveLength(1);
  expect(host.textContent).toContain("SAFE_ERROR");
  click(".obs-requests > button");
  expect(more).toHaveBeenCalledTimes(1);
});
