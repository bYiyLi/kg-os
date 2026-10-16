// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EvolutionGetResult } from "@kgos/sdk";

import { i18n } from "../i18n/index.js";
import { VersionTree as VersionBrowser } from "../../features/version/version-browser.js";
import { stateRef, type VersionReader } from "../../features/version/version-data.js";
import { useVersionHistory } from "../../features/version/use-version-history.js";

const main = "a".repeat(64);
const develop = "b".repeat(64);
const experiment = "c".repeat(64);
const feature = "d".repeat(64);
const common = "f".repeat(64);
const first = "e".repeat(64);
const genesis = "0".repeat(64);
const at = Date.now() * 1000;
const ONTOLOGY_COMMIT = "Update ontology";
const BRANCH_FILTER_LABEL = "Filter branches";
const PRESSED_ATTRIBUTE = "aria-pressed";
const SHARED_MESSAGE = "Shared commit";

function row(state: string, message: string, offset: number, parents: string[]) {
  return { state, message, committedAt: at + offset, parents };
}

function mockReader(): VersionReader {
  return {
    branch: {
      list: vi.fn().mockResolvedValue({
        items: [
          { name: "main", state: main },
          { name: "develop", state: develop },
          { name: "experiment", state: experiment },
          { name: "feature/search", state: feature }
        ]
      })
    },
    tag: { list: vi.fn().mockResolvedValue({ items: [{ name: "v1", state: common }] }) },
    ancestry: vi.fn().mockImplementation((request: { root: string; cursor?: string }) => {
      if (request.root === "commit/" + main) {
        return Promise.resolve(
          request.cursor === undefined
            ? {
                root: main,
                items: [
                  row(main, "Merge experiment", 4000, [first, experiment]),
                  row(first, "Fix properties", 500, [common])
                ],
                cursor: "next-main"
              }
            : { root: main, items: [row(genesis, "Initial knowledge", -4000, [])] }
        );
      }
      if (request.root === "commit/" + develop) {
        return Promise.resolve({
          root: develop,
          items: [row(develop, ONTOLOGY_COMMIT, 3000, [common]), row(common, SHARED_MESSAGE, 0, [])]
        });
      }
      if (request.root === "commit/" + experiment) {
        return Promise.resolve({
          root: experiment,
          items: [row(experiment, "Experiment", 2000, [common]), row(common, SHARED_MESSAGE, 0, [])]
        });
      }
      return Promise.resolve({
        root: feature,
        items: [row(feature, "Hybrid search", 1000, [common]), row(common, SHARED_MESSAGE, 0, [])]
      });
    }),
    get: vi.fn().mockImplementation((request: { state: string }) =>
      Promise.resolve({
        state: request.state.slice(7),
        parents: [],
        committedAt: at,
        consistency: { status: "valid", issues: [] },
        hasData: false,
        data: null
      })
    )
  };
}

function Harness({ reader }: { reader: VersionReader | null }) {
  const history = useVersionHistory(reader, main);
  return (
    <I18nextProvider i18n={i18n}>
      <VersionBrowser history={history} />
    </I18nextProvider>
  );
}

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

async function render(reader: VersionReader | null) {
  await act(async () => {
    root.render(<Harness reader={reader} />);
    await Promise.resolve();
  });
}

function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (element) => element.getAttribute("aria-label") === text || element.textContent.trim() === text
  );
  if (button === undefined) throw new Error("Missing button " + text);
  act(() => {
    button.click();
  });
  return button;
}

function checkbox(name: string) {
  const input = [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')].find(
    (item) => item.parentElement?.textContent.trim() === name
  );
  if (input === undefined) throw new Error("Missing checkbox: " + name);
  return input;
}

function rows() {
  return [...host.querySelectorAll<HTMLButtonElement>(".commit-row")];
}

