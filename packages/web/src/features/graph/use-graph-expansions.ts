import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphData } from "./graph-data.js";
import {
  addExpansion,
  clearPendingExpansion,
  startPendingExpansion,
  visibleGraph
} from "./graph-exploration-state.js";
import type { GraphSources } from "./graph-exploration-state.js";
import { expandKnowledge } from "./graph-search.js";
import type { GraphReader } from "./graph-search.js";

export interface GraphNotice {
  kind: "expanded" | "empty" | "collapsed" | "hidden" | "restored" | "expandFailed";
  id: string;
  count?: number;
}

interface ExpansionContext {
  reader: GraphReader | null;
  state: ResolvedState | null;
  domain?: string | undefined;
  searching: boolean;
  getSources: () => GraphSources;
  update: (change: (sources: GraphSources) => GraphSources) => void;
  onNotice: (notice: GraphNotice | null) => void;
}

function membership(
  setter: Dispatch<SetStateAction<ReadonlySet<string>>>,
  id: string,
  present: boolean
) {
  setter((previous) => {
    const next = new Set(previous);
    if (present) next.add(id);
    else next.delete(id);
    return next;
  });
}

function expansionNotice(id: string, data: GraphData): GraphNotice {
  return {
    id,
    kind: data.relationships.length === 0 && !data.limited ? "empty" : "expanded",
    count: data.relationships.length
  };
}

export function useGraphExpansions(context: ExpansionContext) {
  const requests = useRef(new Map<string, AbortController>());
  const [loading, setLoading] = useState<ReadonlySet<string>>(new Set());
  const [failures, setFailures] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const active = requests.current;
    return () => {
      for (const request of active.values()) request.abort();
      active.clear();
    };
  }, []);

  function cancel(id: string) {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
    membership(setLoading, id, false);
    membership(setFailures, id, false);
  }

  function reset() {
    for (const request of requests.current.values()) request.abort();
    requests.current.clear();
    setLoading(new Set());
    setFailures(new Set());
  }

  async function expand(id: string) {
    const { reader, state, searching } = context;
    if (reader === null || state === null || searching || requests.current.has(id)) return;
    const sources = context.getSources();
    if (!visibleGraph(sources).nodes.some((node) => node.id === id)) return;
    const previous = sources.expansions.get(id);
    if (previous !== undefined) {
      context.onNotice(expansionNotice(id, previous));
      return;
    }
    const controller = new AbortController();
    requests.current.set(id, controller);
    context.update((current) => startPendingExpansion(current, id));
    membership(setLoading, id, true);
    membership(setFailures, id, false);
    context.onNotice(null);
    try {
      const scope =
        context.domain === undefined
          ? controller.signal
          : { signal: controller.signal, domain: context.domain };
      const addition = await expandKnowledge(reader, state, id, scope);
      if (controller.signal.aborted || requests.current.get(id) !== controller) return;
      context.update((current) => addExpansion(current, id, addition));
      const accepted = context.getSources().expansions.get(id);
      context.onNotice({
        ...expansionNotice(id, addition),
        count: accepted?.relationships.length ?? 0
      });
    } catch {
      if (!controller.signal.aborted) {
        membership(setFailures, id, true);
        context.onNotice({ kind: "expandFailed", id });
      }
    } finally {
      if (requests.current.get(id) === controller) {
        requests.current.delete(id);
        context.update((current) => clearPendingExpansion(current, id));
        membership(setLoading, id, false);
      }
    }
  }

  return {
    expand,
    cancel,
    reset,
    loading,
    failures,
    hasRequest: (id: string) => requests.current.has(id)
  };
}
