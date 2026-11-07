import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import type { SettingsSnapshot } from "../../packages/web/src/features/settings/settings-types.js";

export function readOnlySettingsSnapshot(): SettingsSnapshot {
  const config = {
    server: { public_origin: "https://kgos.example.com" },
    cache: { path: "cache/vectors.db", max_size_mb: 4096 },
    sqlite: { extensions: [] },
    fulltext: { analyzer: "jieba" },
    embedding: {
      base_url: "https://embedding.example.com/v1",
      model: "acceptance-model",
      dimensions: 1536,
      similarity: "cosine",
      api_key_env: "KGOS_WEB_EMBEDDING_API_KEY"
    }
  };
  return {
    revision: "shell-acceptance-revision",
    effective: config,
    saved: structuredClone(config),
    pendingRestart: false,
    credential: {
      source: "private_file",
      configured: true,
      canUpdate: true,
      pendingRestart: false
    },
    runtime: {
      version: "shell-acceptance",
      platform: "Linux amd64",
      endpoint: "http://127.0.0.1:8787",
      mcpPath: "/mcp",
      parameters: []
    },
    databasePath: "/workspace/.kgos/kgos.db"
  };
}

export async function openPreferenceSettings(page: Page) {
  // Observability also uses this visual class; select the actual Settings
  // action by accessible name rather than a shared decorative class.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Settings", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('[data-settings-category="display"]')).toHaveAttribute(
    "aria-current",
    "page"
  );
  return dialog;
}

export async function selectChineseLanguage(dialog: Locator) {
  await dialog
    .getByRole("group", { name: "Interface language" })
    .getByRole("button", { name: "简体中文", exact: true })
    .click();
}

export async function closePreferenceSettings(page: Page) {
  await page.locator(".settings-dialog .settings-close").click();
  await expect(page.locator(".settings-dialog")).toBeHidden();
}
