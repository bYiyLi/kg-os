import { cn } from "../../shared/lib/utils.js";
import { useThemePreference } from "../../shared/lib/use-theme-preference.js";
import type { Theme } from "../../shared/lib/use-theme-preference.js";
import { useEffect, useRef, useState } from "react";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import type { Connection } from "../../core/client/connect.js";
import { SettingsDialog } from "../../features/settings/settings-dialog.js";

import type { DomainReader } from "../../features/domain/domain-data.js";
import { useWorldNavigation } from "../../features/domain/use-world-navigation.js";
import { useHistoryDialog } from "../../features/version/use-history-dialog.js";
import { VersionDag } from "../../features/version/version-dag.js";
import { useVersionHistory } from "../../features/version/use-version-history.js";
import type { VersionReader } from "../../features/version/version-data.js";
import { SidebarHandle } from "./sidebar-handle.js";
import { VersionDrawer } from "./version-drawer.js";
import { VersionSidebar } from "./version-sidebar.js";
import { Workspace } from "./workspace.js";
import { LanguageSwitcher } from "./language-switcher.js";
import { KnowledgeCanvas } from "../../features/graph/knowledge-canvas.js";
import type { GraphReader } from "../../features/graph/graph-search.js";
import type { ResolvedState } from "@kgos/sdk";

interface WorkspaceShellProps {
  children?: ReactNode;
  canvasChildren?: ReactNode;
  onDisconnect?: (() => void) | undefined;
  connection?: Connection | null;
  authenticationRequired?: boolean;
  hostTheme?: Theme | undefined;
  versionReader?: VersionReader | null;
  domainReader?: DomainReader | null;
  graphReader?: GraphReader | null;
  initialVersionState?: string | null;
  defaultVersionBranch?: string | null;
}

function narrowQuery() {
  return typeof window.matchMedia === "function" ? window.matchMedia("(max-width: 900px)") : null;
}

function useWorkspaceDialogs(authenticationRequired: boolean) {
  const [narrow, setNarrow] = useState(() => narrowQuery()?.matches ?? false);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsFromDrawer, setSettingsFromDrawer] = useState(false);
  useEffect(() => {
    const query = narrowQuery();
    if (query === null) return;
    const update = () => {
      setNarrow(query.matches);
      if (!query.matches) setVersionsOpen(false);
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
    };
  }, []);
  useEffect(() => {
    if (authenticationRequired) {
      setSettingsOpen(false);
      setVersionsOpen(false);
    }
  }, [authenticationRequired]);
  const openSettings = authenticationRequired
    ? undefined
    : () => {
        setSettingsFromDrawer(versionsOpen);
        setVersionsOpen(false);
        setSettingsOpen(true);
      };
  return {
    narrow,
    versionsOpen,
    setVersionsOpen,
    settingsOpen,
    setSettingsOpen,
    settingsFromDrawer,
    openSettings
  };
}

function WorkspaceSettings(props: Omit<ComponentProps<typeof SettingsDialog>, "languageControl">) {
  if (!props.open) return null;
  return <SettingsDialog {...props} languageControl={<LanguageSwitcher />} />;
}

function useSidebarLayout(dialogs: ReturnType<typeof useWorkspaceDialogs>) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(280);
  const [resizing, setResizing] = useState(false);
  return {
    collapsed,
    width,
    resizing,
    handleProps: {
      collapsed,
      width,
      drawerOpen: dialogs.narrow ? dialogs.versionsOpen : undefined,
      onToggle: () => {
        if (dialogs.narrow) dialogs.setVersionsOpen(true);
        else setCollapsed((value) => !value);
      },
      onResize: setWidth,
      onDraggingChange: setResizing
    }
  };
}

export function WorkspaceShell({
  children,
  canvasChildren,
  onDisconnect,
  connection = null,
  authenticationRequired = false,
  hostTheme,
  versionReader = null,
  domainReader = null,
  graphReader = null,
  initialVersionState = null,
  defaultVersionBranch = null
}: WorkspaceShellProps) {
  const { theme, preference, selectTheme } = useThemePreference(hostTheme);
  const navigationTrigger = useRef<HTMLButtonElement>(null);
  const dialogs = useWorkspaceDialogs(authenticationRequired);
  const sidebar = useSidebarLayout(dialogs);
  const history = useVersionHistory(versionReader, initialVersionState, defaultVersionBranch);
  const navigation = useWorldNavigation(domainReader, history);
  const historyDialog = useHistoryDialog(history, navigation.clearSelection);
  const directory = {
    history,
    navigation,
    onOpenHistory: historyDialog.onOpenHistory,
    onOpenAllHistory: historyDialog.onOpenAllHistory
  };

  return (
    <div
      className={cn("app-shell", "theme-" + theme, {
        "is-sidebar-collapsed": sidebar.collapsed,
        "is-resizing": sidebar.resizing,
        "is-auth-required": authenticationRequired
      })}
      data-theme={theme}
      style={{ "--sidebar-width": String(sidebar.width) + "px" } as CSSProperties}
    >
      <VersionSidebar
        collapsed={sidebar.collapsed}
        {...directory}
        onOpenSettings={dialogs.openSettings}
      />
      <Workspace>
        <KnowledgeCanvas
          reader={graphReader ?? connection?.client.graph ?? null}
          state={history.selectedCommit as ResolvedState | null}
          blocked={
            authenticationRequired ||
            dialogs.settingsOpen ||
            dialogs.versionsOpen ||
            historyDialog.open ||
            history.selectingCommit !== null
          }
        />
        {canvasChildren}
      </Workspace>
      <SidebarHandle {...sidebar.handleProps} ref={navigationTrigger} />
      <VersionDrawer
        open={dialogs.narrow && dialogs.versionsOpen && !authenticationRequired}
        coveredByHistory={historyDialog.open}
        onOpenChange={dialogs.setVersionsOpen}
        {...directory}
        onOpenSettings={dialogs.openSettings}
        returnFocus={navigationTrigger}
      />
      <VersionDag
        open={historyDialog.open}
        onOpenChange={historyDialog.setOpen}
        history={historyDialog.history}
        returnFocus={historyDialog.trigger}
      />
      <WorkspaceSettings
        open={dialogs.settingsOpen && !authenticationRequired}
        onOpenChange={dialogs.setSettingsOpen}
        connection={connection}
        preference={preference}
        onSelectTheme={selectTheme}
        onDisconnect={onDisconnect}
        returnFocus={dialogs.settingsFromDrawer ? navigationTrigger : undefined}
      />
      {children}
    </div>
  );
}
