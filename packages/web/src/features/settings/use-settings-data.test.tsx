// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { SettingsFetch, SettingsSnapshot } from "./settings-types.js";
import { useSettingsData } from "./use-settings-data.js";
import { SettingsRequestError } from "./settings-api.js";
import { useSettingsDraft } from "./use-settings-draft.js";

let model: ReturnType<typeof useSettingsData> | null;
let host: HTMLDivElement;
let root: Root;
let draft: ReturnType<typeof useSettingsDraft> | null = null;

function DraftHarness({ value }: { value: SettingsSnapshot }) {
  draft = useSettingsDraft(value, "storage");
  return null;
}

function storageDraft() {
  if (draft === null) throw new Error("Settings draft has not mounted");
  return draft;
}

function Harness({ fetcher }: { fetcher: SettingsFetch }) {
  model = useSettingsData(true, fetcher);
  return null;
}

function state() {
  if (model === null) throw new Error("Settings hook has not mounted");
  return model;
}

function snapshot(revision: string): SettingsSnapshot {
  const config = {
    server: { public_origin: "https://kg.example.com" },
    cache: { path: "cache/vectors.db", max_size_mb: 4096 },
    sqlite: { extensions: [] },
    fulltext: { analyzer: "jieba" },
    embedding: {
      base_url: "https://api.example.com/v1",
      model: "example",
      dimensions: 1536,
      similarity: "cosine",
      api_key_env: "KGOS_WEB_EMBEDDING_API_KEY"
    }
  };
  return {
    revision,
    saved: config,
    effective: config,
    pendingRestart: false,
    credential: {
      source: "private_file",
      configured: true,
      canUpdate: true,
      pendingRestart: false
    },
    runtime: {
      version: "test",
      platform: "Linux amd64",
      endpoint: "http://127.0.0.1:8787",
      mcpPath: "/mcp",
      parameters: []
    },
    databasePath: "/workspace/.kgos/kgos.db"
  };
}

function response(revision: string) {
  return new Response(JSON.stringify(snapshot(revision)), {
    headers: { "Content-Type": "application/json" }
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  model = null;
  draft = null;
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

it("saves only changed storage groups so a cache edit never rewrites legacy extension sources", async () => {
  const value = snapshot("legacy");
  const extension = {
    source: "https://example.com/extension.so",
    entrypoint: "legacy_init",
    sha256: "a".repeat(64)
  };
  value.saved.sqlite.extensions = [extension, { ...extension }];
  await act(async () => {
    root.render(<DraftHarness value={value} />);
    await Promise.resolve();
  });
  act(() => {
    storageDraft().setBudget("2048");
  });
  expect(storageDraft().patch()).toEqual({
    cache: { path: value.saved.cache.path, max_size_mb: 2048 }
  });
  act(() => {
    storageDraft().setBudget(String(value.saved.cache.max_size_mb));
    storageDraft().setExtensions([]);
  });
  expect(storageDraft().patch()).toEqual({ sqlite: { extensions: [] } });
});

it.each([new TypeError("Response lost"), new SettingsRequestError(500)])(
  "blocks all writes after an uncertain key-update result until a successful reload (%s)",
  async (failure) => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response("first"))
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(response("reloaded"))
      .mockResolvedValueOnce(response("saved"));
    await act(async () => {
      root.render(<Harness fetcher={fetcher} />);
      await Promise.resolve();
    });
    expect(state().snapshot?.revision).toBe("first");
    await act(async () => {
      expect(await state().write("replacement-key")).toBe(false);
      // Check the synchronous guard before React has committed the error state.
      expect(await state().write("do-not-repeat")).toBe(false);
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state().message).toBe("unknownResult");
    expect(state().writeBlocked).toBe(true);
    await act(async () => {
      expect(await state().write({ cache: { path: "cache/new.db", max_size_mb: 512 } })).toBe(
        false
      );
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => {
      state().reload();
      await Promise.resolve();
    });
    expect(state().snapshot?.revision).toBe("reloaded");
    expect(state().writeBlocked).toBe(false);
    await act(async () => {
      expect(await state().write("confirmed-replacement")).toBe(true);
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(state().message).toBe("saved");
  }
);

it("keeps credential writes blocked after a conflict and an unsuccessful reload", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response("first"))
    .mockResolvedValueOnce(new Response("{}", { status: 409 }))
    .mockRejectedValueOnce(new TypeError("Read failed"));
  await act(async () => {
    root.render(<Harness fetcher={fetcher} />);
    await Promise.resolve();
  });
  await act(async () => {
    expect(await state().write("replacement-key")).toBe(false);
  });
  expect(state().message).toBe("conflict");
  await act(async () => {
    expect(await state().write("do-not-repeat")).toBe(false);
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
  await act(async () => {
    state().reload();
    await Promise.resolve();
  });
  expect(state().message).toBe("loadFailed");
  await act(async () => {
    expect(await state().write("still-blocked")).toBe(false);
  });
  expect(fetcher).toHaveBeenCalledTimes(3);
});
