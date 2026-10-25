// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  button,
  click,
  disposeSettings,
  field,
  input,
  mountSettings,
  nav,
  response,
  snapshot,
  text
} from "../../../test/settings-fixture.js";

import type { SettingsFetch } from "./settings-types.js";

const BUDGET = "Cache budget";
const CACHE_PATH = "Cache path";
const SAVE = "Save changes";
const EXTENSION_SOURCE = "Extension source";

afterEach(disposeSettings);

function requestBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== "string") throw new Error("Expected a JSON request body");
  const value: unknown = JSON.parse(body);
  return value;
}

it("validates cache inputs before writing and cancels both cache and extension drafts", async () => {
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(snapshot()));
  await mountSettings(fetcher);
  await nav("storage");
  expect(text()).toContain("/workspace/.kgos/kgos.db");
  input(BUDGET, "0");
  await click(SAVE);
  expect(text()).toContain("Enter a non-empty cache path and a positive whole-number budget.");
  expect(fetcher).toHaveBeenCalledOnce();
  input(BUDGET, "512");
  input(CACHE_PATH, "");
  await click(SAVE);
  expect(fetcher).toHaveBeenCalledOnce();
  await click("Add extension");
  input(EXTENSION_SOURCE, "/srv/extensions/example.so");
  await click("Cancel");
  expect(field(BUDGET).value).toBe("4096");
  expect(field(CACHE_PATH).value).toBe("cache/vectors.db");
  expect(text()).toContain("No additional extensions configured");
  expect(button("Done").disabled).toBe(false);
});

it("rejects incomplete extension sources, checksums and archive paths before saving a complete draft", async () => {
  const initial = snapshot();
  const saved = snapshot();
  saved.revision = "saved-extension";
  saved.saved.sqlite.extensions = [
    {
      source: "https://extensions.example.com/tokenizer.tar.gz",
      entrypoint: "sqlite3_example_init",
      library: "lib/example.so",
      sha256: "a".repeat(64)
    }
  ];
  saved.pendingRestart = true;
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(initial))
    .mockResolvedValueOnce(response(saved));
  await mountSettings(fetcher);
  await nav("storage");
  await click("Add extension");
  await click(SAVE);
  expect(text()).toContain("Complete the extension source and entrypoint");
  input(EXTENSION_SOURCE, "relative.so");
  input("Entrypoint", "sqlite3_example_init");
  await click(SAVE);
  expect(fetcher).toHaveBeenCalledOnce();
  input(EXTENSION_SOURCE, "https://extensions.example.com/tokenizer.tar.gz");
  await click(SAVE);
  expect(fetcher).toHaveBeenCalledOnce();
  input("SHA-256", "a".repeat(64));
  await click(SAVE);
  expect(fetcher).toHaveBeenCalledOnce();
  input("Archive library", "lib/example.so");
  await click(SAVE);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/web/settings/update");
  const written = requestBody(fetcher.mock.calls[1]?.[1]?.body);
  expect(written).toEqual({
    revision: initial.revision,
    sqlite: { extensions: saved.saved.sqlite.extensions }
  });
  expect(text()).toContain("Settings saved.");
  expect(text()).toContain("Saved configuration is waiting for a service restart.");
  expect(field(EXTENSION_SOURCE).value).toBe(saved.saved.sqlite.extensions[0]?.source);
});

it("saves only changed cache fields and prevents repeated edits while a save is pending", async () => {
  const initial = snapshot();
  const saved = snapshot();
  saved.revision = "saved-cache";
  saved.saved.cache = { path: "cache/reused.db", max_size_mb: 512 };
  let complete: ((value: Response) => void) | undefined;
  const waiting = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(initial))
    .mockReturnValueOnce(waiting);
  await mountSettings(fetcher);
  await nav("storage");
  input(BUDGET, "512");
  input(CACHE_PATH, "cache/reused.db");
  await click(SAVE);
  expect(field(CACHE_PATH).disabled).toBe(true);
  expect(button("Add extension").disabled).toBe(true);
  expect(button("Saving…").disabled).toBe(true);
  expect(fetcher.mock.calls[1]).toEqual([
    "/api/v1/web/settings/update",
    expect.objectContaining({
      body: JSON.stringify({ revision: initial.revision, cache: saved.saved.cache })
    })
  ]);
  await act(async () => {
    complete?.(response(saved));
    await Promise.resolve();
  });
  expect(field(CACHE_PATH).value).toBe("cache/reused.db");
  expect(field(CACHE_PATH).disabled).toBe(false);
  expect(button("Done").disabled).toBe(false);
});

it("can remove an existing extension and discard a newly added one without writing", async () => {
  const initial = snapshot();
  initial.saved.sqlite.extensions = [
    { source: "/srv/extensions/existing.so", entrypoint: "sqlite3_existing_init" }
  ];
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(initial));
  await mountSettings(fetcher);
  await nav("storage");
  expect(field(EXTENSION_SOURCE).value).toBe("/srv/extensions/existing.so");
  await click("Add extension");
  input(EXTENSION_SOURCE, "/srv/extensions/new.so", 1);
  input("Entrypoint", "sqlite3_new_init", 1);
  await click("Remove extension 1");
  expect(field(EXTENSION_SOURCE).value).toBe("/srv/extensions/new.so");
  await click("Remove extension 1");
  expect(text()).toContain("No additional extensions configured");
  await click("Cancel");
  expect(field(EXTENSION_SOURCE).value).toBe("/srv/extensions/existing.so");
  expect(fetcher).toHaveBeenCalledOnce();
});
