import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { flattenCommits, hasMore, stateRef, worldTopology } from "./version-data.js";
import type { VersionCommit, VersionReader, VersionSnapshot } from "./version-data.js";
import { useVersionPages } from "./use-version-pages.js";
import { useVersionSelection } from "./use-version-selection.js";

interface SelectedBranches {
  reader: VersionReader;
  names: string[];
}

interface HistoryMode {
  reader: VersionReader;
  value: "world" | "all";
}

interface ExpandedWorld {
  reader: VersionReader;
  name: string | null;
}

export interface VersionHistory {
  branches: VersionSnapshot["branches"];
  retainedWorlds: string[];
  commits: VersionCommit[];
  selectedBranches: ReadonlySet<string>;
  selectedCommit: string | null;
  selectingCommit: string | null;
  loading: boolean;
  ready: boolean;
  loadingMore: boolean;
  error: boolean;
  selectionError: boolean;
  canLoadMore: boolean;
  available: boolean;
  defaultBranch: string | null;
  currentWorld: string | null;
  expandedWorld: string | null;
  expandedHead: string | null;
  expandedWorldMissing: boolean;
  expandedHasNewVersion: boolean;
  expandedPageKey: string | null;
  expandingWorld: string | null;
  expansionError: boolean;
  worldHead: string | null;
  worldMissing: boolean;
  switchingWorld: string | null;
  mode: "world" | "all";
  hasNewVersion: boolean;
  topologyCommits: VersionCommit[];
  topologyHasMore: boolean;
  refsCheckedAt: number | null;
  refsError: boolean;
  checkingRefs: boolean;
  setBranches: (names: string[]) => void;
  selectCommit: (state: string) => void;
  selectWorld: (name: string) => void;
  toggleWorld: (name: string) => void;
  selectWorldCommit: (name: string, state: string) => void;
  setMode: (mode: "world" | "all") => void;
  returnToLatest: () => void;
  loadMore: () => void;
  loadMoreWorld: () => void;
  loadMoreExpandedWorld: () => void;
  refresh: () => void;
  checkRefs: () => void;
}

function useHistoryScope(
  reader: VersionReader | null,
  branches: VersionSnapshot["branches"],
  cancelPaging: () => void
) {
  const [filter, setFilter] = useState<SelectedBranches | null>(null);
  const [chosenMode, setChosenMode] = useState<HistoryMode | null>(null);
  const modeRef = useRef<HistoryMode | null>(null);
  useEffect(() => {
    setFilter(null);
    setChosenMode(null);
    modeRef.current = null;
  }, [reader]);
  const selected = useMemo(
    () =>
      new Set(
        filter?.reader === reader
          ? filter.names.filter((name) => branches.some((branch) => branch.name === name))
          : branches.map((branch) => branch.name)
      ),
    [filter, reader, branches]
  );
  const setBranches = useCallback(
    (names: string[]) => {
      if (reader !== null) setFilter({ reader, names });
    },
    [reader]
  );
  const setMode = useCallback(
    (value: "world" | "all") => {
      const previous = modeRef.current?.reader === reader ? modeRef.current.value : "world";
      if (reader === null || value === previous) return;
      cancelPaging();
      modeRef.current = { reader, value };
      setChosenMode(modeRef.current);
    },
    [reader, cancelPaging]
  );
  return {
    selected,
    setBranches,
    setMode,
    mode: chosenMode?.reader === reader ? chosenMode.value : "world"
  };
}

