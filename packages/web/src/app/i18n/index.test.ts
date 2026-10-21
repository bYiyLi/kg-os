// @vitest-environment jsdom

import { afterEach, expect, it } from "vitest";

import { en } from "./en.js";
import {
  browserLanguages,
  detectLocale,
  getLocalePreference,
  i18n,
  LOCALE_STORAGE_KEY,
  selectLocale,
  synchronizeHostLocale
} from "./index.js";
import { zhCN } from "./zh-CN.js";

function messages(resource: object, prefix = ""): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(resource) as [string, unknown][]) {
    const path = prefix === "" ? key : `${prefix}.${key}`;
    if (typeof value === "string") {
      result.set(path, value);
    } else if (value !== null && typeof value === "object") {
      for (const [nestedKey, nestedValue] of messages(value, path)) {
        result.set(nestedKey, nestedValue);
      }
    }
  }
  return result;
}

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{\{\s*(\w+)\s*\}\}/g)]
    .map((match) => match[1])
    .filter((value): value is string => value !== undefined)
    .sort();
}

afterEach(async () => {
  synchronizeHostLocale(undefined);
  await selectLocale("system");
  await i18n.changeLanguage("en");
  localStorage.clear();
});

it("keeps all translation keys and interpolation parameters in sync", () => {
  const english = messages(en);
  const chinese = messages(zhCN);
  expect([...chinese.keys()].sort()).toEqual([...english.keys()].sort());
  for (const [key, value] of english) {
    const translated = chinese.get(key);
    expect(translated).toBeTruthy();
    expect(placeholders(translated ?? "")).toEqual(placeholders(value));
    expect(i18n.exists(key, { lng: "en" })).toBe(true);
    expect(i18n.exists(key, { lng: "zh-CN" })).toBe(true);
  }
});

it("explains administrator Token use, recovery and regeneration in both languages", () => {
  const english = [
    en.setup.description.auth,
    en.setup.authIntroductionSecond,
    en.setup.authGenerateDescription
  ].join(" ");
  const chinese = [
    zhCN.setup.description.auth,
    zhCN.setup.authIntroductionSecond,
    zhCN.setup.authGenerateDescription
  ].join(" ");
  expect(en.setup.authTagline).toContain("secure administrator access");
  expect(english).toContain("administrator credential");
  expect(english).toContain(".kgos/auth.json");
  expect(english).toContain("without entering the old one");
  expect(zhCN.setup.authTagline).toBe("为知识库建立安全的管理员访问入口");
  expect(chinese).toContain("主钥匙");
  expect(chinese).toContain(".kgos/auth.json");
  expect(chinese).toContain("登录会话失效");
  expect(chinese).toContain("无需输入旧令牌");
});

it("honors an explicit supported preference before the browser languages", () => {
  expect(detectLocale({ getItem: () => "zh-CN" }, ["en-US"])).toBe("zh-CN");
  expect(detectLocale({ getItem: () => "en" }, ["zh-CN"])).toBe("en");
  expect(detectLocale({ getItem: () => "ZH-CN" }, ["en-GB"])).toBe("en");
  expect(detectLocale({ getItem: () => "other" }, ["es-ES", "zh-Hant"])).toBe("zh-CN");
});

it("respects browser language order and falls back to English safely", () => {
  expect(detectLocale(null, ["es-ES", "en-GB", "zh-CN"])).toBe("en");
  expect(detectLocale(null, ["ZH-tw"])).toBe("zh-CN");
  expect(detectLocale(null, ["fr-FR"])).toBe("en");
  expect(detectLocale(null, [])).toBe("en");
  expect(
    detectLocale(
      {
        getItem() {
          throw new Error("Storage blocked");
        }
      },
      ["zh"]
    )
  ).toBe("zh-CN");
});

it("reads the ordered browser locale list with a single-language fallback", () => {
  expect(browserLanguages(null)).toEqual([]);
  expect(browserLanguages({ languages: ["zh-CN", "en"], language: "en" })).toEqual(["zh-CN", "en"]);
  expect(browserLanguages({ languages: [], language: "en-US" })).toEqual(["en-US"]);
  expect(browserLanguages({ language: "zh" })).toEqual(["zh"]);
  expect(browserLanguages({ languages: [] })).toEqual([]);
});

it("updates the document and stores only the selected locale", async () => {
  const meta = document.createElement("meta");
  meta.name = "description";
  document.head.append(meta);
  try {
    await selectLocale("zh-CN");
    expect(i18n.resolvedLanguage).toBe("zh-CN");
    expect(document.documentElement.lang).toBe("zh-CN");
    expect(meta.content).toBe("KG OS 知识图谱工作区");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("zh-CN");
    await selectLocale("en");
    expect(document.documentElement.lang).toBe("en");
    expect(meta.content).toBe("KG OS knowledge graph workspace");
  } finally {
    meta.remove();
  }
});

it("still switches the interface when browser storage is blocked", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    }
  });
  try {
    await selectLocale("zh-CN");
    expect(i18n.resolvedLanguage).toBe("zh-CN");
  } finally {
    if (descriptor !== undefined) Object.defineProperty(window, "localStorage", descriptor);
  }
});

it("restores automatic language and gives manual selection precedence over host changes", async () => {
  await selectLocale("system");
  expect(getLocalePreference()).toBe("system");
  synchronizeHostLocale("zh-CN");
  expect(i18n.resolvedLanguage).toBe("zh-CN");
  expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();

  await selectLocale("en");
  expect(i18n.resolvedLanguage).toBe("en");
  expect(getLocalePreference()).toBe("en");
  synchronizeHostLocale("zh-CN");
  expect(i18n.resolvedLanguage).toBe("en");

  await selectLocale("system");
  expect(getLocalePreference()).toBe("system");
  expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  expect(i18n.resolvedLanguage).toBe("zh-CN");
  synchronizeHostLocale(undefined);
});

it("responds to browser language changes only while following the system", async () => {
  const browser = navigator;
  const previous = Object.getOwnPropertyDescriptor(browser, "languages");
  Object.defineProperty(browser, "languages", { configurable: true, value: ["zh-CN"] });
  try {
    await selectLocale("system");
    window.dispatchEvent(new Event("languagechange"));
    expect(i18n.resolvedLanguage).toBe("zh-CN");
    await selectLocale("en");
    window.dispatchEvent(new Event("languagechange"));
    expect(i18n.resolvedLanguage).toBe("en");
  } finally {
    if (previous === undefined) Reflect.deleteProperty(browser, "languages");
    else Object.defineProperty(browser, "languages", previous);
  }
});
