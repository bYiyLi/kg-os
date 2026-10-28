// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createVersionHistoryHarness,
  reader,
  update,
  head,
  other,
  next,
  genesis
} from "../../../test/version-history-fixture.js";

const { setup, cleanup, render, history } = createVersionHistoryHarness();
beforeEach(setup);
afterEach(cleanup);

it("loads a newly observed world's first pinned page when expanding it", async () => {
  const api = reader();
  await render(api);
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: next }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
  await update(() => {
    history().toggleWorld("new-world");
  });
  expect(history().expandedWorld).toBe("new-world");
  expect(history().commits[0]?.state).toBe(next);
  expect(history().expandedPageKey).not.toBeNull();
  expect(history().expandingWorld).toBeNull();
  expect(history().expansionError).toBe(false);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  expect(api.get).not.toHaveBeenCalled();
});

it("does not let a delayed expansion take over a later expanded world", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: next },
      { name: "another-world", state: genesis }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  let finish: ((value: { root: typeof next; items: [] }) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().toggleWorld("new-world");
  });
  expect(history().expandingWorld).toBe("new-world");
  const signal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  await update(() => {
    history().toggleWorld("another-world");
  });
  expect(signal?.aborted).toBe(true);
  await update(() => {
    finish?.({ root: next, items: [] });
  });
  expect(history().expandedWorld).toBe("another-world");
  expect(history().commits[0]?.state).toBe(genesis);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  expect(history().expansionError).toBe(false);
  expect(api.get).not.toHaveBeenCalled();
});

it("invalidates an old reader's pending expansion across disconnect and reconnect", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: next }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  let finish: ((value: { root: typeof next; items: [] }) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().toggleWorld("new-world");
  });
  const signal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  await render(null);
  await render(reader());
  await update(() => {
    finish?.({ root: next, items: [] });
  });
  expect(signal?.aborted).toBe(true);
  expect(history().expandedWorld).toBeNull();
  expect(history().currentWorld).toBe("main");
  expect(history().commits).toEqual([]);
  expect(history().expandingWorld).toBeNull();
});

it("keeps a failed new world expanded and recovers through a full refresh", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: next }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("offline"));
  await update(() => {
    history().toggleWorld("new-world");
  });
  expect(history().expandedWorld).toBe("new-world");
  expect(history().expansionError).toBe(true);
  expect(history().error).toBe(true);
  expect(history().currentWorld).toBe("main");
  await update(() => {
    history().refresh();
  });
  expect(history().expandedWorld).toBe("new-world");
  expect(history().commits[0]?.state).toBe(next);
  expect(history().expansionError).toBe(false);
  expect(api.get).not.toHaveBeenCalled();
});

it("does not overwrite an explicitly opened new head with a delayed first-page expansion", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: next }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  let finish: ((value: { root: typeof next; items: [] }) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().toggleWorld("new-world");
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "new-world", state: genesis }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  await update(() => {
    history().selectWorld("new-world");
  });
  expect(history().selectedCommit).toBe(genesis);
  await update(() => {
    finish?.({ root: next, items: [] });
  });
  expect(history().currentWorld).toBe("new-world");
  expect(history().selectedCommit).toBe(genesis);
  expect(history().topologyCommits[0]?.state).toBe(genesis);
});

it("does not invent a retained default world for an initially empty reference directory", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValue({ items: [] });
  await render(api);
  expect(history().branches).toEqual([]);
  expect(history().retainedWorlds).toEqual([]);
  expect(history().commits).toEqual([]);
  expect(history().topologyCommits).toEqual([]);
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("retains only cached missing browsing and expanded worlds without duplicating them", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  await update(() => {
    history().toggleWorld("learning");
  });
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "learning", state: other }] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().retainedWorlds).toEqual(["main"]);
  vi.mocked(api.branch.list).mockResolvedValue({ items: [] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().retainedWorlds).toEqual(["main", "learning"]);
  await update(() => {
    history().toggleWorld("main");
  });
  expect(history().retainedWorlds).toEqual(["main"]);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
});

