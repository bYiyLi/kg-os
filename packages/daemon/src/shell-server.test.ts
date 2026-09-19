import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { startStaticShellServer, type RunningShellServer } from "./shell-server.js";

describe("static shell server", () => {
  let root: string;
  let running: RunningShellServer;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "kgos-shell-test-"));
    await writeFile(join(root, "index.html"), "<h1>KG OS shell</h1>", "utf8");
    await writeFile(join(root, "app.js"), "export {};", "utf8");
    await writeFile(join(root, "data.bin"), new Uint8Array([1, 2, 3]));
    await mkdir(join(root, "folder"));
    await symlink("loop", join(root, "loop"));
    running = await startStaticShellServer({ webRoot: root });
  });

  afterEach(async () => {
    await running.close();
    await rm(root, { force: true, recursive: true });
  });

  it("serves the shell, assets, HEAD, and client-side routes", async () => {
    const shell = await fetch(running.origin);
    const asset = await fetch(`${running.origin}/app.js`);
    const head = await fetch(running.origin, { method: "HEAD" });
    const route = await fetch(`${running.origin}/ontology/person`);

    expect(await shell.text()).toContain("KG OS shell");
    expect(shell.headers.get("cache-control")).toBe("no-store");
    expect(asset.headers.get("content-type")).toContain("text/javascript");
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    expect(await route.text()).toContain("KG OS shell");
  });

  it("does not turn the shell into an API readiness bypass", async () => {
    const encodedSlash = String.fromCharCode(0x25, 0x32, 0x46);
    const api = await fetch(`${running.origin}/api/status`);
    const encodedApi = await fetch(`${running.origin}/api${encodedSlash}status`);
    const control = await fetch(`${running.origin}/control/status`);
    const encodedControl = await fetch(`${running.origin}/control${encodedSlash}status`);
    const post = await fetch(running.origin, { method: "POST" });
    const missingAsset = await fetch(`${running.origin}/missing.js`);

    expect(api.status).toBe(404);
    expect(encodedApi.status).toBe(404);
    expect(control.status).toBe(404);
    expect(encodedControl.status).toBe(404);
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    expect(missingAsset.status).toBe(404);
  });

  it("rejects paths that resolve outside the Web root", async () => {
    const response = await fetch(`${running.origin}/..%2Fsecret.txt`);

    expect(response.status).toBe(404);
  });

  it("does not follow symlinks outside the Web root", async () => {
    const outside = await mkdtemp(join(tmpdir(), "kgos-shell-outside-"));
    try {
      const secret = join(outside, "secret.txt");
      await writeFile(secret, "outside root", "utf8");
      await symlink(secret, join(root, "escape.txt"));

      const response = await fetch(`${running.origin}/escape.txt`);

      expect(response.status).toBe(404);
    } finally {
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("handles malformed paths, directories, filesystem errors, and unknown asset types", async () => {
    const malformed = await fetch(`${running.origin}/%E0%A4%A`);
    const directory = await fetch(`${running.origin}/folder`);
    const invalidChildPath = await fetch(`${running.origin}/app.js/child`);
    const filesystemError = await fetch(`${running.origin}/loop`);
    const binary = await fetch(`${running.origin}/data.bin`);

    expect(malformed.status).toBe(404);
    expect(await directory.text()).toContain("KG OS shell");
    expect(await invalidChildPath.text()).toContain("KG OS shell");
    expect(filesystemError.status).toBe(500);
    expect(binary.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("accepts an explicit host and ephemeral port", async () => {
    const explicit = await startStaticShellServer({
      host: "127.0.0.1",
      port: 0,
      webRoot: root
    });

    try {
      expect((await fetch(explicit.origin)).status).toBe(200);
    } finally {
      await explicit.close();
    }
  });
});
