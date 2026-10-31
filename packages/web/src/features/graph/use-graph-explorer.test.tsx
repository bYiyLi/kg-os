// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { ResolvedState } from "@kgos/sdk";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { emptyGraph, mergeGraph } from "./graph-data.js";
import type { GraphData } from "./graph-data.js";
import type { GraphReader, KnowledgeSearchResult } from "./graph-search.js";
import { connectKnowledge, expandKnowledge, searchKnowledge } from "./graph-search.js";
import { useGraphExplorer } from "./use-graph-explorer.js";

vi.mock("./graph-search.js", () => ({
  searchKnowledge: vi.fn(),
  expandKnowledge: vi.fn(),
  connectKnowledge: vi.fn()
}));

const state: ResolvedState = `commit/${"a".repeat(64)}`;
const reader: GraphReader = { query: vi.fn() };
let root: Root;
let explorer: ReturnType<typeof useGraphExplorer>;

function graph(id: string, name = id): GraphData {
  return {
    nodes: [{ id, labels: ["Example"], properties: { name } }],
    relationships: [],
    limited: false
  };
}

function linked(start: string, end: string, id = "r:1"): GraphData {
  const data = mergeGraph(graph(start), graph(end));
  data.relationships = [{ id, start, end, type: "LINK", properties: {} }];
  return data;
}

