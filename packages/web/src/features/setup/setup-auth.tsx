import { Button } from "../../shared/ui/button.js";
import { Input } from "../../shared/ui/input.js";
import { useToastManager } from "../../shared/ui/toast.js";
import { Info } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import type { SetupAccess, SetupStatus } from "./setup-api.js";

export interface AuthProps {
  status: SetupStatus;
  access: SetupAccess | null;
  claimedToken: string | null;
  busy: boolean;
  onCreate: () => void;
  onRotate: () => void;
  onLogin: (token: string) => void;
}

function IssuedToken({
  token,
  busy,
  signedIn,
  onLogin
}: {
  token: string;
  busy: boolean;
  signedIn: boolean;
  onLogin: (token: string) => void;
}) {
  const { t } = useTranslation();
  const { add } = useToastManager<Record<string, never>>();
  const [visible, setVisible] = useState(false);
  async function copyToken() {
    try {
      await navigator.clipboard.writeText(token);
      add({ type: "success", title: t("setup.copySuccess"), timeout: 3500 });
    } catch {
      add({ type: "error", title: t("setup.copyFailed"), timeout: 5000, priority: "high" });
    }
  }
  return (
    <div className="setup-field">
      <h2 className="setup-auth-created-title">{t("setup.authCreatedTitle")}</h2>
      <p className="setup-auth-created-description">{t("setup.saveToken")}</p>
      <label htmlFor="setup-issued-token">{t("setup.authTokenCreated")}</label>
      <div className="setup-control-with-button">
        <Input
          id="setup-issued-token"
          value={token}
          readOnly
          type={visible ? "text" : "password"}
        />
        <Button
          variant="ghost"
          type="button"
          aria-label={t(visible ? "setup.hideKey" : "setup.showKey")}
          onClick={() => {
            setVisible(!visible);
          }}
        >
          <Icon name={visible ? "eye" : "eyeOff"} />
        </Button>
      </div>
      <Button
        variant="ghost"
        type="button"
        className="setup-check-button"
        onClick={() => void copyToken()}
      >
        {t("setup.copyToken")}
      </Button>
      {!signedIn && !busy && (
        <p className="setup-auth-retry" role="status">
          {t("setup.authLoginRetry")}
        </p>
      )}
      {!signedIn && (
        <Button
          variant="ghost"
          type="button"
          className="setup-check-button"
          disabled={busy}
          onClick={() => {
            onLogin(token);
          }}
        >
          {t("setup.signIn")}
        </Button>
      )}
    </div>
  );
}

export function SetupAuthFields({
  status,
  access,
  claimedToken,
  busy,
  onCreate,
  onRotate,
  onLogin
}: AuthProps) {
  const { t } = useTranslation();
  const [existingToken, setExistingToken] = useState("");
  return (
    <div className="setup-fields setup-auth-fields">
      {status.state === "error" && (
        <p className="setup-error" role="alert">
          {status.message ?? t("setup.unavailableDescription")}
        </p>
      )}
      <div className="setup-auth-guidance">
        <Info aria-hidden="true" />
        <p>{t("setup.authGenerateDescription")}</p>
      </div>
      {claimedToken !== null && (
        <IssuedToken
          token={claimedToken}
          busy={busy}
          signedIn={access !== null}
          onLogin={onLogin}
        />
      )}
      {status.credentialConfigured && access === null && claimedToken === null && (
        <div className="setup-field">
          <label htmlFor="setup-existing-token">{t("setup.authExistingTokenLabel")}</label>
          <Input
            id="setup-existing-token"
            type="password"
            value={existingToken}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setExistingToken(event.currentTarget.value);
            }}
          />
          <Button
            variant="ghost"
            type="button"
            className="setup-check-button"
            disabled={busy || existingToken.trim() === ""}
            onClick={() => {
              onLogin(existingToken.trim());
            }}
          >
            {t("setup.signIn")}
          </Button>
        </div>
      )}
      {status.state === "setup_required" && (
        <Button
          variant="ghost"
          className="setup-check-button"
          type="button"
          disabled={busy || (status.credentialConfigured && access === null)}
          onClick={status.credentialConfigured ? onRotate : onCreate}
        >
          {t(status.credentialConfigured ? "setup.regenerateToken" : "setup.generateToken")}
        </Button>
      )}
      {access !== null && (
        <p className="setup-auth-success" role="status">
          {t("setup.authReady")}
        </p>
      )}
    </div>
  );
}
