// @vitest-environment jsdom
// cspell:words qwen qwen3

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { UiProvider } from "../shared/ui/ui-provider.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  claimSetupToken,
  loginSetup,
  readSetupStatus,
  restoreSetup,
  rotateSetupToken,
  submitSetup,
  testEmbeddingProvider
} from "../features/setup/setup-api.js";
import type { SetupStatus } from "../features/setup/setup-api.js";
import { SetupWizard } from "../features/setup/setup-wizard.js";
import { i18n } from "./i18n/index.js";

vi.mock("../features/setup/setup-api.js", () => ({
  claimSetupToken: vi.fn(),
  loginSetup: vi.fn(),
  readSetupStatus: vi.fn(),
  restoreSetup: vi.fn(),
  rotateSetupToken: vi.fn(),
  submitSetup: vi.fn(),
  testEmbeddingProvider: vi.fn()
}));

const validAccess = {
  daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6",
  accessToken: "kgws_" + "A".repeat(43)
};
const ALERT = '[role="alert"]';
const GENERATE = "Generate access token";
const REGENERATE = "Regenerate access token";
const ROTATED_TOKEN = "new-rotated-root-token";
const ISSUED_TOKEN = "new-instance-root-token";
const ISSUED_FIELD = "#setup-issued-token";
const INITIALIZE = "Initialize knowledge base";
const TEST_CONNECTION = "Test connection";
const URL_SELECTOR = "#setup-url";
const GET_STARTED = "Get started";
const KEY_SELECTOR = "#setup-key";
const DIMENSIONS_SELECTOR = "#setup-dimensions";

const freshStatus: SetupStatus = { state: "setup_required", credentialConfigured: false };

let host: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  vi.resetAllMocks();
  vi.mocked(readSetupStatus).mockResolvedValue(freshStatus);
  vi.mocked(restoreSetup).mockRejectedValue(new Error("No existing Session"));
  vi.mocked(claimSetupToken).mockResolvedValue(ISSUED_TOKEN);
  vi.mocked(rotateSetupToken).mockResolvedValue(ROTATED_TOKEN);
  vi.mocked(loginSetup).mockResolvedValue(validAccess);
  vi.mocked(submitSetup).mockResolvedValue(undefined);
  vi.mocked(testEmbeddingProvider).mockResolvedValue({ ok: true, dimensions: 4096 });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function render(status: SetupStatus = freshStatus, previewOnly = false) {
  await act(async () => {
    root.render(
      <I18nextProvider i18n={i18n}>
        <UiProvider>
          <SetupWizard initialStatus={status} previewOnly={previewOnly} />
        </UiProvider>
      </I18nextProvider>
    );
    await Promise.resolve();
  });
}

function button(name: string): HTMLButtonElement {
  const control = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent.trim() === name || item.getAttribute("aria-label") === name
  );
  if (control === undefined) throw new Error("Missing setup button: " + name);
  return control;
}

async function press(name: string) {
  await act(async () => {
    button(name).click();
    await Promise.resolve();
  });
}

async function withClipboard(
  writeText: (token: string) => Promise<void>,
  action: () => Promise<void>
) {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  try {
    await action();
  } finally {
    if (original === undefined) Reflect.deleteProperty(navigator, "clipboard");
    else Object.defineProperty(navigator, "clipboard", original);
  }
}

async function changeValue(selector: string, value: string) {
  if (selector === "#setup-similarity") {
    await act(async () => {
      host.querySelector<HTMLButtonElement>(selector)?.click();
      await Promise.resolve();
    });
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]')).find(
      (item) => item.textContent === i18n.t("setup." + value)
    );
    if (option === undefined) throw new Error("Missing similarity option");
    await act(async () => {
      option.click();
      await Promise.resolve();
    });
    return;
  }
  const control = host.querySelector<HTMLInputElement | HTMLSelectElement>(selector);
  if (control === null) throw new Error("Missing setup input: " + selector);
  const prototype =
    control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Input cannot be changed");
  await act(async () => {
    descriptor.set?.call(control, value);
    control.dispatchEvent(
      new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })
    );
    await Promise.resolve();
  });
}

