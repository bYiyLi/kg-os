// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import type { GraphQueryRequest, GraphQueryResult, ResolvedState } from "@kgos/sdk";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import {
  click,
  flush,
  inputValue,
  main,
  mockReader,
  namedRow,
  openRelationships
} from "../../../test/version-browser-fixture.js";
import { keywordQuery, indexQuery, connectQuery } from "../../features/graph/graph-queries.js";
import type { GraphReader } from "../../features/graph/graph-search.js";
import { stateRef } from "../../features/version/version-data.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { WorkspaceShell } from "./workspace-shell.js";

const CURRENT = stateRef(main);
const HISTORICAL = stateRef("e".repeat(64));
const CURRENT_NAME = "Current knowledge";
const HISTORICAL_NAME = "Historical knowledge";
const SEARCH_LABEL = "Search knowledge";
const HISTORY_ROW = "Fix properties";
const NODE_SELECTOR = ".graph-node";
let host: HTMLDivElement;
let root: Root;

function reply(request: GraphQueryRequest): GraphQueryResult {
  const state = request.at as ResolvedState;
  if (request.cypher === indexQuery)
    return { state, columns: ["name", "type", "labelsOrTypes"], rows: [] };
  if (request.cypher === connectQuery) return { state, columns: ["a", "r", "b"], rows: [] };
  if (request.cypher !== keywordQuery) throw new Error("Unexpected graph query");
  return {
    state,
    columns: ["n"],
    rows: [
      [
        {
          $type: "Node",
          elementId: "n:1",
          labels: ["Thing"],
          properties: { name: state === CURRENT ? CURRENT_NAME : HISTORICAL_NAME }
        }
      ]
    ]
  };
}

function graphReader(): GraphReader {
  return {
    query: vi
      .fn<GraphReader["query"]>()
      .mockImplementation((request) => Promise.resolve(reply(request)))
  };
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // Compare settled graph positions; layout animation is covered by its own tests.
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

async function render(graph: GraphReader, versions = mockReader()) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <WorkspaceShell
            versionReader={versions}
            domainReader={versions}
            graphReader={graph}
            initialVersionState={main}
            defaultVersionBranch="main"
          />
        </UiProvider>
      </TranslationProvider>
    );
    await Promise.resolve();
  });
  return versions;
}

async function search() {
  inputValue(SEARCH_LABEL, "knowledge");
  const form = host.querySelector(".graph-search");
  if (form === null) throw new Error("Missing graph search form");
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
}

function chooseHistorical() {
  act(() => {
    namedRow(HISTORY_ROW).click();
  });
}

it("rejects a late graph response after a confirmed version switch and queries the new State", async () => {
  const graph = graphReader();
  let release: (() => void) | undefined;
  let previousSignal: AbortSignal | undefined;
  const delayed = new Promise<GraphQueryResult>((resolve) => {
    release = () => {
      resolve(reply({ at: CURRENT, cypher: keywordQuery }));
    };
  });
  vi.mocked(graph.query).mockImplementation((request, options) => {
    if (request.at === CURRENT && request.cypher === keywordQuery) {
      previousSignal = options?.signal;
      return delayed;
    }
    return Promise.resolve(reply(request));
  });
  await render(graph);
  await search();
  expect(previousSignal?.aborted).toBe(false);
  await openRelationships();
  chooseHistorical();
  await flush();
  expect(document.querySelector(".version-browsing-identity")?.textContent).toContain("eeeeeee");
  expect(previousSignal?.aborted).toBe(true);
  await act(async () => {
    release?.();
    await delayed;
  });
  expect(host.querySelector(NODE_SELECTOR)).toBeNull();
  expect(host.textContent).not.toContain(CURRENT_NAME);
  click("Close version relationships");
  await flush();
  vi.mocked(graph.query).mockClear();
  await search();
  expect(host.querySelector(NODE_SELECTOR)?.textContent).toContain(HISTORICAL_NAME);
  expect(vi.mocked(graph.query).mock.calls.length).toBeGreaterThan(0);
  for (const [request] of vi.mocked(graph.query).mock.calls) expect(request.at).toBe(HISTORICAL);
});

it("keeps the graph and focus inside history when opening and closing without switching", async () => {
  const graph = graphReader();
  await render(graph);
  await search();
  const node = host.querySelector(NODE_SELECTOR);
  const transform = node?.getAttribute("transform");
  expect(node?.textContent).toContain(CURRENT_NAME);
  vi.mocked(graph.query).mockClear();
  await openRelationships();
  const focused = document.activeElement;
  expect(focused).toBe(document.querySelector(".version-dag-close"));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
  expect(document.activeElement).toBe(focused);
  expect(host.querySelector(NODE_SELECTOR)).toBe(node);
  click("Close version relationships");
  await flush();
  expect(document.activeElement?.getAttribute("aria-label")).toBe("View history: main");
  expect(host.querySelector(NODE_SELECTOR)).toBe(node);
  expect(node?.getAttribute("transform")).toBe(transform);
  expect(graph.query).not.toHaveBeenCalled();
});

it("preserves the current graph and State when the requested historical version fails", async () => {
  const graph = graphReader();
  const versions = await render(graph);
  await search();
  const node = host.querySelector(NODE_SELECTOR);
  expect(node?.textContent).toContain(CURRENT_NAME);
  vi.mocked(graph.query).mockClear();
  vi.mocked(versions.get).mockRejectedValueOnce(new Error("Unavailable version"));
  await openRelationships();
  chooseHistorical();
  await flush();
  expect(document.querySelector(".version-browsing-feedback")?.textContent).toContain(
    "Your previous selection is unchanged."
  );
  expect(document.querySelector(".version-browsing-identity")?.textContent).toContain("aaaaaaa");
  expect(host.querySelector(NODE_SELECTOR)).toBe(node);
  expect(graph.query).not.toHaveBeenCalled();
  click("Close version relationships");
  await flush();
  await search();
  expect(host.querySelector(NODE_SELECTOR)?.textContent).toContain(CURRENT_NAME);
  for (const [request] of vi.mocked(graph.query).mock.calls) expect(request.at).toBe(CURRENT);
});
