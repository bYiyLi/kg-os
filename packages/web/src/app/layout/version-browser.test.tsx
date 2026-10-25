// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EvolutionGetResult } from "@kgos/sdk";

import { i18n } from "../i18n/index.js";
import { stateRef, type VersionReader } from "../../features/version/version-data.js";
import {
  main,
  develop,
  experiment,
  common,
  genesis,
  at,
  ONTOLOGY_COMMIT,
  WORLD_ACTIONS,
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
const FEATURE_WORLD = "feature/search";
const WORLD_SEARCH = "Search knowledge worlds...";
const BACK_TO_WORLDS = "Back to world navigation";
const CURRENT_ATTRIBUTE = "aria-current";
const EXPANDED_ATTRIBUTE = "aria-expanded";
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
  options: { defaultBranch?: string; initialState?: string } = {}
) {
  await act(async () => {
    root.render(<VersionBrowserHarness reader={reader} {...options} />);
    await Promise.resolve();
  });
}

it("shows peer worlds and opens the actual default world without a merged history", async () => {
  const api = mockReader();
  await render(api, { defaultBranch: "develop", initialState: develop });
  expect(host.querySelectorAll(".world-section")).toHaveLength(4);
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(rows()).toHaveLength(2);
  expect(host.textContent).not.toContain(HEAD_MESSAGE);
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(namedRow(ONTOLOGY_COMMIT).textContent).toContain("Latest");
  expect(host.querySelector(".world-picker-trigger")).toBeNull();
  expect(api.tag.list).toHaveBeenCalledOnce();
});

