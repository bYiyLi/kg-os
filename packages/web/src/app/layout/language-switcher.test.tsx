// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { getLocalePreference, LOCALE_STORAGE_KEY, selectLocale } from "../i18n/index.js";
import { LanguageSwitcher } from "./language-switcher.js";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(async () => {
  if (root !== undefined) {
    act(() => root?.unmount());
  }
  container?.remove();
  root = undefined;
  container = undefined;
  vi.restoreAllMocks();
  await selectLocale("system");
  localStorage.clear();
});

it("does not reapply the selected language but updates on a different selection", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await selectLocale("en");
  const writes = vi.spyOn(Storage.prototype, "setItem");
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => {
    root?.render(<LanguageSwitcher />);
  });
  const english = container.querySelector<HTMLButtonElement>('button[lang="en"]');
  const chinese = container.querySelector<HTMLButtonElement>('button[lang="zh-CN"]');
  expect(english).not.toBeNull();
  expect(chinese).not.toBeNull();

  act(() => {
    english?.click();
  });
  expect(getLocalePreference()).toBe("en");
  expect(writes).not.toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "en");

  act(() => {
    chinese?.click();
  });
  expect(getLocalePreference()).toBe("zh-CN");
  await vi.waitFor(() => {
    expect(writes).toHaveBeenCalledWith(LOCALE_STORAGE_KEY, "zh-CN");
  });
});
