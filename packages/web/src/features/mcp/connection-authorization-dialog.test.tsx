// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import type { Connection } from "../../core/client/connect.js";
import { ConnectionAuthorizationDialog } from "./connection-authorization-dialog.js";

let host: HTMLDivElement;
let root: Root;
const requestId = "r".repeat(43);
const alertSelector = '[role="alert"]';
const approveSelector = ".mcp-authorization-approve";
const dialogSelector = ".mcp-authorization-dialog";
const decisionPath = "/oauth/decision";
const failureMessage = "Could not complete";
const unavailableMessage = "unavailable";
const details = {
  client_id: "https://chatgpt.com/oauth/client.json",
  client_name: "ChatGPT",
  resource: "https://kgos.example.com",
  scope: "kgos:access",
  canWrite: true,
  expires_at: "2099-01-01T00:00:00Z"
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.restoreAllMocks();
});

function fakeConnection(oauthFetch: Connection["oauthFetch"]): Connection {
  return { oauthFetch } as Connection;
}

async function render(fetcher: Connection["oauthFetch"], id: string | null = requestId) {
  await act(async () => {
    root.render(
      <TranslationProvider>
        <ConnectionAuthorizationDialog connection={fakeConnection(fetcher)} requestId={id} />
      </TranslationProvider>
    );
    await Promise.resolve();
  });
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

it("renders nothing outside an OAuth redirect", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(details));
  await render(fetcher, null);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});

it("shows verified ChatGPT and full write permissions in a modal", async () => {
  const fetcher = vi.fn().mockResolvedValue(response(details));
  await render(fetcher);
  const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
  expect(path).toBe("/oauth/request?request_id=" + requestId);
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(
    document.body.querySelector<HTMLElement>('[role="dialog"]')?.hasAttribute("data-open")
  ).toBe(true);
  expect(document.body.textContent).toContain("Authorize Connection");
  expect(document.body.textContent).toContain("ChatGPT");
  expect(document.body.textContent).toContain("https://kgos.example.com");
  expect(document.body.textContent).toContain("Modify knowledge");
  expect(document.body.textContent).toContain("Manage branches");
  expect(document.body.textContent).toContain("This connection includes write access.");
  expect(document.body.querySelector("input")).toBeNull();
  const authorize = Array.from(document.body.querySelectorAll("button")).find(
    (element) => element.textContent === "Authorize Connection"
  );
  expect(authorize?.disabled).toBe(false);
});

it("never enables approval for missing or untrusted authorization details", async () => {
  const fetcher = vi.fn().mockResolvedValue(response({ ...details, client_name: "Attacker" }));
  await render(fetcher);
  expect(document.body.querySelector(alertSelector)?.textContent).toContain(unavailableMessage);
  expect(document.body.querySelector<HTMLButtonElement>(approveSelector)?.disabled).toBe(true);
  const cancel = document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel");
  expect(cancel?.disabled).toBe(false);
  act(() => {
    cancel?.click();
  });
  expect(document.body.querySelector(dialogSelector)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("submits an authenticated explicit denial without token fields", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation((path: string) =>
      Promise.resolve(
        response(
          path === decisionPath ? { redirect_url: "https://evil.example/redirect" } : details
        )
      )
    );
  await render(fetcher);
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel")?.click();
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledWith(
    decisionPath,
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ request_id: requestId, decision: "deny" })
    })
  );
  expect(document.body.querySelector(alertSelector)?.textContent).toContain(failureMessage);
  act(() => {
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel")?.click();
  });
  expect(document.body.querySelector(dialogSelector)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it.each([
  ["missing request", null, 200],
  ["non-ChatGPT client", { ...details, client_id: "https://other.example/oauth" }, 200],
  ["invalid resource", { ...details, resource: null }, 200],
  ["missing write scope", { ...details, scope: "kgos:read" }, 200],
  ["read-only client", { ...details, canWrite: false }, 200],
  ["invalid expiration", { ...details, expires_at: "invalid" }, 200],
  ["expired request", { ...details, expires_at: "2001-01-01T00:00:00Z" }, 200],
  ["temporary service failure", details, 503]
] as const)("never permits approval for %s", async (_case, payload, status) => {
  const fetcher = vi.fn().mockResolvedValue(response(payload, status));
  await render(fetcher);
  expect(document.body.querySelector(alertSelector)?.textContent).toContain(unavailableMessage);
  expect(document.body.querySelector<HTMLButtonElement>(approveSelector)?.disabled).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not approve after a failed network read", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("unreachable"));
  await render(fetcher);
  expect(document.body.querySelector(alertSelector)?.textContent).toContain(unavailableMessage);
  expect(document.body.querySelector<HTMLButtonElement>(approveSelector)?.disabled).toBe(true);
});

it.each([
  ["missing redirect", null, 200],
  ["missing redirect field", {}, 200],
  ["plain HTTP", { redirect_url: "http://chatgpt.com/oauth/return" }, 200],
  ["lookalike hostname", { redirect_url: "https://chatgpt.com.evil.test/" }, 200],
  ["userinfo injection", { redirect_url: "https://user@chatgpt.com/oauth/return" }, 200],
  ["malformed URL", { redirect_url: ":invalid" }, 200],
  ["decision service failure", { redirect_url: "https://chatgpt.com/oauth/return" }, 503]
] as const)(
  "rejects %s without leaving the authorization dialog",
  async (_case, outcome, status) => {
    const fetcher = vi
      .fn()
      .mockImplementation((path: string) =>
        Promise.resolve(
          response(path === decisionPath ? outcome : details, path === decisionPath ? status : 200)
        )
      );
    await render(fetcher);
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>(approveSelector)?.click();
      await Promise.resolve();
    });
    expect(document.body.querySelector(alertSelector)?.textContent).toContain(failureMessage);
    expect(document.body.querySelector(dialogSelector)).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
);

it("serializes authorization decisions and cannot cancel an in-flight decision", async () => {
  let resolveDecision!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    resolveDecision = resolve;
  });
  const fetcher = vi
    .fn()
    .mockImplementation((path: string) =>
      path === decisionPath ? pending : Promise.resolve(response(details))
    );
  await render(fetcher);
  act(() => {
    document.body.querySelector<HTMLButtonElement>(approveSelector)?.click();
    document.body.querySelector<HTMLButtonElement>(approveSelector)?.click();
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel")?.click();
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(document.body.querySelector(dialogSelector)).not.toBeNull();
  await act(async () => {
    resolveDecision(response({ redirect_url: "https://evil.example/" }));
    await Promise.resolve();
  });
  expect(document.body.querySelector(alertSelector)?.textContent).toContain(failureMessage);
});

it("ignores a request response that arrives after leaving the authorization flow", async () => {
  let resolveRequest!: (result: Response) => void;
  const waiting = new Promise<Response>((resolve) => {
    resolveRequest = resolve;
  });
  const fetcher = vi.fn().mockReturnValue(waiting);
  await render(fetcher);
  const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
  await render(fetcher, null);
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    resolveRequest(response(details));
    await Promise.resolve();
  });
  expect(document.body.querySelector(dialogSelector)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("does not surface a late request error after navigation has canceled it", async () => {
  let rejectRequest!: (error: Error) => void;
  const waiting = new Promise<Response>((_resolve, reject: (error: Error) => void) => {
    rejectRequest = reject;
  });
  const fetcher = vi.fn().mockReturnValue(waiting);
  await render(fetcher);
  await render(fetcher, null);
  await act(async () => {
    rejectRequest(new Error("The old authorization request was canceled"));
    await Promise.resolve();
  });
  expect(document.body.querySelector(dialogSelector)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});
