import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, delimiter, dirname, extname, join } from "node:path";

export function spawnCommand(command, args, options = {}) {
  const env = options.env ?? process.env;
  if (process.platform !== "win32" || !["npm", "npx", "pnpm"].includes(command)) {
    return spawn(command, args, options);
  }

  const pathEntry = Object.entries(env).find(([name]) => name.toUpperCase() === "PATH");
  const executable = pathEntry?.[1]
    ?.split(delimiter)
    .map((directory) => directory.replace(/^"|"$/g, ""))
    .filter(Boolean)
    .flatMap((directory) => [join(directory, command + ".exe"), join(directory, command + ".cmd")])
    .find(existsSync);
  if (executable === undefined) {
    throw new Error("Cannot locate " + command + " on PATH");
  }
  if (extname(executable).toLowerCase() === ".exe") {
    return spawn(executable, args, options);
  }
  const directory = dirname(executable);
  const candidates =
    command === "pnpm"
      ? [
          typeof env.npm_execpath === "string" && basename(env.npm_execpath).startsWith("pnpm")
            ? env.npm_execpath
            : undefined,
          join(directory, "..", "pnpm", "bin", "pnpm.mjs"),
          join(directory, "..", "pnpm", "bin", "pnpm.cjs")
        ]
      : [join(directory, "node_modules", "npm", "bin", command + "-cli.js")];
  const script = candidates.find(
    (path) => path !== undefined && /\.[cm]?js$/i.test(path) && existsSync(path)
  );
  if (script === undefined) {
    throw new Error("Cannot locate " + command + " JavaScript entrypoint");
  }
  return spawn(process.execPath, [script, ...args], options);
}

export function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: options.stdio ?? "inherit"
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const reason = signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${reason}`));
    });
  });
}

export function runCapture(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnCommand(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve({ stderr, stdout });
        return;
      }

      const reason = signal === null ? `exit code ${String(code)}` : `signal ${signal}`;
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${reason}\n${stdout}${stderr}`.trimEnd()
        )
      );
    });
  });
}

export async function waitForProcessExit(pid, timeoutMessage) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return;
      }
      throw error;
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 40));
  }
  throw new Error(timeoutMessage);
}
