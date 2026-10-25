// @vitest-environment jsdom

import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";

import {
  button,
  click,
  disposeSettings,
  mountSettings,
  nav,
  response,
  snapshot,
  text
} from "../../../test/settings-fixture.js";

import type { SettingsFetch } from "./settings-types.js";

const REFRESH = "Refresh diagnostics";

afterEach(disposeSettings);

it("shows effective runtime values and units and reads process diagnostics on demand", async () => {
  const value = snapshot();
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(value))
    .mockResolvedValueOnce(response({ runId: "process-fixture", http: { requestsTotal: 12 } }));
  await mountSettings(fetcher);
  await nav("runtime");
  expect(text()).toContain("fixture-version");
  expect(text()).toContain("Linux amd64");
  expect(text()).toContain("30 seconds");
  expect(text()).toContain("1 MiB");
  expect(text()).toContain("Maximum concurrency");
  expect(text()).toContain("KGOS_LOG_LEVEL");
  expect(text()).toContain("Diagnostics have not been read.");
  expect(fetcher).toHaveBeenCalledOnce();
  await click(REFRESH);
  expect(fetcher.mock.calls[1]).toEqual([
    "/api/v1/system/diagnostics",
    expect.objectContaining({ method: "POST", body: "{}" })
  ]);
  expect(fetcher.mock.calls[1]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  expect(text()).toContain("process-fixture");
  expect(text()).toContain('"requestsTotal": 12');
  expect(text()).toContain("Read at");
});

it("keeps diagnostics refresh retryable after a server failure", async () => {
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockResolvedValueOnce(response({ message: "private-server-error" }, 500))
    .mockResolvedValueOnce(response({ runId: "recovered-process" }));
  await mountSettings(fetcher);
  await nav("runtime");
  await click(REFRESH);
  expect(text()).toContain("Unable to read process diagnostics.");
  expect(text()).not.toContain("private-server-error");
  expect(button(REFRESH).disabled).toBe(false);
  await click(REFRESH);
  expect(text()).toContain("recovered-process");
  expect(text()).not.toContain("Unable to read process diagnostics.");
});

it("cancels an in-flight diagnostic read when leaving its category", async () => {
  let signal: AbortSignal | undefined;
  let finish: ((value: Response) => void) | undefined;
  const waiting = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const fetcher = vi
    .fn<SettingsFetch>()
    .mockResolvedValueOnce(response(snapshot()))
    .mockImplementationOnce((_path, init) => {
      signal = init?.signal ?? undefined;
      return waiting;
    });
  await mountSettings(fetcher);
  await nav("runtime");
  await click(REFRESH);
  expect(button(REFRESH).disabled).toBe(true);
  await nav("display");
  expect(signal?.aborted).toBe(true);
  await act(async () => {
    finish?.(response({ runId: "late-process" }));
    await Promise.resolve();
  });
  expect(text()).not.toContain("late-process");
  await nav("runtime");
  expect(text()).toContain("Diagnostics have not been read.");
});

it("does not fabricate missing endpoint information or omitted runtime parameters", async () => {
  const value = snapshot();
  value.runtime.endpoint = "";
  value.runtime.parameters = [];
  const fetcher = vi.fn<SettingsFetch>().mockResolvedValue(response(value));
  await mountSettings(fetcher);
  await nav("runtime");
  expect(text()).toContain("Unavailable");
  expect(text()).not.toContain("30 seconds");
  expect(text()).not.toContain("Maximum concurrency");
  expect(document.body.querySelectorAll(".settings-table tbody tr")).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledOnce();
});
