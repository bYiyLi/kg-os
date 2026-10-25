import { act } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { vi } from "vitest";
import { KGOSClient } from "@kgos/sdk";

import type { Connection } from "../src/core/client/connect.js";
import type { ThemePreference } from "../src/shared/lib/use-theme-preference.js";
import { UiProvider } from "../src/shared/ui/ui-provider.js";
import { SettingsDialog } from "../src/features/settings/settings-dialog.js";
import type {
  SettingsCategory,
  SettingsFetch,
  SettingsSnapshot
} from "../src/features/settings/settings-types.js";
import { TranslationProvider } from "./translation-provider.js";
import { i18n } from "../src/app/i18n/index.js";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

export function snapshot(): SettingsSnapshot {
  const config = {
    server: { public_origin: "https://kg.example.com" },
    cache: { path: "cache/vectors.db", max_size_mb: 4096 },
    sqlite: { extensions: [] },
    fulltext: { analyzer: "jieba" },
    embedding: {
      base_url: "https://api.example.com/v1",
      model: "fixture-embedding-model",
      dimensions: 1536,
      similarity: "cosine",
      api_key_env: "KGOS_WEB_EMBEDDING_API_KEY"
    }
  };
  return {
    revision: "fixture-revision",
    effective: structuredClone(config),
    saved: structuredClone(config),
    pendingRestart: false,
    credential: {
      source: "private_file",
      configured: true,
      canUpdate: true,
      pendingRestart: false
    },
    runtime: {
      version: "fixture-version",
      platform: "Linux amd64",
      endpoint: "http://127.0.0.1:8787",
      mcpPath: "/mcp",
      parameters: [
        { key: "mcp-request-timeout-ms", value: "30000", source: "default" },
        { key: "mcp-max-concurrency", value: "16", source: "KGOS_MCP_MAX_CONCURRENCY" },
        { key: "mcp-max-request-bytes", value: "1048576", source: "default" },
        { key: "log-level", value: "INFO", source: "KGOS_LOG_LEVEL" }
      ]
    },
    databasePath: "/workspace/.kgos/kgos.db"
  };
}

export function response(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function connection(fetcher: SettingsFetch): Connection {
  return {
    client: new KGOSClient({ endpoint: "http://localhost", token: "fixture-access" }),
    defaultBranch: "main",
    state: "commit/fixture",
    daemonBootId: "b0bc0960-6330-4c5e-ae29-3b90e2056147",
    storageStatus: "unsupported",
    settingsFetch: fetcher,
    oauthFetch: vi.fn().mockRejectedValue(new Error("Unexpected OAuth call")),
    check: () => Promise.resolve(),
    close: vi.fn()
  };
}

export async function mountSettings(
  fetcher: SettingsFetch,
  options: {
    connection?: null;
    preference?: ThemePreference;
    languageControl?: ReactNode;
  } = {}
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  await i18n.changeLanguage("en");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  const onOpenChange = vi.fn<(open: boolean) => void>();
  const onSelectTheme = vi.fn<(value: ThemePreference) => void>();
  const onDisconnect = vi.fn();
  const activeConnection = options.connection === null ? null : connection(fetcher);
  await act(async () => {
    root?.render(
      <TranslationProvider>
        <UiProvider>
          <SettingsDialog
            open
            onOpenChange={onOpenChange}
            connection={activeConnection}
            preference={options.preference ?? "system"}
            onSelectTheme={onSelectTheme}
            onDisconnect={onDisconnect}
            languageControl={
              options.languageControl ?? <span data-language-control>Language control</span>
            }
          />
        </UiProvider>
      </TranslationProvider>
    );
    await Promise.resolve();
  });
  return { onOpenChange, onSelectTheme, onDisconnect };
}

export function disposeSettings() {
  act(() => {
    root?.unmount();
  });
  root = null;
  host?.remove();
  host = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

export function button(label: string): HTMLButtonElement {
  const found = Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find(
    (element) =>
      element.getAttribute("aria-label") === label || element.textContent.trim() === label
  );
  if (found === undefined) throw new Error("Missing button: " + label);
  return found;
}

export async function click(label: string) {
  await act(async () => {
    button(label).click();
    await Promise.resolve();
  });
}

export async function nav(category: SettingsCategory) {
  const target = document.body.querySelector<HTMLButtonElement>(
    "[data-settings-category='" + category + "']"
  );
  if (target === null) throw new Error("Missing settings category");
  await act(async () => {
    target.click();
    await Promise.resolve();
  });
}

export function field(label: string, index = 0): HTMLInputElement {
  const labels = Array.from(document.body.querySelectorAll("label")).filter((item) =>
    item.textContent.startsWith(label)
  );
  const target = labels[index]?.querySelector("input");
  if (target === null || target === undefined) throw new Error("Missing input: " + label);
  return target;
}

export function input(label: string, value: string, index = 0) {
  const target = field(label, index);
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (descriptor?.set === undefined) throw new Error("Input setter unavailable");
  act(() => {
    descriptor.set?.call(target, value);
    target.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function text() {
  return document.body.textContent;
}

export async function changeLanguage(locale: string) {
  await act(async () => {
    await i18n.changeLanguage(locale);
  });
}
