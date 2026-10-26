---
title: "Install KG OS"
description: "Deploy KG OS, connect ChatGPT, create a private Plugin, and complete checks, upgrades and recovery."
version: "0.3.5"
---

<!-- cspell:words newurl rstrip isfinite hashlib pathlib urlopen hexdigest sudoedit xattrs getpass fileno -->

This guide targets a **Linux amd64 host you choose**. We recommend **Docker Compose + Web setup**; Docker commands and configuration-file initialization are also available. If you already have a service, verify its identity and status and reuse its data instead of overwriting it with a new installation.

Installation order: **deploy and initialize → public HTTPS → connect ChatGPT → create a private Plugin with AI → global guidance → check and use**. The basic MCP app works independently. Continue with the private Plugin for all seven official Skills and complete usage guidance.

**Existing instance:** record its actual image version, persistent directory, launch configuration and public address, then use step 4’s read-only status query. If `ready`, keep the original paths and start at step 6 for verification; otherwise use step 11 for recovery. Skip new-directory, container-creation and initialization steps. Deployments with another layout must use their corresponding original commands.

## 1. Prepare your environment

You need:

- A Linux x86_64 host, permission to operate Docker Engine, Bash, curl and Python 3. The Compose path also needs Docker Compose **2.30 or newer** to read the credential file without interpolation.
- GNU tar, GNU coreutils (including sha256sum and mv), and sudo permission to preserve file ownership in complete backups. Prepare enough free storage before an upgrade.
- Persistent storage and network access to GHCR and your selected Embedding service. `localhost` inside a container refers to that container; host or private-network models need an address reachable from the container.
- A domain you control, such as `kgos.example.com`, and the final root address `https://kgos.example.com`. You choose the domain, host, model service and associated costs.
- The Base URL, model name, actual output dimensions (1–4096), `cosine` or `euclidean` similarity, and any API Key required by an OpenAI-compatible Embeddings service. An endpoint without authentication can use an empty key.

