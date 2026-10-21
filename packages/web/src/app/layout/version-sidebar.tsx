import { Button } from "../../shared/ui/button.js";
import { ThemeToggle } from "../../shared/ui/theme-toggle.js";
import type { ThemePreference } from "../../shared/lib/use-theme-preference.js";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";
import { AppBrand } from "./header.js";
import { LanguageSwitcher } from "./language-switcher.js";

export function VersionSidebar({
  collapsed,
  preference,
  onSelectTheme,
  onDisconnect,
  history
}: {
  collapsed: boolean;
  preference: ThemePreference;
  onSelectTheme: (value: ThemePreference) => void;
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
          <Button
            variant="ghost"
            className="connection-disconnect"
            type="button"
            onClick={onDisconnect}
          >
            <Icon name="lock" />
            <span>{t("versions.disconnect")}</span>
          </Button>
        )}
        <ThemeToggle preference={preference} onSelect={onSelectTheme} />
        <LanguageSwitcher />
      </div>
    </aside>
  );
}
