// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { OntologyReadResult, ResolvedState } from "@kgos/sdk";

import { stateRef } from "../version/version-data.js";
import type { VersionReader } from "../version/version-data.js";
import { useVersionHistory } from "../version/use-version-history.js";
import type { DomainReader } from "./domain-data.js";
import { useWorldNavigation } from "./use-world-navigation.js";

const head = stateRef("a".repeat(64));
const previous = stateRef("b".repeat(64));
const research = stateRef("c".repeat(64));
const domainRef = "domain:People";
const path = JSON.stringify([domainRef]);
let host: HTMLDivElement;
let root: Root;
let navigation: ReturnType<typeof useWorldNavigation>;
let history: ReturnType<typeof useVersionHistory>;

function versionApi(): VersionReader {
  return {
    branch: {
      list: vi.fn().mockResolvedValue({
        items: [
          { name: "main", state: head },
          { name: "research", state: research },
          { name: "shared", state: head }
        ]
      })
    },
    tag: { list: vi.fn().mockResolvedValue({ items: [] }) },
    ancestry: vi
      .fn<VersionReader["ancestry"]>()
      .mockImplementation(({ root: at }) => Promise.resolve({ root: stateRef(at), items: [] })),
    get: vi
      .fn<VersionReader["get"]>()
      .mockImplementation(({ state }) => Promise.resolve({ state: stateRef(state) }))
  };
}

function domainApi(title = "People"): DomainReader {
  return {
    ontology: {
      read: vi.fn<DomainReader["ontology"]["read"]>().mockImplementation(({ at }) =>
        Promise.resolve({
          state: stateRef(at),
          results: [
            {
              kind: "overview",
              items: [{ kind: "domain", ref: domainRef, name: "People" }],
              total: 1,
              markdown: ""
            }
          ]
        })
      )
    },
    object: {
      read: vi.fn<DomainReader["object"]["read"]>().mockImplementation(({ at }) =>
        Promise.resolve({
          state: stateRef(at),
          results: [
            {
              kind: "domain",
              ref: domainRef,
              value: { name: "People", title, includes: [] }
            }
          ]
        })
      )
    }
  };
}

function Harness({
  versions,
  domains
}: {
  versions: VersionReader | null;
  domains: DomainReader | null;
}) {
  history = useVersionHistory(versions, head, "main");
  navigation = useWorldNavigation(domains, history);
  return null;
}

async function render(versions: VersionReader | null, domains: DomainReader | null) {
  await act(async () => {
    root.render(<Harness versions={versions} domains={domains} />);
    await Promise.resolve();
  });
}

