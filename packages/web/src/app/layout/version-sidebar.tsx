import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";
import { AppBrand } from "./header.js";
import { LanguageSwitcher } from "./language-switcher.js";

export type Theme = "dark" | "light";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="theme-toggle" role="group" aria-label={t("versions.appearance")}>
      <button
        className="theme-option"
        type="button"
        aria-label={t("versions.light")}
        aria-pressed={theme === "light"}
        title={t("versions.light")}
        onClick={() => {
          if (theme !== "light") {
            onToggle();
          }
        }}
      >
        <Icon name="sun" />
      </button>
      <button
        className="theme-option"
        type="button"
        aria-label={t("versions.dark")}
        aria-pressed={theme === "dark"}
        title={t("versions.dark")}
        onClick={() => {
          if (theme !== "dark") {
            onToggle();
          }
        }}
      >
        <Icon name="moon" />
      </button>
    </div>
  );
}

export function VersionSidebar({
  collapsed,
  theme,
  onToggleTheme,
  onDisconnect,
  history
}: {
  collapsed: boolean;
  theme: Theme;
  onToggleTheme: () => void;
  onDisconnect?: (() => void) | undefined;
  history: VersionHistory;
}) {
  const { t } = useTranslation();
  return (
    <aside
      id="kgos-version-sidebar"
      className="version-sidebar"
      aria-label={t("versions.navigation")}
      aria-hidden={collapsed}
      inert={collapsed}
    >
      <AppBrand />
      <div className="version-sidebar-scroll">
        <VersionTree history={history} />
      </div>
      <div className="sidebar-bottom">
        {onDisconnect !== undefined && (
          <button className="connection-disconnect" type="button" onClick={onDisconnect}>
            <Icon name="lock" />
            <span>{t("versions.disconnect")}</span>
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
