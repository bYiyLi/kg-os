# KG OS 统一 MCP 与私人 Plugin 接入

<!-- cspell:words openclaw -->

KG OS 的当前目标是**一个 Go `kgosd` 进程、一个 HTTP listener**，同时提供内嵌 Web、现有 `/api/v1/*` 与 `/mcp`。服务端 JavaScript 使用 QuickJS-NG WASM / Go Kernel Bridge，不依赖运行时 Node.js MCP 服务，也不需要宿主安装 `kgosd`。正式合同见 [MCP](../design/mcp.md)、[Runtime](../design/runtime.md)、[D93](../design/decisions.md#d93-kgosd-unified-mcp)。

**当前状态**：Phase 16 为 `done`。Go 单进程 Linux amd64 镜像已在 OpenClaw 开发环境构建并部署、隔离 31/31 SDK Smoke 成功；现有 ChatGPT 私人连接已调用新版四 Tool，官方 Skill 已保存到私人 Plugin v1.0.1。**最终实现提交 `813bff4` 的 GitHub CI 8/8、真实 ChatGPT OAuth/隔离写入以及 Codex Skill 新会话加载均已通过；尚未正式发布 GHCR**。旧 `Dockerfile.mcp` / `packages/mcp` 的源码已移除，历史仅保留 Git 记录，不再是服务端部署入口。

## 1. 镜像与首次初始化

镜像目标名称为 `ghcr.io/byiyli/kgos:v<version>`，只有在对应版本确实发布且可拉取时才可使用。Linux amd64 开发构建在 **OpenClaw**（`ssh openclaw`）执行，**不要在 Mac 上运行 Docker**。GitHub Actions CI 会独立构建与测试。若从已取得的 Phase 16 源码构建：

```sh
docker build --platform linux/amd64 -f Dockerfile.unified -t kgos-unified:local .
docker volume create kgos-workspace
```

容器中的 Workspace Root 固定为 `/workspace`，Instance 目录为 `/workspace/.kgos`。第一次启动必须由用户**显式提供完整**的现有 `config.toml`；不要把示例配置自动用作生产配置。配置文件写入持久 Volume 的 `/workspace/.kgos/config.toml`，运行文件归容器 UID/GID **10001:10001**，敏感文件保持受保护的权限。仅用于隔离测试的配置结构示例：

```toml
[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

[fulltext]
analyzer = "unicode61"

[embedding]
base_url = "https://example.invalid/v1"
model = "replace-with-real-model"
dimensions = 1536
similarity = "cosine"
api_key_env = "OPENAI_API_KEY"
```

`example.invalid` 不是可用的 Embedding Provider。只在配置文件准备完成后执行：

```sh
docker run --rm --platform linux/amd64 \
  -v kgos-workspace:/workspace \
  kgos-unified:local init --root /workspace
```

`init` 是**同一 Go 二进制**的一次性入口：必须完成原生扩展、Knowledge Base bootstrap 和带 Instance Bearer 的 API readiness，成功后才写入 `.kgos/initialized.json`；再次执行会检查已完成的 Instance，不假装失败的初始化已经成功。重新创建容器时复用同一 Volume，以保留 `kgos.db`、`auth.json`、已提交的 State / Branch。

## 2. 启动、配置与认证

先在 Linux 宿主受保护的文件中保存独立 MCP 管理员凭证，例如 `/secure/path/mcp.env`（权限 `0600`），内容是 `KGOS_MCP_TOKEN=<高熵随机凭证>`。这与容器自己创建的 `.kgos/auth.json` **Instance Token** 是不同的秘密；不要把任何 Token 粘贴到聊天、URL 或公开文件。需要 ChatGPT 时可在相同受保护配置中加上 `KGOS_MCP_OAUTH_ISSUER=https://your-actual-domain.example`。

```sh
docker run -d --name kgos-unified --platform linux/amd64 \
  --env-file /secure/path/mcp.env \
  -v kgos-workspace:/workspace \
  -p 127.0.0.1:3777:3777 \
  kgos-unified:local
```

镜像默认执行 `kgosd --root /workspace --host 0.0.0.0 --port 3777`。用户可以覆盖 ENTRYPOINT 的命令参数，但必须显式指定 Root。例如 `docker run ... kgos-unified:local --root /workspace --host 0.0.0.0 --port 3777 --mcp-path /mcp`。`kgosd --help` 显示当前全部参数；常用选项：

| 类别 | CLI | 环境变量 |
| --- | --- | --- |
| 统一监听 | `--host`, `--port` | `KGOSD_HOST`, `KGOSD_PORT` |
| TLS | `--tls-cert`, `--tls-key`（须成对） | `KGOSD_TLS_CERT`, `KGOSD_TLS_KEY` |
| MCP 路径 | `--mcp-path` | `KGOS_MCP_PATH` |
| 管理员凭证来源 | `--mcp-token-env`（环境变量**名称**）、`--mcp-token-file` | `KGOS_MCP_TOKEN_ENV`, `KGOS_MCP_TOKEN_FILE` |
| OAuth | `--mcp-oauth-issuer` | `KGOS_MCP_OAUTH_ISSUER` |

请求超时、并发、大小、Sandbox 时间/内存/调用量/流数量及 Preview 缓存预算的完整参数见 [MCP 运行配置](../design/mcp.md#部署交付与运行合同)。MCP Token 未配置时，`kgosd` 仍可提供 Web/API，但不会开放 MCP 工具；错误 Token、路径冲突或无效 OAuth 配置必须拒绝。服务本身不创建公网 URL、Tunnel、用户账户或外部身份系统。

同一个监听端口不代表三个入口有相同认证：`/api/v1/*` 只接受 Instance Bearer，`/mcp` 接受独立 MCP 静态 Bearer 或已启用的 OAuth Access Token，内嵌 Web 不因此获得绕过 API 认证的权限。

本地验证：

```sh
curl -i http://127.0.0.1:3777/
curl -i http://127.0.0.1:3777/mcp
curl -i http://127.0.0.1:3777/api/v1/evolution/overview
```

未授权 MCP/API 请求必须被拒绝；真正的 MCP 工具发现和业务读写通过受认证的标准 Streamable HTTP 客户端进行。上述回环端口映射只用于 Linux Docker 宿主本机；远程连接需用户配置实际可信 HTTPS / Tunnel / 代理，保留原始 Path、HTTP Method 与 Authorization Header，**不可通过明文公网传输凭证**。

## 3. MCP Tool 和 JavaScript

MCP 只暴露以下四个 Tool：

| Tool | 输入与用途 |
| --- | --- |
| `kgos_preview` | `offset?`、`limit?`（默认 300、允许 100–500）、`viewRevision?`；读取全部分支与完整 pinned Ontology 的稳定 Markdown 行窗口 |
| `state_ancestry` | `root`、`limit?`（默认 20、允许 1–1000）、`cursor?`；读取 Commit DAG 和完整原始 Message |
| `kgos_read` | `code`；仅允许 15 个 SDK 只读方法 |
| `kgos_run` | `code`；允许 15 Read + 16 Write SDK 方法 |

在 `kgos_read` / `kgos_run` 的 `code` 中编写 **async JavaScript 函数体**，直接使用 `ontology`、`object`、`graph`、`evolution` 四个无前缀命名空间，无需创建 SDK Client 或 HTTP 连接；必须显式 `return` JSON-compatible 值：

```js
const { state } = await evolution.overview();
const [model, graphData] = await Promise.all([
  ontology.read({ at: state }),
  graph.query({ at: state, cypher: "MATCH (n) RETURN n LIMIT 10" })
]);
return { state, model, graphData };
```

支持 `async/await`、真正并发的 `Promise.all` 和逐条 `for await...of` Graph Stream；受控 Guest 不提供 Node.js、文件、网络、环境变量或任意宿主方法。脚本中的多次写入**不组成一个事务**：如果后续调用失败、超时或断线，之前的 State、Branch、Tag、Merge 变更可能已生效，先读回真实状态再决定是否继续，**不要盲目重试**。

Preview 的 `viewRevision` 属于进程内有界缓存；过期后返回 `VIEW_EXPIRED`，重新从 `offset=0` 获取新视图。索引中的 Offset/Lines 是整个 Markdown 文档的**绝对行号**，不是本页相对行号。详细 AI 使用方法见 [官方 KG OS Skill](../../plugins/kgos/skills/kgos/SKILL.md)。

## 4. ChatGPT OAuth 与私人 Plugin

用户自行准备可从 ChatGPT 访问的 HTTPS 入口，例如 `https://kgos.example.com/mcp`，将 `KGOS_MCP_OAUTH_ISSUER` 设置为确切的 `https://kgos.example.com`，而**不是**完整的 `/mcp` URL。代理须原样转发 `/mcp`、`/.well-known/oauth-protected-resource`、`/.well-known/oauth-protected-resource/mcp`、`/.well-known/oauth-authorization-server`、`/oauth/authorize`、`/oauth/token`。

ChatGPT 连接使用受限 CIMD 客户端与 OAuth Authorization Code + PKCE S256；管理员只在 KG OS 的可信授权网页输入 MCP 管理员 Token，ChatGPT 持有临时 OAuth Token 而不接触管理员凭证。授权 Ticket 5 分钟有效，重启后需重新授权；不要为了调试而关闭认证。

官方 [私人 Plugin AI 安装手册](../../plugins/kgos/INSTALL.md)说明 ChatGPT 连接、四 Tool 验证和私人 Plugin 安装。**旧 Phase 15 的实际 OAuth 成功不能代表新 Go MCP 已通过真实 ChatGPT 验收**。官方模板不携带用户 Token、Root 或动态 Connection ID。

## 5. 开发验收与正式发布

Mac 负责源码、Go/TypeScript 测试和 `pnpm validate`；**Docker 开发测试只在 OpenClaw Linux amd64 执行**，普通 GitHub Actions CI 会在 Linux runner 独立构建并测试；正式 Release CI 在获独立授权后构建、验证并推送精确版本的 GHCR 镜像。完整隔离 Docker Smoke：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:docker:unified
```

该命令**只在 OpenClaw/CI Linux 主机运行**，临时创建并清理隔离测试镜像与 Volume；验证非 root / 无 Node、初始化、Web/API/MCP、四 Tool、31/31 方法以及重启持久化。不要对长期 Dev Instance 执行写入测试。实际环境运行见 [OpenClaw Dev Runbook](dev-environment.md)，完成证据归 [Phase 16](../development/phases/16-kgosd-unified-mcp.md)。CI、测试脚本和本指南存在不代表当前镜像已经正式发布。
