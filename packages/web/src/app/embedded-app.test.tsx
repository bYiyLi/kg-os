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
const sidebarDomainSelector = ".version-sidebar .domain-name";
const historyRowSelector = ".version-dag-row";
const MAIN_DOMAIN = "Main domain";
const EXPERIMENT_DOMAIN = "Experiment domain";
const WORLD_REFRESH = "Refresh knowledge worlds";
const EXPERIMENT_UPDATE = "Experiment update";
const SHARED_HISTORY = "Shared history";

function reply(value: unknown): {
  content: { type: string; text: string }[];
  isError?: boolean;
} {
  return { content: [{ type: textType, text: JSON.stringify({ result: value }) }] };
}

function domainReply(code: string) {
  const request = JSON.parse(code.slice(code.indexOf("(") + 1, -1)) as {
    at: string;
    refs?: string[];
  };
  const archived = request.at === shared;
  const names = archived ? ["Archive"] : ["Work", "Projects"];
  const title = request.at === commitOne ? MAIN_DOMAIN : EXPERIMENT_DOMAIN;
  if (code.startsWith("return await ontology.read("))
    return reply({
      state: request.at,
      results: [
        {
          kind: "overview",
          items: names.map((name) => ({ kind: "domain", ref: "domain:" + name, name })),
          total: names.length,
          markdown: ""
        }
      ]
    });
  return reply({
    state: request.at,
    results: (request.refs ?? []).map((ref) => ({
      kind: "domain",
      ref,
      value: {
        name: ref.slice(7),
        title: ref === "domain:Work" ? title : ref.slice(7),
        includes: ref === "domain:Work" ? ["domain:Projects"] : []
      }
    }))
  });
}

function versionReply(code: string) {
  if (
    code.startsWith("return await ontology.read(") ||
    code.startsWith("return await object.read(")
  )
    return domainReply(code);
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
          message: SHARED_HISTORY
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

function button(name: string, container: ParentNode = document.body) {
  const element = Array.from(container.querySelectorAll("button")).find(
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

async function click(name: string, container: ParentNode = document.body) {
  await act(async () => {
    button(name, container).click();
    await Promise.resolve();
  });
}

function dialog() {
  const element = document.body.querySelector<HTMLElement>('[role="dialog"]');
  if (element === null) throw new Error("Missing history dialog");
  return element;
}

function historyRow(message: string) {
  const row = [...dialog().querySelectorAll<HTMLButtonElement>(historyRowSelector)].find(
    (element) => element.textContent.includes(message)
  );
  if (row === undefined) throw new Error("Missing history version");
  return row;
}

async function openHistory(name = "main") {
  await click("View history: " + name);
  return dialog();
}

it("loads real Domain navigation through fixed read-only MCP methods without Web login or eager history", async () => {
  await renderEmbedded();
  expect(document.body.textContent).toContain(commitOne);
  expect(document.body.querySelector('[data-theme="light"]')).not.toBeNull();
  expect(document.body.querySelector(".authentication-dialog")).toBeNull();
  expect(document.body.querySelector('input[type="password"]')).toBeNull();
  expect(bridge.connect).toHaveBeenCalledTimes(1);
  expect(overviewCalls()).toBe(1);
  expect(button("main").getAttribute("aria-current")).toBe("page");
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(1);
  expect(document.body.querySelector(".version-sidebar")?.textContent).toContain(MAIN_DOMAIN);
  expect(document.body.textContent).not.toContain(SHARED_HISTORY);
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.includes("evolution.ancestry")
    )
  ).toBe(false);
  expect(bridge.callServerTool).toHaveBeenCalledWith({
    name: "kgos_query",
    arguments: { code: "return await evolution.overview()" }
  });
  expect(
    bridge.callServerTool.mock.calls.some(
      ([request]) =>
        request.arguments.code === `return await ontology.read({"at":"${commitOne}","limit":100})`
    )
  ).toBe(true);
  expect(
    bridge.callServerTool.mock.calls.some(
      ([request]) =>
        request.arguments.code.startsWith("return await object.read(") &&
        request.arguments.code.includes(commitOne)
    )
  ).toBe(true);
  await click("Expand domain: " + MAIN_DOMAIN);
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(2);
  expect(document.body.querySelector(".version-sidebar")?.textContent).toContain("Projects");
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_query")).toBe(
    true
  );
  expect(bridge.addEventListener).toHaveBeenCalledWith("hostcontextchanged", expect.any(Function));
});

