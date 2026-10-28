import { useTranslation } from "react-i18next";

import type { VersionHistory } from "./use-version-history.js";
import { VersionRow } from "./version-row.js";

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
      {!history.loading &&
        !history.loadingMore &&
        !history.error &&
        !expanding &&
        !history.expansionError &&
        matches.length === 0 && (
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
