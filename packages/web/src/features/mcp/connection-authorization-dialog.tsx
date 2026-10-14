import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import type { Connection } from "../../core/client/connect.js";
import { Icon } from "../../shared/ui/icon.js";
import { useConnectionAuthorization } from "./authorization-state.js";
import { AuthorizationVisuals } from "./authorization-visuals.js";

export function ConnectionAuthorizationDialog({
  connection,
  requestId,
  languageControl
}: {
  connection: Connection;
  requestId: string | null;
  languageControl?: ReactNode;
}) {
  const { t } = useTranslation();
  const { ref, details, error, loading, deciding, dismissed, decide, cancel } =
    useConnectionAuthorization(connection, requestId);

  if (requestId === null || dismissed) return null;
  return (
    <dialog
      ref={ref}
      className="mcp-authorization-dialog"
      aria-labelledby="mcp-authorization-title"
      aria-describedby="mcp-authorization-description"
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <div className="mcp-authorization-brand">
        <span className="mcp-brand-mark">
          <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <path
              d="M24 3.5 44.5 24 24 44.5 3.5 24 24 3.5Z"
              stroke="currentColor"
              strokeWidth="4.4"
            />
            <path d="m24 14-7 10 7 10 7-10-7-10Z" fill="currentColor" />
          </svg>
        </span>
        <strong>KG OS</strong>
        {languageControl}
        <button
          className="mcp-authorization-close"
          type="button"
          aria-label={t("mcp.cancelConnection")}
          disabled={deciding}
          onClick={cancel}
        >
          <Icon name="close" />
        </button>
      </div>
      <AuthorizationVisuals
        resource={details?.resource}
        permissionsVisible={details !== null}
        loading={loading}
      />
      {error !== null && (
        <p className="mcp-authorization-error" role="alert">
          {t(`mcp.error.${error}`)}
        </p>
      )}
      <div className="mcp-authorization-actions">
        <button
          type="button"
          className="mcp-authorization-cancel"
          disabled={deciding}
          onClick={cancel}
        >
          {t("mcp.cancel")}
        </button>
        <button
          type="button"
          className="mcp-authorization-approve"
          disabled={deciding || details === null || loading}
          onClick={() => void decide("approve")}
        >
          {t(deciding ? "mcp.authorizing" : "mcp.authorize")}
        </button>
      </div>
      <p className="mcp-authorization-footnote">{t("mcp.footnote")}</p>
    </dialog>
  );
}
