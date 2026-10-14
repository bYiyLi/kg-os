// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Mock } from "vitest";

import { TranslationProvider } from "../../../test/translation-provider.js";
import { SidebarHandle } from "./sidebar-handle.js";

let host: HTMLDivElement;
let root: Root;
let onToggle: Mock<() => void>;
let onResize: Mock<(width: number) => void>;
let onDraggingChange: Mock<(dragging: boolean) => void>;
let capturePointer: Mock<(pointerId: number) => void>;
let releasePointer: Mock<(pointerId: number) => void>;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onToggle = vi.fn();
  onResize = vi.fn();
  onDraggingChange = vi.fn();
  capturePointer = vi.fn();
  releasePointer = vi.fn();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
});

function renderHandle(collapsed = false, width = 272): HTMLButtonElement {
  act(() => {
    root.render(
      <TranslationProvider>
        <SidebarHandle
          collapsed={collapsed}
          width={width}
          onToggle={onToggle}
          onResize={onResize}
          onDraggingChange={onDraggingChange}
        />
      </TranslationProvider>
    );
  });
  const button = host.querySelector("button");
  if (button === null) throw new Error("Missing handle");
  button.setPointerCapture = (id) => {
    capturePointer(id);
  };
  button.hasPointerCapture = vi.fn(() => true);
  button.releasePointerCapture = (id) => {
    releasePointer(id);
  };
  return button;
}

function pointer(
  button: HTMLButtonElement,
  type: string,
  [pointerId, x, mouseButton = 0]: readonly [number, number, number?]
) {
  const event = new MouseEvent(type, { bubbles: true, button: mouseButton, clientX: x });
  Object.defineProperty(event, "pointerId", { value: pointerId });
  act(() => {
    button.dispatchEvent(event);
  });
}

function key(button: HTMLButtonElement, name: string) {
  act(() => {
    button.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true }));
  });
}

it("toggles normally and only resizes an expanded handle by supported keys", () => {
  const button = renderHandle(false, 272);
  expect(button.querySelector(".sidebar-handle-contour")?.getAttribute("viewBox")).toBe(
    "0 0 44 112"
  );
  expect(button.querySelector(".sidebar-handle-edge")?.getAttribute("d")).toBe(
    "M39 0 V20 C39 38 25 38 25 56 C25 74 39 74 39 92 V112"
  );
  expect(button.querySelector(".sidebar-handle-surface")).not.toBeNull();
  expect(button.querySelector(".sidebar-handle-edge")).not.toBeNull();
  expect(button.querySelector(".sidebar-handle-contour")?.getAttribute("aria-hidden")).toBe("true");
  expect(button.querySelector(".icon path")?.getAttribute("d")).toBe("m15 5-7 7 7 7");
  key(button, "ArrowRight");
  key(button, "ArrowLeft");
  key(button, "Space");
  expect(onResize.mock.calls.map((call) => call[0])).toEqual([288, 256]);
  act(() => {
    button.click();
  });
  expect(onToggle).toHaveBeenCalledOnce();

  const collapsed = renderHandle(true);
  expect(collapsed.querySelector(".icon path")?.getAttribute("d")).toBe("m9 5 7 7-7 7");
  key(collapsed, "ArrowLeft");
  pointer(collapsed, "pointerdown", [1, 100]);
  expect(onResize).toHaveBeenCalledTimes(2);
  expect(capturePointer).not.toHaveBeenCalled();
  act(() => {
    collapsed.click();
  });
  expect(onToggle).toHaveBeenCalledTimes(2);
});

it("resizes on a threshold-crossing drag, releases capture, and suppresses its click", () => {
  const button = renderHandle();
  pointer(button, "pointerdown", [8, 200]);
  expect(capturePointer).toHaveBeenCalledWith(8);
  pointer(button, "pointermove", [9, 330]); // Wrong pointer.
  pointer(button, "pointermove", [8, 204]); // Below the drag threshold.
  expect(onResize).not.toHaveBeenCalled();
  pointer(button, "pointermove", [8, 260]);
  pointer(button, "pointermove", [8, 273]);
  expect(onDraggingChange.mock.calls.map((call) => call[0])).toEqual([true]);
  expect(onResize.mock.calls.map((call) => call[0])).toEqual([332, 345]);
  pointer(button, "pointerup", [99, 273]); // Wrong pointer must not release.
  expect(releasePointer).not.toHaveBeenCalled();
  pointer(button, "pointerup", [8, 273]);
  expect(releasePointer).toHaveBeenCalledWith(8);
  expect(onDraggingChange).toHaveBeenLastCalledWith(false);
  act(() => {
    button.click();
  });
  expect(onToggle).not.toHaveBeenCalled();
  act(() => {
    button.click();
  });
  expect(onToggle).toHaveBeenCalledOnce();
});

it("rejects secondary pointers, clamps drag widths, and handles capture loss", () => {
  const button = renderHandle();
  pointer(button, "pointerdown", [1, 100, 2]);
  expect(capturePointer).not.toHaveBeenCalled();
  pointer(button, "pointermove", [1, 500]);
  expect(onResize).not.toHaveBeenCalled();

  pointer(button, "pointerdown", [2, 100]);
  pointer(button, "pointermove", [2, 1500]);
  pointer(button, "pointermove", [2, -1200]);
  expect(onResize.mock.calls.map((call) => call[0])).toEqual([420, 240]);
  pointer(button, "lostpointercapture", [2, -1200]);
  expect(onDraggingChange).toHaveBeenLastCalledWith(false);
  pointer(button, "pointerup", [2, -1200]);
  expect(releasePointer).not.toHaveBeenCalled();
});

it("allows normal click following a cancelled drag and skips unnecessary release", () => {
  const button = renderHandle();
  button.hasPointerCapture = vi.fn(() => false);
  pointer(button, "pointerdown", [3, 100]);
  pointer(button, "pointermove", [3, 160]);
  pointer(button, "pointercancel", [3, 160]);
  expect(releasePointer).not.toHaveBeenCalled();
  expect(onDraggingChange).toHaveBeenLastCalledWith(false);
  act(() => {
    button.click();
  });
  expect(onToggle).toHaveBeenCalledOnce();
  pointer(button, "pointercancel", [3, 160]); // Repeated cancel is harmless.
});
