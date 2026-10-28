import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Workspace({ children }: { children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <main className="workspace-main" aria-label={t("workspace.label")}>
      <section className="canvas-stage" aria-label={t("workspace.canvas")}>
        {children}
      </section>
    </main>
  );
}
