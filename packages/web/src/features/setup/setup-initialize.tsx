import { BrainCircuit, CheckCircle2, Globe2, Info, Settings2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SetupStatus } from "./setup-api.js";
import type { Draft } from "./setup-steps.js";

function ReviewAccess({ draft, mcpPath }: { draft: Draft; mcpPath: string }) {
  const { t } = useTranslation();
  return (
    <section className="setup-vector-card setup-review-card" aria-labelledby="setup-review-access">
      <header className="setup-review-card-header">
        <Globe2 aria-hidden="true" />
        <h2 id="setup-review-access">{t("setup.review.accessTitle")}</h2>
      </header>
      <div className="setup-review-main">
        <span className="setup-review-label">{t("setup.publicOrigin.label")}</span>
        <strong className="setup-review-url">{draft.publicOrigin}</strong>
      </div>
      <div className="setup-review-detail">
        <span className="setup-review-label">{t("setup.review.mcpLabel")}</span>
        <span className="setup-review-url">{draft.publicOrigin + mcpPath}</span>
      </div>
      {draft.publicOrigin.startsWith("http://") && (
        <p className="setup-review-local-note">{t("setup.review.localOnly")}</p>
      )}
    </section>
  );
}

function ReviewSemantic({ draft, verified }: { draft: Draft; verified: boolean }) {
  const { t } = useTranslation();
  return (
    <section
      className="setup-vector-card setup-review-card"
      aria-labelledby="setup-review-semantic"
    >
      <header className="setup-review-card-header">
        <BrainCircuit aria-hidden="true" />
        <h2 id="setup-review-semantic">{t("setup.review.semanticTitle")}</h2>
      </header>
      <div className="setup-review-main">
        <span className="setup-review-label">{t("setup.model")}</span>
        <strong className="setup-review-url">{draft.model}</strong>
        <span className="setup-review-secondary">{draft.url}</span>
      </div>
      <div className="setup-review-stats">
        <div>
          <span className="setup-review-label">{t("setup.dimensions")}</span>
          <strong>{draft.dimensions}</strong>
        </div>
        <div>
          <span className="setup-review-label">{t("setup.similarity")}</span>
          <strong>{t("setup." + draft.similarity)}</strong>
        </div>
      </div>
      {verified && (
        <p className="setup-review-verified">
          <CheckCircle2 aria-hidden="true" />
          {t("setup.review.verified")}
        </p>
      )}
    </section>
  );
}

function ReviewBasics({ draft }: { draft: Draft }) {
  const { t } = useTranslation();
  return (
    <section className="setup-review-basics" aria-labelledby="setup-review-basics">
      <h2 id="setup-review-basics">
        <Settings2 aria-hidden="true" />
        {t("setup.review.basicsTitle")}
      </h2>
      <dl>
        <div>
          <dt>{t("setup.credentialMode")}</dt>
          <dd>{t(draft.key.trim() === "" ? "setup.vector.noKey" : "setup.keyProvided")}</dd>
        </div>
        <div>
          <dt>{t("setup.analyzer")}</dt>
          <dd>{t("setup.review.jieba")}</dd>
        </div>
        <div>
          <dt>{t("setup.cacheSize")}</dt>
          <dd>4 GiB</dd>
        </div>
      </dl>
    </section>
  );
}

export function SetupInitializeFields({
  draft,
  status,
  verified
}: {
  draft: Draft;
  status: SetupStatus;
  verified: boolean;
}) {
  const { t } = useTranslation();
  if (status.state === "initializing") {
    return (
      <div className="setup-review-state" role="status">
        <span className="setup-running-dot" aria-hidden="true" />
        <div>
          <strong>{t("setup.initializing")}</strong>
          {status.phase !== undefined && <p>{t("setup.phases." + status.phase)}</p>}
        </div>
      </div>
    );
  }
  if (status.state === "error") {
    return (
      <div className="setup-review-state setup-review-state-error" role="status">
        <Info aria-hidden="true" />
        <div>
          <strong>{t("setup.review.failedTitle")}</strong>
          {status.message !== undefined && <p>{status.message}</p>}
          <p>{t("setup.resumeHint")}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="setup-review">
      <div className="setup-review-grid">
        <ReviewAccess draft={draft} mcpPath={status.mcpPath ?? "/mcp"} />
        <ReviewSemantic draft={draft} verified={verified} />
      </div>
      <ReviewBasics draft={draft} />
      <div className="setup-review-advice">
        <Info aria-hidden="true" />
        <p>{t("setup.review.beforeStart")}</p>
      </div>
    </div>
  );
}
