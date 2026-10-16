import { expect, it, vi } from "vitest";
import type { StateSummary } from "@kgos/sdk";

import {
  flattenCommits,
  hasMore,
  loadMoreVersions,
  loadVersions,
  stateRef
} from "./version-data.js";
import type { VersionReader } from "./version-data.js";

const root = "a".repeat(64);
const shared = "b".repeat(64);
const source = "c".repeat(64);
const side = "d".repeat(64);
const starting = Date.now() * 1000;

function entry(state: string, offset: number, parents: string[]): StateSummary {
  return {
    state: stateRef(state),
    committedAt: starting + offset,
    parents: parents.map(stateRef),
    message: state.slice(0, 5)
  };
}

function reader(): VersionReader {
  return {
    branch: {
      list: vi.fn().mockResolvedValue({
        items: [
          { name: "main", state: root },
          { name: "experiment", state: source },
          { name: "develop", state: side }
        ]
      })
    },
    tag: { list: vi.fn().mockResolvedValue({ items: [{ name: "v1", state: shared }] }) },
    ancestry: vi.fn().mockImplementation((request: { root: string; cursor?: string }) => {
      if (request.root === stateRef(root)) {
        return Promise.resolve(
          request.cursor === undefined
            ? { root, items: [entry(root, 4000, [source, shared])], cursor: "next-main" }
            : { root, items: [entry(shared, 1000, [])] }
        );
      }
      if (request.root === stateRef(source)) {
        return Promise.resolve({
          root: source,
          items: [entry(source, 3000, [shared]), entry(shared, 1000, [])]
        });
      }
      return Promise.resolve({
        root: side,
        items: [entry(side, 2000, [shared]), entry(shared, 1000, [])]
      });
    }),
    get: vi.fn().mockResolvedValue({ state: root })
  };
}

it("loads independent pinned branch roots and merges only loaded ancestry", async () => {
  const api = reader();
  const abort = new AbortController();
  const loaded = await loadVersions(api, abort.signal);
  expect(loaded.branches).toHaveLength(3);
  expect(new Set(loaded.branches.map((branch) => branch.color)).size).toBe(3);
  expect(loaded.pages["main"]?.root).toBe(stateRef(root));
  expect(loaded.pages["main"]?.cursor).toBe("next-main");
  expect(api.ancestry).toHaveBeenCalledTimes(3);

  const commits = flattenCommits(loaded, new Set(loaded.branches.map((branch) => branch.name)));
  expect(commits).toHaveLength(4);
  expect(commits.map((commit) => commit.state)).toEqual([root, source, side, shared].map(stateRef));
  expect(commits[0]?.merge).toBe(true);
  expect(commits.find((commit) => commit.state === stateRef(shared))?.reachableFrom).toEqual([
    "experiment",
    "develop"
  ]);
  expect(commits.find((commit) => commit.state === stateRef(shared))?.refs).toEqual([
    { kind: "tag", name: "v1" }
  ]);
  expect(commits[0]?.refs).toEqual([{ kind: "branch", name: "main" }]);
  expect(hasMore(loaded, new Set(["main"]))).toBe(true);
  expect(hasMore(loaded, new Set(["develop"]))).toBe(false);
});

it("paginates only checked branches using original root and cursor", async () => {
  const api = reader();
  const abort = new AbortController();
  const loaded = await loadVersions(api, abort.signal);
  const next = await loadMoreVersions(api, loaded, new Set(["main"]), abort.signal);
  expect(api.ancestry).toHaveBeenLastCalledWith(
    { root: stateRef(root), cursor: "next-main", limit: 20 },
    { signal: abort.signal }
  );
  const selected = new Set(["main", "develop"]);
  const commits = flattenCommits(next, selected);
  expect(commits.map((commit) => commit.state)).toEqual([root, side, shared].map(stateRef));
  expect(commits.find((commit) => commit.state === stateRef(shared))?.reachableFrom).toEqual([
    "main",
    "develop"
  ]);
  expect(hasMore(next, selected)).toBe(false);
  expect(loaded.pages["main"]?.cursor).toBe("next-main");
});

it("rejects malformed ref responses instead of rendering fake history", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({ items: [{ name: "bad", state: 9 }] } as never);
  await expect(loadVersions(api, new AbortController().signal)).rejects.toThrow(
    "Invalid Evolution ref response"
  );
});

