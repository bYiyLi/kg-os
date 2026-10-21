import { useEffect, useState } from "react";

import { useDocumentTheme } from "./use-document-theme.js";

export type Theme = "light" | "dark";
export type ThemePreference = "system" | Theme;

export const THEME_STORAGE_KEY = "kgos.web.theme";

export function readThemePreference(storage: Pick<Storage, "getItem"> | null): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Private / embedded contexts may not expose persistent storage.
  }
  return "system";
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function preferredSystemTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    // Media queries are optional in test and embedded environments.
  }
  return "dark";
}

export function useThemePreference(hostTheme?: Theme) {
  const [preference, setPreference] = useState<ThemePreference>(() =>
    readThemePreference(browserStorage())
  );
  const [systemTheme, setSystemTheme] = useState<Theme>(preferredSystemTheme);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const update = () => {
      setSystemTheme(query.matches ? "dark" : "light");
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);

  const theme = preference === "system" ? (hostTheme ?? systemTheme) : preference;
  useDocumentTheme(theme);

  function selectTheme(value: ThemePreference) {
    setPreference(value);
    try {
      const storage = browserStorage();
      if (value === "system") storage?.removeItem(THEME_STORAGE_KEY);
      else storage?.setItem(THEME_STORAGE_KEY, value);
    } catch {
      // Keep the current selection even when persistence is unavailable.
    }
  }

  return { theme, preference, selectTheme };
}
