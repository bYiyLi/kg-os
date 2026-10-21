// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import {
  readThemePreference,
  THEME_STORAGE_KEY,
  useThemePreference
} from "./use-theme-preference.js";
import type { Theme, ThemePreference } from "./use-theme-preference.js";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root !== undefined) {
    act(() => {
      root?.unmount();
    });
  }
  container?.remove();
  root = undefined;
  container = undefined;
  localStorage.clear();
  vi.unstubAllGlobals();
});

it("treats missing, invalid and inaccessible saved appearances as automatic", () => {
  expect(readThemePreference(null)).toBe("system");
  expect(readThemePreference({ getItem: () => "light" })).toBe("light");
  expect(readThemePreference({ getItem: () => "dark" })).toBe("dark");
  expect(readThemePreference({ getItem: () => "system" })).toBe("system");
  expect(
    readThemePreference({
      getItem() {
        throw new Error("Storage blocked");
      }
    })
  ).toBe("system");
});

it("follows live system changes, remembers a manual choice, and can resume automatic mode", () => {
  let systemIsDark = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    get matches() {
      return systemIsDark;
    },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener)
  }));
  localStorage.setItem(THEME_STORAGE_KEY, "system"); // Invalid legacy value: automatic.
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);

  let current:
    | { theme: Theme; preference: ThemePreference; selectTheme: (mode: ThemePreference) => void }
    | undefined;
  function Probe({ hostTheme }: { hostTheme?: Theme }) {
    current = useThemePreference(hostTheme);
    return <span>{current.theme}</span>;
  }
  act(() => {
    root?.render(<Probe />);
  });
  expect(current?.theme).toBe("light");
  expect(current?.preference).toBe("system");
  expect(document.documentElement.classList.contains("theme-light")).toBe(true);

  act(() => {
    systemIsDark = true;
    for (const callback of listeners) callback();
  });
  expect(current?.theme).toBe("dark");
  expect(document.documentElement.classList.contains("theme-dark")).toBe(true);

  act(() => {
    current?.selectTheme("light");
  });
  expect(current?.theme).toBe("light");
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  act(() => {
    root?.render(<Probe hostTheme="dark" />);
    systemIsDark = false;
    for (const callback of listeners) callback();
  });
  expect(current?.theme).toBe("light"); // Manual overrides both system and host.

  act(() => {
    current?.selectTheme("system");
  });
  expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  expect(current?.theme).toBe("dark"); // Host wins while following automatically.
  act(() => {
    root?.render(<Probe />);
  });
  expect(current?.theme).toBe("light"); // Browser OS fallback resumes.
});
