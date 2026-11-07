// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type {
  KGOSClient,
  ObservabilityOverviewResult,
  ObservabilityRequestListResult
} from "@kgos/sdk";
import { KGOSDaemonError } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readDiagnosticWithRetry, useObservabilitySummary } from "./observability-data.js";
import type { ObservabilityFilters } from "./observability-data.js";

const first = "req_" + "a".repeat(32);
const second = "req_" + "b".repeat(32);
const overview = { availability: "available", total: 1 } as ObservabilityOverviewResult;
const initial = {
  availability: "available",
  coverage: { dropped: 0, truncated: false },
  items: [{ request_id: first }],
  next_cursor: "page-2"
} as ObservabilityRequestListResult;
const page = {
  ...initial,
  items: [{ request_id: second }],
  next_cursor: undefined
} as unknown as ObservabilityRequestListResult;

const filters: ObservabilityFilters = { range: "6h", route: "api", outcome: "error", slow: true };

type Summary = ReturnType<typeof useObservabilitySummary>;
let latest: Summary | null = null;
let root: Root;
let host: HTMLDivElement;

function Probe({ client, enabled = false }: { client: KGOSClient; enabled?: boolean }) {
  latest = useObservabilitySummary(client, filters, 0, enabled);
  return <span>{latest.failed ? "failed" : "ready"}</span>;
}

function current(): Summary {
  if (latest === null) throw new Error("Summary not rendered");
  return latest;
}

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
});

it("applies route/outcome/slow filters and appends only the requested page", async () => {
  const list = vi.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(page);
  const client = {
    system: { observability: { overview: vi.fn().mockResolvedValue(overview), requests: { list } } }
  } as unknown as KGOSClient;
  await act(async () => {
    root.render(<Probe client={client} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(current().requests?.items.map((item) => item.request_id)).toEqual([first]);
  expect(current().loading).toBe(false);
  expect(list.mock.calls[0]?.[0]).toEqual(
    expect.objectContaining({ route: "api", outcome: "error", slow: true, limit: 50 })
  );
  const options = list.mock.calls[0]?.[1] as { signal?: AbortSignal } | undefined;
  expect(options?.signal).toBeInstanceOf(AbortSignal);
  await act(async () => current().moreRequests());
  expect(list).toHaveBeenCalledTimes(2);
  expect(list.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ cursor: "page-2" }));
  expect(current().requests?.items.map((item) => item.request_id)).toEqual([first, second]);
  await act(async () => current().moreRequests());
  expect(list).toHaveBeenCalledTimes(2);
});

it("preserves the first page and exposes a safe failure reference when pagination fails", async () => {
  const list = vi
    .fn()
    .mockResolvedValueOnce(initial)
    .mockRejectedValueOnce(new KGOSDaemonError({ code: "STORAGE_ERROR", message: "private" }, 503));
  const client = {
    system: { observability: { overview: vi.fn().mockResolvedValue(overview), requests: { list } } }
  } as unknown as KGOSClient;
  await act(async () => {
    root.render(<Probe client={client} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => current().moreRequests());
  expect(current().requests?.items.map((item) => item.request_id)).toEqual([first]);
  expect(current().paging).toBe(false);
  expect(current().failed).toBe(true);
  expect(current().failureRef).toBe("STORAGE_ERROR");
});

it("reports initial authorization failures without exposing the message", async () => {
  const list = vi.fn().mockResolvedValue(initial);
  const client = {
    system: {
      observability: {
        overview: vi
          .fn()
          .mockRejectedValue(
            new KGOSDaemonError({ code: "UNAUTHORIZED", message: "confidential" }, 401)
          ),
        requests: { list }
      }
    }
  } as unknown as KGOSClient;
  await act(async () => {
    root.render(<Probe client={client} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(current().loading).toBe(false);
  expect(current().failed).toBe(true);
  expect(current().failureRef).toBe("UNAUTHORIZED");
  expect(current().overview).toBeNull();
});

it("does not replay a failed read after cancellation or a client error", async () => {
  const controller = new AbortController();
  controller.abort();
  const unavailable = new KGOSDaemonError({ code: "BACKEND_ERROR", message: "private" }, 500);
  const read = vi.fn<() => Promise<unknown>>().mockRejectedValue(unavailable);
  await expect(readDiagnosticWithRetry(() => read(), controller.signal)).rejects.toBe(unavailable);
  expect(read).toHaveBeenCalledTimes(1);

  const active = new AbortController();
  const invalid = new KGOSDaemonError({ code: "INVALID_ARGUMENT", message: "private" }, 400);
  read.mockRejectedValue(invalid);
  await expect(readDiagnosticWithRetry(() => read(), active.signal)).rejects.toBe(invalid);
  expect(read).toHaveBeenCalledTimes(2);
});
