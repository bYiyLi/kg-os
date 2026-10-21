# KG OS

**AI-first programmable knowledge graph infrastructure.** KG OS provides a graph-based external knowledge world that an authorized AI can query and update through MCP; humans inspect and manage it through the built-in Web interface. Knowledge models are defined by the caller, not hard-coded into the Kernel.

This is the **official public distribution repository**. The private `bYiyLi/kg-os` repository is the **only** place where the product, Plugin, seven Skills, installer and CI/CD templates are developed. Every file here is generated from that source; **do not edit this repository directly**.

## Get KG OS

Start with **[INSTALL.md](INSTALL.md)**, the **single installation guide** for the runtime, ChatGPT/other supported MCP clients, the Plugin, seven Skills, and optional global AI guidance. You do not need private source access.

- **Docker runtime**: `ghcr.io/byiyli/kgos:v<version>` (Linux amd64), providing Web, HTTP API and MCP in one process. Only use image tags that are actually [published in Releases](https://github.com/bYiyLi/kg-releases/releases) and anonymously pullable from GHCR.
- **Plugin**: [`plugins/kgos/plugin.json`](plugins/kgos/plugin.json) and [connection template](plugins/kgos/.app.json.example). User-specific `.app.json` is created privately during installation and is never published.
- **Seven Skills**: [`plugins/kgos/skills/`](plugins/kgos/skills/) contains `kgos-doctor`, `kgos-ontology-standards`, `kgos-knowledge-standards`, `kgos-retrieval-standards`, `kgos-branch-standards`, `kgos-maintenance-standards`, and `kgos-vlog-standards`. Each Skill includes its full references and assets; the legacy generic `kgos` Skill is **not distributed**.

To retrieve this repository for installation:

```sh
git clone https://github.com/bYiyLi/kg-releases.git
cd kg-releases
```

Choose an actual published `vX.Y.Z` tag for a version-pinned installation. The `main` branch may contain candidate material awaiting final runtime/Plugin acceptance; mere presence of files does **not** prove an official release or successful client activation.

## Versioned delivery and CI/CD

Every private `kg-os/main` push synchronizes only allowlisted, non-secret public distribution files and a `source.json` reference to the exact private commit. Public GitHub Actions then execute source validation and an isolated Linux amd64 Docker smoke test. A separately authorized private `v*` tag generates a corresponding public tag, triggers full CI, and—only when the binary distribution-rights gate is enabled—publishes the tested image and Plugin archive with the public GitHub Release.

Private application source, history, authentication credentials, local connection IDs, test reports and caches are not included. Maintainer-only setup and responsibilities are documented in [MAINTAINING.md](MAINTAINING.md).

## Licensing and feedback

The exported Plugin/Skill resources carry KG OS's [AGPL-3.0-only license](LICENSE), subject to any per-file exceptions; separate commercial terms require an individual agreement as described in [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md). A public Docker image is **not** published until its applicable distribution rights are confirmed.

Use this repository's Issues for installation and distribution problems.
