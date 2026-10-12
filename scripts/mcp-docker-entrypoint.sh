#!/bin/sh
set -eu

root="${KGOS_ROOT:-}"
last=""
for arg in "$@"; do
  if [ "$last" = "--root" ]; then root="$arg"; fi
  last="$arg"
done

if [ "${1:-serve}" = "init" ]; then
  shift
  exec node /opt/kgos/node_modules/@kgos/cli/dist/bin.js --root "$root" init "$@"
fi

if [ "${1:-serve}" != "serve" ]; then
  exec node /opt/kgos/node_modules/@kgos/mcp/dist/bin.js "$@"
fi

node /opt/kgos/node_modules/@kgos/mcp/dist/bin.js "$@" &
mcp_pid=$!

cleanup() {
  trap '' TERM INT
  kill -TERM "$mcp_pid" 2>/dev/null || :
  # Only stop the daemon owned by the container's selected Workspace.
  node - "$root" <<'NODE' || :
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[2];
if (!root) process.exit(0);
try {
  const lock = JSON.parse(fs.readFileSync(path.join(root, ".kgos", "kgosd.lock"), "utf8"));
  if (!Number.isSafeInteger(lock.pid) || lock.pid < 1) process.exit(0);
  const cmdline = fs.readFileSync("/proc/" + String(lock.pid) + "/cmdline", "utf8");
  if (cmdline.includes("kgosd") && cmdline.includes(root)) {
    process.kill(lock.pid, "SIGTERM");
  }
} catch {
  // Daemon already exited or its locator was not active.
}
NODE
}

trap cleanup INT TERM
set +e
wait "$mcp_pid"
status=$?
set -e
cleanup
exit "$status"
