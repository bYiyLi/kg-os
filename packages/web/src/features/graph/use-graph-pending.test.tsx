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

async function startChildExpansion() {
  await seed();
  vi.mocked(expandKnowledge).mockResolvedValueOnce(linked("n:1", "n:2"));
  await act(async () => {
    await explorer.expand("n:1");
  });
  const request = pending<GraphData>();
  vi.mocked(expandKnowledge).mockReturnValueOnce(request.promise);
  act(() => {
    void explorer.expand("n:2");
    explorer.collapse("n:1");
  });
  return request;
}

it("keeps an origin visible while its own expansion loads after its parent is collapsed", async () => {
  const request = await startChildExpansion();
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2"]);
  expect(explorer.data.relationships).toHaveLength(0);
  expect(explorer.expanded.size).toBe(0);
  expect(explorer.expandingIds.has("n:2")).toBe(true);
  await act(async () => {
    request.resolve(linked("n:2", "n:3", "r:2"));
    await request.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2", "n:3"]);
  expect(explorer.data.relationships.map((edge) => edge.id)).toEqual(["r:2"]);
  expect(explorer.expandingIds.size).toBe(0);
  expect(explorer.expanded.has("n:2")).toBe(true);
  act(() => {
    explorer.collapse("n:2");
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
});

it("releases a loading origin when its read fails after its parent has been collapsed", async () => {
  const request = await startChildExpansion();
  await act(async () => {
    request.reject(new Error("Neighbor unavailable"));
    await request.promise.catch(() => null);
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
  expect(explorer.expandingIds.size).toBe(0);
  expect(explorer.expanded.size).toBe(0);
  expect(explorer.notice).toEqual({ kind: "expandFailed", id: "n:2" });
});

it("retains an independently expanded origin even if its read finds no neighbors", async () => {
  const request = await startChildExpansion();
  await act(async () => {
    request.resolve(emptyGraph());
    await request.promise;
  });
  expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1", "n:2"]);
  expect(explorer.expandingIds.size).toBe(0);
  expect(explorer.expanded.has("n:2")).toBe(true);
  expect(explorer.notice).toEqual({ kind: "empty", id: "n:2", count: 0 });
});

it.each(["collapse", "hide"] as const)(
  "%s cancels a loading origin without undo or a late response restoring it",
  async (action) => {
    const request = await startChildExpansion();
    const signal = vi.mocked(expandKnowledge).mock.calls[1]?.[3];
    act(() => {
      explorer[action]("n:2");
      explorer.undoHide();
    });
    expect(signal?.aborted).toBe(true);
    expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
    await act(async () => {
      request.resolve(linked("n:2", "n:3", "r:2"));
      await request.promise;
    });
    expect(explorer.data.nodes.map((node) => node.id)).toEqual(["n:1"]);
    expect(explorer.expanded.size).toBe(0);
    expect(explorer.expandingIds.size).toBe(0);
  }
);
