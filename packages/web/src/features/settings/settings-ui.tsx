import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Info } from "lucide-react";

import { Button } from "../../shared/ui/button.js";

export function SettingsSection({
  title,
  description,
  action,
  children
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <div>
          <h3>{title}</h3>
          {description !== undefined && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function SettingsInfo({
  label,
  children,
  action
}: {
  label: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="settings-info-row">
      <span className="settings-field-label">{label}</span>
      <div className="settings-value">{children}</div>
      {action}
    </div>
  );
}

export function SettingsNotice({ children }: { children: ReactNode }) {
  return (
    <p className="settings-notice">
      <Info aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function SettingsCopy({ value }: { value: string }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"copied" | "copyFailed" | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("copyFailed");
    }
  }
  return (
    <>
      <Button
        variant="outline"
        type="button"
        onClick={() => {
          void copy();
        }}
      >
        <Copy aria-hidden="true" />
        {t("settings.copy")}
      </Button>
      {status !== null && (
        <span className="settings-hint" role="status">
          {t("settings." + status)}
        </span>
      )}
    </>
  );
}
