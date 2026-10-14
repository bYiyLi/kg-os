import { useTranslation } from "react-i18next";

import { selectLocale } from "../i18n/index.js";
import type { Locale } from "../i18n/index.js";

const options: readonly { locale: Locale; key: "english" | "chinese"; label: string }[] = [
  { locale: "en", key: "english", label: "EN" },
  { locale: "zh-CN", key: "chinese", label: "中文" }
];

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();

  return (
    <div className="language-switcher" role="group" aria-label={t("language.label")}>
      {options.map(({ locale, key, label }) => (
        <button
          key={locale}
          type="button"
          className="language-option"
          lang={locale}
          aria-label={t(`language.${key}`)}
          aria-pressed={i18n.resolvedLanguage === locale}
          onClick={() => {
            if (i18n.resolvedLanguage !== locale) void selectLocale(locale);
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
