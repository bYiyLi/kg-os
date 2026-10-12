# KG OS 远程开发环境

<!-- cspell:words openclaw healthcheck Buildx noproxy -->

这里记录 **KG OS 自己的长期集成 Dev 环境**及其可重复执行的管理入口。KG OS 产品的 MCP/认证/部署行为以 [MCP 设计真源](../design/mcp.md)为准；Phase 15 当前实现、已完成与未完成的验收证据只由 [Phase 15](../development/phases/15-mcp.md)维护。本文件不定义产品接口，也不把 Dev 验证冒充正式发布。

## 1. 固定环境与职责

| 项目 | 值 |
| --- | --- |
| 本地源码真源 | Mac `/Users/yi/Code/KGOS` |
| Dev 主机 | `10.168.155.123`，Mac 经现有 `ssh openclaw` 连接 |
| Dev 部署根 | `/data/apps/KgosDev` |
| Compose 项目 | `kgos-dev`，服务 `mcp`，镜像 `kgos-dev-mcp:local` |
| Dev MCP | `http://10.168.155.123:3777/mcp`（Docker 宿主绑定 `0.0.0.0:3777`；可在 `config/compose.env` 修改端口） |
| ChatGPT HTTPS MCP | `https://kgos-dev.y2l.top/mcp`（Dev OAuth Issuer：`https://kgos-dev.y2l.top`） |
| Runtime | 容器内 Node.js 24.15.0、`@kgos/mcp` + CLI/SDK + 从**当前 Git 工作树**编译的 `kgosd` 与嵌入式 Web，无需宿主 daemon |

