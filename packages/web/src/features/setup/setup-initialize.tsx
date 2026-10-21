import { useTranslation } from "react-i18next";
import type { SetupStatus } from "./setup-api.js";
import type { Draft } from "./setup-steps.js";

export function SetupInitializeFields({ draft, status }: { draft: Draft; status: SetupStatus }) {
  const { t } = useTranslation();
  return (
    <div className="setup-review">
      <dl>
        <div>
          <dt>{t("setup.publicOrigin.label")}</dt>
          <dd>{draft.publicOrigin}</dd>
        </div>
        <div>
          <dt>{t("setup.url")}</dt>
          <dd>{draft.url}</dd>
        </div>
        <div>
          <dt>{t("setup.model")}</dt>
          <dd>{draft.model}</dd>
        </div>
        <div>
          <dt>{t("setup.dimensions")}</dt>
          <dd>{draft.dimensions}</dd>
        </div>
        <div>
          <dt>{t("setup.similarity")}</dt>
          <dd>{draft.similarity}</dd>
        </div>
        <div>
          <dt>{t("setup.credentialMode")}</dt>
          <dd>{t(draft.key.trim() === "" ? "setup.vector.noKey" : "setup.keyProvided")}</dd>
        </div>
        <div>
          <dt>{t("setup.analyzer")}</dt>
          <dd>jieba</dd>
        </div>
        <div>
          <dt>{t("setup.cacheSize")}</dt>
          <dd>4096 MiB</dd>
        </div>
      </dl>
      {status.state === "initializing" && (
        <div className="setup-running" role="status">
          <span className="setup-running-dot" />
          {t("setup.initializing")}
          {status.phase !== undefined && " · " + t("setup.phases." + status.phase)}
        </div>
      )}
      {status.state === "error" && <p className="setup-note">{t("setup.resumeHint")}</p>}
    </div>
  );
}
