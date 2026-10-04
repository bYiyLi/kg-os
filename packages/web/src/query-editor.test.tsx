// @vitest-environment happy-dom
import { type WebSaveRequest } from "@kgos/sdk";
import { act as reactAct, useSyncExternalStore } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi, type Mock } from "vitest";

import { type Frame, restoredFrame } from "./frame.js";
import { QueryEditor } from "./query-editor.js";
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
const state = "commit/original";
const statementInput = "#statement";
const numberParams = '{ "one": 1.0, "zero": -0.0, "integer": 9007199254740993, "huge": 1e400 }';

function completed(resultState = state) {
  return new Response(
    `${JSON.stringify({ type: "columns", columns: [] })}\n${JSON.stringify({ type: "summary", state: resultState })}\n`,
    { headers: { "Content-Type": "application/x-ndjson" } }
  );
}

async function saveAndRestore(frame: Frame, fetcher: Mock<typeof fetch>) {
  workspace.connection.info = { daemonBootId: "boot", storageStatus: "ready", storeId: "store" };
  const records = new Records(workspace.connection, "store");
  try {
    const slot = records.add("frame", frame.record());
    fetcher.mockImplementationOnce((_input, init) => {
      const body = init?.body;
      if (typeof body !== "string") throw new Error("Expected frame save request");
      const request = JSON.parse(body) as WebSaveRequest;
      return Promise.resolve(
        Response.json({
          ...request,
          revision: "9007199254740993",
          deleted: false,
          lastMutationId: request.mutationId
        })
      );
    });
    expect(await slot.flush()).toBe(true);
    const saved = required(slot.confirmed);
    expect(saved.data).toMatchObject({
      params: { one: 1, zero: 0, huge: null },
      paramsText: numberParams
    });
    fetcher.mockResolvedValueOnce(Response.json(saved));
    const remote = await slot.readRemote();
    return restoredFrame(records.add("frame", required(remote.data), remote));
  } finally {
    records.stop();
  }
}

function Editor({ model }: { model: Workspace }) {
  useSyncExternalStore(model.subscribe, model.snapshot);
  return <QueryEditor workspace={model} />;
}

async function setup() {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ daemonBootId: "boot", storageStatus: "unavailable" }));
  workspace = new Workspace("http://127.0.0.1:42", fetcher);
  await workspace.connection.connect("opaque");
  workspace.context.state = state;
  workspace.context.branches = [{ name: "main", state }];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(<Editor model={workspace} />);
  });
  return fetcher;
}

async function click(text: string) {
  await act(() => {
    [...container.querySelectorAll("button")].find((item) => item.textContent === text)?.click();
  });
}

async function input(selector: string, value: string) {
  const element = required(
    container.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)
  );
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(() => {
    element.focus();
    Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  workspace.records?.stop();
  document.body.replaceChildren();
});

it("creates a frozen read-only frame and keeps subsequent editor changes independent", async () => {
  const fetcher = await setup();
  fetcher.mockResolvedValueOnce(
    new Response(
      `${JSON.stringify({ type: "columns", columns: ["n"] })}\n${JSON.stringify({ type: "row", row: [1] })}\n${JSON.stringify({ type: "summary", state })}\n`,
      { headers: { "Content-Type": "application/x-ndjson" } }
    )
  );
  await input(statementInput, "RETURN $limit");
  await input("#params", '{"limit":2}');
  await click("运行查询");
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  expect(workspace.engine.frames[0]?.request).toMatchObject({
    mode: "query",
    statement: "RETURN $limit",
    params: { limit: 2 },
    readState: state,
    inputRef: "branch/main"
  });
  await input(statementInput, "RETURN 3\nRETURN 4");
  expect(workspace.statement).toBe("RETURN 3\nRETURN 4");
  expect(workspace.engine.frames[0]?.request.statement).toBe("RETURN $limit");
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it("validates JSON object parameters and pauses execution during State resolution", async () => {
  await setup();
  await act(() => {
    workspace.edit("RETURN 1", "[]");
  });
  await click("运行查询");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("JSON 对象");
  expect(workspace.engine.frames).toHaveLength(0);
  await act(() => {
    workspace.edit("RETURN 1", "{");
  });
  await click("运行查询");
  expect(container.querySelector('[role="alert"]')?.textContent).not.toBe("");
  await act(() => {
    workspace.context.resolving = true;
    workspace.changed();
  });
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "运行查询")
      ?.disabled
  ).toBe(true);
  await act(() => {
    workspace.context.resolving = false;
    workspace.edit("   ", "{}");
  });
  expect(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "运行查询")
      ?.disabled
  ).toBe(true);
});

