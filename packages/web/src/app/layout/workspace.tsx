import { Button } from "../../shared/ui/button.js";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Icon } from "../../shared/ui/icon.js";
import type { IconName } from "../../shared/ui/icon.js";

const pendingTools: readonly { name: IconName; label: "select" | "layout" | "fit" | "minimap" }[] =
  [
    { name: "pointer", label: "select" },
    { name: "graph", label: "layout" },
    { name: "fit", label: "fit" },
    { name: "map", label: "minimap" }
  ];

export function Workspace({
  onOpenVersions,
  children
}: {
  onOpenVersions: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <main className="workspace-main" aria-label={t("workspace.label")}>
      <section className="canvas-stage" aria-label={t("workspace.canvas")}>
        <Button
          variant="ghost"
          className="mobile-versions-button"
          type="button"
          aria-label={t("versions.navigation")}
          title={t("versions.navigation")}
          onClick={onOpenVersions}
        >
          <Icon name="menu" />
        </Button>
        <div className="canvas-toolbar" aria-label={t("workspace.pendingTools")}>
          {pendingTools.map((tool) => (
            <Button
              variant="ghost"
              className="canvas-tool"
              key={tool.name}
              type="button"
              disabled
              aria-label={t("workspace.pendingAction", { name: t(`workspace.${tool.label}`) })}
              title={t("workspace.pendingAction", { name: t(`workspace.${tool.label}`) })}
            >
              <Icon name={tool.name} />
            </Button>
          ))}
          <Button
            variant="ghost"
            className="canvas-zoom"
            type="button"
            disabled
            aria-label={t("workspace.zoom")}
            title={t("workspace.zoom")}
          >
            100% <Icon name="chevronDown" />
          </Button>
        </div>
        <span className="sr-only">{t("workspace.pendingCanvas")}</span>
        {children}
      </section>
    </main>
  );
}
