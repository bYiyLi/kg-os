import { act, type ReactNode } from "react";
import { createRoot } from "react-dom/client";

export async function mountVersionView(view: ReactNode) {
  Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
    value: true,
    configurable: true
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await versionAct(() => {
    root.render(view);
  });
  return {
    host,
    close: async () => {
      await versionAct(() => {
        root.unmount();
      });
      host.remove();
    }
  };
}

export async function clickVersionButton(text: string) {
  const button = [...document.querySelectorAll("button")].find(
    (item) => item.textContent.trim() === text || item.getAttribute("aria-label") === text
  );
  if (button === undefined) throw new Error(`缺少按钮 ${text}`);
  await versionAct(() => {
    button.click();
  });
}

export async function versionField(label: string, value: string) {
  const row = [...document.querySelectorAll("label")].find((item) =>
    item.textContent.trim().startsWith(label)
  );
  const field = row?.querySelector("input,textarea,select");
  if (!(
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field instanceof HTMLSelectElement
  ))
    throw new Error(`缺少字段 ${label}`);
  const prototype = Object.getPrototypeOf(field) as object;
  Object.getOwnPropertyDescriptor(prototype, "value")?.set?.call(field, value);
  await versionAct(() => {
    field.dispatchEvent(
      new Event(field instanceof HTMLSelectElement ? "change" : "input", { bubbles: true })
    );
  });
}

export async function versionAct(action: () => void | Promise<void>) {
  await act(async () => {
    await action();
    await Promise.resolve();
  });
}
