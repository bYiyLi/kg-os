import { useRef, useState } from "react";
import type { CSSProperties } from "react";
import { I18nextProvider } from "react-i18next";

import { useWebAuthentication } from "../core/client/use-web-authentication.js";
import { AuthenticationDialog } from "../features/connection/authentication-dialog.js";
import { ConnectionAuthorizationDialog } from "../features/mcp/connection-authorization-dialog.js";
import { i18n } from "./i18n/index.js";
import { LanguageSwitcher } from "./layout/language-switcher.js";
import { SidebarHandle } from "./layout/sidebar-handle.js";
import { VersionDrawer } from "./layout/version-drawer.js";
import { VersionSidebar } from "./layout/version-sidebar.js";
import type { Theme } from "./layout/version-sidebar.js";
import { Workspace } from "./layout/workspace.js";
import "../features/mcp/connection-authorization.css";

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <AppShell />
    </I18nextProvider>
  );
}

function AppShell() {
  const { connection, restoring, logoutError, lostReason, onLost, authenticated, disconnect } =
    useWebAuthentication();
  const [theme, setTheme] = useState<Theme>("dark");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [resizing, setResizing] = useState(false);
  const versionDialogRef = useRef<HTMLDialogElement>(null);

  function openVersions() {
    const dialog = versionDialogRef.current;
    if (dialog !== null && !dialog.open) {
      dialog.showModal();
    }
  }

  if (restoring) {
    return (
      <div className="session-restoring" role="status">
        {i18n.t("auth.restoring")}
      </div>
    );
  }

  return (
    <div
      className={`app-shell theme-${theme}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}${resizing ? " is-resizing" : ""}${connection === null ? " is-auth-required" : ""}`}
      data-theme={theme}
      style={{ "--sidebar-width": `${String(sidebarWidth)}px` } as CSSProperties}
    >
      <VersionSidebar
        collapsed={sidebarCollapsed}
        theme={theme}
        onDisconnect={
          connection === null
            ? undefined
            : () => {
                void disconnect();
              }
        }
        onToggleTheme={() => {
          setTheme((value) => (value === "dark" ? "light" : "dark"));
        }}
      />
      <Workspace onOpenVersions={openVersions} />
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
        onDisconnect={
          connection === null
            ? undefined
            : () => {
                void disconnect();
              }
        }
        onToggleTheme={() => {
          setTheme((value) => (value === "dark" ? "light" : "dark"));
        }}
      />
      {connection === null && (
        <AuthenticationDialog
          reason={lostReason}
          onAuthenticated={authenticated}
          onConnectionLost={onLost}
          languageControl={<LanguageSwitcher />}
        />
      )}
      {connection !== null && (
        <ConnectionAuthorizationDialog
          connection={connection}
          requestId={new URLSearchParams(window.location.search).get("mcp_authorization")}
          languageControl={<LanguageSwitcher />}
        />
      )}
      {logoutError && (
        <p className="session-logout-error" role="alert">
          {i18n.t("auth.logoutFailed")}
        </p>
      )}
    </div>
  );
}
