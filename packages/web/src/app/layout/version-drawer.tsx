import { Dialog, DialogContent, DialogTitle } from "../../shared/ui/dialog.js";
import { Button } from "../../shared/ui/button.js";
import { ThemeToggle } from "../../shared/ui/theme-toggle.js";
import type { ThemePreference } from "../../shared/lib/use-theme-preference.js";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";

import { AppBrand } from "./header.js";
import { LanguageSwitcher } from "./language-switcher.js";

export function VersionDrawer({
  open,
  onOpenChange,
  preference,
  onSelectTheme,
  onDisconnect,
  history
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preference: ThemePreference;
  onSelectTheme: (value: ThemePreference) => void;
  onDisconnect?: (() => void) | undefined;
  history: VersionHistory;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="version-drawer translate-x-0 translate-y-0"
        overlayClassName="version-drawer-backdrop"
      >
        <DialogTitle className="sr-only">{t("versions.mobileNavigation")}</DialogTitle>
        <div className="drawer-header">
          <AppBrand />
          <Button
            variant="ghost"
            className="icon-button"
            type="button"
            aria-label={t("versions.closeNavigation")}
            onClick={() => {
              onOpenChange(false);
            }}
          >
            <Icon name="close" />
          </Button>
        </div>
        <div className="drawer-scroll">
          <VersionTree history={history} />
        </div>
        <div className="drawer-bottom">
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
      </DialogContent>
    </Dialog>
  );
}
