import { useCallback, useEffect, useRef, useState } from "react";
import type { ResolvedState } from "@kgos/sdk";

import { loadDomainTree } from "./domain-data.js";
import type { DomainReader, DomainTree } from "./domain-data.js";

interface CachedTrees {
  reader: DomainReader;
  trees: Map<string, DomainTree>;
}

interface ReadStatus {
  reader: DomainReader;
  state: string;
  loading: boolean;
  error: boolean;
}

export function useDomainTree(reader: DomainReader | null, state: string | null) {
  const cache = useRef<CachedTrees | null>(null);
  const generation = useRef(0);
  const handledAttempt = useRef(0);
  const [status, setStatus] = useState<ReadStatus | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    const reload = attempt !== handledAttempt.current;
    handledAttempt.current = attempt;
    if (cache.current?.reader !== reader) cache.current = null;
    if (reader === null || state === null) {
      setStatus(null);
      return;
    }
    cache.current ??= { reader, trees: new Map() };
    const cached = cache.current.trees.get(state);
    if (cached !== undefined && !reload) {
      setStatus({ reader, state, loading: false, error: false });
      return;
    }
    const controller = new AbortController();
    const current = ++generation.current;
    setStatus({ reader, state, loading: true, error: false });
    void loadDomainTree(reader, state as ResolvedState, controller.signal).then(
      (tree) => {
        if (controller.signal.aborted || current !== generation.current) return;
        if (cache.current?.reader !== reader) return;
        cache.current.trees.set(state, tree);
        setStatus({ reader, state, loading: false, error: false });
      },
      () => {
        if (controller.signal.aborted || current !== generation.current) return;
        setStatus({ reader, state, loading: false, error: true });
      }
    );
    return () => {
      controller.abort();
      generation.current++;
    };
  }, [reader, state, attempt]);

  const tree =
    reader !== null && state !== null && cache.current?.reader === reader
      ? (cache.current.trees.get(state) ?? null)
      : null;
  const active = reader !== null && state !== null;
  const same = active && status?.reader === reader && status.state === state;
  return {
    tree,
    loading: active && (same ? status.loading : tree === null),
    error: same && status.error,
    retry
  };
}
