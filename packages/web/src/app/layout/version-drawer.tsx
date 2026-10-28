import { Dialog, DialogContent, DialogTitle } from "../../shared/ui/dialog.js";
import { Button } from "../../shared/ui/button.js";
import { useTranslation } from "react-i18next";
import { Settings2 } from "lucide-react";
import type { RefObject } from "react";

import { Icon } from "../../shared/ui/icon.js";
import type { WorldDirectoryProps } from "../../features/version/version-browser.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";

import { AppBrand } from "./header.js";

export function VersionDrawer({
  open,
  coveredByHistory = false,
  onOpenChange,
  onOpenSettings,
  returnFocus,
  history,
  navigation,
  onOpenHistory,
  onOpenAllHistory
}: {
  open: boolean;
  coveredByHistory?: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenSettings?: (() => void) | undefined;
  returnFocus?: RefObject<HTMLElement | null>;
  history: VersionHistory;
} & Omit<WorldDirectoryProps, "history">) {
  const { t } = useTranslation();
  return (
    <Dialog
      open={open}
      onOpenChange={(next, details) => {
        // A single Escape closes only the history dialog above this drawer.
        if (!next && coveredByHistory) {
          details.cancel();
          return;
        }
        onOpenChange(next);
      }}
    >
      <DialogContent
        id="kgos-version-drawer"
        className="version-drawer translate-x-0 translate-y-0"
        overlayClassName="version-drawer-backdrop"
        finalFocus={returnFocus}
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
          <VersionTree
            history={history}
            navigation={navigation}
            onOpenHistory={onOpenHistory}
            onOpenAllHistory={onOpenAllHistory}
          />
        </div>
        <div className="drawer-bottom">
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
      </DialogContent>
    </Dialog>
  );
}
