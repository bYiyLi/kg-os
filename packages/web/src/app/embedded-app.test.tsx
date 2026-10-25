// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// cspell:words hostcontextchanged toolresult

import { EmbeddedApp, readOverview } from "./embedded-app.js";
import { i18n, selectLocale } from "./i18n/index.js";

const commitOne = vi.hoisted(() => "commit/" + "a".repeat(64));
const commitTwo = vi.hoisted(() => "commit/" + "d".repeat(64));
const branchTwo = vi.hoisted(() => "commit/" + "b".repeat(64));
const shared = vi.hoisted(() => "commit/" + "c".repeat(64));
const textType = vi.hoisted(() => "text");
const alertSelector = '[role="alert"]';
const sidebarCommitSelector = ".version-sidebar .commit-row";
const EXPERIMENT_UPDATE = "Experiment update";

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
          message: main ? "Main update" : EXPERIMENT_UPDATE
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
    if (code.includes(shared)) return reply({ state: shared });
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
  await selectLocale("system");
  localStorage.clear();
  bridge.getHostContext.mockReturnValue({ theme: "light", locale: "en" });
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
  const element = Array.from(document.body.querySelectorAll("button")).find(
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
  expect(document.body.textContent).toContain(commitOne);
  expect(document.body.textContent).toContain("main");
  expect(document.body.querySelector('[data-theme="light"]')).not.toBeNull();
  expect(document.body.querySelector(".authentication-dialog")).toBeNull();
  expect(document.body.querySelector('input[type="password"]')).toBeNull();
  expect(bridge.connect).toHaveBeenCalledTimes(1);
  expect(bridge.callServerTool).toHaveBeenCalledWith({
    name: "kgos_query",
    arguments: { code: "return await evolution.overview()" }
  });
  expect(overviewCalls()).toBe(1);
  expect(button("main").getAttribute("aria-current")).toBe("page");
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(2);
  expect(document.body.querySelector(".version-sidebar")?.textContent).not.toContain(
    EXPERIMENT_UPDATE
  );
  expect(document.body.textContent).toContain("Shared history");
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_query")).toBe(
    true
  );
  expect(bridge.addEventListener).toHaveBeenCalledWith("hostcontextchanged", expect.any(Function));
});

it("filters embedded history across worlds and reads the selected version through MCP", async () => {
  await renderEmbedded();
  act(() => {
    button("Knowledge world actions").click();
  });
  act(() => {
    button("View history across worlds").click();
  });
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(3);
  act(() => {
    button("Filter knowledge worlds").click();
  });
  const main = Array.from(
    document.body.querySelectorAll<HTMLElement>('.version-branch-option [role="checkbox"]')
  ).find((input) => input.getAttribute("aria-label") === "main");
  if (main === undefined) throw new Error("Missing main branch");
  await act(async () => {
    main.click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".version-branch-count")?.textContent).toBe("1/2");
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(2);
  act(() => {
    button("Filter knowledge worlds").click();
  });
  const row = Array.from(
    document.body.querySelectorAll<HTMLButtonElement>(sidebarCommitSelector)
  ).find((candidate) => candidate.textContent.includes(EXPERIMENT_UPDATE));
  if (row === undefined) throw new Error("Missing experiment Commit");
  await act(async () => {
    row.click();
    await Promise.resolve();
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  act(() => {
    button("Back to world navigation").click();
  });
  expect(button("main").getAttribute("aria-current")).toBe("page");
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.startsWith("const item = await evolution.get(")
    )
  ).toBe(true);
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_query")).toBe(
    true
  );
});

it("expands worlds without get and selects a world version through the read-only bridge", async () => {
  await renderEmbedded();
  const before = bridge.callServerTool.mock.calls.filter(([request]) =>
    request.arguments.code.includes("evolution.get")
  ).length;
  act(() => {
    button("experiment").click();
  });
  expect(button("main").getAttribute("aria-current")).toBe("page");
  expect(button("experiment").getAttribute("aria-expanded")).toBe("true");
  expect(
    bridge.callServerTool.mock.calls.filter(([request]) =>
      request.arguments.code.includes("evolution.get")
    )
  ).toHaveLength(before);
  const head = [...document.body.querySelectorAll<HTMLButtonElement>(sidebarCommitSelector)].find(
    (candidate) => candidate.textContent.includes(EXPERIMENT_UPDATE)
  );
  if (head === undefined) throw new Error("Missing experiment world head");
  await act(async () => {
    head.click();
    await Promise.resolve();
  });
  expect(button("experiment").getAttribute("aria-current")).toBe("page");
  const row = [...document.body.querySelectorAll<HTMLButtonElement>(sidebarCommitSelector)].find(
    (candidate) => candidate.textContent.includes("Shared history")
  );
  if (row === undefined) throw new Error("Missing shared historical version");
  await act(async () => {
    row.click();
    await Promise.resolve();
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  expect(document.body.textContent).toContain("Viewing a historical version");
  await act(async () => {
    button("Back to latest").click();
    await Promise.resolve();
  });
  expect(
    document.body.querySelector(`${sidebarCommitSelector}[aria-pressed="true"]`)?.textContent
  ).toContain(EXPERIMENT_UPDATE);
  expect(
    bridge.callServerTool.mock.calls.some(
      ([request]) =>
        request.arguments.code.startsWith("const item = await evolution.get(") &&
        request.arguments.code.includes(shared)
    )
  ).toBe(true);
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_query")).toBe(
    true
  );
  expect(document.body.querySelector(".authentication-dialog")).toBeNull();
});

it("keeps MCP tool errors local to the version list without losing overview", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"RESOURCE_ERROR","message":"quota"}' }]
  });
  await act(async () => {
    button("Refresh knowledge worlds").click();
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain(commitOne);
  expect(document.body.textContent).toContain("Could not load version history.");
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(2);
});

