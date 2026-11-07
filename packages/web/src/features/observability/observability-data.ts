import { useCallback, useEffect, useRef, useState } from "react";
import { KGOSDaemonError, KGOSTransportError } from "@kgos/sdk";
import type {
  KGOSClient,
  ObservabilityOverviewResult,
  ObservabilityRequest,
  ObservabilityRequestGetResult,
  ObservabilityRequestListInput,
  ObservabilityRequestListResult
} from "@kgos/sdk";

export type Range = "1h" | "6h" | "24h";
export type RouteFilter = "" | "api" | "mcp" | "web_auth" | "oauth";
export type OutcomeFilter = "" | "succeeded" | "error" | "incomplete";

export interface ObservabilityFilters {
  range: Range;
  route: RouteFilter;
  outcome: OutcomeFilter;
  slow: boolean;
}

// Surface only validated public codes and server-issued request IDs. Never
// show raw exceptions, URLs, response bodies or other user-provided strings.
export function diagnosticFailureRef(error: unknown): string | null {
  if (!(error instanceof KGOSDaemonError) && !(error instanceof KGOSTransportError)) return null;
  let code = "TRANSPORT_ERROR";
  if (error instanceof KGOSDaemonError) {
    code = /^[A-Z][A-Z_0-9]{1,47}$/.test(error.code) ? error.code : "INTERNAL_ERROR";
  }
  const id =
    typeof error.requestId === "string" && /^req_[0-9a-f]{32}$/.test(error.requestId)
      ? error.requestId
      : null;
  return id === null ? code : `${code} · ${id}`;
}

// Retry one transient diagnostic read. Authentication, validation, and canceled
// requests are never replayed; all four diagnostic endpoints are read-only.
export async function readDiagnosticWithRetry<T>(
  read: () => Promise<T>,
  signal: AbortSignal
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    const retryable =
      (error instanceof KGOSDaemonError && error.status >= 500) ||
      (error instanceof KGOSTransportError && !error.aborted);
    if (!retryable || signal.aborted) throw error;
    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        window.clearTimeout(timer);
        reject(error);
      };
      const timer = window.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, 180);
      signal.addEventListener("abort", onAbort, { once: true });
    });
    return read();
  }
}

export function windowFor(range: Range) {
  let hours = 24;
  if (range === "1h") hours = 1;
  if (range === "6h") hours = 6;
  const now = Date.now();
  return {
    from: new Date(now - hours * 3600000).toISOString(),
    to: new Date(now).toISOString()
  };
}

function listInput(range: Range, route: RouteFilter, outcome: OutcomeFilter, slow: boolean) {
  const query: ObservabilityRequestListInput = { ...windowFor(range), limit: 50, slow };
  if (route !== "") query.route = route;
  if (outcome !== "") query.outcome = outcome;
  return query;
}

// The page never scans local logs or caches the full diagnostic database.
// All requests are bounded, cancellable and use the existing guarded SDK.
export function useObservabilitySummary(
  client: KGOSClient,
  filters: ObservabilityFilters,
  revision: number,
  autoRefresh = true
) {
  const { range, route, outcome, slow } = filters;
  const [overview, setOverview] = useState<ObservabilityOverviewResult | null>(null);
  const [requests, setRequests] = useState<ObservabilityRequestListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [failureRef, setFailureRef] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);

  const refresh = useCallback(
    async (signal: AbortSignal) => {
      try {
        const overviewInput = windowFor(range);
        const requestInput = listInput(range, route, outcome, slow);
        const [nextOverview, nextRequests] = await Promise.all([
          readDiagnosticWithRetry(
            () => client.system.observability.overview(overviewInput, { signal }),
            signal
          ),
          readDiagnosticWithRetry(
            () => client.system.observability.requests.list(requestInput, { signal }),
            signal
          )
        ]);
        if (signal.aborted) return;
        setOverview(nextOverview);
        setRequests(nextRequests);
        setFailed(false);
        setFailureRef(null);
        setLoading(false);
      } catch (error) {
        if (!signal.aborted) {
          setFailed(true);
          setFailureRef(diagnosticFailureRef(error));
          setLoading(false);
        }
      }
    },
    [client, range, route, outcome, slow]
  );

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void refresh(controller.signal);
    const timer = autoRefresh
      ? window.setInterval(() => {
          if (!document.hidden) void refresh(controller.signal);
        }, 30000)
      : undefined;
    const visible = () => {
      if (!document.hidden) void refresh(controller.signal);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, revision, autoRefresh]);

  async function moreRequests(): Promise<void> {
    if (requests?.next_cursor === undefined || paging) return;
    setPaging(true);
    try {
      const query = listInput(range, route, outcome, slow);
      query.cursor = requests.next_cursor;
      const more = await client.system.observability.requests.list(query);
      setRequests((current) =>
        current === null ? more : { ...more, items: [...current.items, ...more.items] }
      );
      setFailed(false);
      setFailureRef(null);
    } catch (error) {
      setFailed(true);
      setFailureRef(diagnosticFailureRef(error));
    } finally {
      setPaging(false);
    }
  }

  return { overview, requests, loading, failed, failureRef, paging, moreRequests };
}

