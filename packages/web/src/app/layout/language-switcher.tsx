import { Button } from "../../shared/ui/button.js";
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";

import { getLocalePreference, selectLocale, subscribeLocalePreference } from "../i18n/index.js";
import type { LocalePreference } from "../i18n/index.js";

const options: readonly { preference: LocalePreference; key: "system" | "english" | "chinese" }[] =
  [
    { preference: "system", key: "system" },
    { preference: "en", key: "english" },
    { preference: "zh-CN", key: "chinese" }
  ];

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const preference = useSyncExternalStore(subscribeLocalePreference, getLocalePreference);
  const labels: Record<LocalePreference, string> = {
    system: t("language.auto"),
    en: "EN",
    "zh-CN": "中文"
  };

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {options.map(({ preference: option, key }) => (
        <Button
          variant="ghost"
          key={option}
          type="button"
          className="language-option"
          lang={option === "system" ? undefined : option}
          aria-label={t(`language.${key}`)}
          aria-pressed={preference === option}
          onClick={() => {
            if (preference !== option) void selectLocale(option);
          }}
        >
          {labels[option]}
        </Button>
      ))}
    </div>
  );
}
