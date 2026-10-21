// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { App } from "./app.js";
import { i18n, selectLocale } from "./i18n/index.js";

const TOKEN_INPUT = "#kgos-access-token";
const AUTH_DIALOG = ".authentication-dialog";
const MAIN_STATE = "a81c2f".padEnd(64, "0");

function mockEvolutionResponse(target: string): object {
  if (target.includes("/evolution/branch/list")) {
    return { items: [{ name: "main", state: MAIN_STATE }] };
  }
  if (target.includes("/evolution/tag/list")) return { items: [] };
  if (target.includes("/evolution/ancestry")) {
    return {
      root: MAIN_STATE,
      items: [
        {
          state: MAIN_STATE,
          parents: [],
          message: "Update knowledge model",
          committedAt: (Date.now() - 2 * 3600000) * 1000
        }
      ]
    };
  }
  if (target.includes("/evolution/get")) {
    return {
      state: MAIN_STATE,
      parents: [],
      committedAt: Date.now() * 1000,
      consistency: { status: "valid", issues: [] },
      hasData: false,
      data: null
    };
  }
  return { defaultBranch: "main", state: MAIN_STATE };
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  await selectLocale("system");
  localStorage.clear();
  await i18n.changeLanguage("en");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation((input) => {
      let target: string;
      if (typeof input === "string") target = input;
      else if (input instanceof URL) target = input.href;
      else target = input.url;
      if (target.includes("/api/v1/setup/status"))
        return Promise.resolve(
          new Response(JSON.stringify({ state: "ready", credentialConfigured: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
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
              : mockEvolutionResponse(target)
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
  const input = document.body.querySelector<HTMLInputElement>(TOKEN_INPUT);
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
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
}

function buttonByName(label: string) {
  const button = Array.from(document.body.querySelectorAll("button")).find(
    (element) =>
      element.getAttribute("aria-label") === label || element.textContent.trim() === label
  );
  if (button === undefined) {
    throw new Error("Missing button: " + label);
  }
  return button;
}

function appShell() {
  return document.body.querySelector(".app-shell");
}

function currentTheme() {
  return appShell()?.getAttribute("data-theme");
}

function versionDialog() {
  const dialog = document.body.querySelector<HTMLElement>(".version-drawer");
  if (dialog === null) {
    throw new Error("Missing version dialog");
  }
  return dialog;
}

it("requires authentication before the static shell can be used", async () => {
  await renderApp();
  expect(document.body.querySelector<HTMLElement>(AUTH_DIALOG)?.hasAttribute("data-open")).toBe(
    true
  );
  expect(document.body.querySelector(".app-shell.is-auth-required")).not.toBeNull();
  expect(document.body.querySelector(TOKEN_INPUT)?.getAttribute("type")).toBe("password");
  expect(document.body.querySelector(".sidebar-brand h1")?.textContent).toBe("KG OS");
  expect(document.body.querySelector('[aria-label="Version navigation"]')).not.toBeNull();
  expect(document.body.querySelectorAll(".version-sidebar .commit-item")).toHaveLength(0);
  expect(
    document.body.querySelector(".version-sidebar .version-branch-trigger")?.textContent
  ).toContain("All branches");
  expect(document.body.querySelector(".version-tree-heading")).toBeNull();
  expect(document.body.querySelector('[aria-label="Graph canvas"]')).not.toBeNull();
  expect(document.body.textContent).not.toContain("Welcome");
  expect(document.body.textContent).not.toContain("Workspace ·");
  expect(document.body.textContent).not.toContain("Connected");
  expect(document.body.querySelector("input")).not.toBeNull();
  expect(document.body.querySelector(".global-header")).toBeNull();
  expect(document.body.querySelector(".workspace-controls")).toBeNull();
  expect(document.body.querySelector(".version-sidebar .theme-toggle")).not.toBeNull();
  expect(document.body.querySelectorAll(".version-sidebar .theme-option")).toHaveLength(3);
  expect(document.body.querySelector(".sidebar-handle")).not.toBeNull();
  expect(document.body.querySelector(".sidebar-collapse-button")).toBeNull();
  expect(document.body.querySelector(".canvas-stage .mobile-versions-button")).not.toBeNull();
  expect(document.body.querySelector(".mobile-versions-button")?.textContent).toBe("");
  expect(document.body.querySelector(".mobile-versions-button")?.getAttribute("aria-label")).toBe(
    i18n.t("versions.navigation")
  );
  expect(document.body.querySelectorAll(".mobile-versions-button svg")).toHaveLength(1);
  expect(document.body.querySelectorAll(".canvas-toolbar button:disabled")).toHaveLength(5);
});

it("supports automatic and manually selected themes without external requests", async () => {
  await renderConnectedApp();
  expect(currentTheme()).toBe("dark");
  expect(buttonByName("Follow system theme").getAttribute("aria-pressed")).toBe("true");
  expect(buttonByName("Dark theme").getAttribute("aria-pressed")).toBe("false");
  act(() => {
    buttonByName("Dark theme").click();
  });
  expect(currentTheme()).toBe("dark");
  act(() => {
    buttonByName("Light theme").click();
  });
  expect(currentTheme()).toBe("light");
  expect(localStorage.getItem("kgos.web.theme")).toBe("light");
  expect(buttonByName("Light theme").getAttribute("aria-pressed")).toBe("true");
  act(() => {
    buttonByName("Light theme").click();
  });
  expect(currentTheme()).toBe("light");
  act(() => {
    buttonByName("Dark theme").click();
  });
  expect(currentTheme()).toBe("dark");
  expect(localStorage.getItem("kgos.web.theme")).toBe("dark");
  act(() => {
    buttonByName("Follow system theme").click();
  });
  expect(currentTheme()).toBe("dark");
  expect(localStorage.getItem("kgos.web.theme")).toBeNull();
  expect(buttonByName("Follow system theme").getAttribute("aria-pressed")).toBe("true");
});

it("fully hides and restores the version sidebar from the canvas-border handle", async () => {
  await renderConnectedApp();
  const sidebar = document.body.querySelector(".version-sidebar");
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
  expect(document.body.querySelector(".version-sidebar .commit-list")).not.toBeNull();
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
  await act(async () => {
    buttonByName("Version navigation").click();
    await Promise.resolve();
  });
  const dialog = versionDialog();
  expect(dialog.getAttribute("role")).toBe("dialog");
  expect(dialog.hasAttribute("data-open")).toBe(true);
  expect(dialog.querySelectorAll(".commit-item")).toHaveLength(1);
  expect(dialog.querySelectorAll(".theme-option")).toHaveLength(3);
  await act(async () => {
    buttonByName("Close version navigation").click();
    await Promise.resolve();
  });
  expect(document.querySelector(".version-drawer[data-open]")).toBeNull();
});

it("keeps the drawer open on internal clicks and closes on Escape", async () => {
  await renderConnectedApp();
  await act(async () => {
    buttonByName("Version navigation").click();
    await Promise.resolve();
  });
  const dialog = versionDialog();
  await act(async () => {
    dialog.click();
    await Promise.resolve();
  });
  expect(dialog.hasAttribute("data-open")).toBe(true);
  await act(async () => {
    dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await Promise.resolve();
  });
  expect(document.querySelector(".version-drawer[data-open]")).toBeNull();
});

it("switches language without losing authentication input or the connected workspace", async () => {
  await renderApp();
  typeToken("kept-token");
  const token = document.body.querySelector<HTMLInputElement>(TOKEN_INPUT);
  const language = document.body.querySelector(".authentication-dialog .language-switcher");
  expect(language).not.toBeNull();
  await act(async () => {
    language?.querySelector<HTMLButtonElement>('[lang="zh-CN"]')?.click();
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("需要身份认证");
  expect(token?.value).toBe("kept-token");
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(localStorage.getItem("kgos.web.locale")).toBe("zh-CN");
  expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);

  await act(async () => {
    language?.querySelector<HTMLButtonElement>('[lang="en"]')?.click();
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("Authentication Required");
  expect(token?.value).toBe("kept-token");

  await act(async () => {
    buttonByName("Connect").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
  const connectedLanguage = document.body.querySelector(".version-sidebar .language-switcher");
  await act(async () => {
    connectedLanguage?.querySelector<HTMLButtonElement>('[lang="zh-CN"]')?.click();
    await Promise.resolve();
  });
  expect(document.body.textContent).not.toContain("模拟数据");
  expect(document.body.textContent).toContain("2小时前");
  expect(document.body.textContent).toContain("全部分支");
  expect(currentTheme()).toBe("dark");
  expect(
    vi.mocked(fetch).mock.calls.some(([url]) => {
      const address = url instanceof Request ? url.url : String(url);
      return address.includes("/evolution/ancestry");
    })
  ).toBe(true);
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
  expect(document.body.querySelector<HTMLElement>(AUTH_DIALOG)?.hasAttribute("data-open")).toBe(
    true
  );
  expect(document.body.textContent).toContain("The KG OS service has changed");
  expect(appShell()?.classList.contains("is-auth-required")).toBe(true);
  typeToken("secret");
  await act(async () => {
    buttonByName("Connect").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
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
  expect(document.body.querySelector<HTMLElement>(AUTH_DIALOG)?.hasAttribute("data-open")).toBe(
    true
  );
  expect(document.body.textContent).toContain("Your access token is no longer valid");
  expect(document.body.querySelector<HTMLInputElement>(TOKEN_INPUT)?.value).toBe("");
});

it("disconnects explicitly and discards the established client", async () => {
  await renderConnectedApp();
  await act(async () => {
    buttonByName("Disconnect").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector<HTMLElement>(AUTH_DIALOG)?.hasAttribute("data-open")).toBe(
    true
  );
  expect(document.body.textContent).not.toContain("service has changed");
  expect(document.body.querySelector<HTMLInputElement>(TOKEN_INPUT)?.value).toBe("");
});

it("checks first-run status before opening the regular authentication dialog", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(
          new Response(JSON.stringify({ state: "setup_required", credentialConfigured: false }))
        )
      )
  );
  await renderApp();
  expect(window.location.pathname).toBe("/setup");
  expect(document.body.querySelector(".setup-page")).not.toBeNull();
  expect(document.body.querySelector(".setup-welcome h1")?.textContent).toBe("Welcome to KG OS");
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
  expect(document.body.querySelector(".app-shell")).toBeNull();
  window.history.replaceState(null, "", "/");
});

it("does not re-claim an administrator Token for an existing damaged Instance", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            state: "error",
            credentialConfigured: false,
            message: "Database requires operator repair"
          })
        )
      )
    )
  );
  await renderApp();
  expect(document.body.querySelector(".setup-unavailable")?.textContent).toContain(
    "Database requires operator repair"
  );
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
  expect(document.body.querySelector(".setup-footer")).toBeNull();
  window.history.replaceState(null, "", "/");
});

it("shows a status failure instead of interpreting an offline daemon as invalid credentials", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
  await renderApp();
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "Cannot check KG OS initialization status"
  );
  expect(document.body.querySelector(AUTH_DIALOG)).toBeNull();
  expect(document.body.querySelector(".setup-page")).toBeNull();
});
