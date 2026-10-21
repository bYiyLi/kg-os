# Install KG OS with Docker

KG OS is distributed as a **Linux amd64** container. You need Docker with Linux amd64 support. A version tag is usable only after the public GitHub Release and GHCR package are available.

## 1. Select a published version

Replace `vX.Y.Z` below with a tag listed on this repository's [Releases](../../releases) page:

```sh
export KGOS_IMAGE=ghcr.io/byiyli/kgos:vX.Y.Z
docker pull --platform linux/amd64 "$KGOS_IMAGE"
docker volume create kgos-workspace
```

The named volume stores your instance under `/workspace/.kgos`. Reuse it on every subsequent container start; never remove it while the data is needed.

## 2. Configure the first instance

Create a local `config.toml` with your **actual** settings. This is a configuration *shape*, not a working Embedding provider:

```toml
[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

[fulltext]
analyzer = "unicode61"

[embedding]
base_url = "https://your-provider.example/v1"
model = "your-real-model"
dimensions = 1536
similarity = "cosine"
api_key_env = "OPENAI_API_KEY"
```

Replace the provider URL, model, dimensions and other values with real compatible settings. Do **not** embed a provider key in this file.

For images that require configuration before initialization, copy the local config into the Docker volume using a one-off, temporary container:

```sh
docker run --rm --platform linux/amd64 --user 0 \
  --entrypoint /bin/sh \
  -v kgos-workspace:/workspace \
  -v "$PWD/config.toml:/tmp/config.toml:ro" \
  "$KGOS_IMAGE" -c '
    set -eu
    mkdir -p /workspace/.kgos
    cp /tmp/config.toml /workspace/.kgos/config.toml
    chown -R 10001:10001 /workspace
    chmod 700 /workspace/.kgos
    chmod 600 /workspace/.kgos/config.toml
  '
```

Then initialize:

```sh
docker run --rm --platform linux/amd64 \
  -v kgos-workspace:/workspace \
  "$KGOS_IMAGE" init --root /workspace
```

If the selected version instead provides a Web-first setup flow, follow that version's first-run UI and do not separately initialize an already initialized instance.

## 3. Run

Create a local `kgos.env` file and restrict it with `chmod 600 kgos.env` before running the command below. Add `OPENAI_API_KEY=your-real-key` if the configured provider needs it, or leave the file empty otherwise. Never commit or expose credentials.

```sh
docker run -d --name kgos --restart unless-stopped \
  --platform linux/amd64 \
  -v kgos-workspace:/workspace \
  -p 127.0.0.1:3777:3777 \
  --env-file "$PWD/kgos.env" \
  "$KGOS_IMAGE"
```

Open `http://127.0.0.1:3777/`. The single service also hosts the authenticated API and `/mcp` endpoint.

Use a trusted HTTPS reverse proxy for remote access. Do not expose the administrator token or publish the instance directly to an untrusted network. For upgrades, stop the container, pull the new **published** image, and recreate it with the same volume; back up the volume before upgrading.
