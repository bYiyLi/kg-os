// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  createVersionHistoryHarness,
  reader,
  update,
  head,
  other,
  older,
  next,
  genesis
} from "../../../test/version-history-fixture.js";

const { setup, cleanup, render, history } = createVersionHistoryHarness();
beforeEach(setup);
afterEach(cleanup);

it("opens history on demand and reuses the same pinned root without toggling it closed", async () => {
  const api = reader();
  await render(api);
  expect(api.ancestry).not.toHaveBeenCalled();
  await update(() => {
    history().openHistory("learning");
  });
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  expect(calls).toBe(1);
  await update(() => {
    history().openHistory("learning");
  });
  expect(history().expandedWorld).toBe("learning");
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
  expect(history().currentWorld).toBe("main");
  expect(api.get).not.toHaveBeenCalled();
});

it("selects a world or a Domain snapshot without loading ancestry", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().selectWorld("learning");
  });
  expect(history().currentWorld).toBe("learning");
  expect(history().selectedCommit).toBe(other);
  const selected = vi.fn();
  await update(() => {
    history().selectWorldSnapshot("main", older, selected);
  });
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(older);
  expect(selected).toHaveBeenCalledExactlyOnceWith();
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("does not confirm a Domain when snapshot verification fails or a later selection wins", async () => {
  const api = reader();
  await render(api);
  const selected = vi.fn();
  vi.mocked(api.get).mockResolvedValueOnce({ state: other });
  await update(() => {
    history().selectWorldSnapshot("main", older, selected);
  });
  expect(history().selectionError).toBe(true);
  expect(history().selectedCommit).toBe(head);
  expect(selected).not.toHaveBeenCalled();
  let finish: ((value: { state: typeof older }) => void) | undefined;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().selectWorldSnapshot("main", older, selected);
  });
  const signal = vi.mocked(api.get).mock.calls.at(-1)?.[1]?.signal;
  await update(() => {
    history().selectWorld("learning");
  });
  await update(() => finish?.({ state: older }));
  expect(signal?.aborted).toBe(true);
  expect(history().currentWorld).toBe("learning");
  expect(selected).not.toHaveBeenCalled();
  await update(() => {
    history().selectWorldSnapshot("missing-world", older, selected);
  });
  expect(history().currentWorld).toBe("learning");
});

it("loads cross-world history only after entering its mode and preserves selected roots", async () => {
  const api = reader();
  await render(api);
  expect(api.ancestry).not.toHaveBeenCalled();
  await update(() => {
    history().setBranches(["main"]);
  });
  await update(() => {
    history().setMode("all");
  });
  expect(api.ancestry).toHaveBeenCalledTimes(1);
  expect(history().commits.every((commit) => commit.reachableFrom.includes("main"))).toBe(true);
  await update(() => {
    history().setBranches(["main", "learning"]);
  });
  expect(api.ancestry).toHaveBeenCalledTimes(2);
  const call = vi.mocked(api.ancestry).mock.calls.at(-1)?.[0];
  expect(call).toEqual({ root: other, limit: 20 });
  await update(() => {
    history().setMode("world");
  });
  await update(() => {
    history().setMode("all");
  });
  expect(api.ancestry).toHaveBeenCalledTimes(2);
});

it("retries failed cross-world first pages when reopening the same mode", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("offline"));
  await update(() => {
    history().setMode("all");
  });
  expect(history().error).toBe(true);
  expect(history().commits).toEqual([]);
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  await update(() => {
    history().setMode("all");
  });
  expect(history().error).toBe(false);
  expect(api.ancestry).toHaveBeenCalledTimes(calls + 2);
  expect(history().commits).toHaveLength(3);
});

it("does not report a history-read failure as a world-selection failure", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("offline"));
  await update(() => {
    history().openHistory("learning");
  });
  expect(history().expansionError).toBe(true);
  expect(history().currentWorld).toBe("main");
  await update(() => {
    history().selectWorld("learning");
  });
  expect(history().selectedCommit).toBe(other);
  expect(history().currentWorld).toBe("learning");
  expect(history().selectionError).toBe(false);
});

