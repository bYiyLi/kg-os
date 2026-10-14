// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "./app.js";
import { i18n } from "./i18n/index.js";

const TOKEN_INPUT = "#kgos-access-token";
const AUTH_DIALOG = ".authentication-dialog";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  localStorage.clear();
  await i18n.changeLanguage("en");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      let target: string;
      if (typeof input === "string") target = input;
      else if (input instanceof URL) target = input.href;
      else target = input.url;
      if (target.includes("/web/auth/session"))
        return Promise.resolve(new Response("{}", { status: 401 }));
      if (target.includes("/web/auth/logout"))
        return Promise.resolve(new Response(null, { status: 204 }));
      if (target.includes("/web/auth/login"))
        return Promise.resolve(
          new Response(
            JSON.stringify({
              accessToken: "kgws_" + "A".repeat(43),
              daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6"
            })
          )
        );
      return Promise.resolve(
        new Response(
          JSON.stringify(
            target.includes("/web/data/info")
              ? {
                  daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
                  storageStatus: "unsupported"
                }
              : { defaultBranch: "main", state: "commit-example" }
          ),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    })
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

async function renderApp() {
  await act(async () => {
    root.render(<App />);
    await Promise.resolve();
  });
}

function typeToken(value: string) {
  const input = host.querySelector<HTMLInputElement>(TOKEN_INPUT);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (input === null || descriptor?.set === undefined) {
    throw new Error("Missing token input");
  }
  act(() => {
    descriptor.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function renderConnectedApp() {
  await renderApp();
  typeToken("secret");
  await act(async () => {
    buttonByName("Connect").click();
    await Promise.resolve();
  });
  expect(host.querySelector(AUTH_DIALOG)).toBeNull();
}

function buttonByName(label: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (element) =>
      element.getAttribute("aria-label") === label || element.textContent.trim() === label
  );
  if (button === undefined) {
    throw new Error("Missing button: " + label);
  }
  return button;
}

function appShell() {
  return host.querySelector(".app-shell");
}

function currentTheme() {
  return appShell()?.getAttribute("data-theme");
}

function versionDialog() {
  const dialog = host.querySelector("dialog");
  if (dialog === null) {
    throw new Error("Missing version dialog");
  }
  return dialog;
}

function stubDialog(dialog: HTMLDialogElement) {
  const showModal = vi.fn(() => {
    dialog.open = true;
  });
  dialog.showModal = showModal;
  dialog.close = vi.fn(() => {
    dialog.open = false;
  });
  return showModal;
}

it("requires authentication before the static shell can be used", async () => {
  await renderApp();
  expect(host.querySelector<HTMLDialogElement>(AUTH_DIALOG)?.open).toBe(true);
  expect(host.querySelector(".app-shell.is-auth-required")).not.toBeNull();
  expect(host.querySelector(TOKEN_INPUT)?.getAttribute("type")).toBe("password");
  expect(host.querySelector(".sidebar-brand h1")?.textContent).toBe("KG OS");
  expect(host.querySelector('[aria-label="Version navigation"]')).not.toBeNull();
  expect(host.querySelectorAll(".version-sidebar .commit-item")).toHaveLength(4);
  expect(host.querySelectorAll(".version-sidebar .branch-list li")).toHaveLength(3);
  expect(host.textContent).toContain("Design preview · No live data");
  expect(host.querySelector('[aria-label="Graph canvas"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Welcome");
  expect(host.textContent).not.toContain("Workspace ·");
  expect(host.textContent).not.toContain("Connected");
  expect(host.querySelector("input")).not.toBeNull();
  expect(host.querySelector(".global-header")).toBeNull();
  expect(host.querySelector(".workspace-controls")).toBeNull();
  expect(host.querySelector(".version-sidebar .theme-toggle")).not.toBeNull();
  expect(host.querySelectorAll(".version-sidebar .theme-option")).toHaveLength(2);
  expect(host.querySelector(".sidebar-handle")).not.toBeNull();
  expect(host.querySelector(".sidebar-collapse-button")).toBeNull();
  expect(host.querySelector(".canvas-stage .mobile-versions-button")).not.toBeNull();
  expect(host.querySelectorAll(".canvas-toolbar button:disabled")).toHaveLength(5);
});

it("toggles between dark and light themes without external requests", async () => {
  await renderConnectedApp();
  expect(currentTheme()).toBe("dark");
  expect(buttonByName("Dark theme").getAttribute("aria-pressed")).toBe("true");
  expect(buttonByName("Light theme").getAttribute("aria-pressed")).toBe("false");
  act(() => {
    buttonByName("Dark theme").click();
  });
  expect(currentTheme()).toBe("dark");
  act(() => {
    buttonByName("Light theme").click();
  });
  expect(currentTheme()).toBe("light");
  expect(buttonByName("Light theme").getAttribute("aria-pressed")).toBe("true");
  act(() => {
    buttonByName("Light theme").click();
  });
  expect(currentTheme()).toBe("light");
  act(() => {
    buttonByName("Dark theme").click();
  });
  expect(currentTheme()).toBe("dark");
});

it("fully hides and restores the version sidebar from the canvas-border handle", async () => {
  await renderConnectedApp();
  const sidebar = host.querySelector(".version-sidebar");
  expect(sidebar?.hasAttribute("inert")).toBe(false);
  expect(buttonByName("Collapse sidebar").getAttribute("aria-expanded")).toBe("true");
  act(() => {
    buttonByName("Collapse sidebar").click();
  });
  expect(appShell()?.classList.contains("is-sidebar-collapsed")).toBe(true);
  expect(sidebar?.getAttribute("aria-hidden")).toBe("true");
  expect(sidebar?.hasAttribute("inert")).toBe(true);
  expect(buttonByName("Expand sidebar").getAttribute("aria-expanded")).toBe("false");
  act(() => {
    buttonByName("Expand sidebar").click();
  });
  expect(appShell()?.classList.contains("is-sidebar-collapsed")).toBe(false);
  expect(sidebar?.hasAttribute("inert")).toBe(false);
  expect(host.querySelector(".version-sidebar .commit-list")).not.toBeNull();
  expect(currentTheme()).toBe("dark");
});

it("resizes the sidebar by keyboard while keeping the canvas in place", async () => {
  await renderConnectedApp();
  const handle = buttonByName("Collapse sidebar");
  expect(appShell()?.getAttribute("style")).toContain("--sidebar-width: 240px");
  act(() => {
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
  });
  expect(appShell()?.getAttribute("style")).toContain("--sidebar-width: 256px");
  act(() => {
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
  });
  expect(appShell()?.getAttribute("style")).toContain("--sidebar-width: 240px");
  expect(appShell()?.classList.contains("is-sidebar-collapsed")).toBe(false);
});

it("opens a mobile version drawer and closes using the close control", async () => {
  await renderConnectedApp();
  const dialog = versionDialog();
  const showModal = stubDialog(dialog);
  act(() => {
    buttonByName("Version navigation").click();
    buttonByName("Version navigation").click();
  });
  expect(showModal).toHaveBeenCalledTimes(1);
  expect(dialog.open).toBe(true);
  expect(dialog.querySelectorAll(".commit-item")).toHaveLength(4);
  expect(dialog.querySelectorAll(".theme-option")).toHaveLength(2);
  act(() => {
    buttonByName("Close version navigation").click();
  });
  expect(dialog.open).toBe(false);
});

it("closes the drawer only on backdrop clicks, not internal clicks", async () => {
  await renderConnectedApp();
  const dialog = versionDialog();
  stubDialog(dialog);
  dialog.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 320,
    bottom: 720,
    width: 320,
    height: 720,
    toJSON: () => ({})
  });
  act(() => {
    buttonByName("Version navigation").click();
    dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 140, clientY: 240 }));
  });
  expect(dialog.open).toBe(true);
  for (const [x, y] of [
    [-5, 240],
    [330, 240],
    [140, -5],
    [140, 740]
  ] as const) {
    act(() => {
      dialog.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
    });
    expect(dialog.open).toBe(false);
    act(() => {
      buttonByName("Version navigation").click();
    });
    expect(dialog.open).toBe(true);
  }
});