async function moveToAuth() {
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
}

it("requires real verification after checking vector parameters", async () => {
  await render();
  await press(GET_STARTED);
  await press("Next");
  await changeValue(URL_SELECTOR, "invalid-url");
  await press(TEST_CONNECTION);
  expect(message("error")?.textContent).toContain("Verification failed");
  expect(message("error")?.textContent).toContain(
    "Check the API URL, model, dimensions and API key."
  );
  for (const invalid of ["wrong-url", "ftp://example.com", "https://example.com/v1?x=1"]) {
    await changeValue(URL_SELECTOR, invalid);
    await press(TEST_CONNECTION);
    expect(host.querySelector("h1")?.textContent).toBe("Connect your vector service");
  }
  await changeValue(URL_SELECTOR, "https://api.example.com/v1");
  await changeValue("#setup-model", "");
  await press(TEST_CONNECTION);
  expect(message("error")).not.toBeNull();
  await changeValue("#setup-model", "my-model");
  for (const dimension of ["0", "4097", "2.5"]) {
    await changeValue(DIMENSIONS_SELECTOR, dimension);
    await press(TEST_CONNECTION);
    expect(button(TEST_CONNECTION)).toBeDefined();
  }
  await changeValue(DIMENSIONS_SELECTOR, "4096");
  await changeValue("#setup-similarity", "euclidean");
  await press(TEST_CONNECTION);
  expect(button("Next").disabled).toBe(false);
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
  expect(vi.mocked(claimSetupToken)).not.toHaveBeenCalled();
});

it("prefills Qwen and invalidates verification after any field change", async () => {
  await render();
  await press(GET_STARTED);
  await press("Next");
  expect(host.querySelector<HTMLInputElement>(URL_SELECTOR)?.value).toBe(
    "https://newapi.y2l.top/v1"
  );
  expect(host.querySelector<HTMLInputElement>("#setup-model")?.value).toBe(
    "qwen/qwen3-embedding-8b"
  );
  expect(host.querySelector<HTMLInputElement>(DIMENSIONS_SELECTOR)?.value).toBe("4096");
  expect(host.querySelector("#setup-similarity")?.textContent).toBe(i18n.t("setup.cosine"));
  expect(host.querySelectorAll(".setup-vector-card")).toHaveLength(2);
  expect(host.querySelector(".setup-vector-validation-description")?.textContent).toContain(
    "real Embedding request"
  );
  expect(host.querySelector(".setup-vector-validation-status")).toBeNull();
  await press(TEST_CONNECTION);
  expect(vi.mocked(testEmbeddingProvider)).toHaveBeenCalledOnce();
  expect(vi.mocked(testEmbeddingProvider).mock.calls[0]?.[0]).toMatchObject({ key: "" });
  expect(message("success")?.textContent).toContain("Verified · Model output 4096 dimensions");
  await changeValue(KEY_SELECTOR, "user-api-key");
  expect(host.querySelector(".setup-vector-validation-status")).toBeNull();
  expect(message("success")).toBeNull();
  await press(TEST_CONNECTION);
  expect(button("Next").disabled).toBe(false);
});

it("requires a successful remote test before unlocking Next", async () => {
  vi.mocked(testEmbeddingProvider)
    .mockResolvedValueOnce({ ok: false, reason: "authentication_failed", httpStatus: 401 })
    .mockResolvedValueOnce({ ok: false, reason: "dimensions_mismatch", dimensions: 1536 })
    .mockResolvedValueOnce({ ok: true, dimensions: 4096 });
  await render();
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  expect(message("error")?.textContent).toContain("Verification failed");
  expect(message("error")?.textContent).toContain("Missing or invalid API key (HTTP 401).");
  expect(button(TEST_CONNECTION)).toBeDefined();
  await press(TEST_CONNECTION);
  expect(message("error")?.textContent).toContain("Verification failed");
  expect(message("error")?.textContent).toContain(
    "The model returned 1536 dimensions, which does not match this setting."
  );
  expect(button(TEST_CONNECTION)).toBeDefined();
  await press(TEST_CONNECTION);
  expect(message("success")).not.toBeNull();
  expect(button("Next").disabled).toBe(false);
});

