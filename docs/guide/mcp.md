# KG OS MCP 使用与私人 Plugin 接入

<!-- cspell:words openclaw healthcheck -->

本指南描述通过 **Linux amd64 Docker 镜像**部署的 KG OS MCP 服务。MCP 不提供独立 npm 包或 Linux arm64 镜像；CLI / SDK / Runtime npm 产品继续独立维护。这里的镜像构建示例不是已发布的 OCI Registry 镜像。正式行为见 [MCP 设计](../design/mcp.md)。

## 1. Docker 服务入口与配置

前提：Docker Engine 支持 **Linux amd64** 容器，镜像已取得或从 KG OS 源码构建。镜像自带 Node.js、MCP、SDK/CLI、`kgosd` 与扩展，**宿主机不需要 Node.js、npm 或 `kgosd`**。初次使用须在容器内按现有 `kg init` 规则明确初始化 Workspace；已有 Workspace 则复用持久卷。

镜像内 `KGOS_ROOT` 默认为 `/workspace`，只使用一个 Workspace / Instance。缺少初始化配置、daemon 不可用或缺少 MCP Token 时 `serve` 失败。镜像默认监听容器内 `0.0.0.0:3777/mcp`，宿主机监听范围由 Docker 端口映射决定；`--port 0` 支持容器内动态端口分配，宿主机映射须与实际端口匹配。内部 `kgosd.lock` 和 `auth.json` 的解析/连接/自动启动**复用正式 CLI**，不是第二套 Instance 配置。

完整的部署入口：

| 命令 | 用途 |
| --- | --- |
| `docker run ... <image> serve --help` | 查看 Instance、网络、认证、TLS、预算、日志完整参数 |
| `docker run ... <image> doctor --json` | 只读诊断容器内配置/Instance/Runtime/认证，不自动启动 daemon |
| `docker run ... <image> serve [options]` | 启动标准 Streamable HTTP 服务 |
| `docker run ... <image> --version` | 查看镜像内 MCP 版本 |

