import { useTranslation } from "react-i18next";
import { Folder, FolderOpen } from "lucide-react";

import { Button } from "../../shared/ui/button.js";
import { Icon } from "../../shared/ui/icon.js";
import type { DomainTree } from "./domain-data.js";
import type { WorldNavigation } from "./use-world-navigation.js";

function DomainRows({
  tree,
  refs,
  path,
  navigation,
  expanded,
  toggle
}: {
  tree: DomainTree;
  refs: string[];
  path: string[];
  navigation: WorldNavigation;
  expanded: ReadonlySet<string>;
  toggle: (key: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <ol className="domain-tree-list">
      {refs.map((ref) => {
        const node = tree.nodes.get(ref);
        if (node === undefined) return null;
        const nextPath = [...path, ref];
        const key = JSON.stringify(nextPath);
        const cycle = path.includes(ref);
        const open = expanded.has(key) && !cycle;
        const hasChildren = node.children.length > 0 && !cycle;
        const label = node.title === undefined || node.title.trim() === "" ? node.name : node.title;
        const FolderIcon = open ? FolderOpen : Folder;
        return (
          <li key={ref} className="domain-tree-item" data-domain-ref={ref} data-domain-path={key}>
            <div className="domain-tree-row">
              {hasChildren ? (
                <Button
                  variant="ghost"
                  className="domain-toggle"
                  aria-label={t("domains.expand", { name: label })}
                  aria-expanded={open}
                  onClick={() => {
                    toggle(key);
                  }}
                >
                  <Icon name={open ? "chevronDown" : "chevronRight"} />
                </Button>
              ) : (
                <span className="domain-toggle-placeholder" />
              )}
              <Button
                variant="ghost"
                className="domain-name"
                aria-pressed={
                  navigation.selected?.world === navigation.world &&
                  navigation.selected.state === tree.state &&
                  navigation.selected.path === key
                }
                title={[node.name, ref, node.description].filter(Boolean).join(" · ")}
                onClick={() => {
                  navigation.selectDomain(ref, key);
                }}
              >
                <FolderIcon className="icon" aria-hidden="true" />
                <span>{label}</span>
                {cycle && <span className="domain-reference">{t("domains.reference")}</span>}
              </Button>
            </div>
            {open && (
              <DomainRows
                tree={tree}
                refs={node.children}
                path={nextPath}
                navigation={navigation}
                expanded={navigation.expandedDomains}
                toggle={navigation.toggleDomain}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function DomainTreeView({ navigation }: { navigation: WorldNavigation }) {
  const { t } = useTranslation();
  return (
    <>
      {navigation.loading && (
        <p className="version-list-status" role="status">
          {t("domains.loading")}
        </p>
      )}
      {navigation.error && (
        <p className="version-list-status" role="alert">
          {t("domains.failed")}{" "}
          <Button variant="ghost" onClick={navigation.retry}>
            {t("domains.retry")}
          </Button>
        </p>
      )}
      {navigation.tree !== null && (
        <DomainRows
          tree={navigation.tree}
          refs={navigation.tree.roots}
          path={[]}
          navigation={navigation}
          expanded={navigation.expandedDomains}
          toggle={navigation.toggleDomain}
        />
      )}
    </>
  );
}
