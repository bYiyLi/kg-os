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

const ORIGIN = "Public access address";
const INSTANCE_ORIGIN = "https://kg.example.com";
const DRAFT_ORIGIN = "https://draft.example.com";
const SAVE = "Save changes";

afterEach(disposeSettings);

it("reads actual instance values across all categories while browser preferences stay immediate", async () => {
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(snapshot()));
  const callbacks = await mountSettings(fetcher);
  expect(document.body.querySelector("[data-language-control]")).not.toBeNull();
  await click("Light");
  expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith("light");
  expect(fetcher).toHaveBeenCalledTimes(1);
  await nav("connection");
  expect(field(ORIGIN).value).toBe(INSTANCE_ORIGIN);
  expect(text()).toContain("https://kg.example.com/mcp");
  await nav("retrieval");
  expect(text()).toContain("fixture-embedding-model");
  expect(text()).toContain("1536");
  expect(text()).toContain("jieba");
  await nav("storage");
  expect(field("Cache path").value).toBe("cache/vectors.db");
  expect(text()).toContain("/workspace/.kgos/kgos.db");
  await nav("runtime");
  expect(text()).toContain("fixture-version");
  expect(text()).toContain("30 seconds");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("keeps embedded display preferences usable without making HTTP management requests", async () => {
  const fetcher = vi.fn<SettingsFetch>().mockRejectedValue(new Error("No HTTP in embedded view"));
  const callbacks = await mountSettings(fetcher, { connection: null, preference: "dark" });
  expect(button("Dark").getAttribute("aria-pressed")).toBe("true");
  await click("Follow system");
  expect(callbacks.onSelectTheme).toHaveBeenCalledExactlyOnceWith("system");
  await nav("connection");
  expect(text()).toContain("Open KG OS in a separate browser");
  expect(fetcher).not.toHaveBeenCalled();
  await click("Close settings");
  expect(callbacks.onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
});

it("saves only the edited address group and distinguishes saved from effective values", async () => {
  const saved = snapshot();
  saved.revision = "saved-address";
  saved.saved.server = { public_origin: "https://new.example.com" };
  saved.pendingRestart = true;
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockResolvedValueOnce(response(saved));
  await mountSettings(fetcher);
  await nav("connection");
  input(ORIGIN, "https://new.example.com");
  await click(SAVE);
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
    JSON.stringify({
      revision: "fixture-revision",
      server: { public_origin: "https://new.example.com" }
    })
  );
  expect(text()).toContain("Settings saved.");
  expect(text()).toContain("waiting for a service restart");
  expect(field(ORIGIN).value).toBe("https://new.example.com");
  expect(text()).toContain("https://kg.example.com/mcp");
});

it("preserves unsaved input when a close or category change is canceled, then discards explicitly", async () => {
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(snapshot()));
  const callbacks = await mountSettings(fetcher);
  await nav("connection");
  input(ORIGIN, DRAFT_ORIGIN);
  await click("Close settings");
  expect(document.body.querySelector("[role=alertdialog]")).not.toBeNull();
  expect(callbacks.onOpenChange).not.toHaveBeenCalled();
  await click("Keep editing");
  expect(field(ORIGIN).value).toBe(DRAFT_ORIGIN);
  await nav("storage");
  expect(button("Storage & extensions").disabled).toBe(true);
  await click("Discard changes");
  expect(field("Cache path").value).toBe("cache/vectors.db");
  await nav("connection");
  expect(field(ORIGIN).value).toBe(INSTANCE_ORIGIN);
  input(ORIGIN, "https://another.example.com");
  await click("Cancel");
  expect(field(ORIGIN).value).toBe(INSTANCE_ORIGIN);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("requires explicit discard before logging out with unsaved edits", async () => {
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(snapshot()));
  const callbacks = await mountSettings(fetcher);
  await nav("connection");
  input(ORIGIN, DRAFT_ORIGIN);
  await click("Sign out");
  expect(callbacks.onDisconnect).not.toHaveBeenCalled();
  await click("Keep editing");
  await click("Sign out");
  await click("Discard changes");
  expect(callbacks.onDisconnect).toHaveBeenCalledOnce();
  expect(callbacks.onOpenChange).toHaveBeenCalledWith(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("retries a failed configuration read without retaining invented values", async () => {
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockRejectedValueOnce(new Error("Read unavailable"))
    .mockResolvedValueOnce(response(snapshot()));
  await mountSettings(fetcher);
  await nav("connection");
  expect(text()).toContain("Unable to read instance configuration");
  expect(document.body.querySelector("input")).toBeNull();
  await click("Retry");
  expect(field(ORIGIN).value).toBe(INSTANCE_ORIGIN);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("shows a loading state while reading and supports legacy configuration without a public origin", async () => {
  let resolve: ((value: Response) => void) | undefined;
  const fetcher = vi.fn<SettingsFetch>().mockImplementation(
    () =>
      new Promise<Response>((done) => {
        resolve = done;
      })
  );
  await mountSettings(fetcher);
  await nav("connection");
  expect(text()).toContain("Loading configuration");
  const legacy = snapshot();
  legacy.effective.server = null;
  legacy.saved.server = null;
  await act(async () => {
    resolve?.(response(legacy));
    await Promise.resolve();
  });
  expect(field(ORIGIN).value).toBe("");
  expect(text()).toContain("Not configured");
  input(ORIGIN, "https://kg.example.com/path");
  await click(SAVE);
  expect(text()).toContain("Enter an HTTPS origin");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([409, 500])(
  "blocks repeat saves after uncertain or conflicting writes (%s) until explicit reload",
  async (status) => {
    const fresh = snapshot();
    fresh.revision = "fresh-revision";
    const fetcher = vi
      .fn<SettingsFetch>()
      .mockResolvedValueOnce(response(snapshot()))
      .mockResolvedValueOnce(response({}, status))
      .mockResolvedValueOnce(response(fresh));
    await mountSettings(fetcher);
    await nav("connection");
    input(ORIGIN, DRAFT_ORIGIN);
    await click(SAVE);
    expect(field(ORIGIN).value).toBe(DRAFT_ORIGIN);
    expect(button(SAVE).disabled).toBe(true);
    await click(SAVE);
    expect(fetcher).toHaveBeenCalledTimes(2);
    await click("Reload configuration");
    expect(field(ORIGIN).value).toBe(INSTANCE_ORIGIN);
    input(ORIGIN, "https://retry.example.com");
    expect(button(SAVE).disabled).toBe(false);
  }
);

it("retains a rejected draft for correction and freezes navigation while a save is pending", async () => {
  let resolve: ((value: Response) => void) | undefined;
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockResolvedValueOnce(response({}, 400))
    .mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        })
    );
  await mountSettings(fetcher);
  await nav("connection");
  input(ORIGIN, DRAFT_ORIGIN);
  await click(SAVE);
  expect(text()).toContain("Your input has been kept");
  input(ORIGIN, "https://corrected.example.com");
  await click(SAVE);
  expect(button("Close settings").disabled).toBe(true);
  expect(button("Storage & extensions").disabled).toBe(true);
  expect(button("Saving…").disabled).toBe(true);
  await click("Saving…");
  expect(fetcher).toHaveBeenCalledTimes(3);
  await act(async () => {
    resolve?.(response(snapshot()));
    await Promise.resolve();
  });
  expect(button("Done").disabled).toBe(false);
});

it("copies the actual MCP address and reports clipboard failures without changing configuration", async () => {
  const writeText = vi
    .fn<(value: string) => Promise<void>>()
    .mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error("Clipboard denied"));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(snapshot()));
  await mountSettings(fetcher);
  await nav("connection");
  await click("Copy");
  expect(writeText).toHaveBeenCalledWith("https://kg.example.com/mcp");
  expect(text()).toContain("Copied");
  await click("Copy");
  expect(text()).toContain("Unable to copy");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
