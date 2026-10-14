import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

// cspell:words Lngs

import { en } from "./en.js";
import { zhCN } from "./zh-CN.js";

export type Locale = "en" | "zh-CN";

export const LOCALE_STORAGE_KEY = "kgos.web.locale";

function matchBrowserLocale(value: string): Locale | null {
  const language = value.toLowerCase();
  if (language === "zh" || language.startsWith("zh-")) return "zh-CN";
  if (language === "en" || language.startsWith("en-")) return "en";
  return null;
}

export function detectLocale(
  storage: Pick<Storage, "getItem"> | null,
  languages: readonly string[]
): Locale {
  try {
    const preference = storage?.getItem(LOCALE_STORAGE_KEY);
    if (preference === "en" || preference === "zh-CN") return preference;
  } catch {
    // Browser storage is optional; fall back to browser languages.
  }
  for (const language of languages) {
    const supported = matchBrowserLocale(language);
    if (supported !== null) return supported;
  }
  return "en";
}

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function browserLanguages(
  browser: { languages?: readonly string[] | undefined; language?: string | undefined } | null
): readonly string[] {
  if (browser === null) return [];
  if (browser.languages !== undefined && browser.languages.length > 0) {
    return browser.languages;
  }
  return browser.language !== undefined && browser.language.length > 0 ? [browser.language] : [];
}

export const i18n = createInstance().use(initReactI18next);

void i18n.init({
  lng: detectLocale(
    browserStorage(),
    browserLanguages(typeof navigator === "undefined" ? null : navigator)
  ),
  fallbackLng: "en",
  supportedLngs: ["en", "zh-CN"],
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN } },
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false }
});

function synchronizeDocument(locale: string) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.title = i18n.t("meta.title");
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute("content", i18n.t("meta.description"));
}

i18n.on("languageChanged", synchronizeDocument);
synchronizeDocument(i18n.language);

export async function selectLocale(locale: Locale) {
  await i18n.changeLanguage(locale);
  try {
    browserStorage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Switching remains available even if browser storage is disabled.
  }
}
