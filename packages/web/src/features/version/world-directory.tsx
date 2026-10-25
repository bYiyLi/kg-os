import type { RefObject } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import type { VersionHistory } from "./use-version-history.js";
import { VersionContextNotice } from "./version-controls.js";
import { VersionRow } from "./version-row.js";
import { WorldSection } from "./world-section.js";

export function CommitHistory({
  history,
  query,
  worldName
}: {
  history: VersionHistory;
  query: string;
  worldName?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const search = query.trim().toLocaleLowerCase();
  const matches = history.commits.filter(
    (commit) =>
      search.length === 0 ||
      [
        commit.state,
        commit.message ?? "",
        commit.author ?? "",
        ...commit.refs.map((ref) => ref.name)
      ].some((value) => value.toLocaleLowerCase().includes(search))
  );
  const expanding = history.expandingWorld !== null && history.expandingWorld === worldName;
  return (
    <>
      <ol className="commit-list" aria-label={t("versions.history")}>
        {matches.map((commit) => (
          <VersionRow
            key={commit.state}
            commit={commit}
            history={history}
            locale={i18n.resolvedLanguage ?? "en"}
            worldName={worldName}
          />
        ))}
      </ol>
      {!history.loading && !expanding && !history.expansionError && matches.length === 0 && (
        <p className="version-commit-empty">
          {t(
            history.mode === "all" && history.selectedBranches.size === 0
              ? "versions.noBranchesSelected"
              : "versions.noMatchingCommits"
          )}
        </p>
      )}
    </>
  );
}

export function HistoryMore({
  history,
  moreRef,
  show
}: {
  history: VersionHistory;
  moreRef: RefObject<HTMLButtonElement | null>;
  show: boolean;
}) {
  const { t } = useTranslation();
  if (!show || !history.canLoadMore) return null;
  return (
    <Button
      variant="ghost"
      type="button"
      className="version-load-more"
      ref={moreRef}
      disabled={history.loadingMore || history.loading}
      onClick={history.loadMore}
    >
      <Icon name="chevronDown" />
      {history.loadingMore ? t("versions.loading") : t("versions.loadMore")}
    </Button>
  );
}

function WorldVersions({
  history,
  moreRef,
  overflowing,
  stalled
}: {
  history: VersionHistory;
  moreRef: RefObject<HTMLButtonElement | null>;
  overflowing: boolean;
  stalled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <VersionContextNotice history={history} />
      {history.expandingWorld === history.expandedWorld && history.expandedWorld !== null && (
        <p className="version-list-status" role="status">
          {t("versions.loading")}
        </p>
      )}
      <CommitHistory history={history} query="" worldName={history.expandedWorld ?? undefined} />
      {stalled && (
        <p className="version-list-status" role="status">
          {t("versions.fillStalled")}
        </p>
      )}
      <HistoryMore history={history} moreRef={moreRef} show={overflowing} />
    </>
  );
}

export function WorldDirectory({
  history,
  names,
  moreRef,
  overflowing,
  stalled
}: {
  history: VersionHistory;
  names: string[];
  moreRef: RefObject<HTMLButtonElement | null>;
  overflowing: boolean;
  stalled: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <ol className="world-directory-list" aria-label={t("versions.world")}>
        {names.map((name) => (
          <WorldSection key={name} name={name} history={history}>
            <WorldVersions
              history={history}
              moreRef={moreRef}
              overflowing={overflowing}
              stalled={stalled}
            />
          </WorldSection>
        ))}
      </ol>
      {history.ready && names.length === 0 && (
        <p className="version-commit-empty">
          {t(history.branches.length === 0 ? "versions.noBranches" : "versions.noWorldsMatch")}
        </p>
      )}
    </>
  );
}