it("does not carry a failed world's pagination error into another expanded world", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("main page unavailable"));
  await update(() => {
    history().loadMoreExpandedWorld();
  });
  expect(history().error).toBe(true);
  await update(() => {
    history().toggleWorld("learning");
  });
  expect(history().expandedWorld).toBe("learning");
  expect(history().error).toBe(false);
  expect(history().loadingMore).toBe(false);
  expect(history().commits[0]?.state).toBe(other);
  await update(() => {
    history().loadMoreExpandedWorld();
  });
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0]).toEqual({
    root: other,
    cursor: "next",
    limit: 20
  });
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
});

it("cancels old paging on expansion or mode changes and ignores its delayed failure", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  let fail: ((error: Error) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  await update(() => {
    history().loadMoreExpandedWorld();
  });
  expect(history().loadingMore).toBe(true);
  const oldSignal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  await update(() => {
    history().toggleWorld("learning");
  });
  expect(oldSignal?.aborted).toBe(true);
  expect(history().loadingMore).toBe(false);
  await update(() => {
    fail?.(new Error("late main page failure"));
  });
  expect(history().error).toBe(false);
  expect(history().expandedWorld).toBe("learning");
  expect(history().commits[0]?.state).toBe(other);
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((_, reject) => {
        fail = reject;
      })
  );
  await update(() => {
    history().loadMoreExpandedWorld();
  });
  const modeSignal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  await update(() => {
    history().setMode("all");
  });
  expect(modeSignal?.aborted).toBe(true);
  expect(history().loadingMore).toBe(false);
  await update(() => {
    fail?.(new Error("late world mode failure"));
  });
  expect(history().error).toBe(false);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
});

it("keeps a newly expanded world's child-effect auto-fill request alive", async () => {
  const api = reader();
  let requested = false;
  await render(api, "main", (value) => {
    if (value.expandedWorld !== "learning" || requested || !value.canLoadMore) return;
    requested = true;
    value.loadMoreExpandedWorld();
  });
  let finish:
    | ((result: {
        root: typeof other;
        items: { state: typeof genesis; parents: []; committedAt: number }[];
      }) => void)
    | undefined;
  const ancestry = vi.mocked(api.ancestry).getMockImplementation();
  vi.mocked(api.ancestry).mockImplementation((request, options) => {
    if (request.cursor === undefined && ancestry !== undefined) return ancestry(request, options);
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await update(() => {
    history().toggleWorld("learning");
  });
  const call = vi.mocked(api.ancestry).mock.calls.at(-1);
  expect(call?.[0]).toEqual({ root: other, cursor: "next", limit: 20 });
  expect(call?.[1]?.signal?.aborted).toBe(false);
  expect(history().loadingMore).toBe(true);
  await update(() => {
    finish?.({ root: other, items: [{ state: genesis, parents: [], committedAt: 0 }] });
  });
  expect(history().commits.map((item) => item.state)).toContain(genesis);
  expect(history().loadingMore).toBe(false);
  expect(history().error).toBe(false);
  expect(history().currentWorld).toBe("main");
});

it("does not cancel new paging when an old world-selection callback repeats the current mode", async () => {
  const api = reader();
  let requested = false;
  await render(api, "main", (value) => {
    if (value.expandedWorld !== "learning" || requested || !value.canLoadMore) return;
    requested = true;
    value.loadMoreExpandedWorld();
  });
  await update(() => {
    history().setMode("all");
  });
  let finishSelection: ((result: { state: typeof head }) => void) | undefined;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSelection = resolve;
      })
  );
  await update(() => {
    history().selectWorld("main");
  });
  let finishPage:
    | ((result: {
        root: typeof other;
        items: { state: typeof genesis; parents: []; committedAt: number }[];
      }) => void)
    | undefined;
  vi.mocked(api.ancestry).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishPage = resolve;
      })
  );
  await update(() => {
    history().setMode("world");
    history().toggleWorld("learning");
  });
  const signal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  expect(history().loadingMore).toBe(true);
  await update(() => {
    finishSelection?.({ state: head });
  });
  expect(history().mode).toBe("world");
  expect(signal?.aborted).toBe(false);
  expect(history().loadingMore).toBe(true);
  await update(() => {
    finishPage?.({ root: other, items: [{ state: genesis, parents: [], committedAt: 0 }] });
  });
  expect(history().commits.map((item) => item.state)).toContain(genesis);
  expect(history().expandedWorld).toBe("learning");
  expect(history().currentWorld).toBe("main");
  expect(history().error).toBe(false);
});
