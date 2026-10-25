// @vitest-environment jsdom

import { act, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { stateRef } from "./version-data.js";
import type { VersionCommit } from "./version-data.js";
import type { VersionHistory } from "./use-version-history.js";
import { VersionDag } from "./version-dag.js";

const HEAD = stateRef("a".repeat(64));
const LEFT = stateRef("b".repeat(64));
const RIGHT = stateRef("c".repeat(64));
const PARENT = stateRef("d".repeat(64));
const OPEN_LABEL = "Open relationships";
const EDGE_SELECTOR = "path[data-child]";

function version(state: string, parents: string[] = [], message?: string): VersionCommit {
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

function fixture(overrides: Partial<VersionHistory> = {}): VersionHistory {
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

function Harness({
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

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

async function render(history: VersionHistory, initiallyOpen = true, onOpenChange = vi.fn()) {
  await act(async () => {
    root.render(
      <Harness history={history} initiallyOpen={initiallyOpen} onOpenChange={onOpenChange} />
    );
    await Promise.resolve();
  });
  return onOpenChange;
}

function button(name: string): HTMLButtonElement {
  const result = [...document.body.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.getAttribute("aria-label") === name || element.textContent.trim() === name
  );
  if (result === undefined) throw new Error("Missing button " + name);
  return result;
}

function node(state: string): HTMLElement | null {
  return document.body.querySelector<HTMLElement>(`[data-version-state="${state}"]`);
}

it("draws actual merge-parent edges and keeps unread endpoints unselectable", async () => {
  const history = fixture();
  await render(history);
  const edges = [...document.body.querySelectorAll<SVGPathElement>(EDGE_SELECTOR)];
  expect(edges.map((edge) => [edge.dataset["child"], edge.dataset["parent"]])).toEqual([
    [HEAD, LEFT],
    [HEAD, RIGHT],
    [LEFT, PARENT],
    [RIGHT, PARENT]
  ]);
  expect(node(PARENT)?.dataset["loaded"]).toBe("false");
  expect(node(PARENT)?.textContent).toContain("Parent version not loaded");
  expect(node(PARENT)?.querySelector("button")).toBeNull();
  expect(node(HEAD)?.textContent).toContain("Latest");
  expect(node(LEFT)?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
  expect(node(LEFT)?.textContent).toContain("Current view");
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
});

it("selects the expanded world and full state without assigning an unread parent", async () => {
  const history = fixture({ selectingCommit: RIGHT, switchingWorld: "knowledge" });
  await render(history);
  const row = node(RIGHT)?.querySelector<HTMLButtonElement>("button");
  expect(row?.getAttribute("aria-busy")).toBe("true");
  act(() => row?.click());
  expect(history.selectWorldCommit).toHaveBeenCalledExactlyOnceWith("knowledge", RIGHT);
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorld).not.toHaveBeenCalled();
  expect(history.returnToLatest).not.toHaveBeenCalled();
});

it("opens and closes without changing selection and returns focus to its stable trigger", async () => {
  const history = fixture();
  const changed = await render(history, false);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => {
    button(OPEN_LABEL).click();
    await Promise.resolve();
  });
  expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain(
    "Version relationships"
  );
  await act(async () => {
    button("Close version relationships").click();
    await Promise.resolve();
  });
  expect(changed).toHaveBeenCalledWith(false);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(button(OPEN_LABEL));
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
});

it("keeps the loaded graph readable after its knowledge-world reference is deleted", async () => {
  await render(fixture({ expandedWorldMissing: true, expandedHead: null }));
  expect(document.body.textContent).toContain("This knowledge world no longer exists.");
  expect(node(HEAD)?.dataset["loaded"]).toBe("true");
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(4);
  expect(node(HEAD)?.textContent).not.toContain("Latest");
});

it("uses the expanded world's title and head without highlighting another world's shared state", async () => {
  const history = fixture({
    currentWorld: "world-a",
    expandedWorld: "world-b",
    worldHead: LEFT,
    selectedCommit: LEFT,
    expandedHead: HEAD,
    selectingCommit: LEFT,
    switchingWorld: "world-a"
  });
  await render(history);
  expect(document.body.querySelector(".version-dag-world")?.textContent).toBe("world-b");
  expect(node(LEFT)?.textContent).not.toContain("Latest");
  expect(node(LEFT)?.textContent).not.toContain("Current view");
  expect(node(LEFT)?.querySelector("button")?.getAttribute("aria-pressed")).toBe("false");
  expect(node(LEFT)?.querySelector("button")?.getAttribute("aria-busy")).toBe("false");
  expect(document.body.querySelectorAll(".version-dag-node.is-selected")).toHaveLength(0);
  expect(node(HEAD)?.textContent).toContain("Latest");
  act(() => {
    node(LEFT)?.querySelector<HTMLButtonElement>("button")?.click();
  });
  expect(history.selectWorldCommit).toHaveBeenCalledExactlyOnceWith("world-b", LEFT);
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.toggleWorld).not.toHaveBeenCalled();
});

it("loads more of the same world and disables another request while paging", async () => {
  const history = fixture();
  await render(history);
  act(() => {
    button("Load earlier versions").click();
  });
  expect(history.loadMoreWorld).toHaveBeenCalledOnce();
  expect(history.loadMore).not.toHaveBeenCalled();
  await render({ ...history, loadingMore: true });
  expect(button("Loading history...").disabled).toBe(true);
  await render({ ...history, topologyHasMore: false });
  expect(document.body.querySelector(".version-dag-footer button")).toBeNull();
});

it("shows loading, unavailable and read failures without retaining a fake graph", async () => {
  const empty = fixture({ commits: [], topologyCommits: [], selectedCommit: null });
  await render({ ...empty, loading: true });
  expect(document.body.querySelector('[role="status"]')?.textContent).toBe("Loading history...");
  await render({ ...empty, error: true });
  expect(document.body.querySelector('[role="status"]')?.textContent).toBe(
    "Version relationships are unavailable for this knowledge world."
  );
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not load version history. Try again."
  );
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(0);
});

it("reports a failed selection while keeping its previous pinned graph visible", async () => {
  await render(fixture({ error: true, selectionError: true }));
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not open this version. Your previous selection is unchanged."
  );
  expect(node(LEFT)?.querySelector("button")?.getAttribute("aria-pressed")).toBe("true");
});

it("fails closed for invalid ancestry and gives an honest label for a version without a message", async () => {
  await render(fixture({ topologyCommits: [version(HEAD, [HEAD])] }));
  expect(document.body.querySelector('[role="status"]')?.textContent).toContain(
    "Version relationships are unavailable"
  );
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(0);
  await render(fixture({ topologyCommits: [version(HEAD)], selectedCommit: HEAD }));
  expect(node(HEAD)?.textContent).toContain("No version description");
  expect(node(HEAD)?.querySelector("button")?.title).toBe(HEAD);
});

it("does not draw residual ancestry when no knowledge world is expanded", async () => {
  await render(fixture({ expandedWorld: null }));
  expect(document.body.querySelector('[role="status"]')?.textContent).toContain(
    "Version relationships are unavailable"
  );
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(0);
});

function longHistory() {
  return Array.from({ length: 120 }, (_, index) => {
    const state = stateRef((index + 1).toString(16).padStart(64, "0"));
    const parents = index === 119 ? [] : [stateRef((index + 2).toString(16).padStart(64, "0"))];
    return version(state, parents, "Version " + String(index));
  });
}

it("renders a visible window of long history and reveals the selected version", async () => {
  const commits = longHistory();
  const selected = commits[80]?.state ?? null;
  const history = fixture({ topologyCommits: commits, selectedCommit: selected });
  await render(history);
  const viewport = document.body.querySelector<HTMLElement>(".version-dag-viewport");
  expect(viewport?.scrollTop).toBeGreaterThan(5000);
  expect(document.body.querySelectorAll("[data-version-state]").length).toBeLessThan(20);
  expect(selected === null ? null : node(selected)).not.toBeNull();
  expect(node(commits[0]?.state ?? "")).toBeNull();
  if (viewport === null) throw new Error("Missing version viewport");
  act(() => {
    viewport.scrollTop = 0;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  expect(node(commits[0]?.state ?? "")).not.toBeNull();
  expect(selected === null ? null : node(selected)).toBeNull();
  await render({ ...history, topologyCommits: [...commits] });
  expect(viewport.scrollTop).toBe(0);
  expect(selected === null ? null : node(selected)).toBeNull();
  const nextSelected = commits[90]?.state ?? null;
  await render({ ...history, selectedCommit: nextSelected });
  expect(viewport.scrollTop).toBeGreaterThan(6000);
  expect(nextSelected === null ? null : node(nextSelected)).not.toBeNull();
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
});

it("preserves the expanded world's scroll through browsing and ref changes or pagination", async () => {
  const commits = longHistory();
  const initial = commits.slice(0, 60);
  const history = fixture({
    currentWorld: "world-a",
    expandedWorld: "world-b",
    expandedHead: commits[0]?.state ?? null,
    topologyCommits: initial,
    selectedCommit: commits[80]?.state ?? null
  });
  await render(history);
  const viewport = document.body.querySelector<HTMLElement>(".version-dag-viewport");
  if (viewport === null) throw new Error("Missing version viewport");
  expect(viewport.scrollTop).toBe(0);
  act(() => {
    viewport.scrollTop = 2800;
    viewport.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
  await render({
    ...history,
    selectedCommit: commits[90]?.state ?? null,
    worldHead: commits[90]?.state ?? null,
    refsCheckedAt: 1000,
    topologyCommits: [...initial]
  });
  expect(viewport.scrollTop).toBe(2800);
  await render({
    ...history,
    selectedCommit: commits[90]?.state ?? null,
    topologyCommits: commits,
    expandedPageKey: "world-b-next-page"
  });
  expect(viewport.scrollTop).toBe(2800);
  await render({
    ...history,
    expandedWorld: "world-c",
    topologyCommits: commits
  });
  expect(viewport.scrollTop).toBe(0);
  expect(node(commits[0]?.state ?? "")).not.toBeNull();
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
});
