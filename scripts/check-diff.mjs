import { spawn } from "node:child_process";
import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");

function gitResult(args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("git", args, {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      resolvePromise({
        code,
        signal,
        stderr: Buffer.concat(stderr).toString("utf8"),
        stdout: Buffer.concat(stdout).toString("utf8")
      });
    });
  });
}

await run("git", ["diff", "--check"], { cwd: root });
await run("git", ["diff", "--cached", "--check"], { cwd: root });

const untracked = await gitResult(["ls-files", "--others", "--exclude-standard", "-z"]);
if (untracked.code !== 0) {
  throw new Error(`Unable to list untracked files:\n${untracked.stderr}`.trimEnd());
}

const errors = [];
for (const file of untracked.stdout.split("\0").filter((path) => path.length > 0)) {
  const result = await gitResult(["diff", "--no-index", "--check", "--", "/dev/null", file]);
  if (result.signal !== null || result.code === null || result.code < 0 || result.code > 3) {
    throw new Error(`Unable to check whitespace in ${file}:\n${result.stderr}`.trimEnd());
  }
  if (result.stdout.length > 0 || result.stderr.length > 0) {
    errors.push(result.stdout, result.stderr);
  }
}

if (errors.length > 0) {
  throw new Error(`Whitespace errors in untracked files:\n${errors.join("")}`.trimEnd());
}
