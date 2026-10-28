// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { i18n } from "../i18n/index.js";
import { stateRef, type VersionReader } from "../../features/version/version-data.js";
import {
  main,
  develop,
  common,
  genesis,
  at,
  ONTOLOGY_COMMIT,
  WORLD_REFRESH,
  CROSS_WORLD_FILTER,
  PRESSED_ATTRIBUTE,
  SHARED_MESSAGE,
  row,
  mockReader,
  VersionBrowserHarness,
  findButton,
  click,
  checkbox,
  rows,
  namedRow,
  worldButton,
  worldToggle,
  inputValue,
  resolved,
  flush,
  chooseWorld,
  showAcrossWorlds,
  openRelationships
} from "../../../test/version-browser-fixture.js";

const HEAD_MESSAGE = "Merge experiment";
const FIX_MESSAGE = "Fix properties";
const LOAD_EARLIER = "Load earlier versions";
const WORLD_SEARCH = "Search knowledge worlds...";
const CURRENT_ATTRIBUTE = "aria-current";
const EXPANDED_ATTRIBUTE = "aria-expanded";
const WORLD_SECTION = ".world-section";
let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
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

async function render(
  reader: VersionReader | null,
  options: { defaultBranch?: string | null; initialState?: string } = {}
) {
  await act(async () => {
    root.render(<VersionBrowserHarness reader={reader} {...options} />);
    await Promise.resolve();
  });
}

it("shows peer worlds and the actual default world's domains without fetching history", async () => {
  const api = mockReader();
  await render(api, { defaultBranch: "develop", initialState: develop });
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(4);
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(host.querySelector('[aria-label="Domains: develop"]')?.textContent).toContain("Knowledge");
  expect(host.querySelectorAll(".commit-item")).toHaveLength(0);
  expect(api.ancestry).not.toHaveBeenCalled();
  expect(vi.mocked(api.object.read).mock.calls[0]?.[0]).toEqual({
    at: stateRef(develop),
    refs: ["domain:Knowledge", "domain:Topics"]
  });
  expect(vi.mocked(api.object.read).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
});

it("expands or collapses a peer independently from selecting its name", async () => {
  const api = mockReader();
  await render(api);
  click("Expand knowledge world: develop");
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("false");
  expect(worldToggle("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(api.get).not.toHaveBeenCalled();
  click("Expand knowledge world: develop");
  expect(host.querySelectorAll(".world-domain-region")).toHaveLength(0);
  await chooseWorld("develop");
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(vi.mocked(api.get).mock.calls[0]?.[0]).toEqual({ state: stateRef(develop) });
  expect(vi.mocked(api.get).mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("does not highlight another world that shares the same immutable head", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: stateRef(main) },
      { name: "novel", state: stateRef(main) }
    ]
  });
  await render(api, { defaultBranch: "novel" });
  click("Expand knowledge world: main");
  await flush();
  expect(worldButton("novel").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBeNull();
  await chooseWorld("main");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("novel").getAttribute(CURRENT_ATTRIBUTE)).toBeNull();
});

it("filters world names without selecting them or reading their history", async () => {
  const api = mockReader();
  await render(api);
  inputValue(WORLD_SEARCH, "FEATURE/");
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(1);
  expect(worldButton("feature/search").textContent).toContain("feature/search");
  expect(api.get).not.toHaveBeenCalled();
  expect(api.ancestry).not.toHaveBeenCalled();
  inputValue(WORLD_SEARCH, "no-such-world");
  expect(host.textContent).toContain("No matching knowledge worlds.");
  inputValue(WORLD_SEARCH, "");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
});

it("opens an unexpanded world's history without changing navigation and restores trigger focus", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships("develop");
  expect(document.body.querySelector(".version-dag-world")?.textContent).toBe("develop");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(api.get).not.toHaveBeenCalled();
  click("Close version relationships");
  await flush();
  expect(document.body.querySelector(".version-dag-dialog")).toBeNull();
  expect(document.activeElement).toBe(findButton("View history: develop"));
});