参照现有 Nexum Dev 的**源码、配置、数据分离 + 独立 Compose 项目**，但 KG OS 不依赖 Nexum 的 Server、数据库、身份服务、Registry 或部署脚本。当前 KG OS Dev 直接从本地未发布工作树同步源码、在目标 Linux Docker 构建；**没有沿用 Nexum 的 Registry/digest 发布流水线**。MCP 官方交付仅要求 Linux amd64。Dev 是发布前完整功能/集成验收环境，**普通 CI 仅承担代码质量与现有 Runtime 平台回归，正式镜像构建和 GHCR 发布归 Release CI**；Dev 实测不等于普通 CI 通过、镜像正式发布或生产部署。责任规则见 [AGENTS](../../AGENTS.md#开发ci-与-release-分工)。

Dev 镜像在多阶段构建中分别编译当前源码的 TypeScript SDK/CLI/MCP、Web 生产资源及 Go `kgosd`（CGO + SQLite FTS5）；Go 编译器为 **1.27.2**，按 Linux 架构下载官方归档、以固定 SHA-256 校验，不依赖宿主安装 Go。镜像内保留所选版本的 `@kgos/runtime-linux-*` **Lithograph、Provider 与 Jieba 原生扩展**；编译好的本仓库 `kgosd` 替换其中原有二进制，同时重新生成其 `manifest.json` 的二进制摘要，继续通过 CLI 的完整性验证。**此 Dev 流程不会自动重新编译 `native/jieba` 或 Lithograph**；改变它们时必须另行准备已验证的 native Runtime artifact，不能从 Dev 构建成功推断原生扩展也已同步最新源码。

| Linux 路径 | 所有权与用途 |
| --- | --- |
| `src/KGOS/` | **可以整体替换**的源码镜像；Docker Compose、脚本和开发手册随源码同步，不是源代码真源 |
| `config/compose.env` | root 所有、`0600`；镜像来源和宿主端口等非凭证配置，脚本不会覆盖既有文件 |
| `config/deployments.tsv` | 每次验收成功后追加 UTC 时间、源 Git revision、工作区 clean/dirty 与真实运行镜像 ID；不包含 Secret |
| `data/workspace/` | UID 1000、`0700`；**唯一持久化 KG OS Instance**，容器映射到 `/workspace` |
| `data/secrets/mcp-token` | UID 1000、`0400`；外部 MCP 管理员 Token，容器只读挂载，**与 `.kgos/auth.json` 不同** |
| `data/backups/` | root 私有目录，保存 SQLite 在线快照、配置、认证文件及已安装扩展；**包含凭证，禁止公开** |

运行中的容器以非 root 的 Node 用户（UID 1000）访问 Workspace；**MCP 宿主端口绑定 `0.0.0.0`，允许其它设备通过开发主机实际 IP 访问**，`kgosd` 动态端口仍只在容器内部 loopback，不对外发布。MCP Bearer Token 认证不变，但当前 Dev HTTP **没有传输加密**：只应在可信受控网络中直接访问；不应通过不可信网络或公网明文发送 Token。对外使用时须由用户配置 HTTPS / Tunnel / 反向代理等安全传输，此绑定本身不代表 ChatGPT OAuth 已可用。

Dev Compose 已配置 `KGOS_MCP_OAUTH_ISSUER=${KGOS_DEV_OAUTH_ISSUER:-https://kgos-dev.y2l.top}`，在现有 MCP Server 上提供单管理员 OAuth，而不是另部署认证服务器。外部 HTTPS 入口须将 `/mcp`、`/.well-known/oauth-protected-resource`、`/.well-known/oauth-protected-resource/mcp`、`/.well-known/oauth-authorization-server`、`/oauth/authorize`、`/oauth/token` **原路径**转发至同一容器；`401` 的 `WWW-Authenticate` 必须指向 HTTPS resource metadata。为了让服务端验证 ChatGPT 的真实 CIMD 文档，容器启用 Node.js 原生环境代理（`NODE_USE_ENV_PROXY=1`），继承 Dev 主机现有的 `HTTP_PROXY` / `HTTPS_PROXY`，但对 `127.0.0.1` / `localhost` 不走代理；不在源码中硬编码出站代理或凭证。

## 2. 统一管理入口

在 Mac 的真实 KG OS 仓库下执行，**不必手工再组合 rsync、SSH 与 Compose 命令**：

```sh
cd /Users/yi/Code/KGOS
pnpm dev:mcp setup       # 一次性准备目录、配置和 Token，不初始化数据库
pnpm dev:mcp deploy      # 同步当前源码、备份、构建、切换、验收；异常尝试回退旧镜像
pnpm dev:mcp check       # 只读验证，适合每次更新后重复运行
pnpm dev:mcp status      # 容器状态、镜像 ID 与最后一次部署记录
pnpm dev:mcp logs        # 最近 100 行日志
pnpm dev:mcp logs-follow # 持续跟踪日志，Ctrl+C 只结束日志跟踪
pnpm dev:mcp restart     # 重启并重新验收；不碰 Instance
pnpm dev:mcp backup      # 单独创建在线一致性快照
pnpm dev:mcp rollback    # 手工回到上次通过验收的镜像，保留数据
pnpm dev:mcp stop        # 仅停止 KG OS Dev 容器，不删除 Workspace
```

入口为 `scripts/mcp-dev.mjs`，远端单机生命周期归 `scripts/mcp-dev-remote.sh`，容器内只读 MCP 验收归 `scripts/mcp-dev-accept.mjs`，Compose 归仓库根 `compose.dev.yaml`。**这些文件是可重复执行的正式 Dev 操作入口**；不在服务器 `data/` 中保存另一套产品脚本或修改产品代码。

### 首次初始化（仅新 Workspace）

`setup` **只准备私有目录和随机 Token**；不猜测数据库初始化参数，不覆盖已有 Instance，不自动创建用户模型。首次构建完镜像、没有 `data/workspace/.kgos/initialized.json` 时，必须由用户显式完成一次原本的 `kg init`。当前 Dev 隔离测试使用以下配置；它仅测试本地图能力，`example.invalid` 不可用作真实 Embedding Provider：

```sh
ssh openclaw
cd /data/apps/KgosDev/src/KGOS
docker compose --env-file ../../config/compose.env -f compose.dev.yaml build mcp
docker compose --env-file ../../config/compose.env -f compose.dev.yaml run --rm --no-deps mcp init \
  --cache-path cache/openai-compatible.db --cache-max-size-mb 4096 \
  --embedding-base-url https://example.invalid/v1 --embedding-model kgos-docker-dev \
  --embedding-dimensions 3 --embedding-similarity cosine \
  --embedding-api-key-env "" --no-additional-extensions
```

**已经初始化过的 Dev** 直接用 `pnpm dev:mcp deploy`，不要反复运行 `init` 或清空数据库。未来更换 Provider 配置、用户模型或持久数据须遵守现有 KG OS Runtime/Instance 合同；部署脚本不迁移或重写它们。

## 3. 可持续更新与回退

`deploy` 的固定顺序为：

1. Mac 检查自己位于 KG OS Git 工作树，读取完整 HEAD 和 dirty 状态。**允许未提交源码迭代**，但在历史中明确标记 `dirty`；这与 Nexum 的 clean-source Registry release 是不同合同。
2. 只将源码同步到固定的 `/data/apps/KgosDev/src/KGOS/`。同步保留 `cmd/`、`internal/`、全部 TypeScript 包与 Web 源码，但跳过 `.git`、`.kgos`、`.env`、`node_modules`、`native` 扩展原始源码、构建结果和缓存。`rsync --delete` 作用范围**严格限定于这个专用源码目录**，绝不用于 `KgosDev` 根或 `data/config`。
3. Idempotent `setup` 检查已有 Secret、目录权限和 Compose 配置；不重置 Token 或 DB。只有先前已初始化的 Instance 可以部署 MCP。
4. 把**当前运行容器的真实镜像 ID**保存为 `kgos-dev-mcp:previous`，并在构建前创建**SQLite 在线一致性备份**；备份失败直接停止，旧容器仍运行。
5. `docker compose build mcp` 在原服务运行时重新构建 TypeScript / Web 与 Go 二进制，保留所需的固定版本原生扩展，**更新并验证真实 Runtime 摘要**；构建成功后再 `up -d --no-build --force-recreate mcp`，只触及 `kgos-dev` Compose 服务。
6. 验收容器 `healthy`、宿主将 MCP 发布到 `0.0.0.0`、无凭证 HTTP 返回 **401** 且声明 OAuth resource metadata，检查 protected resource 和 authorization server discovery、`kgos-mcp doctor --json` 本地 Instance/Runtime ready；最后通过标准 MCP Client 使用容器内只读的管理员 Token 发现**恰好四个 Tool**，执行 Preview、State 和 Ancestry 读取。没有额外的验收数据写入。
7. 全部通过后追加 `config/deployments.tsv`（UTC、revision、dirty/clean、镜像 ID）；新镜像验收失败时恢复 `previous` 并复验，仍以失败退出，不将失败发布伪装成成功。

**镜像回退不等于数据库回退。** `rollback` 只改变运行镜像，不会偷偷把新版本可能写入的数据库恢复为旧状态；数据恢复必须在停止服务后，由操作者明确选择已检查过的备份执行。仅在根本不存在先前镜像时，首次部署失败会保持未部署状态。

### 备份与恢复边界

`pnpm dev:mcp backup` 可在线运行，`deploy` 在更新前也会自动执行。用 Python 标准 `sqlite3.Connection.backup` 复制 `kgos.db`，并包含 `config.toml`、`auth.json`、`initialized.json` 和 `extensions/`；省略可重建缓存、日志与运行中 `kgosd.lock`。所有备份位于 root 私有目录并保留原文件，**不会自动清理旧备份**；定期检查磁盘使用量，删除备份需要另行明确执行。任何恢复须停止 Dev MCP/daemon，验证备份对应 Instance 与数据完整性后再进行，**没有默认自动还原**。

## 4. 常见排障与验收

从 Mac 先运行 `pnpm dev:mcp status`、`pnpm dev:mcp check`、`pnpm dev:mcp logs`；失败时分别核对 SSH 别名、Docker/Compose、Node 24.15.0、镜像仓库代理、`config/compose.env`、持久化目录 UID/权限、Token 文件和实际 `kgosd`。当前 Linux Dev `config/compose.env` 已选择可用的镜像代理 `docker.y2l.top/node:24.15.0-bookworm-slim`，以保持 Node 版本精确匹配；不将这个代理固化为 KG OS 产品依赖。

其它设备可以通过 `http://10.168.155.123:3777/mcp` 访问 Dev MCP（若更改 `KGOS_DEV_PORT`，使用实际端口）；未提供 Token 时应收到 `401`。可先从 Mac 无凭证测试网络可达性：

```sh
curl --noproxy '*' -i http://10.168.155.123:3777/mcp
```

在 ChatGPT 的自定义 MCP / Plugin 配置中使用 **`https://kgos-dev.y2l.top/mcp`，认证选择 OAuth（CIMD）**。先从 Mac 或公网机器验证 HTTPS 端点是否返回 JSON 与正确的 OAuth 引导，再进行用户交互授权：

```sh
curl -i https://kgos-dev.y2l.top/mcp
curl -i https://kgos-dev.y2l.top/.well-known/oauth-protected-resource/mcp
curl -i https://kgos-dev.y2l.top/.well-known/oauth-authorization-server
```

授权页面使用 5 分钟有效的**一次性 Ticket**。如果打开页面后等待过久，或者 Dev 服务在其间重启，提交旧页面会被拒绝；**回到 ChatGPT 重新触发连接/授权，取得新的页面后再提交**。正确输入的 MCP 管理员 Token 不会修复已经过期的 Ticket，也不应该发送到聊天中。

只有真实 ChatGPT 客户端最终登录和调用成功后，才能把该客户端标记为通过；开发容器的内部 discovery、401 或独立 OAuth 协议测试不能替代这个证据。

需要在**不经过明文网络发送 Bearer Token**的情况下从 Mac 使用 MCP 时，仍可建立仅本机的临时 SSH 加密转发：

```sh
ssh -N -L 127.0.0.1:3778:127.0.0.1:3777 openclaw
```

Mac 使用 `http://127.0.0.1:3778/mcp` 和相应 Bearer Token 测试；结束时关闭转发。**MCP `doctor.ready=true`、HTTP 401 只能证明 Dev 的部分就绪，不等于完成全部 SDK 方法、ChatGPT 实际客户端或普通 CI 验收**。此前真实 ChatGPT 接入的证据及当前缺口见 [Phase 15](../development/phases/15-mcp.md#当前实现与验收证据)。

### 发布前完整 MCP 验收

先完成对应源码工作树的本地 `pnpm validate`，再在**获得 Dev 部署授权后**通过 `pnpm dev:mcp deploy` 同步并更新当前 Dev，随后执行 `pnpm dev:mcp check` 只读确认长期服务就绪。仅凭这一步的 Preview/State/Ancestry 不足以完成写入、Stream、Merge、31 个 SDK 方法的验收。

**写入/重启/持久化验收使用 Dev 主机上的隔离容器**，不对长期 `data/workspace`、用户 Branch 或管理员 Token 做测试写入。在已同步的 Dev `src/KGOS` 下准备冻结的 pnpm 依赖（Node、pnpm 版本应匹配仓库约束），然后使用同一 Dev 环境配置的基础 Node 镜像执行现有测试脚本：

```sh
ssh openclaw
cd /data/apps/KgosDev/src/KGOS
set -a
. /data/apps/KgosDev/config/compose.env
set +a
KGOS_MCP_DOCKER_BASE_IMAGE="${KGOS_DEV_NODE_IMAGE:-node:24.15.0-bookworm-slim}" \
  node scripts/mcp-docker-smoke.mjs
```

脚本自行建立并清理**临时 Docker 镜像和 Volume**，在真实 MCP → QuickJS → SDK → `kgosd` → Lithograph 链路验证四 Tool、31/31 方法及重启数据保持。它与长期 Dev 的只读 `check` 是**两个不同验收层**，必须分别记录。若 Dev 真正构建失败，核对其 Compose 代理/出站网络、镜像来源及冻结依赖，不把从 Mac 另行运行的临时远程 Docker 构建失败误认成 Dev 管理流程的验收结果；也不为了 Release CI 提前重复手工构建正式镜像。

准备发布时记录本地源 Revision / dirty 状态、Dev 部署镜像 ID、只读 `check`、隔离 31-method Smoke、HTTPS/真实 ChatGPT 调用、`pnpm validate` 和 Review 的**实际结果**。随后由获授权的 Git Commit/Push 进入普通 CI；正式 Release Tag、GHCR 推送和生产部署都需要独立授权。具体完成条件以 [Phase 15](../development/phases/15-mcp.md#完成条件) 为准，不能把 Dev 证据或普通 CI 当作已经发布的镜像。
