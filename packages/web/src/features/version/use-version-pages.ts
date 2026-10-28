import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ResolvedState } from "@kgos/sdk";

import {
  loadMoreVersions,
  loadMissingVersions,
  loadWorldVersions,
  readVersionRefs
} from "./version-data.js";
import type { VersionReader, VersionSnapshot } from "./version-data.js";

interface Loaded {
  reader: VersionReader;
  data: VersionSnapshot;
}

interface PageStore {
  reader: VersionReader | null;
  snapshot: VersionSnapshot | null;
  generation: RefObject<number>;
  loadedRef: RefObject<Loaded | null>;
  loadingRef: RefObject<boolean>;
  setLoaded: Dispatch<SetStateAction<Loaded | null>>;
}

function mergePages(snapshot: VersionSnapshot, pages: VersionSnapshot["pages"]): VersionSnapshot {
  return {
    ...snapshot,
    pages: Object.assign(Object.create(null) as VersionSnapshot["pages"], snapshot.pages, pages)
  };
}

function continuedPages(
  latest: VersionSnapshot,
  original: VersionSnapshot,
  update: VersionSnapshot,
  selected: ReadonlySet<string>
): VersionSnapshot {
  const pages = Object.create(null) as VersionSnapshot["pages"];
  for (const name of selected) {
    const next = update.pages[name];
    if (next !== undefined && latest.pages[name]?.root === original.pages[name]?.root)
      pages[name] = next;
  }
  return mergePages(latest, pages);
}

function useRefSchedule(ready: boolean, check: () => Promise<void>, failed: RefObject<boolean>) {
  useEffect(() => {
    if (!ready) return;
    let delay = 15_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const isClosed = () => closed;
    let observing = false;
    const observe = async () => {
      if (isClosed() || observing || document.visibilityState === "hidden") return;
      observing = true;
      await check();
      observing = false;
      if (isClosed()) return;
      delay = failed.current ? Math.min(delay * 2, 120_000) : 15_000;
      timer = setTimeout(() => void observe(), delay);
    };
    const focused = () => {
      clearTimeout(timer);
      void observe();
    };
    if (document.visibilityState !== "hidden") timer = setTimeout(() => void observe(), delay);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    return () => {
      closed = true;
      clearTimeout(timer);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
    };
  }, [ready, check, failed]);
}

function useVersionObservation({ reader, generation, setLoaded, snapshot, loadingRef }: PageStore) {
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const active = useRef<AbortController | null>(null);
  const failed = useRef(false);
  const abort = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setChecking(false);
    setError(false);
  }, []);
  const didLoad = useCallback((success: boolean) => {
    setError(!success);
    failed.current = !success;
    if (success) setCheckedAt(Date.now());
  }, []);
  const check = useCallback(async () => {
    if (
      reader === null ||
      loadingRef.current ||
      active.current !== null ||
      document.visibilityState === "hidden"
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    const current = generation.current;
    setChecking(true);
    try {
      const refs = await readVersionRefs(reader, controller.signal);
      if (current !== generation.current || controller.signal.aborted) return;
      setLoaded((previous) =>
        previous?.reader === reader ? { reader, data: { ...previous.data, ...refs } } : previous
      );
      didLoad(true);
    } catch {
      if (current !== generation.current || controller.signal.aborted) return;
      controller.abort();
      didLoad(false);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setChecking(false);
      }
    }
  }, [reader, generation, setLoaded, didLoad, loadingRef]);
  useRefSchedule(reader !== null && snapshot !== null, check, failed);
  return { checkedAt, error, checking, check, abort, didLoad };
}

function useWorldPage({ reader, generation, loadedRef, setLoaded }: PageStore) {
  return useCallback(
    async (name: string, root: ResolvedState, signal: AbortSignal, replace = true) => {
      if (reader === null) throw new Error("No version connection");
      const current = generation.current;
      const previous = loadedRef.current;
      if (previous?.reader !== reader) throw new Error("No version history");
      const cached = previous.data.pages[name];
      if (cached?.root === root || (!replace && cached !== undefined)) return;
      const pages = await loadWorldVersions(reader, name, root, signal);
      signal.throwIfAborted();
      if (generation.current !== current) throw new Error("Version connection changed");
      setLoaded((latest) => {
        if (latest?.reader !== reader || (!replace && latest.data.pages[name] !== undefined))
          return latest;
        return { reader, data: mergePages(latest.data, pages) };
      });
    },
    [reader, generation, loadedRef, setLoaded]
  );
}

interface FailedPageRequest {
  reader: VersionReader;
  snapshot: VersionSnapshot;
  selected: ReadonlySet<string>;
  missing: boolean;
}

