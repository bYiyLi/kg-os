# KG OS

**Give your AI a knowledge graph it can query, update, and revisit.**

English · [简体中文](README.zh-CN.md)

KG OS is programmable knowledge graph infrastructure for AI. Define the information and relationships that matter to your work, connect your AI through MCP, and keep a history of how that knowledge changes. You choose where to run it and which models to use; KG OS works with your Agent rather than replacing it.

[Product website](https://kgos.sites.y2l.top/en/) · [Releases](https://github.com/bYiyLi/kg-releases/releases) · [Get help](https://github.com/bYiyLi/kg-releases/issues)

## What you can do

| Your goal | How KG OS helps |
| --- | --- |
| Organize knowledge around your work | Define your own entities, relationships, properties, and constraints instead of fitting a fixed business template. |
| Find answers and their context | Combine graph queries, full-text search, and semantic retrieval to explore information and its connections. |
| Understand what changed | Track models and data together, compare versions, and manage changes with branches and merges. |
| Use knowledge with your AI | Connect a compatible MCP client. Official Skills guide modeling, knowledge creation, retrieval, versioning, maintenance, activity records, and diagnosis. |

For example, a project knowledge graph can connect a technical decision to the components it affects and the evidence behind it. Ask your AI to inspect those relationships before proposing a change.

## Install KG OS

Follow the [installation guide](https://kgos.sites.y2l.top/en/install/) through **service deployment → initialization → public HTTPS → ChatGPT connection → private Plugin installation → verification and first use**. **Docker Compose + Web initialization** is recommended; Docker commands and configuration-file initialization are also supported. Reuse existing services and connections. The [Markdown download](https://kgos.sites.y2l.top/en/install.md) and web page use the same source.

The guide helps you create or reuse a basic MCP app in ChatGPT and verify real calls, then provides a prompt for the AI installation steps. Use the **INSTALL.md linked from your selected manual version** ([v0.3.3 AI guide](https://kgos.sites.y2l.top/install/v0.3.3/INSTALL.md)). It guides AI to read the matching release, identify customizations in your old Plugin, and create a new versioned private Plugin after you confirm the plan. It covers the seven official Skills, Global AI Guidance v1, and installation checks. Once the new Plugin passes verification, you choose whether to uninstall the old version; shared apps and MCP connections remain available.

The complete setup includes a ready service, a ChatGPT app, your private Plugin, seven official Skills, and global guidance. If you only need basic MCP, you can start using KG OS after the connection checks pass.

### Before you begin

Use an existing service, or choose a **Linux amd64 Docker host**, persistent storage, and a working embedding service and model. ChatGPT also needs trusted public HTTPS and the necessary account/workspace capabilities and permissions. You choose the host, model, costs, and permissions, and run the service installation steps manually.

KGHub keeps a complete manual for each release. The [latest guide](https://kgos.sites.y2l.top/en/install/) opens the stable version; use its version menu to read historical manuals, including [v0.3.0](https://kgos.sites.y2l.top/en/install/v0.3.0/). Language switching keeps the selected version. Each manual links its matching INSTALL.md and [official Plugin archive](https://github.com/bYiyLi/kg-releases/releases/tag/v0.3.3); commands pin the applicable version and image digest. The v0.3.0 KGHub manual supplements that release while retaining the original Tag and ZIP. Release assets remain available in [Releases](https://github.com/bYiyLi/kg-releases/releases).

Use administrator tokens and API keys only in a trusted terminal or your instance interface. Keep credentials out of chat and public issues.

### Upgrade an existing installation

Follow the [upgrade and recovery steps](https://kgos.sites.y2l.top/en/install/#upgrade): check compatibility, stop the service and make a complete backup, then replace the image using the original directories and configuration. Recheck the service and ChatGPT calls. Upgrade the service and private Plugin separately, without reinitializing data or automatically replacing the old Plugin. Rolling back an image does not restore data.

## After installation

Ask your AI: “Read my KG OS knowledge model and version overview, then explain what is available. Do not change any data.” The Agent verifies the actual connection and reports each component with evidence. The agreed installation scope is complete only when all required checks pass; partial results, pending actions, and unknowns remain explicit, with a point from which to resume.

Use the Web address of **your installed instance** for setup and connection authorization. The product website introduces KG OS; it is not your knowledge workspace. The [official Skills](plugins/kgos/skills/) help your AI work with your knowledge, and `kgos-doctor` provides on-demand, read-only checks when something is not working.

## Get help

Ask your Agent to diagnose the problem without changing data. If it remains unresolved, open an [issue](https://github.com/bYiyLi/kg-releases/issues) with the KG OS version, client, host platform, failed step, and a redacted error message. Do not attach credentials, private connection configuration, or knowledge-base data.

## License

See [LICENSE](LICENSE) for the applicable AGPL-3.0-only terms and [Commercial licensing](COMMERCIAL-LICENSE.md#english) for information about a separate commercial agreement. Keep any license notices included with the resources you use.