it("switches language without losing authentication input or the connected workspace", async () => {
  await renderApp();
  typeToken("kept-token");
  const token = host.querySelector<HTMLInputElement>(TOKEN_INPUT);
  const language = host.querySelector(".authentication-dialog .language-switcher");
  expect(language).not.toBeNull();
  await act(async () => {
    language?.querySelector<HTMLButtonElement>('[lang="zh-CN"]')?.click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("需要身份认证");
  expect(token?.value).toBe("kept-token");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(localStorage.getItem("kgos.web.locale")).toBe("zh-CN");
  expect(vi.mocked(fetch)).toHaveBeenCalledOnce();

  await act(async () => {
    language?.querySelector<HTMLButtonElement>('[lang="en"]')?.click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("Authentication Required");
  expect(token?.value).toBe("kept-token");

  await act(async () => {
    buttonByName("Connect").click();
    await Promise.resolve();
  });
  expect(host.querySelector(AUTH_DIALOG)).toBeNull();
  const connectedLanguage = host.querySelector(".version-sidebar .language-switcher");
  await act(async () => {
    connectedLanguage?.querySelector<HTMLButtonElement>('[lang="zh-CN"]')?.click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("设计示例 · 未连接数据");
  expect(host.textContent).toContain("2小时前");
  expect(host.textContent).toContain("领先 3 个提交");
  expect(currentTheme()).toBe("dark");
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(4);
});

it("invalidates an established connection after a boot change and requires explicit reconnect", async () => {
  await renderConnectedApp();
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ code: "WEB_CONNECTION_CHANGED", message: "web connection changed" }),
      {
        status: 409
      }
    )
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
  expect(host.querySelector<HTMLDialogElement>(AUTH_DIALOG)?.open).toBe(true);
  expect(host.textContent).toContain("The KG OS service has changed");
  expect(appShell()?.classList.contains("is-auth-required")).toBe(true);
  typeToken("secret");
  await act(async () => {
    buttonByName("Connect").click();
    await Promise.resolve();
  });
  expect(host.querySelector(AUTH_DIALOG)).toBeNull();
});

it("requires a new token after a connected API returns 401", async () => {
  await renderConnectedApp();
  vi.mocked(globalThis.fetch).mockResolvedValueOnce(
    new Response(
      JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" }),
      {
        status: 401
      }
    )
  );
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
  expect(host.querySelector<HTMLDialogElement>(AUTH_DIALOG)?.open).toBe(true);
  expect(host.textContent).toContain("Your access token is no longer valid");
  expect(host.querySelector<HTMLInputElement>(TOKEN_INPUT)?.value).toBe("");
});

it("disconnects explicitly and discards the established client", async () => {
  await renderConnectedApp();
  await act(async () => {
    buttonByName("Disconnect").click();
    await Promise.resolve();
  });
  expect(host.querySelector<HTMLDialogElement>(AUTH_DIALOG)?.open).toBe(true);
  expect(host.textContent).not.toContain("service has changed");
  expect(host.querySelector<HTMLInputElement>(TOKEN_INPUT)?.value).toBe("");
});
