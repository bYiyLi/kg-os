import { createServer } from "node:http";

import { afterEach, describe, expect, it, vi } from "vitest";

import { parseDevelopmentPort, startDevelopmentHost } from "./development-host.js";

async function listenOnEphemeralPort(server: ReturnType<typeof createServer>): Promise<number> {
  await new Promise<void>((resolvePromise) => {
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not expose a TCP address");
  }
  return address.port;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolvePromise();
      } else {
        reject(error);
      }
    });
  });
}

describe("development host", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, 4765],
    ["0", 0],
    ["4766", 4766],
    ["65535", 65_535]
  ])("parses KGOS_DEV_PORT %s", (value, expected) => {
    expect(parseDevelopmentPort(value)).toBe(expected);
  });

  it.each(["", " ", "-1", "1.5", "65536", "not-a-port"])(
    "rejects invalid KGOS_DEV_PORT %s",
    (value) => {
      expect(() => parseDevelopmentPort(value)).toThrow(`Invalid KGOS_DEV_PORT: ${value}`);
    }
  );

  it("serves Vite and keeps reserved routes unavailable", async () => {
    vi.stubEnv("KGOS_DEV_PORT", "0");
    const running = await startDevelopmentHost();

    try {
      const encodedSlash = String.fromCharCode(0x25, 0x32, 0x46);
      const page = await fetch(running.origin);
      const api = await fetch(`${running.origin}/api/status`);
      const encodedApi = await fetch(`${running.origin}/api${encodedSlash}status`);
      const control = await fetch(`${running.origin}/control/status`);
      const encodedControl = await fetch(`${running.origin}/control${encodedSlash}status`);
      const malformed = await fetch(`${running.origin}/%E0%A4%A`);
      const unhandled = await fetch(`${running.origin}/unhandled`, { method: "POST" });

      expect(page.status).toBe(200);
      expect(await page.text()).toContain("/@vite/client");
      expect(api.status).toBe(404);
      expect(encodedApi.status).toBe(404);
      expect(control.status).toBe(404);
      expect(encodedControl.status).toBe(404);
      expect(malformed.status).toBe(404);
      expect(unhandled.status).toBe(404);
    } finally {
      await running.close();
    }

    await expect(running.close()).resolves.toBeUndefined();
  });

  it("closes Vite when the HTTP port is unavailable", async () => {
    const blocker = createServer();
    const port = await listenOnEphemeralPort(blocker);

    try {
      await expect(startDevelopmentHost({ port })).rejects.toMatchObject({
        code: "EADDRINUSE"
      });
    } finally {
      await closeServer(blocker);
    }
  });
});
