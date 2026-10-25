// @vitest-environment jsdom
// cspell:words qwen qwen3

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { UiProvider } from "../shared/ui/ui-provider.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SetupWizard } from "../features/setup/setup-wizard.js";
import { i18n } from "./i18n/index.js";

const PROGRESS_SELECTOR = ".setup-page-progress";

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("zh-CN");
  vi.stubGlobal("fetch", vi.fn());
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <UiProvider>
          <SetupWizard
            initialStatus={{ state: "setup_required", credentialConfigured: false }}
            previewOnly
          />
        </UiProvider>
      </I18nextProvider>
    );
  });
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.unstubAllGlobals();
});

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (element) =>
      element.textContent.trim() === label || element.getAttribute("aria-label") === label
  );
  if (found === undefined) throw new Error("Missing button: " + label);
  return found;
}

function click(label: string) {
  act(() => {
    button(label).click();
  });
}

function fill(id: string, value: string) {
  const found = host.querySelector<HTMLInputElement>("#" + id);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (found === null || descriptor?.set === undefined) throw new Error("Missing input: " + id);
  act(() => {
    descriptor.set?.call(found, value);
    found.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

it("renders a Token-first four-step wizard without invoking the backend in preview", () => {
  expect(host.querySelector("h1")?.textContent).toBe("保护您的 KG OS 实例");
  expect(host.querySelectorAll(".setup-step-dot")).toHaveLength(4);
  expect(host.querySelector(PROGRESS_SELECTOR)?.textContent).toContain("第 1 步，共 4 步");
  expect(host.querySelector(".setup-welcome")).toBeNull();
  expect(button("上一步").disabled).toBe(true);
  expect(button("下一步").disabled).toBe(false);
  click("生成访问令牌");
  expect(host.textContent).toContain("预览模式下无法执行此操作");
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("shows administrator security guidance in both languages", async () => {
  expect(host.querySelector(".setup-auth-tagline")?.textContent).toContain("管理员访问");
  expect(host.querySelectorAll(".setup-auth-intro")).toHaveLength(2);
  expect(host.textContent).toContain(".kgos/auth.json");
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
  expect(host.textContent).toContain("administrator credential");
  expect(button("Generate access token")).toBeDefined();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("navigates to the public origin and validates the configured MCP URL", () => {
  click("下一步");
  expect(host.querySelector("h1")?.textContent).toBe("配置对外访问地址");
  const card = host.querySelector(".setup-public-card");
  expect(card?.classList.contains("setup-vector-card")).toBe(true);
  expect(card?.querySelector(".setup-vector-card-header h2")?.textContent).toBe("服务地址");
  expect(host.textContent).toContain("MCP 连接地址");
  fill("setup-public-origin", "http://example.com");
  expect(button("下一步").disabled).toBe(true);
  fill("setup-public-origin", "https://kgos.example.com/");
  expect(button("下一步").disabled).toBe(false);
  click("下一步");
  expect(host.querySelector("h1")?.textContent).toBe("配置向量服务");
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("shows vector setup fields, help text, and real verification affordance", () => {
  click("下一步");
  click("下一步");
  expect(host.querySelector(".setup-vector-tagline")?.textContent).toContain(
    "让知识不仅能够被连接"
  );
  expect(host.querySelector(".setup-title-vector")?.textContent).toContain("语义检索");
  expect(host.querySelectorAll(".setup-vector-card")).toHaveLength(2);
  expect(host.querySelector("label[for=setup-key]")?.textContent).toContain("选填");
  expect(host.querySelector<HTMLInputElement>("#setup-model")?.value).toBe(
    "qwen/qwen3-embedding-8b"
  );
  expect(host.querySelector<HTMLInputElement>("#setup-dimensions")?.value).toBe("4096");
  expect(button("验证配置").disabled).toBe(false);
  click("验证配置");
  expect(message("error")?.textContent).toContain("预览模式下无法执行此操作");
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("preserves vector draft, language preference and stable footer on back navigation", async () => {
  const progress = host.querySelector(PROGRESS_SELECTOR);
  click("下一步");
  click("下一步");
  fill("setup-key", "local-preview-only");
  click("上一步");
  click("下一步");
  expect(host.querySelector<HTMLInputElement>("#setup-key")?.value).toBe("local-preview-only");
  expect(host.querySelector(PROGRESS_SELECTOR)).toBe(progress);
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(button("Test connection").disabled).toBe(false);
  expect(host.querySelector(".setup-vector-validation-description")?.textContent).toContain(
    "real Embedding request"
  );
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("never treats the second click in a double-click gesture as an Embedding test", () => {
  click("下一步");
  act(() => {
    button("下一步").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    );
  });
  expect(host.querySelector("h1")?.textContent).toBe("配置向量服务");
  const second = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 });
  act(() => {
    button("验证配置").dispatchEvent(second);
  });
  expect(second.defaultPrevented).toBe(true);
  expect(message("error")).toBeNull();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

function message(type: string) {
  return document.querySelector(
    `[data-slot="toast"][data-type="${type}"]:not([data-ending-style])`
  );
}
