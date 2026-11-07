import { DialogTitle, DialogDescription } from "../../shared/ui/dialog.js";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";

const permissions = [
  {
    icon: "graph",
    name: "readName",
    text: "readDescription"
  },
  { icon: "eye", name: "writeName", text: "writeDescription" },
  { icon: "branch", name: "branchesName", text: "branchesDescription" },
  {
    icon: "arrowRight",
    name: "executeName",
    text: "executeDescription"
  }
] as const;

function KGOSMark() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M24 3.5 44.5 24 24 44.5 3.5 24 24 3.5Z"
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinejoin="round"
      />
      <path d="m24 14-7 10 7 10 7-10-7-10Z" fill="currentColor" />
      <circle cx="24" cy="24" r="2.7" fill="var(--color-canvas)" />
    </svg>
  );
}

function CallbackIdentity({
  clientID,
  redirectHost
}: {
  clientID: string | undefined;
  redirectHost: string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <p className="mcp-authorization-target">
      <span>{t("mcp.callbackHost")}</span>
      <strong className="mcp-authorization-callback-host">{redirectHost}</strong>
      <span className="mcp-authorization-client-id">{clientID}</span>
    </p>
  );
}

export function AuthorizationVisuals({
  clientName,
  clientID,
  clientKind,
  redirectHost,
  loopback,
  resource,
  permissionsVisible,
  loading
}: {
  clientName: string | undefined;
  clientID: string | undefined;
  clientKind: "cimd" | "dcr" | undefined;
  redirectHost: string | undefined;
  loopback: boolean | undefined;
  resource: string | undefined;
  permissionsVisible: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mcp-authorization-heading">
        <DialogTitle id="mcp-authorization-title">{t("mcp.title")}</DialogTitle>
        <DialogDescription id="mcp-authorization-description">
          {t("mcp.description")}
        </DialogDescription>
      </div>
      <div className="mcp-authorization-parties">
        <div>
          <span className="mcp-authorization-app-mark" aria-hidden="true">
            <Icon name="monitor" />
          </span>
          <strong>{clientName ?? t("mcp.externalAssistant")}</strong>
          <small>
            {clientKind === undefined
              ? t("mcp.externalAssistant")
              : `${t("mcp.selfDeclared")} (${clientKind.toUpperCase()})`}
          </small>
        </div>
        <Icon name="arrowRight" />
        <div>
          <span className="mcp-authorization-kgos-mark">
            <KGOSMark />
          </span>
          <strong>KG OS</strong>
          <small>{resource ?? t("mcp.yourGraph")}</small>
        </div>
      </div>
      {permissionsVisible && <CallbackIdentity clientID={clientID} redirectHost={redirectHost} />}
      {loading && (
        <p className="mcp-authorization-loading" role="status">
          {t("mcp.loading")}
        </p>
      )}
      {permissionsVisible && (
        <div className="mcp-authorization-permissions">
          <h3>{t("mcp.permissionsTitle")}</h3>
          {permissions.map((permission) => (
            <div className="mcp-authorization-permission" key={permission.name}>
              <Icon name={permission.icon} />
              <span>
                <strong>{t(`mcp.${permission.name}`)}</strong>
                <small>{t(`mcp.${permission.text}`)}</small>
              </span>
              <span className="mcp-authorization-allowed">{t("mcp.requested")}</span>
            </div>
          ))}
        </div>
      )}
      <p className="mcp-authorization-notice">
        <Icon name="help" />
        <span>
          <strong>{t("mcp.writeNotice")}</strong>
          <br />
          {t("mcp.trustNotice")}
        </span>
      </p>
      {loopback === true && (
        <p className="mcp-authorization-notice">
          <Icon name="help" />
          <span>{t("mcp.loopbackWarning")}</span>
        </p>
      )}
    </>
  );
}