function resolved(state: string): EvolutionGetResult {
  return {
    state: stateRef(state),
    parents: [],
    committedAt: at,
    consistency: { status: "valid", issues: [] },
    hasData: false,
    data: null
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

it("shows real branch heads and deduplicates shared commits", async () => {
  const api = mockReader();
  await render(api);
  expect(rows()).toHaveLength(6);
  expect(rows().filter((r) => r.textContent.includes(SHARED_MESSAGE))).toHaveLength(1);
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("4/4");
  expect(
    rows()
      .find((r) => r.textContent.includes("Merge experiment"))
      ?.getAttribute(PRESSED_ATTRIBUTE)
  ).toBe("true");
  expect(host.textContent).toContain("v1");
  expect(api.ancestry).toHaveBeenCalledTimes(4);
  expect(api.tag.list).toHaveBeenCalledOnce();
});

it("filters branches and searches only the loaded union", async () => {
  await render(mockReader());
  click(BRANCH_FILTER_LABEL);
  act(() => {
    checkbox("develop").click();
  });
  expect(rows()).toHaveLength(5);
  act(() => {
    checkbox("experiment").click();
  });
  act(() => {
    checkbox("feature/search").click();
  });
  expect(rows()).toHaveLength(2);
  act(() => {
    checkbox("main").click();
  });
  expect(rows()).toHaveLength(0);
  expect(host.textContent).toContain("Select a branch to show commits.");
  click("Select all");
  expect(rows()).toHaveLength(6);
  click(BRANCH_FILTER_LABEL);
  const input = host.querySelector<HTMLInputElement>('input[type="search"]');
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (input === null || descriptor?.set === undefined) throw new Error("Missing search input");
  act(() => {
    descriptor.set?.call(input, "ONTOLOGY");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(rows()).toHaveLength(1);
  expect(rows()[0]?.textContent).toContain(ONTOLOGY_COMMIT);
});

it("continues immutable ancestry pagination and validates selection via get", async () => {
  const api = mockReader();
  await render(api);
  click("Load more");
  await act(async () => {
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(7);
  const pageCall = vi.mocked(api.ancestry).mock.calls.at(-1);
  expect(pageCall?.[0]).toEqual({ root: "commit/" + main, limit: 20, cursor: "next-main" });
  expect(pageCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  const selected = rows().find((row) => row.textContent.includes(ONTOLOGY_COMMIT));
  if (selected === undefined) throw new Error("Missing commit row");
  act(() => {
    selected.click();
  });
  await act(async () => {
    await Promise.resolve();
  });
  const getCall = vi.mocked(api.get).mock.calls.at(-1);
  expect(getCall?.[0]).toEqual({ state: "commit/" + develop });
  expect(getCall?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("does not fake history when disconnected and keeps an accessible refresh action", async () => {
  await render(null);
  expect(rows()).toHaveLength(0);
  expect(host.textContent).toContain("Connect to view version history.");
  expect(host.querySelector<HTMLButtonElement>(".version-refresh-button")?.disabled).toBe(true);
});

it("distinguishes an empty repository from a disconnected session", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockResolvedValueOnce({ items: [] });
  await render(api);
  expect(host.textContent).toContain("No branches are available.");
  expect(rows()).toHaveLength(0);
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("0/0");
  expect(api.ancestry).not.toHaveBeenCalled();
});

it("renders an immutable commit that has no message or parent", async () => {
  const api = mockReader();
  vi.mocked(api.ancestry).mockResolvedValueOnce({
    root: stateRef(main),
    items: [{ state: main, committedAt: at, parents: null }] as never
  });
  await render(api);
  expect(host.textContent).toContain("No commit message");
  expect(rows().some((r) => r.textContent.includes("No commit message"))).toBe(true);
});

it("retries a failed initial load and retains the previous history on refresh failure", async () => {
  const api = mockReader();
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline"));
  await render(api);
  expect(rows()).toHaveLength(0);
  expect(host.textContent).toContain("Could not load version history.");
  click("Refresh versions");
  await flush();
  expect(rows()).toHaveLength(6);
  vi.mocked(api.branch.list).mockRejectedValueOnce(new Error("offline again"));
  click("Refresh versions");
  await flush();
  expect(host.textContent).toContain("Could not load version history.");
  expect(rows()).toHaveLength(6);
  click("Refresh versions");
  await flush();
  expect(rows()).toHaveLength(6);
  expect(host.textContent).not.toContain("Could not load version history.");
});

it("preserves already loaded commits after a failed next page", async () => {
  const api = mockReader();
  await render(api);
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("page timed out"));
  click("Load more");
  await flush();
  expect(rows()).toHaveLength(6);
  expect(host.textContent).toContain("Could not load version history.");
  click("Load more");
  await flush();
  expect(rows()).toHaveLength(7);
});

it("keeps the selected commit on get failure or mismatched resolution", async () => {
  const api = mockReader();
  await render(api);
  vi.mocked(api.get).mockRejectedValueOnce(new Error("offline"));
  const selected = rows().find((item) => item.textContent.includes(ONTOLOGY_COMMIT));
  if (selected === undefined) throw new Error("Missing history row");
  act(() => {
    selected.click();
  });
  await flush();
  expect(host.textContent).toContain("Could not open this version.");
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");

  vi.mocked(api.get).mockResolvedValueOnce(resolved(common));
  act(() => {
    selected.click();
  });
  await flush();
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  expect(host.textContent).toContain("Could not open this version.");
  act(() => {
    selected.click();
  });
  await flush();
  expect(selected.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("discards a delayed get response after the user selects another commit", async () => {
  const api = mockReader();
  let finishSlow: ((data: EvolutionGetResult) => void) | undefined;
  const slow = new Promise<EvolutionGetResult>((resolve) => {
    finishSlow = resolve;
  });
  await render(api);
  vi.mocked(api.get).mockImplementationOnce(() => slow);
  const oldRow = rows().find((item) => item.textContent.includes("Experiment"));
  const newRow = rows().find((item) => item.textContent.includes(ONTOLOGY_COMMIT));
  if (oldRow === undefined || newRow === undefined) throw new Error("Missing history rows");
  act(() => {
    oldRow.click();
    newRow.click();
  });
  await flush();
  expect(newRow.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
  expect(oldRow.getAttribute(PRESSED_ATTRIBUTE)).toBe("false");
  await act(async () => {
    finishSlow?.(resolved(experiment));
    await Promise.resolve();
  });
  expect(newRow.getAttribute(PRESSED_ATTRIBUTE)).toBe("true");
});

it("closes branch picker on outside interaction and Escape without clearing filters", async () => {
  await render(mockReader());
  const trigger = click(BRANCH_FILTER_LABEL);
  act(() => {
    checkbox("develop").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  act(() => {
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  click(BRANCH_FILTER_LABEL);
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(trigger);
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("3/4");
  click(BRANCH_FILTER_LABEL);
  click("Select all");
  click("Clear all");
  expect(rows()).toHaveLength(0);
  click("Select all");
  expect(rows()).toHaveLength(6);
});

it("does not replace a new connection with a late old connection response", async () => {
  const old = mockReader();
  let resolveOld:
    | ((response: { items: { name: string; state: ReturnType<typeof stateRef> }[] }) => void)
    | undefined;
  const pending = new Promise<{ items: { name: string; state: ReturnType<typeof stateRef> }[] }>(
    (resolve) => {
      resolveOld = resolve;
    }
  );
  vi.mocked(old.branch.list).mockImplementationOnce(() => pending);
  await render(old);
  expect(host.textContent).toContain("Loading history...");
  const oldSignal = vi.mocked(old.branch.list).mock.calls[0]?.[0]?.signal;
  const next = mockReader();
  await render(next);
  expect(oldSignal?.aborted).toBe(true);
  expect(rows()).toHaveLength(6);
  await act(async () => {
    resolveOld?.({ items: [{ name: "main", state: stateRef(genesis) }] });
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(6);
  expect(host.querySelector(".version-branch-count")?.textContent).toBe("4/4");
});
