import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "../../shared/ui/button.js";
import type { ThemePreference } from "../../shared/lib/use-theme-preference.js";
import { SettingsNotice, SettingsSection } from "./settings-ui.js";

const themes = [
  { value: "system", Icon: Monitor },
  { value: "light", Icon: Sun },
  { value: "dark", Icon: Moon }
] as const;

export function SettingsDisplay({
  preference,
  onSelectTheme,
  languageControl
}: {
  preference: ThemePreference;
  onSelectTheme: (value: ThemePreference) => void;
  languageControl: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <>
      <SettingsSection
        title={t("settings.appearance")}
        description={t("settings.appearanceDescription")}
      >
        <div className="settings-theme-options" role="group" aria-label={t("settings.appearance")}>
          {themes.map(({ value, Icon }) => (
            <Button
              key={value}
              variant="ghost"
              type="button"
              className="settings-theme-option"
              aria-pressed={preference === value}
              onClick={() => {
                onSelectTheme(value);
              }}
            >
              <span className={"settings-theme-preview theme-preview-" + value} aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                <Icon aria-hidden="true" />
                {t("settings." + value)}
                {preference === value && <Check aria-hidden="true" />}
              </span>
            </Button>
          ))}
        </div>
      </SettingsSection>
      <SettingsSection
        title={t("settings.language")}
        description={t("settings.languageDescription")}
      >
        <div className="settings-info-row">
          <span>{t("settings.language")}</span>
          {languageControl}
        </div>
      </SettingsSection>
      <SettingsNotice>{t("settings.preferenceNote")}</SettingsNotice>
    </>
  );
}