it("expands or collapses one peer world without selecting a version or issuing get", async () => {
  const api = mockReader();
  await render(api);
  act(() => {
    worldButton("develop").click();
  });
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("false");
  expect(worldButton("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(api.get).not.toHaveBeenCalled();
  const region = document.getElementById(
    worldButton("develop").getAttribute("aria-controls") ?? ""
  );
  expect(region?.getAttribute("role")).toBe("region");
  expect(region?.getAttribute("aria-label")).toBe("Version history: develop");
  act(() => {
    worldButton("develop").click();
  });
  expect(rows()).toHaveLength(0);
  expect(worldButton("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("false");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
});

it("does not highlight another world that happens to share the selected head", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [
      { name: "main", state: stateRef(main) },
      { name: "novel", state: stateRef(main) }
    ]
  });
  await render(api, { defaultBranch: "novel" });
  act(() => {
    worldButton("main").click();
  });
  expect(worldButton("novel").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(namedRow(HEAD_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  await chooseWorld("main");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(namedRow(HEAD_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("searches loaded world names without searching versions or silently changing the browse context", async () => {
  const api = mockReader();
  await render(api);
  inputValue(WORLD_SEARCH, "FEATURE/");
  expect(host.querySelectorAll(".world-section")).toHaveLength(1);
  expect(worldButton(FEATURE_WORLD).textContent).toContain(FEATURE_WORLD);
  act(() => {
    worldButton(FEATURE_WORLD).click();
  });
  expect(namedRow("Hybrid search").getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(api.get).not.toHaveBeenCalled();
  await chooseWorld(FEATURE_WORLD);
  expect(worldButton(FEATURE_WORLD).getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  inputValue(WORLD_SEARCH, "no-such-world");
  expect(host.textContent).toContain("No matching knowledge worlds.");
  expect(rows()).toHaveLength(0);
});

it("keeps latest distinct from the historical selection and returns only by explicit action", async () => {
  const api = mockReader();
  await render(api);
  act(() => {
    namedRow(FIX_MESSAGE).click();
  });
  await flush();
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(namedRow(HEAD_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(namedRow(HEAD_MESSAGE).textContent).toContain("Latest");
  expect(host.textContent).toContain("Viewing a historical version");
  click("Back to latest");
  await flush();
  expect(namedRow(HEAD_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(vi.mocked(api.get).mock.calls.at(-1)?.[0]).toEqual({ state: "commit/" + main });
});

it("retains browsing context and expansion while filtering the loaded cross-world union", async () => {
  await render(mockReader());
  await showAcrossWorlds();
  expect(rows()).toHaveLength(6);
  expect(rows().filter((item) => item.textContent.includes(SHARED_MESSAGE))).toHaveLength(1);
  click(CROSS_WORLD_FILTER);
  for (const name of ["develop", "experiment", FEATURE_WORLD])
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
  inputValue("Search loaded versions...", "");
  click(CROSS_WORLD_FILTER);
  click("Clear all");
  click(CROSS_WORLD_FILTER);
  click(BACK_TO_WORLDS);
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("main").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(rows()).toHaveLength(2);
  expect(host.textContent).not.toContain("Select a knowledge world to show versions.");
});

it("continues the expanded world's immutable root through the version relationships view", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships();
  click(LOAD_EARLIER);
  await flush();
  expect(rows()).toHaveLength(3);
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0]).toEqual({
    root: "commit/" + main,
    limit: 20,
    cursor: "next-main"
  });
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal).toBeInstanceOf(AbortSignal);
});

it("does not fake world rows when disconnected and disables refresh", async () => {
  await render(null);
  expect(rows()).toHaveLength(0);
  expect(host.querySelectorAll(".world-section")).toHaveLength(0);
  expect(host.textContent).toContain("Connect to view version history.");
  expect(findButton(WORLD_REFRESH)).toHaveProperty("disabled", true);
});

it("reports a genuinely empty directory without inventing world contents", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({ items: [] });
  await render(api);
  expect(rows()).toHaveLength(0);
  expect(host.textContent).toContain("No knowledge worlds are available.");
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("renders a real commit with no message or parent without inventing a description", async () => {
  const api = mockReader();
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(main),
    items: [{ state: main, committedAt: at, parents: null }] as never
  });
  await render(api);
  expect(rows().some((item) => item.textContent.includes("No version description"))).toBe(true);
});

it("uses meaningful immutable message content while preserving its full original text", async () => {
  const api = mockReader();
  const message = "## 简介\n\n小说创作经验与叙事原则。\n\n## 改动\n\n补充人物动机。";
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(main),
    items: [row(main, message, 0, [])]
  });
  await render(api);
  const item = namedRow("小说创作经验与叙事原则。");
  expect(item.textContent).not.toContain("## 简介");
  expect(item.querySelector(".commit-title")?.getAttribute("title")).toBe(message);
});

it("retries a failed initial directory load and retains the old list on refresh failure", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline"));
  await render(api);
  expect(host.querySelectorAll(".world-section")).toHaveLength(0);
  expect(findButton(WORLD_REFRESH)).toHaveProperty("disabled", false);
  click(WORLD_REFRESH);
  await flush();
  expect(rows()).toHaveLength(2);
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline again"));
  click(WORLD_REFRESH);
  await flush();
  expect(host.textContent).toContain("Could not load version history.");
  expect(rows()).toHaveLength(2);
  click(WORLD_REFRESH);
  await flush();
  expect(host.textContent).not.toContain("Could not load version history.");
});

it("keeps a failed page available for explicit retry without changing its cursor", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships();
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("page timed out"));
  click(LOAD_EARLIER);
  await flush();
  expect(rows()).toHaveLength(2);
  click(LOAD_EARLIER);
  await flush();
  expect(rows()).toHaveLength(3);
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0].cursor).toBe("next-main");
});

it("keeps the selected context when version get fails or resolves to a different immutable state", async () => {
  const api = mockReader();
  await render(api);
  const selected = namedRow(FIX_MESSAGE);
  vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
  act(() => {
    selected.click();
  });
  await flush();
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(host.textContent).toContain("Could not open this version.");
  vi.mocked(api.get).mockResolvedValueOnce(resolved(common));
  act(() => {
    selected.click();
  });
  await flush();
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  act(() => {
    selected.click();
  });
  await flush();
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("does not change browsing world until a clicked version is verified", async () => {
  const api = mockReader();
  await render(api);
  vi.mocked(api.get).mockRejectedValueOnce(new Error("world unavailable"));
  await chooseWorld("develop");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  await chooseWorld("develop");
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("does not reopen a world when its pending version resolves after another world was expanded", async () => {
  const api = mockReader();
  let finishSlow: ((data: EvolutionGetResult) => void) | undefined;
  await render(api);
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSlow = resolve;
      })
  );
  await chooseWorld("experiment");
  act(() => {
    worldButton("develop").click();
  });
  await act(async () => {
    finishSlow?.(resolved(experiment));
    await Promise.resolve();
  });
  expect(worldButton("experiment").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(worldButton("develop").getAttribute(EXPANDED_ATTRIBUTE)).toBe("true");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
});

it("ignores a late world version response after a newer choice has succeeded", async () => {
  const api = mockReader();
  let finishSlow: ((data: EvolutionGetResult) => void) | undefined;
  await render(api);
  vi.mocked(api.get).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishSlow = resolve;
      })
  );
  await chooseWorld("experiment");
  await chooseWorld("develop");
  await act(async () => {
    finishSlow?.(resolved(experiment));
    await Promise.resolve();
  });
  expect(worldButton("develop").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("opens the expanded world's DAG without selecting that world or changing its root", async () => {
  const api = mockReader();
  await render(api);
  act(() => {
    worldButton("develop").click();
  });
  await openRelationships();
  expect(document.body.querySelector(".version-dag-world")?.textContent).toBe("develop");
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(api.get).not.toHaveBeenCalled();
});

it("does not reopen an old DAG after disconnect and reconnect", async () => {
  const api = mockReader();
  await render(api);
  await openRelationships();
  expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
  await render(null);
  await render(api);
  expect(document.body.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps advanced filters after their popover closes on Escape", async () => {
  await render(mockReader());
  await showAcrossWorlds();
  const trigger = click(CROSS_WORLD_FILTER);
  act(() => {
    checkbox("develop").click();
  });
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  await flush();
  expect(trigger.getAttribute(EXPANDED_ATTRIBUTE)).toBe("false");
  click(CROSS_WORLD_FILTER);
  expect(checkbox("develop").getAttribute("aria-checked")).toBe("false");
});

it("observes head movement without following it or rewriting the old paging root", async () => {
  const api = mockReader();
  await render(api);
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
  expect(host.textContent).toMatch(/new version/i);
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(api.ancestry).toHaveBeenCalledTimes(calls);
  await openRelationships();
  click(LOAD_EARLIER);
  await flush();
  expect(vi.mocked(api.ancestry).mock.calls.at(-1)?.[0].root).toBe("commit/" + main);
});

it("retains a removed world's name and readable pinned history without falling back", async () => {
  const api = mockReader();
  await render(api);
  act(() => {
    namedRow(FIX_MESSAGE).click();
  });
  await flush();
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [{ name: "develop", state: stateRef(develop) }]
  });
  act(() => {
    window.dispatchEvent(new Event("focus"));
  });
  await flush();
  expect(worldButton("main").getAttribute(CURRENT_ATTRIBUTE)).toBe("page");
  expect(host.textContent).toMatch(/no longer exists/i);
  expect(namedRow(FIX_MESSAGE).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  click(WORLD_ACTIONS);
  expect(findButton("View version relationships").getAttribute("aria-disabled")).not.toBe("true");
});

it("does not replace a new connection with a late old directory response", async () => {
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
  expect(namedRow(ONTOLOGY_COMMIT).getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});
