// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { restoreCurrentInstanceSession } from "./connect.js";
import type { Connection } from "./connect.js";
import { useWebAuthentication } from "./use-web-authentication.js";
import { logoutWebSession } from "./web-session.js";

vi.mock("./connect.js", () => ({ restoreCurrentInstanceSession: vi.fn() }));
vi.mock("./use-connection-heartbeat.js", () => ({ useConnectionHeartbeat: vi.fn() }));
vi.mock("./web-session.js", () => ({ logoutWebSession: vi.fn() }));

let host: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useWebAuthentication> | null;

function Probe() {
  result = useWebAuthentication();
  return null;
}

function current() {
  if (result === null) throw new Error("hook unavailable");
  return result;
}

function renderProbe() {
  act(() => {
    root.render(<Probe />);
  });
}

function mockConnection(): Connection {
  return { close: vi.fn() } as unknown as Connection;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  result = null;
  vi.mocked(restoreCurrentInstanceSession).mockRejectedValue(new Error("no saved login"));
  vi.mocked(logoutWebSession).mockResolvedValue(undefined);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  host.remove();
  vi.resetAllMocks();
});

it("starts with restoration, then shows the normal login when the cookie is absent", async () => {
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  expect(current().restoring).toBe(false);
  expect(current().connection).toBeNull();
  expect(current().lostReason).toBeNull();
  act(() => {
    current().onLost("offline");
  });
  expect(current().lostReason).toBeNull();
});

it("restores a saved session and can revoke it explicitly", async () => {
  const connection = mockConnection();
  vi.mocked(restoreCurrentInstanceSession).mockResolvedValue(connection);
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  expect(current().restoring).toBe(false);
  expect(current().connection).toBe(connection);
  await act(async () => {
    await current().disconnect();
  });
  expect(logoutWebSession).toHaveBeenCalledOnce();
  expect(connection.close).toHaveBeenCalledOnce();
  expect(current().connection).toBeNull();
  expect(current().logoutError).toBe(false);
});

it("preserves authenticated state when the daemon cannot confirm logout", async () => {
  const connection = mockConnection();
  vi.mocked(restoreCurrentInstanceSession).mockResolvedValue(connection);
  vi.mocked(logoutWebSession).mockRejectedValue(new TypeError("offline"));
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  await act(async () => {
    await current().disconnect();
  });
  expect(current().connection).toBe(connection);
  expect(current().logoutError).toBe(true);
  expect(connection.close).not.toHaveBeenCalled();
});

it("invalidates a changed connection and keeps the reason visible until explicit login", async () => {
  const oldSession = mockConnection();
  const next = mockConnection();
  vi.mocked(restoreCurrentInstanceSession).mockResolvedValue(oldSession);
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  act(() => {
    current().onLost("changed");
  });
  expect(current().connection).toBeNull();
  expect(current().lostReason).toBe("changed");
  expect(oldSession.close).toHaveBeenCalledOnce();
  act(() => {
    current().authenticated(next);
  });
  expect(current().connection).toBe(next);
  expect(current().lostReason).toBeNull();
});

it("ignores duplicate logout submissions while one request is pending", async () => {
  const connection = mockConnection();
  vi.mocked(restoreCurrentInstanceSession).mockResolvedValue(connection);
  let complete: (() => void) | undefined;
  vi.mocked(logoutWebSession).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      })
  );
  await act(async () => {
    root.render(<Probe />);
    await Promise.resolve();
  });
  let first: Promise<void>;
  await act(async () => {
    first = current().disconnect();
    await current().disconnect();
  });
  expect(logoutWebSession).toHaveBeenCalledOnce();
  await act(async () => {
    complete?.();
    await first;
  });
  expect(current().connection).toBeNull();
});

it("drops a stale restored access token after unmount", async () => {
  const connection = mockConnection();
  let complete: ((next: Connection) => void) | undefined;
  vi.mocked(restoreCurrentInstanceSession).mockImplementation(
    () =>
      new Promise<Connection>((resolve) => {
        complete = resolve;
      })
  );
  renderProbe();
  expect(current().restoring).toBe(true);
  act(() => {
    root.unmount();
  });
  await act(async () => {
    complete?.(connection);
    await Promise.resolve();
  });
  expect(connection.close).toHaveBeenCalledOnce();
  // Avoid unmounting the same root twice in afterEach.
  root = createRoot(host);
});