function detailQuery(requestID: string, spanID: string | null, cursor?: string) {
  return {
    request_id: requestID,
    limit: 100,
    ...(cursor === undefined ? {} : { cursor }),
    ...(spanID === null ? {} : { span_id: spanID })
  };
}

function appendDetailLogs(
  current: ObservabilityRequestGetResult | null,
  page: ObservabilityRequestGetResult
): ObservabilityRequestGetResult {
  return current === null ? page : { ...page, logs: [...current.logs, ...page.logs] };
}

function useDefaultRequestSelection(
  requests: ObservabilityRequestListResult | null,
  selected: string | null,
  setSelected: (value: string | null) => void
) {
  useEffect(() => {
    if (selected === null && requests !== null && requests.items.length > 0) {
      setSelected(requests.items[0]?.request_id ?? null);
    }
  }, [requests, selected, setSelected]);
}

export function useObservabilityDetail(
  client: KGOSClient,
  requests: ObservabilityRequestListResult | null,
  revision: number
) {
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedSpan, setSelectedSpan] = useState<string | null>(null);
  const [detail, setDetail] = useState<ObservabilityRequestGetResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [failure, setFailure] = useState<{ failed: boolean; ref: string | null }>({
    failed: false,
    ref: null
  });
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const scope = selected === null ? null : `${selected}:${selectedSpan ?? ""}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  // Do not expose a previous Request or Span's logs under the new selection.
  const scopedDetail = loadedScope === scope ? detail : null;

  useDefaultRequestSelection(requests, selected, setSelected);

  useEffect(() => {
    if (selected === null) {
      setDetail(null);
      setLoadedScope(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailure({ failed: false, ref: null });
    setPaging(false);
    const request = detailQuery(selected, selectedSpan);
    void readDiagnosticWithRetry(
      () => client.system.observability.requests.get(request, { signal: controller.signal }),
      controller.signal
    ).then(
      (response) => {
        if (!controller.signal.aborted) {
          setDetail(response);
          setLoadedScope(scope);
          setLoading(false);
          setFailure({ failed: false, ref: null });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setDetail(null);
          setLoadedScope(null);
          setLoading(false);
          setFailure({ failed: true, ref: diagnosticFailureRef(error) });
        }
      }
    );
    return () => {
      controller.abort();
    };
  }, [client, selected, selectedSpan, revision, scope]);

  function chooseRequest(item: Pick<ObservabilityRequest, "request_id">): void {
    setSelected(item.request_id);
    setSelectedSpan(null);
  }

  async function moreLogs(): Promise<void> {
    if (selected === null || scopedDetail?.next_cursor === undefined || paging) return;
    setPaging(true);
    try {
      const request = detailQuery(selected, selectedSpan, scopedDetail.next_cursor);
      const more = await client.system.observability.requests.get(request);
      if (scopeRef.current !== scope) return;
      setDetail((current) => appendDetailLogs(current, more));
      setFailure({ failed: false, ref: null });
    } catch (error) {
      if (scopeRef.current === scope) {
        setFailure({ failed: true, ref: diagnosticFailureRef(error) });
      }
    } finally {
      if (scopeRef.current === scope) setPaging(false);
    }
  }

  return {
    selected,
    selectedSpan,
    setSelectedSpan,
    detail: scopedDetail,
    loading,
    paging,
    failed: failure.failed,
    failureRef: failure.ref,
    chooseRequest,
    moreLogs
  };
}
