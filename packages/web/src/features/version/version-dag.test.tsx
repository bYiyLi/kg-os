// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { stateRef } from "./version-data.js";
import type { VersionHistory } from "./use-version-history.js";
import {
  HEAD,
  LEFT,
  RIGHT,
  PARENT,
  OPEN_LABEL,
  fixture,
  version,
  Harness
} from "../../../test/version-dag-fixture.js";

const EDGE_SELECTOR = "path[data-child]";
const PRESSED_ATTRIBUTE = "aria-pressed";
const IDENTITY_SELECTOR = ".version-browsing-identity";
const FEEDBACK_SELECTOR = ".version-browsing-feedback";
const STATUS_SELECTOR = ".version-browsing-status";

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
  expect(node(LEFT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(node(LEFT)?.textContent).toContain("Current view");
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
});

it("selects the expanded world and full state without assigning an unread parent", async () => {
  const history = fixture();
  await render(history);
  const row = node(RIGHT)?.querySelector<HTMLButtonElement>("button");
  expect(row?.textContent).toContain("Switch to version");
  act(() => row?.click());
  expect(history.selectWorldCommit).toHaveBeenCalledExactlyOnceWith("knowledge", RIGHT);
  await render({ ...history, selectingCommit: RIGHT, switchingWorld: "knowledge" });
  expect(row?.getAttribute("aria-busy")).toBe("true");
  expect(row?.textContent).toContain("Switching...");
  act(() => row?.click());
  expect(history.selectWorldCommit).toHaveBeenCalledExactlyOnceWith("knowledge", RIGHT);
  expect(history.selectCommit).not.toHaveBeenCalled();
  expect(history.selectWorld).not.toHaveBeenCalled();
  expect(history.returnToLatest).not.toHaveBeenCalled();
});

