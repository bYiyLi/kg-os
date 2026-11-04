# KG OS 统一 MCP 与私人 Plugin 接入

<!-- cspell:words openclaw -->

KG OS 的当前目标是**一个 Go `kgosd` 进程、一个 HTTP listener**，同时提供内嵌 Web、现有 `/api/v1/*` 与 `/mcp`。服务端 JavaScript 使用 QuickJS-NG WASM / Go Kernel Bridge，不依赖运行时 Node.js MCP 服务，也不需要宿主安装 `kgosd`。正式合同见 [MCP](../design/mcp.md)、[Runtime](../design/runtime.md)、[D93](../design/decisions.md#d93-kgosd-unified-mcp)。

**发行说明**：按 [D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution)，当前 Docker-only 交付覆盖整个 KG OS 的 Web/API/MCP，不再为后续版本发布独立 npm CLI/SDK/多平台 Native Runtime；下文历史 Dev 认证与 OAuth 验收不等于正式 GHCR 镜像已发布。

**当前能力**：统一 Go `kgosd` 已实现 Web/API/MCP 同源服务；[Phase 23](../development/phases/23-mcp-tool-taxonomy-and-docs.md) 确认五个 AI-facing Tool、独立 `kgos_docs` 与 31 个 SDK 方法，旧四 Tool/独立 Node MCP 只属于历史版本。实际 Docker / Plugin 发布与 Dev 部署状态分别以 [开发计划](../development/README.md)及 [OpenClaw Dev](dev-environment.md) 的最新验证为准。

## 1. 安装与初始化入口

**唯一完整 AI 安装手册**位于 [KG OS INSTALL.md](../../plugins/kgos/INSTALL.md)，并由私有仓库自动生成到公开 [kg-releases/INSTALL.md](https://github.com/bYiyLi/kg-releases/blob/main/INSTALL.md)。安装 Docker、MCP OAuth、私人 Plugin、随版本发布的官方 Skill 与首次初始化，以对应版本的手册和实际已发布镜像能力为准（v0.3.5 为七 Skill；待发布源码的当前目标为四 Skill）。这里不再维护另一套历史 Docker 命令、静态测试 TOML 或手工首次启动流程。

历史版本需要先提供已有完整 `config.toml`、运行 `kgosd init`；支持 Web-first Setup 的镜像按其实际初始化流程处理。**Phase 26 Web-first Setup 仍在独立验收**，不能由设计草案推断任意旧镜像已经支持无配置自动初始化。不能从测试示例复制凭证、Provider 或持久化路径到真实 Instance。

## 2. 统一服务和认证边界

正式目标为单个 `kgosd` HTTP listener，承载 Web、`/api/v1/*` 与 `/mcp`。Instance 级认证、OAuth 入口及 `[server].public_origin` 配置的精确定义由 [Runtime](../design/runtime.md)和 [MCP 设计](../design/mcp.md)维护；历史独立 MCP Token、Node Worker 及其启动方式已经退役。

`/api/v1/*` 使用受授权的 Instance / Web 会话身份，ChatGPT 的 MCP 访问通过 OAuth 授权，不向其交付管理员 Token。部署时须通过可信 HTTPS / Tunnel 提供正确同源 OAuth/Web 路由，不能将受保护的本地 HTTP 或未完成的首次配置暴露到不可信公网。实际安装、版本、只读验收及异常恢复均依上方唯一安装手册，不通过本指南绕开授权或重复初始化。

## 3. MCP Tool 和 JavaScript

MCP 提供五个 **AI-facing Tool**；另有一个用于 ChatGPT 工作区入口的 app-only `kgos_workspace`，因此标准 MCP `tools/list` 返回六项。

| Tool | 输入与用途 |
| --- | --- |
| `kgos_docs` | `paths?: string[]`：无参数或空数组返回任务总目录；最多 32 个精确虚拟 Markdown 路径，按顺序完整读取 |
| `kgos_ontology_overview` | `offset?`、`limit?`（默认 300、允许 100–500）、`viewRevision?`：全部 Branch 的 pinned Ontology 行窗口 |
| `kgos_commit_ancestry` | `root`、`limit?`（默认 20、允许 1–1000）、`cursor?`：Commit DAG 与原始 Message |
| `kgos_query` | `code`：15 个 SDK 只读方法；不只是 Cypher 查询 |
| `kgos_mutate` | `code`：15 Read + 16 Write SDK 方法，只在授权后执行修改 |

### 首次连接：直接批量阅读文档

文档由独立 Go Handler `kgos_docs` 提供，无须安装 Skill、执行 JavaScript、联网或创建 HTTP SDK Client。向 **`kgos_docs`** 提交空参数即可获取任务导航总目录：

```json
{}
```

也可传 `{"paths":[]}`；两者都返回一份 `index.md`，结构始终为 `{"documents":[{"path":"index.md","content":"..."}]}`。按任务一次阅读多篇文档，例如从空 Ontology 建模：

```json
{"paths":["guides/ontology.md","guides/objects.md","sdk/ontology/patch.md","sdk/types/PatchRequest.md"]}
```

Graph 查询与 Cypher 25：

```json
{"paths":["guides/graph.md","cypher/index.md","sdk/graph/query.md"]}
```

`index.md` 和 `guides/index.md` 提供更多任务→路径数组。每篇 Markdown 完整返回；只允许构建期内嵌的确切路径，禁止任意主机文件或网络访问；最多 32 个互不重复的路径，整个序列化 JSON 最多 4 MiB，超限为 `RESOURCE_ERROR`，应按目录拆分批次。不返回截断或部分成功的文档。

### 使用 SDK JavaScript

在 `kgos_query` / `kgos_mutate` 的 `code` 中编写 **async JavaScript 函数体**，直接使用 `ontology`、`object`、`graph`、`evolution` 四个无前缀命名空间，无需创建 SDK Client 或 HTTP 连接，必须显式 `return` JSON-compatible 值。阅读文档不会授予写入权限；**Sandbox 不再提供 `docs.read` 全局方法**。实际 Branch、State/Revision 需从授权 Instance 读取，不得执行尚未替换占位符的修改示例。

```js
const { state } = await evolution.overview();
const [model, graphData] = await Promise.all([
  ontology.read({ at: state }),
  graph.query({ at: state, cypher: "MATCH (n) RETURN n LIMIT 10" })
]);
return { state, model, graphData };
```

支持 `async/await`、真正并发的 `Promise.all` 和逐条 `for await...of` Graph Stream；受控 Guest 不提供 Node.js、文件、网络、环境变量或任意宿主方法。脚本中的多次写入**不组成一个事务**：如果后续调用失败、超时或断线，之前的 State、Branch、Tag、Merge 变更可能已生效，先读回真实状态再决定是否继续，**不要盲目重试**。

Ontology 预览的 `viewRevision` 属于进程内有界缓存；过期后返回 `VIEW_EXPIRED`，重新从 `offset=0` 获取新视图。索引中的 Offset/Lines 是整个 Markdown 文档的**绝对行号**，不是本页相对行号。详细 AI 操作方法以 [MCP 任务指南](mcp-guides/index.md)、[状态读取](mcp-guides/reading.md)、[错误恢复](mcp-guides/errors.md) 和当前连接的 `kgos_docs` 为准，不再依赖历史通用 Skill。

## 4. ChatGPT OAuth 与私人 Plugin

用户自行准备可从 ChatGPT 访问的 HTTPS 入口，例如 `https://kgos.example.com/mcp`，在 `.kgos/config.toml` 中配置 `[server].public_origin = "https://kgos.example.com"`，随后重启 KG OS，而**不是**完整的 `/mcp` URL。代理必须同时公开同源 Web `/` 与静态资源、Web 登录 API、`/mcp`、`/.well-known/oauth-protected-resource`、`/.well-known/oauth-protected-resource/mcp`、`/.well-known/oauth-authorization-server`、`/oauth/authorize`、`/oauth/request`、`/oauth/decision`、`/oauth/token`、`/oauth/revoke`。

ChatGPT 连接使用受限 CIMD 客户端与 OAuth Authorization Code + PKCE S256。Go 校验后将浏览器跳转到**现有 KG OS Web**；已登录直接显示连接授权弹窗，未登录先执行 Web 原有登录，随后明确允许或拒绝。OAuth Code/Access/Refresh 由 Go 管理，对用户透明。Web 登录沿用已有持久 Session。待授权请求 5 分钟有效；已批准 OAuth 授权保存于独立认证库，普通重启保留。新签发 Access Token 硬有效期为 24 小时，向客户端报告 `expires_in=86340`（23 小时 59 分钟）以提前刷新；已签发 Token 保留原到期时间。Refresh 每次成功使用滚动续期 30 天；连续 30 天未刷新、撤销或根凭证变更才需重新授权。首次升级旧内存版本需重新连接一次；签名刷新响应丢失且立即重启仍可能需重连，不能绕过认证。

在 macOS/Linux 上，OAuth 存储要求实例 `.kgos` 目录权限为 `0700`，`mcp-oauth.db` 文件为 `0600`。手工预建目录后应核对权限；权限不符合、存储损坏或不可用时 OAuth 返回 503，根 Bearer MCP、API 和 Web 仍保持各自能力。由实例所有者修复目录/文件权限后重启恢复；不要删除认证库来处理此错误。

官方 [私人 Plugin AI 安装手册](../../plugins/kgos/INSTALL.md)说明 ChatGPT 连接、五个 AI-facing Tool 验证和私人 Plugin 安装。**旧 Phase 15 的实际 OAuth 成功不能代表新 Go MCP 已通过真实 ChatGPT 验收**。官方模板不携带用户 Token、Root 或动态 Connection ID。

## 5. 开发验收与正式发布

Mac 负责源码、Go/TypeScript 测试和 `pnpm validate`；**Docker 开发测试只在 OpenClaw Linux amd64 执行**，私有 `kg-os` 只同步分发内容，公开 `kg-releases` 的 GitHub Actions 才运行 Linux 源码 Validate 和 Docker 隔离 Smoke；正式 Release 经另行授权及许可门禁后才发布 GHCR 镜像。完整隔离 Docker Smoke：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm test:docker:unified
```

该命令**只在 OpenClaw/CI Linux 主机运行**，临时创建并清理隔离测试镜像与 Volume；验证非 root / 无 Node、初始化、Web/API/MCP、五个 AI-facing Tool 与 workspace、31/31 方法、数据重启持久化及 OAuth 重启续用、刷新和撤销。不要对长期 Dev Instance 执行写入测试。实际环境运行见 [OpenClaw Dev Runbook](dev-environment.md)，当前健壮性证据归 [Phase 34](../development/phases/34-mcp-resilience.md)，历史基线归 [Phase 16](../development/phases/16-kgosd-unified-mcp.md)。CI、测试脚本和本指南存在不代表当前镜像已经正式发布。