所有选项遵循**命令行 > 对应环境变量 > 默认值**。通用 MCP 命令要求显式 Root 来源，官方镜像已设置 `KGOS_ROOT=/workspace`；用户覆盖时仍须明确选定唯一 Root。MCP 支持 `--host`、`--port`、`--path`，可选成对的 `--tls-cert` / `--tls-key`，凭证通过 `--token-env` 或 `--token-file` 指定来源；`--oauth-issuer` 可启用 ChatGPT 单管理员 OAuth（默认关闭）。还提供请求超时/并发/大小限制、Sandbox 与 Preview 资源预算及日志级别/格式。对应环境变量以 `KGOS_MCP_` 为前缀，完整表及校验范围见 [部署合同](../design/mcp.md#部署交付与运行合同)。`doctor` 的本地就绪不代表远端 ChatGPT 已连通。

## 2. Linux amd64 Docker 镜像部署

已正式发布的版本可从 `ghcr.io/byiyli/kgos-mcp:v<version>` 取得（只有实际版本存在且镜像可见/授权时才能拉取）。**当前尚无本阶段新镜像的实际发布证据**；从本地 KG OS 源码构建可使用下列命令：

```sh
docker build --platform linux/amd64 -f Dockerfile.mcp -t kgos-mcp:local .
docker volume create kgos-mcp-workspace
```

首次初始化（以下为示例配置，Embedding endpoint、模型、维度必须替换为实际配置）：

```sh
docker run --rm --platform linux/amd64 \
  -v kgos-mcp-workspace:/workspace kgos-mcp:local init \
  --cache-path cache/openai-compatible.db --cache-max-size-mb 4096 \
  --embedding-base-url https://example.invalid/v1 --embedding-model replace-me \
  --embedding-dimensions 1536 --embedding-similarity cosine \
  --embedding-api-key-env OPENAI_API_KEY --no-additional-extensions
```

镜像的 `init` 仍要求完整显式配置，不会猜测参数；示例 URL 不可用于实际 Embedding。镜像中 MCP 与 `kgosd` 可以是不同进程，但**不需要宿主机安装 daemon**。

在宿主机**仓库外**创建只有授权用户可读取的 `mcp.env`（如权限 `0600`），填入 `KGOS_MCP_TOKEN=<独立随机管理员凭证>`；如需 ChatGPT OAuth，再提供 `KGOS_MCP_OAUTH_ISSUER=<实际 HTTPS origin>`。MCP Token 与 `.kgos/auth.json` 的内部 Token 必须隔离。启动及只读诊断：

```sh
docker run -d --name kgos-mcp --platform linux/amd64 \
  --env-file /secure/path/mcp.env \
  -v kgos-mcp-workspace:/workspace \
  -p 127.0.0.1:3777:3777 kgos-mcp:local serve
docker exec kgos-mcp node /opt/kgos/node_modules/@kgos/mcp/dist/bin.js doctor --json
```

重建容器须重新挂载同一个 Workspace volume，避免丢失 Instance；本机 `doctor` 的成功不代表远程可达。上述映射只向宿主机 loopback 开放端口，远程使用须由用户自行提供受保护的 HTTPS / Tunnel / 代理，**不要直接公开裸 HTTP**。镜像构建可使用内部临时 npm tarball 安装依赖，但这些中间物不会以 MCP npm 产品发布。

正式发布后，应以 GitHub Release 提供的 `ghcr.io/byiyli/kgos-mcp@sha256:<digest>` 固定镜像，或使用对应的 `v<version>` tag；将上例中的本地 `kgos-mcp:local` 替换成真实可拉取的镜像引用。GHCR 首次推送的镜像可能默认私有；未经包所有者设置 Public visibility 时需要拥有 `read:packages` 权限的认证，不能把“镜像已上传”当作“用户已能匿名安装”。详情见 [Docker 镜像发布](development.md#mcp-docker-镜像发布)。

### KG OS Linux 长期 Dev 环境

KG OS 的固定远端开发环境使用 `ssh openclaw`、`/data/apps/KgosDev` 和独立的 `kgos-dev` Compose 项目。**该 Dev 环境单独将宿主 MCP 端口绑定 `0.0.0.0` 供其它设备访问**，与普通 MCP 默认只监听本地回环的行为不同；Bearer 认证保持生效，明文 HTTP 不适合在公网传输 Token。日常同步、部署、备份、回退、状态、日志与只读验收统一执行 `pnpm dev:mcp <action>`；**完整运维规范与全部命令只维护在 [远程开发环境指南](dev-environment.md)**，本 MCP 用户指南不复制第二份 Dev 流程。真实 Docker amd64 验收证据见 [Phase 15](../development/phases/15-mcp.md#当前实现与验收证据)。

**两层认证彼此独立**：

| 边界 | 凭证 | 谁持有 |
| --- | --- | --- |
| 普通 MCP 客户端 → `@kgos/mcp` | `Authorization: Bearer <KGOS_MCP_TOKEN>`，独立的随机 Token | 用户配置的 MCP 客户端、MCP Server 进程 |
| ChatGPT → `@kgos/mcp`（启用 OAuth） | 短效 OAuth Access Token；浏览器首次授权使用同一管理员 `KGOS_MCP_TOKEN`，**不交给 ChatGPT** | ChatGPT 持有 OAuth Access/Refresh Token，MCP 负责签发和校验 |
| `@kgos/mcp` → `kgosd` | `.kgos/auth.json` 里的原始 Instance Bearer | 仅 KG OS 本地 CLI/MCP 进程 |

客户端不能通过 JavaScript Sandbox 获取 Token、环境变量、文件路径或任意 HTTP。容器默认监听其内部网络，宿主机映射应优先限制在 loopback，不能直接用明文 HTTP 暴露在公网。**远程使用时**采用用户自行选择的受控 HTTPS 反向代理/隧道，完成 TLS、访问控制及正确的 `Authorization` 透传；不需要也不允许将 `kgosd` 自身公开监听。MCP Tool 调用仍采用受认证的服务端客户端边界。

## 3. 验证 MCP

使用支持 Streamable HTTP 和 Bearer 的标准 MCP Client 或 MCP Inspector 连接 `/mcp`。必须先完成认证；返回工具恰好如下：

| Tool | 用途 | 关键输入 |
| --- | --- | --- |
| `kgos_preview` | 全 Branch Head、完整 Ontology 的固定 Markdown 视图 | `offset`、`limit`（100–500，默认 300）、`viewRevision` |
| `state_ancestry` | Commit 祖先 DAG 的分页 Markdown 和完整 Message 原文 | `root`、`limit`、`cursor` |
| `kgos_read` | 隔离的 JS，只能调用现有 SDK 的只读方法 | `code` |
| `kgos_run` | 同一 Sandbox，允许 SDK 读取及写入 | `code` |

每次 `kgos_preview` 首次调用按全部 Branch Head 固定一个视图并生成 `viewRevision`；继续读取传入原 revision，`offset` 是**完整文本的零基行号**。缓存只在进程内，默认 10 分钟、最多 8 份视图；重启/过期后需要重新读取。超预算、分页不完整或错误 State 会明确失败，不能把部分模型当成完整视图。

`kgos_read` 示例：

```js
const overview = await evolution.overview();
const state = overview.state;
const [ontologyResult, graphResult] = await Promise.all([
  ontology.read({ at: state }),
  graph.query({ at: state, cypher: "MATCH (n) RETURN n LIMIT 10" })
]);
return { state, ontologyResult, graphResult };
```

它是在 Tool `code` 字段中提交的 **async 函数体**，不是 Node 模块；顶层对象直接叫 `ontology`、`object`、`graph`、`evolution`，没有 `kgos.` 前缀。脚本必须显式 `return` JSON 可表示值。支持真正的 `Promise.all()` 与 `for await...of`，Graph stream 会通过 SDK 的原生迭代接口按需读取，不在 MCP 主进程预读完整结果。

`kgos_run` 的每个 SDK mutation 使用原有独立 HTTP/事务语义。**一次 JS 脚本不等于跨方法原子事务**；前一个调用已完成、后一个抛错或网络中断时，先用 State/Branch/Tag/Merge 的现有读取核对实际结果，不自动重试。Commit `message` 可采用 `## 简介` / `## 改动` 两段完整 Markdown，消息本身不是数据库结构字段。

## 4. 接入 ChatGPT 私人 Plugin

见 [私人 Plugin 面向 AI 的安装 Runbook](../../plugins/kgos/INSTALL.md)。先把本机 Server 经**用户自行选定**的 HTTPS/Tunnel/反向代理暴露给 ChatGPT，取得其真实公共 origin（例如 `https://kgos.example.com`），在启动 MCP 时加上 `--oauth-issuer https://kgos.example.com` 或环境变量 `KGOS_MCP_OAUTH_ISSUER`。这个参数不创建公网连接；公网 TLS 可以在 MCP 或可信入口处终止。

1. 从目标网络确认 `https://kgos.example.com/.well-known/oauth-protected-resource` 与 `https://kgos.example.com/.well-known/oauth-authorization-server` 可读取，MCP 地址 `https://kgos.example.com/mcp` 在未授权时返回包含 `resource_metadata` 的 401。
2. 在 ChatGPT 中 **Add custom MCP server**，输入完整 MCP URL，认证方式选择 **OAuth**（Client ID Metadata Documents/CIMD；不需要静态 Client Secret）。
3. ChatGPT 打开 KG OS 自带的管理员授权页面。用户**只在该可信 HTTPS 页面**输入之前配置在 MCP Server 的管理员 Token，确认允许 ChatGPT 使用包含写入的四个 Tool。**授权页面的一次性 Ticket 只有 5 分钟有效期，MCP 服务重启也会让页面失效**；遇到 Ticket 失效提示应返回 ChatGPT 重新发起授权，不能在旧页面反复提交。ChatGPT 获取短期 OAuth Token，后续不需要直接保存管理员 Token。
4. 验证工具发现和一次只读调用。服务端重启会使进程内签发的 Access/Refresh Token 失效，需要再次授权；默认 Access Token 1 小时、Refresh Token 30 天（期间正常轮换），不提供用户注册。

禁止选择“无认证”绕过 KG OS 的认证边界；不要把管理员 Token 写入 Plugin 文件、MCP URL 或 ChatGPT 对话。**2026-10-12 已由真实 ChatGPT 私人连接验证 OAuth、四 Tool 与写入回读**；这不等于所有客户端版本、Plugin/Skill 激活或全部 SDK 31 方法均已由 ChatGPT 逐项验收。已注册 Connection 的实际动态 App ID 只有在按需创建私人引用包时才需要；基础 MCP-only 私人 Plugin 不要求重复创建。

当前本地标准 MCP Client 测试不能替代真实 ChatGPT Web/Desktop 的账号授权、Tool 发现、Skill 触发和写入确认验证。后者及各平台 CI 结果需要有独立运行证据，见 [Phase 15 计划](../development/phases/15-mcp.md)。
