// @vitest-environment jsdom
// cspell:words relayout

import { act, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider, i18n } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { emptyGraph } from "./graph-data.js";
import { GraphContextMenu } from "./graph-context-menu.js";
import type { GraphMenuAction } from "./graph-context-menu.js";
import { GraphInteractionFeedback } from "./graph-interaction-feedback.js";
import type { GraphSceneHandle } from "./graph-scene.js";
import { useCanvasActions } from "./use-canvas-actions.js";
import type { useGraphExplorer } from "./use-graph-explorer.js";

type Explorer = ReturnType<typeof useGraphExplorer>;
type MenuProps = ComponentProps<typeof GraphContextMenu>;
const FIRST_NODE = "n:1";
const SECOND_NODE = "n:2";
const MENU_ITEM = '[role="menuitem"]';
const NOTICE_SELECTOR = ".graph-action-notice";
const scene: GraphSceneHandle = {
  focusNode: vi.fn(),
  togglePin: vi.fn(),
  isPinned: vi.fn(() => false),
  fit: vi.fn(),
  relayout: vi.fn()
};
let host: HTMLDivElement;
let root: Root;
let actions: ReturnType<typeof useCanvasActions>;

function explorer(overrides: Partial<Explorer> = {}): Explorer {
  return {
    data: {
      nodes: [{ id: FIRST_NODE, labels: [], properties: { name: "First" } }],
      relationships: [],
      limited: false
    },
    getSeeds: vi.fn(emptyGraph),
    setSeeds: vi.fn(),
    selected: FIRST_NODE,
    highlighted: null,
    select: vi.fn(),
    focusNode: vi.fn(),
    reset: vi.fn(),
    notice: null,
    expand: vi.fn<Explorer["expand"]>().mockResolvedValue(undefined),
    collapse: vi.fn(),
    toggleExpand: vi.fn(),
    expanded: new Set(),
    expandingIds: new Set(),
    expanding: false,
    expandFailed: false,
    hide: vi.fn(),
    undoHide: vi.fn(),
    canUndoHide: false,
    routes: null,
    failed: false,
    linksFailed: false,
    scene: 0,
    clear: vi.fn(),
    search: vi.fn<Explorer["search"]>().mockResolvedValue(undefined),
    retryLinks: vi.fn<Explorer["retryLinks"]>().mockResolvedValue(undefined),
    busy: false,
    ...overrides
  };
}

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
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function render(content: ReactNode) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>{content}</UiProvider>
      </TranslationProvider>
    );
    await Promise.resolve();
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent === label
  );
  if (found === undefined) throw new Error("Missing graph feedback button: " + label);
  return found;
}

function menu(overrides: Partial<MenuProps> = {}): MenuProps {
  return {
    target: { id: FIRST_NODE, x: 20, y: 30 },
    surface: { current: host },
    expanded: false,
    pinned: false,
    busy: false,
    canUndo: false,
    onAction: vi.fn(),
    onClose: vi.fn(),
    onReturnFocus: vi.fn(),
    ...overrides
  };
}

function menuItem(label: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(MENU_ITEM)].find(
    (item) => item.textContent === label
  );
  if (found === undefined) throw new Error("Missing graph menu action: " + label);
  return found;
}

it("offers node exploration and view commands and exposes disabled undo until there is hidden content", async () => {
  const props = menu();
  await render(<GraphContextMenu {...props} />);
  expect([...document.querySelectorAll(MENU_ITEM)].map((item) => item.textContent)).toEqual([
    "Expand neighbors",
    "Focus node",
    "Pin position",
    "Hide from canvas",
    "Undo hide",
    "Fit graph to canvas",
    "Arrange graph"
  ]);
  expect(menuItem("Undo hide").getAttribute("aria-disabled")).toBe("true");
  act(() => {
    menuItem("Expand neighbors").click();
  });
  expect(props.onAction).toHaveBeenCalledWith("expand");
});

it("presents collapse and unpin for an expanded pinned node and blocks data changes while searching", async () => {
  const props = menu({ expanded: true, pinned: true, busy: true, canUndo: true });
  await render(<GraphContextMenu {...props} />);
  for (const label of ["Collapse this expansion", "Hide from canvas", "Undo hide"]) {
    expect(menuItem(label).getAttribute("aria-disabled")).toBe("true");
    act(() => {
      menuItem(label).click();
    });
  }
  expect(props.onAction).not.toHaveBeenCalled();
  act(() => {
    menuItem("Unpin position").click();
  });
  expect(props.onAction).toHaveBeenCalledWith("pin");
});

it("focuses the first enabled action when an external graph gesture opens the menu", async () => {
  await render(<GraphContextMenu {...menu()} />);
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(menuItem("Expand neighbors"));
  });
  await render(<GraphContextMenu {...menu({ target: null })} />);
  await render(<GraphContextMenu {...menu({ busy: true })} />);
  await vi.waitFor(() => {
    expect(document.activeElement).toBe(menuItem("Focus node"));
  });
});

