// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { EvolutionAncestryResult } from "@kgos/sdk";

import { i18n } from "../i18n/index.js";
import { stateRef } from "../../features/version/version-data.js";
import type { VersionReader } from "../../features/version/version-data.js";
import {
  main,
  row,
  mockReader,
  VersionBrowserHarness,
  WORLD_REFRESH,
  WORLD_ACTIONS,
  showAcrossWorlds,
  findButton,
  click,
  inputValue,
  rows,
  flush
} from "../../../test/version-browser-fixture.js";

const SCROLL_CLASS = "world-directory-scroll";
const MORE_CLASS = "version-load-more";
const MORE_LABEL = "Load earlier versions";
const STALLED_MESSAGE = "No additional versions were received. Refresh to try again.";
const ERROR_MESSAGE = "Could not load version history.";
const WORLD_SEARCH = "Search knowledge worlds...";
const geometry = { height: 1000 };

class ControlledResizeObserver implements ResizeObserver {
  static active = new Set<ControlledResizeObserver>();
  readonly targets = new Set<Element>();
  constructor(private readonly callback: ResizeObserverCallback) {
    ControlledResizeObserver.active.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    ControlledResizeObserver.active.delete(this);
    this.targets.clear();
  }
  static notify() {
    for (const observer of [...ControlledResizeObserver.active])
      if (observer.targets.size > 0) observer.callback([], observer);
  }
}

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  geometry.height = 1000;
  ControlledResizeObserver.active.clear();
  vi.stubGlobal("ResizeObserver", ControlledResizeObserver);
  vi.spyOn(Element.prototype, "clientHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains(SCROLL_CLASS) ? geometry.height : 0;
  });
  vi.spyOn(Element.prototype, "scrollHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    if (!this.classList.contains(SCROLL_CLASS)) return 0;
    const more = this.querySelector("." + MORE_CLASS) === null ? 0 : 24;
    // Model visible world headers, fixed-height version rows, and the inline action.
    return 40 + this.querySelectorAll(".commit-row").length * 48 + more;
  });
  vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(function (
    this: HTMLElement
  ) {
    return this.classList.contains(MORE_CLASS) ? 24 : 0;
  });
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
  vi.unstubAllGlobals();
});

function paginatedReader(total: number) {
  const api = mockReader();
  let behavior: "normal" | "repeat" | "failure" = "normal";
  const states = Array.from({ length: total }, (_, index) =>
    index === 0 ? main : index.toString(16).padStart(64, "0")
  );
  const page = (offset: number): EvolutionAncestryResult => ({
    root: stateRef(main),
    items: states
      .slice(offset, offset + 1)
      .map((state, index) =>
        row(
          state,
          "Version " + String(offset + index + 1),
          -offset,
          states.slice(offset + 1, offset + 2)
        )
      ),
    ...(offset + 1 < total ? { cursor: "page-" + String(offset + 1) } : {})
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [{ name: "main", state: stateRef(main) }]
  });
  vi.mocked(api.tag.list).mockResolvedValue({ items: [] });
  vi.mocked(api.ancestry).mockImplementation((request) => {
    if (request.cursor !== undefined && behavior === "failure")
      return Promise.reject(new Error("offline"));
    if (request.cursor !== undefined && behavior === "repeat") return Promise.resolve(page(0));
    return Promise.resolve(page(Number(request.cursor?.slice("page-".length) ?? 0)));
  });
  return {
    api,
    page,
    behavior: (next: typeof behavior) => {
      behavior = next;
    }
  };
}

async function render(reader: VersionReader) {
  await act(async () => {
    root.render(<VersionBrowserHarness reader={reader} />);
    await Promise.resolve();
  });
}

async function resize(height = geometry.height) {
  geometry.height = height;
  await act(async () => {
    ControlledResizeObserver.notify();
    await Promise.resolve();
  });
}

