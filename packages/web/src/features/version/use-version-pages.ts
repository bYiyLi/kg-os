import { useCallback, useEffect, useRef, useState } from "react";

import { loadMoreVersions, loadVersions } from "./version-data.js";
import type { VersionReader, VersionSnapshot } from "./version-data.js";

interface Loaded {
  reader: VersionReader;
  data: VersionSnapshot;
}

export function useVersionPages(reader: VersionReader | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState(false);
  const [refreshID, setRefreshID] = useState(0);
  const generation = useRef(0);
  const pagingAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    pagingAbort.current?.abort();
    setPaging(false);
    setError(false);
    setLoading(reader !== null);
    if (reader !== null) {
      void loadVersions(reader, controller.signal).then(
        (data) => {
          if (generation.current === current && !controller.signal.aborted) {
            setLoaded({ reader, data });
            setLoading(false);
          }
        },
        () => {
          if (generation.current === current && !controller.signal.aborted) {
            setError(true);
            setLoading(false);
          }
        }
      );
    }
    return () => {
      controller.abort();
      pagingAbort.current?.abort();
      generation.current++;
    };
  }, [reader, refreshID]);

  const snapshot = loaded?.reader === reader ? loaded.data : null;
  const refresh = useCallback(() => {
    setRefreshID((value) => value + 1);
  }, []);
  const loadMore = useCallback(
    (selected: ReadonlySet<string>) => {
      if (reader === null || snapshot === null || paging || loading) return;
      const controller = new AbortController();
      const current = generation.current;
      pagingAbort.current?.abort();
      pagingAbort.current = controller;
      setPaging(true);
      setError(false);
      void loadMoreVersions(reader, snapshot, selected, controller.signal).then(
        (data) => {
          if (generation.current === current && !controller.signal.aborted) {
            setLoaded({ reader, data });
            setPaging(false);
          }
        },
        () => {
          if (generation.current === current && !controller.signal.aborted) {
            setError(true);
            setPaging(false);
          }
        }
      );
    },
    [reader, snapshot, paging, loading]
  );
  return { snapshot, loading, paging, error, refresh, loadMore };
}
