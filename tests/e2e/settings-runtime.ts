import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { expect } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

export interface SettingsRuntime {
  workspace: string;
  endpoint: string;
  token: string;
  privateKey: string;
  restart: () => Promise<void>;
  close: () => Promise<void>;
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((done, reject) => {
    const deadline = setTimeout(() => {
      reject(new Error("Settings acceptance daemon did not stop"));
    }, 5000);
    child.once("exit", () => {
      clearTimeout(deadline);
      done();
    });
    child.kill("SIGTERM");
  });
}

async function start(workspace: string, request: APIRequestContext) {
  const binary = resolve(
    "artifacts/runtime",
    process.platform + "-" + process.arch,
    process.platform === "win32" ? "kgosd.exe" : "kgosd"
  );
  const child = spawn(
    binary,
    ["--root", workspace, "--mcp-max-concurrency", "7", "--mcp-request-timeout-ms", "45000"],
    { stdio: "ignore", env: { ...process.env, KGOS_LOG_LEVEL: "WARN" } }
  );
  let endpoint = "";
  try {
    await expect
      .poll(
        async () => {
          if (child.exitCode !== null) throw new Error("Settings acceptance daemon exited");
          try {
            const locator = JSON.parse(
              await readFile(join(workspace, ".kgos/kgosd.lock"), "utf8")
            ) as { endpoint?: string; pid?: number };
            endpoint = locator.pid === child.pid ? (locator.endpoint ?? "") : "";
            if (endpoint === "") return "starting";
            const response = await request.get(endpoint + "/api/v1/setup/status");
            return ((await response.json()) as { state: string }).state;
          } catch {
            return "starting";
          }
        },
        { timeout: 25000 }
      )
      .toBe("ready");
    return { child, endpoint };
  } catch (failure) {
    await stop(child);
    throw failure;
  }
}

// Every acceptance owns a throwaway real Go/Lithograph Instance. No API route
// is intercepted and no existing development Instance is modified.
export async function createSettingsRuntime(request: APIRequestContext): Promise<SettingsRuntime> {
  const workspace = await mkdtemp(join(tmpdir(), "kgos-settings-e2e-"));
  const instance = join(workspace, ".kgos");
  const privateKey = randomBytes(32).toString("hex");
  await mkdir(instance, { mode: 0o700 });
  await writeFile(join(instance, "embedding-api-key"), privateKey, { mode: 0o600 });
  await writeFile(
    join(instance, "config.toml"),
    [
      "[server]",
      'public_origin = "https://settings.example.com"',
      "[cache]",
      'path = "cache/settings-original.db"',
      "max_size_mb = 2048",
      "[fulltext]",
      'analyzer = "jieba"',
      "[embedding]",
      // A local-only destination makes the connection-test denial deterministic
      // without sending a real credential to any provider or paid endpoint.
      'base_url = "https://127.0.0.1/v1"',
      'model = "settings-acceptance-model"',
      "dimensions = 3",
      'similarity = "cosine"',
      'api_key_env = "KGOS_WEB_EMBEDDING_API_KEY"',
      ""
    ].join("\n"),
    { mode: 0o600 }
  );
  let active: Awaited<ReturnType<typeof start>>;
  try {
    active = await start(workspace, request);
  } catch (failure) {
    await rm(workspace, { recursive: true, force: true });
    throw failure;
  }
  const auth = JSON.parse(await readFile(join(instance, "auth.json"), "utf8")) as {
    token: string;
  };
  const result: SettingsRuntime = {
    workspace,
    endpoint: active.endpoint,
    token: auth.token,
    privateKey,
    restart: async () => {
      await stop(active.child);
      active = await start(workspace, request);
      result.endpoint = active.endpoint;
    },
    close: async () => {
      await stop(active.child);
      await rm(workspace, { recursive: true, force: true });
    }
  };
  return result;
}

export async function signInSettings(page: Page, runtime: SettingsRuntime) {
  await page.goto(runtime.endpoint + "/");
  const token = page.getByLabel("Access Token", { exact: true });
  await expect
    .poll(async () => {
      const connected = page.locator(".app-shell:not(.is-auth-required)");
      return (await token.isVisible()) || (await connected.isVisible());
    })
    .toBe(true);
  if (await token.isVisible()) {
    await token.fill(runtime.token);
    await page.getByRole("button", { name: "Connect", exact: true }).click();
  }
  await expect(page.locator(".authentication-dialog")).toHaveCount(0);
  await expect(page.locator(".version-sidebar")).toBeVisible();
}