it("shows the setup state conflict rather than a misleading network failure", async () => {
  vi.mocked(testEmbeddingProvider).mockResolvedValueOnce({
    ok: false,
    reason: "setup_unavailable"
  });
  await render();
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  expect(message("error")?.textContent).toContain("no longer accepting verification");
  expect(message("error")?.textContent).not.toContain("Check your connection");
  expect(button(TEST_CONNECTION)).toBeDefined();
});

it("ignores stale success when the API address changes during a test", async () => {
  let resolveProbe: ((result: { ok: boolean; dimensions: number }) => void) | undefined;
  vi.mocked(testEmbeddingProvider).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveProbe = resolve;
      })
  );
  await render();
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  expect(button("Testing…").disabled).toBe(true);
  expect(message("loading")?.textContent).toContain("Verifying your vector service…");
  await changeValue(URL_SELECTOR, "https://new.example.org/v1");
  await act(async () => {
    if (resolveProbe !== undefined) {
      resolveProbe({ ok: true, dimensions: 4096 });
    }
    await Promise.resolve();
  });
  expect(button(TEST_CONNECTION)).toBeDefined();
  expect(host.querySelector(".setup-vector-validation-status")).toBeNull();
  expect(message("success")).toBeNull();
});

it("claims a root Token once, reviews the supplied settings and submits with Web Bearer", async () => {
  await render();
  await press(GET_STARTED);
  await press("Next");
  await changeValue(KEY_SELECTOR, "user-embedding-key");
  await press("Show secret");
  expect(host.querySelector<HTMLInputElement>(KEY_SELECTOR)?.type).toBe("text");
  await press("Hide secret");
  expect(host.querySelector<HTMLInputElement>(KEY_SELECTOR)?.type).toBe("password");
  await press(TEST_CONNECTION);
  await press("Next");
  expect(button("Next").disabled).toBe(true);
  expect(host.textContent).toContain("administrator credential");
  expect(host.textContent).toContain("takes effect immediately");
  expect(host.querySelectorAll(".setup-auth-intro")).toHaveLength(2);
  await press(GENERATE);
  expect(vi.mocked(claimSetupToken)).toHaveBeenCalledOnce();
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith(ISSUED_TOKEN);
  expect(button("Next").disabled).toBe(false);
  expect(host.textContent).toContain("Access token created");
  expect(button(REGENERATE).disabled).toBe(false);
  const issued = host.querySelector<HTMLInputElement>(ISSUED_FIELD);
  expect(issued?.value).toBe(ISSUED_TOKEN);
  await press("Show secret");
  expect(issued?.type).toBe("text");
  await press("Hide secret");
  expect(issued?.type).toBe("password");
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe(INITIALIZE);
  expect(host.textContent).toContain("API key configured");
  await press(INITIALIZE);
  expect(vi.mocked(submitSetup)).toHaveBeenCalledWith(
    validAccess,
    {
      server: { public_origin: "http://localhost:3000" },
      embedding: {
        base_url: "https://newapi.y2l.top/v1",
        model: "qwen/qwen3-embedding-8b",
        dimensions: 4096,
        similarity: "cosine"
      },
      cache: { path: "cache/openai-compatible.db", max_size_mb: 4096 },
      fulltext: { analyzer: "jieba" },
      sqlite: { extensions: [] }
    },
    "user-embedding-key"
  );
  expect(button(INITIALIZE).disabled).toBe(true);
  expect(host.textContent).toContain("Preparing your knowledge base");
});

