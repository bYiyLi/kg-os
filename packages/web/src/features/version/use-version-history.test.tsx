// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { VersionReader } from "./version-data.js";
import {
  createVersionHistoryHarness,
  reader,
  update,
  head,
  other,
  next,
  older,
  genesis
} from "../../../test/version-history-fixture.js";

const { setup, cleanup, render, history } = createVersionHistoryHarness();
beforeEach(setup);
afterEach(cleanup);

function expectContinuation(api: VersionReader) {
  const call = vi.mocked(api.ancestry).mock.calls.at(-1);
  expect(call?.[0]).toEqual({ root: head, cursor: "next", limit: 20 });
  expect(call?.[1]?.signal).toBeInstanceOf(AbortSignal);
}

it("uses the actual default world even when another world shares its head", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "novel", state: head }
    ]
  });
  await render(api, "novel");
  expect(history().currentWorld).toBe("novel");
  expect(history().defaultBranch).toBe("novel");
  expect(history().commits).toHaveLength(2);
  expect(history().commits[0]?.reachableFrom).toEqual(["novel"]);
  expect(history().mode).toBe("world");
});

it("confirms world, commit and normal history together and preserves all mode on failure", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().setMode("all");
  });
  vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
  await update(() => {
    history().selectWorld("learning");
  });
  expect(history().selectionError).toBe(true);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  expect(history().mode).toBe("all");
  await update(() => {
    history().selectWorld("learning");
  });
  expect(history().currentWorld).toBe("learning");
  expect(history().selectedCommit).toBe(other);
  expect(history().mode).toBe("world");
});

it("does not let a delayed world switch replace a later commit selection", async () => {
  const api = reader();
  await render(api);
  let finish: ((result: { state: typeof other }) => void) | undefined;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().selectWorld("learning");
  });
  expect(history().switchingWorld).toBe("learning");
  expect(history().currentWorld).toBe("main");
  await update(() => {
    history().selectCommit(older);
  });
  await update(() => finish?.({ state: other }));
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(older);
});

it("observes a new head without replacing the old cursor or browsing state", async () => {
  const api = reader();
  await render(api);
  const initialRequests = vi.mocked(api.ancestry).mock.calls.length;
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: next },
      { name: "learning", state: other }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  expect(history().worldHead).toBe(next);
  expect(history().hasNewVersion).toBe(true);
  expect(history().selectedCommit).toBe(head);
  expect(history().topologyCommits[0]?.state).toBe(head);
  expect(api.ancestry).toHaveBeenCalledTimes(initialRequests);
  await update(() => {
    history().loadMoreWorld();
  });
  expectContinuation(api);
  await update(() => {
    history().returnToLatest();
  });
  expect(history().selectedCommit).toBe(next);
  expect(history().topologyCommits[0]?.state).toBe(next);
  expect(history().hasNewVersion).toBe(false);
});

it("keeps deleted-world history and its pinned continuation readable after refresh", async () => {
  const api = reader();
  await render(api);
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "learning", state: other }] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().worldMissing).toBe(true);
  expect(history().currentWorld).toBe("main");
  expect(history().worldHead).toBeNull();
  expect(history().commits[0]?.state).toBe(head);
  expect(history().topologyHasMore).toBe(true);
  await update(() => {
    history().loadMoreWorld();
  });
  expectContinuation(api);
  await update(() => {
    history().refresh();
  });
  expect(history().worldMissing).toBe(true);
  expect(history().topologyCommits.map((item) => item.state)).toContain(genesis);
  await update(() => {
    history().returnToLatest();
  });
  expect(api.get).not.toHaveBeenCalled();
});

it("does not overlap reference observation with an in-flight full refresh", async () => {
  const api = reader();
  await render(api);
  let finish: ((value: { items: { name: string; state: typeof head }[] }) => void) | undefined;
  vi.mocked(api.branch.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    history().refresh();
  });
  expect(history().loading).toBe(true);
  expect(history().commits[0]?.state).toBe(head);
  const requests = vi.mocked(api.branch.list).mock.calls.length;
  await update(() => {
    history().checkRefs();
    window.dispatchEvent(new Event("focus"));
  });
  expect(api.branch.list).toHaveBeenCalledTimes(requests);
  await update(() => finish?.({ items: [{ name: "main", state: head }] }));
  expect(history().worldHead).toBe(head);
  expect(history().loading).toBe(false);
});

it("clears the old world, mode and commit across a disconnected reader", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().selectWorld("learning");
  });
  await update(() => {
    history().setMode("all");
  });
  await render(null);
  expect(history().currentWorld).toBeNull();
  expect(history().selectedCommit).toBeNull();
  await render(api);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  expect(history().mode).toBe("world");
});

