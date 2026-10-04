// @vitest-environment happy-dom
import { act as reactAct, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { type WebRecord } from "@kgos/sdk";

import { QueryLibrary } from "./query-library.js";
import { Records } from "./records.js";
import { Workspace } from "./workspace.js";

async function act(operation: () => void) {
  await reactAct(async () => {
    operation();
    await Promise.resolve();
  });
}

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Missing test element");
  return value;
}

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let container: HTMLDivElement;
let workspace: Workspace;

function Library() {
  useSyncExternalStore(workspace.subscribe, workspace.snapshot);
  return <QueryLibrary workspace={workspace} />;
}

async function setup() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ daemonBootId: "boot", storeId: "store", storageStatus: "ready" })
    );
  workspace = new Workspace("http://127.0.0.1:42", fetcher);
  await workspace.connection.connect("opaque");
  workspace.records = new Records(workspace.connection, "store");
  workspace.records.subscribe(() => {
    workspace.changed();
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(<Library />);
  });
  return fetcher;
}

function saved(id: string, name: string): WebRecord {
  return {
    kind: "query",
    id,
    revision: "1",
    deleted: false,
    lastMutationId: "saved",
    data: { version: 1, name, statement: "CREATE (n)", paramsText: "{", mode: "execute" }
  };
}

async function click(text: string) {
  await act(() => {
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === text)
      ?.click();
  });
}

afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  workspace.records?.stop();
  document.body.replaceChildren();
});

it("fills the original editor text and mode without running a saved query", async () => {
  const fetcher = await setup();
  const record = saved("favorite", "写入模板");
  await act(() => {
    workspace.records?.add("query", record.data ?? {}, record);
  });
  await click("填入编辑器");
  expect(workspace.statement).toBe("CREATE (n)");
  expect(workspace.paramsText).toBe("{");
  expect(workspace.mode).toBe("execute");
  expect(workspace.engine.frames).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("requires a name and saves the complete unfinished current input as its own record", async () => {
  const fetcher = await setup();
  expect(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "收藏当前输入"
    )?.disabled
  ).toBe(true);
  await act(() => {
    workspace.edit("RETURN (", "{", "query");
  });
  const name = required(container.querySelector("input"));
  await act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
      name,
      "  半成品  "
    );
    name.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click("收藏当前输入");
  expect(workspace.records?.slots[0]?.data).toMatchObject({
    name: "半成品",
    statement: "RETURN (",
    paramsText: "{",
    mode: "query"
  });
  expect(workspace.records?.slots[0]?.kind).toBe("query");
  expect(container.querySelector("input")?.value).toBe("");
  expect(workspace.engine.frames).toHaveLength(0);
  expect(fetcher).toHaveBeenCalledOnce();
});

it("deletes exactly the confirmed favorite only after the explicit dialog action", async () => {
  const fetcher = await setup();
  const record = saved("favorite", "模板");
  await act(() => {
    workspace.records?.add("query", record.data ?? {}, record);
    workspace.records?.add("draft", { text: "保留" });
  });
  await click("删除收藏");
  expect(fetcher).toHaveBeenCalledOnce();
  expect(container.querySelector("dialog")?.textContent).toContain("仅删除 query：模板");
  fetcher.mockResolvedValueOnce(
    Response.json({ ...record, revision: "2", deleted: true, data: null })
  );
  await click("确认删除");
  expect(container.querySelector("dialog")).toBeNull();
  expect(container.textContent).toContain("收藏查询（0）");
  expect(workspace.records?.slots[1]?.data).toEqual({ text: "保留" });
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain('"expectedRevision":"1"');
});

it("retains a favorite and its delete dialog when pending input cannot be saved", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.records?.add("query", { name: "未保存", statement: "RETURN 1" });
  });
  await click("删除收藏");
  fetcher.mockResolvedValueOnce(
    Response.json({ code: "RESOURCE_ERROR", message: "quota" }, { status: 413 })
  );
  await click("确认删除");
  expect(container.querySelector("dialog")).not.toBeNull();
  expect(workspace.records?.slots[0]?.status).toBe("未保存");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("loads the next cursor page and makes its saved entries accessible", async () => {
  const fetcher = await setup();
  await act(() => {
    for (let index = 0; index < 50; index += 1) {
      const record = saved(`query-${String(index)}`, `第一页 ${String(index)}`);
      workspace.records?.add("query", record.data ?? {}, record);
    }
    workspace.records?.cursors.set("query", "next-page");
    workspace.changed();
  });
  const next = saved("last", "后续收藏");
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [next] }))
    .mockResolvedValueOnce(Response.json(next));
  await click("加载更多收藏");
  expect(fetcher.mock.calls[1]?.[1]?.body).toContain('"cursor":"next-page"');
  expect(workspace.records?.slots).toHaveLength(51);
  expect(container.textContent).toContain("后续收藏");
});

it("pages loaded favorites both ways and cancels deletion without mutating records", async () => {
  await setup();
  await act(() => {
    for (let index = 0; index < 51; index += 1) {
      const record = saved(`saved-${String(index)}`, `收藏 ${String(index)}`);
      workspace.records?.add("query", record.data ?? {}, record);
    }
  });
  expect(container.querySelectorAll("li")).toHaveLength(50);
  await click("下一组收藏");
  expect(container.querySelectorAll("li")).toHaveLength(1);
  expect(container.textContent).toContain("收藏 50");
  await click("上一组收藏");
  expect(container.querySelectorAll("li")).toHaveLength(50);
  await click("删除收藏");
  await act(() => {
    container
      .querySelector("dialog")
      ?.dispatchEvent(new Event("cancel", { bubbles: true, cancelable: true }));
  });
  expect(container.querySelector("dialog")).toBeNull();
  expect(workspace.records?.slots).toHaveLength(51);
});
