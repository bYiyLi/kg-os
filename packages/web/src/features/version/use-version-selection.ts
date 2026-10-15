import { useCallback, useEffect, useRef, useState } from "react";

import { stateRef } from "./version-data.js";
import type { VersionReader } from "./version-data.js";

interface SelectedCommit {
  reader: VersionReader;
  state: string;
}

export function useVersionSelection(reader: VersionReader | null, initialState: string | null) {
  const [chosen, setChosen] = useState<SelectedCommit | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const generation = useRef(0);
  const abort = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abort.current?.abort();
      generation.current++;
    },
    [reader]
  );

  const select = useCallback(
    (state: string) => {
      if (reader === null) return;
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const current = ++generation.current;
      setError(false);
      setPending(state);
      void reader.get({ state: stateRef(state) }, { signal: controller.signal }).then(
        (result) => {
          if (current !== generation.current || controller.signal.aborted) return;
          if (typeof result.state === "string" && stateRef(result.state) === stateRef(state))
            setChosen({ reader, state: stateRef(result.state) });
          else setError(true);
          setPending(null);
        },
        () => {
          if (current !== generation.current || controller.signal.aborted) return;
          setError(true);
          setPending(null);
        }
      );
    },
    [reader]
  );

  const defaultSelection = initialState === null ? null : stateRef(initialState);
  return {
    selected: chosen?.reader === reader ? chosen.state : defaultSelection,
    pending: reader === null ? null : pending,
    error: reader !== null && error,
    select
  };
}