it("opens a deleted browsing world's history from its pinned State without guessing another world", async () => {
  const api = reader();
  await render(api);
  expect(api.ancestry).not.toHaveBeenCalled();
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "learning", state: head }] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().worldMissing).toBe(true);
  await update(() => {
    history().openHistory("main");
  });
  expect(history().expandedWorld).toBe("main");
  expect(history().expandedWorldMissing).toBe(true);
  expect(history().topologyCommits[0]?.state).toBe(head);
  expect(api.ancestry).toHaveBeenCalledTimes(1);
  const call = vi.mocked(api.ancestry).mock.calls[0];
  expect(call?.[0]).toEqual({ root: head, limit: 20 });
  expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  expect(api.get).not.toHaveBeenCalled();
});

it("keeps a failed single-world history from leaking into cross-world mode", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("world unavailable"));
  await update(() => {
    history().openHistory("learning");
  });
  expect(history().expansionError).toBe(true);
  await update(() => {
    history().setMode("all");
  });
  expect(history().commits).toHaveLength(3);
  expect(history().error).toBe(false);
  expect(history().currentWorld).toBe("main");
});

it("distinguishes choosing a historical State from observing a later Branch Head", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  await update(() => {
    history().selectWorldCommit("main", older);
  });
  expect(history().selectedCommit).toBe(older);
  expect(history().hasNewVersion).toBe(false);
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: next },
      { name: "learning", state: other }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  expect(history().selectedCommit).toBe(older);
  expect(history().hasNewVersion).toBe(true);
  await update(() => {
    history().selectWorldSnapshot("main", older);
  });
  expect(history().selectedCommit).toBe(older);
  expect(history().hasNewVersion).toBe(false);
});

it("observes Head movement even before any history page has been loaded", async () => {
  const api = reader();
  await render(api);
  expect(history().hasNewVersion).toBe(false);
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "main", state: next }] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().selectedCommit).toBe(head);
  expect(history().hasNewVersion).toBe(true);
  expect(api.ancestry).not.toHaveBeenCalled();
  await update(() => {
    history().returnToLatest();
  });
  expect(history().selectedCommit).toBe(next);
  expect(history().hasNewVersion).toBe(false);
  expect(api.ancestry).not.toHaveBeenCalled();
});

it.each(["world", "all"] as const)(
  "retries the failed %s continuation with its original roots and cursors",
  async (mode) => {
    const api = reader();
    await render(api);
    await update(() => {
      if (mode === "world") history().openHistory("main");
      else history().setMode("all");
    });
    const before = vi.mocked(api.ancestry).mock.calls.length;
    vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("page unavailable"));
    await update(() => {
      history().loadMore();
    });
    expect(history().error).toBe(true);
    const failed = vi
      .mocked(api.ancestry)
      .mock.calls.slice(before)
      .map(([request]) => request);
    expect(failed.every((request) => request.cursor === "next")).toBe(true);
    vi.mocked(api.branch.list).mockResolvedValue({
      items: [
        { name: "main", state: next },
        { name: "learning", state: other }
      ]
    });
    await update(() => {
      history().checkRefs();
    });
    const beforeRetry = vi.mocked(api.ancestry).mock.calls.length;
    await update(() => {
      history().retryHistory();
    });
    expect(history().error).toBe(false);
    const retried = vi
      .mocked(api.ancestry)
      .mock.calls.slice(beforeRetry)
      .map(([request]) => request);
    expect(retried).toEqual(failed);
    expect(retried.some((request) => request.root === head)).toBe(true);
    expect(retried.some((request) => request.root === next)).toBe(false);
    expect(history().commits.map((commit) => commit.state)).toContain(genesis);
    expect(history().selectedCommit).toBe(head);
  }
);