async function update(action: () => void) {
  await act(async () => {
    action();
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

it("expands another world without selecting it or loading ancestry", async () => {
  const versions = versionApi();
  const domains = domainApi();
  await render(versions, domains);
  expect(navigation.world).toBe("main");
  expect(navigation.tree?.state).toBe(head);
  await update(() => {
    navigation.toggleWorld("research");
  });
  expect(navigation.world).toBe("research");
  expect(navigation.tree?.state).toBe(research);
  expect(history.currentWorld).toBe("main");
  expect(history.selectedCommit).toBe(head);
  expect(versions.get).not.toHaveBeenCalled();
  expect(versions.ancestry).not.toHaveBeenCalled();
  await update(() => {
    navigation.selectWorld("research");
  });
  expect(history.currentWorld).toBe("research");
  expect(history.selectedCommit).toBe(research);
  expect(navigation.world).toBe("research");
  expect(versions.ancestry).not.toHaveBeenCalled();
});

it("reads and selects domains at the pinned historical State instead of the observed head", async () => {
  const versions = versionApi();
  const domains = domainApi();
  await render(versions, domains);
  await update(() => {
    history.selectWorldSnapshot("main", previous);
  });
  expect(navigation.tree?.state).toBe(previous);
  expect(vi.mocked(domains.object.read).mock.calls.at(-1)?.[0]).toEqual({
    at: previous,
    refs: [domainRef]
  });
  expect(vi.mocked(domains.object.read).mock.calls.at(-1)?.[1]?.signal).toBeInstanceOf(AbortSignal);
  await update(() => {
    navigation.selectDomain(domainRef, path);
  });
  expect(vi.mocked(versions.get).mock.calls.at(-1)?.[0]).toEqual({ state: previous });
  expect(vi.mocked(versions.get).mock.calls.at(-1)?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(navigation.selected).toMatchObject({
    world: "main",
    state: previous,
    ref: domainRef,
    path
  });
});

it("keeps a domain selected when a later Branch selection fails", async () => {
  const versions = versionApi();
  await render(versions, domainApi());
  await update(() => {
    navigation.selectDomain(domainRef, path);
  });
  const selected = navigation.selected;
  vi.mocked(versions.get).mockRejectedValueOnce(new Error("offline"));
  await update(() => {
    navigation.selectWorld("research");
  });
  expect(history.selectionError).toBe(true);
  expect(history.currentWorld).toBe("main");
  expect(navigation.world).toBe("main");
  expect(navigation.selected).toBe(selected);
});

it("keeps shared-head worlds distinct and clears a domain on explicit Branch selection", async () => {
  await render(versionApi(), domainApi());
  await update(() => {
    navigation.selectDomain(domainRef, path);
  });
  await update(() => {
    navigation.toggleWorld("shared");
  });
  expect(navigation.world).toBe("shared");
  expect(navigation.tree?.state).toBe(head);
  expect(navigation.selected?.world).toBe("main");
  await update(() => {
    navigation.selectWorld("shared");
  });
  expect(history.currentWorld).toBe("shared");
  expect(navigation.selected).toBeNull();
});

it("ignores a cancelled domain selection after a later world wins", async () => {
  const versions = versionApi();
  await render(versions, domainApi());
  let finish: ((value: { state: ResolvedState }) => void) | undefined;
  vi.mocked(versions.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await update(() => {
    navigation.selectDomain(domainRef, path);
  });
  const signal = vi.mocked(versions.get).mock.calls.at(-1)?.[1]?.signal;
  await update(() => {
    navigation.selectWorld("research");
  });
  await update(() => finish?.({ state: head }));
  expect(signal?.aborted).toBe(true);
  expect(history.currentWorld).toBe("research");
  expect(navigation.selected).toBeNull();
});

it("distinguishes unknown domain data from an empty tree, and resets on disconnect", async () => {
  const versions = versionApi();
  const domains = domainApi();
  let finish: ((value: OntologyReadResult) => void) | undefined;
  vi.mocked(domains.ontology.read).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render(versions, domains);
  expect(navigation.loading).toBe(true);
  expect(navigation.isEmpty("main")).toBe(false);
  await update(() =>
    finish?.({ state: head, results: [{ kind: "overview", items: [], total: 0, markdown: "" }] })
  );
  expect(navigation.isEmpty("main")).toBe(true);
  expect(navigation.loading).toBe(false);
  await render(null, null);
  expect(navigation.world).toBeNull();
  expect(navigation.selected).toBeNull();
  expect(navigation.tree).toBeNull();
  const replacement = domainApi("Replacement world");
  await render(versionApi(), replacement);
  expect(navigation.tree?.nodes.get(domainRef)?.title).toBe("Replacement world");
  expect(navigation.isEmpty("main")).toBe(false);
});

it("shares expansion ownership while preserving separate paths for each world and State", async () => {
  const versions = versionApi();
  const domains = domainApi();
  await render(versions, domains);
  await update(() => {
    navigation.toggleDomain(path);
  });
  expect(navigation.expandedDomains.has(path)).toBe(true);
  await update(() => {
    navigation.toggleWorld("shared");
  });
  expect(navigation.expandedDomains.size).toBe(0);
  await update(() => {
    navigation.toggleDomain(path);
  });
  await update(() => {
    navigation.toggleWorld("main");
  });
  expect(navigation.expandedDomains.has(path)).toBe(true);
  await update(() => {
    history.selectWorldSnapshot("main", previous);
  });
  expect(navigation.expandedDomains.size).toBe(0);
  await update(() => {
    history.selectWorldSnapshot("main", head);
  });
  expect(navigation.expandedDomains.has(path)).toBe(true);
  await render(null, null);
  await render(versions, domains);
  expect(navigation.expandedDomains.size).toBe(0);
});

it("pins a browsed tree until an explicit latest-world selection", async () => {
  const versions = versionApi();
  const domains = domainApi();
  await render(versions, domains);
  await update(() => {
    navigation.toggleWorld("research");
  });
  const next = stateRef("d".repeat(64));
  vi.mocked(versions.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: head },
      { name: "research", state: next }
    ]
  });
  await update(() => {
    history.checkRefs();
  });
  expect(navigation.tree?.state).toBe(research);
  await update(() => {
    navigation.selectWorld("research");
  });
  expect(navigation.tree?.state).toBe(next);
  expect(history.selectedCommit).toBe(next);
});