- A target ChatGPT account or Workspace that allows custom MCP servers and Plugin installation/use. Creating the private Plugin also requires access to Plugin Creator. Check [ChatGPT Plugins](https://chatgpt.com/plugins) and your Workspace permissions first. If a capability is missing, choose to request administrator access, use another permitted account, or complete the service first. A working service alone is not a complete installation.

Check the target host:

```bash
uname -m
docker version
docker compose version
```

Expect `x86_64` and Docker output that includes Server. Skip the Compose check if you will use Docker commands only. The current release has no native arm64 image. This guide does not cover emulation or choose a cloud host for you.

### Version and image

**Applies to: KG OS v0.3.5.** The image and official Plugin come from the [formal Release](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.5). Commands pin the version and immutable digest:

```text
ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
```

The image supports only `linux/amd64`, listens on port `3777` by default and runs as `10001:10001`. Container `/workspace` maps to your persistent directory; configuration and data live in its `.kgos` subdirectory. There is currently no official floating `:latest` tag. For an existing instance, check compatibility in the [upgrade procedure](#upgrade) instead of applying new-install commands.

Use the version menu to read the complete manual for each formal release; switching languages preserves the selected version. This release’s Chinese/English guides, [AI installation guide](https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md), and [official Plugin](https://github.com/bYiyLi/kg-releases/releases/download/v0.3.5/kgos-plugin-v0.3.5.zip) all apply to KG OS v0.3.5. Later releases do not overwrite this body. Read the target release instructions before upgrading. Use the official Plugin package for Skills and resources; follow this version’s companion AI guide for the installation workflow.

### Create a separate installation directory

These commands are for a **new installation**. First check whether the directory, container names, network and volumes are already in use:

```bash
ls -ld "$HOME/kgos"
docker ps -a --format '{{.Names}}'
docker network ls --format '{{.Name}}'
docker volume ls --format '{{.Name}}'
ss -ltn
```

An error from `ls` is expected if the new project directory does not exist. If `~/kgos`, `kgos`, `kgos-caddy`, `kgos-net`, `kgos-caddy-data`, `kgos-caddy-config` or port `3777` is occupied, identify its owner first. Choose to reuse that installation or change the entire set of names and ports for a separate installation. Do not delete or take over unknown resources. If `ss` is unavailable, use your host's network tools to check ports.

After confirming these names are free, run the following in the same terminal. Stop at any failed command and resolve it before running later commands:

```bash
(
  set -eu
  umask 077
  mkdir "$HOME/kgos"
  cd "$HOME/kgos"
  sudo install -d -m 0700 -o 10001 -g 10001 "$PWD/workspace" "$PWD/workspace/.kgos"
  install -m 0600 /dev/null embedding.env
  docker network create kgos-net
  docker pull ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
)
```

Preparation runs in a separate shell that stops on any error. An existing directory prevents later permission or file changes. After an interruption, inspect directories, networks and pulled images first, and complete only confirmed missing steps. Do not rerun the whole block or delete generated data. Only after the whole block succeeds, use this working directory and private file permissions for subsequent commands:

```bash
cd "$HOME/kgos"
umask 077
```

Set ownership only on the directories just created here; do not recursively change ownership of existing data. `embedding.env` is a credential file readable and writable only by your local account. Leave it empty for Web setup.

## 2. Choose your initialization method

| Method                                          | Suitable for                                 | Before starting                                      |
| ----------------------------------------------- | -------------------------------------------- | ---------------------------------------------------- |
| [Web setup](#start-service) (recommended)       | Guided input and connection testing          | Leave `.kgos` without `config.toml` and go to step 3 |
| [Configuration-file initialization](#file-init) | Managing the complete configuration yourself | Complete the configuration below, then go to step 3  |

Choose one. If `config.toml`, `auth.json` or a database already exists, identify the previous installation first; this is not an empty directory.

<a id="file-init"></a>

### Configuration-file path: prepare a complete configuration

Create `config.toml` in `~/kgos`. Replace the example domain, provider and model with your choices. The OpenAI URL and model below illustrate field relationships; they do not select a provider for you. The model must actually return the configured dimensions.

```toml
[server]
public_origin = "https://kgos.example.com"

[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

[sqlite]
extensions = []

[fulltext]
analyzer = "jieba"

[embedding]
base_url = "https://api.openai.com/v1"
model = "text-embedding-3-small"
dimensions = 1536
similarity = "cosine"
api_key_env = "KGOS_EMBEDDING_API_KEY"
```

- `public_origin` is the **final public HTTPS root address**, without `/mcp`, any other path, query or fragment. Entering it does not configure DNS or certificates.
- `cache.path` resolves relative to `.kgos`; `max_size_mb` must be a positive integer. The example uses a 4096 MiB vector-cache budget and does not preallocate that disk space. All `cache`, `fulltext` and `embedding` fields must be explicit; omitted fields do not mean default or disabled.
- `sqlite.extensions=[]` does not list the official extensions already bundled in the image. `jieba` is the built-in full-text analyzer.
- The Base URL excludes `/embeddings`; requests append `/embeddings` to it. The example does not send a `dimensions` parameter: configured dimensions must match the model's actual output.
- When authentication is required, open `embedding.env` in a local editor and use the format below. Replace the placeholder with the real value without adding quotes. Keep keys out of TOML, command history, Git and chat.

```text
KGOS_EMBEDDING_API_KEY=replace-with-your-provider-key
```

For an unauthenticated endpoint, use `api_key_env = ""` in TOML and leave `embedding.env` empty. Do not set the reserved `KGOS_WEB_EMBEDDING_API_KEY` variable; it is for Web Setup internals.

After saving, install the configuration into the instance directory so only the runtime identity can read and write it:

```bash
chmod 600 config.toml embedding.env
sudo install -m 0600 -o 10001 -g 10001 config.toml workspace/.kgos/config.toml
```

Continue to step 3. A complete valid configuration triggers automatic initialization at daemon startup. Do not run another initialization container or a second daemon.

<a id="start-service"></a>

## 3. Choose how to start the service

Both methods share `workspace`, `embedding.env` and `kgos-net`. **Choose one**, rather than creating two services. The published port binds only to host loopback; keep initialization off the public internet.

<a id="compose"></a>

### Docker Compose (recommended)

Save this complete configuration as `~/kgos/compose.yaml`:

```yaml
services:
  kgos:
    image: ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
    platform: linux/amd64
    container_name: kgos
    user: "10001:10001"
    restart: unless-stopped
    ports:
      - "127.0.0.1:3777:3777"
    volumes:
      - ./workspace:/workspace
    env_file:
      - path: ./embedding.env
        format: raw
    networks:
      kgos:
        aliases:
          - kgos
networks:
  kgos:
    external: true
    name: kgos-net
```

```bash
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml up -d
docker compose -f compose.yaml logs --tail 80 kgos
```

`config --quiet` validates the configuration without displaying expanded credentials. Expect the container to remain running with no permission or initialization errors. Continue to step 4.

<a id="docker"></a>

### Docker commands

This path does not require Compose. Run from `~/kgos`:

```bash
docker run -d \
  --name kgos \
  --platform linux/amd64 \
  --user 10001:10001 \
  --restart unless-stopped \
  --network kgos-net --network-alias kgos \
  -p 127.0.0.1:3777:3777 \
  --mount type=bind,src="$PWD/workspace",dst=/workspace \
  --env-file "$PWD/embedding.env" \
  ghcr.io/byiyli/kgos:v0.3.5@sha256:24306c7341004b9b2e5cb5b10c68d809f1812851def0aec06f649e130da5dacc
docker logs --tail 80 kgos
```

Expect the container to remain running with no permission or initialization errors. If the name already exists, inspect its state instead of repeating the creation command.

## 4. Complete initialization

First query status on the service host:

```bash
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' http://127.0.0.1:3777/api/v1/setup/status
```

- Web setup should report `state="setup_required"`; proceed with the wizard below.
- The configuration-file path creates its administrator Token during automatic initialization; an unauthenticated status request then returns **401**. Use the authenticated status check below to confirm `initializing` → `ready`, then continue to [configuration-file checks](#file-check).
- If initial status is `error`, follow the recovery table. HTTP 401 after a credential exists is not an initialization failure; it indicates the authentication boundary is active. A running container alone is not completion.

When `auth.json` exists, inspect status from a trusted host using the existing root credential **without printing it or placing it in a command argument** (run from `~/kgos`):

```bash
sudo python3 - <<'PY'
import json, pathlib, urllib.request
credential = json.loads(pathlib.Path("workspace/.kgos/auth.json").read_text())
req = urllib.request.Request("http://127.0.0.1:3777/api/v1/setup/status",
    headers={"Authorization": "Bearer " + credential["token"]})
with urllib.request.urlopen(req, timeout=10) as response:
    print(response.read().decode())
PY
```

<a id="web-init"></a>

### Web path: the four-step Token-first setup

On the service host, open `http://127.0.0.1:3777/setup` in a browser. For a remote host, open another terminal **on your computer** and forward SSH, replacing the username and host with your existing SSH connection:

```bash
ssh -N -L 13777:127.0.0.1:3777 your-user@your-server
```

Keep this terminal open and visit `http://127.0.0.1:13777/setup` in your local browser. The browser does not need direct access to a public server port `3777`.

Complete the four screen steps:

1. **Administrator credential**: on a new instance, call `rotate-token` through the first Setup screen to generate and save the administrator Token once. It takes effect immediately. Thereafter all Setup APIs, including status, rotation, and Embedding validation, require valid administrator authentication. For an existing instance, enter the original Token to log in or restore an existing Session; anonymous regeneration is prohibited. Do not share your Token in chat.
2. **Public address**: replace the loopback suggestion with your final `https://kgos.example.com`, using your actual domain. Do not use the browser's SSH-forwarding address.
3. **Vector model**: enter your chosen Base URL, model, actual dimensions, similarity and API Key; leave the key empty for no authentication. Run the connection test and continue only after a real successful request with matching dimensions. Any HTTP(S) target is allowed for an authenticated administrator, including loopback, private networks and Fake-IP. Ensure the endpoint is reachable from the container; timeouts, size limits, concurrency limits and redirect protection remain.
4. **Review and initialize**: review and submit the configuration, then wait for `ready`. If it fails, preserve configuration and data, diagnose the cause below and restart the original container rather than creating a fresh database.

Web setup saves a complete configuration and stores the Embedding Key separately in a private file, not in TOML. If the browser Session is lost before configuration is submitted, log in using the existing Token before invoking `rotate-token`. An authenticated rotation invalidates the old Token and Sessions, so save the replacement securely. The action is unavailable after configuration is submitted. For `error`, preserve configuration and `auth.json`, diagnose the cause and restart the original container.

**Continue only when** the real Embedding test has passed, the Token is safely saved, and `setup/status` reports `ready`. Only after all four screens succeed should you proceed to persistent checks.

<a id="file-check"></a>

### Configuration-file path: credential and real model checks

Wait for `state="ready"`. The system creates and retains the administrator Token in `.kgos/auth.json`. From a trusted terminal, copy it into a file only you can read, open it in a local editor and save it in your password manager without printing it to the terminal:

```bash
sudo install -m 0600 -o "$(id -u)" -g "$(id -g)" workspace/.kgos/auth.json admin-credential.json
```

Log in to Web using that Token through the local or SSH-forwarded address above. `ready` confirms runtime and database initialization; **it does not prove remote model availability**.

Run the one-time check below. It additionally pulls the [official Python image](https://hub.docker.com/_/python), briefly shares KG OS's network, mounts the instance directory read-only, reads only configuration and the required model credential, and sends one Embedding request. It creates no ontology, knowledge, branch or Commit. The file path reads credentials from your `embedding.env`; the Web path reads the private instance model-credential file only when configuration selects the reserved variable; neither the response body nor keys are printed. The provider may charge for this single model request.

```bash
docker run --rm -i \
  --network container:kgos \
  --env-file "$PWD/embedding.env" \
  --mount type=bind,src="$PWD/workspace/.kgos",dst=/instance,readonly \
  python:3.13-alpine python - <<'PY'
import json, math, os, pathlib, sys, tomllib, urllib.request
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None
try:
    with open('/instance/config.toml', 'rb') as f:
        cfg = tomllib.load(f)['embedding']
    headers = {'Content-Type': 'application/json'}
    if cfg['api_key_env']:
        key = (pathlib.Path('/instance/embedding-api-key').read_text()
               if cfg['api_key_env'] == 'KGOS_WEB_EMBEDDING_API_KEY'
               else os.environ.get(cfg['api_key_env'], ''))
        if not key:
            raise ValueError('missing credential')
        headers['Authorization'] = 'Bearer ' + key
    body = json.dumps({'model': cfg['model'], 'input': 'KG OS installation check',
                       'encoding_format': 'float'}).encode()
    req = urllib.request.Request(cfg['base_url'].rstrip('/') + '/embeddings',
                                 data=body, headers=headers, method='POST')
    with urllib.request.build_opener(NoRedirect).open(req, timeout=30) as response:
        result = json.load(response)
    vector = result['data'][0]['embedding']
    assert len(vector) == cfg['dimensions']
    assert all(type(v) in (int, float) and math.isfinite(v) for v in vector)
    assert any(v != 0 for v in vector)
    print('Embedding check passed:', len(vector), 'dimensions')
except Exception:
    print('Embedding check failed; check URL, model, dimensions, credential and network.', file=sys.stderr)
    sys.exit(1)
PY
```

Expect `Embedding check passed` and your configured dimensions. On failure, repair the selected service, networking or credential first. Do not directly replace the initialized model, dimensions, similarity or full-text analyzer using new-install examples; obtain an applicable migration procedure and choose it explicitly if a change is required. Use the controlled credential-update steps at the end. After changing the environment file, recreate this guide's service container to reload the environment, retaining the same `workspace` mount and all data. Compose users can use `docker compose -f compose.yaml up -d --force-recreate kgos`. Docker users should stop and remove **only the container just created for this guide**, then rerun its original creation command; never remove volumes or directories. Pass the same-network test before public access. This check also supports the existing configuration after Web initialization and can be reused for upgrades, without reopening Setup or generating credentials.

## 5. Configure public HTTPS

Open public access only after step 4 passes. If you already have a trusted HTTPS reverse proxy, reuse it: forward to this instance, preserve host/protocol information, support MCP streaming, and match its public root to `public_origin`.

The standard option below uses [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https):

1. Point your domain's A record to this host's public IPv4 address. If an AAAA record exists, its IPv6 address must also be reachable.
2. Allow external TCP `80` and `443` through the host firewall, cloud security group and any router/NAT to this host. Ensure other services are not using these ports. Keep KG OS `3777` published only on loopback.
3. Permit outbound HTTPS to certificate authorities. Entering a domain does not mean a certificate exists.

Save `~/kgos/Caddyfile`, replacing the example with your actual domain:

```text
kgos.example.com {
    reverse_proxy kgos:3777 {
        flush_interval -1
    }
}
```

Caddy and KG OS share the `kgos-net` network; `kgos` is the container network alias. Use the same method you chose in step 3.

### HTTPS for the Compose path

Save `compose.https.yaml`:

```yaml
services:
  caddy:
    image: caddy:2.11.7-alpine
    container_name: kgos-caddy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    networks:
      - kgos
volumes:
  caddy_data:
    name: kgos-caddy-data
  caddy_config:
    name: kgos-caddy-config
```

```bash
docker compose -f compose.yaml -f compose.https.yaml config --quiet
docker compose -f compose.yaml -f compose.https.yaml run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile
docker compose -f compose.yaml -f compose.https.yaml up -d caddy
docker logs --tail 80 kgos-caddy
```

### HTTPS for the Docker command path

```bash
docker volume create kgos-caddy-data
docker volume create kgos-caddy-config
docker run --rm \
  --mount type=bind,src="$PWD/Caddyfile",dst=/etc/caddy/Caddyfile,readonly \
  caddy:2.11.7-alpine caddy validate --config /etc/caddy/Caddyfile
docker run -d \
  --name kgos-caddy \
  --restart unless-stopped \
  --network kgos-net \
  -p 80:80 -p 443:443 \
  --mount type=bind,src="$PWD/Caddyfile",dst=/etc/caddy/Caddyfile,readonly \
  --mount type=volume,src=kgos-caddy-data,dst=/data \
  --mount type=volume,src=kgos-caddy-config,dst=/config \
  caddy:2.11.7-alpine
docker logs --tail 80 kgos-caddy
```

The first start requests a certificate; do not continue until it succeeds. Caddy `/data` and `/config` use persistent volumes: reuse them when recreating the proxy and preserve certificate storage. If issuance fails, use [troubleshooting](#recovery) and continue only after it succeeds.

## 6. Verify the service

### HTTPS, Web and authentication

From a client with public internet access, replace the example domain and run these commands. Do not bypass certificate validation with `-k`:

```bash
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' https://kgos.example.com/api/v1/setup/status
curl --silent --show-error -D - -o /dev/null https://kgos.example.com/mcp
curl --fail --silent --show-error https://kgos.example.com/.well-known/oauth-authorization-server
curl --fail --silent --show-error https://kgos.example.com/.well-known/oauth-protected-resource/mcp
```

All of the following must hold:

- HTTPS has a trusted certificate; unauthenticated public `setup/status` returns **401** once a Token exists (it must not expose `ready`). Verify `ready` through the authenticated step 4 status check or by signing in to Web, and confirm MCP path `/mcp`.
- Anonymous `/mcp` returns **401**, with `WWW-Authenticate` pointing to the correct OAuth resource metadata. Rejection of anonymous access is expected.
- OAuth metadata `issuer`, authorization/token URLs and the resource address point to your chosen public root.
- Open `https://kgos.example.com` in a browser and log in with the saved administrator Token. Confirm the intended instance and readable existing versions and knowledge views. An empty knowledge base can pass; do not create business test data.

This verifies the service and public access. It does not prove a ChatGPT connection or an actual MCP tool call.

### Restart and persistence

Ensure no other client is writing. The following script uses only read calls for the current version and consistency. It saves only State identifiers, consistency and data/Token fingerprints, rather than complete State data or credentials. Compare records locally; do not publish them. The `umask 077` from step 1 restricts these files to your account. First create `acceptance.py`:

```python
import hashlib, json, pathlib, urllib.request
root = pathlib.Path('workspace/.kgos')
token = json.loads((root / 'auth.json').read_text())['token']
def call(path, body):
    request = urllib.request.Request('http://127.0.0.1:3777/api/v1/' + path,
        data=json.dumps(body).encode(), method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)
overview = call('evolution/overview', {})
state = call('evolution/get', {'state': overview['state']})
assert state['state'] == overview['state']
assert state['consistency']['status'] == 'valid'
assert state['consistency']['issues'] == []
data_hash = hashlib.sha256(json.dumps(state['data'], sort_keys=True,
    separators=(',', ':')).encode()).hexdigest()
print(json.dumps({'overview': overview, 'state': state['state'],
    'consistency': state['consistency'], 'hasData': state['hasData'],
    'stateDataFingerprint': data_hash,
    'credentialFingerprint': hashlib.sha256(token.encode()).hexdigest()}, sort_keys=True))
```

On the service host, save the pre-restart record:

```bash
sudo python3 acceptance.py > acceptance-before.json
```

**Restart only this guide's KG OS container** using the matching startup method:

Compose path:

```bash
docker compose -f compose.yaml restart kgos
```

Docker command path:

```bash
docker restart kgos
```

Run only the line matching your chosen method. Confirm `ready` through the authenticated status check from step 4, then run:

```bash
sudo python3 acceptance.py > acceptance-after.json
diff -u acceptance-before.json acceptance-after.json
```

Expect no difference: the default branch, immutable State, State data and administrator identity remain unchanged. Log in again with the original Token and read the original content. For a nonempty knowledge base, also check existing content in Web; an empty knowledge base does not need new knowledge for acceptance. Concurrent writes can legitimately change the record: rule those out rather than resetting data.

**Service completion requires** `ready`, a passed real Embedding test, correct HTTPS and authentication, and preserved identity/State/existing data after restart. If an item fails or cannot be observed, keep completed work and address that specific gap.

<a id="connect-chatgpt"></a>

## 7. Connect ChatGPT and verify

After service checks pass, use your chosen account or Workspace. First create a **basic MCP app**. ChatGPT displays it as a Plugin; it does not yet contain the seven official Skills. If a working app already targets the correct instance, reuse it and go directly to read-only checks.

### Add the basic MCP app

Follow the [official OpenAI connection flow](https://developers.openai.com/plugins/deploy/connect-chatgpt); labels follow the current interface for your account:

1. Open [ChatGPT Plugins](https://chatgpt.com/plugins) and confirm the account and Workspace.
2. Choose **＋ → Add custom MCP server**. Enter a recognizable name, such as “KG OS base connection”, and describe its purpose.
3. Under **Connection**, select a public endpoint and enter `https://your-domain/mcp`, including `/mcp`, not only the root or `/setup`.
4. Select **OAuth**. KG OS uses ChatGPT CIMD identity and PKCE, without a separately created OAuth client ID or client secret. If the screen requires them, do not enter the administrator Token; check the selected authentication method and platform capability first.
5. Review risks and permissions. Only if you accept, select **I understand and want to continue**, then **Create as a plugin**. Complete OAuth when prompted. Confirm the redirected domain is your own KG OS, sign in there with your administrator Token if required, and review/approve ChatGPT’s connection request.
6. Review the discovered tools and metadata and install the resulting basic Plugin. Start a new conversation, type **@**, and select it.

The current KG OS connection scope includes read and write access. Installation checks are read-only; later writes still require your authorization. Enter the administrator Token only on your own trusted KG OS Web page. Never put it into ChatGPT’s client secret, installation prompts or chat. Restarting the service invalidates its OAuth Access/Refresh Tokens. Reauthorize the **existing connection**; administrator identity and knowledge remain intact. Do not delete the app or initialize again.

### Verify in the target ChatGPT conversation

After selecting the basic Plugin, send this read-only request. Map the intended service to the connection you just created or reused; matching States alone do not prove two connections target the same physical instance:

```markdown
Please check only the KG OS app selected in this conversation. Do not write data.

1. Confirm its connection points to my intended public service and account.
2. Use kgos_docs to read guides/reading.md, guides/evolution.md and the current SDK signatures.
3. Call evolution.overview, resolve its immutable State, then call evolution.get for that State.
4. Require the same State, consistency.status="valid" and consistency.issues=[].
5. Call ontology.read at that same State and confirm a successful business result, not only a successful outer tool call.
   Report the app/connection, actual State, checks, failures and unknowns. An empty knowledge base can pass. Do not create models, knowledge, branches or commits.
```

**Continue only when** documentation and business reads succeed, the connection targets your selected service, and the same State has valid consistency and readable Ontology. A discovered tool list or a successful OAuth screen alone does not pass. An empty knowledge base can pass. For failure, use [recovery](#recovery), keep the existing app and proceed only after checks pass.

<a id="private-plugin"></a>

## 8. Create the private Plugin, configure guidance and check

Find and install **Plugin Creator** in [ChatGPT Plugins](https://chatgpt.com/plugins), or reuse it if already available. Enable it and the verified basic KG OS app in the installation conversation, using the available app selector or tool entry if the interface cannot select both at once. If Plugin Creator is unavailable, check account/Workspace permissions without changing the existing connection. Copy the request below and replace bracketed fields. Use `none` if you have no old private Plugin, or say unknown if uncertain. Include no credentials:

```markdown
Please follow the official KG OS private Plugin installation guide:
https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md

My verified ChatGPT KG OS app: [app name]
Public service: https://[my-domain]
Target ChatGPT account/Workspace: [target]
Existing private Plugin: [name/version, or none]
My needs and customizations to preserve: [describe]

Reuse this app and connection; do not deploy or initialize the service again.
Inspect the actual service, official release and any old Plugin/customizations. Present a specific plan for my confirmation, then create and install a new version-named private Plugin with all seven official Skills. Migrate my customizations without overwriting conflicts. Keep the old Plugin and shared connection until the new one passes checks; ask me to choose any cleanup not already authorized.
Provide the complete official global guidance and ChatGPT settings steps, then run installation checks. Do not request credentials in chat or repeat confirmations for already authorized steps.
```

AI then follows the single [INSTALL.md](https://kgos.sites.y2l.top/install/v0.3.5/INSTALL.md) to help you:

1. **Confirm a plan.** Check the service and matching official assets. For an old private Plugin, inspect its contents against the old official baseline and list customizations and conflicts. Before creation, also check the persistent instruction location’s capacity, existing content and scope. Report visibility limits instead of assuming another global location exists. You choose the target, migration, permissions, guidance storage and installation scope, then confirm the plan. Already authorized steps need no repeated confirmation.
2. **Create and install a new version.** Always create a new private Plugin named with the official version; add a revision number when recreating the same version. Reuse the basic app’s real connection and retain all seven official Skills and resources. Keep the old Plugin, and let you decide conflicts rather than overwriting it.
3. **Configure global guidance.** AI supplies the complete official Global AI Guidance. Open **Settings → Personalization → Custom instructions**, following [ChatGPT personalization guidance](https://help.openai.com/en/articles/8096356-chatgpt-custom-instructions). Review existing instructions and choose how to append, merge or replace conflicts before saving. Do not silently overwrite them. Reuse the plan’s capacity check. If space is insufficient, use only a verified available storage option with its actual scope, or resolve existing-content conflicts. If full storage is unavailable, report guidance as not configured; do not locally abridge the official text or label project-only instructions or a one-time paste as global loading.
4. **Check in a new conversation.** Install/enable the new Plugin, open a new conversation and select it with `@`. Pasting the guidance into that conversation is not proof that global settings took effect. Send:

```markdown
Use the installed kgos-doctor Skill for installation checks D1–D3 only: global guidance, the selected KG OS MCP connection/knowledge base, and the seven official Skills. Reuse current evidence where applicable. Report official resources, visible instruction differences, persistent configuration evidence and ordinary-task behavior separately, alongside connection/Skill installation, real calls, versions and resources. Whole-configuration invisibility must not hide a confirmed local difference; list unverified parts separately. An empty knowledge base is valid. Do not write knowledge, create branches/commits, schedule maintenance or uninstall anything.
```

The report should identify the service/app, private Plugin version, all seven official Skills and referenced resources, guidance saving/observable behavior, and customization migration. The seven Skills cover Ontology, Knowledge, Retrieval, Branch, Maintenance and VLog standards, plus Doctor. Their actual resources come from the selected release.

**Complete-install criteria:** real service and ChatGPT reads pass; the selected private Plugin is installed; all seven Skills and required resources are present and usable; complete guidance is saved; and relevant D1–D3 have no confirmed blocking omissions. Hidden host instruction provenance or automatic activation traces may remain unobservable rather than causing endless checks. Record “installed”, “usable” and “observed in use” separately. Knowledge quality, maintenance scheduling and writing business data are not installation requirements. If you explicitly choose the basic MCP app only, deliver that scope without claiming private Plugin installation.

After the new Plugin passes, you may choose to uninstall the old private Plugin. Keep any basic app or shared MCP connection still in use. If creation, installation or checks fail, preserve the old version and resume from the actual failed step.

## 9. Start using KG OS

Select the KG OS Plugin in a new conversation and ask for the task you need:

- “Show my knowledge-base entry points and branch descriptions, and explain what is available.”
- “Read the current Ontology and explain the existing models. Do not create models.”
- “I want to organize the following material in the knowledge base. First propose a plan using the existing models, and wait for my confirmation before writing.”

For an empty knowledge base, inspect its structure first, then authorize modeling and saving as needed. Installation does not create business models or test content. Upgrade the service and private Plugin separately as described next.

<a id="upgrade"></a>

## 10. Upgrade, back up and recover

### Select the target version

Choose a formal target version from [Releases](https://github.com/bYiyLi/kg-releases/releases). Open its complete guide using the version menu. Read compatibility, migration, downtime and recovery requirements from your current version to that target, and obtain its official image **Tag + digest** and Plugin assets. If KGHub has not registered the target yet, use its Release’s companion materials first; do not create a new-version Plugin using an old-version installation prompt. If there is no documented supported path, stop and ask the project; do not assume arbitrary cross-version compatibility or downgrade support.

These commands apply to this guide’s `~/kgos` directory, `kgos` container and single `workspace` layout. First confirm actual mounts, network, ports, credential sources and launch configuration. Customized instances must retain their original parameters and include external persistent paths, credentials and launch files in their backup. Do not replace customized deployments with default examples.

Record the current image, enter your chosen official full image reference, and pull it before downtime. The input must look like `ghcr.io/byiyli/kgos:vX.Y.Z@sha256:…`. Resolve any failure before stopping the service:

```bash
cd "$HOME/kgos"
umask 077
docker inspect --format '{{.Config.Image}}' kgos
read -r -p 'Target official image (version@sha256 digest): ' KGOS_TARGET_IMAGE
[[ "$KGOS_TARGET_IMAGE" =~ ^ghcr\.io/byiyli/kgos:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]] &&
  docker pull "$KGOS_TARGET_IMAGE"
```

In a new terminal, set and verify the target again; do not continue with an empty variable or floating tag. Caddy is not replaced during this KG OS service upgrade; retain its existing certificate volumes.

### Stop writes and create a complete backup

Pause writes from ChatGPT and other clients and wait for in-flight actions. First run `sudo python3 acceptance.py > acceptance-before-upgrade.json` to save the read-only baseline from step 6. Confirm enough storage for both the full backup and running data. **Do not edit the Compose image or configuration yet:** the backup must include recoverable old launch settings.

Compose path:

```bash
docker compose -f compose.yaml stop kgos
docker inspect --format '{{.State.Running}}' kgos
```

Docker command path:

```bash
docker stop kgos
docker inspect --format '{{.State.Running}}' kgos
```

Run only your original path; the final line must be `false`. If an external manager automatically restarts the app, stop it through that manager and confirm writes cannot resume. Then use the common backup step:

```bash
(
  set -eu
  umask 077
  test "$PWD" = "$HOME/kgos"
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  sudo test -d workspace/.kgos
  install -d -m 0700 "$HOME/kgos-backups"
  backup_dir=$(mktemp -d "$HOME/kgos-backups/pre-upgrade.XXXXXXXX")
  docker inspect kgos > "$backup_dir/container-inspect.private.json"
  docker inspect --format '{{.Config.Image}}' kgos > "$backup_dir/previous-image.txt"
  sudo tar --numeric-owner --acls --xattrs -cpf "$backup_dir/kgos.tar" -C "$HOME" kgos
  sudo chown "$(id -u):$(id -g)" "$backup_dir/kgos.tar"
  chmod 600 "$backup_dir/kgos.tar"
  (cd "$backup_dir" && sha256sum kgos.tar > kgos.tar.sha256 && sha256sum -c kgos.tar.sha256)
  printf '%s\n' "$backup_dir" > .last-upgrade-backup
  printf 'Backup saved: %s\n' "$backup_dir"
)
```

Expect `kgos.tar: OK` and a new private backup directory. The archive includes the entire installation directory: `.kgos` databases, authentication, full configuration, caches, environment files, Compose, Caddyfile and other existing files, preserving numeric UID/GID, modes, ACLs and extended attributes. Each backup uses a new location outside the installation directory without overwriting older backups. `container-inspect.private.json` may contain secrets: keep it private locally, never upload it or paste it into chat.

Caddy certificate volumes are outside this archive and remain unchanged. For a whole-host migration, separately back up certificate volumes and external resources through their own operations procedures. Never replace the image after a failed stop, backup or checksum. If the target was pulled but no replacement started, fix the backup problem and continue, or restart the original container to restore service.

### Replace the image using the original method

**Compose:** change only `kgos.image` in the original `compose.yaml` to the chosen, already-pulled full reference. Preserve all other configuration, the project directory and original mounts. Confirm the new value matches the target, then run:

```bash
(
  set -eu
  test -n "${KGOS_TARGET_IMAGE:-}"
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  backup_dir=$(cat .last-upgrade-backup)
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  docker compose -f compose.yaml config --quiet
  test "$(docker compose -f compose.yaml config --images)" = "$KGOS_TARGET_IMAGE"
  docker compose -f compose.yaml up -d --no-deps --force-recreate kgos
  docker inspect --format '{{.Config.Image}}' kgos
  docker logs --tail 80 kgos
)
```

**Docker commands:** the following retains the stopped old container under another name and creates a new one, reloading the same credential file without deleting `workspace`. Use it only for an original deployment matching this guide. Customized deployments must use their recorded original parameters, changing only the image:

```bash
(
  set -eu
  test -n "${KGOS_TARGET_IMAGE:-}"
  [[ "$KGOS_TARGET_IMAGE" =~ ^ghcr\.io/byiyli/kgos:v[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}$ ]]
  test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
  backup_dir=$(cat .last-upgrade-backup)
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  previous_container="kgos-before-upgrade-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
  docker rename kgos "$previous_container"
  printf '%s\n' "$previous_container" > .previous-container
  docker run -d \
    --name kgos \
    --platform linux/amd64 \
    --user 10001:10001 \
    --restart unless-stopped \
    --network kgos-net --network-alias kgos \
    -p 127.0.0.1:3777:3777 \
    --mount type=bind,src="$PWD/workspace",dst=/workspace \
    --env-file "$PWD/embedding.env" \
    "$KGOS_TARGET_IMAGE"
  docker inspect --format '{{.Config.Image}}' kgos
  docker logs --tail 80 kgos
)
```

If creation fails, the old container remains under the name recorded in `.previous-container`. Inspect actual state before recovery; do not repeat the whole block. Never run two KG OS containers against the same `workspace`, and never use `down -v`, delete volumes or run initialization.

### Verify the upgrade and upgrade the Plugin

Check logs and confirm `ready` through the authenticated status check from step 4, then run:

```bash
sudo python3 acceptance.py > acceptance-upgrade.json
diff -u acceptance-before-upgrade.json acceptance-upgrade.json
```

Verify the actual image matches the chosen Tag/digest. Repeat step 6 for HTTPS, the original administrator Token, existing content, State and identity. Evaluate metadata changes explicitly allowed by the target release against its notes; do not treat every difference as success or reset data because of it. Repeat step 4’s same-network real Embedding check. It supports both Web and configuration-file initialization without adding business data for acceptance. Diagnose model/credential issues through the original initialization path rather than initializing again.

A restart invalidates old OAuth Tokens. Reauthorize the existing ChatGPT connection and repeat step 7’s read-only checks. Refresh metadata if tools changed and check a new conversation. Once the service passes, switch to the **upgrade target version’s** KGHub manual and use its ChatGPT/private Plugin steps to inspect old customizations, confirm migration, and create/check a new version. The handoff prompt, `INSTALL.md`, seven Skills and Plugin resources must all match the target version. Do not keep copying this old manual’s version-pinned step 8 prompt. Then choose whether to uninstall the old version. Never replace the old Plugin in place or delete the shared connection.

<a id="upgrade-recovery"></a>

### Recover after a failed upgrade

First stop writes and the failed KG OS service. Preserve failure logs, container configuration, the complete failed directory and original backup. **Rolling back an image does not restore data.** The target may already have changed data or configuration; do not simply restart the old container and hope it works.

Choose either repair under the target release’s instructions or its supported full-backup recovery. To restore data, first extract a selected trusted backup into a new private directory for inspection. These commands do not overwrite the active instance:

```bash
(
  set -eu
  umask 077
  read -r -p 'Absolute path to the selected pre-upgrade backup: ' backup_dir
  test "${backup_dir#/}" != "$backup_dir"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  restore_dir=$(mktemp -d "$HOME/kgos-restore.XXXXXXXX")
  sudo tar --acls --xattrs --same-owner -xpf "$backup_dir/kgos.tar" -C "$restore_dir"
  sudo test -d "$restore_dir/kgos/workspace/.kgos"
  printf 'Restored privately for inspection: %s/kgos\n' "$restore_dir"
)
```

Inspect original configuration, environment and UID/GID in the extracted directory. Confirm the archive is the selected old version, data is complete, and the pre-upgrade image remains available. These restore commands apply only to this guide’s standard layout and a release-supported restoration of the complete old backup. Keep all containers sharing this `workspace` stopped. If the Docker listing fails, stop without switching directories; a failed query does not mean the container is absent. Customized layouts must follow their original launch contract. Enter the full extracted path printed above and the selected backup path. Before restoring, the commands compare the extracted contents against that archive, preventing accidental use of another backup of the same version. Resolve any failed check without repeating the entire block.

**Compose recovery** retains the original directory, project name, configuration, mounts and external network. It privately saves the failed container’s logs/configuration and keeps the complete failed installation directory under another name. Compose then replaces this guide’s failed container; the container object itself is not retained as evidence. Caddy and certificate volumes stay unchanged:

```bash
(
  set -eu
  umask 077
  cd "$HOME"
  read -r -p 'Selected restored directory (.../kgos-restore.XXXXXXXX/kgos): ' restored_path
  read -r -p 'Selected pre-upgrade backup directory: ' backup_dir
  [[ "$restored_path" == "$HOME"/kgos-restore.*/kgos ]]
  test "${backup_dir#/}" != "$backup_dir"
  sudo test -d "$restored_path/workspace/.kgos"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  sudo tar --acls --xattrs --compare --file "$backup_dir/kgos.tar" --directory "$(dirname "$restored_path")"
  previous_image=$(cat "$backup_dir/previous-image.txt")
  docker info >/dev/null
  test "$(docker compose -f "$restored_path/compose.yaml" config --images)" = "$previous_image"
  failed_dir=$(mktemp -d "$HOME/kgos-failed.XXXXXXXX")
  container_names=$(docker ps -a --format '{{.Names}}')
  if printf '%s\n' "$container_names" | grep -Fxq kgos; then
    docker stop kgos
    test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
    docker logs kgos > "$failed_dir/container.log.private" 2>&1
    docker inspect kgos > "$failed_dir/container-inspect.private.json"
  fi
  mv -T -- "$HOME/kgos" "$failed_dir/installation"
  test ! -e "$HOME/kgos"
  mv -T -- "$restored_path" "$HOME/kgos"
  cd "$HOME/kgos"
  docker compose -f compose.yaml config --quiet
  docker compose -f compose.yaml up -d --no-deps --force-recreate kgos
  printf 'Failed files retained: %s\n' "$failed_dir"
  docker logs --tail 80 kgos
)
```

**Docker command recovery** first reads the recorded pre-upgrade container name from the current installation and matches its image against the backup, retaining its original environment, mounts and other parameters. It renames/preserves the failed new container, keeps the failed directory separately, and restores the old container:

```bash
(
  set -eu
  umask 077
  cd "$HOME"
  read -r -p 'Selected restored directory (.../kgos-restore.XXXXXXXX/kgos): ' restored_path
  read -r -p 'Selected pre-upgrade backup directory: ' backup_dir
  [[ "$restored_path" == "$HOME"/kgos-restore.*/kgos ]]
  test "${backup_dir#/}" != "$backup_dir"
  sudo test -d "$restored_path/workspace/.kgos"
  (cd "$backup_dir" && sha256sum -c kgos.tar.sha256)
  sudo tar --acls --xattrs --compare --file "$backup_dir/kgos.tar" --directory "$(dirname "$restored_path")"
  previous_image=$(cat "$backup_dir/previous-image.txt")
  docker info >/dev/null
  previous_container=$(cat "$HOME/kgos/.previous-container")
  [[ "$previous_container" == kgos-before-upgrade-* ]]
  test "$(docker inspect --format '{{.Config.Image}}' "$previous_container")" = "$previous_image"
  docker stop "$previous_container"
  test "$(docker inspect --format '{{.State.Running}}' "$previous_container")" = false
  failed_dir=$(mktemp -d "$HOME/kgos-failed.XXXXXXXX")
  container_names=$(docker ps -a --format '{{.Names}}')
  if printf '%s\n' "$container_names" | grep -Fxq kgos; then
    docker stop kgos
    test "$(docker inspect --format '{{.State.Running}}' kgos)" = false
    docker logs kgos > "$failed_dir/container.log.private" 2>&1
    docker inspect kgos > "$failed_dir/container-inspect.private.json"
    failed_container="kgos-failed-$(date -u +%Y%m%dT%H%M%SZ)-$RANDOM"
    docker rename kgos "$failed_container"
    printf '%s\n' "$failed_container" > "$failed_dir/container-name.txt"
  fi
  mv -T -- "$HOME/kgos" "$failed_dir/installation"
  test ! -e "$HOME/kgos"
  mv -T -- "$restored_path" "$HOME/kgos"
  docker rename "$previous_container" kgos
  docker start kgos
  printf 'Failed files retained: %s\n' "$failed_dir"
  docker logs --tail 80 kgos
)
```

If `.previous-container` is missing, the old container is gone, or its parameters do not match the backup, do not guess a name or start it. Read the original image/parameters from the private backup and establish the restore procedure before recreating it. After an unknown directory-switch/start result, inspect original paths, retained files and containers first. Do not repeat a successful move, overwrite files or delete evidence.

Restoration discards changes since the backup and requires your explicit choice. After restoring, repeat steps 6 and 7 and reauthorize ChatGPT. Keep the old image, backups and failed files until you confirm normal operation and choose cleanup.

<a id="recovery"></a>

## 11. Troubleshooting and recovery

| Symptom                                                     | Check and next action                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `setup_required`                                            | With no complete configuration, use Web setup. For file initialization, check `workspace/.kgos/config.toml`. Creating a file while running does not hot-reload it; verify it and restart this container                                                                                                                                    |
| `initializing`                                              | Check `phase` and container logs and wait for the current operation. Do not resubmit or launch another daemon. If progress stops, locate the logged failure first                                                                                                                                                                          |
| `error`                                                     | Record the nonsecret public `message` and relevant logs. Check complete TOML, permissions, disk and model credentials. Preserve data, fix the cause and restart the original container. Once configuration is published, preserve it and `auth.json`, diagnose the cause and restart the same container; do not resubmit new configuration |
| Container exits or permission denied                        | Check that the mount is the newly created directory, UID/GID is `10001:10001`, directories are traversable and files have needed permissions. Do not recursively `chown` an unknown directory or set permissions to `777`                                                                                                                  |
| Name, directory, port or network conflict                   | Identify ownership and choose reuse or a complete new set of names. Do not automatically delete old resources. For a local SSH port `13777` conflict, choose another local port and update the browser address                                                                                                                             |
| Embedding failure                                           | Check container-reachable URL, model, actual dimensions, similarity, credential and quota. Web rejects loopback and special reserved targets. Do not post API Keys in logs or support messages                                                                                                                                             |
| Certificate failure or public access unavailable            | Check DNS A/AAAA, NAT, ports 80/443, security groups and Caddy logs. Fix networking and certificates instead of bypassing TLS or exposing an uninitialized service                                                                                                                                                                         |
| Incorrect OAuth address                                     | Check `[server].public_origin` in the instance file. Use the controlled configuration-editing steps below, restart and recheck metadata                                                                                                                                                                                                    |
| Restart requests initialization or changes content/identity | Stop further integration. Check for a wrong mount, different instance or missing files. Preserve the original directory and backups and restore the original mount. Do not regenerate credentials or delete the database                                                                                                                   |
| Custom MCP or Plugin Creator is unavailable in ChatGPT      | Check the selected account, Workspace and administrator policies. Choose to request access, use another permitted account, or stop at a working service; do not switch accounts automatically or report a complete installation                                                                                                            |
| ChatGPT OAuth fails or expires after a service restart      | Verify HTTPS, `public_origin` and metadata, then reauthorize the existing connection. Enter the administrator Token only on your KG OS page; do not delete the app or initialize again                                                                                                                                                     |
| No KG OS tools in ChatGPT                                   | Confirm the basic Plugin is installed and selected with `@` in a new conversation. Refresh the original connection metadata if needed. Check discovery, authorization and business reads separately                                                                                                                                        |
| New private Plugin creation or checks fail                  | Retain the old Plugin and shared connection. Inspect the actual creation result and failed checks before resuming; do not duplicate an unknown creation or uninstall the old version first                                                                                                                                                 |
| Upgrade fails                                               | Stop writes and the failed service, preserve its files and the stopped-service backup, then choose repair or [upgrade recovery](#upgrade-recovery); do not delete data to reinstall                                                                                                                                                        |

### Edit instance configuration safely

To correct saved configuration, edit the **actual mounted instance file**, rather than only the `~/kgos/config.toml` template. Back it up in the trusted service terminal, then use an elevated editor to change the necessary values:

```bash
sudo cp -p --backup=numbered workspace/.kgos/config.toml workspace/.kgos/config.toml.before-edit
sudoedit workspace/.kgos/config.toml
sudo chown 10001:10001 workspace/.kgos/config.toml
sudo chmod 600 workspace/.kgos/config.toml
```

Correct only confirmed mutable values such as `public_origin`, without recursively changing directories. Restart KG OS using the original method and recheck status, the model and OAuth; retain the existing Token and database. The initialized Embedding model, dimensions, similarity and full-text analyzer form the existing index contract. Do not replace them here; an applicable migration procedure is required.

**Update model credentials:** keep the model and authentication mode unchanged. For configuration-file initialization, edit `embedding.env` locally and recreate the original service container as described in step 4. For Web initialization using `KGOS_WEB_EMBEDDING_API_KEY`, stop KG OS using its original method, then run the following. Enter the new Key only at the hidden input prompt in your trusted terminal; the file must not contain quotes or a newline:

```bash
(
  set -eu
  sudo cp -p --backup=numbered workspace/.kgos/embedding-api-key workspace/.kgos/embedding-api-key.before-edit
  sudo python3 - <<'PY'
import getpass, os, pathlib
path = pathlib.Path('workspace/.kgos/embedding-api-key')
key = getpass.getpass('New Embedding API Key: ')
if not key or len(key.encode()) > 8192 or any(c in key for c in '\r\n\x00'):
    raise SystemExit('Invalid credential; original file retained.')
with path.open('w') as file:
    file.write(key)
    file.flush()
    os.fsync(file.fileno())
os.chown(path, 10001, 10001)
path.chmod(0o600)
PY
)
```

On any failure, preserve the backup and inspect the result before starting with an unverified file. On success, start the original container and repeat the same-network Embedding check; do not initialize again or change the administrator Token.

For support, provide the image version/digest, your two selected paths, public address, nonsecret status, errors and completed steps. Do not send Tokens, API Keys, `auth.json`, `embedding.env` or full environment output.
