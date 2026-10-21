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
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("unavailable");
  expect(
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-approve")?.disabled
  ).toBe(true);
  const cancel = document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel");
  expect(cancel?.disabled).toBe(false);
  act(() => {
    cancel?.click();
  });
  expect(document.body.querySelector(".mcp-authorization-dialog")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("submits an authenticated explicit denial without token fields", async () => {
  const fetcher = vi
    .fn()
    .mockImplementation((path: string) =>
      Promise.resolve(
        response(
          path === "/oauth/decision" ? { redirect_url: "https://evil.example/redirect" } : details
        )
      )
    );
  await render(fetcher);
  await act(async () => {
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel")?.click();
    await Promise.resolve();
  });
  expect(fetcher).toHaveBeenCalledWith(
    "/oauth/decision",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ request_id: requestId, decision: "deny" })
    })
  );
  expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not complete"
  );
  act(() => {
    document.body.querySelector<HTMLButtonElement>(".mcp-authorization-cancel")?.click();
  });
  expect(document.body.querySelector(".mcp-authorization-dialog")).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
