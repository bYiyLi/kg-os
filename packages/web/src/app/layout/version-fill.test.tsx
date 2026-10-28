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
  findButton,
  click,
  inputValue,
  rows,
  flush,
  openRelationships
} from "../../../test/version-browser-fixture.js";

const MORE_LABEL = "Load earlier versions";
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

function paginatedReader(total: number) {
  const api = mockReader();
  const states = Array.from({ length: total }, (_, index) =>
    index === 0 ? main : index.toString(16).padStart(64, "0")
  );
  const page = (offset: number): EvolutionAncestryResult => ({
    root: stateRef(main),
    items: [
      row(
        states[offset] ?? main,
        "Version " + String(offset + 1),
        -offset,
        states.slice(offset + 1, offset + 2)
      )
    ],
    ...(offset + 1 < total ? { cursor: "page-" + String(offset + 1) } : {})
  });
  vi.mocked(api.branch.list).mockResolvedValue({
    items: [{ name: "main", state: stateRef(main) }]
  });
  vi.mocked(api.tag.list).mockResolvedValue({ items: [] });
  vi.mocked(api.ancestry).mockImplementation((request) =>
    Promise.resolve(page(Number(request.cursor?.slice("page-".length) ?? 0)))
  );
  return { api, page };
}

async function render(reader: VersionReader) {
  await act(async () => {
    root.render(<VersionBrowserHarness reader={reader} />);
    await Promise.resolve();
  });
}

function expectPages(api: VersionReader, cursors: (string | undefined)[]) {
  expect(vi.mocked(api.ancestry).mock.calls.map(([request]) => request.cursor)).toEqual(cursors);
  for (const [request] of vi.mocked(api.ancestry).mock.calls)
    expect(request).toMatchObject({ root: stateRef(main), limit: 20 });
  expect(api.get).not.toHaveBeenCalled();
}

it("does not prefetch or auto-fill history when the domain navigation is rendered or resized", async () => {
  const { api } = paginatedReader(3);
  await render(api);
  expect(host.querySelector('[aria-label="Domains: main"]')?.textContent).toContain("Knowledge");
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await flush();
  inputValue("Search knowledge worlds...", "no-world");
  inputValue("Search knowledge worlds...", "");
  await flush();
  expect(api.ancestry).not.toHaveBeenCalled();
  expect(rows()).toHaveLength(0);
});

it("opens one bounded history page and appends only after the explicit action", async () => {
  const { api } = paginatedReader(3);
  await render(api);
  await openRelationships();
  expect(rows()).toHaveLength(1);
  expectPages(api, [undefined]);
  const viewport = document.body.querySelector<HTMLElement>(".version-dag-viewport");
  act(() => {
    if (viewport !== null) {
      viewport.scrollTop = 25;
      viewport.dispatchEvent(new Event("scroll"));
    }
    window.dispatchEvent(new Event("resize"));
  });
  await flush();
  expectPages(api, [undefined]);
  click(MORE_LABEL);
  await flush();
  expect(rows()).toHaveLength(2);
  expectPages(api, [undefined, "page-1"]);
  expect(host.querySelectorAll(".commit-item")).toHaveLength(0);
  click(MORE_LABEL);
  await flush();
  expectPages(api, [undefined, "page-1", "page-2"]);
  expect(document.body.querySelector(".version-dag-footer")?.textContent).toContain(
    "Earliest version reached"
  );
  expect(document.body.querySelector(".version-dag-footer button")).toBeNull();
});

it("prevents duplicate continuation requests while the same page is pending", async () => {
  const { api, page } = paginatedReader(2);
  let finish: ((value: EvolutionAncestryResult) => void) | undefined;
  vi.mocked(api.ancestry).mockImplementation((request) =>
    request.cursor === undefined
      ? Promise.resolve(page(0))
      : new Promise((resolve) => {
          finish = resolve;
        })
  );
  await render(api);
  await openRelationships();
  click(MORE_LABEL);
  await flush();
  const pendingButton = findButton("Loading history...");
  expect(pendingButton).toHaveProperty("disabled", true);
  act(() => {
    pendingButton.click();
    window.dispatchEvent(new Event("resize"));
  });
  await flush();
  expectPages(api, [undefined, "page-1"]);
  await act(async () => {
    finish?.(page(1));
    await Promise.resolve();
  });
  expect(rows()).toHaveLength(2);
});

it("retains loaded versions after a failed continuation and retries the same pinned cursor", async () => {
  const { api } = paginatedReader(3);
  await render(api);
  await openRelationships();
  vi.mocked(api.ancestry).mockRejectedValueOnce(new Error("offline"));
  click(MORE_LABEL);
  await flush();
  expect(rows()).toHaveLength(1);
  expect(document.body.textContent).toContain("Could not load version history.");
  await flush();
  expectPages(api, [undefined, "page-1"]);
  click(MORE_LABEL);
  await flush();
  expect(rows()).toHaveLength(2);
  expectPages(api, [undefined, "page-1", "page-1"]);
});

it("reuses the history cache when reopening without auto-loading the remainder", async () => {
  const { api } = paginatedReader(3);
  await render(api);
  await openRelationships();
  click(MORE_LABEL);
  await flush();
  click("Close version relationships");
  await flush();
  expect(rows()).toHaveLength(0);
  await openRelationships();
  expect(rows()).toHaveLength(2);
  expectPages(api, [undefined, "page-1"]);
});
