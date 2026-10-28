// @vitest-environment jsdom
// cspell:words unconfigured

import { act } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { stateRef } from "../version/version-data.js";
import type { GraphData, GraphNode, GraphRelationship } from "./graph-data.js";
import { GraphInspector } from "./graph-inspector.js";
import { GraphSearchStatus } from "./graph-search-status.js";
import type { SearchRoute } from "./graph-search.js";

const EXPAND_LABEL = "Expand neighbors";
const HIDE_LABEL = "Hide from canvas";
const CLOSE_LABEL = "Close object details";
const ALERT_SELECTOR = '[role="alert"]';
const STATE = stateRef("a".repeat(64));
const NODE: GraphNode = {
  id: "n:17",
  labels: ["Person", "Author"],
  properties: { name: "Ada" }
};
const RELATIONSHIP: GraphRelationship = {
  id: "r:29",
  type: "WROTE",
  start: "n:17",
  end: "n:31",
  properties: { confidence: 0.75 }
};
const EMPTY: GraphData = { nodes: [], relationships: [], limited: false };
const onClose = vi.fn<() => void>();
const onExpand = vi.fn<() => void>();
const onHide = vi.fn<() => void>();
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  vi.clearAllMocks();
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

function render(content: ReactNode) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>{content}</UiProvider>
      </TranslationProvider>
    );
  });
}

function inspector(overrides: Partial<ComponentProps<typeof GraphInspector>> = {}) {
  render(
    <GraphInspector
      node={undefined}
      relationship={undefined}
      expanding={false}
      failed={false}
      disabled={false}
      onClose={onClose}
      onExpand={onExpand}
      onHide={onHide}
      {...overrides}
    />
  );
}

function status(overrides: Partial<ComponentProps<typeof GraphSearchStatus>> = {}) {
  render(
    <GraphSearchStatus data={EMPTY} routes={null} failed={false} state={STATE} {...overrides} />
  );
}

function button(name: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.getAttribute("aria-label") === name || element.textContent === name
  );
  if (result === undefined) throw new Error("Missing graph action: " + name);
  return result;
}

function click(name: string) {
  act(() => {
    button(name).click();
  });
}

function route(
  kind: SearchRoute["kind"],
  state: SearchRoute["status"],
  count = 0,
  limited = false
): SearchRoute {
  return { kind, status: state, count, limited };
}

it("does not invent an inspector or search result before an object or search is available", () => {
  inspector();
  expect(host.querySelector("aside")).toBeNull();
  status();
  expect(host.textContent).toBe("");
  expect(host.querySelector('[role="alert"], [role="status"]')).toBeNull();
});

it("shows the selected node identity, labels and typed properties without changing their values", () => {
  const node: GraphNode = {
    ...NODE,
    properties: {
      name: "Ada",
      sequence: [2, 1],
      settings: { active: true, missing: null },
      literal: '<img src="untrusted" />',
      count: 0
    }
  };
  const original = JSON.stringify(node);
  inspector({ node });
  expect(host.querySelector("h2")?.textContent).toBe("Ada");
  expect(host.querySelector(".graph-object-id")?.textContent).toBe("n:17");
  expect(host.querySelector(".graph-object-labels")?.textContent).toBe("Person · Author");
  const values = [...host.querySelectorAll("dd pre")].map((element) => element.textContent);
  expect(values).toEqual([
    "Ada",
    "[\n  2,\n  1\n]",
    '{\n  "active": true,\n  "missing": null\n}',
    '<img src="untrusted" />',
    "0"
  ]);
  expect(host.querySelector("img")).toBeNull();
  expect(JSON.stringify(node)).toBe(original);
});

it("keeps a relationship's real identity and stored direction and offers only applicable actions", () => {
  inspector({ relationship: RELATIONSHIP });
  expect(host.querySelector("h2")?.textContent).toBe("WROTE");
  expect(host.querySelector(".graph-object-id")?.textContent).toBe("r:29");
  expect(host.querySelector(".graph-endpoints")?.textContent).toBe("n:17 → n:31");
  expect(host.querySelector("dd pre")?.textContent).toBe("0.75");
  expect(host.textContent).not.toContain(EXPAND_LABEL);
  expect(host.querySelector(".graph-object-labels")).toBeNull();
  click(HIDE_LABEL);
  expect(onHide).toHaveBeenCalledOnce();
  click(CLOSE_LABEL);
  expect(onClose).toHaveBeenCalledOnce();
});

