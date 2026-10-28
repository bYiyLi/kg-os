import { UiProvider } from "../shared/ui/ui-provider.js";
import { Button } from "../shared/ui/button.js";
import { useEffect, useState } from "react";
import { I18nextProvider } from "react-i18next";

import { useWebAuthentication } from "../core/client/use-web-authentication.js";
import { AuthenticationDialog } from "../features/connection/authentication-dialog.js";
import { ConnectionAuthorizationDialog } from "../features/mcp/connection-authorization-dialog.js";
import { SetupWizard } from "../features/setup/setup-wizard.js";
import { readSetupStatus, SetupAuthenticationRequired } from "../features/setup/setup-api.js";
import type { SetupStatus } from "../features/setup/setup-api.js";
import { i18n } from "./i18n/index.js";
import { LanguageSwitcher } from "./layout/language-switcher.js";
import { WorkspaceShell } from "./layout/workspace-shell.js";
import "../features/mcp/connection-authorization.css";

export function App() {
  return (
    <I18nextProvider i18n={i18n}>
      <UiProvider>
        <InitialRoute />
      </UiProvider>
    </I18nextProvider>
  );
}

function InitialRoute() {
  const params = new URLSearchParams(window.location.search);
  const preview =
    (import.meta as unknown as { env: { DEV: boolean } }).env.DEV &&
    params.get("preview") === "setup";
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    void readSetupStatus(controller.signal).then(setStatus, (cause: unknown) => {
      if (controller.signal.aborted) return;
      if (cause instanceof SetupAuthenticationRequired) {
        // The server already selected /setup for non-ready instances;
        // do not infer readiness from the HTTP 401 alone.
        setStatus({
          state: window.location.pathname === "/setup" ? "setup_required" : "ready",
          credentialConfigured: true
        });
      } else {
        setFailed(true);
      }
    });
    return () => {
      controller.abort();
    };
  }, [preview]);
  if (preview) {
    return (
      <SetupWizard
        initialStatus={{ state: "setup_required", credentialConfigured: false }}
        previewOnly
        previewStep={params.get("step") === "initialize" ? 3 : 0}
        languageControl={<LanguageSwitcher />}
      />
    );
  }
  if (failed)
    return (
      <div role="alert" className="session-restoring">
        {i18n.t("setup.statusFailed")}{" "}
        <Button
          variant="ghost"
          type="button"
          onClick={() => {
            window.location.reload();
          }}
        >
          {i18n.t("setup.retry")}
        </Button>
      </div>
    );
  if (status === null)
    return (
      <div className="session-restoring" role="status">
        {i18n.t("setup.loading")}
      </div>
    );
  if (status.state === "ready") {
    if (window.location.pathname === "/setup") window.location.replace("/");
    return <BrowserApp />;
  }
  if (window.location.pathname !== "/setup") window.history.replaceState(null, "", "/setup");
  return <SetupWizard initialStatus={status} languageControl={<LanguageSwitcher />} />;
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
      connection={connection}
      authenticationRequired={connection === null}
      versionReader={connection?.client.evolution ?? null}
      domainReader={connection?.client ?? null}
      initialVersionState={connection?.state ?? null}
      defaultVersionBranch={connection?.defaultBranch ?? null}
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
