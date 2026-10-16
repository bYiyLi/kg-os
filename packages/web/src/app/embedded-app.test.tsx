// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// cspell:words hostcontextchanged toolresult

import { EmbeddedApp, readOverview } from "./embedded-app.js";
import { i18n } from "./i18n/index.js";

const commitOne = vi.hoisted(() => "commit/" + "a".repeat(64));
const commitTwo = vi.hoisted(() => "commit/" + "d".repeat(64));
const branchTwo = vi.hoisted(() => "commit/" + "b".repeat(64));
const shared = vi.hoisted(() => "commit/" + "c".repeat(64));
const textType = vi.hoisted(() => "text");
const alertSelector = '[role="alert"]';
const sidebarCommitSelector = ".version-sidebar .commit-row";

function reply(value: unknown): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  return { content: [{ type: textType, text: JSON.stringify({ result: value }) }] };
}

function versionReply(code: string) {
  if (code === "return await evolution.branch.list()") {
    return reply({
      items: [
        { name: "main", state: commitOne },
        { name: "experiment", state: branchTwo }
      ]
    });
  }
  if (code === "return await evolution.tag.list()") {
    return reply({ items: [{ name: "v1", state: shared }] });
  }
  if (code.startsWith("return await evolution.ancestry(")) {
    const main = code.includes(commitOne);
    const root = main ? commitOne : branchTwo;
    return reply({
      root,
      items: [
        {
          state: root,
          parents: [shared],
          committedAt: Date.now() * 1000,
          message: main ? "Main update" : "Experiment update"
        },
        {
          state: shared,
          parents: null,
          committedAt: Date.now() * 1000 - 1000,
          message: "Shared history"
        }
      ]
    });
  }
  if (code.startsWith("const item = await evolution.get(")) {
    return reply({ state: code.includes(commitOne) ? commitOne : branchTwo });
  }
  return reply({ defaultBranch: "main", state: commitOne });
}
const bridge = vi.hoisted(() => ({
  connect: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
  getHostContext: vi.fn((): { theme?: string; locale?: string } | undefined => ({
    theme: "light",
    locale: "en"
  })),
  getHostCapabilities: vi.fn((): { serverTools?: boolean } | undefined => ({ serverTools: true })),
  addEventListener: vi.fn(),
  callServerTool: vi
    .fn<
      (
        request: { name: string; arguments: { code: string } },
        options?: { signal?: AbortSignal }
      ) => Promise<ReturnType<typeof reply>>
    >()
    .mockResolvedValue(reply({ defaultBranch: "main", state: commitOne }))
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
  bridge.callServerTool.mockImplementation((request) =>
    Promise.resolve(versionReply(request.arguments.code))
  );
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

function overviewCalls() {
  return bridge.callServerTool.mock.calls.filter(
    ([request]) => request.arguments.code === "return await evolution.overview()"
  ).length;
}

it("loads the existing read-only tool through the bridge with no Web login", async () => {
  await renderEmbedded();
  expect(host.textContent).toContain(commitOne);
  expect(host.textContent).toContain("main");
  expect(host.querySelector('[data-theme="light"]')).not.toBeNull();
  expect(host.querySelector(".authentication-dialog")).toBeNull();
  expect(host.querySelector('input[type="password"]')).toBeNull();
  expect(bridge.connect).toHaveBeenCalledTimes(1);
  expect(bridge.callServerTool).toHaveBeenCalledWith({
    name: "kgos_read",
    arguments: { code: "return await evolution.overview()" }
  });
  expect(overviewCalls()).toBe(1);
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("2/2");
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(3);
  expect(host.textContent).toContain("Shared history");
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_read")).toBe(
    true
  );
  expect(bridge.addEventListener).toHaveBeenCalledWith("hostcontextchanged", expect.any(Function));
});

it("filters embedded Branch history and reads the selected Commit through MCP", async () => {
  await renderEmbedded();
  act(() => {
    button("Filter branches").click();
  });
  const main = Array.from(
    host.querySelectorAll<HTMLInputElement>('.version-branch-option input[type="checkbox"]')
  ).find((input) => input.parentElement?.textContent.trim() === "main");
  if (main === undefined) throw new Error("Missing main branch");
  await act(async () => {
    main.click();
    await Promise.resolve();
  });
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("1/2");
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(2);
  const row = Array.from(host.querySelectorAll<HTMLButtonElement>(sidebarCommitSelector)).find(
    (candidate) => candidate.textContent.includes("Experiment update")
  );
  if (row === undefined) throw new Error("Missing experiment Commit");
  await act(async () => {
    row.click();
    await Promise.resolve();
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.startsWith("const item = await evolution.get(")
    )
  ).toBe(true);
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_read")).toBe(
    true
  );
});

it("keeps MCP tool errors local to the version list without losing overview", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"RESOURCE_ERROR","message":"quota"}' }]
  });
  await act(async () => {
    button("Refresh versions").click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain(commitOne);
  expect(host.textContent).toContain("Could not load version history.");
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(3);
});

it("clears stale embedded versions when MCP reports authentication failure", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"AUTHENTICATION_FAILED"}' }]
  });
  await act(async () => {
    button("Refresh versions").click();
    await Promise.resolve();
  });
  expect(host.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
});

it("invalidates the embedded connection and stale commits if the host revokes MCP access", async () => {
  await renderEmbedded();
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(3);
  bridge.callServerTool.mockRejectedValueOnce(new Error("OAuth authorization revoked"));
  await act(async () => {
    button("Refresh versions").click();
    await Promise.resolve();
  });
  expect(host.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
  expect(host.textContent).not.toContain("Shared history");
  expect(host.querySelector(".authentication-dialog")).toBeNull();
});

it("changes language without a new tool call, but refreshes only on explicit action", async () => {
  await renderEmbedded();
  const before = bridge.callServerTool.mock.calls.length;
  await act(async () => {
    button("简体中文").click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain("当前知识版本");
  expect(bridge.callServerTool).toHaveBeenCalledTimes(before);
  bridge.callServerTool.mockImplementation((request) =>
    Promise.resolve(
      request.arguments.code === "return await evolution.overview()"
        ? reply({ defaultBranch: "develop", state: commitTwo })
        : versionReply(request.arguments.code)
    )
  );
  await act(async () => {
    button("刷新").click();
    await Promise.resolve();
  });
  expect(host.textContent).toContain(commitTwo);
  expect(host.textContent).not.toContain(commitOne);
  expect(overviewCalls()).toBe(2);
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

it("fails safely when MCP overview returns a malformed resolved State", async () => {
  bridge.callServerTool.mockResolvedValueOnce(
    reply({ defaultBranch: "main", state: "commit-one" })
  );
  await renderEmbedded();
  expect(host.querySelector(alertSelector)).not.toBeNull();
  expect(host.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
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
  expect(overviewCalls()).toBe(1);
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
