// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  KGOSClient,
  ObservabilityRequestGetResult,
  ObservabilityRequestListResult
} from "@kgos/sdk";
import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  readDiagnosticWithRetry,
  useObservabilityDetail,
  windowFor
} from "./observability-data.js";
import type { Range } from "./observability-data.js";

const firstID = "req_" + "a".repeat(32);
const secondID = "req_" + "b".repeat(32);
const firstDetail = {
  availability: "available",
  coverage: { dropped: 0, truncated: false },
  request: { request_id: firstID, route: "api", outcome: "succeeded" },
  spans: [],
  logs: [
    {
      id: 1,
      time: "2026-11-07T01:00:00Z",
      level: "INFO",
      component: "http",
      event: "first",
      fields: {}
    }
  ],
  next_cursor: "page"
} as unknown as ObservabilityRequestGetResult;
const secondDetail = {
  ...firstDetail,
  request: { ...firstDetail.request, request_id: secondID },
  logs: [{ ...firstDetail.logs[0], id: 2, event: "second" }],
  next_cursor: "page-b"
} as ObservabilityRequestGetResult;
const listing = {
  availability: "available",
  coverage: { dropped: 0, truncated: false },
  items: [{ request_id: firstID }, { request_id: secondID }]
} as unknown as ObservabilityRequestListResult;

it("uses the exact time window for each supported dashboard range", () => {
  for (const [range, hours] of [
    ["1h", 1],
    ["6h", 6],
    ["24h", 24]
  ] as const satisfies readonly (readonly [Range, number])[]) {
    const { from, to } = windowFor(range);
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(hours * 3600000);
  }
});

type Selection = ReturnType<typeof useObservabilityDetail>;
let latest: Selection | null = null;
let root: ReturnType<typeof createRoot>;
let host: HTMLDivElement;

function Probe({ client }: { client: KGOSClient }) {
  latest = useObservabilityDetail(client, listing, 0);
  return <span>{latest.selected ?? "none"}</span>;
}

function selection(): Selection {
  if (latest === null) throw new Error("Missing selection");
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

it("retries a transient request detail failure once and recovers the selected scope", async () => {
  const get = vi
    .fn()
    .mockRejectedValueOnce(
      new KGOSDaemonError({ code: "INTERNAL_ERROR", message: "temporary diagnostic failure" }, 500)
    )
    .mockResolvedValue(firstDetail);
  const client = { system: { observability: { requests: { get } } } } as unknown as KGOSClient;
  await act(async () => {
    root.render(<Probe client={client} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 230));
  });
  expect(get).toHaveBeenCalledTimes(2);
  expect(selection().detail?.request.request_id).toBe(firstID);
  expect(selection().failed).toBe(false);
});

it("cancels a scheduled transport retry when the caller leaves", async () => {
  const controller = new AbortController();
  const rejected = new KGOSTransportError("temporary network error");
  const get = vi
    .fn<() => Promise<ObservabilityRequestGetResult>>()
    .mockRejectedValueOnce(rejected)
    .mockResolvedValue(firstDetail);
  const pending = readDiagnosticWithRetry(() => get(), controller.signal);
  const outcome = expect(pending).rejects.toBe(rejected);
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.abort();
  await outcome;
  expect(get).toHaveBeenCalledTimes(1);
});

it("never exposes old logs or a late page under a newly selected request", async () => {
  let resolveMore: (value: ObservabilityRequestGetResult) => void = () => {
    throw new Error("Pending page was not started");
  };
  let resolveSecond: (value: ObservabilityRequestGetResult) => void = () => {
    throw new Error("Pending request was not started");
  };
  const latePage = new Promise<ObservabilityRequestGetResult>((resolve) => {
    resolveMore = resolve;
  });
  const pendingSecond = new Promise<ObservabilityRequestGetResult>((resolve) => {
    resolveSecond = resolve;
  });
  const get = vi.fn((query: { request_id: string; cursor?: string }) => {
    if (query.request_id === firstID) {
      return query.cursor === undefined ? Promise.resolve(firstDetail) : latePage;
    }
    return pendingSecond;
  });
  const client = { system: { observability: { requests: { get } } } } as unknown as KGOSClient;
  await act(async () => {
    root.render(<Probe client={client} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(selection().detail?.logs[0]?.event).toBe("first");

  let pendingMore: Promise<void> | undefined;
  await act(async () => {
    pendingMore = selection().moreLogs();
    await Promise.resolve();
  });
  act(() => {
    selection().chooseRequest({ request_id: secondID });
  });
  expect(selection().detail).toBeNull();
  expect(selection().paging).toBe(false);

  await act(async () => {
    resolveMore(firstDetail);
    await pendingMore;
  });
  expect(selection().detail).toBeNull();

  await act(async () => {
    resolveSecond(secondDetail);
    await Promise.resolve();
  });
  expect(selection().detail?.request.request_id).toBe(secondID);
  expect(selection().detail?.logs.map((item) => item.event)).toEqual(["second"]);
});