it("selects a new Branch Head through its callback and replaces the history root before paginating", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: head,
    items: [{ state: head, parents: [], committedAt: 1 }],
    cursor: "old-cursor"
  });
  await update(() => {
    history().openHistory("main");
  });
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "main", state: next }] });
  await update(() => {
    history().checkRefs();
  });
  const selected = vi.fn();
  await update(() => {
    history().selectWorld("main", selected);
  });
  expect(selected).toHaveBeenCalledExactlyOnceWith();
  expect(history().selectedCommit).toBe(next);
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(history().expandedHasNewVersion).toBe(false);
  await update(() => {
    history().loadMoreWorld();
  });
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0]).toEqual({
    root: next,
    cursor: "next",
    limit: 20
  });
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  await update(() => {
    history().selectWorldSnapshot("main", older);
  });
  expect(history().selectedCommit).toBe(older);
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
});

it("keeps an explicit new history root when its first page is still pending on reopen", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "main", state: next }] });
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
    history().selectWorld("main");
  });
  expect(history().expandingWorld).toBe("main");
  await update(() => {
    history().openHistory("main");
  });
  expect(history().topologyCommits[0]?.state).toBe(next);
  await update(() => {
    finish?.({ root: next, items: [] });
  });
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(history().selectedCommit).toBe(next);
});

it("retries a failed reference refresh instead of only reopening cached ancestry", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  const ancestry = vi.mocked(api.ancestry).mock.calls.length;
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("refs unavailable"));
  await update(() => {
    history().refresh();
  });
  expect(history().error).toBe(true);
  const calls = vi.mocked(api.branch.list).mock.calls.length;
  await update(() => {
    history().retryHistory();
  });
  expect(api.branch.list).toHaveBeenCalledTimes(calls + 1);
  expect(history().error).toBe(false);
  expect(api.ancestry).toHaveBeenCalledTimes(ancestry);
  expect(history().topologyCommits[0]?.state).toBe(head);
});

it.each(["world", "all"] as const)(
  "retries a failed %s first page through the explicit history action",
  async (mode) => {
    const api = reader();
    await render(api);
    vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("first page unavailable"));
    await update(() => {
      if (mode === "world") history().openHistory("learning");
      else history().setMode("all");
    });
    expect(history().error).toBe(true);
    const failed = vi.mocked(api.ancestry).mock.calls.map(([request]) => request);
    const before = failed.length;
    await update(() => {
      history().retryHistory();
    });
    expect(history().error).toBe(false);
    const retry = vi
      .mocked(api.ancestry)
      .mock.calls.slice(before)
      .map(([request]) => request);
    expect(retry).toEqual(failed);
    expect(history().commits.length).toBeGreaterThan(0);
    expect(history().currentWorld).toBe("main");
    expect(history().selectedCommit).toBe(head);
  }
);

it("remembers a selected Branch Head without replacing another world's active history", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  await update(() => {
    history().openHistory("learning");
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: next },
      { name: "learning", state: other }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  await update(() => {
    history().selectWorld("main");
  });
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(next);
  expect(history().expandedWorld).toBe("learning");
  expect(history().topologyCommits[0]?.state).toBe(other);
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
  await update(() => {
    history().openHistory("main");
  });
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(history().expandedHasNewVersion).toBe(false);
  await update(() => {
    history().loadMoreWorld();
  });
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0]).toEqual({
    root: next,
    cursor: "next",
    limit: 20
  });
});

it("preserves a new expected root across cancellation while another world's history opens", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().openHistory("main");
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: next },
      { name: "learning", state: other }
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
    history().selectWorld("main");
  });
  const signal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  expect(history().expandingWorld).toBe("main");
  await update(() => {
    history().openHistory("learning");
  });
  expect(signal?.aborted).toBe(true);
  expect(history().topologyCommits[0]?.state).toBe(other);
  await update(() => {
    history().openHistory("main");
  });
  expect(history().topologyCommits[0]?.state).toBe(next);
  await update(() => {
    finish?.({ root: next, items: [] });
  });
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(history().selectedCommit).toBe(next);
});
