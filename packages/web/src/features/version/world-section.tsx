import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import type { WorldNavigation } from "../domain/use-world-navigation.js";
import type { VersionHistory } from "./use-version-history.js";

export function WorldSection({
  name,
  history,
  navigation,
  onOpenHistory,
  children
}: {
  name: string;
  history: VersionHistory;
  navigation: WorldNavigation;
  onOpenHistory: (name: string, trigger: HTMLButtonElement) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const expanded = navigation.world === name;
  const current = history.currentWorld === name;
  const exists = history.branches.some((branch) => branch.name === name);
  const disabled = !history.available || !history.ready;
  return (
    <li className="world-section" data-world={name}>
      <div className="world-section-heading" data-current={current}>
        {!navigation.isEmpty(name) ? (
          <Button
            variant="ghost"
            className="world-expand"
            type="button"
            aria-label={t("domains.expandWorld", { name })}
            aria-expanded={expanded}
            disabled={disabled}
            onClick={() => {
              navigation.toggleWorld(name);
            }}
          >
            <Icon name={expanded ? "chevronDown" : "chevronRight"} />
          </Button>
        ) : (
          <span className="world-expand-placeholder" />
        )}
        <Button
          variant="ghost"
          className="world-section-trigger"
          type="button"
          aria-label={name}
          aria-current={current ? "page" : undefined}
          aria-busy={history.switchingWorld === name}
          disabled={disabled || !exists}
          title={name}
          onClick={() => {
            navigation.selectWorld(name);
          }}
        >
          <Icon name="globe" />
          <span className="world-section-name">{name}</span>
          {name === history.defaultBranch && exists && (
            <span className="world-default-label">{t("versions.defaultWorld")}</span>
          )}
          {!exists && <span className="world-default-label">{t("versions.deletedWorld")}</span>}
        </Button>
        <Button
          variant="ghost"
          className="world-history-button"
          aria-label={t("domains.history", { name })}
          title={t("domains.history", { name })}
          disabled={disabled}
          onClick={(event) => {
            onOpenHistory(name, event.currentTarget);
          }}
        >
          <Icon name="history" />
        </Button>
      </div>
      {expanded && !navigation.isEmpty(name) && (
        <section
          className="world-domain-region"
          role="region"
          aria-label={t("domains.world", { name })}
          aria-busy={navigation.loading}
        >
          {children}
        </section>
      )}
    </li>
  );
}
