import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp } from "node:fs/promises";

import { afterEach, describe, expect, it } from "vitest";
import { KGOS_VERSION } from "@kgos/sdk";

import {
  currentRuntimeTarget,
  endpointReachable,
  ensureClient,
  readLocator,
  readToken
} from "./runtime.js";
import { CLIError } from "./errors.js";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolveClose) => {
          server.close(() => {
            resolveClose();
          });
        })
    )
  );
});

describe("CLI Runtime discovery", () => {
  it("selects the current supported npm Runtime package", () => {
    const target = currentRuntimeTarget();
    expect(target.packageName).toBe(`@kgos/runtime-${target.platform}-${target.arch}`);
    expect(["darwin", "linux"]).toContain(target.platform);
    expect(["arm64", "x64"]).toContain(target.arch);
  });

  it("reads missing, starting, and running locators", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-runtime-"));
    await expect(readLocator(root)).resolves.toBeUndefined();
    await writeFile(join(root, "kgosd.lock"), JSON.stringify({ pid: 12, version: "0.0.0" }) + "\n");
    await expect(readLocator(root)).resolves.toEqual({ pid: 12, version: "0.0.0" });
    await writeFile(
      join(root, "kgosd.lock"),
      JSON.stringify({
        pid: 12,
        endpoint: "http://127.0.0.1:1234",
        version: "0.0.0"
      }) + "\n"
    );
    await expect(readLocator(root)).resolves.toMatchObject({
      endpoint: "http://127.0.0.1:1234"
    });
  });

  it("rejects malformed locators and missing credentials", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-runtime-"));
    await writeFile(join(root, "kgosd.lock"), '{"pid":0,"version":""}\n');
    await expect(readLocator(root)).rejects.toBeInstanceOf(CLIError);
    await expect(readToken(root)).rejects.toMatchObject({
      code: "AUTHENTICATION_FAILED",
      exitCode: 2
    });
    await writeFile(join(root, "auth.json"), '{"token":""}\n');
    await expect(readToken(root)).rejects.toBeInstanceOf(CLIError);
    await writeFile(join(root, "auth.json"), '{"token":"secret"}\n');
    await expect(readToken(root)).resolves.toBe("secret");
  });

  it("probes only loopback HTTP endpoints", async () => {
    await expect(endpointReachable("not-a-url")).resolves.toBe(false);
    await expect(endpointReachable("https://127.0.0.1:1")).resolves.toBe(false);
    await expect(endpointReachable("http://localhost:1")).resolves.toBe(false);
    await expect(endpointReachable("http://127.0.0.1:1")).resolves.toBe(false);

    const server = createServer((_request, response) => response.end("ok"));
    servers.push(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    await expect(endpointReachable(`http://127.0.0.1:${String(serverPort(server))}`)).resolves.toBe(
      true
    );
  });

  it("reuses a healthy same-root daemon and credential", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-runtime-"));
    await mkdir(root, { recursive: true });
    const server = createServer((request, response) => {
      expect(request.headers.authorization).toBe("Bearer secret");
      response.setHeader("Content-Type", "application/json");
      response.end('{"defaultBranch":"main","state":"commit/a"}');
    });
    servers.push(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const endpoint = `http://127.0.0.1:${String(serverPort(server))}`;
    await writeFile(
      join(root, "kgosd.lock"),
      JSON.stringify({ pid: process.pid, endpoint, version: KGOS_VERSION }) + "\n"
    );
    await writeFile(join(root, "auth.json"), '{"token":"secret"}\n');

    const client = await ensureClient(root);
    await expect(client.evolution.overview()).resolves.toEqual({
      defaultBranch: "main",
      state: "commit/a"
    });
  });

  it("fails closed on a reachable incompatible daemon version", async () => {
    const root = await mkdtemp(join(tmpdir(), "kgos-runtime-"));
    const server = createServer((_request, response) => response.end("ok"));
    servers.push(server);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    await writeFile(
      join(root, "kgosd.lock"),
      JSON.stringify({
        pid: process.pid,
        endpoint: `http://127.0.0.1:${String(serverPort(server))}`,
        version: "9.9.9"
      }) + "\n"
    );
    await expect(ensureClient(root)).rejects.toMatchObject({ exitCode: 2 });
  });
});

function serverPort(server: ReturnType<typeof createServer>): number {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("unexpected HTTP server address");
  }
  return address.port;
}
