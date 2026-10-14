#!/bin/sh
set -eu
umask 077

# KG OS's dedicated integration development deployment; never use Nexum's paths.
base=/data/apps/KgosDev
source_dir=$base/src/KGOS
env_file=$base/config/compose.env
compose_file=$source_dir/compose.dev.yaml
workspace=$base/data/workspace
history=$base/config/deployments.tsv
image=kgos-dev-mcp:local
previous=kgos-dev-mcp:previous

fail() {
  printf 'KG OS Dev: %s\n' "$*" >&2
  exit 1
}

compose() {
  docker compose --env-file "$env_file" -f "$compose_file" "$@"
}

usage() {
  cat <<'HELP'
Usage: scripts/mcp-dev-remote.sh <setup|preflight|deploy|rollback|restart|check|status|logs|logs-follow|backup|stop>

This script runs on the KG OS Linux Dev host in /data/apps/KgosDev/src/KGOS.
The source and Compose image may be replaced; Workspace, secrets, configuration
and encrypted backups must never be deleted by deployment commands.
HELP
}

assert_source() {
  [ "$(pwd -P)" = "$source_dir" ] || fail "Run from $source_dir"
  [ -f "$compose_file" ] || fail "Missing KG OS Dev Compose file"
}

preflight() {
  assert_source
  command -v docker >/dev/null 2>&1 || fail "Docker is required"
  command -v curl >/dev/null 2>&1 || fail "curl is required"
  command -v node >/dev/null 2>&1 || fail "Node.js is required for the acceptance check"
  [ -f "$env_file" ] || fail "Missing $env_file; run setup first"
  [ -f "$workspace/.kgos/initialized.json" ] || fail "Instance not initialized; run explicit 'init' once"
  [ "$(readlink -f "$workspace")" = "$workspace" ] || fail "Workspace must not be a symlink"
  [ "$(stat -c '%u:%a' "$workspace" )" = "1000:700" ] || fail "Workspace must be owned by UID 1000 and mode 0700"
  [ "$(stat -c '%u:%a' "$env_file")" = "0:600" ] || fail "Dev config must be owned by root and mode 0600"
  compose config --quiet || fail "Invalid KG OS Dev Compose configuration"
}

setup() {
  assert_source
  for path in "$base" "$base/data" "$base/config" "$workspace" "$base/data/secrets" "$env_file"; do
    [ ! -L "$path" ] || fail "Dev paths must not be symlinks: $path"
  done
  mkdir -p "$base/config" "$base/data"
  chmod 700 "$base/config"
  install -d -o 1000 -g 1000 -m 0700 "$workspace" "$base/data/secrets"
  if [ ! -e "$env_file" ]; then
    printf '%s\n' 'KGOS_DEV_NODE_IMAGE=node:24.15.0-bookworm-slim' 'KGOS_DEV_PORT=3777' > "$env_file"
    chmod 0600 "$env_file"
  fi
  printf '%s\n' 'KG OS Dev directories ready (existing values preserved).'
}

container_id() {
  compose ps -q mcp
}

