// @vitest-environment happy-dom
import { act as reactAct, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";

import { Modal } from "./dialog.js";

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
const closeControl = ".dialog-header button";

async function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(() => {
    root?.render(node);
  });
}

function layout(element: HTMLElement | SVGElement, visible = true, hasBox = visible) {
  const rectangles = hasBox ? [new DOMRect(0, 0, 44, 44)] : [];
  vi.spyOn(element, "getClientRects").mockReturnValue(
    Object.assign(rectangles, { item: (index: number) => rectangles[index] ?? null })
  );
  return vi.spyOn(element, "checkVisibility").mockReturnValue(visible);
}

function NestedModals({
  onOuterClose,
  onInnerClose
}: {
  onOuterClose: () => void;
  onInnerClose: () => void;
}) {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  if (!outer) return null;
  return (
    <Modal
      title="版本对照"
      onClose={() => {
        onOuterClose();
        setOuter(false);
      }}
    >
      <button
        onClick={() => {
          setInner(true);
        }}
      >
        查看变化
      </button>
      {inner && (
        <Modal
          title="变化内容"
          onClose={() => {
            onInnerClose();
            setInner(false);
          }}
        >
          对象变化
        </Modal>
      )}
    </Modal>
  );
}

async function keydown(target: Element, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: "Tab",
    bubbles: true,
    cancelable: true,
    ...options
  });
  await act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