it("dismisses an externally opened menu on an outside press without restoring graph focus", async () => {
  const props = menu();
  await render(<GraphContextMenu {...props} />);
  const input = document.createElement("input");
  host.append(input);
  act(() => {
    input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0 }));
  });
  expect(props.onClose).toHaveBeenCalledOnce();
  await render(<GraphContextMenu {...props} target={null} />);
  expect(props.onReturnFocus).not.toHaveBeenCalled();
});

it.each([
  {
    id: "r:3",
    expected: ["Hide from canvas", "Undo hide", "Fit graph to canvas", "Arrange graph"]
  },
  { id: null, expected: ["Undo hide", "Fit graph to canvas", "Arrange graph"] }
])("only offers applicable actions for context target $id", async ({ id, expected }) => {
  await render(<GraphContextMenu {...menu({ target: { id, x: 2, y: 3 }, canUndo: true })} />);
  expect([...document.querySelectorAll(MENU_ITEM)].map((item) => item.textContent)).toEqual(
    expected
  );
  expect(menuItem("Undo hide").getAttribute("aria-disabled")).not.toBe("true");
});

it("shows gesture guidance only for an interactive populated graph", async () => {
  await render(<GraphInteractionFeedback explorer={explorer()} />);
  expect(host.textContent).toContain(i18n.t("graph.gestureHint"));
  await render(<GraphInteractionFeedback explorer={explorer({ busy: true })} />);
  expect(host.querySelector(".graph-interaction-hint")).toBeNull();
  await render(<GraphInteractionFeedback explorer={explorer({ data: emptyGraph() })} />);
  expect(host.querySelector(".graph-interaction-hint")).toBeNull();
});

it("keeps found nodes visible and provides an explicit relationship retry rather than claiming an empty search", async () => {
  const state = explorer({ linksFailed: true });
  await render(<GraphInteractionFeedback explorer={state} />);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(i18n.t("graph.linksFailed"));
  expect(host.querySelector(".graph-interaction-hint")).toBeNull();
  act(() => {
    button("Retry relationships").click();
  });
  expect(state.retryLinks).toHaveBeenCalledOnce();
  await render(<GraphInteractionFeedback explorer={{ ...state, busy: true }} />);
  expect(button("Retry relationships").disabled).toBe(true);
});

it("keeps undo available in a hide notice for six seconds and expires stale feedback", async () => {
  vi.useFakeTimers();
  const state = explorer({ notice: { kind: "hidden", id: FIRST_NODE }, canUndoHide: true });
  await render(<GraphInteractionFeedback explorer={state} />);
  expect(host.querySelector(NOTICE_SELECTOR)?.textContent).toContain(i18n.t("graph.notice.hidden"));
  act(() => {
    button("Undo hide").click();
  });
  expect(state.undoHide).toHaveBeenCalledOnce();
  act(() => {
    vi.advanceTimersByTime(5999);
  });
  expect(host.querySelector(NOTICE_SELECTOR)).not.toBeNull();
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(host.querySelector(NOTICE_SELECTOR)).toBeNull();
});

it("replaces an older notice and cancels its timer instead of removing the newer operation feedback", async () => {
  vi.useFakeTimers();
  const state = explorer({ notice: { kind: "expanded", id: FIRST_NODE, count: 3 } });
  await render(<GraphInteractionFeedback explorer={state} />);
  expect(host.textContent).toContain(i18n.t("graph.notice.expanded", { count: 3 }));
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  await render(
    <GraphInteractionFeedback explorer={{ ...state, notice: { kind: "empty", id: SECOND_NODE } }} />
  );
  act(() => {
    vi.advanceTimersByTime(500);
  });
  expect(host.querySelector(NOTICE_SELECTOR)?.textContent).toBe(i18n.t("graph.notice.empty"));
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(host.querySelector(NOTICE_SELECTOR)).toBeNull();
});

function ActionsProbe({ state, disabled = false }: { state: Explorer; disabled?: boolean }) {
  const surface = useRef<HTMLDivElement | null>(null);
  const commands = useRef<GraphSceneHandle | null>(scene);
  actions = useCanvasActions(state, surface, commands, disabled);
  return (
    <div ref={surface} onKeyDown={actions.keyDown}>
      <svg className="graph-scene" tabIndex={0}>
        <g data-graph-id={FIRST_NODE} tabIndex={0} />
        <g data-graph-id={SECOND_NODE} tabIndex={0} />
      </svg>
      <input aria-label="Other input" />
    </div>
  );
}

