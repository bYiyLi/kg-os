import { useMemo, useRef, useState } from "react";
import type { ResolvedState } from "@kgos/sdk";

import type { GraphData } from "./graph-data.js";
import {
  emptySources,
  hideElement,
  removeExpansion,
  replaceSeeds,
  restoreHidden,
  visibleGraph
} from "./graph-exploration-state.js";
import type { GraphSources } from "./graph-exploration-state.js";
import { useGraphExpansions } from "./use-graph-expansions.js";
import type { GraphNotice } from "./use-graph-expansions.js";
import type { GraphReader } from "./graph-search.js";

function useGraphSources() {
  const [sources, setSources] = useState(emptySources);
  const current = useRef(sources);
  const update = (change: (previous: GraphSources) => GraphSources) => {
    // Compute against current sources before scheduling React's render so
    // independent reads merge safely and errors stay inside the read operation.
    const next = change(current.current);
    current.current = next;
    setSources(next);
  };
  return { sources, update, getSources: () => current.current };
}

export function useGraphSelection(context: {
  reader: GraphReader | null;
  state: ResolvedState | null;
  searching: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const select = (id: string | null) => {
    setSelected(id);
    setHighlighted(null);
  };
  const focusNode = (id: string) => {
    setSelected(null);
    setHighlighted(id);
  };
  const [notice, onNotice] = useState<GraphNotice | null>(null);
  const store = useGraphSources();
  const expansions = useGraphExpansions({ ...context, ...store, onNotice });
  const data = useMemo(() => visibleGraph(store.sources), [store.sources]);

  function reset() {
    expansions.reset();
    store.update(emptySources);
    select(null);
    onNotice(null);
  }

  function collapse(id = selected) {
    if (id === null || context.searching) return;
    expansions.cancel(id);
    store.update((sources) => removeExpansion(sources, id));
    onNotice({ kind: "collapsed", id });
  }

  function toggleExpand(id: string) {
    if (context.searching) return;
    setHighlighted(id);
    if (expansions.hasRequest(id) || store.getSources().expansions.has(id)) collapse(id);
    else void expansions.expand(id);
  }

  function hide(id = selected) {
    if (id === null || context.searching) return;
    expansions.cancel(id);
    store.update((sources) => hideElement(sources, id));
    setSelected((current) => (current === id ? null : current));
    setHighlighted((current) => (current === id ? null : current));
    onNotice({ kind: "hidden", id });
  }

  function undoHide() {
    const id = store.getSources().lastHidden;
    if (id === null || context.searching) return;
    store.update(restoreHidden);
    onNotice({ kind: "restored", id });
  }

  return {
    data,
    highlighted,
    getSeeds: () => store.getSources().seed,
    setSeeds: (seed: GraphData) => {
      store.update((sources) => replaceSeeds(sources, seed));
    },
    selected,
    select,
    focusNode,
    reset,
    notice,
    expand: (id = selected) => (id === null ? Promise.resolve() : expansions.expand(id)),
    collapse,
    toggleExpand,
    expanded: new Set(store.sources.expansions.keys()),
    expandingIds: expansions.loading,
    expanding: selected !== null && expansions.loading.has(selected),
    expandFailed: selected !== null && expansions.failures.has(selected),
    hide,
    undoHide,
    canUndoHide: store.sources.lastHidden !== null
  };
}
