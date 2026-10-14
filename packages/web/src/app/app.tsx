import { I18nextProvider } from "react-i18next";

import { useWebAuthentication } from "../core/client/use-web-authentication.js";
import { AuthenticationDialog } from "../features/connection/authentication-dialog.js";
import { ConnectionAuthorizationDialog } from "../features/mcp/connection-authorization-dialog.js";
import { i18n } from "./i18n/index.js";
import { LanguageSwitcher } from "./layout/language-switcher.js";
import { WorkspaceShell } from "./layout/workspace-shell.js";
import "../features/mcp/connection-authorization.css";

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <BrowserApp />
    </I18nextProvider>
  );
}

function BrowserApp() {
  const { connection, restoring, logoutError, lostReason, onLost, authenticated, disconnect } =
    useWebAuthentication();

  if (restoring) {
    return (
      <div className="session-restoring" role="status">
        {i18n.t("auth.restoring")}
      </div>
    );
  }

  return (
    <WorkspaceShell
      authenticationRequired={connection === null}
      onDisconnect={
        connection === null
          ? undefined
          : () => {
              void disconnect();
            }
      }
    >
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
    </WorkspaceShell>
  );
}
