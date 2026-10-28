import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import type { IconName } from "../../shared/ui/icon.js";
import type { VersionHistory } from "./use-version-history.js";

function browsingFeedback(history: VersionHistory) {
  if (history.selectionError) return "versions.selectFailed";
  if (history.worldMissing) return "versions.worldMissing";
  if (history.refsError) return "versions.refsStale";
  if (history.hasNewVersion) return "versions.newVersion";
  if (history.currentWorld === null) return "versions.viewingSnapshot";
  if (history.selectedCommit !== history.worldHead) return "versions.viewingHistory";
  return "versions.browsingLatest";
}

export function VersionBrowsingStatus({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  if (!history.available || !history.ready || history.selectedCommit === null) return null;
  const pending = history.selectingCommit !== null;
  const historical = history.currentWorld !== null && history.selectedCommit !== history.worldHead;
  const canReturn = history.currentWorld !== null && !history.worldMissing;
  const target = [history.switchingWorld, history.selectingCommit?.slice(7, 14)]
    .filter(Boolean)
    .join(" · ");
  const feedback = pending
    ? t("versions.switchingVersion", { version: target })
    : t(browsingFeedback(history));
  let feedbackIcon: IconName = "check";
  if (history.selectionError) feedbackIcon = "help";
  if (pending) feedbackIcon = "refresh";
  return (
    <section className="version-browsing-status" aria-label={t("versions.currentBrowsing")}>
      <div className="version-browsing-summary">
        <p className="version-browsing-label">{t("versions.currentBrowsing")}</p>
        <div className="version-browsing-identity" role="status" aria-atomic="true">
          <strong title={history.currentWorld ?? undefined}>
            {history.currentWorld ?? t("versions.snapshot")}
          </strong>
          <code title={history.selectedCommit}>{history.selectedCommit.slice(7, 14)}</code>
          {canReturn && (
            <span className="version-browsing-badge">
              {t(historical ? "versions.historicalVersion" : "versions.latestVersion")}
            </span>
          )}
        </div>
        <p
          className="version-browsing-feedback"
          role={history.selectionError && !pending ? "alert" : "status"}
          aria-atomic="true"
          data-pending={pending}
        >
          <Icon name={feedbackIcon} />
          <span>{feedback}</span>
        </p>
      </div>
      {canReturn && (
        <Button
          variant="outline"
          className="version-return-latest"
          disabled={pending || (!historical && !history.hasNewVersion)}
          onClick={history.returnToLatest}
        >
          <Icon name="refresh" />
          {t(historical || history.hasNewVersion ? "versions.backToLatest" : "versions.atLatest")}
        </Button>
      )}
      {history.refsError && !history.worldMissing && (
        <Button variant="ghost" onClick={history.checkRefs} disabled={history.checkingRefs}>
          {t("versions.checkUpdates")}
        </Button>
      )}
    </section>
  );
}
