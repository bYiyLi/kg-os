import type { ReactNode, SyntheticEvent } from "react";
import { useTranslation } from "react-i18next";

import type { ConnectionLossReason } from "../../core/client/connect.js";
import { Icon } from "../../shared/ui/icon.js";

const tokenHelpURL =
  "https://github.com/bYiyLi/kg-os/blob/main/docs/design/runtime.md#单-token-实例认证";

export type AuthenticationError = "required" | "invalid" | "transport" | "unknown";

export function AuthenticationIntroduction({
  reason,
  languageControl
}: {
  reason?: ConnectionLossReason | null | undefined;
  languageControl?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="authentication-topline">
        <div className="authentication-brand">
          <div className="authentication-brand-name">KG OS</div>
          <div className="authentication-brand-description">{t("auth.brandDescription")}</div>
        </div>
        {languageControl}
      </div>
      <div className="authentication-introduction">
        <span className="authentication-lock" aria-hidden="true">
          <Icon name="lock" />
        </span>
        <h2 id="authentication-title">{t("auth.title")}</h2>
        <p id="authentication-description">
          {t("auth.descriptionFirst")}
          <br />
          {t("auth.descriptionSecond")}
        </p>
        {reason !== undefined && reason !== null && (
          <p className="authentication-reason" role="status">
            {t(`auth.loss.${reason}`)}
          </p>
        )}
      </div>
    </>
  );
}

export function AuthenticationForm({
  token,
  showToken,
  connecting,
  error,
  onSubmit,
  onTokenChange,
  onToggleVisibility
}: {
  token: string;
  showToken: boolean;
  connecting: boolean;
  error: AuthenticationError | null;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onTokenChange: (token: string) => void;
  onToggleVisibility: () => void;
}) {
  const { t } = useTranslation();
  return (
    <form className="authentication-form" onSubmit={onSubmit}>
      <label htmlFor="kgos-access-token" className="authentication-label">
        {t("auth.accessToken")} <Icon name="help" />
      </label>
      <div className="authentication-token-field">
        <Icon name="key" />
        <input
          id="kgos-access-token"
          type={showToken ? "text" : "password"}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          placeholder={t("auth.placeholder")}
          value={token}
          disabled={connecting}
          aria-invalid={error !== null}
          aria-describedby={error === null ? "authentication-token-note" : "authentication-error"}
          onChange={(event) => {
            onTokenChange(event.target.value);
          }}
        />
        <button
          type="button"
          className="authentication-reveal"
          aria-label={t(showToken ? "auth.hideToken" : "auth.showToken")}
          aria-pressed={showToken}
          onClick={onToggleVisibility}
        >
          <Icon name={showToken ? "eyeOff" : "eye"} />
        </button>
      </div>
      <p id="authentication-token-note" className="authentication-token-note">
        {t("auth.tokenNote")}
      </p>
      {error !== null && (
        <p id="authentication-error" className="authentication-error" role="alert">
          {t(`auth.error.${error}`)}
        </p>
      )}
      <button
        type="submit"
        className="authentication-connect"
        disabled={connecting || token.trim().length === 0}
      >
        {t(connecting ? "auth.connecting" : "auth.connect")}
        {!connecting && <Icon name="arrowRight" />}
      </button>
    </form>
  );
}

export function AuthenticationHelp() {
  const { t } = useTranslation();
  return (
    <>
      <div className="authentication-help">
        <span className="authentication-help-icon" aria-hidden="true">
          <Icon name="help" />
        </span>
        <div className="authentication-help-text">
          <strong>{t("auth.helpTitle")}</strong>
          <p>{t("auth.helpDescription")}</p>
          <code>&lt;workspace&gt;/.kgos/auth.json</code>
        </div>
        <a href={tokenHelpURL} target="_blank" rel="noopener noreferrer">
          {t("auth.viewDocs")} <Icon name="arrowUpRight" />
        </a>
      </div>
      <div className="authentication-footer">{t("auth.footer")}</div>
    </>
  );
}
