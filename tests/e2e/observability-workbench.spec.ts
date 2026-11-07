import { expect, test } from "@playwright/test";
// cspell:words goroutines
import type { Page } from "@playwright/test";

import { authenticate } from "./web-shell-fixture.js";

const requestID = "req_" + "a".repeat(32);
const rootSpan = "1111111111111111";
const childSpan = "2222222222222222";
const webAccess = "Bearer kgws_" + "A".repeat(43);
const bootID = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";

function sampleOverview() {
  const now = Date.now();
  const previous = new Date(now - 60000).toISOString();
  const current = new Date(now).toISOString();
  return {
    availability: "available",
    version: "0.3.17",
    coverage: { from: previous, to: current, dropped: 0, truncated: false },
    total: 4,
    success: 3,
    errors: 1,
    slow: 1,
    incomplete: 0,
    trend: [
      { time: previous, total: 1, success: 1, errors: 0, slow: 0 },
      { time: current, total: 3, success: 2, errors: 1, slow: 1 }
    ],
    resources: [
      {
        time: previous,
        heap_bytes: 1048576,
        rss_bytes: null,
        cgroup_used_bytes: 2097152,
        cgroup_max_bytes: 1073741824,
        cpu_percent: null,
        goroutines: 2,
        gc_pauses_ns: 0
      },
      {
        time: current,
        heap_bytes: 2097152,
        rss_bytes: null,
        cgroup_used_bytes: 3145728,
        cgroup_max_bytes: 1073741824,
        cpu_percent: 3.5,
        goroutines: 3,
        gc_pauses_ns: 100
      }
    ],
    events: [{ time: previous, event: "runtime.starting", run_id: "run_example" }],
    snapshot: {
      uptime_seconds: 128,
      process: { heap_alloc_bytes: 2097152, goroutines: 3 },
      http: {
        requests_total: 4,
        non_2xx_total: 1,
        in_flight: 0,
        latency_ms_buckets: { le_50: 1, le_250: 1, le_1000: 2, over_1000: 0 }
      },
      mcp: { tool_calls_total: 2, tool_errors_total: 1, tool_timeouts_total: 0, in_flight: 0 },
      business: { operations_total: 0, outcomes: {} },
      sandbox: { resource_limits_total: 0 }
    }
  };
}

function sampleRequests() {
  return {
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    items: [
      {
        request_id: requestID,
        run_id: "run_example",
        trace_id: "a".repeat(32),
        route: "mcp",
        surface: "mcp",
        method: "POST",
        tool: "kgos_query",
        started_at: new Date(Date.now() - 5000).toISOString(),
        duration_ms: 2401,
        outcome: "succeeded"
      }
    ]
  };
}

function sampleDetail(spanID: string | undefined) {
  const now = new Date().toISOString();
  const logs = [
    {
      id: 1,
      time: now,
      component: "mcp",
      event: "mcp.tool.finished",
      level: "INFO",
      span_id: rootSpan,
      fields: { tool: "kgos_query" }
    },
    {
      id: 2,
      time: now,
      component: "lithograph_host",
      event: "lithograph.operation.finished",
      level: "WARN",
      span_id: childSpan,
      fields: { cause_class: "timeout" }
    }
  ];
  return {
    availability: "available",
    coverage: { dropped: 0, truncated: false },
    request: sampleRequests().items[0],
    spans: [
      {
        trace_id: "a".repeat(32),
        span_id: rootSpan,
        name: "mcp.tool",
        started_at: now,
        outcome: "succeeded",
        duration_ms: 2401
      },
      {
        trace_id: "a".repeat(32),
        span_id: childSpan,
        parent_span_id: rootSpan,
        name: "kernel.graph.query",
        started_at: now,
        outcome: "succeeded",
        duration_ms: 120
      }
    ],
    logs: spanID === undefined ? logs : logs.filter((item) => item.span_id === spanID)
  };
}