function expectPinnedPages(api: VersionReader, cursors: (string | undefined)[]) {
  expect(vi.mocked(api.ancestry).mock.calls.map(([request]) => request.cursor)).toEqual(cursors);
  for (const [request] of vi.mocked(api.ancestry).mock.calls)
    expect(request).toMatchObject({ root: "commit/" + main, limit: 20 });
  expect(api.get).not.toHaveBeenCalled();
}

it("fills spare navigation height with actual pinned pages until history is exhausted", async () => {
  const { api } = paginatedReader(3);
  await render(api);
  expect(rows()).toHaveLength(3);
  expectPinnedPages(api, [undefined, "page-1", "page-2"]);
  expect(host.querySelector("." + MORE_CLASS)).toBeNull();
  expect(host.querySelector("." + SCROLL_CLASS)?.clientHeight).toBe(1000);
  expect(host.querySelector("." + SCROLL_CLASS)?.scrollHeight).toBe(184);
  expect(ControlledResizeObserver.active.size).toBeGreaterThan(0);
  await resize();
  expect(api.ancestry).toHaveBeenCalledTimes(3);
});

it("stops at overflow and appends only by the inline action while preserving scroll position", async () => {
  geometry.height = 120;
  const { api } = paginatedReader(5);
  await render(api);
  expect(rows()).toHaveLength(2);
  const scroll = host.querySelector<HTMLElement>("." + SCROLL_CLASS);
  expect(scroll).not.toBeNull();
  expect(scroll?.scrollHeight).toBeGreaterThan(scroll?.clientHeight ?? 0);
  if (scroll === null) throw new Error("Missing navigation scroll container");
  scroll.scrollTop = 32;
  act(() => {
    scroll.dispatchEvent(new Event("scroll"));
  });
  await resize();
  expect(api.ancestry).toHaveBeenCalledTimes(2);
  expect(findButton(MORE_LABEL).closest(".history-region")).not.toBeNull();
  click(MORE_LABEL);
  await flush();
  expect(rows()).toHaveLength(3);
  expect(scroll.scrollTop).toBe(32);
  expectPinnedPages(api, [undefined, "page-1", "page-2"]);
});

it("fills newly available height after ResizeObserver notification and stops again at overflow", async () => {
  geometry.height = 80;
  const { api } = paginatedReader(8);
  await render(api);
  expect(rows()).toHaveLength(1);
  await resize(240);
  expect(rows()).toHaveLength(5);
  expectPinnedPages(api, [undefined, "page-1", "page-2", "page-3", "page-4"]);
  await resize();
  expect(api.ancestry).toHaveBeenCalledTimes(5);
  expect(findButton(MORE_LABEL)).toHaveProperty("disabled", false);
});

