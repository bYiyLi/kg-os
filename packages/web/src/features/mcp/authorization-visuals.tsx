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

function ClientMark() {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
        {Array.from({ length: 6 }, (_, index) => (
          <path
            key={index}
            d="M32 13c10-5 19 3 17 12-1 4-4 8-8 10L27 43"
            transform={"rotate(" + String(index * 60) + " 32 32)"}
          />
        ))}
        <path d="m25 28 7-5 8 5v8l-8 5-8-5v-8Z" />
      </g>
    </svg>
  );
}

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

export function AuthorizationVisuals({
  resource,
  permissionsVisible,
  loading
}: {
  resource: string | undefined;
  permissionsVisible: boolean;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className="mcp-authorization-heading">
        <h2 id="mcp-authorization-title">{t("mcp.title")}</h2>
        <p id="mcp-authorization-description">{t("mcp.description")}</p>
      </div>
      <div className="mcp-authorization-parties">
        <div>
          <span className="mcp-authorization-app-mark" aria-hidden="true">
            <ClientMark />
          </span>
          <strong>ChatGPT</strong>
          <small>{t("mcp.externalAssistant")}</small>
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
    </>
  );
}
