import { useThemePreference } from "../../shared/lib/use-theme-preference.js";
import type { Theme } from "../../shared/lib/use-theme-preference.js";
import { useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useVersionHistory } from "../../features/version/use-version-history.js";
import type { VersionReader } from "../../features/version/version-data.js";
import { SidebarHandle } from "./sidebar-handle.js";
import { VersionDrawer } from "./version-drawer.js";
import { VersionSidebar } from "./version-sidebar.js";
import { Workspace } from "./workspace.js";

export function WorkspaceShell({
  children,
  canvasChildren,
  onDisconnect,
  authenticationRequired = false,
  hostTheme,
  versionReader = null,
  initialVersionState = null
}: {
  children?: ReactNode;
  canvasChildren?: ReactNode;
  onDisconnect?: (() => void) | undefined;
  authenticationRequired?: boolean;
  hostTheme?: Theme | undefined;
  versionReader?: VersionReader | null;
  initialVersionState?: string | null;
}) {
  const { theme, preference, selectTheme } = useThemePreference(hostTheme);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [resizing, setResizing] = useState(false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const history = useVersionHistory(versionReader, initialVersionState);

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
        preference={preference}
        history={history}
        onDisconnect={onDisconnect}
        onSelectTheme={selectTheme}
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
        preference={preference}
        history={history}
        onDisconnect={onDisconnect}
        onSelectTheme={selectTheme}
      />
      {children}
    </div>
  );
}