it("keeps the confirmed context visible until a pending switch succeeds", async () => {
  const history = fixture();
  await render(history);
  const status = document.body.querySelector(STATUS_SELECTOR);
  await render({ ...history, selectingCommit: RIGHT, switchingWorld: "knowledge" });
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("bbbbbbb");
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).not.toContain("ccccccc");
  expect(document.body.querySelector(FEEDBACK_SELECTOR)?.textContent).toContain("ccccccc");
  expect(node(LEFT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(node(RIGHT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  await render({ ...history, selectedCommit: RIGHT });
  expect(document.body.querySelector(STATUS_SELECTOR)).toBe(status);
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("ccccccc");
  expect(node(RIGHT)?.textContent).toContain("Current view");
  expect(node(RIGHT)?.querySelector("button")?.getAttribute("aria-busy")).toBe("false");
  expect(node(LEFT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
});

it("ignores the current row unless it replaces a different pending choice", async () => {
  const history = fixture();
  await render(history);
  act(() => node(LEFT)?.querySelector<HTMLButtonElement>("button")?.click());
  expect(history.selectWorldCommit).not.toHaveBeenCalled();
  await render({ ...history, selectingCommit: RIGHT, switchingWorld: "knowledge" });
  act(() => node(LEFT)?.querySelector<HTMLButtonElement>("button")?.click());
  expect(history.selectWorldCommit).toHaveBeenCalledExactlyOnceWith("knowledge", LEFT);
});

it("keeps a latest-version identity after returning from historical browsing", async () => {
  const history = fixture();
  await render(history);
  const status = document.body.querySelector(STATUS_SELECTOR);
  act(() => {
    button("Back to latest").click();
  });
  expect(history.returnToLatest).toHaveBeenCalledOnce();
  await render({ ...history, selectingCommit: HEAD, switchingWorld: "knowledge" });
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("bbbbbbb");
  await render({ ...history, selectedCommit: HEAD });
  expect(document.body.querySelector(STATUS_SELECTOR)).toBe(status);
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("aaaaaaa");
  expect(status?.textContent).toContain("Latest version");
  expect(document.body.querySelector(FEEDBACK_SELECTOR)?.textContent).toContain(
    "You are viewing the latest version."
  );
  expect(node(HEAD)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
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
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("world-a");
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).not.toContain("world-b");
  expect(node(LEFT)?.textContent).not.toContain("Latest");
  expect(node(LEFT)?.textContent).not.toContain("Current view");
  expect(node(LEFT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
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
  const history = fixture();
  await render({ ...history, selectingCommit: RIGHT, switchingWorld: "knowledge" });
  await render({ ...history, error: true, selectionError: true });
  expect(document.body.querySelector('[role="alert"]')?.textContent).toBe(
    "Could not open this version. Your previous selection is unchanged."
  );
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("bbbbbbb");
  expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).not.toContain("ccccccc");
  expect(node(LEFT)?.querySelector("button")?.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(node(RIGHT)?.querySelector("button")?.getAttribute("aria-busy")).toBe("false");
});

it("fails closed for invalid ancestry and gives an honest label for a version without a message", async () => {
  await render(fixture({ topologyCommits: [version(HEAD, [HEAD])] }));
  expect(document.body.querySelector('.version-dag-message[role="status"]')?.textContent).toContain(
    "Version relationships are unavailable"
  );
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(0);
  await render(fixture({ topologyCommits: [version(HEAD)], selectedCommit: HEAD }));
  expect(node(HEAD)?.textContent).toContain("No version description");
  expect(node(HEAD)?.querySelector("button")?.title).toBe(HEAD);
});

it("does not draw residual ancestry when no knowledge world is expanded", async () => {
  await render(fixture({ expandedWorld: null }));
  expect(document.body.querySelector('.version-dag-message[role="status"]')?.textContent).toContain(
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

it("keeps visible selections still and scrolls only enough to reveal a clipped row", async () => {
  const commits = longHistory();
  const history = fixture({ topologyCommits: commits, selectedCommit: commits[0]?.state ?? null });
  await render(history);
  const viewport = document.body.querySelector<HTMLElement>(".version-dag-viewport");
  if (viewport === null) throw new Error("Missing version viewport");
  for (const [index, top] of [
    [4, 0],
    [5, 72],
    [4, 72]
  ] as const) {
    await render({ ...history, selectedCommit: commits[index]?.state ?? null });
    expect(viewport.scrollTop).toBe(top);
  }
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

it("marks exhausted history honestly without leaving a load-more action", async () => {
  await render(fixture({ topologyHasMore: false }));
  expect(document.body.querySelector(".version-dag-footer")?.textContent).toContain(
    "Earliest version reached"
  );
  expect(document.body.querySelector(".version-dag-footer button")).toBeNull();
});

it("keeps cross-world history in the dialog without presenting it as a single-root graph", async () => {
  await render(
    fixture({ mode: "all", branches: [{ name: "knowledge", state: HEAD, color: "violet" }] })
  );
  expect(document.body.querySelectorAll(EDGE_SELECTOR)).toHaveLength(0);
  expect(document.body.querySelectorAll(".commit-row")).toHaveLength(3);
  expect(document.body.querySelector(".version-dag-world")?.textContent).toBe(
    "View history across worlds"
  );
  expect(
    document.body.querySelector('input[aria-label="Search loaded versions..."]')
  ).not.toBeNull();
  expect(document.body.textContent).toContain("Search and colors cover loaded versions");
});

it.each([null, "knowledge"] as const)(
  "distinguishes a pending snapshot from a named-world choice (%s)",
  async (switchingWorld) => {
    const history = fixture({
      mode: "all",
      branches: [{ name: "knowledge", state: HEAD, color: "violet" }],
      selectingCommit: RIGHT,
      switchingWorld
    });
    await render(history);
    expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("knowledge");
    expect(document.body.querySelector(IDENTITY_SELECTOR)?.textContent).toContain("bbbbbbb");
    expect(document.body.querySelector(FEEDBACK_SELECTOR)?.textContent).toContain("ccccccc");
    const snapshot = [...document.body.querySelectorAll<HTMLButtonElement>(".commit-row")].find(
      (row) => row.textContent.includes("Right history")
    );
    expect(snapshot?.getAttribute("aria-busy")).toBe(String(switchingWorld === null));
    expect(snapshot?.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
    expect(snapshot?.textContent).toContain(
      switchingWorld === null ? "Switching..." : "Switch to version"
    );
    act(() => snapshot?.click());
    if (switchingWorld === null) expect(history.selectCommit).not.toHaveBeenCalled();
    else expect(history.selectCommit).toHaveBeenCalledExactlyOnceWith(RIGHT);
    expect(history.selectWorldCommit).not.toHaveBeenCalled();
  }
);

it.each(["world", "all"] as const)(
  "delegates a %s history failure to the retry owner without replacing its cursor or selection",
  async (mode) => {
    const history = fixture({ error: true, currentWorld: "another-world", mode });
    await render(history);
    act(() => {
      button("Retry history").click();
    });
    expect(history.retryHistory).toHaveBeenCalledExactlyOnceWith();
    expect(history.openHistory).not.toHaveBeenCalled();
    expect(history.setMode).not.toHaveBeenCalled();
    expect(history.loadMore).not.toHaveBeenCalled();
    expect(history.loadMoreWorld).not.toHaveBeenCalled();
    expect(history.selectWorld).not.toHaveBeenCalled();
    expect(history.selectWorldCommit).not.toHaveBeenCalled();
    expect(history.selectCommit).not.toHaveBeenCalled();
  }
);
