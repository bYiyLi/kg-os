import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

import { run } from "./process.mjs";

const root = resolve(import.meta.dirname, "..");
const webOutput = resolve(root, "packages/web/dist");
const daemonWeb = resolve(root, "packages/daemon/dist/web");

await run("pnpm", ["clean"], { cwd: root });
await run("pnpm", ["exec", "tsc", "-b", "--pretty", "false"], { cwd: root });
await run("pnpm", ["--filter", "@kgos/web", "build"], { cwd: root });
await rm(daemonWeb, { force: true, recursive: true });
await mkdir(daemonWeb, { recursive: true });
await cp(webOutput, daemonWeb, { recursive: true });