it("describes an unlabeled object without properties and supports explicit expand and keyboard close", () => {
  inspector({ node: { id: "n:1", labels: [], properties: {} } });
  expect(host.querySelector("h2")?.textContent).toBe("n:1");
  expect(host.textContent).toContain("No labels");
  expect(host.textContent).toContain("No properties");
  click(EXPAND_LABEL);
  expect(onExpand).toHaveBeenCalledOnce();
  const aside = host.querySelector("aside");
  if (aside === null) throw new Error("Missing inspector");
  const other = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  act(() => {
    aside.dispatchEvent(other);
  });
  expect(onClose).not.toHaveBeenCalled();
  const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  act(() => {
    aside.dispatchEvent(escape);
  });
  expect(escape.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledOnce();
});

it("shows expansion in progress, prevents repeat expansion and still allows hiding the object", () => {
  inspector({ node: NODE, expanding: true });
  expect(button("Expanding…").disabled).toBe(true);
  click("Expanding…");
  expect(onExpand).not.toHaveBeenCalled();
  expect(button(HIDE_LABEL).disabled).toBe(false);
  click(HIDE_LABEL);
  expect(onHide).toHaveBeenCalledOnce();
});

it("blocks graph-changing inspector actions when the workspace is unavailable while allowing close", () => {
  inspector({ node: NODE, disabled: true });
  expect(button(EXPAND_LABEL).disabled).toBe(true);
  expect(button(HIDE_LABEL).disabled).toBe(true);
  click(EXPAND_LABEL);
  click(HIDE_LABEL);
  expect(onExpand).not.toHaveBeenCalled();
  expect(onHide).not.toHaveBeenCalled();
  click(CLOSE_LABEL);
  expect(onClose).toHaveBeenCalledOnce();
});

it("retains readable properties and a retryable expansion action after a failure", () => {
  inspector({ node: NODE, failed: true });
  expect(host.querySelector(ALERT_SELECTOR)?.textContent).toBe(
    "Neighbors could not be loaded. The existing graph is unchanged."
  );
  expect(host.querySelector("dd pre")?.textContent).toBe("Ada");
  expect(button(EXPAND_LABEL).disabled).toBe(false);
  click(EXPAND_LABEL);
  expect(onExpand).toHaveBeenCalledOnce();
});

it("labels a bounded property preview without changing the original property", () => {
  const original = "x".repeat(4097);
  const node: GraphNode = { ...NODE, properties: { text: original, empty: "" } };
  inspector({ node });
  const values = host.querySelectorAll("dd pre");
  expect(values[0]?.textContent).toBe(original.slice(0, 4096));
  expect(values[1]?.textContent).toBe("");
  expect(host.textContent).toContain(
    "Previewing the first 4096 characters; the original value is unchanged."
  );
  expect(node.properties["text"]).toBe(original);
});

it("reports displayed counts and each real search source without presenting partial results as complete", () => {
  status({
    data: { nodes: [NODE, { ...NODE, id: "n:31" }], relationships: [RELATIONSHIP], limited: true },
    routes: [
      route("keyword", "ok", 1),
      route("fulltext", "unconfigured"),
      route("semantic", "error", 0, true)
    ]
  });
  expect(host.querySelector(".graph-read-status > p")?.textContent).toBe(
    "Showing 2 nodes · 1 relationships · Partial results displayed"
  );
  const sources = [...host.querySelectorAll(".graph-route-status span")];
  expect(
    sources.map((element) => [element.getAttribute("data-status"), element.textContent])
  ).toEqual([
    ["ok", "Keyword · 1 matches"],
    ["unconfigured", "Full-text · No index configured"],
    ["error", "Semantic · Unavailable · Limited results"]
  ]);
  expect(host.querySelector(ALERT_SELECTOR)).toBeNull();
  expect(host.querySelector("small")?.textContent).toBe("aaaaaaa");
  expect(host.querySelector("small")?.title).toBe(STATE);
});

it.each([
  { partial: false, expected: "No matching nodes were returned." },
  { partial: true, expected: "No nodes were returned. Some search sources are unavailable." }
])(
  "distinguishes a completed empty search from unavailable sources: $partial",
  ({ partial, expected }) => {
    status({
      routes: [
        route("keyword", "ok"),
        route("fulltext", partial ? "error" : "unconfigured"),
        route("semantic", "unconfigured")
      ],
      state: null
    });
    expect(host.querySelector(".graph-search-message")?.getAttribute("role")).toBe("status");
    expect(host.querySelector(".graph-search-message")?.textContent).toBe(expected);
    expect(host.querySelector(ALERT_SELECTOR)).toBeNull();
    expect(host.querySelector("small")).toBeNull();
  }
);

it("reports a failed search as an error rather than an empty knowledge base", () => {
  status({
    routes: [
      route("keyword", "error"),
      route("fulltext", "unconfigured"),
      route("semantic", "error")
    ]
  });
  expect(host.querySelector(ALERT_SELECTOR)?.textContent).toBe(
    "Knowledge search could not be completed. Try searching again."
  );
  expect(host.textContent).not.toContain("No matching nodes were returned.");
  status({ failed: true });
  expect(host.querySelector(ALERT_SELECTOR)).not.toBeNull();
  expect(host.querySelector(".graph-read-status")).toBeNull();
});

it("keeps pending search sources visible without announcing an empty or failed result", () => {
  status({
    routes: [
      route("keyword", "loading"),
      route("fulltext", "unconfigured"),
      route("semantic", "unconfigured")
    ]
  });
  expect(host.querySelector('.graph-route-status [data-status="loading"]')?.textContent).toBe(
    "Keyword · Searching…"
  );
  expect(host.querySelector(".graph-read-status > p")?.textContent).toContain(
    "Partial results displayed"
  );
  expect(host.querySelector(".graph-search-message")).toBeNull();
  expect(host.querySelector(ALERT_SELECTOR)).toBeNull();
});
