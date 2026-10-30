import { useEffect, useRef, useState } from "react";
import type { ResolvedState } from "@kgos/sdk";

import { mergeGraph } from "./graph-data.js";
import type { GraphData } from "./graph-data.js";
import { connectKnowledge, searchKnowledge } from "./graph-search.js";
import type { GraphReader, SearchRoute } from "./graph-search.js";

interface SearchTask {
  generation: number;
  controller: AbortController;
}

interface SearchContext {
  reader: GraphReader | null;
  state: ResolvedState | null;
  domain?: string | undefined;
  setBusy: (busy: boolean) => void;
  setSeeds: (seed: GraphData) => void;
  getSeeds: () => GraphData;
  reset: () => void;
}

function failPendingRoutes(routes: SearchRoute[] | null): SearchRoute[] | null {
  return (
    routes?.map((route) =>
      route.status === "loading" ? { ...route, status: "error", limited: true } : route
    ) ?? null
  );
}

function useSearchTask(setBusy: SearchContext["setBusy"]) {
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      generation.current++;
      request.current?.abort();
    },
    []
  );
  const current = (task: SearchTask) =>
    !task.controller.signal.aborted && task.generation === generation.current;
  function cancel() {
    generation.current++;
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }
  function begin() {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    return { generation: ++generation.current, controller };
  }
  function finish(task: SearchTask) {
    if (!current(task)) return;
    request.current = null;
    setBusy(false);
  }
  return { begin, current, cancel, finish, running: () => request.current !== null };
}

export function useGraphSearch(context: SearchContext) {
  const [routes, setRoutes] = useState<SearchRoute[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [linksFailed, setLinksFailed] = useState(false);
  const [scene, setScene] = useState(0);
  const task = useSearchTask(context.setBusy);

  function clear() {
    task.cancel();
    context.reset();
    setFailed(false);
    setLinksFailed(false);
    setRoutes(null);
  }

  async function linkSeeds(active: SearchTask, seed: GraphData) {
    const { reader, state } = context;
    if (reader === null || state === null || seed.nodes.length === 0) return;
    try {
      const scope =
        context.domain === undefined
          ? active.controller.signal
          : { signal: active.controller.signal, domain: context.domain };
      const links = await connectKnowledge(
        reader,
        state,
        seed.nodes.map((node) => node.id),
        scope
      );
      if (!task.current(active)) return;
      context.setSeeds(mergeGraph(seed, links));
      setLinksFailed(false);
    } catch {
      if (task.current(active)) setLinksFailed(true);
    }
  }

  async function search(query: string) {
    const { reader, state } = context;
    if (reader === null || state === null) return;
    clear();
    const active = task.begin();
    setScene((value) => value + 1);
    try {
      const publish = (progress: Awaited<ReturnType<typeof searchKnowledge>>) => {
        if (!task.current(active)) return;
        context.setSeeds(progress.data);
        setRoutes(progress.routes);
      };
      const result = await searchKnowledge(reader, state, query.trim(), {
        signal: active.controller.signal,
        domain: context.domain,
        onProgress: publish
      });
      if (!task.current(active)) return;
      publish(result);
      await linkSeeds(active, result.data);
    } catch {
      if (task.current(active)) {
        task.cancel();
        setFailed(true);
        setRoutes(failPendingRoutes);
      }
    } finally {
      task.finish(active);
    }
  }

  async function retryLinks() {
    if (task.running() || context.reader === null || context.state === null) return;
    const active = task.begin();
    try {
      await linkSeeds(active, context.getSeeds());
    } finally {
      task.finish(active);
    }
  }

  return { routes, failed, linksFailed, scene, clear, search, retryLinks };
}
