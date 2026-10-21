// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, expect, it } from "vitest";

import { i18n } from "./i18n/index.js";
import { SetupInitializeFields } from "../features/setup/setup-initialize.js";
import type { SetupStatus } from "../features/setup/setup-api.js";
import { initialDraft } from "../features/setup/setup-steps.js";

let host: HTMLDivElement;
let root: Root;

const draft = {
  ...initialDraft,
  publicOrigin: "https://kgos.example.com",
  key: "test-secret-must-not-be-displayed"
};

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function renderReview(status: SetupStatus, verified: boolean) {
  act(() => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <SetupInitializeFields draft={draft} status={status} verified={verified} />
      </I18nextProvider>
    );
  });
}

it("groups real settings and shows verification only when it actually succeeded", () => {
  renderReview(
    { state: "setup_required", credentialConfigured: true, mcpPath: "/custom-mcp" },
    true
  );
  expect(host.querySelectorAll(".setup-review-card")).toHaveLength(2);
  expect(host.querySelector(".setup-review-card")?.textContent).toContain(
    "https://kgos.example.com/custom-mcp"
  );
  expect(host.querySelector(".setup-review-verified")?.textContent).toContain("verified");
  expect(host.querySelectorAll(".setup-review-basics dl > div")).toHaveLength(3);
  expect(host.textContent).toContain("API key configured");
  expect(host.textContent).toContain("4 GiB");
  expect(host.textContent).not.toContain(draft.key);

  renderReview({ state: "setup_required", credentialConfigured: true }, false);
  expect(host.querySelector(".setup-review-verified")).toBeNull();
  expect(host.textContent).toContain("https://kgos.example.com/mcp");
});

it("shows actual initialization phases without inventing saved draft settings", () => {
  renderReview({ state: "initializing", credentialConfigured: true, phase: "database" }, false);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("Database");
  expect(host.querySelectorAll(".setup-review-card")).toHaveLength(0);
});

it("keeps failures and existing data distinct from a new configuration review", async () => {
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  renderReview(
    {
      state: "error",
      credentialConfigured: true,
      message: "配置已保留，请检查服务状态"
    },
    false
  );
  expect(host.querySelector('[role="status"]')?.textContent).toContain(
    "配置已保留，请检查服务状态"
  );
  expect(host.querySelector(".setup-review-card")).toBeNull();
  expect(host.textContent).not.toContain(draft.key);
});