it("keeps the same guidance and regenerates the token before setup", async () => {
  await render();
  await moveToAuth();
  const explanation = host.querySelector(".setup-title")?.textContent;
  const guidance = host.querySelector(".setup-auth-guidance")?.textContent;
  await press(GENERATE);
  await press(REGENERATE);
  expect(vi.mocked(rotateSetupToken).mock.calls).toEqual([[]]);
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith(ROTATED_TOKEN);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)?.value).toBe(ROTATED_TOKEN);
  expect(host.querySelector(".setup-title")?.textContent).toBe(explanation);
  expect(host.querySelector(".setup-auth-guidance")?.textContent).toBe(guidance);
  await press("Next");
  await press("Back");
  expect(host.querySelector(".setup-title")?.textContent).toBe(explanation);
  expect(button(REGENERATE).disabled).toBe(false);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)).toBeNull();
});

it("allows retry without old credentials if token regeneration does not complete", async () => {
  vi.mocked(rotateSetupToken).mockRejectedValueOnce(new Error("Regeneration unavailable"));
  await render();
  await moveToAuth();
  await press(GENERATE);
  await press(REGENERATE);
  expect(host.textContent).toContain("Regeneration unavailable");
  expect(button("Next").disabled).toBe(true);
  expect(button(REGENERATE).disabled).toBe(false);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)).toBeNull();
});

it("also regenerates while an existing Web Session is restored", async () => {
  vi.mocked(restoreSetup).mockResolvedValueOnce(validAccess);
  await render({ state: "setup_required", credentialConfigured: true });
  await moveToAuth();
  expect(button(REGENERATE).disabled).toBe(false);
  await press(REGENERATE);
  expect(vi.mocked(rotateSetupToken).mock.calls).toEqual([[]]);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)?.value).toBe(ROTATED_TOKEN);
});

it("does not claim or initialize during UI preview", async () => {
  await render(freshStatus, true);
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  expect(message("error")?.textContent).toContain("Verification failed");
  expect(message("error")?.textContent).toContain("This action is unavailable in preview mode.");
  expect(host.querySelector("h1")?.textContent).toBe("Connect your vector service");
  expect(vi.mocked(testEmbeddingProvider)).not.toHaveBeenCalled();
  expect(vi.mocked(claimSetupToken)).not.toHaveBeenCalled();
  expect(vi.mocked(submitSetup)).not.toHaveBeenCalled();
});

it("shows failed claim and Web Session exchange instead of granting access", async () => {
  vi.mocked(claimSetupToken).mockRejectedValueOnce(new Error("Failed to claim"));
  await render();
  await moveToAuth();
  await press(GENERATE);
  expect(host.querySelector(ALERT)?.textContent).toContain("Failed to claim");
  vi.mocked(loginSetup).mockRejectedValueOnce(new Error("Cannot establish Web Session"));
  await press(GENERATE);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)?.value).toBe(ISSUED_TOKEN);
  expect(host.querySelector(ALERT)?.textContent).toContain("Cannot establish Web Session");
  expect(button("Next").disabled).toBe(true);
  expect(host.textContent).toContain("not signed in");
  expect(host.textContent).not.toContain("authentication is complete");
  await press("Sign in");
  expect(vi.mocked(claimSetupToken)).toHaveBeenCalledTimes(2);
  expect(vi.mocked(loginSetup)).toHaveBeenCalledTimes(2);
  expect(host.textContent).toContain("authentication is complete");
  expect(button("Next").disabled).toBe(false);
});

it("copies the generated token with a localized success Toast", async () => {
  await render();
  await moveToAuth();
  await press(GENERATE);
  const writeText = vi.fn().mockResolvedValue(undefined);
  await withClipboard(writeText, async () => {
    await press("Copy token");
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText).toHaveBeenCalledWith(ISSUED_TOKEN);
    expect(message("success")?.textContent).toContain("Token copied");
    expect(message("success")?.textContent).not.toContain(ISSUED_TOKEN);
  });
});

it("offers manual copy when the browser blocks clipboard access", async () => {
  await render();
  await moveToAuth();
  await press(GENERATE);
  const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
  await act(async () => {
    await i18n.changeLanguage("zh-CN");
  });
  await withClipboard(writeText, async () => {
    await press("复制令牌");
    expect(message("error")?.textContent).toContain("复制失败");
    expect(message("error")?.textContent).not.toContain(ISSUED_TOKEN);
  });
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)?.value).toBe(ISSUED_TOKEN);
});

