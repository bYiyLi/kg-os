import { realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { run, runCapture } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const remote = "openclaw";
const remoteSource = "/data/apps/KgosDev/src/KGOS";
const remoteRunner = "cd " + remoteSource + " && sh scripts/mcp-dev-remote.sh";

const exclude = [
  ".git",
  "native",
  ".kgos",
  ".kgos-*",
  ".kgos-dev",
  ".kgos-test",
  "node_modules",
  "**/node_modules",
  "**/dist",
  ".cache",
  ".env",
  ".env.*",
  "*.db",
  "*.lock",
  "*.tsbuildinfo",
  "artifacts",
  "coverage",
  "playwright-report",
  "test-results",
  ".DS_Store"
];

const help = [
  "KG OS Linux integration Dev (openclaw → /data/apps/KgosDev)",
  "",
  "pnpm dev:mcp setup        Prepare directories, configuration and protected token; no database init",
  "pnpm dev:mcp deploy       Sync current local source, build, activate, verify; rollback image on failure",
  "pnpm dev:mcp check        Read-only: health, Instance/runtime doctor and four MCP Tools",
  "pnpm dev:mcp status       Show the running Compose service, image and deployment record",
  "pnpm dev:mcp logs         Show last 100 MCP log lines",
  "pnpm dev:mcp logs-follow  Follow MCP logs (Ctrl+C exits only this command)",
  "pnpm dev:mcp restart      Restart MCP service and verify without clearing data",
  "pnpm dev:mcp rollback     Restore previously verified image; never roll back database data",
  "pnpm dev:mcp backup       SQLite-consistent snapshot (includes private credentials)",
  "pnpm dev:mcp stop         Stop only KG OS Dev MCP; retain its Workspace and secrets",
  "",
  "The remote Workspace must be initialized explicitly with existing 'kg init' options.",
  "The deploy command accepts dirty local source for iterative development and records that fact."
].join("\n");

async function assertRepo() {
  const git = (
    await runCapture("git", ["rev-parse", "--show-toplevel"], { cwd: root })
  ).stdout.trim();
  if ((await realpath(git)) !== (await realpath(root))) {
    throw new Error("Dev command must run from the canonical KG OS Git workspace");
  }
}

async function ssh(command) {
  await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=10", remote, command], {
    cwd: root
  });
}

async function remoteAction(action, args = []) {
  await ssh(remoteRunner + " " + [action, ...args].join(" "));
}

async function syncSource() {
  // --delete is intentionally scoped to the dedicated source mirror, never /data/apps/KgosDev.
  await ssh(
    "mkdir -p " +
      remoteSource +
      " && test ! -L " +
      remoteSource +
      ' && test "$(readlink -f ' +
      remoteSource +
      ')" = ' +
      remoteSource
  );
  await run(
    "rsync",
    [
      "-az",
      "--delete",
      "--safe-links",
      ...exclude.map((pattern) => "--exclude=" + pattern),
      root + "/",
      remote + ":" + remoteSource + "/"
    ],
    { cwd: root }
  );
}

async function deploy() {
  await assertRepo();
  const revision = (await runCapture("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("Expected a full Git revision");
  const status = (await runCapture("git", ["status", "--porcelain"], { cwd: root })).stdout;
  const sourceState = status.trim() === "" ? "clean" : "dirty";
  process.stdout.write("Deploying KG OS Dev: " + revision + " (" + sourceState + ")\n");
  await syncSource();
  await remoteAction("setup");
  await remoteAction("deploy", [revision, sourceState]);
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0] ?? "help";
  if (args.length > 1) throw new Error("Dev command accepts exactly one action");
  if (action === "help" || action === "--help") {
    process.stdout.write(help + "\n");
    return;
  }
  if (action === "deploy") {
    await deploy();
  } else if (action === "setup") {
    await assertRepo();
    await syncSource();
    await remoteAction("setup");
  } else if (
    ["check", "status", "logs", "logs-follow", "restart", "rollback", "backup", "stop"].includes(
      action
    )
  ) {
    await remoteAction(action);
  } else {
    throw new Error("Unknown KG OS Dev action: " + action + "\n" + help);
  }
}

try {
  await main();
} catch (error) {
  process.stderr.write(
    "KG OS Dev: " + (error instanceof Error ? error.message : String(error)) + "\n"
  );
  process.exitCode = 1;
}
