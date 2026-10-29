// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n, TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { GraphSearchBox } from "./graph-search-box.js";

let host: HTMLDivElement;
let root: Root;
const onSearch = vi.fn<(query: string) => void>();
const onClear = vi.fn<() => void>();

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSearch.mockClear();
  onClear.mockClear();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  document.body.replaceChildren();
});

function render(disabled = false, busy = false) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <GraphSearchBox disabled={disabled} busy={busy} onSearch={onSearch} onClear={onClear} />
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

function setQuery(value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Missing input value setter");
  act(() => {
    descriptor.set?.call(field(), value);
    field().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submit() {
  const form = host.querySelector("form");
  if (form === null) throw new Error("Missing graph search form");
  act(() => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

function shortcut(target: EventTarget = window, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "k",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    ...options
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

it.each([{ ctrlKey: true }, { ctrlKey: false, metaKey: true }])(
  "focuses graph search using the supported shortcut %j",
  (modifier) => {
    render();
    const event = shortcut(window, modifier);
    expect(document.activeElement).toBe(field());
    expect(event.defaultPrevented).toBe(true);
    expect(onSearch).not.toHaveBeenCalled();
  }
);

it.each(["input", "textarea", "editable"])(
  "does not steal the shortcut while editing another %s",
  (kind) => {
    render();
    const other = document.createElement(kind === "editable" ? "div" : kind);
    other.tabIndex = 0;
    other.setAttribute("contenteditable", String(kind === "editable"));
    document.body.append(other);
    other.focus();
    const event = shortcut(other);
    expect(document.activeElement).toBe(other);
    expect(event.defaultPrevented).toBe(false);
  }
);

it.each(["dialog", "alertdialog"])(
  "keeps focus in an open %s instead of searching behind it",
  (role) => {
    render();
    const modal = document.createElement("div");
    modal.setAttribute("role", role);
    const button = document.createElement("button");
    modal.append(button);
    document.body.append(modal);
    button.focus();
    const event = shortcut(button);
    expect(document.activeElement).toBe(button);
    expect(event.defaultPrevented).toBe(false);
  }
);

it("does not consume the shortcut or focus an inert background workspace", () => {
  render();
  host.setAttribute("inert", "");
  const outside = document.createElement("button");
  document.body.append(outside);
  outside.focus();
  const event = shortcut(outside);
  expect(document.activeElement).toBe(outside);
  expect(event.defaultPrevented).toBe(false);
});

it("submits the actual query after composition ends and never searches composing input", () => {
  render();
  setQuery("知识 图谱");
  act(() => {
    field().dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    field().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, isComposing: true })
    );
  });
  submit();
  expect(onSearch).not.toHaveBeenCalled();
  act(() => {
    field().dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    field().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  });
  submit();
  expect(onSearch).toHaveBeenCalledExactlyOnceWith("知识 图谱");
});

it("clears the visible query through its callback and keeps search focused", () => {
  render();
  setQuery("KG OS");
  const clear = host.querySelector<HTMLButtonElement>(
    '[aria-label="' + i18n.t("graph.clearSearch") + '"]'
  );
  if (clear === null) throw new Error("Missing clear search button");
  act(() => {
    clear.click();
  });
  expect(onClear).toHaveBeenCalledOnce();
  expect(field().value).toBe("");
  expect(document.activeElement).toBe(field());
  expect(onSearch).not.toHaveBeenCalled();
});

it("offers cancellation during a pending search and returns focus to the input", () => {
  render(false, true);
  const cancel = host.querySelector<HTMLButtonElement>(
    '[aria-label="' + i18n.t("graph.cancelSearch") + '"]'
  );
  if (cancel === null) throw new Error("Missing cancel search button");
  act(() => {
    cancel.click();
  });
  expect(onClear).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(field());
  expect(onSearch).not.toHaveBeenCalled();
});

it("uses Escape to clear a query, then releases focus when the input is already empty", () => {
  render();
  setQuery("KG OS");
  act(() => {
    field().focus();
  });
  shortcut(field(), { key: "Escape", ctrlKey: false });
  expect(field().value).toBe("");
  expect(onClear).toHaveBeenCalledOnce();
  expect(document.activeElement).toBe(field());
  shortcut(field(), { key: "Escape", ctrlKey: false });
  expect(document.activeElement).not.toBe(field());
  expect(onClear).toHaveBeenCalledOnce();
});

it("updates translated labels without losing the entered query", async () => {
  render();
  setQuery("保留的查询");
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  expect(field().placeholder).toBe("搜索知识…");
  expect(field().getAttribute("aria-label")).toBe(i18n.t("graph.search"));
  expect(field().value).toBe("保留的查询");
  submit();
  expect(onSearch).toHaveBeenCalledExactlyOnceWith("保留的查询");
});

it("does not search or consume the shortcut after the workspace is disabled", () => {
  render();
  setQuery("KG OS");
  render(true);
  submit();
  const event = shortcut();
  expect(field().disabled).toBe(true);
  expect(event.defaultPrevented).toBe(false);
  expect(onSearch).not.toHaveBeenCalled();
});
