// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import type { Connection } from "../../core/client/connect.js";
import { AuthenticationDialog } from "./authentication-dialog.js";

let host: HTMLDivElement;
let root: Root | null;

const bootID = "e48245ac-51a4-4b6b-93ba-07bb4d0626a6";
const ERROR_MESSAGE = "[role='alert']";
const webAccess = "kgws_" + "A".repeat(43);
function loginResponse() {
  return new Response(JSON.stringify({ accessToken: webAccess, daemonBootId: bootID }));
}

function infoResponse() {
  return new Response(JSON.stringify({ daemonBootId: bootID, storageStatus: "unsupported" }));
}

function mockResponses(...responses: Response[]) {
  const queue = [...responses];
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => {
    const response = queue.shift();
    if (response === undefined) throw new Error("Unexpected Web API request");
    return Promise.resolve(response);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  if (root !== null) {
    act(() => {
      root?.unmount();
    });
  }
  host.remove();
  vi.unstubAllGlobals();
});

function renderDialog(onAuthenticated: (connection: Connection) => void = vi.fn()) {
  act(() => {
    root?.render(
      <TranslationProvider>
        <AuthenticationDialog onAuthenticated={onAuthenticated} />
      </TranslationProvider>
    );
  });
}

function tokenInput(): HTMLInputElement {
  const input = host.querySelector<HTMLInputElement>("#kgos-access-token");
  if (input === null) {
    throw new Error("Missing token input");
  }
  return input;
}

function setToken(value: string) {
  const input = tokenInput();
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) {
    throw new Error("Cannot set token input");
  }
  act(() => {
    descriptor.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function findButton(label: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) =>
      element.getAttribute("aria-label") === label || element.textContent.trim() === label
  );
  if (button === undefined) {
    throw new Error("Missing button " + label);
  }
  return button;
}

async function submit() {
  await act(async () => {
    findButton("Connect").click();
    await Promise.resolve();
  });
}

it("opens a mandatory native dialog with masked token, visibility toggle, and help", () => {
  renderDialog();
  const dialog = host.querySelector<HTMLDialogElement>(".authentication-dialog");
  expect(dialog?.open).toBe(true);
  expect(host.textContent).toContain("Authentication Required");
  expect(tokenInput().type).toBe("password");
  expect(findButton("Connect").disabled).toBe(true);
  expect(host.textContent).toContain("<workspace>/.kgos/auth.json");
  expect(host.querySelector(".authentication-dialog button[aria-label='Close']")).toBeNull();

  const cancel = new Event("cancel", { bubbles: true, cancelable: true });
  act(() => {
    dialog?.dispatchEvent(cancel);
  });
  expect(cancel.defaultPrevented).toBe(true);
  expect(dialog?.open).toBe(true);
  act(() => {
    findButton("Show access token").click();
  });
  expect(tokenInput().type).toBe("text");
  act(() => {
    findButton("Hide access token").click();
  });
  expect(tokenInput().type).toBe("password");
});

it("only authenticates after a real SDK Bearer request succeeds", async () => {
  const fetcher = mockResponses(
    loginResponse(),
    infoResponse(),
    new Response(JSON.stringify({ defaultBranch: "main", state: "commit/a" }), { status: 200 })
  );
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("  correct-token  ");
  await submit();
  expect(authenticated).toHaveBeenCalledOnce();
  expect(authenticated.mock.calls[0]?.[0]).toMatchObject({
    defaultBranch: "main",
    state: "commit/a"
  });
  expect(fetcher.mock.calls[0]?.[0]).toBe(window.location.origin + "/api/v1/web/auth/login");
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    headers: { Authorization: "Bearer correct-token" },
    method: "POST"
  });
  expect(fetcher.mock.calls[1]?.[0]).toBe(window.location.origin + "/api/v1/web/data/info");
  expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("X-KGOS-Expected-Daemon-Boot")).toBe(
    bootID
  );
  expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("Authorization")).toBe(
    "Bearer " + webAccess
  );
  expect(fetcher.mock.calls[2]?.[0]).toBe(window.location.origin + "/api/v1/evolution/overview");
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

it("stays locked on a wrong token, clears it, and permits a valid retry", async () => {
  mockResponses(
    new Response(
      JSON.stringify({ code: "AUTHENTICATION_FAILED", message: "authentication failed" }),
      {
        status: 401
      }
    ),
    loginResponse(),
    infoResponse(),
    new Response(JSON.stringify({ defaultBranch: "main", state: "commit/ok" }))
  );
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("bad-token");
  await submit();
  expect(authenticated).not.toHaveBeenCalled();
  expect(tokenInput().value).toBe("");
  expect(host.querySelector(ERROR_MESSAGE)?.textContent).toContain("Invalid access token");
  expect(findButton("Connect").disabled).toBe(true);
  setToken("good-token");
  expect(host.querySelector(ERROR_MESSAGE)).toBeNull();
  await submit();
  expect(authenticated).toHaveBeenCalledOnce();
});

it("reports transport errors without discarding the user's input", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new TypeError("offline")));
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("user-token");
  await submit();
  expect(authenticated).not.toHaveBeenCalled();
  expect(host.querySelector(ERROR_MESSAGE)?.textContent).toContain("Cannot reach");
  expect(tokenInput().value).toBe("user-token");
  expect(findButton("Connect").disabled).toBe(false);
});

it("rejects invalid successful responses instead of unlocking the workspace", async () => {
  mockResponses(loginResponse(), infoResponse(), new Response(JSON.stringify({})));
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("user-token");
  await submit();
  expect(authenticated).not.toHaveBeenCalled();
  expect(host.querySelector(ERROR_MESSAGE)?.textContent).toContain("Unable to connect");
  expect(tokenInput().value).toBe("user-token");
});

it("cancels an in-flight request and cannot unlock after the dialog is unmounted", async () => {
  let signal: AbortSignal | null | undefined;
  const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
    signal = init?.signal;
    return new Promise<Response>(() => undefined);
  });
  vi.stubGlobal("fetch", fetcher);
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("pending-token");
  await act(async () => {
    findButton("Connect").click();
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(host.textContent).toContain("Connecting...");
  expect(findButton("Connecting...").disabled).toBe(true);
  act(() => {
    root?.unmount();
  });
  root = null;
  expect(signal?.aborted).toBe(true);
  expect(authenticated).not.toHaveBeenCalled();
});

it("rejects an empty programmatic submit even though its button is disabled", async () => {
  renderDialog();
  const form = host.querySelector(".authentication-form");
  expect(form).not.toBeNull();
  await act(async () => {
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(host.querySelector(ERROR_MESSAGE)?.textContent).toContain("Enter your access token");
});

it("ignores concurrent submits and never resumes a cancelled login attempt", async () => {
  let finish: ((response: Response) => void) | undefined;
  const fetcher = vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      })
  );
  vi.stubGlobal("fetch", fetcher);
  const authenticated = vi.fn<(connection: Connection) => void>();
  renderDialog(authenticated);
  setToken("pending-token");
  const form = host.querySelector(".authentication-form");
  await act(async () => {
    findButton("Connect").click();
    form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledOnce();
  act(() => {
    root?.unmount();
  });
  root = null;
  await act(async () => {
    finish?.(infoResponse());
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(authenticated).not.toHaveBeenCalled();
});
