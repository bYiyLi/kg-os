import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import type { VersionBranch, VersionCommit } from "./version-data.js";
import type { VersionHistory } from "./use-version-history.js";

function BranchOption({ branch, history }: { branch: VersionBranch; history: VersionHistory }) {
  return (
    <label className="version-branch-option">
      <input
        type="checkbox"
        checked={history.selectedBranches.has(branch.name)}
        onChange={(event) => {
          const names = [...history.selectedBranches];
          history.setBranches(
            event.currentTarget.checked
              ? [...names, branch.name]
              : names.filter((name) => name !== branch.name)
          );
        }}
      />
      <span className={`branch-color-dot is-${branch.color}`} aria-hidden="true" />
      <span className="version-branch-option-name">{branch.name}</span>
    </label>
  );
}

function BranchMenu({ id, history }: { id: string; history: VersionHistory }) {
  const { t } = useTranslation();
  const allSelected =
    history.branches.length > 0 && history.selectedBranches.size === history.branches.length;
  return (
    <div
      id={id}
      className="version-branch-menu"
      role="group"
      aria-label={t("versions.filterBranches")}
    >
      <div className="version-branch-menu-heading">
        <span>{t("versions.branches")}</span>
        <button
          type="button"
          onClick={() => {
            history.setBranches(allSelected ? [] : history.branches.map((branch) => branch.name));
          }}
        >
          {allSelected ? t("versions.clearAll") : t("versions.selectAll")}
        </button>
      </div>
      {history.branches.map((branch) => (
        <BranchOption key={branch.name} branch={branch} history={history} />
      ))}
    </div>
  );
}

function BranchPicker({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && containerRef.current?.contains(event.target) !== true) {
        setOpen(false);
      }
    };
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onOutsideClick);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onOutsideClick);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className="version-branch-picker" ref={containerRef}>
      <button
        ref={buttonRef}
        className="version-branch-trigger"
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={t("versions.filterBranches")}
        onClick={() => {
          setOpen((wasOpen) => !wasOpen);
        }}
      >
        <Icon name="branch" />
        <span className="version-branch-trigger-label">
          {history.selectedBranches.size === history.branches.length
            ? t("versions.allBranches")
            : t("versions.selectedBranches")}
        </span>
        <span className="version-branch-count">
          {history.selectedBranches.size}/{history.branches.length}
        </span>
        <Icon name="chevronDown" />
      </button>
      {open && <BranchMenu id={menuId} history={history} />}
    </div>
  );
}

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

function CommitRow({
  commit,
  history,
  locale
}: {
  commit: VersionCommit;
  history: VersionHistory;
  locale: string;
}) {
  const { t } = useTranslation();
  const selected = history.selectedCommit === commit.state;
  return (
    <li className="commit-item">
      <button
        className="commit-row"
        type="button"
        aria-pressed={selected}
        aria-busy={history.selectingCommit === commit.state}
        onClick={() => {
          history.selectCommit(commit.state);
        }}
      >
        <span className="commit-branch-colors" aria-hidden="true">
          {history.branches
            .filter((branch) => commit.reachableFrom.includes(branch.name))
            .map((branch) => (
              <span className={`branch-color-dot is-${branch.color}`} key={branch.name} />
            ))}
        </span>
        <span className="commit-details">
          <span className="commit-title">{commit.message ?? t("versions.noMessage")}</span>
          <span className="commit-meta">
            <code title={commit.state}>{commit.state.replace(/^commit\//, "").slice(0, 7)}</code>
            <span>{relativeCommitTime(commit.committedAt, locale)}</span>
          </span>
          {(commit.merge || commit.refs.length > 0) && (
            <span className="commit-refs">
              {commit.merge && <span className="commit-ref is-merge">{t("versions.merge")}</span>}
              {commit.refs.map((ref) => (
                <span className={`commit-ref is-${ref.kind}`} key={`${ref.kind}/${ref.name}`}>
                  {ref.name}
                </span>
              ))}
            </span>
          )}
          <span className="sr-only">
            {t("versions.reachableFrom", { names: commit.reachableFrom.join(", ") })}
          </span>
        </span>
      </button>
    </li>
  );
}

function emptyMessage(history: VersionHistory, t: (key: string) => string): string {
  if (history.branches.length === 0) return t("versions.noBranches");
  if (history.selectedBranches.size === 0) return t("versions.noBranchesSelected");
  return t("versions.noMatchingCommits");
}

function CommitHistory({ history, query }: { history: VersionHistory; query: string }) {
  const { t, i18n } = useTranslation();
  const search = query.trim().toLocaleLowerCase();
  const matches = history.commits.filter(
    (commit) =>
      search.length === 0 ||
      [
        commit.state,
        commit.message ?? "",
        commit.author ?? "",
        ...commit.refs.map((r) => r.name)
      ].some((value) => value.toLocaleLowerCase().includes(search))
  );
  return (
    <>
      <ol className="commit-list" aria-label={t("versions.history")}>
        {matches.map((commit) => (
          <CommitRow
            key={commit.state}
            commit={commit}
            history={history}
            locale={i18n.resolvedLanguage ?? "en"}
          />
        ))}
      </ol>
      {!history.loading && matches.length === 0 && (
        <p className="version-commit-empty">{emptyMessage(history, t)}</p>
      )}
    </>
  );
}

export function VersionTree({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  return (
    <div className="version-tree" aria-label={t("versions.tree")}>
      <div className="version-browser-controls">
        <BranchPicker history={history} />
        <button
          className="version-refresh-button"
          type="button"
          title={t("versions.refresh")}
          aria-label={t("versions.refresh")}
          onClick={history.refresh}
          disabled={!history.available || history.loading || history.loadingMore}
        >
          <Icon name="refresh" />
        </button>
      </div>
      <label className="version-commit-search">
        <Icon name="search" />
        <input
          type="search"
          aria-label={t("versions.searchCommits")}
          placeholder={t("versions.searchCommits")}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
        />
      </label>
      {!history.available && (
        <p className="version-list-status" role="status">
          {t("versions.unavailable")}
        </p>
      )}
      {history.loading && (
        <p className="version-list-status" role="status">
          {t("versions.loading")}
        </p>
      )}
      {history.available && history.ready && <CommitHistory history={history} query={search} />}
      {history.error && (
        <p className="version-list-status" role="alert">
          {t("versions.loadFailed")}
        </p>
      )}
      {history.selectionError && (
        <p className="version-list-status" role="alert">
          {t("versions.selectFailed")}
        </p>
      )}
      {history.canLoadMore && (
        <button
          type="button"
          className="version-load-more"
          disabled={history.loadingMore || history.loading}
          onClick={history.loadMore}
        >
          {history.loadingMore ? t("versions.loading") : t("versions.loadMore")}
        </button>
      )}
      {history.available && history.branches.length > 0 && (
        <span className="version-loaded-note">{t("versions.loadedOnly")}</span>
      )}
    </div>
  );
}
