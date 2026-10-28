// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OntologyReadResult, ResolvedState } from "@kgos/sdk";

import type { DomainReader } from "./domain-data.js";
import { useDomainTree } from "./use-domain-tree.js";

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const other = ("commit/" + "b".repeat(64)) as ResolvedState;
let host: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useDomainTree>;

function empty(at = state): OntologyReadResult {
  return { state: at, results: [{ kind: "overview", items: [], total: 0, markdown: "" }] };
}

function reader(): DomainReader {
  return {
    ontology: { read: vi.fn().mockResolvedValue(empty()) },
    object: { read: vi.fn() }
  };
}

function Harness({ api, at }: { api: DomainReader | null; at: string | null }) {
  current = useDomainTree(api, at);
  return null;
}

async function render(api: DomainReader | null, at: string | null = state) {
  await act(async () => {
    root.render(<Harness api={api} at={at} />);
    await Promise.resolve();
  });
}

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
});

it("distinguishes an empty complete tree from loading and caches by State", async () => {
  const api = reader();
  await render(api);
  expect(current.tree?.roots).toEqual([]);
  expect(current.loading).toBe(false);
  expect(current.error).toBe(false);
  const first = current.tree;
  vi.mocked(api.ontology.read).mockResolvedValueOnce(empty(other));
  await render(api, other);
  expect(current.tree?.state).toBe(other);
  await render(api);
  expect(current.tree).toBe(first);
  expect(api.ontology.read).toHaveBeenCalledTimes(2);
});

it("hides old State data immediately and ignores a late response even if abort is ignored", async () => {
  const api = reader();
  let finish: ((value: OntologyReadResult) => void) | undefined;
  vi.mocked(api.ontology.read).mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  await render(api);
  expect(current.tree).toBeNull();
  expect(current.loading).toBe(true);
  const oldSignal = vi.mocked(api.ontology.read).mock.calls[0]?.[1]?.signal;
  vi.mocked(api.ontology.read).mockResolvedValueOnce(empty(other));
  await render(api, other);
  expect(oldSignal?.aborted).toBe(true);
  expect(current.tree?.state).toBe(other);
  await act(async () => {
    finish?.(empty());
    await Promise.resolve();
  });
  expect(current.tree?.state).toBe(other);
});

it("does not leak the same State cache across readers or a disconnect", async () => {
  const first = reader();
  await render(first);
  const second = reader();
  vi.mocked(second.ontology.read).mockRejectedValue(new Error("offline"));
  await render(second);
  expect(current.tree).toBeNull();
  expect(current.error).toBe(true);
  await render(null);
  expect(current).toMatchObject({ tree: null, loading: false, error: false });
  await render(first);
  expect(first.ontology.read).toHaveBeenCalledTimes(2);
  await render(first, null);
  expect(current).toMatchObject({ tree: null, loading: false, error: false });
});

it("retries the current State and preserves its previous complete tree on failure", async () => {
  const api = reader();
  await render(api);
  const tree = current.tree;
  vi.mocked(api.ontology.read).mockRejectedValueOnce(new Error("RESOURCE_ERROR"));
  await act(async () => {
    current.retry();
    await Promise.resolve();
  });
  expect(current.tree).toBe(tree);
  expect(current.error).toBe(true);
  await act(async () => {
    current.retry();
    await Promise.resolve();
  });
  expect(current.tree).not.toBe(tree);
  expect(current.error).toBe(false);
  expect(api.ontology.read).toHaveBeenCalledTimes(3);
  vi.mocked(api.ontology.read).mockResolvedValueOnce(empty(other));
  await render(api, other);
  await render(api);
  expect(api.ontology.read).toHaveBeenCalledTimes(4);
});

it("cancels a pending request on disconnect without reporting a stale error", async () => {
  const api = reader();
  let reject: ((error: Error) => void) | undefined;
  vi.mocked(api.ontology.read).mockReturnValueOnce(
    new Promise((_resolve, rejectPromise) => {
      reject = rejectPromise;
    })
  );
  await render(api);
  const signal = vi.mocked(api.ontology.read).mock.calls[0]?.[1]?.signal;
  await render(null);
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    reject?.(new Error("late failure"));
    await Promise.resolve();
  });
  expect(current).toMatchObject({ tree: null, loading: false, error: false });
});
