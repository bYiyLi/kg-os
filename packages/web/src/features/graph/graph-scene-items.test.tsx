// @vitest-environment jsdom

import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n, TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import type { GraphData } from "./graph-data.js";
import { GraphControls, GraphEdges, GraphNodes } from "./graph-scene-items.js";

const NODE = '[data-node-id="n:1"]';
const EDGE = '[data-relationship-id="r:1"]';
const DATA: GraphData = {
  nodes: [
    { id: "n:1", labels: ["Example"], properties: { name: "First object" } },
    { id: "n:2", labels: ["Example"], properties: { name: "Second object" } }
  ],
  relationships: [{ id: "r:1", start: "n:1", end: "n:2", type: "LINKS", properties: {} }],
  limited: false
};
const POSITIONS = new Map([
  ["n:1", { x: 0, y: 0 }],
  ["n:2", { x: 100, y: 0 }]
]);

let host: HTMLDivElement;
let root: Root;
const onSelect = vi.fn<(id: string, keyboard?: boolean) => void>();
const onMove = vi.fn();
const onToggleExpand = vi.fn<(id: string, keyboard?: boolean) => void>();

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSelect.mockClear();
  onMove.mockClear();
  onToggleExpand.mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function render(children: ReactNode) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>{children}</UiProvider>
      </TranslationProvider>
    );
  });
}

function item(selector: string): Element {
  const element = host.querySelector(selector);
  if (element === null) throw new Error("Missing graph item " + selector);
  return element;
}

function fire(selector: string, event: Event) {
  act(() => {
    item(selector).dispatchEvent(event);
  });
}

function nodes(disabled = false) {
  return (
    <GraphNodes
      data={DATA}
      positions={POSITIONS}
      selected="n:2"
      disabled={disabled}
      expanded={new Set(["n:1"])}
      expandingIds={new Set(["n:1"])}
      pinned={new Set(["n:1"])}
      onSelect={onSelect}
      onMove={onMove}
      onToggleExpand={onToggleExpand}
    />
  );
}

it("expands the activated node directly and keeps ordinary selection separate", () => {
  render(<svg>{nodes()}</svg>);
  fire(NODE, new MouseEvent("dblclick", { bubbles: true }));
  expect(onToggleExpand).toHaveBeenLastCalledWith("n:1", false);
  fire(NODE, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  expect(onToggleExpand).toHaveBeenLastCalledWith("n:1", true);
  expect(onSelect).not.toHaveBeenCalled();
  fire(NODE, new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("n:1", true);
  expect(onMove).not.toHaveBeenCalled();
});

it("exposes expanded, loading and pin states without fabricating object fields", () => {
  render(<svg>{nodes()}</svg>);
  expect(item(NODE).getAttribute("aria-expanded")).toBe("true");
  expect(item(NODE).getAttribute("aria-busy")).toBe("true");
  expect(item(NODE).getAttribute("data-pinned")).toBe("true");
  expect(host.querySelectorAll(".graph-node-busy")).toHaveLength(1);
  expect(host.querySelectorAll(".graph-node-expanded-mark")).toHaveLength(1);
  expect(host.querySelectorAll(".graph-node-pin-mark")).toHaveLength(1);
  expect(item(NODE).querySelector("title")?.textContent).toContain("First object · n:1");
  expect(item(NODE).querySelector("title")?.textContent).toContain(i18n.t("graph.nodeHint"));
});

it("lets pointer presses reach the scene gesture owner for both nodes and relationship lines", () => {
  const pressed = vi.fn();
  const clicked = vi.fn();
  render(
    <svg onPointerDown={pressed} onClick={clicked}>
      {nodes()}
      <GraphEdges
        data={DATA}
        positions={POSITIONS}
        selected={null}
        disabled={false}
        marker="arrow"
        onSelect={onSelect}
      />
    </svg>
  );
  const press = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
  fire(NODE, press);
  fire(EDGE, new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
  expect(pressed).toHaveBeenCalledTimes(2);
  expect(press.defaultPrevented).toBe(false);
  fire(EDGE, new MouseEvent("click", { bubbles: true }));
  expect(onSelect).toHaveBeenLastCalledWith("r:1", false);
  expect(clicked).not.toHaveBeenCalled();
});

it("keeps disabled nodes and relationships non-interactive", () => {
  render(
    <svg>
      {nodes(true)}
      <GraphEdges
        data={DATA}
        positions={POSITIONS}
        selected={null}
        disabled
        marker="arrow"
        onSelect={onSelect}
      />
    </svg>
  );
  fire(NODE, new MouseEvent("click", { bubbles: true }));
  fire(NODE, new MouseEvent("dblclick", { bubbles: true }));
  fire(NODE, new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true }));
  fire(NODE, new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  fire(EDGE, new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  expect(onToggleExpand).not.toHaveBeenCalled();
  expect(onSelect).not.toHaveBeenCalled();
  expect(onMove).not.toHaveBeenCalled();
  expect(item(NODE).getAttribute("tabindex")).toBe("-1");
});

it("provides an explicit relayout action alongside the four existing camera controls", () => {
  const relayout = vi.fn();
  render(
    <GraphControls
      camera={{ x: 0, y: 0, scale: 1 }}
      disabled={false}
      onZoom={vi.fn()}
      onReset={vi.fn()}
      onFit={vi.fn()}
      onRelayout={relayout}
    />
  );
  expect(host.querySelectorAll("button")).toHaveLength(5);
  act(() => {
    item(".graph-relayout-button").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  expect(relayout).toHaveBeenCalledOnce();
  expect(item(".graph-relayout-button").getAttribute("aria-label")).toBe(i18n.t("graph.relayout"));
});