function useVersionPaging(store: PageStore, loading: boolean) {
  const { reader, snapshot, generation, setLoaded } = store;
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef<AbortController | null>(null);
  const failed = useRef<FailedPageRequest | null>(null);
  const abort = useCallback(() => {
    active.current?.abort();
    active.current = null;
    failed.current = null;
    setPaging(false);
    setError(false);
  }, []);
  const load = useCallback(
    (selected: ReadonlySet<string>, missing: boolean, retrySnapshot?: VersionSnapshot) => {
      const source = retrySnapshot ?? snapshot;
      if (reader === null || source === null || paging || loading) return;
      const pending = missing
        ? source.branches.some(
            (branch) => selected.has(branch.name) && source.pages[branch.name] === undefined
          )
        : [...selected].some((name) => source.pages[name]?.cursor !== undefined);
      if (!pending) return;
      const controller = new AbortController();
      const current = generation.current;
      active.current?.abort();
      active.current = controller;
      setPaging(true);
      setError(false);
      failed.current = null;
      const readPages = missing ? loadMissingVersions : loadMoreVersions;
      void readPages(reader, source, selected, controller.signal).then(
        (data) => {
          if (generation.current !== current || controller.signal.aborted) return;
          setLoaded((previous) =>
            previous?.reader === reader
              ? { reader, data: continuedPages(previous.data, source, data, selected) }
              : previous
          );
          setPaging(false);
        },
        () => {
          if (generation.current !== current || controller.signal.aborted) return;
          controller.abort();
          failed.current = { reader, snapshot: source, selected: new Set(selected), missing };
          setError(true);
          setPaging(false);
        }
      );
    },
    [reader, snapshot, paging, loading, generation, setLoaded]
  );
  const openWorld = useWorldPage(store);
  const loadMore = useCallback(
    (selected: ReadonlySet<string>) => {
      load(selected, false);
    },
    [load]
  );
  const ensurePages = useCallback(
    (selected: ReadonlySet<string>) => {
      load(selected, true);
    },
    [load]
  );
  const retry = useCallback(() => {
    const request = failed.current;
    if (request?.reader === reader) load(request.selected, request.missing, request.snapshot);
  }, [reader, load]);
  return { paging, error, abort, loadMore, ensurePages, openWorld, retry };
}

export function useVersionPages(reader: VersionReader | null) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [refreshID, setRefreshID] = useState(0);
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const generation = useRef(0);
  const loadedRef = useRef<Loaded | null>(null);
  const loadingRef = useRef(false);
  loadedRef.current = loaded;
  const snapshot = loaded?.reader === reader ? loaded.data : null;
  const store = { reader, snapshot, generation, loadedRef, setLoaded, loadingRef };
  const observation = useVersionObservation(store);
  const paging = useVersionPaging(store, loading);
  const { abort: abortObservation, didLoad } = observation;
  const abortPaging = paging.abort;
  useEffect(() => {
    const controller = new AbortController();
    const current = ++generation.current;
    abortPaging();
    abortObservation();
    setError(false);
    loadingRef.current = reader !== null;
    setLoading(reader !== null);
    if (reader === null) {
      setLoaded(null);
    } else {
      void readVersionRefs(reader, controller.signal).then(
        (refs) => {
          const data = { ...refs, pages: Object.create(null) as VersionSnapshot["pages"] };
          if (generation.current !== current || controller.signal.aborted) return;
          setLoaded((previous) => {
            if (previous?.reader !== reader) return { reader, data };
            const pages = Object.assign(
              Object.create(null) as VersionSnapshot["pages"],
              previous.data.pages,
              data.pages
            );
            return { reader, data: { ...data, pages } };
          });
          didLoad(true);
          setDirectoryRevision((value) => value + 1);
          loadingRef.current = false;
          setLoading(false);
        },
        () => {
          if (generation.current !== current || controller.signal.aborted) return;
          controller.abort();
          setError(true);
          didLoad(false);
          loadingRef.current = false;
          setLoading(false);
        }
      );
    }
    return () => {
      controller.abort();
      loadingRef.current = false;
      abortPaging();
      abortObservation();
      generation.current++;
    };
  }, [reader, refreshID, abortPaging, abortObservation, didLoad]);
  const refresh = useCallback(() => {
    setRefreshID((value) => value + 1);
  }, []);
  return {
    snapshot,
    loading,
    directoryRevision,
    paging: paging.paging,
    error: error || paging.error,
    directoryError: error,
    pagingError: paging.error,
    retryPaging: paging.retry,
    refresh,
    loadMore: paging.loadMore,
    ensurePages: paging.ensurePages,
    cancelPaging: paging.abort,
    openWorld: paging.openWorld,
    checkRefs: observation.check,
    refsCheckedAt: snapshot === null ? null : observation.checkedAt,
    refsError: snapshot !== null && observation.error,
    checkingRefs: snapshot !== null && observation.checking
  };
}
