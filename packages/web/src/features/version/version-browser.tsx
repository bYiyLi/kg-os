import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import { Input } from "../../shared/ui/input.js";
import { DomainTreeView } from "../domain/domain-tree.js";
import type { WorldNavigation } from "../domain/use-world-navigation.js";
import type { VersionHistory } from "./use-version-history.js";
import { VersionControls, VersionContextNotice } from "./version-controls.js";
import { WorldSection } from "./world-section.js";

export interface WorldDirectoryProps {
  history: VersionHistory;
  navigation: WorldNavigation;
  onOpenHistory: (name: string, trigger: HTMLButtonElement) => void;
  onOpenAllHistory: (trigger: HTMLButtonElement) => void;
}

export function VersionTree({
  history,
  navigation,
  onOpenHistory,
  onOpenAllHistory
}: WorldDirectoryProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const names = history.ready
    ? [
        ...new Set([
          ...history.branches.map((branch) => branch.name),
          ...history.retainedWorlds,
          ...[navigation.world, history.currentWorld].filter(
            (name): name is string => name !== null
          )
        ])
      ].filter((name) => name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    : [];
  return (
    <div className="version-tree" aria-label={t("versions.tree")}>
      <div className="world-directory-header">
        <VersionControls
          history={history}
          onRefresh={() => {
            history.refresh();
            navigation.retry();
          }}
          onOpenAllHistory={onOpenAllHistory}
        />
        <label className="world-directory-search">
          <Icon name="search" />
          <Input
            type="search"
            aria-label={t("versions.searchWorlds")}
            placeholder={t("versions.searchWorlds")}
            value={query}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
          />
        </label>
      </div>
      <div className="world-directory-scroll">
        {!history.available && (
          <p className="version-list-status" role="status">
            {t("domains.unavailable")}
          </p>
        )}
        {history.loading && (
          <p className="version-list-status" role="status">
            {t("domains.loadingWorlds")}
          </p>
        )}
        {history.selectionError && (
          <p className="version-list-status" role="alert">
            {t("versions.selectFailed")}
          </p>
        )}
        {history.error && !history.ready && (
          <p className="version-list-status" role="alert">
            {t("versions.loadFailed")}{" "}
            <Button variant="ghost" onClick={history.refresh}>
              {t("versions.retry")}
            </Button>
          </p>
        )}
        <VersionContextNotice history={history} />
        <ol className="world-directory-list" aria-label={t("versions.world")}>
          {names.map((name) => (
            <WorldSection
              key={name}
              name={name}
              history={history}
              navigation={navigation}
              onOpenHistory={onOpenHistory}
            >
              <DomainTreeView navigation={navigation} />
            </WorldSection>
          ))}
        </ol>
        {history.ready && names.length === 0 && (
          <p className="version-commit-empty">
            {t(history.branches.length === 0 ? "versions.noBranches" : "versions.noWorldsMatch")}
          </p>
        )}
      </div>
    </div>
  );
}
