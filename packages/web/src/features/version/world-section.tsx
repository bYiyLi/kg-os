import { useId } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import type { VersionHistory } from "./use-version-history.js";

export function WorldSection({
  name,
  history,
  children
}: {
  name: string;
  history: VersionHistory;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const region = useId();
  const expanded = history.expandedWorld === name;
  const current = history.currentWorld === name;
  const exists = history.branches.some((branch) => branch.name === name);
  return (
    <li className="world-section" data-world={name}>
      <h3 className="world-section-heading">
        <Button
          variant="ghost"
          className="world-section-trigger"
          type="button"
          aria-label={name}
          aria-expanded={expanded}
          aria-controls={expanded ? region : undefined}
          aria-current={current ? "page" : undefined}
          aria-busy={history.expandingWorld === name}
          disabled={!history.available || !history.ready}
          title={name}
          onClick={() => {
            history.toggleWorld(name);
          }}
        >
          <Icon name={expanded ? "chevronDown" : "chevronRight"} />
          <Icon name="globe" />
          <span className="world-section-name">{name}</span>
          {name === history.defaultBranch && exists && (
            <span className="world-default-label">{t("versions.defaultWorld")}</span>
          )}
          {!exists && <span className="world-default-label">{t("versions.deletedWorld")}</span>}
        </Button>
      </h3>
      {expanded && (
        <section
          className="world-history-region history-region"
          id={region}
          role="region"
          aria-label={t("versions.worldHistory", { name })}
          aria-busy={history.expandingWorld === name || history.loadingMore}
        >
          {children}
        </section>
      )}
    </li>
  );
}
