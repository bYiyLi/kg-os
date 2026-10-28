import { useCallback, useEffect, useRef, useState } from "react";

import type { VersionHistory } from "../version/use-version-history.js";
import type { DomainReader } from "./domain-data.js";
import { useDomainTree } from "./use-domain-tree.js";

interface DomainSelection {
  world: string;
  state: string;
  ref: string;
  path: string;
}

function useDomainExpansion(
  reader: DomainReader | null,
  world: string | null,
  state: string | null
) {
  const [paths, setPaths] = useState(new Map<string, Set<string>>());
  useEffect(() => {
    setPaths(new Map());
  }, [reader]);
  const key = JSON.stringify([world, state]);
  const expandedDomains: ReadonlySet<string> = paths.get(key) ?? new Set<string>();
  return {
    expandedDomains,
    toggleDomain: (path: string) => {
      setPaths((previous) => {
        const values = new Set(previous.get(key));
        if (values.has(path)) values.delete(path);
        else values.add(path);
        return new Map(previous).set(key, values);
      });
    }
  };
}

function domainState(
  history: VersionHistory,
  roots: ReadonlyMap<string, string>,
  world: string | null
) {
  if (world === null) return null;
  if (world === history.currentWorld) return history.selectedCommit;
  return roots.get(world) ?? history.branches.find((item) => item.name === world)?.state ?? null;
}

export function useWorldNavigation(reader: DomainReader | null, history: VersionHistory) {
  const [expanded, setExpanded] = useState<string | null | undefined>();
  const [selection, setSelection] = useState<DomainSelection | null>(null);
  const roots = useRef(new Map<string, string>());
  const expansionGeneration = useRef(0);
  const [knownEmpty, setKnownEmpty] = useState(new Set<string>());
  useEffect(() => {
    setExpanded(undefined);
    setSelection(null);
    roots.current.clear();
    expansionGeneration.current++;
    setKnownEmpty(new Set());
  }, [reader]);
  let world = expanded === undefined ? history.defaultBranch : expanded;
  if (!history.available) world = null;
  const state = domainState(history, roots.current, world);
  const domains = useDomainTree(reader, state);
  const expansion = useDomainExpansion(reader, world, state);
  useEffect(() => {
    if (domains.tree === null || world === null) return;
    roots.current.set(world, domains.tree.state);
    setKnownEmpty((previous) => {
      const next = new Set(previous);
      if (domains.tree?.roots.length === 0) next.add(JSON.stringify([world, state]));
      else next.delete(JSON.stringify([world, state]));
      return next;
    });
  }, [domains.tree, world, state]);
  const toggleWorld = useCallback(
    (name: string) => {
      expansionGeneration.current++;
      const target = history.branches.find((item) => item.name === name);
      if (target !== undefined && !roots.current.has(name)) roots.current.set(name, target.state);
      setExpanded((previous) => {
        const current = previous === undefined ? history.defaultBranch : previous;
        return current === name ? null : name;
      });
    },
    [history.branches, history.defaultBranch]
  );
  const selectWorld = useCallback(
    (name: string) => {
      const generation = ++expansionGeneration.current;
      const target = history.branches.find((item) => item.name === name);
      if (target === undefined) return;
      history.selectWorld(name, () => {
        setSelection(null);
        roots.current.set(name, target.state);
        if (generation === expansionGeneration.current) setExpanded(name);
      });
    },
    [history]
  );
  const selectDomain = useCallback(
    (ref: string, path: string) => {
      if (world === null || domains.tree === null) return;
      const snapshot = domains.tree.state;
      history.selectWorldSnapshot(world, snapshot, () => {
        setSelection({ world, state: snapshot, ref, path });
      });
    },
    [world, domains.tree, history]
  );
  const selected =
    selection?.world === history.currentWorld && selection.state === history.selectedCommit
      ? selection
      : null;
  return {
    ...domains,
    ...expansion,
    world,
    state,
    selected,
    toggleWorld,
    selectWorld,
    selectDomain,
    clearSelection: () => {
      setSelection(null);
    },
    isEmpty: (name: string) =>
      knownEmpty.has(JSON.stringify([name, domainState(history, roots.current, name)]))
  };
}

export type WorldNavigation = ReturnType<typeof useWorldNavigation>;
