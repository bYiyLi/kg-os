import { useRef, useState } from "react";
import { vi } from "vitest";

import { TranslationProvider } from "./translation-provider.js";
import { UiProvider } from "../src/shared/ui/ui-provider.js";
import { stateRef } from "../src/features/version/version-data.js";
import type { VersionCommit } from "../src/features/version/version-data.js";
import type { VersionHistory } from "../src/features/version/use-version-history.js";
import { VersionDag } from "../src/features/version/version-dag.js";

export const HEAD = stateRef("a".repeat(64));
export const LEFT = stateRef("b".repeat(64));
export const RIGHT = stateRef("c".repeat(64));
export const PARENT = stateRef("d".repeat(64));
export const OPEN_LABEL = "Open relationships";

export function version(state: string, parents: string[] = [], message?: string): VersionCommit {
  return {
    state: stateRef(state),
    parents: parents.map(stateRef),
    committedAt: 1000,
    reachableFrom: ["knowledge"],
    refs: [],
    merge: parents.length > 1,
    ...(message === undefined ? {} : { message })
  };
}

export function fixture(overrides: Partial<VersionHistory> = {}): VersionHistory {
  const commits = [
    version(HEAD, [LEFT, RIGHT], "Merge knowledge"),
    version(LEFT, [PARENT], "Left history"),
    version(RIGHT, [PARENT], "Right history")
  ];
  return {
    branches: [],
    retainedWorlds: [],
    commits,
    topologyCommits: commits,
    selectedBranches: new Set(["knowledge"]),
    selectedCommit: LEFT,
    selectingCommit: null,
    loading: false,
    ready: true,
    loadingMore: false,
    error: false,
    selectionError: false,
    canLoadMore: true,
    available: true,
    defaultBranch: "knowledge",
    currentWorld: "knowledge",
    expandedWorld: "knowledge",
    expandedHead: HEAD,
    expandedWorldMissing: false,
    expandedHasNewVersion: false,
    expandedPageKey: "knowledge-history",
    expandingWorld: null,
    expansionError: false,
    worldHead: HEAD,
    worldMissing: false,
    switchingWorld: null,
    mode: "world",
    hasNewVersion: false,
    topologyHasMore: true,
    refsCheckedAt: null,
    refsError: false,
    checkingRefs: false,
    setBranches: vi.fn(),
    selectCommit: vi.fn(),
    selectWorld: vi.fn(),
    toggleWorld: vi.fn(),
    openHistory: vi.fn(),
    retryHistory: vi.fn(),
    selectWorldSnapshot: vi.fn(),
    selectWorldCommit: vi.fn(),
    setMode: vi.fn(),
    returnToLatest: vi.fn(),
    loadMore: vi.fn(),
    loadMoreWorld: vi.fn(),
    loadMoreExpandedWorld: vi.fn(),
    refresh: vi.fn(),
    checkRefs: vi.fn(),
    ...overrides
  };
}

export function Harness({
  history,
  initiallyOpen,
  onOpenChange
}: {
  history: VersionHistory;
  initiallyOpen: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const returnFocus = useRef<HTMLButtonElement>(null);
  return (
    <TranslationProvider>
      <UiProvider>
        <button
          type="button"
          ref={returnFocus}
          onClick={() => {
            setOpen(true);
          }}
        >
          {OPEN_LABEL}
        </button>
        <VersionDag
          open={open}
          onOpenChange={(value) => {
            setOpen(value);
            onOpenChange(value);
          }}
          history={history}
          returnFocus={returnFocus}
        />
      </UiProvider>
    </TranslationProvider>
  );
}
