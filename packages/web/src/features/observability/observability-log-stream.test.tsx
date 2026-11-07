// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { KGOSClient, ObservabilityLog, ObservabilityLogListResult } from "@kgos/sdk";
import { KGOSDaemonError } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useObservabilityLogStream } from "./observability-log-stream.js";
import type { LogLevelFilter } from "./observability-log-stream.js";
import type { Range } from "./observability-data.js";

const one = {
  id: 3,
  time: "2026-11-07T05:00:00Z",
  level: "WARN",
  component: "mcp",
  event: "mcp.tool.finished",
  request_id: "req_" + "c".repeat(32),
  fields: { error_code: "SLOW" }
};
const two = {
  id: 2,
  time: "2026-11-07T04:00:00Z",
  level: "INFO",
  component: "http",
  event: "http.request.finished",
  request_id: "req_" + "d".repeat(32),
  fields: { duration_ms: 2 }
};
const coverage = { dropped: 0, truncated: false };
function result(items: ObservabilityLog[] = [one], cursor?: string): ObservabilityLogListResult {
  return {
    availability: "available",
    coverage,
    items,
    ...(cursor === undefined ? {} : { next_cursor: cursor })
  };
}

interface Props {
  client: KGOSClient;
  range: Range;
  level: LogLevelFilter;
  autoRefresh: boolean;
  revision: number;
}
type Model = ReturnType<typeof useObservabilityLogStream>;
let latest: Model | null = null;
let host: HTMLDivElement;
let root: Root;
function Probe(props: Props) {
  latest = useObservabilityLogStream(props.client, props);
  return <span data-testid="log-count">{latest.listing?.items.length ?? 0}</span>;
}
function model(): Model {
  if (latest === null) throw new Error("Log stream did not mount");
  return latest;
}
async function render(props: Props) {
  await act(async () => {
    root.render(<Probe {...props} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
function mock(list: ReturnType<typeof vi.fn>) {
  return { system: { observability: { logs: { list } } } } as unknown as KGOSClient;
}
const defaults = {
  range: "24h" as Range,
  level: "" as LogLevelFilter,
  revision: 0,
  autoRefresh: true
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  latest = null;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

it("loads cross-request events with bounded pagination and a stable server cursor", async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce(result([one], "3"))
    .mockResolvedValueOnce(result([two]));
  await render({ ...defaults, client: mock(list) });
  expect(model().listing?.items.map((x) => x.request_id)).toEqual([one.request_id]);
  expect(list).toHaveBeenCalledWith(expect.objectContaining({ limit: 50 }), expect.anything());
  await act(async () => {
    await model().moreLogs();
  });
  expect(list.mock.calls[1]?.[0]).toMatchObject({ cursor: "3", limit: 50 });
  expect(model().listing?.items.map((x) => x.id)).toEqual([3, 2]);
  expect(model().listing?.next_cursor).toBeUndefined();
  await act(async () => {
    await model().moreLogs();
  });
  expect(list).toHaveBeenCalledTimes(2);
});

it("applies an actual one-hour time window and server log-level filtering", async () => {
  const list = vi.fn().mockResolvedValue(result([one]));
  const client = mock(list);
  await render({ ...defaults, client, range: "1h", level: "WARN", autoRefresh: false });
  const input = list.mock.calls[0]?.[0] as {
    from: string;
    to: string;
    level: string;
    limit: number;
  };
  expect(input.level).toBe("WARN");
  expect(input.limit).toBe(50);
  expect(new Date(input.to).getTime() - new Date(input.from).getTime()).toBe(3600000);
  expect(model().failed).toBe(false);
  await render({
    ...defaults,
    client,
    range: "6h",
    level: "ERROR",
    autoRefresh: false,
    revision: 1
  });
  expect(list.mock.lastCall?.[0]).toMatchObject({ level: "ERROR", limit: 50 });
});

it("reports query failures, then recovers on explicit refresh without fabricating empty history", async () => {
  const list = vi
    .fn()
    .mockRejectedValueOnce(new Error("test unavailable"))
    .mockResolvedValue(result([two]));
  const client = mock(list);
  await render({ ...defaults, client, autoRefresh: false });
  expect(model().failed).toBe(true);
  expect(model().listing).toBeNull();
  await render({ ...defaults, client, autoRefresh: false, revision: 1 });
  expect(model().failed).toBe(false);
  expect(model().listing?.items[0]?.request_id).toBe(two.request_id);
});

it("automatically recovers one transient server failure without losing the log range", async () => {
  const list = vi
    .fn()
    .mockRejectedValueOnce(
      new KGOSDaemonError({ code: "INTERNAL_ERROR", message: "temporarily unavailable" }, 500)
    )
    .mockResolvedValue(result([two]));
  await render({ ...defaults, client: mock(list), range: "1h", autoRefresh: false });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
  expect(list).toHaveBeenCalledTimes(2);
  expect(list.mock.calls[1]?.[0]).toEqual(list.mock.calls[0]?.[0]);
  expect(model().listing?.items[0]?.id).toBe(two.id);
  expect(model().failed).toBe(false);
});

it("does not automatically retry authentication failures", async () => {
  const list = vi
    .fn()
    .mockRejectedValueOnce(
      new KGOSDaemonError({ code: "AUTHENTICATION_FAILED", message: "not authorized" }, 401)
    )
    .mockResolvedValue(result([one]));
  await render({ ...defaults, client: mock(list), autoRefresh: false });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
  expect(list).toHaveBeenCalledTimes(1);
  expect(model().failed).toBe(true);
  expect(model().listing).toBeNull();
});

it("does not replace the loaded history after a failed continuation", async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce(result([one], "3"))
    .mockRejectedValueOnce(new Error("no historical page"));
  await render({ ...defaults, client: mock(list), autoRefresh: false });
  await act(async () => {
    await model().moreLogs();
  });
  expect(model().failed).toBe(true);
  expect(model().paging).toBe(false);
  expect(model().listing?.items[0]?.id).toBe(3);
});

it("refreshes when visible and stops periodic refresh when disabled", async () => {
  const list = vi.fn().mockResolvedValue(result([one]));
  const client = mock(list);
  const interval = vi.spyOn(window, "setInterval");
  const clear = vi.spyOn(window, "clearInterval");
  await render({ ...defaults, client });
  expect(interval).toHaveBeenCalled();
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(list).toHaveBeenCalledTimes(2);
  await render({ ...defaults, client, autoRefresh: false });
  expect(clear).toHaveBeenCalled();
  const calls = list.mock.calls.length;
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(list).toHaveBeenCalledTimes(calls + 1);
});