verify() {
  require_ui=${1:-0}
  count=0
  while [ "$count" -lt 90 ]; do
    cid=$(container_id)
    if [ -n "$cid" ] && [ "$(docker inspect "$cid" --format '{{.State.Health.Status}}' 2>/dev/null || true)" = healthy ]; then
      break
    fi
    count=$((count + 1))
    sleep 1
  done
  [ "$count" -lt 90 ] || fail "MCP service did not become healthy"

  binding=$(compose port mcp 3777)
  case "$binding" in
    0.0.0.0:[0-9]*) ;;
    *) fail "MCP Dev must publish on 0.0.0.0 (observed: $binding)" ;;
  esac
  port=${binding##*:}
  status=$(curl --noproxy '*' --silent --max-time 5 --output /dev/null --write-out '%{http_code}' "http://127.0.0.1:$port/mcp") || fail "MCP HTTP not reachable"
  [ "$status" = 401 ] || fail "MCP without a credential must return 401, got $status"

  # Phase 16: the deployed image contains only Go kgosd. The external
  # read-only client runs on OpenClaw and never enters the production image.
  # Keep the legacy verifier ONLY so an unsuccessful migration can roll back
  # to the previously verified Node MCP image without touching Instance data.
  process=$(docker exec "$cid" /bin/cat /proc/1/comm | tr -d '\r\n')
  if [ "$process" = kgosd ]; then
    [ "$(docker exec "$cid" /usr/bin/id -u)" = 1000 ] || fail "Unified Dev must preserve existing Workspace UID 1000"
    legacy_file=
    if docker exec "$cid" /opt/kgos/kgosd --help 2>/dev/null | grep -q -- '--mcp-token-file'; then
      legacy_file="$base/data/secrets/mcp-token"
      [ -f "$legacy_file" ] && [ ! -L "$legacy_file" ] ||
        fail "Legacy MCP verifier needs its preserved Secret file"
      [ "$(stat -c '%u:%a' "$legacy_file")" = "1000:400" ] ||
        fail "Legacy MCP Secret must be owned by UID 1000 and mode 0400"
    fi
    KGOS_DEV_ENDPOINT="http://127.0.0.1:$port" \
      KGOS_DEV_AUTH_FILE="$workspace/.kgos/auth.json" \
      KGOS_DEV_LEGACY_MCP_TOKEN_FILE="$legacy_file" \
      KGOS_DEV_OAUTH_ISSUER="${KGOS_DEV_OAUTH_ISSUER:-https://kgos-dev.y2l.top}" \
      KGOS_DEV_REQUIRE_UI="$require_ui" \
      node "$source_dir/scripts/mcp-dev-accept-unified.mjs" ||
        fail "Authenticated unified MCP read-only acceptance failed"
    return 0
  fi

  compose exec -T mcp node --input-type=module -e '
    const issuer = process.env.KGOS_MCP_OAUTH_ISSUER;
    if (!issuer) throw new Error("KG OS Dev OAuth issuer is missing");
    const base = "http://127.0.0.1:3777";
    const resourcePaths = [
      "/.well-known/oauth-protected-resource",
      "/.well-known/oauth-protected-resource/mcp"
    ];
    for (const path of resourcePaths) {
      const response = await fetch(base + path);
      if (!response.ok) throw new Error("OAuth resource metadata unavailable: " + path);
      const metadata = await response.json();
      if (metadata.resource !== issuer || !metadata.authorization_servers?.includes(issuer)) {
        throw new Error("OAuth resource metadata does not match public issuer");
      }
    }
    const response = await fetch(base + "/.well-known/oauth-authorization-server");
    if (!response.ok) throw new Error("OAuth authorization server metadata unavailable");
    const metadata = await response.json();
    if (metadata.issuer !== issuer ||
      metadata.authorization_endpoint !== issuer + "/oauth/authorize" ||
      metadata.token_endpoint !== issuer + "/oauth/token" ||
      !metadata.code_challenge_methods_supported?.includes("S256") ||
      !metadata.token_endpoint_auth_methods_supported?.includes("none") ||
      metadata.client_id_metadata_document_supported !== true) {
      throw new Error("OAuth authorization metadata is incompatible");
    }
    const challenge = await fetch(base + "/mcp");
    if (challenge.status !== 401 ||
      !challenge.headers.get("www-authenticate")?.includes(issuer + "/.well-known/oauth-protected-resource/mcp")) {
      throw new Error("OAuth resource_metadata challenge unavailable");
    }
    console.log("OAuth discovery: issuer, metadata and 401 challenge ready");
  ' || fail "KG OS Dev OAuth discovery failed"

  compose exec -T mcp node /opt/kgos/node_modules/@kgos/mcp/dist/bin.js doctor --json |
    node -e '
      let input = "";
      process.stdin.on("data", chunk => { input += chunk; });
      process.stdin.on("end", () => {
        const report = JSON.parse(input);
        if (report.ready !== true) process.exit(1);
        console.log("Instance, runtime and MCP doctor: ready");
      });
    ' || fail "KG OS daemon or native Runtime not ready"

  compose exec -T mcp node --input-type=module - < "$source_dir/scripts/mcp-dev-accept.mjs" ||
    fail "Authenticated MCP read-only acceptance failed"
}

record() {
  revision=$1
  source_state=$2
  cid=$(container_id)
  identity=$(docker inspect "$cid" --format '{{.Image}}')
  printf '%s\t%s\t%s\t%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$revision" "$source_state" "$identity" >> "$history"
  chmod 0600 "$history"
  printf 'Verified image: %s\n' "$identity"
}

