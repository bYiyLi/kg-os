import { Button } from "../../shared/ui/button.js";
import { useTranslation } from "react-i18next";
import { Activity, Settings2 } from "lucide-react";

import type { WorldDirectoryProps } from "../../features/version/version-browser.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";
import { AppBrand } from "./header.js";

export function VersionSidebar({
  collapsed,
  onOpenSettings,
  onOpenObservability,
  observing = false,
  history,
  navigation,
  onOpenHistory,
  onOpenAllHistory
}: {
  collapsed: boolean;
  onOpenSettings?: (() => void) | undefined;
  onOpenObservability?: (() => void) | undefined;
  observing?: boolean;
  history: VersionHistory;
} & Omit<WorldDirectoryProps, "history">) {
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
        <VersionTree
          history={history}
          navigation={navigation}
          onOpenHistory={onOpenHistory}
          onOpenAllHistory={onOpenAllHistory}
        />
      </div>
      <div className="sidebar-bottom">
        {onOpenObservability !== undefined && (
          <Button
            variant="ghost"
            type="button"
            className="sidebar-observability-button"
            aria-pressed={observing}
            onClick={onOpenObservability}
          >
            <Activity className="icon" aria-hidden="true" />
            <span>{t("observability.title")}</span>
          </Button>
        )}
        {onOpenSettings !== undefined && (
          <Button
            variant="ghost"
            className="sidebar-settings-button"
            type="button"
            onClick={onOpenSettings}
          >
            <Settings2 className="icon" aria-hidden="true" />
            <span>{t("settings.title")}</span>
          </Button>
        )}
      </div>
    </aside>
  );
}
