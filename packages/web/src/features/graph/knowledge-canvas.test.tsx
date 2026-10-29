// @vitest-environment jsdom
// cspell:words unconfigured relayout

import { act, useImperativeHandle } from "react";
import type { Ref } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { ResolvedState } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n, TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import type { GraphData } from "./graph-data.js";
import { emptyGraph } from "./graph-data.js";
import { connectKnowledge, expandKnowledge, searchKnowledge } from "./graph-search.js";
import type { GraphReader, KnowledgeSearchResult } from "./graph-search.js";
import type { GraphSceneContextTarget, GraphSceneHandle } from "./graph-scene.js";
import { KnowledgeCanvas } from "./knowledge-canvas.js";

const sceneCommands = vi.hoisted(() => ({
  focusNode: vi.fn(),
  togglePin: vi.fn(),
  isPinned: vi.fn(() => false),
  fit: vi.fn(),
  relayout: vi.fn()
}));
vi.mock("./graph-search.js", () => ({
  searchKnowledge: vi.fn(),
  expandKnowledge: vi.fn(),
  connectKnowledge: vi.fn()
}));
vi.mock("./graph-scene.js", () => ({
  GraphScene: ({
    data,
    disabled,
    onSelect,
    onToggleExpand,
    onContextMenu,
    ref
  }: {
    data: GraphData;
    disabled: boolean;
    onSelect: (id: string | null) => void;
    onToggleExpand: (id: string) => void;
    onContextMenu: (target: GraphSceneContextTarget) => void;
    ref: Ref<GraphSceneHandle>;
  }) => {
    useImperativeHandle(ref, () => sceneCommands);
    return (
      <svg className="graph-scene" tabIndex={0} aria-label="Test graph scene">
        {data.nodes.map((node) => {
          const name = node.properties["name"];
          const label = typeof name === "string" ? name : node.id;
          return (
            <g
              key={node.id}
              data-graph-id={node.id}
              role="button"
              tabIndex={0}
              aria-label={label}
              onClick={() => {
                if (!disabled) onSelect(node.id);
              }}
              onDoubleClick={() => {
                if (!disabled) onToggleExpand(node.id);
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!disabled) onContextMenu({ id: node.id, x: 30, y: 40 });
              }}
              onKeyDown={(event) => {
                if (!disabled && event.key === "Enter") {
                  if (event.shiftKey) onToggleExpand(node.id);
                  else onSelect(node.id);
                }
              }}
            >
              <title>{label}</title>
            </g>
          );
        })}
      </svg>
    );
  }
}));

const state = ("commit/" + "a".repeat(64)) as ResolvedState;
const nextState = ("commit/" + "b".repeat(64)) as ResolvedState;
const reader: GraphReader = { query: vi.fn() };
const nextReader: GraphReader = { query: vi.fn() };
const ARIA_LABEL = "aria-label";
const FOUND_NAME = "Found object";
const FIRST_SELECTOR = '[data-graph-id="n:1"]';
let host: HTMLDivElement;
let root: Root;

function result(id: string, name: string, partial = false): KnowledgeSearchResult {
  return {
    data: {
      nodes: [{ id, labels: ["Example"], properties: { name } }],
      relationships: [],
      limited: partial
    },
    routes: [
      { kind: "keyword", status: partial ? "error" : "ok", count: partial ? 0 : 1, limited: false },
      {
        kind: "fulltext",
        status: partial ? "error" : "unconfigured",
        count: partial ? 1 : 0,
        limited: partial
      },
      { kind: "semantic", status: "unconfigured", count: 0, limited: false }
    ]
  };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  vi.resetAllMocks();
  vi.mocked(connectKnowledge).mockResolvedValue(emptyGraph());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

function render(currentReader = reader, currentState = state) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <KnowledgeCanvas reader={currentReader} state={currentState} blocked={false} />
        </UiProvider>
      </TranslationProvider>
    );
  });
}

function field(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]');
  if (input === null) throw new Error("Missing graph search input");
  return input;
}