it("shows observed Branch and exact input before advanced execution and sends once on confirmation", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.edit("CREATE (n {x: $x})", '{"x":2}', "execute");
  });
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state: "commit/latest" }] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  expect(workspace.engine.frames).toHaveLength(0);
  expect(container.querySelector("dialog")?.textContent).toContain("commit/latest");
  expect(container.querySelector("dialog")?.textContent).toContain("CREATE (n {x: $x})");
  expect(container.querySelector("dialog")?.textContent).toContain('{"x":2}');
  await act(() => {
    workspace.edit("CREATE (m)", "{}", "query");
  });
  fetcher.mockResolvedValueOnce(
    new Response(
      `${JSON.stringify({ type: "columns", columns: [] })}\n${JSON.stringify({ type: "summary", state: "commit/result", counters: { created: 1 } })}\n`,
      { headers: { "Content-Type": "application/x-ndjson" } }
    )
  );
  await click("确认执行一次");
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  expect(container.querySelector("dialog")).toBeNull();
  expect(workspace.engine.frames).toHaveLength(1);
  expect(workspace.engine.frames[0]?.request).toMatchObject({
    mode: "execute",
    statement: "CREATE (n {x: $x})",
    params: { x: 2 },
    branch: "main",
    observedHead: "commit/latest"
  });
  expect(workspace.engine.frames[0]?.resultState).toBe("commit/result");
  await click("确认执行一次");
  expect(workspace.engine.frames).toHaveLength(1);
});

it("cancels advanced preview and reports absent Branch without sending a write", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.edit("CREATE (n)", "{}", "execute");
  });
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state }] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  await click("取消");
  expect(container.querySelector("dialog")).toBeNull();
  expect(workspace.engine.frames).toHaveLength(0);
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("目标 Branch");
  expect(workspace.engine.frames).toHaveLength(0);
});

it("freezes the chosen Branch while its observation is in flight", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.edit("CREATE (n)", "{}", "execute");
  });
  const branches = Promise.withResolvers<Response>();
  fetcher.mockReturnValueOnce(branches.promise).mockResolvedValueOnce(Response.json({ items: [] }));
  const button = required(
    [...container.querySelectorAll("button")].find((item) => item.textContent === "预览高级执行")
  );
  await act(() => {
    button.click();
  });
  await input('input:not([type="password"])', "side");
  await act(() => {
    branches.resolve(
      Response.json({
        items: [
          { name: "main", state },
          { name: "side", state: "commit/side" }
        ]
      })
    );
  });
  expect(container.querySelector("dialog strong")?.textContent).toBe("main");
  expect(container.querySelector("dialog")?.textContent).toContain(state);
  expect(workspace.engine.frames).toHaveLength(0);
});

it("uses Cmd/Ctrl+Enter for the visible mode while ordinary Enter stays multiline", async () => {
  const fetcher = await setup();
  const editor = required(container.querySelector<HTMLTextAreaElement>(statementInput));
  const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await act(() => {
    editor.dispatchEvent(enter);
  });
  expect(enter.defaultPrevented).toBe(false);
  expect(workspace.engine.frames).toHaveLength(0);
  fetcher.mockResolvedValueOnce(
    new Response(
      `${JSON.stringify({ type: "columns", columns: [] })}\n${JSON.stringify({ type: "summary", state })}\n`,
      { headers: { "Content-Type": "application/x-ndjson" } }
    )
  );
  const shortcut = new KeyboardEvent("keydown", {
    key: "Enter",
    ctrlKey: true,
    bubbles: true,
    cancelable: true
  });
  await act(() => {
    editor.dispatchEvent(shortcut);
  });
  expect(shortcut.defaultPrevented).toBe(true);
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  expect(workspace.engine.frames).toHaveLength(1);
  await act(() => {
    workspace.edit("CREATE (n)", "{}", "execute");
  });
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state }] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await act(() => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true })
    );
  });
  expect(container.querySelector("dialog")?.textContent).toContain("确认高级执行");
  expect(workspace.engine.frames).toHaveLength(1);
});