it("restores the administrator and resumes without rewriting TOML", async () => {
  const initial: SetupStatus = {
    state: "error",
    credentialConfigured: true,
    message: "Configuration preserved after interrupted Bootstrap"
  };
  vi.mocked(restoreSetup).mockResolvedValueOnce(validAccess);
  await render(initial);
  expect(vi.mocked(restoreSetup)).toHaveBeenCalledOnce();
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
  expect(host.textContent).toContain("Configuration preserved");
  expect(host.textContent).toContain("authentication is complete");
  await press("Next");
  expect(host.textContent).toContain("If initialization stopped");
  await press(INITIALIZE);
  expect(vi.mocked(submitSetup)).toHaveBeenCalledWith(validAccess, undefined, undefined);
  expect(host.textContent).toContain("Preparing your knowledge base");
});

it("regenerates an existing Instance Token with no Session and no credential input", async () => {
  await render({ state: "setup_required", credentialConfigured: true });
  await press(GET_STARTED);
  await press("Next");
  await press(TEST_CONNECTION);
  await press("Next");
  expect(host.querySelector<HTMLInputElement>("#setup-existing-token")).toBeNull();
  expect(button("Next").disabled).toBe(true);
  expect(button(REGENERATE).disabled).toBe(false);
  await press(REGENERATE);
  expect(vi.mocked(rotateSetupToken).mock.calls).toEqual([[]]);
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith(ROTATED_TOKEN);
  expect(host.querySelector<HTMLInputElement>(ISSUED_FIELD)?.value).toBe(ROTATED_TOKEN);
  expect(button("Next").disabled).toBe(false);
  await press("Next");
  await press(INITIALIZE);
  expect(vi.mocked(submitSetup)).toHaveBeenCalledWith(validAccess, expect.anything(), null);
});

it("does not display success when initialization has failed", async () => {
  vi.mocked(submitSetup).mockRejectedValueOnce(new Error("Database preparation failed"));
  await render();
  await moveToAuth();
  await press(GENERATE);
  await press("Next");
  await press(INITIALIZE);
  expect(host.querySelector(ALERT)?.textContent).toContain("Database preparation failed");
  expect(button(INITIALIZE).disabled).toBe(false);
});

it("does not offer a fresh administrator claim for a damaged existing Instance", async () => {
  await render({
    state: "error",
    credentialConfigured: false,
    message: "Instance has damaged database files"
  });
  expect(host.querySelector("h1")?.textContent).toBe("Instance needs attention");
  expect(host.textContent).toContain("Instance has damaged database files");
  expect(host.querySelector(".setup-footer")).toBeNull();
  expect(host.querySelectorAll(".setup-stepper .is-current")).toHaveLength(0);
  expect(vi.mocked(claimSetupToken)).not.toHaveBeenCalled();
});

it("shows the real initialization phase and blocks duplicate submission", async () => {
  await render({ state: "initializing", credentialConfigured: true, phase: "database" });
  expect(host.querySelector("h1")?.textContent).toBe(INITIALIZE);
  expect(host.textContent).toContain("Preparing your knowledge base");
  expect(host.textContent).toContain("Database");
  expect(button("Back").disabled).toBe(true);
  expect(button(INITIALIZE).disabled).toBe(true);
});

it("refreshes the visible bootstrap phase from status polling", async () => {
  vi.useFakeTimers();
  vi.mocked(readSetupStatus).mockResolvedValue({
    state: "initializing",
    credentialConfigured: true,
    phase: "readiness"
  });
  await render({ state: "initializing", credentialConfigured: true, phase: "extensions" });
  expect(host.textContent).toContain("Extensions");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1200);
  });
  expect(host.textContent).toContain("Readiness");
  expect(vi.mocked(readSetupStatus)).toHaveBeenCalledOnce();
});

function message(type: string) {
  return document.querySelector(
    `[data-slot="toast"][data-type="${type}"]:not([data-ending-style])`
  );
}