function useWorldActions(
  snapshot: VersionSnapshot | null,
  selection: ReturnType<typeof useVersionSelection>,
  openWorld: ReturnType<typeof useVersionPages>["openWorld"],
  setMode: VersionHistory["setMode"]
) {
  const branches = snapshot?.branches;
  const selectWorld = useCallback(
    (name: string) => {
      const branch = branches?.find((item) => item.name === name);
      if (branch === undefined) return;
      const root = stateRef(branch.state);
      selection.select(
        root,
        name,
        async (signal) => {
          await openWorld(name, root, signal);
        },
        () => {
          setMode("world");
        }
      );
    },
    [branches, selection.select, openWorld, setMode]
  );
  const returnToLatest = useCallback(() => {
    if (
      selection.world !== null &&
      branches?.some((branch) => branch.name === selection.world) === true
    )
      selectWorld(selection.world);
  }, [selection.world, branches, selectWorld]);
  const selectWorldCommit = useCallback(
    (name: string, state: string) => {
      const requested = state.startsWith("commit/") ? state : "commit/" + state;
      if (snapshot?.pages[name]?.items.some((item) => item.state === requested) !== true) return;
      selection.select(requested, name);
    },
    [snapshot, selection.select]
  );
  return { selectWorld, returnToLatest, selectWorldCommit };
}

function useExpandedWorld(
  reader: VersionReader | null,
  initialWorld: string | null,
  pages: ReturnType<typeof useVersionPages>
) {
  const [expanded, setExpanded] = useState<ExpandedWorld | null>(null);
  const [pending, setPending] = useState<ExpandedWorld | null>(null);
  const [failure, setFailure] = useState<ExpandedWorld | null>(null);
  const opened = useRef<ExpandedWorld | null>(null);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const { snapshot, openWorld, cancelPaging } = pages;
  useEffect(() => {
    setExpanded(null);
    setPending(null);
    setFailure(null);
    opened.current = null;
    return () => {
      active.current?.abort();
      generation.current++;
    };
  }, [reader]);
  let name = reader === null ? null : initialWorld;
  if (reader !== null && expanded?.reader === reader) name = expanded.name;
  const toggle = useCallback(
    (world: string) => {
      const branch = snapshot?.branches.find((item) => item.name === world);
      const cached = snapshot?.pages[world];
      if (reader === null || (branch === undefined && cached === undefined)) return;
      const previous = opened.current?.reader === reader ? opened.current.name : initialWorld;
      const next = previous === world ? null : world;
      cancelPaging();
      const current = ++generation.current;
      active.current?.abort();
      opened.current = { reader, name: next };
      setExpanded(opened.current);
      setPending(null);
      setFailure(null);
      if (next === null || cached !== undefined || branch === undefined) return;
      const controller = new AbortController();
      active.current = controller;
      setPending({ reader, name: world });
      void openWorld(world, stateRef(branch.state), controller.signal, false).then(
        () => {
          if (generation.current === current && !controller.signal.aborted) setPending(null);
        },
        () => {
          if (generation.current !== current || controller.signal.aborted) return;
          controller.abort();
          setPending(null);
          setFailure({ reader, name: world });
        }
      );
    },
    [reader, initialWorld, snapshot, openWorld, cancelPaging]
  );
  const missingPage = name !== null && snapshot?.pages[name] === undefined;
  return {
    name,
    toggle,
    pending: missingPage && pending?.reader === reader && pending.name === name ? name : null,
    error: missingPage && failure?.reader === reader && failure.name === name
  };
}

function worldStatus(snapshot: VersionSnapshot | null, name: string | null) {
  const branch = snapshot?.branches.find((item) => item.name === name);
  const page = name === null ? undefined : snapshot?.pages[name];
  return {
    head: branch?.state ?? null,
    missing: snapshot !== null && name !== null && branch === undefined,
    changed: branch !== undefined && page !== undefined && branch.state !== page.root,
    pageKey:
      page === undefined
        ? null
        : JSON.stringify([name, page.root, page.cursor ?? null, page.items.length])
  };
}

function retainedWorldNames(snapshot: VersionSnapshot | null, names: readonly (string | null)[]) {
  if (snapshot === null) return [];
  const live = new Set(snapshot.branches.map((branch) => branch.name));
  return [...new Set(names)].filter(
    (name): name is string => name !== null && snapshot.pages[name] !== undefined && !live.has(name)
  );
}

