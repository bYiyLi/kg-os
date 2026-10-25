import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import { Input } from "../../shared/ui/input.js";
import { useHistoryFill } from "./use-history-fill.js";
import type { VersionHistory } from "./use-version-history.js";
import { VersionControls } from "./version-controls.js";
import { VersionDag } from "./version-dag.js";
import { CommitHistory, HistoryMore, WorldDirectory } from "./world-directory.js";
import { CrossWorldFilter } from "./world-picker.js";

function directoryNames(history: VersionHistory, query: string): string[] {
  if (!history.ready) return [];
  const known = [...history.branches.map((branch) => branch.name), ...history.retainedWorlds];
  const search = query.trim().toLocaleLowerCase();
  return [...new Set(known)].filter((name) => name.toLocaleLowerCase().includes(search));
}

function VersionFeedback({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  return (
    <>
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
    </>
  );
}

function DirectorySearch({
  history,
  query,
  onQueryChange
}: {
  history: VersionHistory;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      {history.mode === "all" && (
        <section className="version-cross-world" aria-label={t("versions.crossWorldHistory")}>
          <Button
            variant="ghost"
            className="version-back-to-world"
            onClick={() => {
              history.setMode("world");
            }}
          >
            <Icon name="chevronLeft" />
            {t("versions.backToWorld")}
          </Button>
          <CrossWorldFilter history={history} />
        </section>
      )}
      <label
        className={history.mode === "all" ? "version-commit-search" : "world-directory-search"}
      >
        <Icon name="search" />
        <Input
          type="search"
          aria-label={t(
            history.mode === "all" ? "versions.searchCommits" : "versions.searchWorlds"
          )}
          placeholder={t(
            history.mode === "all" ? "versions.searchCommits" : "versions.searchWorlds"
          )}
          value={query}
          onChange={(event) => {
            onQueryChange(event.currentTarget.value);
          }}
        />
      </label>
    </>
  );
}

export function VersionTree({ history }: { history: VersionHistory }) {
  const { t } = useTranslation();
  const [worldQuery, setWorldQuery] = useState("");
  const [versionQuery, setVersionQuery] = useState("");
  const [relationsOpen, setRelationsOpen] = useState(false);
  const menuRef = useRef<HTMLButtonElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const moreRef = useRef<HTMLButtonElement | null>(null);
  const names = directoryNames(history, worldQuery);
  const fill = useHistoryFill({
    history,
    scrollRef,
    contentRef,
    moreRef,
    enabled:
      history.mode === "world" &&
      history.expandedWorld !== null &&
      names.includes(history.expandedWorld)
  });
  useEffect(() => {
    if (!history.available) {
      setRelationsOpen(false);
      setWorldQuery("");
      setVersionQuery("");
    }
  }, [history.available]);
  return (
    <div className="version-tree" aria-label={t("versions.tree")}>
      <div className="world-directory-header">
        <VersionControls
          history={history}
          menuRef={menuRef}
          onRefresh={() => {
            fill.reset();
            history.refresh();
          }}
          onOpenRelations={() => {
            setRelationsOpen(true);
          }}
        />
        <DirectorySearch
          history={history}
          query={history.mode === "all" ? versionQuery : worldQuery}
          onQueryChange={history.mode === "all" ? setVersionQuery : setWorldQuery}
        />
      </div>
      <div className="world-directory-scroll" ref={scrollRef}>
        <div className="world-directory-content" ref={contentRef}>
          <VersionFeedback history={history} />
          {history.mode === "world" ? (
            <WorldDirectory
              history={history}
              names={names}
              moreRef={moreRef}
              overflowing={fill.overflowing}
              stalled={fill.stalled}
            />
          ) : (
            <>
              {history.available && history.ready && (
                <CommitHistory history={history} query={versionQuery} />
              )}
              <HistoryMore history={history} moreRef={moreRef} show />
              {history.available && history.branches.length > 0 && (
                <span className="version-loaded-note">{t("versions.loadedAcrossWorlds")}</span>
              )}
            </>
          )}
        </div>
      </div>
      <VersionDag
        open={relationsOpen && history.available}
        onOpenChange={setRelationsOpen}
        history={history}
        returnFocus={menuRef}
      />
    </div>
  );
}