it("filters history inside its dialog while preserving the sidebar Domain tree", async () => {
  await renderEmbedded();
  await click("Knowledge world actions");
  await click("View history across worlds");
  expect(dialog().querySelectorAll(".commit-row")).toHaveLength(3);
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(1);
  await click("Filter knowledge worlds", dialog());
  const main = [
    ...document.body.querySelectorAll<HTMLElement>('.version-branch-option [role="checkbox"]')
  ].find((input) => input.getAttribute("aria-label") === "main");
  if (main === undefined) throw new Error("Missing main branch");
  await act(async () => {
    main.click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".version-branch-count")?.textContent).toBe("1/2");
  expect(dialog().querySelectorAll(".commit-row")).toHaveLength(2);
  await click("Filter knowledge worlds", dialog());
  const row = [...dialog().querySelectorAll<HTMLButtonElement>(".commit-row")].find((candidate) =>
    candidate.textContent.includes(EXPERIMENT_UPDATE)
  );
  if (row === undefined) throw new Error("Missing experiment version");
  await act(async () => {
    row.click();
    await Promise.resolve();
  });
  expect(row.getAttribute("aria-pressed")).toBe("true");
  await click("Close version relationships", dialog());
  expect(document.body.querySelector('.world-section-trigger[aria-current="page"]')).toBeNull();
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(1);
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.includes("evolution.get")
    )
  ).toBe(true);
  expect(bridge.callServerTool.mock.calls.every(([request]) => request.name === "kgos_query")).toBe(
    true
  );
});

it("expands a world without get, selects its Domain and reads historical Domains at the selected State", async () => {
  await renderEmbedded();
  await click("Expand knowledge world: experiment");
  expect(button("main").getAttribute("aria-current")).toBe("page");
  expect(button("Expand knowledge world: experiment").getAttribute("aria-expanded")).toBe("true");
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.includes("evolution.get")
    )
  ).toBe(false);
  await click(EXPERIMENT_DOMAIN);
  expect(button("experiment").getAttribute("aria-current")).toBe("page");
  expect(button(EXPERIMENT_DOMAIN).getAttribute("aria-pressed")).toBe("true");
  expect(
    bridge.callServerTool.mock.calls.some(([request]) =>
      request.arguments.code.includes("evolution.ancestry")
    )
  ).toBe(false);
  await openHistory("experiment");
  const historical = historyRow(SHARED_HISTORY);
  await act(async () => {
    historical.click();
    await Promise.resolve();
  });
  expect(historical.getAttribute("aria-pressed")).toBe("true");
  expect(dialog().textContent).toContain("Viewing a historical version");
  expect(document.body.querySelector(".version-sidebar")?.textContent).toContain("Archive");
  expect(
    bridge.callServerTool.mock.calls.some(
      ([request]) =>
        request.arguments.code.startsWith("return await ontology.read(") &&
        request.arguments.code.includes(shared)
    )
  ).toBe(true);
  await click("Back to latest", dialog());
  expect(historyRow(EXPERIMENT_UPDATE).getAttribute("aria-pressed")).toBe("true");
  expect(document.body.querySelector(".version-sidebar")?.textContent).toContain(EXPERIMENT_DOMAIN);
  expect(document.body.querySelector(".authentication-dialog")).toBeNull();
});

it("keeps MCP resource errors local while preserving confirmed Domain navigation and overview", async () => {
  await renderEmbedded();
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"RESOURCE_ERROR","message":"quota"}' }]
  });
  await click(WORLD_REFRESH);
  expect(document.body.textContent).toContain(commitOne);
  expect(document.body.textContent).toContain("World references may be out of date");
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(1);
  expect(document.body.querySelector(".embedded-connection [role='alert']")).toBeNull();
});

it("clears old Domains and an open history dialog after MCP authentication failure", async () => {
  await renderEmbedded();
  await openHistory();
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(1);
  bridge.callServerTool.mockResolvedValueOnce({
    isError: true,
    content: [{ type: textType, text: '{"code":"AUTHENTICATION_FAILED"}' }]
  });
  await act(async () => {
    historyRow(SHARED_HISTORY).click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(0);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.textContent).not.toContain(SHARED_HISTORY);
});

it("invalidates Domain navigation and loaded ancestry when the host revokes MCP access", async () => {
  await renderEmbedded();
  await openHistory();
  expect(historyRow(SHARED_HISTORY)).toBeDefined();
  bridge.callServerTool.mockRejectedValueOnce(new Error("OAuth authorization revoked"));
  await act(async () => {
    historyRow(SHARED_HISTORY).click();
    await Promise.resolve();
  });
  expect(document.body.querySelector(".embedded-connection [role='alert']")).not.toBeNull();
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(0);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.textContent).not.toContain(SHARED_HISTORY);
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
  expect(document.body.querySelectorAll(sidebarDomainSelector)).toHaveLength(0);
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
