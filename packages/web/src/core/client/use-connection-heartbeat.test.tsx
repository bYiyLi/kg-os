// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { Connection } from "./connect.js";
import { useConnectionHeartbeat } from "./use-connection-heartbeat.js";

let host: HTMLDivElement;
let root: Root;

function Probe({ connection }: { connection: Connection | null }) {
  useConnectionHeartbeat(connection);
  return null;
}

function render(connection: Connection | null) {
  act(() => {
    root.render(<Probe connection={connection} />);
  });
}

async function focus() {
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    await Promise.resolve();
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.useRealTimers();
});

it("does not monitor when disconnected and cleans up subscriptions on disconnect", async () => {
  const checker = vi.fn<() => Promise<void>>().mockResolvedValue();
  render(null);
  await focus();
  act(() => {
    vi.advanceTimersByTime(15_000);
  });
  expect(checker).not.toHaveBeenCalled();

  render({ check: checker } as unknown as Connection);
  await focus();
  expect(checker).toHaveBeenCalledOnce();
  render(null);
  await focus();
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
  expect(checker).toHaveBeenCalledOnce();
});

it("checks on focus and timer only while visible, without overlapping requests", async () => {
  let visible = false;
  const original = Object.getOwnPropertyDescriptor(document, "hidden");
  Object.defineProperty(document, "hidden", { configurable: true, get: () => !visible });
  let finish: (() => void) | undefined;
  const checker = vi.fn<() => Promise<void>>().mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      })
  );
  try {
    render({ check: checker } as unknown as Connection);
    await focus();
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      vi.advanceTimersByTime(15_000);
    });
    expect(checker).not.toHaveBeenCalled();
    visible = true;
    await focus();
    await focus();
    act(() => {
      vi.advanceTimersByTime(15_000);
    });
    expect(checker).toHaveBeenCalledOnce();
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });
    expect(checker).toHaveBeenCalledTimes(2);
    await act(async () => {
      finish?.();
      await Promise.resolve();
    });
  } finally {
    if (original !== undefined) Object.defineProperty(document, "hidden", original);
  }
});

it("continues monitoring after a caught connection failure without unhandled rejections", async () => {
  const checker = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error("network unavailable"))
    .mockResolvedValueOnce();
  render({ check: checker } as unknown as Connection);
  await focus();
  await focus();
  expect(checker).toHaveBeenCalledTimes(2);
});
