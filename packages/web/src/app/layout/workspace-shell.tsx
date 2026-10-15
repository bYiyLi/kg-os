import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { useVersionHistory } from "../../features/version/use-version-history.js";
import type { VersionReader } from "../../features/version/version-data.js";
import { SidebarHandle } from "./sidebar-handle.js";
import { VersionDrawer } from "./version-drawer.js";
import { VersionSidebar } from "./version-sidebar.js";
import type { Theme } from "./version-sidebar.js";
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
  const [theme, setTheme] = useState<Theme>(hostTheme ?? "dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [resizing, setResizing] = useState(false);
  const versionDialogRef = useRef<HTMLDialogElement>(null);
  const history = useVersionHistory(versionReader, initialVersionState);

  useEffect(() => {
    if (hostTheme !== undefined) setTheme(hostTheme);
  }, [hostTheme]);

  function openVersions() {
    const dialog = versionDialogRef.current;
    if (dialog !== null && !dialog.open) dialog.showModal();
  }

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
        theme={theme}
        history={history}
        onDisconnect={onDisconnect}
        onToggleTheme={() => {
          setTheme((value) => (value === "dark" ? "light" : "dark"));
        }}
      />
      <Workspace onOpenVersions={openVersions}>{canvasChildren}</Workspace>
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
        dialogRef={versionDialogRef}
        theme={theme}
        history={history}
        onDisconnect={onDisconnect}
        onToggleTheme={() => {
          setTheme((value) => (value === "dark" ? "light" : "dark"));
        }}
      />
      {children}
    </div>
  );
}