async function mockObservability(page: Page) {
  const paths: string[] = [];
  await page.route("**/api/v1/system/observability/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const headers = route.request().headers();
    expect(headers["authorization"]).toBe(webAccess);
    expect(headers["x-kgos-expected-daemon-boot"]).toBe(bootID);
    expect(route.request().method()).toBe("POST");
    paths.push(path);
    const body = route.request().postDataJSON() as Record<string, unknown>;
    let result: unknown;
    if (path.endsWith("/overview")) result = sampleOverview();
    else if (path.endsWith("/requests/list")) result = sampleRequests();
    else if (path.endsWith("/logs/list")) {
      result = {
        availability: "available",
        coverage: { dropped: 0, truncated: false },
        items: [
          {
            id: 40,
            time: new Date().toISOString(),
            level: "INFO",
            component: "http",
            event: "http.request.finished",
            request_id: "req_" + "b".repeat(32),
            fields: { duration_ms: 8 }
          },
          {
            id: 39,
            time: new Date().toISOString(),
            level: "WARN",
            component: "mcp",
            event: "mcp.tool.finished",
            request_id: requestID,
            span_id: rootSpan,
            fields: { error_code: "SLOW" }
          }
        ]
      };
    } else if (path.endsWith("/requests/get")) {
      result = sampleDetail(typeof body["span_id"] === "string" ? body["span_id"] : undefined);
    } else {
      throw new Error("Unexpected diagnostic route: " + path);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(result) });
  });
  return paths;
}

test.use({ colorScheme: "dark", viewport: { width: 1440, height: 950 }, reducedMotion: "reduce" });

test("time range uses one accessible Select control with correct query windows", async ({
  page
}) => {
  await mockObservability(page);
  await authenticate(page);
  await page.getByRole("button", { name: "Runtime Observability" }).click();
  const trigger = page.getByRole("combobox", { name: "Time range" });
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toContainText("Last 24 hours");
  await expect(page.locator(".obs-header .obs-time-picker select")).toHaveCount(0);
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  for (const [label, hours] of [
    ["Last hour", 1],
    ["Last 6 hours", 6],
    ["Last 24 hours", 24]
  ] as const) {
    const request = page.waitForRequest((item) => {
      if (!item.url().endsWith("/api/v1/system/observability/overview")) return false;
      const query = item.postDataJSON() as { from: string; to: string };
      return new Date(query.to).getTime() - new Date(query.from).getTime() === hours * 3600000;
    });
    await trigger.click();
    await page.getByRole("option", { name: label }).click();
    await request;
    await expect(trigger).toContainText(label);
  }
});

async function verifyMaximizedInsideWorkbench(page: Page, selector: string) {
  const geometry = await page.evaluate((panelSelector) => {
    const panel = document.querySelector(panelSelector);
    const workbench = document.querySelector(".observability-dashboard");
    const sidebar = document.querySelector(".version-sidebar");
    if (panel === null || workbench === null) {
      throw new Error("Missing maximized panel or workbench");
    }
    const a = panel.getBoundingClientRect();
    const b = workbench.getBoundingClientRect();
    return {
      mode: getComputedStyle(panel).position,
      left: a.left,
      top: a.top,
      right: a.right,
      bottom: a.bottom,
      workbenchLeft: b.left,
      workbenchTop: b.top,
      workbenchRight: b.right,
      workbenchBottom: b.bottom,
      sidebarRight: sidebar?.getBoundingClientRect().right ?? 0
    };
  }, selector);
  expect(geometry.mode).toBe("absolute");
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.workbenchLeft);
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.workbenchTop);
  expect(geometry.right).toBeLessThanOrEqual(geometry.workbenchRight);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.workbenchBottom);
  expect(geometry.left).toBeGreaterThanOrEqual(geometry.sidebarRight);
}

