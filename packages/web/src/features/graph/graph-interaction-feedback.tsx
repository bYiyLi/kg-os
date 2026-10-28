import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { nodeCaption } from "./graph-data.js";
import type { useGraphExplorer } from "./use-graph-explorer.js";

type Explorer = ReturnType<typeof useGraphExplorer>;

function ActionNotice({
  notice,
  name,
  onUndo
}: {
  notice: Explorer["notice"];
  name: string;
  onUndo: () => void;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (notice === null) return;
    setVisible(true);
    const timer = window.setTimeout(
      () => {
        setVisible(false);
      },
      notice.kind === "hidden" ? 6000 : 3500
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [notice]);
  if (notice === null || !visible) return null;
  return (
    <div
      className={"graph-action-notice" + (notice.kind === "expandFailed" ? " is-error" : "")}
      role={notice.kind === "expandFailed" ? "alert" : "status"}
    >
      <span>{t("graph.notice." + notice.kind, { count: notice.count ?? 0, name })}</span>
      {notice.kind === "hidden" && (
        <Button variant="ghost" onClick={onUndo}>
          {t("graph.undoHide")}
        </Button>
      )}
    </div>
  );
}

export function GraphInteractionFeedback({ explorer }: { explorer: Explorer }) {
  const { t } = useTranslation();
  const item = explorer.data.nodes.find((node) => node.id === explorer.notice?.id);
  const name = item === undefined ? (explorer.notice?.id ?? "") : nodeCaption(item);
  return (
    <>
      {explorer.data.nodes.length > 0 && !explorer.busy && !explorer.linksFailed && (
        <p className="graph-interaction-hint">{t("graph.gestureHint")}</p>
      )}
      {explorer.linksFailed && (
        <div className="graph-search-message graph-links-error" role="alert">
          <span>{t("graph.linksFailed")}</span>
          <Button
            variant="ghost"
            disabled={explorer.busy}
            onClick={() => {
              void explorer.retryLinks();
            }}
          >
            {t("graph.retryLinks")}
          </Button>
        </div>
      )}
      <ActionNotice notice={explorer.notice} name={name} onUndo={explorer.undoHide} />
    </>
  );
}
