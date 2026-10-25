import { useThemePreference } from "../../shared/lib/use-theme-preference.js";
import type { Theme } from "../../shared/lib/use-theme-preference.js";
import { useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { Connection } from "../../core/client/connect.js";
import { SettingsDialog } from "../../features/settings/settings-dialog.js";

import { useVersionHistory } from "../../features/version/use-version-history.js";
import type { VersionReader } from "../../features/version/version-data.js";
import { SidebarHandle } from "./sidebar-handle.js";
import { VersionDrawer } from "./version-drawer.js";
import { VersionSidebar } from "./version-sidebar.js";
import { Workspace } from "./workspace.js";
import { LanguageSwitcher } from "./language-switcher.js";

interface WorkspaceShellProps {
  children?: ReactNode;
  canvasChildren?: ReactNode;
  onDisconnect?: (() => void) | undefined;
  connection?: Connection | null;
  authenticationRequired?: boolean;
  hostTheme?: Theme | undefined;
  versionReader?: VersionReader | null;
  initialVersionState?: string | null;
  defaultVersionBranch?: string | null;
}

export function WorkspaceShell({
  children,
  canvasChildren,
  onDisconnect,
  connection = null,
  authenticationRequired = false,
  hostTheme,
  versionReader = null,
  initialVersionState = null,
  defaultVersionBranch = null
}: WorkspaceShellProps) {
  const { theme, preference, selectTheme } = useThemePreference(hostTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [resizing, setResizing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    if (authenticationRequired) setSettingsOpen(false);
  }, [authenticationRequired]);
  const history = useVersionHistory(versionReader, initialVersionState, defaultVersionBranch);
  const openSettings = authenticationRequired
    ? undefined
    : () => {
        setVersionsOpen(false);
        setSettingsOpen(true);
      };

  return (
    <div
      className={
        "app-shell theme-" +
        theme +
        (sidebarCollapsed ? " is-sidebar-collapsed" : "") +
        (resizing ? " is-resizing" : "") +
        (authenticationRequired ? " is-auth-required" : "")
      }
      data-theme={theme}
      style={{ "--sidebar-width": String(sidebarWidth) + "px" } as CSSProperties}
    >
      <VersionSidebar
        collapsed={sidebarCollapsed}
        history={history}
        onOpenSettings={openSettings}
      />
      <Workspace
        onOpenVersions={() => {
          setVersionsOpen(true);
        }}
      >
        {canvasChildren}
      </Workspace>
      <SidebarHandle
        collapsed={sidebarCollapsed}
        width={sidebarWidth}
        onToggle={() => {
          setSidebarCollapsed((value) => !value);
        }}
        onResize={setSidebarWidth}
        onDraggingChange={setResizing}
      />
      <VersionDrawer
        open={versionsOpen && !authenticationRequired}
        onOpenChange={setVersionsOpen}
        history={history}
        onOpenSettings={openSettings}
      />
      {settingsOpen && !authenticationRequired && (
        <SettingsDialog
          open
          onOpenChange={setSettingsOpen}
          connection={connection}
          preference={preference}
          onSelectTheme={selectTheme}
          languageControl={<LanguageSwitcher />}
          onDisconnect={onDisconnect}
        />
      )}
      {children}
    </div>
  );
}
