// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { SettingsFetch } from "./settings-types.js";
import {
  button,
  changeLanguage,
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

const TEST_CONNECTION = "Test connection";
const NEW_KEY = "New API Key";
const UPDATE_KEY = "Update key";

afterEach(disposeSettings);

it("shows effective fixed parameters without reading back a key, and discards a cancelled replacement", async () => {
  const value = snapshot();
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValueOnce(response(value));
  await mountSettings(fetcher);
  await nav("retrieval");
  expect(text()).toContain(value.effective.embedding.base_url);
  expect(text()).toContain(value.effective.embedding.model);
  expect(text()).toContain("1536");
  expect(text()).toContain("cosine");
  expect(text()).toContain("jieba");
  expect(document.querySelectorAll("input")).toHaveLength(0);
  await click(UPDATE_KEY);
  expect(field(NEW_KEY).type).toBe("password");
  expect(field(NEW_KEY).value).toBe("");
  expect(button("Save new key").disabled).toBe(true);
  input(NEW_KEY, "replacement-value");
  await click("Cancel");
  expect(document.querySelectorAll("input")).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledOnce();
  await click(UPDATE_KEY);
  expect(field(NEW_KEY).value).toBe("");
});

it("rejects malformed keys locally and saves only the credential with the observed revision", async () => {
  const before = snapshot();
  const after = snapshot();
  after.revision = "replacement-revision";
  after.pendingRestart = true;
  after.credential.pendingRestart = true;
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(before))
    .mockResolvedValueOnce(response(after));
  await mountSettings(fetcher);
  await nav("retrieval");
  await click(UPDATE_KEY);
  input(NEW_KEY, "bad\0value");
  await click("Save new key");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(text()).toContain("Enter a new API key without line breaks.");
  input(NEW_KEY, "replacement-value");
  await click("Save new key");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]).toEqual([
    "/api/v1/web/settings/embedding-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: before.revision, apiKey: "replacement-value" })
    }
  ]);
  expect(text()).toContain("Settings saved.");
  expect(text()).toContain("Saved configuration is waiting for a service restart.");
  expect(document.querySelectorAll("input")).toHaveLength(0);
});

it.each(["environment", "none"] as const)(
  "does not offer private-file maintenance for %s credentials",
  async (source) => {
    const value = snapshot();
    value.credential = { source, configured: false, canUpdate: false, pendingRestart: false };
    value.effective.embedding.api_key_env = source === "none" ? "" : "EXTERNAL_EMBEDDING_KEY";
    const fetcher = vi.fn<SettingsFetch>().mockResolvedValueOnce(response(value));
    await mountSettings(fetcher);
    await nav("retrieval");
    expect(text()).toContain("Not configured");
    expect(
      Array.from(document.querySelectorAll("button")).some(
        (item) => item.textContent === UPDATE_KEY
      )
    ).toBe(false);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(fetcher).toHaveBeenCalledOnce();
  }
);

it("verifies the effective service once while busy and displays only an actual vector response", async () => {
  let complete: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockReturnValueOnce(pending);
  await mountSettings(fetcher);
  await nav("retrieval");
  expect(text()).not.toContain("returned 1536 dimensions");
  await click(TEST_CONNECTION);
  expect(button("Testing…").disabled).toBe(true);
  await click("Testing…");
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher.mock.calls[1]?.[0]).toBe("/api/v1/web/settings/test-embedding");
  expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: "POST", body: "{}" });
  await act(async () => {
    complete?.(response({ ok: true, dimensions: 1536 }));
    await Promise.resolve();
  });
  expect(text()).toContain("The currently effective service returned 1536 dimensions.");
  expect(button(TEST_CONNECTION).disabled).toBe(false);
});

it("translates a credential rejection without making another request on language change", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(snapshot()))
    .mockResolvedValueOnce(response({ ok: false, reason: "authentication_failed" }, 422));
  await mountSettings(fetcher);
  await nav("retrieval");
  await changeLanguage("zh-CN");
  expect(fetcher).toHaveBeenCalledOnce();
  await click("测试连接");
  expect(text()).toContain("向量服务拒绝了当前凭证。");
  expect(text()).not.toContain("authentication_failed");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("uses a bounded generic failure for unknown verification reasons and transport errors", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(response(snapshot()))
    .mockResolvedValueOnce(response({ ok: false, reason: "unrecognized-internal-detail" }, 422))
    .mockRejectedValueOnce(new TypeError("Offline"));
  await mountSettings(fetcher);
  await nav("retrieval");
  await click(TEST_CONNECTION);
  expect(text()).toContain("Connection verification failed.");
  expect(text()).not.toContain("unrecognized-internal-detail");
  await click(TEST_CONNECTION);
  expect(text()).toContain("Connection verification failed.");
  expect(button(TEST_CONNECTION).disabled).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it("aborts verification when leaving the category and ignores a late response", async () => {
  let complete: ((value: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    complete = resolve;
  });
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockReturnValueOnce(pending);
  await mountSettings(fetcher);
  await nav("retrieval");
  await click(TEST_CONNECTION);
  const request = fetcher.mock.calls[1]?.[1];
  expect(request?.signal?.aborted).toBe(false);
  await nav("display");
  expect(request?.signal?.aborted).toBe(true);
  await act(async () => {
    complete?.(response({ ok: true, dimensions: 1536 }));
    await Promise.resolve();
  });
  expect(text()).not.toContain("returned 1536 dimensions");
  await nav("retrieval");
  expect(text()).not.toContain("returned 1536 dimensions");
  expect(button(TEST_CONNECTION).disabled).toBe(false);
});