test("displays an authenticated real-data-shaped workbench with linked tree, logs and focus-safe fullscreen", async ({
  page
}, testInfo) => {
  const calls = await mockObservability(page);
  await authenticate(page);
  const sidebar = page.locator(".version-sidebar");
  const observationButton = sidebar.getByRole("button", { name: "Runtime Observability" });
  await expect(observationButton).toBeVisible();
  const actionLabels = (await sidebar.locator(".sidebar-bottom button").allTextContents()).map(
    (text) => text.trim()
  );
  expect(actionLabels.indexOf("Runtime Observability")).toBeLessThan(
    actionLabels.indexOf("Settings")
  );
  await observationButton.click();
  await expect(page.getByRole("heading", { name: "Runtime Observability" })).toBeVisible();
  await expect(page.locator(".obs-kpi")).toHaveCount(6);
  await expect(page.locator(".obs-kpis")).toContainText("0.3.17");
  await expect(page.locator(".obs-kpis")).toContainText("Host confirmation unavailable");
  await expect(page.locator(".obs-charts .obs-plot")).toHaveCount(7);
  // The line-series paths must not fill SVG polygons (black triangles).
  expect(
    await page
      .locator(".obs-plot")
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
  ).toBe("none");
  const eventTrigger = page.locator(".obs-header .obs-header-event-trigger");
  await expect(eventTrigger).toContainText("Service starting");
  await expect(page.locator(".obs-middle .obs-events")).toHaveCount(0);
  await expect(page.locator(".obs-middle .obs-panel")).toHaveCount(2);
  await eventTrigger.click();
  const recentEvents = page.getByRole("dialog", { name: "Recent event history" });
  await expect(recentEvents).toBeVisible();
  await expect(recentEvents).toContainText("runtime.starting");
  await recentEvents.getByRole("button", { name: "Close" }).click();
  await expect(recentEvents).toBeHidden();
  await expect(page.locator(".obs-log")).toHaveCount(2);
  await expect(page.locator(".obs-selected-pill")).toHaveCount(0);
  await expect(page.locator(".obs-log-list")).toContainText("http.request.finished");
  await page.screenshot({ path: testInfo.outputPath("runtime-observability-desktop.png") });

  await page.locator(".obs-requests button.obs-tree-label").first().click();
  const expandedGroup = page.locator(".obs-tree-group.is-expanded");
  await expect(expandedGroup).toHaveCount(1);
  const railWidth = await expandedGroup.evaluate(
    (element) => getComputedStyle(element).borderLeftWidth
  );
  expect(railWidth).toBe("2px");
  await expect(page.locator(".obs-span-row")).toHaveCount(1);
  await page
    .locator(".obs-span-row")
    .first()
    .getByRole("button", {
      name: "Expand or collapse request stages"
    })
    .click();
  await expect(page.locator(".obs-span-row")).toHaveCount(2);
  await expect(page.locator(".obs-tree-leaf")).toHaveCount(1);
  await page
    .locator(".obs-span-row")
    .filter({ hasText: "kernel.graph.query" })
    .locator("button.obs-tree-label")
    .click();
  await expect(page.locator(".obs-log")).toHaveCount(1);
  await expect(page.locator(".obs-log")).toContainText("lithograph.operation.finished");
  await page.locator(".obs-log summary").click();
  await expect(page.locator(".obs-log pre")).toContainText("cause_class");
  await page.locator(".obs-log-clear-filter").click();
  await expect(page.locator(".obs-log")).toHaveCount(2);
  await expect(page.locator(".obs-log-clear-filter")).toHaveCount(0);
  const logPane = page.locator(".obs-logs");
  await logPane.getByRole("button", { name: "Toggle panel fullscreen" }).click();
  await expect(logPane).toHaveClass(/obs-fullscreen/);
  await verifyMaximizedInsideWorkbench(page, ".obs-logs.obs-fullscreen");
  await page.keyboard.press("Escape");
  await expect(logPane).not.toHaveClass(/obs-fullscreen/);
  const requestPane = page.locator(".obs-requests");
  await requestPane.getByRole("button", { name: "Toggle panel fullscreen" }).click();
  await expect(requestPane).toHaveClass(/obs-fullscreen/);
  await verifyMaximizedInsideWorkbench(page, ".obs-requests.obs-fullscreen");
  await expect(logPane).not.toHaveClass(/obs-fullscreen/);
  await requestPane.getByRole("button", { name: "Toggle panel fullscreen" }).click();
  await expect(requestPane).not.toHaveClass(/obs-fullscreen/);
  expect(calls).toContain("/api/v1/system/observability/requests/get");
});

test("keeps the workbench navigable on a narrow screen and reuses the existing language preference", async ({
  page
}) => {
  await mockObservability(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await authenticate(page);
  await page.getByRole("button", { name: "Version navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Mobile version navigation" });
  await drawer.getByRole("button", { name: "Runtime Observability" }).click();
  await expect(drawer).toBeHidden();
  await expect(page.locator(".obs-charts .obs-panel")).toHaveCount(2);
  await expect(page.locator(".obs-header .obs-header-events")).toBeVisible();
  await expect(page.locator(".obs-dual .obs-panel")).toHaveCount(2);
  await expect(page.locator(".observability-dashboard")).toBeVisible();
  const requestHeight = await page
    .locator(".obs-requests")
    .evaluate((element) => element.getBoundingClientRect().height);
  const logHeight = await page
    .locator(".obs-logs")
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(requestHeight).toBeLessThanOrEqual(420);
  expect(logHeight).toBeLessThanOrEqual(390);
  await page
    .locator(".obs-requests")
    .getByRole("button", { name: "Toggle panel fullscreen" })
    .click();
  await verifyMaximizedInsideWorkbench(page, ".obs-requests.obs-fullscreen");
  await page.keyboard.press("Escape");
  await expect(page.locator(".obs-fullscreen")).toHaveCount(0);
  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth
  );
  expect(horizontalOverflow).toBe(false);
  await page.screenshot({ path: test.info().outputPath("runtime-observability-mobile.png") });
});