rollback_image() {
  docker image inspect "$previous" >/dev/null 2>&1 || fail "No previous verified image; data was not changed"
  docker image tag "$previous" "$image"
  # A Phase 16 Go image needs the legacy MCP administrator Secret, whereas
  # Phase 17 rejects that configuration. Supply it ONLY to the rollback image.
  if docker run --rm --entrypoint /opt/kgos/kgosd "$previous" --help 2>/dev/null | grep -q -- '--mcp-token-file'; then
    legacy_secret="$base/data/secrets/mcp-token"
    [ -f "$legacy_secret" ] && [ ! -L "$legacy_secret" ] ||
      fail "Legacy rollback needs its preserved MCP Secret file"
    [ "$(stat -c '%u:%a' "$legacy_secret")" = "1000:400" ] ||
      fail "Legacy rollback Secret must have UID 1000 and mode 0400"
    override=$(mktemp "$base/config/legacy-rollback.XXXXXXXX.yaml") ||
      fail "Cannot prepare legacy rollback override"
    cat > "$override" <<'YAML'
services:
  mcp:
    environment:
      KGOS_MCP_TOKEN_FILE: /run/secrets/kgos-mcp-token
    volumes:
      - type: bind
        source: /data/apps/KgosDev/data/secrets/mcp-token
        target: /run/secrets/kgos-mcp-token
        read_only: true
YAML
    if docker compose --env-file "$env_file" -f "$compose_file" -f "$override" up -d --no-build --force-recreate mcp; then
      rm -f "$override"
    else
      rm -f "$override"
      fail "Legacy rollback container could not start"
    fi
    verify
    return
  fi
  compose up -d --no-build --force-recreate mcp
  verify
}

deploy() {
  revision=${1:-}
  source_state=${2:-}
  case "$revision" in
    ""|*[!0-9a-f]*) fail "A Git revision is required" ;;
  esac
  [ "${#revision}" = 40 ] || fail "Expected a full 40-character Git revision"
  case "$source_state" in clean|dirty) ;; *) fail "Expected source state clean or dirty" ;; esac
  preflight

  # Pin the currently running *image ID*, not the potentially stale floating :local tag.
  cid=$(container_id)
  had_previous=0
  if [ -n "$cid" ]; then
    old_image=$(docker inspect "$cid" --format '{{.Image}}')
    docker image tag "$old_image" "$previous"
    had_previous=1
  fi
  # A failed online backup must stop deployment before the image or container changes.
  backup
  compose build mcp
  if compose up -d --no-build --force-recreate mcp && (verify 1); then
    record "$revision" "$source_state"
    return 0
  fi
  if [ "$had_previous" = 1 ]; then
    printf '%s\n' 'New MCP image failed acceptance; restoring the previous running image.' >&2
    rollback_image || fail "Automatic image rollback failed; inspect manually"
  fi
  fail "Deployment failed; Dev data was preserved"
}

backup() {
  preflight
  command -v python3 >/dev/null 2>&1 || fail "Python 3 is required for SQLite online backup"
  install -d -m 0700 "$base/data/backups"
  directory=$(mktemp -d "$base/data/backups/$(date -u '+%Y%m%dT%H%M%SZ')-XXXXXXXX")
  for name in config.toml auth.json initialized.json; do
    cp "$workspace/.kgos/$name" "$directory/$name" || fail "Could not back up $name"
    chmod 0600 "$directory/$name"
  done
  # Preserve installed native/additional extensions; omit only re-creatable cache,
  # daemon locator and logs. This snapshot does not touch the running Workspace.
  if [ -d "$workspace/.kgos/extensions" ]; then
    cp -R "$workspace/.kgos/extensions" "$directory/extensions" || fail "Could not back up extensions"
  fi
  python3 - "$workspace/.kgos/kgos.db" "$directory/kgos.db" <<'PY'
import sqlite3
import sys
with sqlite3.connect(f"file:{sys.argv[1]}?mode=ro", uri=True) as source:
    with sqlite3.connect(sys.argv[2]) as destination:
        source.backup(destination)
PY
  chmod 0600 "$directory/kgos.db"
  chmod -R go-rwx "$directory"
  printf 'KG OS Dev SQLite-consistent snapshot (includes credentials): %s\n' "$directory"
}

action=${1:-help}
shift || true
case "$action" in
  help|--help|-h) usage ;;
  setup) setup ;;
  preflight) preflight; printf '%s\n' 'KG OS Dev preflight passed' ;;
  deploy) deploy "$@" ;;
  rollback) preflight; rollback_image; record rollback restored ;;
  restart) preflight; compose restart mcp; verify ;;
  check) preflight; verify ;;
  status)
    preflight
    compose ps
    cid=$(container_id)
    if [ -n "$cid" ]; then docker inspect "$cid" --format 'Running image: {{.Image}}'; fi
    if [ -f "$history" ]; then tail -n 1 "$history"; fi
    ;;
  logs) preflight; compose logs --tail 100 mcp ;;
  logs-follow) preflight; compose logs --tail 100 --follow mcp ;;
  backup) backup ;;
  stop) preflight; compose stop mcp ;;
  *) usage >&2; fail "Unknown Dev action: $action" ;;
esac
