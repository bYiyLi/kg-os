# KG OS 远程开发环境

<!-- cspell:words openclaw healthcheck Buildx noproxy -->

这里记录 **KG OS 自己的长期集成 Dev 环境**及其可重复执行的管理入口。KG OS 产品的 MCP/认证/部署行为以 [MCP 设计真源](../design/mcp.md)为准；旧 TypeScript 部署的历史证据由 [Phase 15](../development/phases/15-mcp.md)维护，新 Go 统一服务的目标和验收由 [Phase 16](../development/phases/16-kgosd-unified-mcp.md)维护。本文件不定义产品接口，也不把 Dev 验证冒充正式发布。

**当前交付边界（[D99](../design/decisions.md#d99-linux-amd64-docker-only-distribution)）**：此后 KG OS 仅正式发行 Linux amd64 Docker。Dev 仍使用本文件的 OpenClaw/Compose、备份和回退入口；普通 CI 改为 Ubuntu Validate + Linux amd64 Docker Smoke 两个 Job，旧六平台 npm/Native Runtime CI 与新版发布已停止。历史部署记录保持不变；本轮简化不意味着已经部署或发布新镜像。

**环境职责（D94）**：Mac 只做源码与非 Docker 验证；OpenClaw Linux amd64 负责 Dev Docker，GitHub Actions PR/main CI 独立构建/测试同一单进程镜像。**2026-10-13 已将长期 Dev 切换到 `Dockerfile.unified` 与单个 Go `kgosd` 进程**，保留原 Workspace、凭证、端口和 `pnpm dev:mcp` 管理入口；旧 Node MCP 的镜像仅作为迁移回退候选。

**2026-10-14 Phase 17 Dev 部署成功**：使用 Mac 当前 `dirty` 工作树通过正式 `Dockerfile.unified` 在 OpenClaw 构建并切换镜像；`kgos-dev-mcp-1` 已 `healthy`，`pnpm dev:mcp check` 通过统一 Instance Bearer、OAuth Discovery 与四个 Tool 的只读请求。镜像 ID 为 `sha256:81216e09a1f64ac8ed67db3b30ea4e31c400a209135eaf339eccf7018c2e8951`；部署前受保护的 SQLite 一致性快照位于 `/data/apps/KgosDev/data/backups/20261014T070920Z-qwRPyKkr`。公网 HTTPS 首页及 OAuth 资源/授权元数据已返回 200，无凭证 MCP/请求详情返回 401；用户已确认新版 ChatGPT 重新授权成功，GitHub CI / 完整新版隔离矩阵未验收。历史独立 MCP Token 文件保留用于旧镜像回退，不由新版认证使用。2026-10-14 主题适配后的最新 Dev 镜像为 `sha256:6c67e96e381f97fa1764fc5e994cd488498d018ae3b361d2d46da6f1e4c6f6c3`，正式 Docker 构建、健康检查、只读 MCP 自动验收及公网主题 CSS 验证通过；Phase 17 按用户批准的未完成 CI 例外标记 `done`。

**2026-10-14 Phase 18 Dev 部署成功**：使用当前 `main@8e7bf56` 的 `dirty` 工作树经 `pnpm dev:mcp deploy` 同步至 OpenClaw，构建并切换 Linux amd64 单进程镜像 `sha256:60fcac91fb95532ba40aead7757d076113c6c8bd300957d9c3eee9757ca87193`；`kgos-dev-mcp-1` 为 `healthy`，UTC 部署记录为 `2026-10-14T11:49:37Z`。部署前创建 SQLite 一致性备份 `/data/apps/KgosDev/data/backups/`（2026-10-14T11:47:26Z）（含私有凭证，禁止公开）。自动验收及 `pnpm dev:mcp check` 通过四业务 Tool + `kgos_workspace` 的双入口元数据、受认证 `resources/list/read`、自包含 HTML/CSP、OAuth 与 Web/API 安全隔离；公网 HTTPS `/` 200、`/mcp` 匿名 401、OAuth metadata 200、`/mcp-app.html` 404。使用本次镜像在**隔离临时 Volume** 完成 31/31 SDK、重启持久化、单进程、非 root、无 Node.js 运行时 Smoke，不写长期 Dev 知识数据；部署时还未进行真实 ChatGPT 入口验收；随后用户实际打开 Sidebar App 和 Conversation Panel 并确认刷新/主题/语言/分支筛选正常（见 [Phase 18 关闭记录](../development/phases/18-chatgpt-embedded-web.md#阶段关闭记录2026-10-14用户批准例外)）；远端 GitHub CI 尚未运行。

**2026-10-15 Phase 19 Dev 部署成功**：从提交 `0bc47ee` 的**独立干净 worktree** 调用正式部署入口，不同步 Mac 正在编辑的 Web 文件。SQLite 一致性备份后，Linux amd64 统一镜像 `sha256:9b409ec1090e4099cc236805a9057e4e651b6ecaa8500e6656438268fd24369a` 更新成功；UTC 记录为 `2026-10-15T06:19:26Z`，`pnpm dev:mcp check` 验证 `healthy`、统一 Web/API/MCP、认证隔离、OAuth 与 UI Resource。现有 Bearer 调用受保护诊断 API 为 200，无凭证请求为 401；请求 ID、指标字段、Docker `json-file` 10 MiB × 5 保留配置均通过。长期 Instance 未作验收写入，隔离 Docker SDK 31/31 与重启持久化独立验证；GitHub CI 另行取证。

**2026-10-17 Phase 23 Dev 部署验收**：Mac `main@96c2bc8` 的 `dirty` 工作树通过现有 `pnpm dev:mcp setup` 同步到 OpenClaw；成功创建私有 SQLite 一致性备份（`20261016T171749Z-BIIiE009`）并将已通过隔离验证的 Linux amd64 镜像 `sha256:a3daf38c8afe0e72068f0d097bf6220044c2ef8345d0c8c7b20c9afd1c19a67e` 切换到 Dev。旧镜像保留作回退，真实运行镜像以部署记录为准。新容器 `healthy`，本机只读 MCP/OAuth/五个 AI-facing + app-only UI、目录和批量文档及公网 HTTPS 状态通过；对本次部署镜像在独立临时 Volume 复验 **31/31 SDK** 与重启持久化成功。不向长期 Dev 知识库写入测试数据。镜像构建复用了经验证的相同 Go 1.27.2 与 Node/pnpm 缓存构建阶段，**未完成原样 `Dockerfile.unified` 构建**；尚未提交推送或验收新 SHA CI 与真实 ChatGPT 新会话，不能将阶段标记为 `done`。

**2026-10-17 Phase 23 文档修复后 Dev 更新**：修复隔离测试 Branch 与 `STALE_BASE_STATE` 指南错误；部署前创建私有 SQLite 一致性备份 `/data/apps/KgosDev/data/backups/20261017T024119Z-mCiJdcYa`（含凭证，禁止公开）。OpenClaw 经同版本缓存构建阶段的临时 Linux amd64 Dockerfile 编译当前源码，**并非原样 `Dockerfile.unified` 构建**；独立 Volume 的 31/31 SDK/重启 Smoke 通过后切换镜像为 `sha256:bd06c022043006d2fed05cbc2cb29499e2d316ed1ba8e095e3c4614b84602f2f`，UTC 记录 `2026-10-17T02:46:41Z`，`kgos-dev-mcp-1` 为 `healthy`。只读 Web/API/MCP/OAuth/五 Tool + app-only UI Resource 验收通过，运行中的 `kgos_docs` 已返回修复后的 Ontology/Object/Patch 指南；默认 `main` Head 在部署前后不变，旧镜像保留供回退。首次切换因定制校验脚本误要求 MCP 成功响应含 `isError:false` 而触发自动回退，验证旧容器健康后纠正脚本重新部署成功；这是验收脚本问题，未发现新服务缺陷。本轮仅 Dev 更新，未提交、推送、正式发布或执行修复后的真实 ChatGPT 客户端回归；Phase 23 仍为 `in_progress`。

## 1. 固定环境与职责

| 项目 | 值 |
| --- | --- |
| 本地源码真源 | Mac `/Users/yi/Code/KGOS` |
| Dev 主机 | `10.168.155.123`，Mac 经现有 `ssh openclaw` 连接 |
| Dev 部署根 | `/data/apps/KgosDev` |
| Compose 项目 | `kgos-dev`，保留服务名 `mcp`，镜像 `kgos-dev-mcp:local`；实际主进程仅 `kgosd` |
| Dev MCP | `http://10.168.155.123:3777/mcp`（Docker 宿主绑定 `0.0.0.0:3777`；可在 `config/compose.env` 修改端口） |
| ChatGPT HTTPS MCP | `https://kgos-dev.y2l.top/mcp`（Dev OAuth Issuer：`https://kgos-dev.y2l.top`） |
| Runtime | 镜像仅包含 Go `kgosd`、QuickJS-NG/wazero、内嵌 Web 和 native 扩展；**没有 Node.js 运行时** |

参照现有 Nexum Dev 的**源码、配置、数据分离 + 独立 Compose 项目**，但 KG OS 不依赖 Nexum 的 Server、数据库、身份服务、Registry 或部署脚本。Dev 直接从 Mac 未发布工作树同步源码到 Linux Docker 构建；**普通 CI 也构建及测试 Docker，但不推送 GHCR**；正式镜像与 GHCR 仅由获独立授权的 Release CI 交付。Dev 实测不等于最终 CI 通过、镜像发布或生产部署。责任规则见 [AGENTS](../../AGENTS.md#开发ci-与-release-分工)。

Dev 多阶段构建生成 Web 静态资源、当前 Go `kgosd`（CGO + SQLite FTS5），并校验固定版本的 Linux amd64 Lithograph、Provider 和 Jieba 扩展。构建时 Go **1.27.2** 归档进行 SHA-256 校验，运行时不需要 Go/Node 编译工具；Runtime `manifest.json` 的 daemon 摘要同步为当前编译产物。**此 Dev 流程不会自动重新编译 `native/jieba` 或 Lithograph**；改变它们时需单独准备已验证 native artifact。

| Linux 路径 | 所有权与用途 |
| --- | --- |
| `src/KGOS/` | **可以整体替换**的源码镜像；Docker Compose、脚本和开发手册随源码同步，不是源代码真源 |
| `config/compose.env` | root 所有、`0600`；镜像来源和宿主端口等非凭证配置，脚本不会覆盖既有文件 |
| `config/deployments.tsv` | 每次验收成功后追加 UTC 时间、源 Git revision、工作区 clean/dirty 与真实运行镜像 ID；不包含 Secret |
| `data/workspace/` | UID 1000、`0700`；**唯一持久化 KG OS Instance**，映射到容器 `/workspace`；Dev 用 Compose `user: 1000:1000` 保持原权限 |
| `data/secrets/mcp-token` | 旧 Phase 16 私有 Secret，Phase 17 源码不再挂载/读取；不擅自删除既有 Dev 文件 |
| `data/backups/` | root 私有目录，保存 SQLite 在线快照、配置、认证文件及已安装扩展；**包含凭证，禁止公开** |

运行中的容器以非 root UID 1000 访问旧 Workspace，**不更改现有数据所有权**；正式镜像仍默认 UID 10001。统一 Go listener 在容器内监听 3777，宿主仍发布 `0.0.0.0:3777`；公开入口同时包含 Web、API 和 MCP，但它们保留独立认证。Dev 宿主的直接 HTTP 无传输加密，只用于可信受控网络；ChatGPT 通过原 HTTPS 代理访问。

Dev Compose 已配置 `KGOS_MCP_OAUTH_ISSUER=${KGOS_DEV_OAUTH_ISSUER:-https://kgos-dev.y2l.top}`，由同一个 `kgosd` 直接提供Web 集成 OAuth。HTTPS 代理必须原样转发 `/mcp`、`/.well-known/oauth-protected-resource`、`/.well-known/oauth-protected-resource/mcp`、`/.well-known/oauth-authorization-server`、`/oauth/authorize`、`/oauth/token`、`/oauth/request`、`/oauth/decision` 以及同源 Web `/`、静态资源和 Web 登录入口，并保留 Authorization 等必要 Header。Go OAuth 的 CIMD 文档验证使用受控出站 HTTP 客户端；保留宿主现有 `HTTP_PROXY` / `HTTPS_PROXY` 配置，不依赖 Node.js 网络代理。

## 2. 统一管理入口

在 Mac 的真实 KG OS 仓库下执行，**不必手工再组合 rsync、SSH 与 Compose 命令**：

```sh
cd /Users/yi/Code/KGOS
pnpm dev:mcp setup       # 一次性准备目录和配置，不初始化数据库
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

Phase 19 已将 `kgosd` 的诊断日志统一为 JSON Lines，使用可选 `KGOS_LOG_LEVEL=DEBUG|INFO|WARN|ERROR`（默认 INFO，修改后重启生效）；不能借 DEBUG 输出 Token、Cypher、Patch 或脚本正文。Docker 使用容器日志流，受控 Dev Compose 限制日志大小与文件数；正式镜像无法单独强制宿主 Docker driver 的日志保留策略。CLI 自动启动的本地 `kgosd` 由自身维护 `.kgos/logs/kgosd.log`（单文件 10 MiB，最多 5 个），`kgosd.startup.log` 保存启动地址与早期错误，不应拿它充当业务事件日志。

对当前已授权的 Instance，可通过 `POST /api/v1/system/diagnostics`（JSON 请求体 `{}`）取得进程内指标摘要；必须使用合法 Instance Bearer，或符合现有 Web Access Bearer + Boot Guard 的浏览器会话。不能用 MCP OAuth Token 调用普通 API。需要定位单次请求时，使用服务端返回的 `X-KGOS-Request-ID` 与只属于该 Instance 的安全日志关联；诊断 API 不提供原始日志下载。**Phase 19 能力已部署 Dev 并通过本地只读诊断验收；远端 CI 完成与否仍按 Phase 19 开发记录独立判断。**

入口为 `scripts/mcp-dev.mjs`，远端单机生命周期归 `scripts/mcp-dev-remote.sh`，**Go 单进程只读验收由 OpenClaw 宿主执行 `scripts/mcp-dev-accept-unified.mjs`**，Compose 归仓库根 `compose.dev.yaml`。原 `scripts/mcp-dev-accept.mjs` 仅在旧镜像回退验证时使用。这些是可重复执行的 Dev 入口，不在持久 `data/` 中保存第二套部署脚本。

### 首次初始化（仅新 Workspace）

`setup` **只准备私有目录与配置**；不猜测数据库初始化参数，不覆盖已有 Instance，不自动创建用户模型。新 Workspace 必须先写好完整的 `data/workspace/.kgos/config.toml`，再使用当前 Go 镜像执行 `kgosd init`；只有真实扩展和 Knowledge Base readiness 成功后才写入 `initialized.json`。下面是 OpenClaw 上的执行入口（需先按实际需求准备配置，不能复制测试 Provider 到生产）：

```sh
ssh openclaw
cd /data/apps/KgosDev/src/KGOS
docker compose --env-file /data/apps/KgosDev/config/compose.env -f compose.dev.yaml build mcp
docker compose --env-file /data/apps/KgosDev/config/compose.env -f compose.dev.yaml run --rm --no-deps mcp init --root /workspace
```

**已经初始化过的 Dev** 直接用 `pnpm dev:mcp deploy`，不要反复运行 `init` 或清空数据库。未来更换 Provider 配置、用户模型或持久数据须遵守现有 KG OS Runtime/Instance 合同；部署脚本不迁移或重写它们。

## 3. 可持续更新与回退

`deploy` 的固定顺序为：

1. Mac 检查自己位于 KG OS Git 工作树，读取完整 HEAD 和 dirty 状态。**允许未提交源码迭代**，但在历史中明确标记 `dirty`；这与 Nexum 的 clean-source Registry release 是不同合同。
2. 只将源码同步到固定的 `/data/apps/KgosDev/src/KGOS/`。同步保留 `cmd/`、`internal/`、全部 TypeScript 包与 Web 源码，但跳过 `.git`、`.kgos`、`.env`、`node_modules`、`native` 扩展原始源码、构建结果和缓存。`rsync --delete` 作用范围**严格限定于这个专用源码目录**，绝不用于 `KgosDev` 根或 `data/config`。
3. Idempotent `setup` 检查目录权限和 Compose 配置；不重置 Instance Token 或 DB。只有先前已初始化的 Instance 可以部署 MCP。
4. 把**当前运行容器的真实镜像 ID**保存为 `kgos-dev-mcp:previous`，并在构建前创建**SQLite 在线一致性备份**；备份失败直接停止，旧容器仍运行。
5. `docker compose build mcp` 在原服务仍运行时编译当前 Web、Go `kgosd` 并校验固定版本原生扩展和 Runtime manifest；成功后 `up -d --no-build --force-recreate mcp` 只替换 `kgos-dev` 服务。
6. 验收容器 `healthy`，确认新镜像 PID 1 为单一 `kgosd`、Dev 身份为 UID 1000、HTTP 3777 无凭证 MCP 返回 **401** 且声明 OAuth metadata。在 **OpenClaw 宿主**的只读客户端上，从当前 Instance 私有 `.kgos/auth.json` 读取唯一认证凭证，验证 Web/API/MCP 路由、OAuth metadata、认证隔离、五个 AI-facing Tool（含 `kgos_docs` 目录及批量读取）、app-only UI Tool/Resource、Preview、State 和 Ancestry；**不把 Node.js 安装进最终镜像，也不做长期 Dev 写入测试**。此前 Phase 15 的 Node `doctor` 仅作为旧镜像回退验收。
7. 全部通过后追加 `config/deployments.tsv`（UTC、revision、dirty/clean、镜像 ID）；新镜像验收失败时恢复 `previous` 并复验，仍以失败退出，不将失败发布伪装成成功。

**镜像回退不等于数据库回退。** `rollback` 只改变运行镜像，不会偷偷把新版本可能写入的数据库恢复为旧状态；数据恢复必须在停止服务后，由操作者明确选择已检查过的备份执行。仅在根本不存在先前镜像时，首次部署失败会保持未部署状态。

### 备份与恢复边界

`pnpm dev:mcp backup` 可在线运行，`deploy` 在更新前也会自动执行。用 Python 标准 `sqlite3.Connection.backup` 复制 `kgos.db`，并包含 `config.toml`、`auth.json`、`initialized.json` 和 `extensions/`；省略可重建缓存、日志与运行中 `kgosd.lock`。所有备份位于 root 私有目录并保留原文件，**不会自动清理旧备份**；定期检查磁盘使用量，删除备份需要另行明确执行。任何恢复须停止 Dev MCP/daemon，验证备份对应 Instance 与数据完整性后再进行，**没有默认自动还原**。

## 4. 常见排障与验收

从 Mac 先运行 `pnpm dev:mcp status`、`pnpm dev:mcp check`、`pnpm dev:mcp logs`；失败时分别核对 SSH、Docker/Compose、构建阶段 Node / Go 工具链、镜像仓库代理、`config/compose.env`、持久化目录 UID/权限、Instance `auth.json` 文件和单一 `kgosd` 的启动日志。构建阶段可使用 OpenClaw 已配置的镜像代理，不固化为 KG OS 产品依赖。

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

新的 Web 授权使用 5 分钟有效的**一次性请求**。若等待过久或 `kgosd` 重启，应返回 ChatGPT 重新发起连接；不再有独立 MCP 管理员 Token 输入页。Web 未登录时使用其已有认证，登录成功仍需明确批准该次连接。

只有真实 ChatGPT 客户端最终登录和调用成功后，才能把该客户端标记为通过；开发容器的内部 discovery、401 或独立 OAuth 协议测试不能替代这个证据。

需要在**不经过明文网络发送 Bearer Token**的情况下从 Mac 使用 MCP 时，仍可建立仅本机的临时 SSH 加密转发：

```sh
ssh -N -L 127.0.0.1:3778:127.0.0.1:3777 openclaw
```

Mac 使用 `http://127.0.0.1:3778/mcp` 和相应 Bearer Token 测试；结束时关闭转发。**健康检查/HTTP 401 仅是就绪证据**；本版的完整 SDK 31-method、真实 ChatGPT Tool 调用与最终 CI 分别取证，见 [Phase 16](../development/phases/16-kgosd-unified-mcp.md#当前实现与验收证据)。

### 发布前完整 MCP 验收

**Phase 16 新镜像开发测试：** 先同步源码到 OpenClaw 独立源码目录并安装冻结的 pnpm 依赖，再在 **OpenClaw 主机终端**执行 `node scripts/mcp-unified-docker-smoke.mjs`。脚本默认构建 `Dockerfile.unified`，用临时镜像和临时 Volume 运行写入/重启/持久化测试并清理，**不碰长期 Dev Instance**。可设置 `KGOS_UNIFIED_DOCKER_SMOKE_IMAGE=kgos-dev-mcp:local` 对实际部署镜像执行同样的临时 Volume Smoke，已于 2026-10-13 在 OpenClaw 通过 **31/31 SDK 方法**。**GitHub Actions CI 仍须独立重新构建并测试最终已推送源码**。

先完成对应源码工作树的本地 `pnpm validate`，再在**获得 Dev 部署授权后**通过 `pnpm dev:mcp deploy` 同步并更新当前 Dev，随后执行 `pnpm dev:mcp check` 只读确认长期服务就绪。仅凭这一步的 Preview/State/Ancestry 不足以完成写入、Stream、Merge、31 个 SDK 方法的验收。

**写入/重启/持久化验收使用 Dev 主机上的隔离容器**，不对长期 `data/workspace`、用户 Branch 或管理员 Token 做测试写入。在已同步的 Dev `src/KGOS` 下准备冻结的 pnpm 依赖，直接以**新部署镜像**执行：

```sh
ssh openclaw
cd /data/apps/KgosDev/src/KGOS
KGOS_UNIFIED_DOCKER_SMOKE_IMAGE=kgos-dev-mcp:local \
  node scripts/mcp-unified-docker-smoke.mjs
```

脚本使用当前镜像创建并清理**临时 Volume**，在真实 MCP → Go QuickJS/WASM → Kernel → Lithograph 链路验收五个 AI-facing Tool、独立文档批量读取、app-only UI Tool/Resource、31/31 方法和持久化重启。它与长期 Dev 的只读 `check` **分别验收**。构建失败先检查 OpenClaw 的基础镜像、代理、Go 和冻结依赖，不通过 Mac Docker 或旧 Node 双进程测试替代。

准备关闭 Phase 16 时记录源码 Revision/dirty 状态、Dev 部署镜像 ID、只读 `check`、隔离 31-method Smoke、HTTPS/真实 ChatGPT 调用、`pnpm validate` 和 Review 的**实际结果**。最终 Git Commit/Push 的普通 CI 验收、真实私人 Plugin/Skill 安装与旧版清理也须符合 [Phase 16 完成条件](../development/phases/16-kgosd-unified-mcp.md#完成条件)。正式 Release Tag、GHCR 和生产部署继续独立授权；**仅 Dev 已部署不代表 Phase 自动成为 `done`**。
