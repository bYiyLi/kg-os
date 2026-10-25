import { useEffect, useState } from "react";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import { Popover, PopoverContent, PopoverTrigger } from "../../shared/ui/popover.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../shared/ui/tooltip.js";
import type { VersionHistory } from "./use-version-history.js";
import { moveVersionMenuFocus } from "./version-menu.js";

function observationTime(timestamp: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

export function VersionControls({
  history,
  onOpenRelations,
  onRefresh,
  menuRef
}: {
  history: VersionHistory;
  onOpenRelations: () => void;
  onRefresh: () => void;
  menuRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const disabled = !history.available || history.loading || history.loadingMore;
  useEffect(() => {
    if (!history.available) setOpen(false);
  }, [history.available]);
  const observation =
    history.refsCheckedAt === null
      ? t("versions.notChecked")
      : t("versions.lastChecked", {
          time: observationTime(history.refsCheckedAt, i18n.resolvedLanguage ?? "en")
        });
  return (
    <div className="version-history-heading">
      <h2>{t("versions.world")}</h2>
      <div className="version-history-actions">
        <Tooltip>
          <TooltipTrigger
            render={<Button variant="ghost" disabled={disabled} />}
            className="version-refresh-button"
            type="button"
            aria-label={t("versions.refresh")}
            disabled={disabled}
            onClick={onRefresh}
          >
            <Icon name="refresh" />
          </TooltipTrigger>
          <TooltipContent>
            {t("versions.refresh")} · {history.refsError ? t("versions.refsStale") : observation}
          </TooltipContent>
        </Tooltip>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger
            render={<Button variant="ghost" className="version-more-trigger" ref={menuRef} />}
            aria-label={t("versions.historyActions")}
            disabled={!history.available || !history.ready}
          >
            <Icon name="more" />
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="version-history-menu"
            role="menu"
            aria-label={t("versions.historyActions")}
            onKeyDown={moveVersionMenuFocus}
          >
            <Button
              variant="ghost"
              role="menuitem"
              data-version-option
              disabled={history.expandedWorld === null || history.topologyCommits.length === 0}
              onClick={() => {
                setOpen(false);
                onOpenRelations();
              }}
            >
              <Icon name="branch" />
              {t("versions.viewRelations")}
            </Button>
            <Button
              variant="ghost"
              role="menuitem"
              data-version-option
              onClick={() => {
                history.setMode(history.mode === "all" ? "world" : "all");
                setOpen(false);
              }}
            >
              <Icon name="globe" />
              {t(history.mode === "all" ? "versions.backToWorld" : "versions.crossWorldHistory")}
            </Button>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

export function VersionContextNotice({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  const historical =
    history.expandedWorld !== null &&
    history.expandedWorld === history.currentWorld &&
    history.selectedCommit !== null &&
    history.selectedCommit !== history.expandedHead;
  const pending =
    history.switchingWorld !== null && history.switchingWorld === history.expandedWorld;
  if (!history.available || !history.ready) return null;
  if (pending)
    return (
      <p className="version-context-status" role="status">
        {t("versions.switchingWorld", { name: history.switchingWorld })}
      </p>
    );
  if (history.expandedWorldMissing)
    return (
      <p className="version-context-status" role="status">
        {t("versions.worldMissing")}
      </p>
    );
  if (history.refsError)
    return (
      <p className="version-context-status" role="status">
        {t("versions.refsStale")}
        <Button variant="ghost" onClick={history.checkRefs} disabled={history.checkingRefs}>
          {t("versions.checkUpdates")}
        </Button>
      </p>
    );
  if (!historical && !history.expandedHasNewVersion) return null;
  return (
    <div className="version-history-notice" role="status">
      <Icon name={history.expandedHasNewVersion ? "refresh" : "clock"} />
      <span>
        {t(history.expandedHasNewVersion ? "versions.newVersion" : "versions.viewingHistory")}
      </span>
      <Button
        variant="ghost"
        onClick={() => {
          if (history.expandedWorld !== null) history.selectWorld(history.expandedWorld);
        }}
        disabled={history.selectingCommit !== null}
      >
        {t(history.expandedHasNewVersion ? "versions.viewLatest" : "versions.backToLatest")}
      </Button>
    </div>
  );
}
