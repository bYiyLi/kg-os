// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { ThemeToggle } from "./theme-toggle.js";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

it("does not reselect the active appearance and emits a changed preference", () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const onSelect = vi.fn();
  act(() => {
    root?.render(<ThemeToggle preference="system" onSelect={onSelect} />);
  });
  const system = container.querySelector<HTMLButtonElement>('[aria-label="versions.system"]');
  const light = container.querySelector<HTMLButtonElement>('[aria-label="versions.light"]');
  expect(system).not.toBeNull();
  expect(light).not.toBeNull();
  act(() => system?.click());
  expect(onSelect).not.toHaveBeenCalled();
  act(() => light?.click());
  expect(onSelect).toHaveBeenCalledExactlyOnceWith("light");
});
