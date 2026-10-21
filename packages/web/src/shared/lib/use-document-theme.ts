import { useLayoutEffect } from "react";

/** Body portals inherit the active theme inside this document (including MCP iframes). */
export function useDocumentTheme(theme: "light" | "dark") {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("theme-dark");
    const wasLight = root.classList.contains("theme-light");
    root.classList.toggle("theme-dark", theme === "dark");
    root.classList.toggle("theme-light", theme === "light");
    return () => {
      root.classList.toggle("theme-dark", wasDark);
      root.classList.toggle("theme-light", wasLight);
    };
  }, [theme]);
}