async function search(query: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Missing input value setter");
  act(() => {
    descriptor.set?.call(field(), query);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
  const form = host.querySelector("form");
  if (form === null) throw new Error("Missing search form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function node(id: string): SVGGElement {
  const item = host.querySelector<SVGGElement>(`[data-graph-id="${id}"]`);
  if (item === null) throw new Error("Missing graph node " + id);
  return item;
}

function control(key: string): HTMLButtonElement {
  const label = i18n.t(key);
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.getAttribute(ARIA_LABEL) === label || button.textContent.trim() === label
  );
  if (found === undefined) throw new Error("Missing canvas control " + key);
  return found;
}

function select(id: string) {
  act(() => {
    node(id).focus();
    node(id).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
}

async function clickControl(key: string) {
  await act(async () => {
    control(key).focus();
    control(key).click();
    await Promise.resolve();
  });
}

function requestOptions(): Parameters<typeof searchKnowledge>[3] {
  const options = vi
    .mocked(searchKnowledge)
    .mock.calls.findLast(([, , query]) => query.trim() !== "")?.[3];
  if (options === undefined) throw new Error("Missing search request options");
  return options;
}

it.each([false, true])(
  "hiding the last returned node does not turn the search into zero matches or failure (partial=%s)",
  async (partial) => {
    vi.mocked(searchKnowledge).mockResolvedValue(result("n:1", FOUND_NAME, partial));
    render();
    await search("example");
    expect(node("n:1").getAttribute(ARIA_LABEL)).toBe(FOUND_NAME);
    select("n:1");
    await clickControl("graph.hide");
    expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
    expect(host.textContent).not.toContain(i18n.t("graph.noMatches"));
    expect(host.textContent).not.toContain(i18n.t("graph.searchFailed"));
    expect(host.textContent).not.toContain(i18n.t("graph.emptyPartial"));
    expect(host.textContent).toContain(i18n.t("graph.shown", { nodes: 0, relationships: 0 }));
    expect(document.activeElement).toBe(host.querySelector('svg[aria-label="Test graph scene"]'));
    expect(searchKnowledge).toHaveBeenCalledTimes(2);
  }
);

it("returns keyboard focus to the selected object after closing its details", async () => {
  vi.mocked(searchKnowledge).mockResolvedValue(result("n:1", FOUND_NAME));
  render();
  await search("example");
  select("n:1");
  const selected = node("n:1");
  await clickControl("graph.closeDetails");
  expect(host.querySelector('aside[aria-label="Object details"]')).toBeNull();
  expect(document.activeElement).toBe(selected);
  expect(selected.isConnected).toBe(true);
});

it.each<[string, GraphReader, ResolvedState]>([
  ["connection with the same State", nextReader, state],
  ["State on the same connection", reader, nextState]
])("isolates a changed %s from late progress and results", async (_label, newReader, newState) => {
  const first = pending<KnowledgeSearchResult>();
  render();
  vi.mocked(searchKnowledge)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValue(result("n:2", "New object"));
  await search("old query");
  const old = requestOptions();
  act(() => {
    old.onProgress?.(result("n:1", "Old partial object"));
  });
  expect(node("n:1").getAttribute(ARIA_LABEL)).toBe("Old partial object");
  render(newReader, newState);
  expect(old.signal.aborted).toBe(true);
  expect(field().value).toBe("");
  expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
  await act(async () => {
    old.onProgress?.(result("n:1", "Late partial object"));
    first.resolve(result("n:1", "Late final object"));
    await first.promise;
  });
  expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
  expect(host.textContent).not.toContain(i18n.t("graph.noMatches"));
  await search("new query");
  expect(node("n:2").getAttribute(ARIA_LABEL)).toBe("New object");
  expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
});

it("shows finished route data and pending route state before the combined search finishes", async () => {
  const request = pending<KnowledgeSearchResult>();
  render();
  vi.mocked(searchKnowledge).mockReturnValue(request.promise);
  await search("example");
  const progress = result("n:1", "Early keyword object");
  progress.routes = [
    { kind: "keyword", status: "ok", count: 1, limited: false },
    { kind: "fulltext", status: "loading", count: 0, limited: false },
    { kind: "semantic", status: "loading", count: 0, limited: false }
  ];
  act(() => {
    requestOptions().onProgress?.(progress);
  });
  expect(node("n:1").getAttribute(ARIA_LABEL)).toBe("Early keyword object");
  expect(host.textContent).toContain(i18n.t("graph.routeCount", { count: 1 }));
  expect(host.textContent).toContain(i18n.t("graph.routeStatus.loading"));
  expect(host.textContent).toContain(i18n.t("graph.searching"));
  await act(async () => {
    request.resolve(result("n:1", "Early keyword object"));
    await request.promise;
  });
  expect(host.textContent).not.toContain(i18n.t("graph.searching"));
  expect(host.textContent).not.toContain(i18n.t("graph.routeStatus.loading"));
});

it("connects the final search seeds without requiring one expansion per result", async () => {
  const found = result("n:1", "First object");
  found.data.nodes.push(...result("n:2", "Second object").data.nodes);
  found.routes = found.routes.map((route) => ({
    ...route,
    count: route.kind === "keyword" ? 2 : route.count
  }));
  const connected = {
    ...found.data,
    relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "RELATED", properties: {} }]
  };
  vi.mocked(searchKnowledge).mockResolvedValue(found);
  vi.mocked(connectKnowledge).mockResolvedValue(connected);
  render();
  await search("example");
  expect(connectKnowledge).toHaveBeenCalledWith(
    reader,
    state,
    ["n:1", "n:2"],
    expect.any(AbortSignal)
  );
  expect(host.textContent).toContain(i18n.t("graph.shown", { nodes: 2, relationships: 1 }));
  expect(host.textContent).toContain(i18n.t("graph.gestureHint"));
  expect(expandKnowledge).not.toHaveBeenCalled();
});

it.each(["double click", "Shift+Enter"])(
  "expands the directly activated node with %s rather than the previous selection",
  async (gesture) => {
    const found = result("n:1", "First object");
    found.data.nodes.push(...result("n:2", "Second object").data.nodes);
    vi.mocked(searchKnowledge).mockResolvedValue(found);
    vi.mocked(expandKnowledge).mockResolvedValue(emptyGraph());
    render();
    await search("example");
    select("n:1");
    await act(async () => {
      node("n:2").dispatchEvent(
        gesture === "double click"
          ? new MouseEvent("dblclick", { bubbles: true })
          : new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })
      );
      await Promise.resolve();
    });
    expect(expandKnowledge).toHaveBeenCalledWith(reader, state, "n:2", expect.any(AbortSignal));
    if (gesture === "Shift+Enter")
      expect(host.querySelector(".graph-inspector h2")?.textContent).toBe("First object");
    expect(host.textContent).toContain(i18n.t("graph.notice.empty"));
  }
);