// A single owner shares world, history and browsing selection across both hosts.
export function useVersionHistory(
  reader: VersionReader | null,
  initialState: string | null,
  defaultVersionBranch: string | null = null
): VersionHistory {
  const pages = useVersionPages(reader);
  const selection = useVersionSelection(reader, initialState, defaultVersionBranch);
  const branches = useMemo(() => pages.snapshot?.branches ?? [], [pages.snapshot]);
  const scope = useHistoryScope(reader, branches, pages.cancelPaging);
  const { mode, setBranches, setMode } = scope;
  const selectedBranches = scope.selected;
  const currentWorld = selection.world;
  const expanded = useExpandedWorld(reader, defaultVersionBranch, pages);
  const browsingStatus = worldStatus(pages.snapshot, currentWorld);
  const expandedStatus = worldStatus(pages.snapshot, expanded.name);
  const worldNames = useMemo(
    () => new Set(expanded.name === null ? [] : [expanded.name]),
    [expanded.name]
  );
  const shownBranches = mode === "all" ? selectedBranches : worldNames;
  const commits = useMemo(
    () => (pages.snapshot === null ? [] : flattenCommits(pages.snapshot, shownBranches)),
    [pages.snapshot, shownBranches]
  );
  const topologyCommits = useMemo(
    () =>
      pages.snapshot === null || expanded.name === null
        ? []
        : worldTopology(pages.snapshot, expanded.name),
    [pages.snapshot, expanded.name]
  );
  const actions = useWorldActions(pages.snapshot, selection, pages.openWorld, setMode);
  const loadMore = useCallback(() => {
    pages.loadMore(shownBranches);
  }, [pages.loadMore, shownBranches]);
  const loadMoreWorld = useCallback(() => {
    pages.loadMore(worldNames);
  }, [pages.loadMore, worldNames]);

  return {
    branches,
    retainedWorlds: retainedWorldNames(pages.snapshot, [currentWorld, expanded.name]),
    commits,
    selectedBranches,
    selectedCommit: selection.selected,
    selectingCommit: selection.pending,
    loading: reader !== null && (pages.loading || (pages.snapshot === null && !pages.error)),
    ready: pages.snapshot !== null,
    loadingMore: pages.paging,
    error: reader !== null && (pages.error || expanded.error),
    selectionError: selection.error,
    canLoadMore: pages.snapshot !== null && hasMore(pages.snapshot, shownBranches),
    available: reader !== null,
    defaultBranch: reader === null ? null : defaultVersionBranch,
    currentWorld,
    expandedWorld: expanded.name,
    expandedHead: expandedStatus.head,
    expandedWorldMissing: expandedStatus.missing,
    expandedHasNewVersion: expandedStatus.changed,
    expandedPageKey: expandedStatus.pageKey,
    expandingWorld: expanded.pending,
    expansionError: expanded.error,
    worldHead: browsingStatus.head,
    worldMissing: browsingStatus.missing,
    switchingWorld: selection.pendingWorld,
    mode,
    hasNewVersion: browsingStatus.changed,
    topologyCommits,
    topologyHasMore: pages.snapshot !== null && hasMore(pages.snapshot, worldNames),
    refsCheckedAt: pages.refsCheckedAt,
    refsError: pages.refsError,
    checkingRefs: pages.checkingRefs,
    setBranches,
    selectCommit: selection.select,
    selectWorld: actions.selectWorld,
    toggleWorld: expanded.toggle,
    selectWorldCommit: actions.selectWorldCommit,
    setMode,
    returnToLatest: actions.returnToLatest,
    loadMore,
    loadMoreWorld,
    loadMoreExpandedWorld: loadMoreWorld,
    refresh: pages.refresh,
    checkRefs: () => void pages.checkRefs()
  };
}