it("selects a historical version and reads the matching domain snapshot before returning latest", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships();
  act(() => {
    namedRow(FIX_MESSAGE).click();
  });
  await flush();
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(namedRow(HEAD_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(namedRow(HEAD_MESSAGE).textContent).toContain("Latest");
  expect(document.body.textContent).toContain("Viewing a historical version");
  expect(vi.mocked(api.ontology.read).mock.calls.at(-1)?.[0].at).toBe(stateRef("e".repeat(64)));
  click("Close version relationships");
  await flush();
  click("Back to latest");
  await flush();
  expect(vi.mocked(api.get).mock.calls.at(-1)?.[0]).toEqual({ state: stateRef(main) });
});

it("keeps the domain sidebar and browsing identity while filtering cross-world history", async () => {
  await render(mockReader());
  await showAcrossWorlds();
  expect(rows()).toHaveLength(6);
  expect(rows().filter((item) => item.textContent.includes(SHARED_MESSAGE))).toHaveLength(1);
  expect(host.querySelectorAll(".commit-item")).toHaveLength(0);
  click(CROSS_WORLD_FILTER);
  for (const name of ["develop", "experiment", "feature/search"])
    act(() => {
      checkbox(name).click();
    });
  expect(rows()).toHaveLength(2);
  act(() => {
    checkbox("main").click();
  });
  expect(rows()).toHaveLength(0);
  click("Select all");
  click(CROSS_WORLD_FILTER);
  inputValue("Search loaded versions...", "ONTOLOGY");
  expect(rows()).toHaveLength(1);
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  click("Close version relationships");
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
});

it("does not fake worlds while disconnected and renders a genuinely empty directory", async () => {
  await render(null);
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(0);
  expect(host.textContent).toContain("Connect to view knowledge worlds.");
  expect(findButton(WORLD_REFRESH)).toHaveProperty("disabled", true);
  const api = mockReader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({ items: [] });
  await render(api, { defaultBranch: null });
  expect(host.textContent).toContain("No knowledge worlds are available.");
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("shows immutable message summaries in the dialog and retains full source text", async () => {
  const api = mockReader();
  const message = "## 简介\n\n小说创作经验与叙事原则。\n\n## 改动\n\n补充人物动机。";
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(main),
    items: [row(main, message, 0, [])]
  });
  await render(api);
  await openRelationships();
  const item = namedRow("小说创作经验与叙事原则。");
  expect(item.textContent).not.toContain("## 简介");
  expect(item.title).toBe(message);
});

it("renders missing commit descriptions honestly and keeps invalid selection from replacing context", async () => {
  const api = mockReader();
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(main),
    items: [{ state: main, committedAt: at, parents: null }] as never
  });
  await render(api);
  await openRelationships();
  expect(rows().some((item) => item.textContent.includes("No version description"))).toBe(true);
  click("Close version relationships");
  await flush();
  await openRelationships("develop");
  vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
  act(() => {
    namedRow(ONTOLOGY_COMMIT).click();
  });
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(document.body.textContent).toContain("Could not open this version.");
  vi.mocked(api.get).mockResolvedValueOnce(resolved(common));
  act(() => {
    namedRow(ONTOLOGY_COMMIT).click();
  });
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
});

it("keeps a pending failed world selection from changing current identity", async () => {
  const api = mockReader();
  await render(api);
  vi.mocked(api.get).mockRejectedValueOnce(new Error("unavailable"));
  await chooseWorld("develop");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(host.textContent).toContain("Could not open this version.");
  await chooseWorld("develop");
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
});

it("retains the selected old version and original cursor when the branch advances or disappears", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships();
  act(() => {
    namedRow(FIX_MESSAGE).click();
  });
  await flush();
  const calls = vi.mocked(api.ancestry).mock.calls.length;
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [{ name: "main", state: stateRef(develop) }]
  });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await flush();
  expect(document.body.textContent).toMatch(/new version/i);
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
  click(LOAD_EARLIER);
  await flush();
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0]).toMatchObject({
    root: stateRef(main),
    cursor: "next-main"
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [{ name: "develop", state: stateRef(develop) }]
  });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(document.body.textContent).toMatch(/no longer exists/i);
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("ignores a late directory from an older disconnected reader", async () => {
  const old = mockReader();
  let finish:
    | ((response: { items: { name: string; state: ReturnType<typeof stateRef> }[] }) => void)
    | undefined;
  vi.mocked(old.branch.list).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  await render(old);
  const oldSignal = vi.mocked(old.branch.list).mock.calls[0]?.[0]?.signal;
  await render(mockReader(), { defaultBranch: "develop", initialState: develop });
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {
    finish?.({ items: [{ name: "main", state: stateRef(genesis) }] });
    await Promise.resolve();
  });
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(host.querySelectorAll(".commit-item")).toHaveLength(0);
});

it("does not reopen a requested world after the user expands another while verification is pending", async () => {
  const api = mockReader();
  await render(api);
  let finish: ((value: ReturnType<typeof resolved>) => void) | undefined;
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  act(() => {
    worldButton("develop").click();
  });
  click("Expand knowledge world: experiment");
  await flush();
  expect(worldToggle("experiment").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  await act(async () => {
    finish?.(resolved(develop));
    await Promise.resolve();
  });
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldToggle("experiment").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(worldToggle("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("false");
});

it("shows a failed directory read and retries without replacing a later confirmed directory", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline"));
  await render(api);
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(0);
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(findButton(WORLD_REFRESH)).toHaveProperty("disabled", false);
  click(WORLD_REFRESH);
  await flush();
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(4);
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline again"));
  click(WORLD_REFRESH);
  await flush();
  expect(host.querySelectorAll(WORLD_SECTION)).toHaveLength(4);
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(host.textContent).toContain("World references may be out of date.");
  expect(findButton("Check again")).toHaveProperty("disabled", false);
});
