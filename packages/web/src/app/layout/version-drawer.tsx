import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import { VersionTree } from "../../features/version/version-browser.js";
import type { VersionHistory } from "../../features/version/use-version-history.js";

import { AppBrand } from "./header.js";
import { LanguageSwitcher } from "./language-switcher.js";
import { ThemeToggle } from "./version-sidebar.js";
import type { Theme } from "./version-sidebar.js";

export function VersionDrawer({
  dialogRef,
  theme,
  onToggleTheme,
  onDisconnect,
  history
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  theme: Theme;
  onToggleTheme: () => void;
  onDisconnect?: (() => void) | undefined;
  history: VersionHistory;
}) {
  const { t } = useTranslation();
  return (
    <dialog
      className="version-drawer"
      aria-label={t("versions.mobileNavigation")}
      ref={dialogRef}
      onClick={(event) => {
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < left ||
          event.clientX > right ||
          event.clientY < top ||
          event.clientY > bottom
        ) {
          dialogRef.current?.close();
        }
      }}
    >
      <div className="drawer-header">
        <AppBrand />
        <button
          className="icon-button"
          type="button"
          aria-label={t("versions.closeNavigation")}
          onClick={() => {
            dialogRef.current?.close();
          }}
        >
          <Icon name="close" />
        </button>
      </div>
      <div className="drawer-scroll">
        <VersionTree history={history} />
      </div>
      <div className="drawer-bottom">
        {onDisconnect !== undefined && (
          <button className="connection-disconnect" type="button" onClick={onDisconnect}>
            <Icon name="lock" />
            <span>{t("versions.disconnect")}</span>
          </button>
        )}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        <LanguageSwitcher />
      </div>
    </dialog>
  );
}
