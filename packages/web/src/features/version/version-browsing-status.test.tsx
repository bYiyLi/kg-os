// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import { fixture, HEAD, LEFT, RIGHT } from "../../../test/version-dag-fixture.js";
import { UiProvider } from "../../shared/ui/ui-provider.js";
import type { VersionHistory } from "./use-version-history.js";
import { VersionBrowsingStatus } from "./version-browsing-status.js";
import { VersionContextNotice } from "./version-controls.js";

let host: HTMLDivElement;
let root: Root;

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
});

function render(history: VersionHistory, sidebar = false) {
  act(() => {
    root.render(
      <TranslationProvider>
        <UiProvider>
          {sidebar ? (
            <VersionContextNotice history={history} />
          ) : (
            <VersionBrowsingStatus history={history} />
          )}
        </UiProvider>
      </TranslationProvider>
    );
  });
}

function button(name: string): HTMLButtonElement {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (element) => element.textContent.trim() === name
  );
  if (result === undefined) throw new Error("Missing button " + name);
  return result;
}

it("keeps the confirmed version while checking stale world references", () => {
  const history = fixture({ refsError: true });
  render(history);
  expect(host.querySelector("code")?.title).toBe(LEFT);
  expect(host.textContent).toContain("World references may be out of date.");
  act(() => {
    button("Check again").click();
  });
  expect(history.checkRefs).toHaveBeenCalledOnce();
  render({ ...history, checkingRefs: true });
  expect(button("Check again").disabled).toBe(true);
  act(() => {
    button("Check again").click();
  });
  expect(history.checkRefs).toHaveBeenCalledOnce();
  expect(host.querySelector("code")?.title).toBe(LEFT);
});

it("keeps a deleted world's pinned version without offering to follow its missing head", () => {
  render(fixture({ worldMissing: true, refsError: true, worldHead: null }));
  expect(host.querySelector("code")?.title).toBe(LEFT);
  expect(host.textContent).toContain("This knowledge world no longer exists.");
  expect(host.querySelector("button")).toBeNull();
});

it("offers the observed new version without replacing the current version before selection", () => {
  const history = fixture({ hasNewVersion: true });
  render(history);
  expect(host.querySelector("code")?.title).toBe(LEFT);
  expect(host.textContent).toContain("A new version is available");
  expect(button("Back to latest").disabled).toBe(false);
  act(() => {
    button("Back to latest").click();
  });
  expect(history.returnToLatest).toHaveBeenCalledOnce();
  expect(host.querySelector("code")?.title).toBe(LEFT);
});

it("labels an explicit snapshot without inventing a browsing world or a latest-version action", () => {
  render(fixture({ currentWorld: null, worldHead: null }));
  expect(host.querySelector("strong")?.textContent).toBe("Snapshot");
  expect(host.querySelector("code")?.title).toBe(LEFT);
  expect(host.textContent).toContain("You are viewing a fixed version.");
  expect(host.querySelector("button")).toBeNull();
});

it.each([{ available: false }, { ready: false }, { selectedCommit: null }])(
  "does not claim a current version when its context is unavailable (%o)",
  (overrides) => {
    render(fixture(overrides));
    expect(host.querySelector("section")).toBeNull();
  }
);

it("shows the confirmed latest identity without offering a redundant request", () => {
  const history = fixture({ selectedCommit: HEAD });
  render(history);
  expect(host.querySelector("code")?.title).toBe(HEAD);
  expect(host.textContent).toContain("Latest version");
  expect(button("Already at latest").disabled).toBe(true);
  act(() => {
    button("Already at latest").click();
  });
  expect(history.returnToLatest).not.toHaveBeenCalled();
});

it.each([
  { hasNewVersion: false, label: "Viewing a historical version" },
  { hasNewVersion: true, label: "A new version is available" }
])("keeps the sidebar's confirmed version visible: $label", ({ hasNewVersion, label }) => {
  render(fixture({ hasNewVersion }), true);
  expect(host.querySelector('[role="status"]')?.textContent).toContain(label);
  const hash = host.querySelector<HTMLElement>(".version-context-hash");
  expect(hash?.textContent).toBe("bbbbbbb");
  expect(hash?.title).toBe(LEFT);
});

it.each([
  { switchingWorld: "another-world", message: "Switching to another-world · ccccccc..." },
  { switchingWorld: null, message: "Switching to ccccccc..." }
])(
  "makes the sidebar's pending target explicit ($switchingWorld)",
  ({ switchingWorld, message }) => {
    const history = fixture();
    render(history, true);
    render({ ...history, selectingCommit: RIGHT, switchingWorld }, true);
    expect(host.querySelector('[role="status"]')?.textContent).toBe(message);
    expect(history.selectCommit).not.toHaveBeenCalled();
    expect(history.selectWorldCommit).not.toHaveBeenCalled();
    render({ ...history, selectionError: true }, true);
    expect(host.querySelector(".version-context-hash")?.textContent).toBe("bbbbbbb");
    expect(host.querySelector<HTMLElement>(".version-context-hash")?.title).toBe(LEFT);
    expect(host.textContent).not.toContain("ccccccc");
  }
);
