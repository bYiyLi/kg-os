// @vitest-environment jsdom
// cspell:words qwen qwen3

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { UiProvider } from "../shared/ui/ui-provider.js";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import {
  SetupAuthenticationRequired,
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
  SetupAuthenticationRequired: class SetupAuthenticationRequired extends Error {},
  loginSetup: vi.fn(),
  readSetupStatus: vi.fn(),
  restoreSetup: vi.fn(),
  rotateSetupToken: vi.fn(),
  submitSetup: vi.fn(),
  testEmbeddingProvider: vi.fn()
}));

const access = {
  accessToken: "kgws_" + "A".repeat(43),
  daemonBootId: "e48245ac-51a4-4b6b-93ba-07bb4d0626a6"
};
const fresh: SetupStatus = { state: "setup_required", credentialConfigured: false };
const claimed: SetupStatus = { state: "setup_required", credentialConfigured: true };
const firstToken = "new-instance-root-token";
const rotatedToken = "new-rotated-root-token";
const connectionTest = "Test connection";

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  vi.resetAllMocks();
  vi.mocked(readSetupStatus).mockResolvedValue(fresh);
  vi.mocked(restoreSetup).mockRejectedValue(new Error("Session unavailable"));
  vi.mocked(rotateSetupToken).mockResolvedValue(firstToken);
  vi.mocked(loginSetup).mockResolvedValue(access);
  vi.mocked(testEmbeddingProvider).mockResolvedValue({ ok: true, dimensions: 4096 });
  vi.mocked(submitSetup).mockResolvedValue(undefined);
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

async function render(status: SetupStatus = fresh, previewOnly = false) {
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

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent.trim() === label || item.getAttribute("aria-label") === label
  );
  if (found === undefined) throw new Error("Button not found: " + label);
  return found;
}

async function press(label: string) {
  await act(async () => {
    button(label).click();
    await Promise.resolve();
  });
}

async function change(selector: string, value: string) {
  const control = host.querySelector<HTMLInputElement>(selector);
  if (control === null) throw new Error("Input not found: " + selector);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  await act(async () => {
    descriptor?.set?.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    await Promise.resolve();
  });
}

async function createToken() {
  await press("Generate access token");
  expect(vi.mocked(rotateSetupToken)).toHaveBeenCalledWith();
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith(firstToken);
}

async function advanceToVector() {
  await createToken();
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe("Configure external access");
  await press("Next");
  expect(host.querySelector("#setup-url")).not.toBeNull();
}

it("starts directly with administrator Token, not an anonymous vector probe", async () => {
  await render();
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
  expect(button("Next").disabled).toBe(true);
  expect(host.querySelector("#setup-url")).toBeNull();
  expect(vi.mocked(testEmbeddingProvider)).not.toHaveBeenCalled();
  await createToken();
  expect(button("Next").disabled).toBe(false);
  expect(host.querySelector<HTMLInputElement>("#setup-issued-token")?.value).toBe(firstToken);
});

it("proceeds Token -> Origin -> verified Embedding -> initialization", async () => {
  await render();
  await advanceToVector();
  await change("#setup-key", "private-provider-credential");
  await press(connectionTest);
  expect(vi.mocked(testEmbeddingProvider)).toHaveBeenCalledWith(
    expect.objectContaining({
      url: "https://newapi.y2l.top/v1",
      key: "private-provider-credential"
    }),
    expect.any(AbortSignal),
    access
  );
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe("Review settings and initialize");
  await press("Initialize knowledge base");
  expect(vi.mocked(submitSetup)).toHaveBeenCalledWith(
    access,
    expect.objectContaining({
      server: { public_origin: window.location.origin },
      embedding: {
        base_url: "https://newapi.y2l.top/v1",
        model: "qwen/qwen3-embedding-8b",
        dimensions: 4096,
        similarity: "cosine"
      }
    }),
    "private-provider-credential"
  );
});

it("does not continue past vector setup until a real matching verification succeeds", async () => {
  vi.mocked(testEmbeddingProvider).mockResolvedValueOnce({
    ok: false,
    reason: "dimensions_mismatch",
    dimensions: 3
  });
  await render();
  await advanceToVector();
  await press(connectionTest);
  expect(host.querySelector("h1")?.textContent).toContain("vector");
  expect(button(connectionTest)).toBeDefined();
  await press(connectionTest);
  await press("Next");
  expect(host.querySelector("h1")?.textContent).toBe("Review settings and initialize");
});

it("invalidates previous verification when the Embedding URL changes", async () => {
  await render();
  await advanceToVector();
  await press(connectionTest);
  await change("#setup-url", "https://other.example.org/v1");
  expect(button(connectionTest)).toBeDefined();
  expect(vi.mocked(submitSetup)).not.toHaveBeenCalled();
});

