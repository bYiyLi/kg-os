import { useCallback, useEffect, useRef, useState } from "react";

import { stateRef } from "./version-data.js";
import type { VersionReader } from "./version-data.js";

interface SelectedCommit {
  reader: VersionReader;
  state: string;
  world: string | null;
  revision: number;
}

interface PendingSelection {
  reader: VersionReader;
  state: string;
  world: string | null;
}

export function useVersionSelection(
  reader: VersionReader | null,
  initialState: string | null,
  initialWorld: string | null
) {
  const [chosen, setChosen] = useState<SelectedCommit | null>(null);
  const [pending, setPending] = useState<PendingSelection | null>(null);
  const [failure, setFailure] = useState<VersionReader | null>(null);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const world = chosen?.reader === reader ? chosen.world : initialWorld;

  useEffect(() => {
    setChosen(null);
    setPending(null);
    setFailure(null);
    return () => {
      abort.current?.abort();
      generation.current++;
    };
  }, [reader]);

  const select = useCallback(
    (
      state: string,
      nextWorld: string | null = null,
      prepare?: (signal: AbortSignal) => Promise<void>,
      onSelected?: () => void
    ) => {
      if (reader === null) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const current = ++generation.current;
      setFailure(null);
      setPending({ reader, state, world: nextWorld ?? null });
      void (async () => {
        try {
          const requested = stateRef(state);
          const result = await reader.get({ state: requested }, { signal: controller.signal });
          controller.signal.throwIfAborted();
          if (stateRef(result.state) !== requested) throw new Error("Version resolution changed");
          await prepare?.(controller.signal);
          if (current !== generation.current || controller.signal.aborted) return;
          setChosen({ reader, state: requested, world: nextWorld, revision: current });
          onSelected?.();
          setPending(null);
        } catch {
          if (current !== generation.current || controller.signal.aborted) return;
          setFailure(reader);
          setPending(null);
        }
      })();
    },
    [reader]
  );

  let active: PendingSelection | null = null;
  if (reader !== null && pending?.reader === reader) active = pending;
  let selected: string | null = null;
  if (reader !== null) {
    selected = initialState === null ? null : stateRef(initialState);
    if (chosen?.reader === reader) selected = chosen.state;
  }
  return {
    selected,
    revision: chosen?.reader === reader ? chosen.revision : 0,
    world: reader === null ? null : world,
    pending: active?.state ?? null,
    pendingWorld: active?.world ?? null,
    error: reader !== null && failure === reader,
    select
  };
}
