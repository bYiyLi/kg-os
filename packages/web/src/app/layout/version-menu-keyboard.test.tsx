// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { i18n } from "../i18n/index.js";
import {
  WORLD_ACTIONS,
  VersionBrowserHarness,
  click,
  findButton,
  flush,
  mockReader,
  worldButton,
  worldToggle
} from "../../../test/version-browser-fixture.js";

const ACROSS_WORLDS = "View history across worlds";
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
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

async function renderMenu() {
  const reader = mockReader();
  await act(async () => {
    root.render(<VersionBrowserHarness reader={reader} />);
    await Promise.resolve();
  });
  click(WORLD_ACTIONS);
  await flush();
  return { reader, across: findButton(ACROSS_WORLDS) };
}

function key(element: HTMLElement, value: string) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  act(() => {
    element.focus();
    element.dispatchEvent(event);
  });
  return event;
}

it("keeps keyboard navigation within the remaining advanced history action", async () => {
  const { reader, across } = await renderMenu();
  expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
  for (const value of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    expect(key(across, value).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(across);
  }
  expect(worldButton("main").getAttribute("aria-current")).toBe("page");
  expect(reader.get).not.toHaveBeenCalled();
  expect(reader.ancestry).not.toHaveBeenCalled();
  expect(document.body.querySelector(".version-dag-dialog")).toBeNull();
});

it("keeps per-branch history available independently of a collapsed domain tree", async () => {
  const { reader } = await renderMenu();
  click(WORLD_ACTIONS);
  click("Expand knowledge world: main");
  expect(worldToggle("main").getAttribute("aria-expanded")).toBe("false");
  click("View history: main");
  await flush();
  expect(document.body.querySelector(".version-dag-world")?.textContent).toBe("main");
  expect(reader.get).not.toHaveBeenCalled();
  expect(reader.ancestry).toHaveBeenCalledOnce();
});

it("leaves ordinary keys alone and closes Escape back to the menu trigger", async () => {
  const { reader, across } = await renderMenu();
  expect(key(across, "x").defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(across);
  key(across, "Escape");
  await flush();
  expect(document.body.querySelector('[role="menu"]')).toBeNull();
  expect(findButton(WORLD_ACTIONS).getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(findButton(WORLD_ACTIONS));
  expect(reader.get).not.toHaveBeenCalled();
});