function result(data: GraphData): KnowledgeSearchResult {
  return {
    data,
    routes: [{ kind: "keyword", status: "ok", count: data.nodes.length, limited: false }]
  };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function Probe() {
  explorer = useGraphExplorer(reader, state);
  return null;
}

async function seed(data = graph("n:1")) {
  vi.mocked(searchKnowledge).mockResolvedValue(result(data));
  await act(async () => {
    await explorer.search("example");
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  vi.mocked(connectKnowledge).mockResolvedValue(emptyGraph());
  const host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(<Probe />);
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

function scopedAbortSignal(
  scope: AbortSignal | { signal: AbortSignal; domain: string } | undefined
) {
  if (scope === undefined) return undefined;
  return "signal" in scope ? scope.signal : scope;
}

it("clearing aborts an active search and ignores a transport that resolves late", async () => {
  const request = pending<KnowledgeSearchResult>();
  vi.mocked(searchKnowledge).mockReturnValue(request.promise);
  act(() => {
    void explorer.search("example");
  });
  const signal = vi.mocked(searchKnowledge).mock.calls[0]?.[3].signal;
  expect(explorer.busy).toBe(true);
  act(() => {
    explorer.clear();
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  await act(async () => {
    request.resolve(result(graph("n:1")));
    await request.promise;
  });
  expect(explorer.data.nodes).toHaveLength(0);
  expect(explorer.routes).toBeNull();
  expect(explorer.busy).toBe(false);
  expect(connectKnowledge).not.toHaveBeenCalled();
});

it("only the most recent search can replace the current graph", async () => {
  const first = pending<KnowledgeSearchResult>();
  vi.mocked(searchKnowledge)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce(result(graph("n:2")));
  act(() => {
    void explorer.search("first");
  });
  await act(async () => {
    await explorer.search("second");
  });
  await act(async () => {
    first.resolve(result(graph("n:1")));
    await first.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:2"]);
});

it("a failed combined search stops late progress and marks pending routes unavailable", async () => {
  const partial = result(graph("n:1"));
  partial.routes.push({ kind: "semantic", status: "loading", count: 0, limited: false });
  vi.mocked(searchKnowledge).mockImplementation((_reader, _state, _query, options) => {
    options.onProgress?.(partial);
    return Promise.reject(new Error("Invalid combined response"));
  });
  await act(async () => {
    await explorer.search("example");
  });
  const options = vi.mocked(searchKnowledge).mock.calls[0]?.[3];
  expect(options?.signal.aborted).toBe(true);
  expect(explorer.busy).toBe(false);
  expect(explorer.failed).toBe(true);
  expect(explorer.routes?.[1]?.status).toBe("error");
  act(() => {
    options?.onProgress?.(result(graph("n:2")));
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
  expect(connectKnowledge).not.toHaveBeenCalled();
});

it("uses real relationships already included with ranked keyword results without another request", async () => {
  await seed(linked("n:1", "n:2"));
  expect(connectKnowledge).not.toHaveBeenCalled();
  expect(explorer.data.relationships.map((edge) => edge.id)).toEqual(["r:1"]);
  expect(explorer.linksFailed).toBe(false);
  expect(explorer.busy).toBe(false);
});

it("keeps recent browsing nodes when their connection read fails and retries only those connections", async () => {
  vi.mocked(connectKnowledge)
    .mockRejectedValueOnce(new Error("Unavailable"))
    .mockResolvedValueOnce(linked("n:1", "n:2"));
  vi.mocked(searchKnowledge).mockResolvedValue({
    data: mergeGraph(graph("n:1"), graph("n:2")),
    routes: [{ kind: "recent", status: "ok", count: 2, limited: false }]
  });
  await act(async () => {
    await explorer.search("");
  });
  expect(explorer.linksFailed).toBe(true);
  expect(explorer.failed).toBe(false);
  expect(explorer.data.nodes).toHaveLength(2);
  await act(async () => {
    await explorer.retryLinks();
  });
  expect(explorer.linksFailed).toBe(false);
  expect(explorer.data.relationships).toHaveLength(1);
  expect(searchKnowledge).toHaveBeenCalledOnce();
  expect(connectKnowledge).toHaveBeenCalledTimes(2);
});

it("a new search aborts late recent connections instead of merging them into the next scene", async () => {
  const firstLinks = pending<GraphData>();
  vi.mocked(connectKnowledge)
    .mockReturnValueOnce(firstLinks.promise)
    .mockResolvedValue(emptyGraph());
  vi.mocked(searchKnowledge)
    .mockResolvedValueOnce({
      data: graph("n:1"),
      routes: [{ kind: "recent", status: "ok", count: 1, limited: false }]
    })
    .mockResolvedValueOnce(result(graph("n:3")));
  act(() => {
    void explorer.search("");
  });
  await act(async () => {
    await Promise.resolve();
  });
  const signal = vi.mocked(connectKnowledge).mock.calls[0]?.[3];
  await act(async () => {
    await explorer.search("second");
  });
  await act(async () => {
    firstLinks.resolve(linked("n:1", "n:2"));
    await firstLinks.promise;
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:3"]);
  expect(explorer.data.relationships).toHaveLength(0);
});

it("selection changes preserve independent neighbor loading", async () => {
  await seed();
  act(() => {
    explorer.select("n:1");
  });
  const request = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValue(request.promise);
  act(() => {
    void explorer.expand();
  });
  const signal = vi.mocked(expandKnowledge).mock.calls[0]?.[3];
  act(() => {
    explorer.select(null);
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(false);
  await act(async () => {
    request.resolve(linked("n:1", "n:2"));
    await request.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2"]);
  expect(explorer.expanded.has("n:1")).toBe(true);
  expect(explorer.selected).toBeNull();
});

it("a background expansion failure reports the failed node after selection moves elsewhere", async () => {
  await seed(mergeGraph(graph("n:1"), graph("n:2")));
  const request = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValue(request.promise);
  act(() => {
    void explorer.expand("n:1");
    explorer.select("n:2");
  });
  await act(async () => {
    request.reject(new Error("Neighbor unavailable"));
    await request.promise.catch(() => null);
  });
  expect(explorer.selected).toBe("n:2");
  expect(explorer.expandFailed).toBe(false);
  expect(explorer.notice).toEqual({ kind: "expandFailed", id: "n:1" });
  act(() => {
    explorer.select("n:1");
  });
  expect(explorer.expandFailed).toBe(true);
});

it("concurrent node expansions merge against the latest scene even when they finish in reverse order", async () => {
  await seed(mergeGraph(graph("n:1"), graph("n:2")));
  const first = pending<GraphData>();
  const second = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  act(() => {
    void explorer.expand("n:1");
    explorer.select("n:2");
    void explorer.expand("n:2");
  });
  expect(explorer.expandingIds.size).toBe(2);
  await act(async () => {
    second.resolve(linked("n:2", "n:4", "r:2"));
    await second.promise;
  });
  await act(async () => {
    first.resolve(linked("n:1", "n:3", "r:1"));
    await first.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id).toSorted()).toEqual([
    "n:1",
    "n:2",
    "n:3",
    "n:4"
  ]);
  expect(explorer.data.relationships.map((edge) => edge.id).toSorted()).toEqual(["r:1", "r:2"]);
  expect(explorer.selected).toBe("n:2");
});

it("deduplicates the same in-flight node and cancels it when toggled again", async () => {
  await seed();
  const first = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValue(first.promise);
  act(() => {
    void explorer.expand("n:1");
    void explorer.expand("n:1");
  });
  expect(expandKnowledge).toHaveBeenCalledOnce();
  const signal = vi.mocked(expandKnowledge).mock.calls[0]?.[3];
  act(() => {
    explorer.toggleExpand("n:1");
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  await act(async () => {
    first.resolve(linked("n:1", "n:2"));
    await first.promise;
  });
  expect(explorer.data.nodes).toHaveLength(1);
  expect(explorer.expandingIds.size).toBe(0);
  expect(explorer.expanded.size).toBe(0);
  expect(explorer.notice?.kind).toBe("collapsed");
});

it("a cancelled node can immediately start a new expansion without its old request clearing the new one", async () => {
  await seed();
  const old = pending<GraphData>();
  const current = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
  act(() => {
    void explorer.expand("n:1");
    explorer.toggleExpand("n:1");
    void explorer.expand("n:1");
  });
  await act(async () => {
    old.resolve(linked("n:1", "n:2"));
    await old.promise;
  });
  expect(explorer.expandingIds.has("n:1")).toBe(true);
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
  await act(async () => {
    current.resolve(linked("n:1", "n:3"));
    await current.promise;
  });
  expect(explorer.expandingIds.has("n:1")).toBe(false);
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:3"]);
});

it("collapsing one expansion keeps seeds and a neighbor still supplied by another expansion", async () => {
  await seed(mergeGraph(graph("n:1"), graph("n:2")));
  vi.mocked(expandKnowledge)
    .mockResolvedValueOnce(linked("n:1", "n:3", "r:1"))
    .mockResolvedValueOnce(linked("n:2", "n:3", "r:2"));
  await act(async () => {
    await explorer.expand("n:1");
    await explorer.expand("n:2");
  });
  act(() => {
    explorer.toggleExpand("n:1");
  });
  expect(explorer.expanded.has("n:1")).toBe(false);
  expect(explorer.expanded.has("n:2")).toBe(true);
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2", "n:3"]);
  expect(explorer.data.relationships.map((edge) => edge.id)).toEqual(["r:2"]);
  act(() => {
    explorer.collapse("n:2");
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2"]);
});

it("keeps partial results readable and defers scene changes until search fusion finishes", async () => {
  const request = pending<KnowledgeSearchResult>();
  vi.mocked(searchKnowledge).mockImplementation((_reader, _state, _query, options) => {
    options.onProgress?.(result(graph("n:1")));
    return request.promise;
  });
  act(() => {
    void explorer.search("example");
  });
  act(() => {
    explorer.select("n:1");
  });
  await act(async () => {
    await explorer.expand();
    explorer.hide();
  });
  expect(explorer.selected).toBe("n:1");
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
  expect(expandKnowledge).not.toHaveBeenCalled();
  await act(async () => {
    request.resolve(result(graph("n:1")));
    await request.promise;
  });
  act(() => {
    explorer.hide();
  });
  expect(explorer.data.nodes).toHaveLength(0);
  expect(explorer.selected).toBeNull();
});

it("rejects a conflicting neighbor payload in place rather than crashing the renderer", async () => {
  await seed(graph("n:1", "original"));
  vi.mocked(expandKnowledge).mockResolvedValue(graph("n:1", "conflict"));
  act(() => {
    explorer.select("n:1");
  });
  await act(async () => {
    await explorer.expand();
  });
  expect(explorer.expandFailed).toBe(true);
  expect(explorer.data.nodes[0]?.properties["name"]).toBe("original");
});

it("hiding a node only changes the visible scene and undo restores its incident edges", async () => {
  const data = linked("n:1", "n:2");
  await seed(data);
  act(() => {
    explorer.select("n:1");
    explorer.hide("n:1");
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:2"]);
  expect(explorer.data.relationships).toHaveLength(0);
  expect(explorer.selected).toBeNull();
  expect(explorer.canUndoHide).toBe(true);
  act(() => {
    explorer.undoHide();
  });
  expect(explorer.data.nodes).toHaveLength(2);
  expect(explorer.data.relationships).toHaveLength(1);
  expect(explorer.canUndoHide).toBe(false);
  expect(reader.query).not.toHaveBeenCalled();
  expect(data.nodes).toHaveLength(2);
});

it("hiding a loading node cancels only its request and undo does not revive late additions", async () => {
  await seed();
  const request = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValue(request.promise);
  act(() => {
    void explorer.expand("n:1");
    explorer.hide("n:1");
  });
  const signal = vi.mocked(expandKnowledge).mock.calls[0]?.[3];
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  expect(explorer.data.nodes).toHaveLength(0);
  act(() => {
    explorer.undoHide();
  });
  await act(async () => {
    request.resolve(linked("n:1", "n:2"));
    await request.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
  expect(explorer.expanded.size).toBe(0);
});

it("an already expanded or empty node has visible feedback without another read", async () => {
  await seed();
  vi.mocked(expandKnowledge).mockResolvedValue(emptyGraph());
  await act(async () => {
    await explorer.expand("n:1");
    await explorer.expand("n:1");
  });
  expect(expandKnowledge).toHaveBeenCalledOnce();
  expect(explorer.notice).toEqual({ kind: "empty", id: "n:1", count: 0 });
  expect(explorer.expanded.has("n:1")).toBe(true);
});

it("a new search cancels expansions and ignores their late payloads", async () => {
  await seed();
  const request = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValue(request.promise);
  act(() => {
    void explorer.expand("n:1");
  });
  const signal = vi.mocked(expandKnowledge).mock.calls[0]?.[3];
  await seed(graph("n:3"));
  await act(async () => {
    request.resolve(linked("n:1", "n:2"));
    await request.promise;
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:3"]);
  expect(explorer.expanded.size).toBe(0);
});

it("unmount aborts an independent expansion and empty searches never read connections", async () => {
  await seed(emptyGraph());
  expect(connectKnowledge).not.toHaveBeenCalled();
  await seed();
  vi.mocked(expandKnowledge).mockReturnValue(pending<GraphData>().promise);
  act(() => {
    void explorer.expand("n:1");
  });
  const signal = vi.mocked(expandKnowledge).mock.calls[0]?.[3];
  act(() => {
    root.unmount();
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  root = createRoot(document.createElement("div"));
});

it("blank input starts recent retrieval and unmount aborts outstanding work", async () => {
  await act(async () => {
    await explorer.search("  ");
  });
  expect(searchKnowledge).toHaveBeenCalledWith(reader, state, "", expect.any(Object));
  vi.mocked(searchKnowledge).mockReturnValue(pending<KnowledgeSearchResult>().promise);
  act(() => {
    void explorer.search("first");
  });
  const signal = vi.mocked(searchKnowledge).mock.lastCall?.[3].signal;
  act(() => {
    root.unmount();
  });
  expect(scopedAbortSignal(signal)?.aborted).toBe(true);
  root = createRoot(document.createElement("div"));
});
