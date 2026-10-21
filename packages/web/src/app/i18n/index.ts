import { createInstance } from "i18next";
import { initReactI18next } from "react-i18next";

// cspell:words Lngs

import { en } from "./en.js";
import { zhCN } from "./zh-CN.js";

export type Locale = "en" | "zh-CN";
export type LocalePreference = Locale | "system";

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

function storedLocalePreference(): LocalePreference {
  try {
    const value = browserStorage()?.getItem(LOCALE_STORAGE_KEY);
    if (value === "en" || value === "zh-CN") return value;
  } catch {
    // Storage may be blocked.
  }
  return "system";
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

let localePreference = storedLocalePreference();
let hostLocale: string | undefined;
const preferenceListeners = new Set<() => void>();

export function getLocalePreference(): LocalePreference {
  return localePreference;
}

export function subscribeLocalePreference(listener: () => void): () => void {
  preferenceListeners.add(listener);
  return () => {
    preferenceListeners.delete(listener);
  };
}

function resolvedLocale(): Locale {
  if (localePreference !== "system") return localePreference;
  const browser = browserLanguages(typeof navigator === "undefined" ? null : navigator);
  return detectLocale(null, hostLocale === undefined ? browser : [hostLocale, ...browser]);
}

export const i18n = createInstance().use(initReactI18next);

void i18n.init({
  lng: resolvedLocale(),
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

export async function selectLocale(preference: LocalePreference) {
  localePreference = preference;
  for (const listener of preferenceListeners) listener();
  await i18n.changeLanguage(resolvedLocale());
  try {
    const storage = browserStorage();
    if (preference === "system") storage?.removeItem(LOCALE_STORAGE_KEY);
    else storage?.setItem(LOCALE_STORAGE_KEY, preference);
  } catch {
    // Switching remains available even if browser storage is disabled.
  }
}

export function synchronizeHostLocale(locale?: string) {
  hostLocale = locale;
  if (localePreference === "system") void i18n.changeLanguage(resolvedLocale());
}

if (typeof window !== "undefined") {
  window.addEventListener("languagechange", () => {
    if (localePreference === "system") void i18n.changeLanguage(resolvedLocale());
  });
}
