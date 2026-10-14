// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// cspell:words hostcontextchanged toolresult

import { EmbeddedApp, readOverview } from "./embedded-app.js";
import { i18n } from "./i18n/index.js";

const commitOne = vi.hoisted(() => "commit-one");
const textType = vi.hoisted(() => "text");
const alertSelector = '[role="alert"]';
const bridge = vi.hoisted(() => ({
  connect: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
  getHostContext: vi.fn((): { theme?: string; locale?: string } | undefined => ({
    theme: "light",
    locale: "en"
  })),
  getHostCapabilities: vi.fn((): { serverTools?: boolean } | undefined => ({ serverTools: true })),
  addEventListener: vi.fn(),
  callServerTool: vi.fn(() =>
    Promise.resolve({
      content: [
        {
          type: textType,
          text: JSON.stringify({ result: { defaultBranch: "main", state: commitOne } })
        }
      ]
    })
  )
}));

vi.mock("@modelcontextprotocol/ext-apps", () => ({
  App: class {
    connect = bridge.connect;
    close = bridge.close;
    getHostContext = bridge.getHostContext;
    getHostCapabilities = bridge.getHostCapabilities;
    addEventListener = bridge.addEventListener;
    callServerTool = bridge.callServerTool;
  }
}));

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  bridge.getHostCapabilities.mockReturnValue({ serverTools: true });
  bridge.callServerTool.mockResolvedValue({
    content: [
      {
        type: textType,
        text: JSON.stringify({ result: { defaultBranch: "main", state: commitOne } })
      }
    ]
  });
  await i18n.changeLanguage("en");
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
});

async function renderEmbedded() {
  await act(async () => {
    root.render(<EmbeddedApp />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

function button(name: string) {
  const element = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent === name || item.getAttribute("aria-label") === name
  );
  if (element === undefined) throw new Error("Missing button: " + name);
  return element;
}

it("loads the existing read-only tool through the bridge with no Web login", async () => {
  await renderEmbedded();
  expect(host.textContent).toContain(commitOne);
  expect(host.textContent).toContain("main");
  expect(host.querySelector('[data-theme="light"]')).not.toBeNull();
  expect(host.querySelector(".authentication-dialog")).toBeNull();
  expect(host.querySelector('input[type="password"]')).toBeNull();
  expect(bridge.connect).toHaveBeenCalledTimes(1);
  expect(bridge.callServerTool).toHaveBeenCalledExactlyOnceWith({
    name: "kgos_read",
    arguments: { code: "return await evolution.overview()" }
  });
  expect(bridge.addEventListener).toHaveBeenCalledWith("hostcontextchanged", expect.any(Function));
});

it("changes language without a new tool call, but refreshes only on explicit action", async () => {
  await renderEmbedded();
  await act(async () => {
    button("简体中文").click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("当前知识版本");
  expect(bridge.callServerTool).toHaveBeenCalledTimes(1);
  bridge.callServerTool.mockResolvedValue({
    content: [
      {
        type: textType,
        text: JSON.stringify({ result: { defaultBranch: "develop", state: "commit-two" } })
      }
    ]
  });
  await act(async () => {
    button("刷新").click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("commit-two");
  expect(host.textContent).not.toContain(commitOne);
  expect(bridge.callServerTool).toHaveBeenCalledTimes(2);
});

it("reports failure without retaining stale branch data", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValue({
    content: [{ type: textType, text: '{"result":{}}' }]
  });
  await act(async () => {
    button("Refresh").click();
    await Promise.resolve();
  });
  expect(host.querySelector(alertSelector)?.textContent).toContain("unavailable");
  expect(host.textContent).not.toContain(commitOne);
});

it("requires host support for MCP server tool calls", async () => {
  bridge.getHostCapabilities.mockReturnValue({ serverTools: false });
  await renderEmbedded();
  expect(host.querySelector(alertSelector)).not.toBeNull();
  expect(bridge.callServerTool).not.toHaveBeenCalled();
});

it("handles rejected host connections without querying", async () => {
  bridge.connect.mockRejectedValueOnce(new Error("Host denied initialization"));
  await renderEmbedded();
  expect(host.querySelector(alertSelector)).not.toBeNull();
  expect(bridge.callServerTool).not.toHaveBeenCalled();
});

it("handles transport failure after a successful read", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockRejectedValueOnce(new Error("Authorization revoked"));
  await act(async () => {
    button("Refresh").click();
    await Promise.resolve();
  });
  expect(host.querySelector(alertSelector)).not.toBeNull();
  expect(host.textContent).not.toContain(commitOne);
});

it("invalidates the read when the host reports a tool error", async () => {
  await renderEmbedded();
  const handler = bridge.addEventListener.mock.calls.find(
    (call) => call[0] === "toolresult"
  )?.[1] as ((result: { isError?: boolean }) => void) | undefined;
  expect(handler).toBeDefined();
  act(() => handler?.({ isError: true }));
  expect(host.querySelector(alertSelector)).not.toBeNull();
  expect(host.textContent).not.toContain(commitOne);
});

it("accepts missing host preferences without requiring Web credentials", async () => {
  bridge.getHostContext.mockReturnValue(undefined);
  await renderEmbedded();
  expect(host.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(host.textContent).toContain(commitOne);
});

it("updates host theme and language independently of MCP data", async () => {
  await renderEmbedded();
  const handler = bridge.addEventListener.mock.calls.find(
    (call) => call[0] === "hostcontextchanged"
  )?.[1] as (() => void) | undefined;
  expect(handler).toBeDefined();
  bridge.getHostContext.mockReturnValue({ theme: "dark", locale: "zh-CN" });
  await act(async () => {
    handler?.();
    await Promise.resolve();
  });
  expect(host.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(host.textContent).toContain("当前知识版本");
  expect(bridge.callServerTool).toHaveBeenCalledTimes(1);
});

it("rejects errors and untrusted result envelopes", () => {
  expect(() => readOverview({ isError: true, content: [] })).toThrow();
  expect(() => readOverview({ content: [] })).toThrow();
  expect(() => readOverview({ content: [{ type: textType, text: "{}" }] })).toThrow();
  expect(() =>
    readOverview({
      content: [{ type: textType, text: '{"result":{"state":"","defaultBranch":2}}' }]
    })
  ).toThrow();
});

it.each([
  null,
  15,
  [],
  {},
  { isError: true, content: [] },
  { content: [] },
  { content: [null] },
  { content: [false, { type: "image", data: "" }] },
  { content: [{ type: textType, text: null }] },
  { content: [{ type: textType, text: "null" }] },
  { content: [{ type: textType, text: "[]" }] },
  { content: [{ type: textType, text: "42" }] },
  { content: [{ type: textType, text: '{"result":null}' }] },
  { content: [{ type: textType, text: '{"result":[]}' }] },
  { content: [{ type: textType, text: '{"result":{"state":"","defaultBranch":"main"}}' }] },
  { content: [{ type: textType, text: '{"result":{"state":"x","defaultBranch":""}}' }] },
  { content: [{ type: textType, text: '{"result":{"state":42,"defaultBranch":"main"}}' }] }
])("rejects malformed MCP results %#", (result) => {
  expect(() => readOverview(result)).toThrow();
});