afterEach(async () => {
  await act(() => {
    root?.unmount();
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it("opens a native modal and restores focus to the connected trigger on close", async () => {
  const trigger = document.createElement("button");
  trigger.textContent = "open";
  document.body.append(trigger);
  trigger.focus();
  await render(
    <Modal title="对照" onClose={() => undefined}>
      <input aria-label="输入" autoFocus />
    </Modal>
  );
  const dialog = container.querySelector("dialog");
  expect(dialog?.open).toBe(true);
  expect(dialog?.getAttribute("aria-label")).toBe("对照");
  await act(() => {
    root?.unmount();
  });
  root = undefined;
  expect(document.activeElement).toBe(trigger);
});

it("routes Escape, backdrop and the named close button through the same close action", async () => {
  const close = vi.fn();
  await render(
    <Modal title="详情" onClose={close}>
      <button>内容动作</button>
    </Modal>
  );
  const dialog = required(container.querySelector("dialog"));
  const cancel = new Event("cancel", { cancelable: true, bubbles: true });
  await act(() => {
    dialog.dispatchEvent(cancel);
  });
  expect(cancel.defaultPrevented).toBe(true);
  expect(close).toHaveBeenCalledOnce();
  await act(() => {
    [...container.querySelectorAll("button")]
      .find((item) => item.textContent === "内容动作")
      ?.click();
  });
  expect(close).toHaveBeenCalledOnce();
  await act(() => {
    dialog.click();
  });
  expect(close).toHaveBeenCalledTimes(2);
  await act(() => {
    container.querySelector<HTMLButtonElement>('[aria-label="关闭详情"]')?.click();
  });
  expect(close).toHaveBeenCalledTimes(3);
});

it("unmounts safely after its original focused element is removed", async () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  await render(
    <Modal title="移除" className="extra" onClose={() => undefined}>
      内容
    </Modal>
  );
  trigger.remove();
  expect(container.querySelector("dialog")?.className).toContain("extra");
  await act(() => {
    root?.unmount();
  });
  root = undefined;
  expect(document.activeElement).not.toBe(trigger);
});

it("renders a standalone modal safely when no browser document exists", async () => {
  const { renderToStaticMarkup } = await import("react-dom/server");
  vi.stubGlobal("document", undefined);
  const markup = renderToStaticMarkup(
    <Modal title="静态详情" onClose={() => undefined}>
      内容
    </Modal>
  );
  vi.unstubAllGlobals();
  expect(markup).toContain("静态详情");
  expect(markup).toContain("dialog");
});

it("cycles first and last focus while excluding disabled, hidden and negative-tabindex controls", async () => {
  await render(
    <Modal title="焦点边界" onClose={() => undefined}>
      <input aria-label="中间输入" />
      <a href="#result">最后操作</a>
      <button disabled>禁用操作</button>
      <button hidden>隐藏操作</button>
      <button tabIndex={-1}>非 Tab 操作</button>
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const middle = required(container.querySelector("input"));
  const last = required(container.querySelector("a"));
  const disabled = required(container.querySelector<HTMLButtonElement>("button:disabled"));
  const hidden = required(container.querySelector<HTMLButtonElement>("button[hidden]"));
  const negative = required(container.querySelector<HTMLButtonElement>('[tabindex="-1"]'));
  for (const control of [first, middle, last, disabled, negative]) layout(control);
  layout(hidden, false);
  first.focus();
  const backward = await keydown(first, { shiftKey: true });
  expect(backward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
  const forward = await keydown(last);
  expect(forward.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  middle.focus();
  const normal = await keydown(middle);
  expect(normal.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(middle);
  const reverse = await keydown(middle, { shiftKey: true });
  expect(reverse.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(middle);
});

it("supports focusable SVG graph controls at the modal Tab boundary", async () => {
  await render(
    <Modal title="图焦点" onClose={() => undefined}>
      <svg aria-label="图对象">
        <g role="button" tabIndex={0} aria-label="图末控件" />
        <g role="button" tabIndex={-1} aria-label="非 Tab 图控件" />
      </svg>
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const last = required(container.querySelector<SVGElement>('g[tabindex="0"]'));
  const negative = required(container.querySelector<SVGElement>('g[tabindex="-1"]'));
  layout(first);
  layout(last);
  layout(negative);
  first.focus();
  expect((await keydown(first, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
  expect((await keydown(last)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it("leaves other keys and child-handled Tab events under their existing control behavior", async () => {
  await render(
    <Modal title="局部键盘" onClose={() => undefined}>
      <textarea
        aria-label="保留 Tab 的编辑器"
        onKeyDown={(event) => {
          if (event.key === "Tab") event.preventDefault();
        }}
      />
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const editor = required(container.querySelector("textarea"));
  layout(first);
  layout(editor);
  editor.focus();
  const focus = vi.spyOn(first, "focus");
  const other = await keydown(editor, { key: "ArrowRight" });
  expect(other.defaultPrevented).toBe(false);
  expect(document.activeElement).toBe(editor);
  const handled = await keydown(editor);
  expect(handled.defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(editor);
  expect(focus).not.toHaveBeenCalled();
});

it("cycles through a closed details summary without focusing its boxed but invisible content", async () => {
  await render(
    <Modal title="按需内容" onClose={() => undefined}>
      <details>
        <summary>展开输入</summary>
        <input aria-label="折叠的输入" />
        <button>折叠的操作</button>
      </details>
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const details = required(container.querySelector("details"));
  const summary = required(container.querySelector("summary"));
  const input = required(container.querySelector("input"));
  const content = required(container.querySelector<HTMLButtonElement>("details button"));
  // Chromium gives summary a native Tab stop; Happy DOM's base getter returns -1.
  vi.spyOn(summary, "tabIndex", "get").mockReturnValue(0);
  layout(first);
  layout(summary);
  const inputVisibility = layout(input, false, true);
  const contentVisibility = layout(content, false, true);
  expect(details.open).toBe(false);
  expect(content.getClientRects()).toHaveLength(1);
  first.focus();
  expect((await keydown(first, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(summary);
  expect((await keydown(summary)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  await act(() => {
    summary.click();
  });
  expect(details.open).toBe(true);
  inputVisibility.mockReturnValue(true);
  contentVisibility.mockReturnValue(true);
  first.focus();
  expect((await keydown(first, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(content);
  expect((await keydown(content)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it("excludes CSS-hidden and inert descendants even while they retain layout boxes", async () => {
  await render(
    <Modal title="不可交互内容" onClose={() => undefined}>
      <a href="#active">最后可用操作</a>
      <section inert>
        <button>不可交互按钮</button>
        <input aria-label="不可交互输入" />
      </section>
      <button style={{ visibility: "hidden" }}>CSS 隐藏操作</button>
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const last = required(container.querySelector("a"));
  const inertButton = required(container.querySelector<HTMLButtonElement>("section button"));
  const inertInput = required(container.querySelector<HTMLInputElement>("section input"));
  const hidden = required(container.querySelector<HTMLButtonElement>("button[style]"));
  for (const control of [first, last, inertButton, inertInput]) layout(control);
  layout(hidden, false, true).mockImplementation((options) => options?.visibilityProperty !== true);
  expect(hidden.getClientRects()).toHaveLength(1);
  expect(inertButton.getClientRects()).toHaveLength(1);
  first.focus();
  expect((await keydown(first, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
  expect((await keydown(last)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
});

it("closes only the top nested modal on cancel and returns focus to its opener in the outer modal", async () => {
  const outerClose = vi.fn();
  const innerClose = vi.fn();
  await render(<NestedModals onOuterClose={outerClose} onInnerClose={innerClose} />);
  const outer = required(container.querySelector<HTMLDialogElement>('[aria-label="版本对照"]'));
  const opener = required(
    [...outer.querySelectorAll("button")].find((button) => button.textContent === "查看变化")
  );
  opener.focus();
  await act(() => {
    opener.click();
  });
  const inner = required(container.querySelector<HTMLDialogElement>('[aria-label="变化内容"]'));
  expect(outer.open).toBe(true);
  expect(inner.open).toBe(true);
  const cancel = new Event("cancel", { cancelable: true, bubbles: true });
  await act(() => {
    inner.dispatchEvent(cancel);
  });
  expect(cancel.defaultPrevented).toBe(true);
  expect(innerClose).toHaveBeenCalledOnce();
  expect(outerClose).not.toHaveBeenCalled();
  expect(container.querySelector('[aria-label="变化内容"]')).toBeNull();
  expect(outer.open).toBe(true);
  expect(document.activeElement).toBe(opener);
});

it("returns focus to a modal control when an inner editor blurs during Tab handling", async () => {
  await render(
    <Modal title="编辑器焦点" onClose={() => undefined}>
      <input
        aria-label="结束输入的编辑器"
        onKeyDown={(event) => {
          if (event.key === "Tab") event.currentTarget.blur();
        }}
      />
      <button>下一步</button>
    </Modal>
  );
  const first = required(container.querySelector<HTMLButtonElement>(closeControl));
  const editor = required(container.querySelector("input"));
  const last = required(
    [...container.querySelectorAll("button")].find((button) => button.textContent === "下一步")
  );
  for (const control of [first, editor, last]) layout(control);
  editor.focus();
  expect((await keydown(editor)).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(first);
  editor.focus();
  expect((await keydown(editor, { shiftKey: true })).defaultPrevented).toBe(true);
  expect(document.activeElement).toBe(last);
});
