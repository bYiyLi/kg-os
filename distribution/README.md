# KG OS

**Give your AI a knowledge graph it can query, update, and revisit.**

English · [简体中文](README.zh-CN.md)

KG OS is programmable knowledge graph infrastructure for AI. Define the information and relationships that matter to your work, connect your AI through MCP, and keep a history of how that knowledge changes. You choose where to run it and which models to use; KG OS works with your Agent rather than replacing it.

[Product website](https://kghub.y2l.top/en/) · [Releases](https://github.com/bYiyLi/kg-releases/releases) · [Get help](https://github.com/bYiyLi/kg-releases/issues)

## What you can do

| Your goal | How KG OS helps |
| --- | --- |
| Organize knowledge around your work | Define your own entities, relationships, properties, and constraints instead of fitting a fixed business template. |
| Find answers and their context | Combine graph queries, full-text search, and semantic retrieval to explore information and its connections. |
| Understand what changed | Track models and data together, compare versions, and manage changes with branches and merges. |
| Use knowledge with your AI | Connect a compatible MCP client. Official Skills guide modeling, knowledge creation, retrieval, versioning, maintenance, activity records, and diagnosis. |

For example, a project knowledge graph can connect a technical decision to the components it affects and the evidence behind it. Ask your AI to inspect those relationships before proposing a change.

## Install with your AI Agent

Copy this prompt into ChatGPT to plan the installation and get help with each step:

```text
Help me install KG OS using its official installation guide:
https://raw.githubusercontent.com/bYiyLi/kg-releases/main/INSTALL.md

Read the guide first, check my existing setup and available published releases, then complete and verify the authorized installation steps. Reuse working connections and preserve existing data. Tell me which login or approval actions require my participation. Do not ask me to paste credentials into the conversation.
```

Following [INSTALL.md](INSTALL.md), the Agent first checks existing resources and permissions without changing them, then explains feasible installation plans and who will perform each step. You choose a plan and explicitly authorize its actions before installation begins. The complete ChatGPT setup includes a ready KG OS service, an MCP connection, your private Plugin, seven official Skills, and the full Global AI Guidance v1. Working resources are reused; you can explicitly choose an MCP-only setup.

### Before you begin

You need an existing KG OS instance or a **Linux amd64 host with Docker** for a new installation. The Agent checks persistent storage, your chosen embedding service, a trusted public HTTPS endpoint, and the capabilities and permissions of your target ChatGPT account and workspace. If the Agent cannot operate the host, it can guide your manual steps where feasible. Missing ChatGPT features or account permissions must be resolved separately. Login and consent happen in the trusted interface indicated by the Agent.

Use a version listed in **Releases** with an available runtime image and matching Plugin resources. Files on `main` may be ahead of a released version. If no suitable release is available, the Agent should explain what is missing rather than attempt an installation with a placeholder version.

Keep administrator tokens, API keys, and other credentials out of chat and public issues. Complete sensitive login or approval steps in the trusted interface indicated by the Agent.

## After installation

Ask your AI: “Read my KG OS knowledge model and version overview, then explain what is available. Do not change any data.” The Agent verifies the actual connection and reports each component with evidence. The agreed installation scope is complete only when all required checks pass; partial results, pending actions, and unknowns remain explicit, with a point from which to resume.

Use the Web address of **your installed instance** for setup and connection authorization. The product website introduces KG OS; it is not your knowledge workspace. The [official Skills](plugins/kgos/skills/) help your AI work with your knowledge, and `kgos-doctor` provides on-demand, read-only checks when something is not working.

## Get help

Ask your Agent to diagnose the problem without changing data. If it remains unresolved, open an [issue](https://github.com/bYiyLi/kg-releases/issues) with the KG OS version, client, host platform, failed step, and a redacted error message. Do not attach credentials, private connection configuration, or knowledge-base data.

## License

See [LICENSE](LICENSE) for the applicable AGPL-3.0-only terms and [Commercial licensing](COMMERCIAL-LICENSE.md#english) for information about a separate commercial agreement. Keep any license notices included with the resources you use.
