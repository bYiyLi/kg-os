import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import type { VersionCommit } from "./version-data.js";
import type { VersionHistory } from "./use-version-history.js";
import { commitTitle } from "./version-presentation.js";
import { VersionSwitchAction } from "./version-switch-action.js";

const timeUnits: readonly [unit: Intl.RelativeTimeFormatUnit, duration: number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
  ["second", 1]
];

function relativeCommitTime(timestamp: number, locale: string): string {
  const seconds = (timestamp / 1000 - Date.now()) / 1000;
  if (!Number.isFinite(seconds)) return "—";
  const [unit, duration] = timeUnits.find(([, size]) => Math.abs(seconds) >= size) ?? ["second", 1];
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(seconds / duration),
    unit
  );
}

export function VersionRow({
  commit,
  history,
  locale,
  worldName
}: {
  commit: VersionCommit;
  history: VersionHistory;
  locale: string;
  worldName?: string | undefined;
}) {
  const { t } = useTranslation();
  const selected =
    history.selectedCommit === commit.state &&
    (worldName === undefined || history.currentWorld === worldName);
  const latest = worldName !== undefined && history.expandedHead === commit.state;
  const pending =
    history.selectingCommit === commit.state && history.switchingWorld === (worldName ?? null);
  const refs = commit.refs.filter((ref) => history.mode === "all" || ref.kind === "tag");
  return (
    <li className="commit-item">
      <Button
        variant="ghost"
        className="commit-row"
        type="button"
        aria-pressed={selected}
        aria-busy={pending}
        onClick={() => {
          if (pending || (selected && history.selectingCommit === null)) return;
          if (worldName === undefined) history.selectCommit(commit.state);
          else history.selectWorldCommit(worldName, commit.state);
        }}
      >
        <span className="commit-branch-colors" aria-hidden="true">
          {history.mode === "all" ? (
            history.branches
              .filter((branch) => commit.reachableFrom.includes(branch.name))
              .map((branch) => (
                <span className={`branch-color-dot is-${branch.color}`} key={branch.name} />
              ))
          ) : (
            <span className="version-history-dot" />
          )}
        </span>
        <span className="commit-details">
          <span className="commit-title-line">
            <span className="commit-title" title={commit.message}>
              {commitTitle(commit.message, t("versions.noMessage"))}
            </span>
            {latest && <span className="commit-latest">{t("versions.latest")}</span>}
          </span>
          <span className="commit-meta">
            <code title={commit.state}>{commit.state.replace(/^commit\//, "").slice(0, 7)}</code>
            <span>{relativeCommitTime(commit.committedAt, locale)}</span>
          </span>
          {(commit.merge || refs.length > 0) && (
            <span className="commit-refs">
              {commit.merge && <span className="commit-ref is-merge">{t("versions.merge")}</span>}
              {refs.map((ref) => (
                <span
                  className={`commit-ref is-${ref.kind}`}
                  key={`${ref.kind}/${ref.name}`}
                  title={ref.name}
                >
                  {ref.name}
                </span>
              ))}
            </span>
          )}
          <span className="sr-only">
            {t("versions.reachableFrom", { names: commit.reachableFrom.join(", ") })}
          </span>
        </span>
        <VersionSwitchAction pending={pending} selected={selected} />
      </Button>
    </li>
  );
}