it("restores a hidden scene with the graph shortcut and leaves search input editing alone", async () => {
  vi.mocked(searchKnowledge).mockResolvedValue(result("n:1", FOUND_NAME));
  render();
  await search("example");
  select("n:1");
  act(() => {
    node("n:1").dispatchEvent(
      new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })
    );
  });
  expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
  expect(document.activeElement).toBe(host.querySelector(".graph-scene"));
  act(() => {
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })
    );
  });
  expect(host.querySelector(FIRST_SELECTOR)).toBeNull();
  act(() => {
    host
      .querySelector(".graph-scene")
      ?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true })
      );
  });
  expect(node("n:1").getAttribute(ARIA_LABEL)).toBe(FOUND_NAME);
  expect(host.textContent).toContain(i18n.t("graph.notice.restored"));
});

it("routes node context actions through the scene handle with the context node identity", async () => {
  const found = result("n:1", "First object");
  found.data.nodes.push(...result("n:2", "Second object").data.nodes);
  vi.mocked(searchKnowledge).mockResolvedValue(found);
  render();
  await search("example");
  select("n:1");
  await act(async () => {
    node("n:2").dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  const focus = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent === i18n.t("graph.focusNode")
  );
  if (focus === undefined) throw new Error("Missing context focus action");
  await act(async () => {
    focus.click();
    await Promise.resolve();
  });
  expect(sceneCommands.focusNode).toHaveBeenCalledWith("n:2");
  expect(host.querySelector(".graph-inspector h2")?.textContent).toBe("Second object");
});