it("clears stale embedded versions when MCP reports authentication failure", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"AUTHENTICATION_FAILED"}' }]
  });
  await act(async () => {
    button("Refresh knowledge worlds").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
});

it("invalidates the embedded connection and stale commits if the host revokes MCP access", async () => {
  await renderEmbedded();
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(2);
  bridge.callServerTool.mockRejectedValueOnce(new Error("OAuth authorization revoked"));
  await act(async () => {
    button("Refresh knowledge worlds").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
  expect(document.body.textContent).not.toContain("Shared history");
  expect(document.body.querySelector(".authentication-dialog")).toBeNull();
});

it("changes language without a new tool call, but refreshes only on explicit action", async () => {
  await renderEmbedded();
  const before = bridge.callServerTool.mock.calls.length;
  await act(async () => {
    button("Settings").click();
    await Promise.resolve();
  });
  await act(async () => {
    button("简体中文").click();
    await Promise.resolve();
  });
  expect(document.body.textContent).toContain("当前知识版本");
  expect(bridge.callServerTool).toHaveBeenCalledTimes(before);
  await act(async () => {
    button("关闭设置").click();
    await Promise.resolve();
  });
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
  expect(document.body.textContent).toContain(commitTwo);
  expect(document.body.textContent).not.toContain(commitOne);
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
  expect(document.body.querySelector(alertSelector)?.textContent).toContain("unavailable");
  expect(document.body.textContent).not.toContain(commitOne);
});

it("requires host support for MCP server tool calls", async () => {
  bridge.getHostCapabilities.mockReturnValue({ serverTools: false });
  await renderEmbedded();
  expect(document.body.querySelector(alertSelector)).not.toBeNull();
  expect(bridge.callServerTool).not.toHaveBeenCalled();
});

it("fails safely when MCP overview returns a malformed resolved State", async () => {
  bridge.callServerTool.mockResolvedValueOnce(
    reply({ defaultBranch: "main", state: "commit-one" })
  );
  await renderEmbedded();
  expect(document.body.querySelector(alertSelector)).not.toBeNull();
  expect(document.body.querySelectorAll(sidebarCommitSelector)).toHaveLength(0);
});

it("handles rejected host connections without querying", async () => {
  bridge.connect.mockRejectedValueOnce(new Error("Host denied initialization"));
  await renderEmbedded();
  expect(document.body.querySelector(alertSelector)).not.toBeNull();
  expect(bridge.callServerTool).not.toHaveBeenCalled();
});

it("handles transport failure after a successful read", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockRejectedValueOnce(new Error("Authorization revoked"));
  await act(async () => {
    button("Refresh").click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(alertSelector)).not.toBeNull();
  expect(document.body.textContent).not.toContain(commitOne);
});

it("invalidates the read when the host reports a tool error", async () => {
  await renderEmbedded();
  const handler = bridge.addEventListener.mock.calls.find(
    (call) => call[0] === "toolresult"
  )?.[1] as ((result: { isError?: boolean }) => void) | undefined;
  expect(handler).toBeDefined();
  act(() => handler?.({ isError: true }));
  expect(document.body.querySelector(alertSelector)).not.toBeNull();
  expect(document.body.textContent).not.toContain(commitOne);
});

it("accepts missing host preferences without requiring Web credentials", async () => {
  bridge.getHostContext.mockReturnValue(undefined);
  await renderEmbedded();
  expect(document.body.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(document.body.textContent).toContain(commitOne);
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
  expect(document.body.querySelector('[data-theme="dark"]')).not.toBeNull();
  expect(document.body.textContent).toContain("当前知识版本");
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
