// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n, TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { stateRef } from "../version/version-data.js";
import { DomainTreeView } from "./domain-tree.js";
import type { DomainTree } from "./domain-data.js";
import type { WorldNavigation } from "./use-world-navigation.js";

const state = stateRef("a".repeat(64));
const work = "domain:Work";
const life = "domain:Life";
const shared = "domain:Shared";
const leaf = "domain:Leaf";
const selectDomain = vi.fn();
const retry = vi.fn();
const DOMAIN_NAME_SELECTOR = ".domain-name";
let host: HTMLDivElement;
let root: Root;

function model(ref: string, children: string[] = [], title?: string) {
  return { ref, name: ref.slice(7), children, ...(title === undefined ? {} : { title }) };
}

function tree(nodes: ReturnType<typeof model>[], roots = [work]): DomainTree {
  return { state, roots, nodes: new Map(nodes.map((node) => [node.ref, node])) };
}

function Harness({
  data,
  overrides
}: {
  data: DomainTree | null;
  overrides: Partial<WorldNavigation>;
}) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const navigation = {
    tree: data,
    loading: false,
    error: false,
    retry,
    world: "main",
    state,
    selected: null,
    toggleWorld: vi.fn(),
    selectWorld: vi.fn(),
    selectDomain,
    clearSelection: vi.fn(),
    isEmpty: () => false,
    expandedDomains: expanded,
    toggleDomain: (path: string) => {
      setExpanded((previous) => {
        const next = new Set(previous);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        return next;
      });
    },
    ...overrides
  };
  return (
    <TranslationProvider>
      <UiProvider>
        <DomainTreeView navigation={navigation} />
      </UiProvider>
    </TranslationProvider>
  );
}

async function render(data: DomainTree | null, overrides: Partial<WorldNavigation> = {}) {
  await act(async () => {
    root.render(<Harness data={data} overrides={overrides} />);
    await Promise.resolve();
  });
}

function row(path: string[]) {
  return [...host.querySelectorAll<HTMLElement>("[data-domain-path]")].find(
    (element) => element.dataset["domainPath"] === JSON.stringify(path)
  );
}

function expand(path: string[]) {
  const button = row(path)?.querySelector<HTMLButtonElement>(
    ":scope > .domain-tree-row > .domain-toggle"
  );
  if (button === null || button === undefined) throw new Error("Missing domain expander");
  act(() => {
    button.click();
  });
  return button;
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  selectDomain.mockClear();
  retry.mockClear();
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

it("opens subdomains independently from selecting a Domain name", async () => {
  await render(tree([model(work, [leaf], "Work and projects"), model(leaf)]));
  expect(row([work, leaf])).toBeUndefined();
  const toggle = expand([work]);
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
  expect(selectDomain).not.toHaveBeenCalled();
  expect(row([work, leaf])).toBeDefined();
  expect(row([work, leaf])?.querySelector(".domain-toggle")).toBeNull();
  act(() => row([work, leaf])?.querySelector<HTMLButtonElement>(DOMAIN_NAME_SELECTOR)?.click());
  expect(selectDomain).toHaveBeenCalledExactlyOnceWith(leaf, JSON.stringify([work, leaf]));
  expect(toggle.getAttribute("aria-expanded")).toBe("true");
});

it("shows shared Domains under each parent and keeps each expansion path independent", async () => {
  await render(
    tree(
      [model(work, [shared]), model(life, [shared]), model(shared, [leaf]), model(leaf)],
      [work, life]
    )
  );
  expand([work]);
  expand([life]);
  expect(host.querySelectorAll(`[data-domain-ref="${shared}"]`)).toHaveLength(2);
  expand([work, shared]);
  expect(row([work, shared, leaf])).toBeDefined();
  expect(row([life, shared, leaf])).toBeUndefined();
  expect(row([life, shared])?.querySelector(".domain-toggle")?.getAttribute("aria-expanded")).toBe(
    "false"
  );
  expand([life, shared]);
  expect(row([life, shared, leaf])).toBeDefined();
  expand([work]);
  expect(row([work, shared, leaf])).toBeUndefined();
  expect(row([life, shared, leaf])).toBeDefined();
});

it("shows a cycle as a terminal reference without hiding its normal entry", async () => {
  await render(tree([model(work, [work])]));
  expand([work]);
  expect(host.querySelectorAll(`[data-domain-ref="${work}"]`)).toHaveLength(2);
  const reference = row([work, work]);
  expect(reference?.textContent).toContain("Reference");
  expect(reference?.querySelector(".domain-toggle")).toBeNull();
  expect(reference?.querySelector("ol")).toBeNull();
  act(() => reference?.querySelector<HTMLButtonElement>(DOMAIN_NAME_SELECTOR)?.click());
  expect(selectDomain).toHaveBeenCalledExactlyOnceWith(work, JSON.stringify([work, work]));
});

it("does not highlight another world's identical Domain path or a stale version", async () => {
  const data = tree([model(work)]);
  const selected = { world: "main", state, ref: work, path: JSON.stringify([work]) };
  await render(data, { world: "research", selected });
  expect(row([work])?.querySelector(DOMAIN_NAME_SELECTOR)?.getAttribute("aria-pressed")).toBe(
    "false"
  );
  await render(data, { world: "main", selected: { ...selected, state: stateRef("b".repeat(64)) } });
  expect(row([work])?.querySelector(DOMAIN_NAME_SELECTOR)?.getAttribute("aria-pressed")).toBe(
    "false"
  );
  await render(data, { world: "main", selected });
  expect(row([work])?.querySelector(DOMAIN_NAME_SELECTOR)?.getAttribute("aria-pressed")).toBe(
    "true"
  );
});

it("keeps the confirmed tree visible after reload failure and offers an explicit retry", async () => {
  await render(tree([model(work)]), { error: true });
  expect(row([work])).toBeDefined();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load domains");
  const button = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent === "Retry domains"
  );
  act(() => button?.click());
  expect(retry).toHaveBeenCalledOnce();
  await render(null, { loading: true });
  expect(host.querySelector('[role="status"]')?.textContent).toBe("Loading domains...");
  expect(host.querySelectorAll("[data-domain-ref]")).toHaveLength(0);
});