it.each<[GraphMenuAction, string]>([
  ["expand", "expand"],
  ["collapse", "collapse"],
  ["hide", "hide"],
  ["focus", "focusNode"],
  ["pin", "togglePin"]
])(
  "routes %s to its context identity rather than an earlier selected object",
  async (command, name) => {
    const state = explorer();
    await render(<ActionsProbe state={state} />);
    act(() => {
      actions.openMenu({ id: SECOND_NODE, x: 4, y: 5 });
    });
    expect(state.select).toHaveBeenCalledWith(SECOND_NODE);
    act(() => {
      actions.action(command);
    });
    const effect =
      name === "focusNode" || name === "togglePin"
        ? scene[name]
        : state[name as "expand" | "collapse" | "hide"];
    expect(effect).toHaveBeenCalledWith(SECOND_NODE);
    expect(actions.menu).toBeNull();
  }
);

it.each<[GraphMenuAction, string]>([
  ["fit", "fit"],
  ["relayout", "relayout"],
  ["undo", "undoHide"]
])("keeps the background %s action independent of object selection", async (command, name) => {
  const state = explorer({ selected: null });
  await render(<ActionsProbe state={state} />);
  act(() => {
    actions.openMenu({ id: null, x: 4, y: 5 });
  });
  act(() => {
    actions.action(command);
  });
  const effect = name === "undoHide" ? state.undoHide : scene[name as "fit" | "relayout"];
  expect(effect).toHaveBeenCalledOnce();
});

it("does not open actions when the scene is empty or blocked", async () => {
  const state = explorer({ data: emptyGraph() });
  await render(<ActionsProbe state={state} />);
  act(() => {
    actions.openMenu({ id: null, x: 4, y: 5 });
  });
  expect(actions.menu).toBeNull();
  expect(state.select).not.toHaveBeenCalled();
  await render(<ActionsProbe state={explorer()} disabled />);
  act(() => {
    actions.openMenu({ id: FIRST_NODE, x: 4, y: 5 });
  });
  expect(actions.menu).toBeNull();
});

function key(target: Element, value: string, modifiers: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: value,
    bubbles: true,
    cancelable: true,
    ...modifiers
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it("limits hide and undo shortcuts to the graph and restores keyboard focus on close", async () => {
  const state = explorer({ canUndoHide: true });
  await render(<ActionsProbe state={state} />);
  const graph = host.querySelector("svg");
  const node = host.querySelector<SVGGElement>('[data-graph-id="n:1"]');
  const input = host.querySelector("input");
  if (graph === null || node === null || input === null) throw new Error("Missing action targets");
  expect(key(input, "Delete").defaultPrevented).toBe(false);
  expect(state.hide).not.toHaveBeenCalled();
  expect(key(node, "Delete").defaultPrevented).toBe(true);
  expect(state.hide).toHaveBeenCalledWith(FIRST_NODE);
  expect(document.activeElement).toBe(graph);
  expect(key(graph, "z", { metaKey: true }).defaultPrevented).toBe(true);
  expect(state.undoHide).toHaveBeenCalledOnce();
  expect(key(graph, "z", { metaKey: true, shiftKey: true }).defaultPrevented).toBe(false);
  expect(key(node, "Escape").defaultPrevented).toBe(true);
  expect(state.select).toHaveBeenCalledWith(null);
  expect(document.activeElement).toBe(node);
});

it("returns menu focus to its source unless the user has moved into an input", async () => {
  await render(<ActionsProbe state={explorer()} />);
  act(() => {
    actions.openMenu({ id: SECOND_NODE, x: 4, y: 5 });
  });
  const input = host.querySelector("input");
  const target = host.querySelector<SVGGElement>('[data-graph-id="n:2"]');
  if (input === null || target === null) throw new Error("Missing focus targets");
  act(() => {
    actions.returnMenuFocus();
  });
  expect(document.activeElement).toBe(target);
  input.focus();
  act(() => {
    actions.returnMenuFocus();
  });
  expect(document.activeElement).toBe(input);
});

it("preserves modified browser navigation and editing keys without hiding graph objects", async () => {
  const state = explorer({ canUndoHide: true });
  await render(<ActionsProbe state={state} />);
  const graph = host.querySelector("svg");
  if (graph === null) throw new Error("Missing graph shortcut target");
  for (const modifier of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }]) {
    for (const value of ["Backspace", "Delete"]) {
      expect(key(graph, value, modifier).defaultPrevented).toBe(false);
    }
  }
  expect(state.hide).not.toHaveBeenCalled();
  expect(key(graph, "z", { ctrlKey: true, altKey: true }).defaultPrevented).toBe(false);
  expect(state.undoHide).not.toHaveBeenCalled();
  expect(key(graph, "z", { ctrlKey: true }).defaultPrevented).toBe(true);
  expect(state.undoHide).toHaveBeenCalledOnce();
});