it("accepts the daemon's prefixed State IDs and null genesis parents", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({
    items: [{ name: "main", state: stateRef(root) }]
  });
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(root),
    items: [
      { state: stateRef(root), parents: [stateRef(shared)], committedAt: starting + 10 },
      { state: stateRef(shared), parents: null, committedAt: starting } as unknown as StateSummary
    ]
  });
  const loaded = await loadVersions(api, new AbortController().signal);
  expect(loaded.branches[0]?.state).toBe(stateRef(root));
  const commits = flattenCommits(loaded, new Set(["main"]));
  expect(commits.map((commit) => commit.state)).toEqual([stateRef(root), stateRef(shared)]);
  expect(commits.at(-1)?.parents).toEqual([]);
});

it("shows a genuine empty repository without requesting ancestry", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({ items: [] });
  vi.mocked(api.tag.list).mockResolvedValueOnce({ items: [] });
  const snapshot = await loadVersions(api, new AbortController().signal);
  expect(snapshot).toEqual({ branches: [], tags: [], pages: {} });
  expect(api.ancestry).not.toHaveBeenCalled();
  expect(flattenCommits(snapshot, new Set())).toEqual([]);
  expect(hasMore(snapshot, new Set())).toBe(false);
});

it.each([
  { name: "missing entries", result: { root, items: null } },
  { name: "missing root", result: { items: [entry(root, 0, [])] } },
  { name: "wrong pinned root", result: { root: source, items: [entry(root, 0, [])] } },
  { name: "invalid parent", result: { root, items: [{ ...entry(root, 0, []), parents: [23] }] } },
  {
    name: "invalid timestamp",
    result: { root, items: [{ ...entry(root, 0, []), committedAt: "yesterday" }] }
  },
  { name: "invalid state", result: { root, items: [{ ...entry(root, 0, []), state: null }] } }
])("rejects $name instead of displaying corrupt version data", async ({ result }) => {
  const api = reader();
  vi.mocked(api.ancestry).mockResolvedValueOnce(result as never);
  await expect(loadVersions(api, new AbortController().signal)).rejects.toThrow(
    /Invalid Evolution/
  );
});

it("stops loading when the connection is aborted", async () => {
  const api = reader();
  const controller = new AbortController();
  controller.abort();
  await expect(loadVersions(api, controller.signal)).rejects.toThrow();
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("keeps a single copy of a commit returned across page boundaries", async () => {
  const api = reader();
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(root),
    items: [entry(root, 4000, [source]), entry(shared, 1000, [])],
    cursor: "next-main"
  });
  const controller = new AbortController();
  const snapshot = await loadVersions(api, controller.signal);
  const next = await loadMoreVersions(api, snapshot, new Set(["main"]), controller.signal);
  expect(next.pages["main"]?.items.map((commit) => commit.state)).toEqual(
    [root, shared].map(stateRef)
  );
});

it("orders commits with equal timestamps by the complete State ID", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({
    items: [
      { name: "side", state: stateRef(side) },
      { name: "root", state: stateRef(root) },
      { name: "source", state: stateRef(source) }
    ]
  });
  vi.mocked(api.ancestry).mockImplementation((request) =>
    Promise.resolve({
      root: stateRef(request.root),
      items: [{ state: stateRef(request.root), parents: [], committedAt: starting }]
    })
  );
  const snapshot = await loadVersions(api, new AbortController().signal);
  const commits = flattenCommits(snapshot, new Set(["side", "root", "source"]));
  expect(commits.map((commit) => commit.state)).toEqual([root, source, side].map(stateRef));
});

it("safely indexes legally named branches without prototype pollution", async () => {
  const api = reader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({
    items: [{ name: "__proto__", state: stateRef(root) }]
  });
  const signal = new AbortController().signal;
  const first = await loadVersions(api, signal);
  expect(Object.getPrototypeOf(first.pages)).toBeNull();
  expect(first.pages["__proto__"]?.root).toBe(stateRef(root));
  const next = await loadMoreVersions(api, first, new Set(["__proto__"]), signal);
  expect(Object.getPrototypeOf(next.pages)).toBeNull();
  expect(next.pages["__proto__"]?.items).toHaveLength(2);
  expect(flattenCommits(next, new Set(["__proto__"]))).toHaveLength(2);
});
