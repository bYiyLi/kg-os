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
  root?: string;
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
  selectWorld: (name: string, onSelected?: () => void) => void;
  selectWorldSnapshot: (name: string, state: string, onSelected?: () => void) => void;
  openHistory: (name: string) => void;
  retryHistory: () => void;
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
  syncHistory: (name: string, root: string) => void,
  setMode: VersionHistory["setMode"]
) {
  const branches = snapshot?.branches;
  const selectWorld = useCallback(
    (name: string, onSelected?: () => void) => {
      const branch = branches?.find((item) => item.name === name);
      if (branch === undefined) return;
      const root = stateRef(branch.state);
      selection.select(root, name, undefined, () => {
        setMode("world");
        syncHistory(name, root);
        onSelected?.();
      });
    },
    [branches, selection.select, syncHistory, setMode]
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
  const selectWorldSnapshot = useCallback(
    (name: string, state: string, onSelected?: () => void) => {
      if (branches?.some((branch) => branch.name === name) !== true && selection.world !== name)
        return;
      selection.select(state, name, undefined, onSelected);
    },
    [branches, selection.select, selection.world]
  );
  return { selectWorld, returnToLatest, selectWorldCommit, selectWorldSnapshot };
}

function useExpandedWorld(reader: VersionReader | null, pages: ReturnType<typeof useVersionPages>) {
  const [expanded, setExpanded] = useState<ExpandedWorld | null>(null);
  const [pending, setPending] = useState<ExpandedWorld | null>(null);
  const [failure, setFailure] = useState<ExpandedWorld | null>(null);
  const opened = useRef<ExpandedWorld | null>(null);
  const expected = useRef(new Map<string, string>());
  const latest = useRef(pages.snapshot);
  latest.current = pages.snapshot;
  const { openWorld, cancelPaging, loading, directoryRevision } = pages;
  const name = reader !== null && expanded?.reader === reader ? expanded.name : null;
  useEffect(() => {
    setExpanded(null);
    opened.current = null;
    expected.current.clear();
  }, [reader]);
  const open = useCallback(
    (world: string | null, root?: string) => {
      const snapshot = latest.current;
      const requested = root ?? (world === null ? undefined : expected.current.get(world));
      if (
        reader === null ||
        (world !== null &&
          snapshot?.branches.some((branch) => branch.name === world) !== true &&
          snapshot?.pages[world] === undefined &&
          requested === undefined)
      )
        return;
      cancelPaging();
      if (world !== null && root !== undefined) expected.current.set(world, root);
      const next = { reader, name: world, ...(requested === undefined ? {} : { root: requested }) };
      opened.current = next;
      setExpanded(next);
    },
    [reader, cancelPaging]
  );
  const toggle = useCallback(
    (world: string) => {
      open(opened.current?.name === world ? null : world);
    },
    [open]
  );
  const sync = useCallback(
    (world: string, root: string) => {
      if (latest.current?.pages[world] !== undefined) expected.current.set(world, root);
      if (opened.current?.reader === reader && opened.current.name === world) open(world, root);
    },
    [reader, open]
  );
  useEffect(() => {
    setPending(null);
    setFailure(null);
    if (reader === null || name === null || loading) return;
    const cached = latest.current?.pages[name];
    const root = expanded?.root;
    if (cached !== undefined && (root === undefined || cached.root === root)) return;
    const branch = latest.current?.branches.find((item) => item.name === name);
    const requested = root ?? branch?.state;
    if (requested === undefined) return;
    const controller = new AbortController();
    setPending({ reader, name });
    void openWorld(name, stateRef(requested), controller.signal, root !== undefined).then(
      () => {
        if (!controller.signal.aborted) setPending(null);
      },
      () => {
        if (controller.signal.aborted) return;
        setPending(null);
        setFailure({ reader, name });
      }
    );
    return () => {
      controller.abort();
    };
  }, [reader, name, expanded, loading, directoryRevision, openWorld]);
  const cached = name === null ? undefined : pages.snapshot?.pages[name];
  const incomplete =
    cached === undefined || (expanded?.root !== undefined && cached.root !== expanded.root);
  return {
    name,
    open,
    toggle,
    sync,
    pending: pending?.reader === reader && pending.name === name ? name : null,
    error: incomplete && failure?.reader === reader && failure.name === name
  };
}

function useAllWorldPages(
  pages: ReturnType<typeof useVersionPages>,
  mode: HistoryMode["value"],
  selected: ReadonlySet<string>
) {
  const attempted = useRef<string | null>(null);
  const { loading, directoryRevision, ensurePages, snapshot } = pages;
  useEffect(() => {
    if (mode !== "all") {
      attempted.current = null;
      return;
    }
    if (loading || snapshot === null) return;
    const key = JSON.stringify([
      directoryRevision,
      [...selected].sort(),
      snapshot.branches.map((branch) => [branch.name, branch.state])
    ]);
    if (attempted.current === key) return;
    attempted.current = key;
    ensurePages(selected);
  }, [mode, loading, directoryRevision, ensurePages, snapshot, selected]);
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

function useHistoryNavigation({
  pages,
  scope,
  expanded,
  selection,
  shownBranches,
  worldNames
}: {
  pages: ReturnType<typeof useVersionPages>;
  scope: ReturnType<typeof useHistoryScope>;
  expanded: ReturnType<typeof useExpandedWorld>;
  selection: ReturnType<typeof useVersionSelection>;
  shownBranches: ReadonlySet<string>;
  worldNames: ReadonlySet<string>;
}) {
  const { setMode, mode, selected: selectedBranches } = scope;
  const openHistory = useCallback(
    (name: string) => {
      setMode("world");
      const missing = pages.snapshot?.branches.some((branch) => branch.name === name) !== true;
      const cached = pages.snapshot?.pages[name];
      const fallback =
        missing && cached === undefined && selection.world === name
          ? (selection.selected ?? undefined)
          : undefined;
      expanded.open(name, fallback);
    },
    [setMode, expanded.open, pages.snapshot, selection.world, selection.selected]
  );
  const changeMode = useCallback(
    (value: HistoryMode["value"]) => {
      setMode(value);
      if (value === "all" && mode === "all") pages.ensurePages(selectedBranches);
    },
    [setMode, mode, pages.ensurePages, selectedBranches]
  );
  const loadMore = useCallback(() => {
    pages.loadMore(shownBranches);
  }, [pages.loadMore, shownBranches]);
  const loadMoreWorld = useCallback(() => {
    pages.loadMore(worldNames);
  }, [pages.loadMore, worldNames]);
  const retryHistory = useCallback(() => {
    if (pages.pagingError) pages.retryPaging();
    else if (pages.directoryError) pages.refresh();
    else if (pages.refsError) void pages.checkRefs();
    else if (mode === "all") pages.ensurePages(selectedBranches);
    else if (expanded.name !== null) openHistory(expanded.name);
    else pages.refresh();
  }, [pages, mode, selectedBranches, expanded.name, openHistory]);
  return { openHistory, changeMode, loadMore, loadMoreWorld, retryHistory };
}

function useHistoryCommits(
  snapshot: VersionSnapshot | null,
  shownBranches: ReadonlySet<string>,
  world: string | null
) {
  const commits = useMemo(
    () => (snapshot === null ? [] : flattenCommits(snapshot, shownBranches)),
    [snapshot, shownBranches]
  );
  const topologyCommits = useMemo(
    () => (snapshot === null || world === null ? [] : worldTopology(snapshot, world)),
    [snapshot, world]
  );
  return { commits, topologyCommits };
}

function useBrowsingHead(
  reader: VersionReader | null,
  selection: ReturnType<typeof useVersionSelection>,
  head: string | null
) {
  const baseline = useRef<{
    reader: VersionReader | null;
    world: string | null;
    revision: number;
    head: string | null;
  } | null>(null);
  const previous = baseline.current;
  if (
    previous?.reader !== reader ||
    previous.world !== selection.world ||
    previous.revision !== selection.revision
  ) {
    baseline.current = {
      reader,
      world: selection.world,
      revision: selection.revision,
      head: selection.revision === 0 ? selection.selected : head
    };
  }
  return head !== null && baseline.current?.head !== null && head !== baseline.current?.head;
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
  const expanded = useExpandedWorld(reader, pages);
  useAllWorldPages(pages, mode, selectedBranches);
  const browsingStatus = worldStatus(pages.snapshot, currentWorld);
  const hasNewVersion = useBrowsingHead(reader, selection, browsingStatus.head);
  const expandedStatus = worldStatus(pages.snapshot, expanded.name);
  const worldNames = useMemo(
    () => new Set(expanded.name === null ? [] : [expanded.name]),
    [expanded.name]
  );
  const shownBranches = mode === "all" ? selectedBranches : worldNames;
  const { commits, topologyCommits } = useHistoryCommits(
    pages.snapshot,
    shownBranches,
    expanded.name
  );
  const actions = useWorldActions(pages.snapshot, selection, expanded.sync, setMode);
  const navigation = useHistoryNavigation({
    pages,
    scope,
    expanded,
    selection,
    shownBranches,
    worldNames
  });

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
    error: reader !== null && (pages.error || (mode === "world" && expanded.error)),
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
    hasNewVersion,
    topologyCommits,
    topologyHasMore: pages.snapshot !== null && hasMore(pages.snapshot, worldNames),
    refsCheckedAt: pages.refsCheckedAt,
    refsError: pages.refsError,
    checkingRefs: pages.checkingRefs,
    setBranches,
    selectCommit: selection.select,
    selectWorld: actions.selectWorld,
    selectWorldSnapshot: actions.selectWorldSnapshot,
    openHistory: navigation.openHistory,
    retryHistory: navigation.retryHistory,
    toggleWorld: expanded.toggle,
    selectWorldCommit: actions.selectWorldCommit,
    setMode: navigation.changeMode,
    returnToLatest: actions.returnToLatest,
    loadMore: navigation.loadMore,
    loadMoreWorld: navigation.loadMoreWorld,
    loadMoreExpandedWorld: navigation.loadMoreWorld,
    refresh: pages.refresh,
    checkRefs: () => void pages.checkRefs()
  };
}
