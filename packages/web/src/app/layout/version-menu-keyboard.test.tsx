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
  namedRow,
  worldButton
} from "../../../test/version-browser-fixture.js";

const RELATIONSHIPS = "View version relationships";
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
  return { reader, relations: findButton(RELATIONSHIPS), across: findButton(ACROSS_WORLDS) };
}

function key(element: HTMLElement, value: string) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true });
  act(() => {
    element.focus();
    element.dispatchEvent(event);
  });
  return event;
}

it("moves between the actual world actions with arrows and wraps without opening a version", async () => {
  const { reader, relations, across } = await renderMenu();
  expect(key(relations, "ArrowDown").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(across);
  key(across, "ArrowDown");
  expect(document.activeElement).toBe(relations);
  key(relations, "ArrowUp");
  expect(document.activeElement).toBe(across);
  key(across, "ArrowUp");
  expect(document.activeElement).toBe(relations);
  expect(worldButton("main").getAttribute("aria-current")).toBe("page");
  expect(namedRow("Merge experiment").getAttribute("aria-pressed")).toBe("true");
  expect(reader.get).not.toHaveBeenCalled();
  expect(document.body.querySelector(".version-dag-dialog")).toBeNull();
});

it("uses Home and End to focus the first and last world action", async () => {
  const { reader, relations, across } = await renderMenu();
  expect(key(relations, "End").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(across);
  expect(key(across, "Home").defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(relations);
  expect(reader.get).not.toHaveBeenCalled();
  expect(findButton(WORLD_ACTIONS).getAttribute("aria-expanded")).toBe("true");
});

it("skips the unavailable relationship action after the expanded world is collapsed", async () => {
  const { reader } = await renderMenu();
  click(WORLD_ACTIONS);
  act(() => {
    worldButton("main").click();
  });
  click(WORLD_ACTIONS);
  const relations = findButton(RELATIONSHIPS);
  const across = findButton(ACROSS_WORLDS);
  expect(relations).toHaveProperty("disabled", true);
  for (const value of ["ArrowDown", "ArrowUp", "Home", "End"]) {
    expect(key(across, value).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(across);
  }
  expect(worldButton("main").getAttribute("aria-expanded")).toBe("false");
  expect(reader.get).not.toHaveBeenCalled();
});

it("leaves ordinary keys alone and closes on Escape with focus returned to the action trigger", async () => {
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