it("does not issue duplicate continuation reads while the same page is still pending", async () => {
  const { api, page } = paginatedReader(2);
  let finish: ((result: EvolutionAncestryResult) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementation((request) =>
    request.cursor === undefined
      ? Promise.resolve(page(0))
      : new Promise((resolve) => {
          finish = resolve;
        })
  );
  await render(api);
  expect(api.ancestry).toHaveBeenCalledTimes(2);
  await resize();
  await resize(1200);
  expect(api.ancestry).toHaveBeenCalledTimes(2);
  await act(async () => {
    finish?.(page(1));
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(2);
  expectPinnedPages(api, [undefined, "page-1"]);
});

it("stops a non-progressing cursor and allows an explicit refresh to resume filling", async () => {
  const fixture = paginatedReader(3);
  fixture.behavior("repeat");
  await render(fixture.api);
  expect(rows()).toHaveLength(1);
  expect(host.textContent).toContain(STALLED_MESSAGE);
  expectPinnedPages(fixture.api, [undefined, "page-1"]);
  await resize();
  await resize(1200);
  expect(fixture.api.ancestry).toHaveBeenCalledTimes(2);
  fixture.behavior("normal");
  click(WORLD_REFRESH);
  await flush();
  expect(rows()).toHaveLength(3);
  expect(host.textContent).not.toContain(STALLED_MESSAGE);
  expectPinnedPages(fixture.api, [undefined, "page-1", undefined, "page-1", "page-2"]);
});

it("retains loaded versions after a page failure without automatic retries and recovers on refresh", async () => {
  const fixture = paginatedReader(3);
  fixture.behavior("failure");
  await render(fixture.api);
  expect(rows()).toHaveLength(1);
  expect(host.textContent).toContain(ERROR_MESSAGE);
  await resize();
  await resize(1200);
  expectPinnedPages(fixture.api, [undefined, "page-1"]);
  fixture.behavior("normal");
  click(WORLD_REFRESH);
  await flush();
  expect(rows()).toHaveLength(3);
  expect(host.textContent).not.toContain(ERROR_MESSAGE);
  expectPinnedPages(fixture.api, [undefined, "page-1", undefined, "page-1", "page-2"]);
});

it.each(["aria-hidden", "inert", "visibility", "zero-height"])(
  "defers continuation for %s navigation until it becomes measurable and visible",
  async (hidden) => {
    if (hidden === "visibility") host.style.visibility = "hidden";
    else if (hidden === "zero-height") geometry.height = 0;
    else host.setAttribute(hidden, "true");
    const { api } = paginatedReader(3);
    await render(api);
    expect(rows()).toHaveLength(1);
    expectPinnedPages(api, [undefined]);
    await resize();
    expect(api.ancestry).toHaveBeenCalledOnce();
    host.removeAttribute("aria-hidden");
    host.removeAttribute("inert");
    host.style.visibility = "visible";
    await resize(1000);
    expect(rows()).toHaveLength(3);
    expectPinnedPages(api, [undefined, "page-1", "page-2"]);
  }
);

it("fills on a window resize when ResizeObserver is unavailable", async () => {
  vi.stubGlobal("ResizeObserver", undefined);
  geometry.height = 80;
  const { api } = paginatedReader(3);
  await render(api);
  expect(rows()).toHaveLength(1);
  geometry.height = 1000;
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(3);
  expectPinnedPages(api, [undefined, "page-1", "page-2"]);
});

it("does not continue a history hidden by world search and resumes when its world is shown", async () => {
  geometry.height = 80;
  const { api } = paginatedReader(3);
  await render(api);
  inputValue(WORLD_SEARCH, "no-such-world");
  await resize(1000);
  expect(rows()).toHaveLength(0);
  expectPinnedPages(api, [undefined]);
  inputValue(WORLD_SEARCH, "");
  await flush();
  expect(rows()).toHaveLength(3);
  expectPinnedPages(api, [undefined, "page-1", "page-2"]);
});

it("retries the original pinned page after pending auto-fill is canceled by a mode round trip", async () => {
  const { api, page } = paginatedReader(3);
  let finishOld: ((result: EvolutionAncestryResult) => void) | undefined;
  let continuations = 0;
  vi.mocked(api.ancestry).mockImplementation((request) => {
    if (request.cursor === undefined) return Promise.resolve(page(0));
    if (continuations++ === 0)
      return new Promise((resolve) => {
        finishOld = resolve;
      });
    return Promise.resolve(page(Number(request.cursor.slice("page-".length))));
  });
  await render(api);
  expect(rows()).toHaveLength(1);
  expect(api.ancestry).toHaveBeenCalledTimes(2);
  const signal = vi.mocked(api.ancestry).mock.calls.at(-1)?.[1]?.signal;
  await showAcrossWorlds();
  expect(signal?.aborted).toBe(true);
  click(WORLD_ACTIONS);
  click("Back to world navigation");
  await flush();
  expect(rows()).toHaveLength(3);
  expect(host.textContent).not.toContain(STALLED_MESSAGE);
  expectPinnedPages(api, [undefined, "page-1", "page-1", "page-2"]);
  await act(async () => {
    finishOld?.(page(1));
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(3);
});
