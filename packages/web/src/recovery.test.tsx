// @vitest-environment happy-dom
import { act as reactAct, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { type WebRecord, type WebSaveRequest } from "@kgos/sdk";

import { Connection } from "./connection.js";
import { Records } from "./records.js";
import { Recovery } from "./recovery.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let records: Records;
const localInput = { statement: "RETURN local" };
const confirmed: WebRecord = {
  kind: "editor",
  id: "editor",
  revision: "1",
  deleted: false,
  lastMutationId: "original",
  data: { statement: "RETURN saved" }
};

function RecoveryView() {
  useSyncExternalStore(records.subscribe, records.snapshot);
  return <Recovery records={records} />;
}
async function setup() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "boot", storeId: "store", storageStatus: "ready" })
    );
  const connection = new Connection("http://127.0.0.1:42", fetcher);
  await connection.connect("opaque");
  records = new Records(connection, "store");
  const slot = records.add("editor", localInput, confirmed);
  slot.status = "内容冲突";
  slot.remote = { ...confirmed, revision: "2", data: { statement: "RETURN remote" } };
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(<RecoveryView />);
  });
  return { slot, fetcher };
}
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.textContent === text
  );
  if (button === undefined) throw new Error(`Missing ${text}`);
  await act(() => {
    button.click();
  });
}
afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  records.stop();
  document.body.replaceChildren();
});

it("compares both versions and adopts only through the explicit choice", async () => {
  const { slot, fetcher } = await setup();
  expect(container.textContent).toContain("1 份输入需要核对");
  await click("查看对照");
  expect(container.textContent).toContain("RETURN local");
  expect(container.textContent).toContain("RETURN remote");
  expect(slot.data).toEqual(localInput);
  await click("显式采用保存版本");
  expect(slot.data).toEqual({ statement: "RETURN remote" });
  expect(slot.adoption).toBe(1);
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toBe("");
  expect(fetcher).toHaveBeenCalledOnce();
});

it("preserves tombstones and copies local input into a fresh record", async () => {
  const { slot, fetcher } = await setup();
  await act(() => {
    slot.remote = { ...confirmed, deleted: true, data: null };
    slot.changed();
  });
  await click("查看对照");
  expect(container.textContent).toContain("已删除");
  expect(
    [...container.querySelectorAll("button")].find(
      (item) => item.textContent === "显式采用保存版本"
    )?.disabled
  ).toBe(true);
  fetcher.mockImplementationOnce((_input, init) => {
    const body = init?.body;
    if (typeof body !== "string") throw new Error("Expected save body");
    const request = JSON.parse(body) as WebSaveRequest;
    return Promise.resolve(
      Response.json({
        ...confirmed,
        id: request.id,
        data: request.data,
        lastMutationId: request.mutationId
      })
    );
  });
  await click("另存本窗口副本");
  expect(slot.id).not.toBe(confirmed.id);
  expect(slot.data).toEqual(localInput);
  expect(slot.status).toBe("已保存");
  expect(container.querySelector("dialog")).toBeNull();
});

it("refreshes only the comparison data and retains local input on read failures", async () => {
  const { slot, fetcher } = await setup();
  await click("查看对照");
  fetcher.mockResolvedValueOnce(
    Response.json({ ...confirmed, revision: "3", data: { statement: "RETURN third" } })
  );
  await click("重新核对");
  expect(container.textContent).toContain("RETURN third");
  expect(slot.data).toEqual(localInput);
  fetcher.mockResolvedValueOnce(
    Response.json({ code: "RESOURCE_ERROR", message: "read unavailable" }, { status: 500 })
  );
  await click("重新核对");
  expect(container.textContent).toContain("read unavailable");
  expect(slot.data).toEqual(localInput);
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector("dialog")).toBeNull();
  expect(slot.status).toBe("内容冲突");
});

it("leaves unresolved results available after a failed copy and hides recovery without records", async () => {
  const { slot, fetcher } = await setup();
  slot.status = "结果待核对";
  await click("查看对照");
  fetcher.mockResolvedValueOnce(
    Response.json({ code: "RESOURCE_ERROR", message: "copy quota" }, { status: 413 })
  );
  await click("另存本窗口副本");
  expect(slot.data).toEqual(localInput);
  expect(slot.status).toBe("未保存");
  await act(() => {
    root?.render(<Recovery records={undefined} />);
  });
  expect(container.textContent).toBe("");
});