it("existing credentials require sign in; anonymous regeneration is unavailable", async () => {
  await render(claimed);
  expect(button("Next").disabled).toBe(true);
  expect(button("Regenerate access token").disabled).toBe(true);
  expect(vi.mocked(rotateSetupToken)).not.toHaveBeenCalled();
  await change("#setup-existing-token", "existing-root-token");
  await press("Sign in");
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith("existing-root-token");
  expect(vi.mocked(readSetupStatus)).toHaveBeenCalledWith(undefined, access);
});

it("requires the original Token if another browser claimed the Instance first", async () => {
  vi.mocked(rotateSetupToken).mockRejectedValueOnce(new SetupAuthenticationRequired());
  await render();
  await press("Generate access token");
  expect(button("Next").disabled).toBe(true);
  expect(host.querySelector("#setup-existing-token")).not.toBeNull();
  expect(button("Regenerate access token").disabled).toBe(true);
});

it("rotates only while authenticated and replaces the displayed token", async () => {
  await render();
  await createToken();
  vi.mocked(rotateSetupToken).mockResolvedValueOnce(rotatedToken);
  await press("Regenerate access token");
  expect(vi.mocked(rotateSetupToken)).toHaveBeenLastCalledWith(access);
  expect(vi.mocked(loginSetup)).toHaveBeenCalledWith(rotatedToken);
  expect(host.querySelector<HTMLInputElement>("#setup-issued-token")?.value).toBe(rotatedToken);
});

it("restores a previous Web Session for an existing instance", async () => {
  vi.mocked(restoreSetup).mockResolvedValueOnce(access);
  vi.mocked(readSetupStatus).mockResolvedValueOnce(claimed);
  await render(claimed);
  expect(vi.mocked(restoreSetup)).toHaveBeenCalledOnce();
  expect(button("Next").disabled).toBe(false);
});

it("a failed first login retains the newly issued token for retry", async () => {
  vi.mocked(loginSetup).mockRejectedValueOnce(new Error("Cannot establish Session"));
  await render();
  await press("Generate access token");
  expect(host.textContent).toContain("Cannot establish Session");
  expect(button("Next").disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>("#setup-issued-token")?.value).toBe(firstToken);
  await press("Sign in");
  expect(vi.mocked(loginSetup)).toHaveBeenCalledTimes(2);
  expect(button("Next").disabled).toBe(false);
});

it("a failed rotation stops using the potentially stale Session", async () => {
  await render();
  await createToken();
  vi.mocked(rotateSetupToken).mockRejectedValueOnce(new Error("Rotation uncertain"));
  await press("Regenerate access token");
  expect(host.textContent).toContain("Rotation uncertain");
  expect(button("Next").disabled).toBe(true);
});

it("copies the one-time token without exposing it in Toast text", async () => {
  await render();
  await createToken();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  await press("Copy token");
  expect(writeText).toHaveBeenCalledWith(firstToken);
  expect(host.textContent).not.toContain(firstToken);
});

it("preview never creates credentials or contacts an Embedding API", async () => {
  await render(fresh, true);
  await press("Generate access token");
  expect(vi.mocked(rotateSetupToken)).not.toHaveBeenCalled();
  expect(vi.mocked(testEmbeddingProvider)).not.toHaveBeenCalled();
  expect(button("Next").disabled).toBe(false);
});

it("restores an interrupted configured instance using the authenticated resume path", async () => {
  const errorState: SetupStatus = {
    state: "error",
    credentialConfigured: true,
    message: "Bootstrap stopped"
  };
  vi.mocked(restoreSetup).mockResolvedValueOnce(access);
  vi.mocked(readSetupStatus).mockResolvedValueOnce(errorState);
  await render(errorState);
  await press("Next");
  expect(host.textContent).toContain("If initialization stopped");
  await press("Initialize knowledge base");
  expect(vi.mocked(submitSetup)).toHaveBeenCalledWith(access, undefined, undefined);
});

it("offers existing-token login when config-first initialization has no Web Session", async () => {
  await render({ state: "initializing", credentialConfigured: true, phase: "database" });
  expect(host.querySelector("h1")?.textContent).toBe("Protect your KG OS Instance");
  expect(host.querySelector("#setup-existing-token")).not.toBeNull();
  expect(button("Next").disabled).toBe(true);
});

it("shows initialization progress once an existing administrator Session is restored", async () => {
  vi.mocked(restoreSetup).mockResolvedValueOnce(access);
  vi.mocked(readSetupStatus).mockResolvedValueOnce({
    state: "initializing",
    credentialConfigured: true,
    phase: "database"
  });
  await render({ state: "initializing", credentialConfigured: true, phase: "database" });
  expect(host.querySelector("h1")?.textContent).toBe("Preparing your KG OS");
  expect(button("Initialize knowledge base").disabled).toBe(true);
  expect(button("Back").disabled).toBe(true);
});
