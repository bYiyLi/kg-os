// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import { i18n, selectLocale } from "../i18n/index.js";
import { WorkspaceShell } from "./workspace-shell.js";

const SETTINGS_DIALOG = ".settings-dialog";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.clear();
  await selectLocale("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  localStorage.clear();
});

async function renderShell(authenticationRequired = false) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          <WorkspaceShell authenticationRequired={authenticationRequired} />
        </UiProvider>
      </TranslationProvider>
    );
    await Promise.resolve();
  });
}

function button(name: string, scope: ParentNode = document): HTMLButtonElement {
  const found = Array.from(scope.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) => element.getAttribute("aria-label") === name || element.textContent.trim() === name
  );
  if (found === undefined) throw new Error("Missing button: " + name);
  return found;
}

async function click(target: HTMLButtonElement) {
  await act(async () => {
    target.focus();
    target.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

it("keeps only Settings in the footer and applies real appearance and language preferences there", async () => {
  await renderShell();
  const footer = host.querySelector(".sidebar-bottom");
  expect(footer?.querySelectorAll("button")).toHaveLength(1);
  expect(footer?.textContent).toBe("Settings");
  expect(
    host.querySelector(".theme-toggle, .language-switcher, .connection-disconnect")
  ).toBeNull();

  await click(button("Settings", host));
  expect(document.querySelector(SETTINGS_DIALOG)).not.toBeNull();
  expect(document.querySelector(".settings-dialog .language-switcher")).not.toBeNull();
  await click(button("Dark"));
  expect(host.querySelector(".app-shell")?.getAttribute("data-theme")).toBe("dark");
  expect(localStorage.getItem("kgos.web.theme")).toBe("dark");
  await click(button("简体中文"));
  expect(i18n.resolvedLanguage).toBe("zh-CN");
  expect(localStorage.getItem("kgos.web.locale")).toBe("zh-CN");
  await click(button("关闭设置"));
  expect(document.querySelector(SETTINGS_DIALOG)).toBeNull();
  expect(footer?.textContent).toBe("设置");
});

it("closes settings on authentication loss and does not reopen it after reconnecting", async () => {
  await renderShell();
  await click(button("Settings", host));
  expect(document.querySelector(SETTINGS_DIALOG)).not.toBeNull();
  await renderShell(true);
  expect(document.querySelector(SETTINGS_DIALOG)).toBeNull();
  expect(host.querySelector(".sidebar-settings-button")).toBeNull();
  await renderShell();
  expect(document.querySelector(SETTINGS_DIALOG)).toBeNull();
  expect(button("Settings", host)).toBeDefined();
});

it("opens settings from the mobile drawer and restores focus to stable navigation after closing", async () => {
  await renderShell();
  const navigation = button("Version navigation", host);
  await click(navigation);
  const drawer = document.querySelector(".version-drawer");
  expect(drawer).not.toBeNull();
  expect(drawer?.querySelector(".drawer-bottom")?.querySelectorAll("button")).toHaveLength(1);
  if (drawer === null) throw new Error("Missing mobile navigation");
  await click(button("Settings", drawer));
  expect(document.querySelector(SETTINGS_DIALOG)).not.toBeNull();
  await click(button("Close settings"));
  expect(document.querySelector(SETTINGS_DIALOG)).toBeNull();
  expect(document.activeElement).toBe(navigation);
});
