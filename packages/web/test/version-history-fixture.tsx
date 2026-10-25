import { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { vi } from "vitest";

import { useVersionHistory } from "../src/features/version/use-version-history.js";
import type { VersionHistory } from "../src/features/version/use-version-history.js";
import { stateRef } from "../src/features/version/version-data.js";
import type { VersionReader } from "../src/features/version/version-data.js";

export const head = stateRef("a".repeat(64));
export const other = stateRef("b".repeat(64));
export const next = stateRef("c".repeat(64));
export const older = stateRef("d".repeat(64));
export const genesis = stateRef("e".repeat(64));
export function reader(): VersionReader {
  return {
    branch: {
      list: vi.fn().mockResolvedValue({
        items: [
          { name: "main", state: head },
          { name: "learning", state: other }
        ]
      })
    },
    tag: { list: vi.fn().mockResolvedValue({ items: [] }) },
    get: vi
      .fn()
      .mockImplementation((request: { state: string }) =>
        Promise.resolve({ state: request.state })
      ),
    ancestry: vi.fn().mockImplementation((request: { root: string; cursor?: string }) => {
      const states = request.cursor === undefined ? [request.root, older] : [genesis];
      return Promise.resolve({
        root: request.root,
        items: states.map((state, index) => ({
          state,
          parents: index === 0 ? [older] : [],
          committedAt: index === 0 ? 2 : 1,
          message: state.slice(7, 12)
        })),
        ...(request.cursor === undefined ? { cursor: "next" } : {})
      });
    })
  };
}

export function createVersionHistoryHarness() {
  let host: HTMLDivElement;
  let root: Root;
  let current: VersionHistory | undefined;

  function HistoryEffect({
    value,
    run
  }: {
    value: VersionHistory;
    run: (value: VersionHistory) => void;
  }) {
    useEffect(() => {
      run(value);
    }, [value, run]);
    return null;
  }

  function Harness({
    api,
    world,
    fill
  }: {
    api: VersionReader | null;
    world: string;
    fill: ((value: VersionHistory) => void) | undefined;
  }) {
    const value = useVersionHistory(api, head, world);
    useEffect(() => {
      current = value;
    });
    return fill === undefined ? null : <HistoryEffect value={value} run={fill} />;
  }

  function setup() {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    current = undefined;
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  }

  function cleanup() {
    act(() => {
      root.unmount();
    });
    host.remove();
    vi.useRealTimers();
  }

  async function render(
    api: VersionReader | null,
    world = "main",
    fill?: (value: VersionHistory) => void
  ) {
    await act(async () => {
      root.render(<Harness api={api} world={world} fill={fill} />);
      await Promise.resolve();
    });
  }

  function history() {
    if (current === undefined) throw new Error("Missing history");
    return current;
  }

  return { setup, cleanup, render, history };
}

export async function update(action: () => void) {
  await act(async () => {
    action();
    await Promise.resolve();
  });
}
