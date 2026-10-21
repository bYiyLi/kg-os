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

it("renders a welcoming, non-dismissible five-step wizard", () => {
  expect(host.querySelector("h1")?.textContent).toBe("欢迎使用 KG OS");
  expect(host.querySelector(".setup-welcome-kicker")).toBeNull();
  expect(host.querySelector(".setup-preview-notice")).toBeNull();
  expect(host.querySelector("dialog")).toBeNull();
  expect(host.querySelectorAll(".setup-step-dot")).toHaveLength(5);
  expect(host.querySelector(PROGRESS_SELECTOR)?.textContent).toContain("第 1 步，共 5 步");
  expect(button("上一步").disabled).toBe(true);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("describes four knowledge capabilities and four remaining initialization steps", () => {
  const welcome = host.querySelector(".setup-welcome");
  expect(welcome).not.toBeNull();
  expect(welcome?.querySelector("h1")?.textContent).toBe("欢迎使用 KG OS");
  expect(welcome?.textContent).toContain("为 AI 构建可持续演进的知识世界");
  expect(welcome?.textContent).toContain("面向 AI 的可编程知识图基础设施");
  expect(welcome?.textContent).toContain("版本历史");
  expect(welcome?.querySelectorAll(".setup-welcome-card")).toHaveLength(4);
  expect(
    Array.from(
      welcome?.querySelectorAll(".setup-welcome-card h3") ?? [],
      (node) => node.textContent
    )
  ).toEqual([
    "自由定义知识结构",
    "连接、查询与发现知识",
    "让知识持续演进",
    "为 AI 而设计，由人掌控"
  ]);
  expect(welcome?.querySelectorAll(".setup-welcome-next li")).toHaveLength(4);
  expect(host.querySelector(PROGRESS_SELECTOR)?.closest(".setup-footer")).not.toBeNull();
  expect(button("开始设置").disabled).toBe(false);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("translates the welcome content without changing the next-step controls", async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  const welcome = host.querySelector(".setup-welcome");
  expect(welcome?.querySelector("h1")?.textContent).toBe("Welcome to KG OS");
  expect(welcome?.textContent).toContain("Build an evolving world of knowledge for AI");
  expect(welcome?.textContent).toContain("programmable knowledge graph infrastructure");
  expect(welcome?.querySelectorAll(".setup-welcome-card")).toHaveLength(4);
  expect(welcome?.querySelectorAll(".setup-welcome-next li")).toHaveLength(4);
  expect(button("Get started").disabled).toBe(false);
  expect(host.querySelector(PROGRESS_SELECTOR)?.closest(".setup-footer")).not.toBeNull();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("uses the vector card styling and clear access guidance on the address step", () => {
  click("开始设置");
  const card = host.querySelector(".setup-public-card");
  expect(card?.classList.contains("setup-vector-card")).toBe(true);
  expect(card?.querySelector(".setup-vector-card-header h2")?.textContent).toBe("服务地址");
  expect(host.querySelector(".setup-vector-tagline")?.textContent).toContain("统一入口");
  expect(host.querySelectorAll(".setup-vector-intro")).toHaveLength(2);
  expect(host.textContent).toContain("MCP 连接地址");
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("does not interpret the second pointer click as vector verification after navigation", () => {
  click("开始设置");
  act(() => {
    button("下一步").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })
    );
  });
  expect(host.querySelector("h1")?.textContent).toBe("配置向量服务");
  const duplicate = new MouseEvent("click", { bubbles: true, cancelable: true, detail: 2 });
  act(() => {
    button("验证配置").dispatchEvent(duplicate);
  });
  expect(duplicate.defaultPrevented).toBe(true);
  expect(message("error")).toBeNull();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("explains semantic search, the vector settings and real verification without redundant field hints", () => {
  click("开始设置");
  click("下一步");
  const intro = host.querySelector(".setup-title-vector");
  expect(intro?.textContent).toContain("让知识不仅能够被连接，也能够被发现");
  expect(intro?.textContent).toContain("语义检索从文本的含义出发");
  expect(intro?.textContent).toContain("也可以连接自己的服务和模型");
  const cards = host.querySelectorAll(".setup-vector-card");
  expect(cards).toHaveLength(2);
  expect(cards[0]?.textContent).toContain("如需身份认证，再提供 API Key");
  expect(cards[1]?.textContent).toContain("向量维度必须与模型输出一致");
  expect(host.querySelectorAll(".setup-vector-card-icon")).toHaveLength(0);
  expect(host.querySelectorAll(".setup-vector-card .setup-field > p")).toHaveLength(0);
  expect(host.querySelector("label[for=setup-key]")?.textContent).toContain("选填");
  expect(host.querySelector("#setup-vector-validation-title")?.textContent).toBe("验证向量服务");
  expect(host.querySelector(".setup-vector-validation-description")?.textContent).toContain(
    "真实的 Embedding 请求"
  );
  expect(host.querySelector(".setup-vector-validation-status")).toBeNull();
  expect(host.querySelector(".setup-vector-immutable")).toBeNull();
  expect(button("验证配置").disabled).toBe(false);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("shows the richer vector copy in English without changing its settings", async () => {
  click("开始设置");
  click("下一步");
  await act(async () => {
    await i18n.changeLanguage("en");
  });
  expect(host.querySelector(".setup-vector-tagline")?.textContent).toContain(
    "Find knowledge by meaning"
  );
  expect(host.querySelector(".setup-vector-card-header p")?.textContent).toContain(
    "KG OS uses this API"
  );
  expect(host.querySelector(".setup-vector-validation-description")?.textContent).toContain(
    "real Embedding request"
  );
  expect(host.querySelector<HTMLInputElement>("#setup-model")?.value).toBe(
    "qwen/qwen3-embedding-8b"
  );
  expect(host.querySelector<HTMLInputElement>("#setup-dimensions")?.value).toBe("4096");
  expect(button("Test connection").disabled).toBe(false);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("keeps the vector draft and stable footer when navigating", () => {
  const progress = host.querySelector(PROGRESS_SELECTOR);
  click("开始设置");
  click("下一步");
  expect(host.querySelector("h1")?.textContent).toBe("配置向量服务");
  fill("setup-key", "not-saved");
  click("验证配置");
  expect(message("error")?.textContent).toContain("验证失败");
  expect(message("error")?.textContent).toContain("预览模式下无法执行此操作。");
  expect(host.querySelector('[role="alert"]')).toBeNull();
  click("上一步");
  click("下一步");
  expect(host.querySelector<HTMLInputElement>("#setup-key")?.value).toBe("not-saved");
  expect(host.querySelector(PROGRESS_SELECTOR)).toBe(progress);
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

it("does not claim a real administrator token in preview mode", () => {
  click("开始设置");
  click("下一步");
  click("验证配置");
  expect(message("error")?.textContent).toContain("验证失败");
  expect(message("error")?.textContent).toContain("预览模式下无法执行此操作。");
  expect(host.querySelector("h1")?.textContent).toBe("配置向量服务");
  click("浅色主题");
  expect(host.querySelector(".setup-page.theme-light")).not.toBeNull();
  expect(vi.mocked(fetch)).not.toHaveBeenCalled();
});

function message(type: string) {
  return document.querySelector(
    `[data-slot="toast"][data-type="${type}"]:not([data-ending-style])`
  );
}
