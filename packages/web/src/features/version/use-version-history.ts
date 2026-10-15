import { useCallback, useMemo, useState } from "react";

import { flattenCommits, hasMore } from "./version-data.js";
import type { VersionCommit, VersionReader, VersionSnapshot } from "./version-data.js";
import { useVersionPages } from "./use-version-pages.js";
import { useVersionSelection } from "./use-version-selection.js";

interface SelectedBranches {
  reader: VersionReader;
  names: string[];
}

export interface VersionHistory {
  branches: VersionSnapshot["branches"];
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
  setBranches: (names: string[]) => void;
  selectCommit: (state: string) => void;
  loadMore: () => void;
  refresh: () => void;
}

// A single owner shares data and selection across desktop and mobile drawer.
export function useVersionHistory(
  reader: VersionReader | null,
  initialState: string | null
): VersionHistory {
  const pages = useVersionPages(reader);
  const selection = useVersionSelection(reader, initialState);
  const [filter, setFilter] = useState<SelectedBranches | null>(null);
  const branches = useMemo(() => pages.snapshot?.branches ?? [], [pages.snapshot]);
  const selectedBranches = useMemo(
    () =>
      new Set(
        filter?.reader === reader
          ? filter.names.filter((name) => branches.some((branch) => branch.name === name))
          : branches.map((branch) => branch.name)
      ),
    [filter, reader, branches]
  );
  const commits = useMemo(
    () => (pages.snapshot === null ? [] : flattenCommits(pages.snapshot, selectedBranches)),
    [pages.snapshot, selectedBranches]
  );
  const setBranches = useCallback(
    (names: string[]) => {
      if (reader !== null) setFilter({ reader, names });
    },
    [reader]
  );
  const loadMore = useCallback(() => {
    pages.loadMore(selectedBranches);
  }, [pages.loadMore, selectedBranches]);

  return {
    branches,
    commits,
    selectedBranches,
    selectedCommit: selection.selected,
    selectingCommit: selection.pending,
    loading: reader !== null && pages.snapshot === null && !pages.error,
    ready: pages.snapshot !== null,
    loadingMore: pages.paging,
    error: reader !== null && pages.error,
    selectionError: selection.error,
    canLoadMore: pages.snapshot !== null && hasMore(pages.snapshot, selectedBranches),
    available: reader !== null,
    setBranches,
    selectCommit: selection.select,
    loadMore,
    refresh: pages.refresh
  };
}