it("changes the explicit mode through its selector and ignores held shortcut repeats", async () => {
  await setup();
  const selector = required(container.querySelector("select"));
  await act(() => {
    selector.value = "execute";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(workspace.mode).toBe("execute");
  await act(() => {
    selector.value = "query";
    selector.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(workspace.mode).toBe("query");
  const editor = required(container.querySelector(statementInput));
  await act(() => {
    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        repeat: true,
        bubbles: true,
        cancelable: true
      })
    );
  });
  expect(workspace.engine.frames).toHaveLength(0);
});

it("rejects stale or failed Branch observations and does not send the frozen execution after disconnect", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.edit("CREATE(n)", "{}", "execute");
  });
  fetcher
    .mockResolvedValueOnce(
      Response.json({ code: "RESOURCE_ERROR", message: "list failed" }, { status: 500 })
    )
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  expect(container.querySelector("dialog")).toBeNull();
  expect(workspace.engine.frames).toHaveLength(0);
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state }] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  await act(() => {
    workspace.connection.disconnect();
  });
  await click("确认执行一次");
  expect(workspace.engine.frames).toHaveLength(0);
});

it("sends the original query number tokens and keeps them through saving, restoration and an original-State rerun", async () => {
  const fetcher = await setup();
  await input(statementInput, "RETURN $one");
  await input("#params", numberParams);
  fetcher.mockResolvedValueOnce(completed());
  await click("运行查询");
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  const frame = required(workspace.engine.frames[0]);
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(
    `{"at":"${state}","cypher":"RETURN $one","params":${numberParams}}`
  );
  await input("#params", '{"one":2}');
  await act(() => {
    workspace.context.state = "commit/current";
  });
  expect(frame.request.paramsText).toBe(numberParams);
  expect(Object.is(frame.request.params["zero"], -0)).toBe(true);
  expect(frame.request.params["huge"]).toBe(Infinity);
  const restored = await saveAndRestore(frame, fetcher);
  expect(restored.request.paramsText).toBe(numberParams);
  expect(restored.request.params["huge"]).toBe(Infinity);
  expect(Object.is(restored.request.params["zero"], -0)).toBe(true);
  expect(restored.request.readState).toBe(state);
  expect(restored.active).toBe(false);
  fetcher.mockResolvedValueOnce(completed());
  const rerun = workspace.engine.run(restored.request);
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  expect(rerun.id).not.toBe(frame.id);
  expect(fetcher.mock.calls.at(-1)?.[1]?.body).toBe(fetcher.mock.calls[1]?.[1]?.body);
  expect(rerun.request.paramsText).toBe(numberParams);
  expect(workspace.paramsText).toBe('{"one":2}');
});

it("previews and sends frozen execute number tokens without replacing their original input after confirmation", async () => {
  const fetcher = await setup();
  await act(() => {
    workspace.edit("RETURN $one", numberParams, "execute");
  });
  fetcher
    .mockResolvedValueOnce(Response.json({ items: [{ name: "main", state }] }))
    .mockResolvedValueOnce(Response.json({ items: [] }));
  await click("预览高级执行");
  expect(
    [...container.querySelectorAll("dialog pre")].map((element) => element.textContent)
  ).toContain(numberParams);
  await act(() => {
    workspace.edit("RETURN changed", "{}", "query");
  });
  fetcher.mockResolvedValueOnce(completed("commit/result"));
  await click("确认执行一次");
  await vi.waitFor(() => {
    expect(workspace.engine.active).toBe(0);
  });
  const frame = required(workspace.engine.frames[0]);
  expect(fetcher.mock.calls[3]?.[1]?.body).toBe(
    `{"branch":"main","cypher":"RETURN $one","params":${numberParams}}`
  );
  expect(frame.request.paramsText).toBe(numberParams);
  expect(frame.resultState).toBe("commit/result");
  const restored = await saveAndRestore(frame, fetcher);
  expect(restored.request.paramsText).toBe(numberParams);
  expect(restored.request.params["huge"]).toBe(Infinity);
  expect(Object.is(restored.request.params["zero"], -0)).toBe(true);
  expect(restored.request.branch).toBe("main");
  expect(restored.active).toBe(false);
  expect(workspace.statement).toBe("RETURN changed");
  expect(workspace.paramsText).toBe("{}");
});