it("observes visible references every fifteen seconds and pauses while hidden", async () => {
  vi.useFakeTimers();
  const api = reader();
  await render(api);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(api.branch.list).toHaveBeenCalledTimes(2);
  await update(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(api.branch.list).toHaveBeenCalledTimes(2);
  await update(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(api.branch.list).toHaveBeenCalledTimes(3);
});

it("backs off failed reference observations while retaining the last known head", async () => {
  vi.useFakeTimers();
  const api = reader();
  await render(api);
  const checkedAt = history().refsCheckedAt;
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline"));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(history().refsError).toBe(true);
  expect(history().refsCheckedAt).toBe(checkedAt);
  expect(history().worldHead).toBe(head);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(api.branch.list).toHaveBeenCalledTimes(2);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(15_000);
  });
  expect(api.branch.list).toHaveBeenCalledTimes(3);
  expect(history().refsError).toBe(false);
});

it("keeps world expansion separate from browsing and cross-world filtering", async () => {
  const api = reader();
  await render(api);
  expect(history().expandedWorld).toBe("main");
  await update(() => {
    history().toggleWorld("learning");
  });
  expect(history().expandedWorld).toBe("learning");
  expect(history().commits[0]?.state).toBe(other);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  await update(() => {
    history().toggleWorld("learning");
  });
  expect(history().expandedWorld).toBeNull();
  expect(history().commits).toHaveLength(0);
  await update(() => {
    history().setMode("all");
    history().toggleWorld("main");
  });
  expect(history().mode).toBe("all");
  expect(history().expandedWorld).toBe("main");
  expect(history().currentWorld).toBe("main");
  expect(api.get).not.toHaveBeenCalled();
});

it("confirms a world's version without reopening a later expanded world", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().toggleWorld("learning");
  });
  let finish: ((result: { state: typeof older }) => void) | undefined;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const ancestryCalls = vi.mocked(api.ancestry).mock.calls.length;
  await update(() => {
    history().selectWorldCommit("learning", older);
  });
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
  await update(() => {
    history().toggleWorld("main");
  });
  await update(() => {
    finish?.({ state: older });
  });
  expect(history().currentWorld).toBe("learning");
  expect(history().selectedCommit).toBe(older);
  expect(history().expandedWorld).toBe("main");
  expect(history().topologyCommits[0]?.state).toBe(head);
  expect(api.ancestry).toHaveBeenCalledTimes(ancestryCalls);
});

it("uses the clicked world identity for shared commits and rejects unrelated loaded versions", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "novel", state: head },
      { name: "learning", state: other }
    ]
  });
  await render(api);
  await update(() => {
    history().selectWorldCommit("main", other);
  });
  expect(api.get).not.toHaveBeenCalled();
  await update(() => {
    history().selectWorldCommit("novel", head);
  });
  expect(history().currentWorld).toBe("novel");
  expect(history().selectedCommit).toBe(head);
  expect(history().expandedWorld).toBe("main");
});

it("binds expanded paging to its real root and cursor independently of the browsing world", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().toggleWorld("learning");
  });
  const originalKey = history().expandedPageKey;
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "learning", state: next }
    ]
  });
  await update(() => {
    history().checkRefs();
  });
  expect(history().expandedHasNewVersion).toBe(true);
  expect(history().hasNewVersion).toBe(false);
  expect(history().expandedPageKey).toBe(originalKey);
  await update(() => {
    history().loadMoreExpandedWorld();
  });
  const lastRequest = vi.mocked(api.ancestry).mock.calls.at(-1)?.[0];
  expect(lastRequest).toEqual({ root: other, cursor: "next", limit: 20 });
  expect(history().expandedPageKey).not.toBe(originalKey);
  expect(history().currentWorld).toBe("main");
  expect(history().selectedCommit).toBe(head);
});

it("retains deleted expanded history without marking a different browsing world missing", async () => {
  const api = reader();
  await render(api);
  await update(() => {
    history().toggleWorld("learning");
  });
  vi.mocked(api.branch.list).mockResolvedValue({ items: [{ name: "main", state: head }] });
  await update(() => {
    history().checkRefs();
  });
  expect(history().expandedWorld).toBe("learning");
  expect(history().expandedWorldMissing).toBe(true);
  expect(history().expandedHead).toBeNull();
  expect(history().worldMissing).toBe(false);
  expect(history().topologyCommits[0]?.state).toBe(other);
  await update(() => {
    history().selectWorldCommit("learning", older);
  });
  expect(history().currentWorld).toBe("learning");
  expect(history().selectedCommit).toBe(older);
  expect(history().worldMissing).toBe(true);
});
