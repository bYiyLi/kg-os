import { useEffect, useState } from "react";
import type { KGOSClient, ObservabilityLogListInput, ObservabilityLogListResult } from "@kgos/sdk";

import { diagnosticFailureRef, readDiagnosticWithRetry, windowFor } from "./observability-data.js";
import type { Range } from "./observability-data.js";

export type LogLevelFilter = "" | "DEBUG" | "INFO" | "WARN" | "ERROR";

// A real Instance-wide log timeline. The server performs bounded, guarded
// pagination; no N+1 query over recent Requests or local log-file reads.
export function useObservabilityLogStream(
  client: KGOSClient,
  {
    range,
    level,
    revision,
    autoRefresh
  }: {
    range: Range;
    level: LogLevelFilter;
    revision: number;
    autoRefresh: boolean;
  }
) {
  const [listing, setListing] = useState<ObservabilityLogListResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [failureRef, setFailureRef] = useState<string | null>(null);
  const [paging, setPaging] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const query = () => {
      const input: ObservabilityLogListInput = { ...windowFor(range), limit: 50 };
      if (level !== "") input.level = level;
      void readDiagnosticWithRetry(
        () => client.system.observability.logs.list(input, { signal: controller.signal }),
        controller.signal
      ).then(
        (response) => {
          if (!controller.signal.aborted) {
            setListing(response);
            setFailed(false);
            setFailureRef(null);
          }
        },
        (error: unknown) => {
          if (!controller.signal.aborted) {
            setFailed(true);
            setFailureRef(diagnosticFailureRef(error));
          }
        }
      );
    };
    query();
    const timer = autoRefresh
      ? window.setInterval(() => {
          if (!document.hidden) query();
        }, 30000)
      : undefined;
    const onVisible = () => {
      if (!document.hidden) query();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      controller.abort();
      if (timer !== undefined) window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [client, range, level, revision, autoRefresh]);

  async function moreLogs() {
    if (listing?.next_cursor === undefined || paging) return;
    setPaging(true);
    try {
      const input: ObservabilityLogListInput = {
        ...windowFor(range),
        limit: 50,
        cursor: listing.next_cursor
      };
      if (level !== "") input.level = level;
      const more = await client.system.observability.logs.list(input);
      setListing((current) =>
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

  return { listing, failed, failureRef, paging, moreLogs };
}
