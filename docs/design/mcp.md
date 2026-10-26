# MCP 与私人 OpenAI Plugin

<!-- cspell:words Streamable Asyncify mcpserver -->

本文件是 KG OS **Go 原生 MCP、Tool 命名与文档接口、受控 JavaScript 执行、私人 OpenAI Plugin / Skill 与 Markdown Preview / Ancestry** 的设计真源。KG OS 业务语义不由 MCP 定义：Ontology、Object / Patch、Graph / Cypher、Evolution 分别由其设计 owner 负责；统一监听与 Instance 生命周期见 [Runtime](runtime.md)，公开 TypeScript SDK 的逻辑合同见 [Client](client.md)。

**已验收基线与当前实现（2026-10-17）**：`kgosd` 同一 Go 进程提供 Web / HTTP API / MCP，[Phase 16](../development/phases/16-kgosd-unified-mcp.md) 的 Go/QuickJS Sandbox、[Phase 17](../development/phases/17-mcp-web-authorization.md) 的统一认证、[Phase 18](../development/phases/18-chatgpt-embedded-web.md) 的 UI Tool 及 [Phase 22](../development/phases/22-mcp-self-describing-docs.md) 的 `docs.read` 已分别完成阶段验收，Phase 22 最终 CI 与 Dev 部署取得真实证据。**D102 / Phase 23 的独立 `kgos_docs`、五 Tool 与文档指南已在 `main@9cec011` 实现并部署 Dev，分支安全及 CI Race 超时回归由 `cfa3917` 修复；用户报告的真实 ChatGPT 核心链路五 Tool/31 SDK 成功（完整客户端覆盖为 `PARTIAL`），Mac 与 OpenClaw 原样 Docker 构建/31 SDK 隔离成功，最终实现 SHA 的 GitHub CI Run #39001850377 两 Job 2/2 success，Phase 23 `done`**；远端已验收实例仍以其自身运行的镜像版本为准。历史 Phase 15 `packages/mcp/` / Node.js Worker 的 Dev/ChatGPT 结果是迁移对照，不替代 Go 原生 MCP 证据。已发行 v0.2.1 npm 包不包含新的 Docker MCP 交付；私人 Plugin 可选，标准 MCP Client 可直接连接 `kgosd`。

**2026-10-14 MCP 认证目标调整（[D95](decisions.md#d95-unified-mcp-web-authorization)、[Phase 17](../development/phases/17-mcp-web-authorization.md) `done`（用户验收例外））**：MCP 不再拥有独立管理员 Token，使用同一个 Instance 认证真源；ChatGPT 的 OAuth 授权转入现有 KG OS Web，通过其登录状态及连接授权弹窗完成。**Go OAuth 路由、Web 授权弹窗和持久 Web Session 已实现并经过本地测试，相关代码现已进入 `main@8e7bf56`；2026-10-14 新版 Dev 曾完成正式 Docker 构建部署，用户确认 ChatGPT 重新授权测试成功。Phase 17 关闭时远端 GitHub CI / 最新完整隔离矩阵未执行，用户批准带例外关闭，不代表 CI 通过**。Web 登录状态由 Web/Runtime owner 负责，本文件只定义 MCP 的对接与安全合同。

## 目标与边界

- AI 使用 KG OS 时应先了解真实的 Branch / Commit / Ontology，然后按需读取和操作 Knowledge；避免每次为了取得版本及模型结构都先编写一段 JavaScript。
- 一个专门的 MCP 文档 Tool 负责首次发现和按需批量阅读公开文档；两个直接读取 Tool 负责 Ontology 与 Commit 导航；两个 JavaScript 执行 Tool 负责组合完整公共 SDK 能力。不把 SDK 每个方法机械提升为单独的 MCP Tool，也不在 MCP 定义新的知识模型、Search DSL 或事务语义。
- `kgos_ontology_overview` 提供**完整的 Ontology 只读视图，按行取窗口**；不为节省上下文而删除 Definition、Property、Constraint、Index 或关系。它不保存可编辑 Markdown、不提供文件系统路径、不产生新的数据库资源。
- AI 的模型理解、信息提炼、Commit Message 编写以及工具编排属于外部 AI / 官方 Skill；MCP 只提供确定性数据、执行与安全边界。
- ChatGPT Web 与 Desktop 为目标客户端；用户自托管自己的 KG OS Instance，私人安装自己的 Plugin。**不提交公共插件目录，不集中托管用户知识库。**

## 部署与责任划分

```text
ChatGPT / MCP Client      Browser       CLI / SDK
           │                │               │
           └────── HTTP / HTTPS ─────────────┘
                            ▼
                  kgosd（一个 Go 进程）
                    ├── /mcp + OAuth
                    ├── /api/v1/*
                    ├── / + Web assets
                    ├── Docs / Ontology Overview / Commit Ancestry（Go）
                    └── QuickJS-NG WASM（wazero）
                            │
                    受控 Go 方法 Bridge
                            ▼
                    KG OS Kernel
                            │
                    Lithograph → SQLite

私人 OpenAI Plugin
├── 用户已注册 MCP Connection 的引用
└── KG OS 官方 Skill（AI 操作流程 / SDK 用法）
```

- MCP 是 `kgosd` 内的 Go Handler，使用官方 [MCP Go SDK](https://github.com/modelcontextprotocol/go-sdk) 的 Streamable HTTP 能力；MCP 直接调用同进程 Kernel 已有的业务方法，**不经 `@kgos/sdk` 再做一次本机 HTTP 请求**，也不读取 SQLite 内表或复制 Cypher/Ontology/Version Engine。Go SDK 提供协议与 Bearer 校验基础，不能视作自动提供本产品的 ChatGPT OAuth 授权服务器。
- 每个 `kgosd` 仍只绑定一个显式 Workspace Root；MCP Tool 不接受其他 Instance Root。Phase 15 旧独立 TypeScript MCP Server / Worker 源码已在 Go 原生迁移验收后清理，历史 Git 证据保留，不作为另一套正式服务恢复。
- 统一监听地址由 [Runtime](runtime.md#统一-http--mcp-hostingphase-16-目标) 负责：默认 `127.0.0.1:0` 不变；显式配置可对外监听，并同时服务 Web、API 与 MCP。远程必须有 HTTPS / 可信安全通道，用户自行选择代理或 Tunnel；**同一 listener 不等于同一权限**：`/api/v1/*` 继续采用 Runtime 的 Instance 认证；`/mcp` 接受同一 Instance 凭证的直接 Bearer（仅供可信调用方）或基于 Web 明确授权签发的 MCP OAuth Access Token。OAuth Access Token 不得访问普通 API，外部 OAuth 客户端不得取得 Instance Token；静态 Web 不提供免认证业务 API。
- Go Sandbox 已使用 QuickJS-NG WASI reactor 与 wazero；Go Bridge 对每次方法调用强制权限与参数校验，直接执行 Kernel，保持 SDK 的公开语义。实际安全和集成证据由 Phase 16/22 分别维护，D102 工具重命名与独立文档 Handler 不得降低现有隔离保证。
- `plugins/kgos/` 继续存放官方 Skill、Plugin 模板和面向 AI 的安装说明，**不包含运行服务端**；Skill 只指导调用者，不改变 MCP 协议的直接可用性。

## 部署交付与运行合同

### Docker-only 交付

按 [D99](decisions.md#d99-linux-amd64-docker-only-distribution)，**整个 KG OS 唯一新的官方运行产物**是 **Linux amd64 Docker / OCI**，而不只是 MCP 不发行 npm。镜像名称为 `ghcr.io/<owner 小写>/kgos:v<版本>`；已经公开的 CLI / SDK / Runtime v0.2.1 保留为历史发布，不再提供后续 npm 新版本或六平台二进制。用户仍自行决定公网 HTTPS、隧道或代理接入方案。

| 形式 | 部署单元与依赖 | 使用方式 |
| --- | --- | --- |
| Linux amd64 Docker / OCI 镜像 | 自包含镜像，包含 Go `kgosd`、内嵌 Web、MCP Go Handler、QuickJS-NG WASM、Lithograph / Provider / Jieba 扩展；运行时不依赖 Node.js 或宿主构建工具 | 用户运行**一个容器、一个 `kgosd` 服务进程**即获得 Web + HTTP API + MCP；挂载持久 Workspace，只有一个对外监听端口 |

- Docker 仍只启动**一个 Workspace、一个 `kgosd` 和一个 HTTP listener**。已初始化实例提供完整 Web/API/MCP；**D105 新目标**允许没有 `config.toml` 时先启动受限 Web 初始化页面、普通 API/MCP 返回未初始化错误；预先提供完整 TOML 则在启动时自动走共享 Bootstrap/readiness 后正常提供服务。两种方式均不依赖宿主 Node.js 或镜像内 TypeScript CLI，不引入第二份配置格式，也不得跳过 `initialized.json`。重启/重建必须保留 `.kgos`、已提交的 State/Branch 与认证信息；旧版“无配置直接启动失败”仅描述尚未实施 D105 的当前运行行为。路由、状态、管理员认领与恢复由 [Runtime 首次启动合同](runtime.md#web-first-run-bootstrap) 唯一拥有；实施见 [Phase 26](../development/phases/26-web-first-run-bootstrap.md)。
- 构建时将已验证的 Go `kgosd`、Web 静态产物、固定并校验的 QuickJS-NG WASM 和匹配的 Linux amd64 native 扩展打成自包含镜像；Node.js 可用于构建浏览器资源，但不得成为镜像运行时依赖。镜像不在容器启动时下载依赖或重编 native 扩展，不依赖宿主 `kgosd` / `node_modules` / host network。
- 镜像以非 root 用户运行，能够读取只读挂载的 Secret 与证书、写持久 Volume，并在 SIGTERM 时清理同一 `kgosd` 进程及资源。宿主仅映射统一的 HTTP 监听端口；镜像对外暴露的 Web、API、MCP 各自保留认证边界。
- **验证 / 发布按 [D94](decisions.md#d94-openclaw-docker-development-and-ci) 分工**：Mac 本地只进行非 Docker 源码验证；开发阶段的 Docker 构建、独立临时 Volume 写入/重启均在 OpenClaw Linux amd64 执行，不能破坏长期 Dev Instance；**GitHub Actions PR/main CI 必须在自己的 Linux amd64 runner 构建新镜像并执行隔离 Docker Smoke**，但不推送 GHCR；获得独立 Release 授权后，从明确的 Release revision 构建**精确待发布镜像**、在隔离 Instance 中 Smoke、用 GHCR 核对版本/源码 revision/架构/digest 和实际拉取权限。正式发布与生产部署分别授权，当前没有新镜像已上传的证据。

### MCP 命令与配置优先级

```text
kgosd --root <workspace-root>                  既有本地 daemon（127.0.0.1:0）
kgosd --root <workspace-root> --host <address> --port <port>
      [--tls-cert <path> --tls-key <path>]
      [--mcp-path <path>] [MCP budgets...]
```

- **只有一个 daemon 入口**：`kgosd --root <workspace-root>` 仍按 [Runtime](runtime.md#http-bind-与-active-endpoint) 要求显式 Root，不从 `cwd`、父目录或环境猜库。容器入口可以把 `KGOS_ROOT` 翻译成实际的 `--root` 参数，不能把它变成 `kgosd` 的第二套 Root 解析合同。网络统一由 `KGOSD_*` 配置；MCP 独有选项使用 `KGOS_MCP_*`。
- **配置来源**：CLI > 对应环境变量 > 明确默认值。空值、未知参数、无效整数或互斥值应报错；`kgosd` 统一输出真实绑定 host / port / protocol，`--port 0` 只作为 bind 输入。原 `kgos-mcp serve / doctor` 不再是目标产品命令，不保留单独进程级启动/关闭/日志选项；现有 `kg doctor` 继续诊断本地 Runtime，MCP 的远程实际可用性由真实客户端验收，不能靠本地 ready 自证。

下表是 **Phase 17 当前统一认证方案的公共部署参数面**；已提交的旧 Phase 16 历史代码仍保留旧 Token 参数，但不能视为当前 Dev 合同。`mb` 表示 MiB（`1024 × 1024` bytes），所有长度/时间参数必须为有界正整数；详细取值范围以实际资源/协议能力验证并与 CLI `--help`、安装指南保持一致，不增加第二套配置文件或兼容别名。

| 分组 | CLI option | 环境变量 | 含义 / 默认值 |
| --- | --- | --- | --- |
| Instance | `--root <path>` | 无 | `kgosd` 必填；一个 Workspace / Instance |
| 统一网络 | `--host <address>` | `KGOSD_HOST` | 默认 `127.0.0.1`；可显式为 `0.0.0.0`，需安全入口 |
| 统一网络 | `--port <0..65535>` | `KGOSD_PORT` | 默认 `0`，由 OS 动态分配；Docker 可指定固定端口 |
| 统一 TLS | `--tls-cert <path>` / `--tls-key <path>` | `KGOSD_TLS_CERT` / `KGOSD_TLS_KEY` | 同一 HTTP listener 的 HTTPS；成对配置 |
| MCP | `--mcp-path <path>` | `KGOS_MCP_PATH` | 默认 `/mcp`；与 API/Web/OAuth 路径无冲突 |
| MCP OAuth | 无单独启动参数 | `config.toml` 的 `[server].public_origin` | Web/API/MCP/OAuth 共用对外 Origin；旧参数必须迁移后删除 |
| MCP 请求 | `--mcp-request-timeout-ms <n>` | `KGOS_MCP_REQUEST_TIMEOUT_MS` | 单次完整 MCP 请求墙钟上限；默认 `30000` |
| MCP 请求 | `--mcp-max-concurrency <n>` | `KGOS_MCP_MAX_CONCURRENCY` | MCP 并发上限；默认 `16` |
| MCP 请求 | `--mcp-max-request-bytes <n>` | `KGOS_MCP_MAX_REQUEST_BYTES` | 单次请求正文上限；默认 `1048576` |
| Sandbox | `--mcp-script-timeout-ms <n>` | `KGOS_MCP_SCRIPT_TIMEOUT_MS` | 一次 JS 调用含 Kernel 等待的墙钟上限；默认 `15000` |
| Sandbox | `--mcp-script-memory-mb <n>` | `KGOS_MCP_SCRIPT_MEMORY_MB` | 单 Invocation WASM/JS 内存预算；默认 `64` |
| Sandbox | `--mcp-script-max-code-bytes <n>` | `KGOS_MCP_SCRIPT_MAX_CODE_BYTES` | 单次 `code` UTF-8 bytes 上限；默认 `65536` |
| Sandbox | `--mcp-script-max-calls <n>` | `KGOS_MCP_SCRIPT_MAX_CALLS` | 单次脚本 Go Bridge 调用预算；默认 `2048` |
| Sandbox | `--mcp-script-max-streams <n>` | `KGOS_MCP_SCRIPT_MAX_STREAMS` | 单次脚本最大打开流数；默认 `32` |
| Sandbox | `--mcp-script-max-output-bytes <n>` | `KGOS_MCP_SCRIPT_MAX_OUTPUT_BYTES` | 单次 JSON 结果 bytes 上限；默认 `4194304` |
| Preview | `--mcp-preview-max-items <n>` | `KGOS_MCP_PREVIEW_MAX_ITEMS` | 完整视图对象预算；默认 `50000` |
| Preview | `--mcp-preview-cache-entries <n>` | `KGOS_MCP_PREVIEW_CACHE_ENTRIES` | 最大进程内固定视图数量；默认 `8` |
| Preview | `--mcp-preview-cache-ttl-ms <n>` | `KGOS_MCP_PREVIEW_CACHE_TTL_MS` | 缓存 TTL；默认 `600000` |

#### 参数语义与安全约束

- Phase 17 完成后，`/mcp` 随已就绪的 `kgosd` 和已有 Instance 认证正常提供，不再以另一份 MCP Secret 作为开关；未完成初始化、Instance 凭证无效或不可读取时仍按 Runtime 规则 fail closed，绝不降级匿名。`--mcp-token-env`、`--mcp-token-file`、`KGOS_MCP_TOKEN`、`KGOS_MCP_TOKEN_ENV`、`KGOS_MCP_TOKEN_FILE` 从配置合同删除；显式提供已废弃 CLI/环境配置应报错。OAuth 仅由实例 `config.toml` 的 `[server].public_origin` 启用；旧实例未配置本字段时可信本机 MCP Client 仍可使用原 Instance Bearer。任何凭证都不进入 URL、日志或诊断消息。
- `--tls-cert` 与 `--tls-key` 为**整个 `kgosd` HTTP listener**成对配置；未提供时使用 HTTP，仅适用于可信本机或可信的 TLS 终止代理 / Tunnel。`--host 0.0.0.0` 会将 **Web、API、MCP** 一起绑定到外部接口，不是“只公开 MCP”；代理可以限制允许转发的路由，但 `kgosd` 不内建网络 Gateway。API 继续要求 Instance Bearer，OAuth Access Token 不能调用 `/api/v1/*`，静态 Web 不提供免认证的数据旁路。
- MCP HTTP 对所有方法校验携带的 `Origin`：只接受单个有效的同源值，或实例 `[server].public_origin` 的精确值（支持 TLS 终止代理改写上游 Host）；空值、多值、`null` 和其它来源返回 403，并沿用 Web 对非同源 `Sec-Fetch-Site` 的拒绝规则。无 `Origin` 的非浏览器 MCP Client 可以继续调用，但仍须通过原有 Bearer/OAuth 认证。GET、HEAD、OPTIONS 不豁免此校验。
- 总 `--mcp-request-timeout-ms` 覆盖服务端收到 MCP 请求到最终响应的时间；`--mcp-script-timeout-ms` 覆盖 JavaScript 与等待 Kernel 调用，先触及者终止相应执行。大小 / 并发限制在排队前有界生效；单 Invocation WASM memory pages、QuickJS heap/stack、CPU 中断、模块关闭与内部 Bridge 数据预算也必须有界。失效或取消的脚本不得继续接收回执和调用新的方法；已发送到 Kernel 的写入仍可能已生效，不能承诺自动回滚。
- Preview 资源预算与目标 Tool `kgos_ontology_overview`（当前实现名 `kgos_preview`）的**固定行窗口合同**独立：配置改变的是容量和缓存寿命，不改变 `offset/limit/viewRevision`、完整 Ontology 或不截断原文的保证。缓存依旧按认证调用者和 Instance 隔离，驱逐后的 revision 返回 `VIEW_EXPIRED`。
- 复用原有 `kg doctor` / `kgosd` 就绪诊断，不保留独立 `kgos-mcp doctor` 运行时；本地 Ready 不代表远程地址、OAuth 或真实 ChatGPT 已连通。结构化错误和日志不回显 Secret、JavaScript 宿主堆栈或本地令牌。
- MCP Tool、OAuth、安全事件和跨 Sandbox/Kernel 的请求关联只接入 [Observability 统一日志合同](observability.md)；不增加 Tool 级持久执行账本，也不以 Tool 终态改写此前已提交的 Kernel 写入结果。

<a id="单管理员-chatgpt-oauth-认证"></a>

#### 统一 Instance 认证与 Web 内的 MCP 连接授权（Phase 17 目标）

##### 身份与能力边界

- **唯一根凭证**：继续使用 Runtime 已有的 `<workspace>/.kgos/auth.json` Instance Token，不创建 MCP 管理员 Token、用户表、密码、独立身份供应商或第二份认证配置。Web 登录状态由 Web/Runtime 的既有认证 owner 提供，MCP **只消费服务端已验证的 Web 登录上下文**；不定义 Web Session 的创建、Cookie 方案、持久化、跨标签同步或登录 UI。
- **两种协议凭证、一套根身份**：`/mcp` 可识别现有 Instance Bearer（仅供用户自己管理的可信客户端）及经 Web 明确批准签发的 MCP OAuth Access Token。二者映射到同一个 Instance 的完整 MCP 能力，但 OAuth Token **仅可用于 MCP**；OAuth Client 永不收到 Instance Token，也不能使用 Web 登录态/Cookie、OAuth Token 调用 `/api/v1/*`。直接向不可信第三方提供 Instance Token 也会授予其普通 API 全权限，**ChatGPT 必须使用 OAuth 路径**，不得用直接 Bearer 替代浏览器授权。
- **启动与部署**：MCP 随已认证可用的 `kgosd` 提供，不因未配置独立 MCP Token 而关闭。新版初始化将 HTTPS Origin 写入 Instance `config.toml` 的 `[server].public_origin`，OAuth Issuer/Resource 均从此唯一真源加载；仅本机 loopback 允许 HTTP。旧实例缺此分组可继续提供直接 Bearer MCP，但 OAuth 不启用，须明确迁移并重启；旧 `--mcp-oauth-issuer` / `KGOS_MCP_OAUTH_ISSUER` 启动入口拒绝以避免两份真源。Origin 不自动创建公网接入、证书或 Tunnel；MCP Endpoint 仍是 Origin + `--mcp-path`。
- **公开 Web 入口要求**：OAuth 的浏览器跳转依赖同一 HTTPS origin 的 **Web `/`、Web 静态资源与 Web 认证入口**均真实可达；只代理 `/mcp` 和 `/oauth/*` 而不转发 Web 不能完成授权。HTTPS 代理还须正确保留 OAuth discovery 路径、请求方法和必要认证头；不得用静态文件匿名可读推断可绕过 Web 业务认证。
- **权限呈现**：`kgos:access` 仍授予当前 Instance 的 MCP **完整读写能力**（目标 `kgos_mutate` 可修改或删除知识），新增 `kgos_docs` 不新增 OAuth Scope、细粒度角色或隐式授权；连接授权弹窗必须明确展示读写权限。Web 登录成功只证明身份，**不等于授权外部 Client**。现行四业务 Tool/未来五 AI Tool 的数量是版本状态差异，不是身份或授权模式变化。

##### 从 ChatGPT 跳转到现有 Web

1. ChatGPT 访问 `/mcp` 时可收到 HTTP 401 + `WWW-Authenticate: Bearer resource_metadata=...`；启用 issuer 后，`/.well-known/oauth-protected-resource` 与 `/.well-known/oauth-protected-resource<mcp-path>` 返回一致的资源 metadata，`/.well-known/oauth-authorization-server` 暴露真正实现的 Authorization Code、PKCE S256、`none` public-client 与 CIMD 能力。`resource`、`issuer` 与 `kgos:access` 一致绑定。授权与交换仍使用 `/oauth/authorize`、`/oauth/token`，由**同一 `kgosd` Go 进程**提供。
2. `GET /oauth/authorize` 先完整校验 `response_type=code`、`client_id`、`redirect_uri`、`state`、`resource`、`scope`、`code_challenge` 与 `code_challenge_method=S256`；仅允许从 `https://chatgpt.com/oauth/client.json` 或 `https://chatgpt.com/oauth/<id>/client.json` 读取可信 CIMD，验证精确的 `client_id`、`redirect_uris` 和 `none` 声明，不接受任意 URL、开放 DCR 或未验证的回调。先验证后创建有界、短效、随机不可猜的**待授权请求**，其中保存验证过的 OAuth 参数，不生成 code。
3. Go 返回 `303` 跳转到**已有 KG OS Web 应用**的同源入口 `/?mcp_authorization=<request_id>`；此 URL 只携带授权请求引用，不包含 Instance Token、OAuth code、`state`、PKCE verifier 或任意回调地址。Web 使用原有应用框架、主题及现有认证组件，在工作区上方显示**连接授权弹窗**，不得再由 Go 输出独立授权 HTML/第二个登录页。
4. Web **已经登录**时直接显示授权弹窗；**尚未登录**时先使用 Web 自己的认证交互，成功后仍在同一个待授权请求中显示弹窗。无需第二次输入管理员 Token。MCP 不负责决定 Web 如何跨页面保存登录状态；如尚不能在此次跳转中复用登录状态，属于 Web 登录模块未满足集成前置，不允许 MCP 私自创建备用 Session 或要求再输入一个 MCP Token。
5. 弹窗至少显示经过验证的客户端名称（无法取得可信名称时显示已验证 `client_id`）、当前 Instance/资源地址及**可读、可写**权限，并提供明确的「授权连接 / 拒绝」。不能由任意请求参数伪造客户端名称或权限，不能因登录成功、刷新或已授权过同名客户端而自动同意。
6. 用户同意后，Go 消耗一次性请求并签发短效 authorization code；Web 将浏览器导向**预先验证的** ChatGPT `redirect_uri`，附带原样 `state` 和 `iss`。用户拒绝时返回该回调的 `error=access_denied`（保留 `state/iss`），不签发 code/token。两条路径均回到 ChatGPT；过期、重复提交或验证失败不授权，Web 解释失败并让用户重新从 ChatGPT 发起连接。

##### MCP 与 Web 的最小接口合同

| 接口 / 入口 | MCP 责任与返回 | 安全要求 |
| --- | --- | --- |
| `GET /oauth/authorize` | 校验 OAuth 请求，保存待授权上下文，`303` 到 `/?mcp_authorization=<request_id>` | 未校验 Client/redirect/resource 不建单；请求 ID 本身**不是授权凭证** |
| `GET /oauth/request?request_id=...` | 返回已验证的 `client_id`、可展示名称、`resource`、固定 `scope`、`canWrite=true` 与 `expires_at` | **必须通过 Web owner 的已登录校验**；未登录返回 401；失效/未知同类失败；不返回原始凭证、`state`、code 或任意客户端回调 |
| `POST /oauth/decision` | Web 传 `{request_id, decision: "approve" \| "deny"}`，成功返回 `{redirect_url}`，由 Web 执行顶层导航 | **必须通过相同 Web 登录校验与其 CSRF/同源写入防护**；校验本次 Instance、一次性、未过期；Client/redirect/scope 只能从 Go 保存的请求取得，不能由 Web 提交覆盖 |
| `POST /oauth/token` | 处理 `authorization_code` 与 `refresh_token` 的标准 OAuth 交换/轮换 | 验证 client/resource/redirect/PKCE、一用即销、有效期和 Scope；不接受 Web Session 替代 OAuth Client 凭证 |
| `/mcp` | 使用现有 Instance Bearer 或有效 OAuth Access Token 调用当前 Tool 集；D102 目标为五个 AI-facing 加一个 app-only UI Tool | 同一 Instance、MCP audience/scope/expiry；浏览器登录 Cookie 不能直接调用工具，OAuth Token 不能访问普通 API |

接口返回只包含页面呈现和跳转所需字段；`redirect_url` **只能**由服务端依据先前验证的 Client 回调生成，Web 不拼接或接收任意跳转目标。授权数据响应使用 `Cache-Control: no-store` 与 `Referrer-Policy: no-referrer`，不加载第三方资源；在未登录的 Web 中，Go 不能泄露授权详情，也不能在前端缓存请求以绕过校验。授权操作只由服务端基于**当前有效的** Web 登录上下文判断，读取授权详情不授予批准权限。浏览器登录校验与 CSRF 接口的具体实现由 Web 认证 owner 确定，MCP 不创建第二套 Session 存储或 CSRF 机制。

##### OAuth Token 生命周期与恢复

- Go 继续使用随机高熵、**不透明**的 Access/Refresh Token，服务端仅持有摘要及 client/issuer/resource/scope/有效期关联；`/oauth/token` 必须检查单次 code、同一个 `client_id`、完全相同的 `redirect_uri`、`resource` 和 RFC 7636 `code_verifier` S256。Refresh Token 限时且轮换后旧值立即失效；Access Token 只接受指定 MCP audience/Scope。
- 保留目前的有界进程内 OAuth 授权状态，不新增 OAuth 数据库、用户表或 Token 持久化：授权请求 5 分钟、Code 1 分钟、Access Token 1 小时、Refresh Token 30 天；`kgosd` 重启后旧 OAuth Token 失效，需要客户端重新走 OAuth，**Web 已登录的用户只需再次确认授权**。Instance 根凭证的生命周期仍由 Runtime 负责，OAuth 不主动修改 `auth.json`。
- Web 退出登录仅终止 Web 自己的登录状态，**不自动撤销此前已经批准的 MCP OAuth Grant**；现有授权仍受 Token 到期、Refresh 轮换及 `kgosd` 重启失效约束。本 Phase 不扩展为连接管理/撤销页面或单独的 Grant 持久化系统。
- 所有授权查询/决定、Token 交换必须有体积/数量/时间限制；禁用跨源调用、缓存、开放跳转、重放和重复同意。`request_id` 即使被复制或泄露，也只能定位待授权请求，**不能绕过有效 Web 登录及显式同意**。除了经 TLS 保护的授权 code 回调，不把任何 Token/code 放进 Web URL、日志、错误或持久 UI 状态。MCP 未认证拒绝与 OAuth 错误保持最小且无秘密差异。

本节**只拥有 MCP 授权请求、OAuth 协议、凭证隔离及与 Web 的接口合同**。Web 登录/Session、通用认证弹窗实现和前端登录生命周期属于 Web/Runtime owner；MCP 只消费其已认证状态并提供连接授权所需数据与动作。Phase 17 MCP 认证代码已通过本地 Web Session Handler 集成与浏览器模拟验收，Dev 正式 Docker 构建及只读自动验收通过，用户也确认真实 ChatGPT 重新授权成功；未执行的 GitHub CI / 完整隔离矩阵不能记为通过。Phase 17 `done` 是用户明确批准的关闭例外，不等于正式发布或生产就绪。

### 首次使用与验收边界

1. 用户通过 Linux amd64 Docker 镜像取得**完整可运行**的 MCP 部署单元。全新 Workspace 先在容器内按已有 `kg init` 明确提供初始化配置，现有 Workspace 直接复用；两种情况均使用持久化 Instance，不需要宿主机安装 daemon。
2. 运行**唯一 `kgosd` 服务**，其同一端口直接提供 `/mcp`、`/api/v1/*` 和 Web；目标认证使用已有 Instance 凭证及 `[server].public_origin` 加载的 OAuth Issuer、统一 TLS，动态端口打印实际地址。不再提供独立的 `kgos-mcp serve/doctor` 或第二个内部 daemon。
3. 用户**自行**配置远程 HTTPS 地址、隧道或其它客户端支持的安全接入通道。服务本地 `listening` / `kg doctor` Ready 仅表明本地就绪；**远程部署完成**要求目标 MCP Client 经真实地址/通道完成认证、与当前实际版本一致的 Tool 清单发现及调用，并证明暴露的 API/Web 路由没有新增认证旁路。
4. Linux amd64 Docker 镜像必须通过干净构建、唯一进程 / listener、真实初始化/连接、持久数据/重启、固定/动态端口、TLS 两种终止位置、三类入口认证隔离、不同 Instance、Sandbox 安全与流式/取消等验收；验证无需 Node.js 运行时、宿主 `kgosd` 或 host networking，并通过非 root / SIGTERM 测试。Dev 成功不等于 OCI Registry / Plugin 已正式发布。

## ChatGPT MCP Apps UI 合同

**目标；UI Tool/Resource 已实现，用户已在真实 ChatGPT 中验收两种入口**：在现有单进程 Go MCP Server 中增加一个只负责打开工作区的 UI 入口 Tool 与一个 MCP Apps UI Resource。React 页面/双入口复用由 [Web owner](web.md#chatgpt-内嵌-webmcp-apps) 维护，静态产物交付归 [Runtime](runtime.md#web-hosting)。这不是新的 Knowledge 业务 Tool，不增加 Kernel / Lithograph / SDK 的业务语义。

**入口及资源**：

- 初版资源 URI 为 `ui://kgos/workspace/v1`，`resources/read` 返回 `text/html;profile=mcp-app` 的自包含 HTML（含从 `packages/web` 构建的脚本与样式）。改变不兼容 UI 内容时更新 URI 版本以避免旧缓存误用。
- 一个专用 `kgos_workspace` Tool 的入参必须允许空对象 `{}`；`_meta.ui.resourceUri` 指向上述资源，`_meta["openai/ui"].entrypoints` 同时声明 `{"type":"global"}` 与 `{"type":"thread"}`。用户从左侧主导航或会话内容标签打开的都是同一 UI，实现上分别创建自己的宿主实例；不能承诺宿主固定采用左右分屏。Tool 具备可读 Title、合规单色图标和真实只读注解。
- `kgos_workspace` 的 `_meta.ui.visibility=["app"]` 限制它只服务应用入口；OpenAI MCP Extensions 规定入口触发时不受通常的模型可见性限制。**Phase 23 已交付版本** 的 `tools/list` 注册五个 AI-facing（含 `kgos_docs`）+ 一个 app-only UI Tool，共六项；Phase 22 历史部署镜像曾为四个 AI-facing + 一个 app-only，不能混为同一运行版本。无法解释该扩展的普通 MCP Client 仍能使用五个新 AI-facing Tool，但不应错误地把工作区 UI Tool 当作业务操作。

**接入与安全**：

- 使用仓库已有 `github.com/modelcontextprotocol/go-sdk`：`Server.AddResource`、`Tool.Meta`、`ResourceContents.Meta` 可以承载资源、UI 元数据与 CSP。Go `internal/mcpserver` 在当前 `/mcp` 内注册 Resource、入口 Tool 和 Handler；不新增 Node/TypeScript MCP Server、HTTP Listener、插件代理或知识网关。TypeScript 仅负责前端内的 Bridge。
- MCP Apps iframe 优先使用标准 `ui/initialize`、`ui/notifications/initialized`、`ui/notifications/tool-result`、`tools/call`；首屏消费已有入口 Tool 返回结果，不重复调用入口工具。验证真实数据时经宿主的 Bridge 调用本地 Phase 23 新名称 `kgos_query`，执行固定只读代码访问 `evolution.overview()`。Host 负责转发已授权 MCP 调用，Go 每次均验证身份，前端**不接收、不保存** Instance Token、临时 Web Bearer、OAuth Code/Access/Refresh Token。后续写入 UI 必须由用户明确触发并遵守 `kgos_mutate` 权限、宿主确认、取消及未知写入结果规则。
- 初版资源不以 iframe 嵌套 KG OS 普通 Web URL，不申请 `frameDomains`、外部脚本 CDN 或跨站 `/api/v1/*` fetch；按实际需求提供最小 `_meta.ui.csp`。静态资源可装载不意味着业务数据免认证；`resources/read`、`tools/call` 均走现有受保护 `/mcp`。ChatGPT MCP OAuth 仍由 [D95](decisions.md#d95-unified-mcp-web-authorization) 的普通浏览器 Web 完成登录及明确连接同意；OAuth Token 不可调用普通 API。连接失效、取消授权、断网或 daemon 重启时停止请求，提供安全的重连/刷新提示，不重试结果不明的写入。
- OpenAI 规范提供 `global` 与 `thread`，但不能据此声称所有 ChatGPT 客户端/账号均可使用；当前平台说明区分 ChatGPT Work Web 与 classic ChatGPT。必须在实际支持入口的客户端验收，未支持 UI 入口的客户端依旧使用当前版本的普通 AI-facing MCP Tool 和 Web。官方证据见 [OpenAI MCP Apps 研究](../research/chatgpt-mcp-apps.md)，旧版实现与验收归 [Phase 18](../development/phases/18-chatgpt-embedded-web.md)；D102 新名称的 Bridge 回归归 [Phase 23](../development/phases/23-mcp-tool-taxonomy-and-docs.md)。

## MCP 工具边界

**D102 / Phase 23 已交付合同**：Tool 公开名称按 AI 的意图统一，文档读取从 Sandbox 分离。单个 `kgosd` 的 `tools/list` 对 AI 展示**五个** Tool，另保留一个 app-only UI Tool；不改变四个原有业务操作的输入、结果和底层执行语义。

| 新 Tool | 原 Tool | 输入 | 职责与权限 |
| --- | --- | --- | --- |
| `kgos_docs` | 新增 | `paths?: string[]` | 目录与单/多篇构建期 Markdown 文档的只读访问；不进入 Sandbox |
| `kgos_ontology_overview` | `kgos_preview` | `offset?`、`limit?`、`viewRevision?` | 全 Branch 的 Ontology 完整 Markdown 视图及稳定行窗口；只读 |
| `kgos_query` | `kgos_read` | `code: string` | 执行允许的**所有只读 JavaScript SDK** 方法与组合计算，并非 Cypher-only；只读 |
| `kgos_mutate` | `kgos_run` | `code: string` | 执行可读写的 JavaScript SDK 方法与组合计算，包含读取；可能提交或删除数据 |
| `kgos_commit_ancestry` | `state_ancestry` | `root`、`limit?`、`cursor?` | 指定 Root 可达的 Commit DAG 与完整原始 Message；只读、分页 |
| `kgos_workspace` | `kgos_workspace` | `{}` | ChatGPT MCP Apps 打开 Web；`_meta.ui.visibility=["app"]`，非普通 AI-facing Tool |

- 这是**有意的不兼容 Tool 名称迁移**：新实现的 `tools/list` 不再注册 `kgos_preview`、`state_ancestry`、`kgos_read`、`kgos_run` 等旧名称，也不提供旧 Tool 别名、第二套 API、批量单方法 Tool 或新的 MCP Resource。旧名称只出现在设计迁移映射与历史阶段证据中。
- `kgos_query` 继续只允许现有 **15 个 Read SDK 方法**；`kgos_mutate` 继续允许 **15 Read + 16 Write**。原有单次脚本非事务、资源预算、Go Bridge allowlist、取消与不确定写入规则不因名称变化而改变；Tool Description、`code` Schema 与 MCP `readOnlyHint`/破坏性注解必须准确区分二者，服务端仍强制权限。
- `kgos_ontology_overview` 与 `kgos_commit_ancestry` 的 Markdown/窗口/游标/State pin 合同完全复用下文；名称更改不把前者扩展为 Knowledge 全库预览，也不把后者扩展为任意历史查询。`kgos_workspace` 的 UI Resource URI、MCP Apps `global/thread` 入口与 app-only 可见性原样保留。
- 五个 AI-facing Tool 的英文名称、Title、Description 与输入 Schema 均从任务角度说明使用时机。`kgos_docs` 的描述直接写明“省略 `paths` 查看目录；数组一次读多篇”；其他工具用一句话引导先查 `kgos_docs`，不重复 31 个 SDK 签名。统一 Server Instructions 只保留安全、真实 State 与未知写入结果的跨工具原则，不假设所有客户端都自动刷新缓存。

<a id="mcp-tool-help"></a>

### MCP 统一自描述文档（D102 / Phase 23 目标）

**历史发布与当前实现分离**：Phase 22 已在提交 [`96c2bc8`](https://github.com/bYiyLi/kg-os/commit/96c2bc81abfda19aaf957fa1bdb904ef3010e2fb) 中以 `docs.read(path)` 交付 31 方法、类型、Cypher 25 与 Guides，且最终 Docker CI 2/2 通过；Dev 已完成该版本部署。**本节 D102 合同已在 Phase 23 交付：新版 Dev 自描述文档与只读认证验收、用户报告的修复后真实客户端五 Tool/31 SDK 核心链路、OpenClaw 原样 Docker 隔离测试及最终实现 SHA 的 GitHub CI 2/2 均已核实**；不能以 Phase 22 的旧镜像验收代替新接口实证。[Phase 22](../development/phases/22-mcp-self-describing-docs.md) 和 D100 保留原始完成证据。

**独立可用性**：任何已认证、可发现 MCP Tool 的客户端，无需 Skill、私人 Plugin、仓库文件或外部网站，直接使用 `kgos_docs` 读取完整 SDK/Cypher/Guides 文档，再使用相应业务 Tool。文档由 Go Handler 直接读取构建期内嵌清单，不调用 JavaScript Sandbox、Kernel 或 HTTP SDK；文档既不是任意主机文件，也不是 Knowledge 数据。Skill 只可选提供外部工作流建议。

#### 唯一文档 Tool 与批量读取

`kgos_docs` 作为 MCP `tools/call` 的独立 Tool（不是 JavaScript 全局方法）：

```ts
type DocsInput = {
  paths?: string[];
};

type DocsOutput = {
  documents: Array<{ path: string; content: string }>;
};
```

- 仅接受可选的 `paths` 数组，不同时提供 `path` 字符串、`mode` 或额外字段。输入 `{}`、`{"paths":[]}` 都等价于 `{"paths":["index.md"]}`，返回**一篇完整的**任务导航首页；显式非空数组按提交顺序返回全部指定文件，每篇提供准确虚拟 `path` 与完整 Markdown `content`。一个文件也使用数组，且始终返回同样的 `documents` 结构。Go MCP Tool 以一个 JSON 文本结果返回 `DocsOutput`，不再套 JavaScript 的 `{"result":...}` 外壳。
- 非空 `paths` 长度为 `1..32`，仅接受大小写精确匹配构建期白名单的 POSIX 相对 `.md` 文件路径；拒绝重复、空字符串、非字符串、`null`、绝对路径、路径穿越、反斜杠、URL、query/fragment、未知路径和额外参数，返回不泄露宿主路径的 `INVALID_ARGUMENT`。不把无效输入降级成首页，不读取任意工作区文件、Instance 数据库、网络或 Secret。
- **整批原子返回**：只要任一路径无效或读取失败，整个 Tool 调用失败，不能先返回前几篇；各文档按源文件完整返回，禁止裁剪、摘要或静默分页。**所有请求（包括默认首页）**的序列化 JSON 结果（含路径/包装）最多 **4 MiB UTF-8 bytes**，超限返回 `RESOURCE_ERROR`，引导调用方按目录拆分 `paths` 重新请求；复用现有数量级的静态资源预算，不新增用户配置项、持久缓存或全文检索引擎。认证和 MCP 请求超时/取消/并发边界沿用现有 `kgosd`。
- 业务 Tool 的 `code` 不再暴露 `docs.read` 或 `help`，它们不是 31 个 SDK 业务方法，也不得作为兼容别名保留。文档浏览只能通过 `kgos_docs`，不新增 `docs.list`/`docs.search`、MCP Prompt/Resource 或第二个 HTTP 文档路由。

#### AI-first 总目录与跨文档导航

首页 `index.md` 不只是文件列表，还要有简短的**任务→推荐文档路径数组**与操作引导：文档路径未知时先读目录，已知路径可直接读取；从空 Ontology 建模批量读 `guides/ontology.md`、`guides/objects.md`、`sdk/ontology/patch.md`、`sdk/types/PatchRequest.md`；知识数据修改读 Object/Patch；图查询读 Graph/Cypher；版本与合并读 Evolution；搜索读 Cypher Search；处理错误读 Guides Errors。直接使用 `kgos_docs` 的 `paths` 参数批量读取相关文件，然后调用 `kgos_query` 查询、`kgos_mutate` 修改；不要把 `kgos_docs` 当成 JavaScript 全局函数，也不要凭领域经验猜 API/参数或 Cypher 25 行为。

Guide 和 SDK 方法页按当前任务给出准确路径与读取条件；已读且连接/版本适用的文档可复用，不要求返回目录或循环互读。只读、写入、Merge、Streaming 分别路由，已知方法可直接读方法/类型页；安全前置必须在操作前可达，不能延迟到错误发生后。SDK 方法页经现有生成流程维护，不手改生成的 Markdown。`guides/ontology.md` 必须提供合法 Node、Relationship、Property、Constraint、Index 及其从**空 Ontology** 创建的可执行流程；`guides/objects.md` 维护公共 canonical Git Extended Diff 的 create/update/delete/rename/batch 与 stale/mismatch 错误恢复示例。两份 Guide 引用 [Ontology](ontology.md#公共可编辑格式) 和 [Object](object.md#object-公共调用合同) 的唯一设计真源，不发明另一种 Schema、Patch、事务或顶层 API。

文档示例保留独立的“调用 `kgos_docs` 获取资料”和“交给 `kgos_query` / `kgos_mutate` 的 JavaScript 函数体”语法边界。`index.md` 与 `guides/index.md` 的任务导航必须在真实 `tools/list` / `tools/call` 中可直接发现、可批量读取；生成器校验所有引用路径、示例与目录可达性。

#### 内容与唯一责任

| 虚拟路径 | 内容 | 责任与来源 |
| --- | --- | --- |
| `index.md` | AI 任务→批量推荐阅读路径、五个 AI-facing Tool 的使用边界、SDK/Cypher/Guide 导航与版本 | MCP |
| `sdk/index.md`、`sdk/<namespace>/<method>.md` | Sandbox 允许的 **15 Read + 16 Write = 31** 个方法，含权限、签名、参数、类型、返回值、错误/副作用与示例 | SDK TypeScript 方法/类型 + TSDoc；MCP 生成 |
| `sdk/types/index.md`、`sdk/types/<Type>.md` | 上述方法实际引用的全部公共类型目录、类型与嵌套字段 | SDK TypeScript 类型 + TSDoc |
| `cypher/index.md`、`cypher/*.md` | KG OS 实际集成版本可执行的 Cypher 25 语言、函数/Procedure、限制与例子 | KG OS 自有用户手册；Lithograph 拥有数据库语义 |
| `guides/index.md`、`guides/*.md` | State pin、Graph、Object Patch、Evolution/Merge、流式、错误/未知结果等组合任务 | KG OS MCP 使用指南；规则引用领域 owner |

**SDK 文档构建**：从 `packages/sdk/src/client.ts` 的公开方法与 `types.ts` 的 Request/Result/类型及补齐的 TSDoc 注释自动生成 Markdown。TypeDoc 提取类型与注释，现有对象字面量/箭头函数 namespace 可使用最小 TypeScript AST 映射，不能假设 TypeDoc 默认会识别全部 31 个方法。生成器与 Go Sandbox 实际 read/write 白名单比对，强制覆盖全部 31 个方法、嵌套类型、每个输入/输出字段以及有约束的 Ref、Merge 等类型；缺字段说明、签名漂移或失效引用时 CI 拒绝。不要手抄第二份签名、Request/Result 或元数据目录。

**MCP 视角而非 HTTP Client 视角**：SDK 方法示例是可直接交给目标 `kgos_query` 或 `kgos_mutate` 的异步 JavaScript 函数体，直接使用 `ontology/object/graph/evolution`，明确 `return`，不要求 `new KGOSClient()`、`import`、Endpoint、Token 或 Node API；文档调用示例则使用独立 MCP `kgos_docs` 的 `paths` 参数，**不是放在 JavaScript 里的方法调用**。只为 Sandbox 实际可调用的方法生成方法目录；外部 HTTP Client 的 `system`、`web`、Client 构造等不属于此目录。文档可以介绍写入方法，但 `kgos_query` 仍不能执行它。Ref / Merge 类型只准确映射现有服务端合同，不重写 Kernel 校验。

**Cypher 手册归属**：由 **KG OS** 编写、维护和验收适配 MCP 的独立使用手册，源码位于 `docs/guide/mcp-cypher/`，构建为虚拟 `cypher/`。参考固定版本 Lithograph 的 Cypher 25 文档、兼容矩阵及运行时函数/Procedure inventory，独立编写面向 `graph.query/execute/stream*` 的示例与限制；不直接复制整套上游文字、不创造 KG OS 方言、Parser 或执行白名单。覆盖实际可用的语法、Pattern/Path、类型/表达式、聚合、读写、Schema/Index、搜索、Procedure、版本与事务、错误及诊断，并准确区分底层 SQLite SQL、Cypher 和 JavaScript。Neo4j Server 管理命令、外部 Procedure 或未支持的功能不得误列为可用。

**版本绑定**：手册标注且校验真实装载的 Lithograph 版本及 `CY25-2026.08` 等相应兼容 Profile。当前源码按 [D103](decisions.md#d103-lithograph-v033-upgrade) 对齐 **v0.3.3**；升级验证与交付状态由 [Phase 24](../development/phases/24-lithograph-v033-upgrade.md) 维护。此前 [D101](decisions.md#d101-lithograph-v031-upgrade) 的 v0.3.1 / Phase 22 源码、正式 Docker CI 与 Dev 部署是保留的历史证据，不能替代 v0.3.3 验收。每个镜像须嵌入与自己实际装载版本一致的手册，不能仅凭文档版本号推断运行时实际版本。每次升级底层必须与 KG OS Cypher 手册、函数/Procedure、示例及验证**同一变更同步**；不因上游网站增加内容就默认为已经支持。Lithograph 仍是执行语义唯一真源；KG OS 手册只负责 MCP 用户说明。

**指南与验证**：操作指南引用 Ontology/Object/Graph/Evolution 各 owner，不另立业务合同。单一构建流程生成只读 Markdown 清单并嵌入 Go，检查版本、31 方法/类型、文档链接、格式和 stale 产物；最终 Docker 不需要 Node/TypeDoc 或联网。全部 MCP JS 示例和 Cypher 示例在真实 Go/WASM + 对应 Lithograph 的**隔离临时 Instance** 验证结果/错误；测试路径穿越、未知文档、资源超限、权限拒绝和取消，不在长期 Dev 写测试数据。真实无 Skill 客户端需能仅通过 `tools/list` 找入口并按需读取；文档检查通过不等于已经证明模型工具选择效果。

**本阶段清理**：Phase 22 已移除旧 TypeScript/Go `help(name?)` 和双份 Help 产物；D102 进一步移除 Sandbox `docs.read` 与旧 Tool 名称及其当前提示/测试，不改写 Phase 20/22 历史记录。HTTP SDK 的 31 个业务方法、Go Kernel/Lithograph、四种原有业务操作的权限合同不变；对外可见的 AI Tool 数量因新增 `kgos_docs` 从四个增为五个。

### Phase 20 SDK Help（已交付旧版本的历史合同）

> 以下仅记录 Phase 20 的**历史接口与验收事实**，不是当前或目标 MCP 工具接口。Phase 22 已正式实现、提交、完成两项 Docker/Validate CI 并部署 `docs.read`；D102 的后续新合同见上文，旧 `help()` 和旧 Tool 名称不得被误认作当前目标 API。

- 四个业务 Tool 的英文 `title` / `description` 应准确说明**使用时机、操作类型、主要输入与限制**，不复制 31 个方法的完整定义；`kgos_workspace` 仅是 app-only UI 打开入口。JSON Schema 参数各自描述类型、必填性、缺省、范围及分页语义；与现行 Go 真实校验一致。只读 Tool 不标为 destructive，`kgos_run` 标记可能破坏，不能把 Tool 注解当权限强制机制。
- `kgos_read`、`kgos_run` 的异步 JavaScript 函数体都提供**无前缀全局 `help(name?)`**，调用 `return await help()` 获取目录，调用 `return await help("evolution.state.create")` 获取方法详情。Help 只查询**当前 MCP 沙箱支持的 15 Read + 16 Write 公共方法**，包括写入方法的帮助信息；两种 Tool 都可以读取全部帮助，但 `kgos_read` 仍无法执行写入方法。Help 本身不接触数据库、不改变 State、不泄漏凭证或宿主内部实现，也不需要新 Tool / HTTP Route / 网络服务。
- 无参目录按方法名称稳定排序，逐项给出 `name`、`description`、`access`（`read|write`）；带方法名的详情返回 `name`、`description`、`access`、`signature`、`requestType`、`returnType`、`typeDefinitions`（TypeScript 公共类型及依赖的完整声明）、`example` 和必要 `notes`。未提供参数时只返回目录；非法方法名、参数类型或多余参数返回明确且无敏感内容的参数错误，不猜测最近似方法或退回全量列表。
- **唯一接口真源**是 `packages/sdk/src/client.ts` 的方法签名和 `packages/sdk/src/types.ts` 的公共类型；对应业务行为仍分别归 Ontology/Object/Graph/Evolution owner。最小手工维护内容只包含方法用途、示例和真正影响调用的约束。构建工具提取 SDK 类型关系、校验 31 个 MCP 允许方法与 SDK 一致，并生成同一版本的 TypeScript SDK 和 Go Sandbox 所用帮助数据；拒绝缺失方法、过期类型、未同步产物，**不手工维护第二份 Request/Result 定义**。
- TypeScript 调用方可从 `@kgos/sdk` 引入同步本地 `help(name?)`；MCP 沙箱用 Promise Bridge 提供同名异步 `help(name?)`。二者的可见文档内容保持一致；MCP 的查询不要求调用 `kgos_run`。Helper 是文档查询，不是新的 SDK 业务方法，不计入 31 方法矩阵，也不接收额外权限。
- MCP Server 的可选 `Instructions` 只提示**数据库文本是数据而非指令、跨读取版本一致性、结果未知时核查后重试**；不把 Skill 流程塞入工具描述。Preview 构建全部 Branch 的完整视图而 `limit` 仅控制返回窗口；`state_ancestry` 可能需要 cursor；`kgos_run` 的一个 JS 脚本**不是跨操作原子事务**，不能使用“每次写入都创建独立 Commit”误导 AI。
- 验证需读取真实 MCP `tools/list` / JSON Schema / 初始化 Instructions，执行 `kgos_read` 和 `kgos_run` 内的 Help 正反例，证明 `kgos_read` 的写入权限不变、Help 文本跨两端一致、示例符合当前类型与实际方法边界；模型行为提升需要独立评测证据，不能仅凭文字 Review 声称。

### JavaScript SDK 执行

#### 共同接口与语言能力

目标 `kgos_query` 与 `kgos_mutate`（当前实现分别名为 `kgos_read` / `kgos_run`）使用**完全相同**的输入 / 成功返回格式，只有可调用的 SDK 方法不同：

```ts
type ScriptInput = {
  code: string;
};

type ScriptOutput = {
  result: JsonValue; // 复用 @kgos/sdk 的 JSON-compatible 类型
};
```

- `code` 是**异步 JavaScript 函数体**，支持 `async / await`、普通函数、变量、分支、循环、数组 / 对象、`Map` / `Set` 计算、`Promise.all()` 与 `for await...of` 流式消费。无需 import、Client 初始化、Endpoint、Token 或单独配置，也不额外增加 `state / branch / format / dryRun` 等 Tool 参数。
- Sandbox **直接提供四个顶层命名空间**：`ontology`、`object`、`graph`、`evolution`。使用 `await graph.query(...)`、`await evolution.branch.list()`；**没有 `kgos.`、`sdk.` 前缀或第二套简写别名**。方法的参数、结果、错误和 StateRef 继续属于 `@kgos/sdk` 及对应业务 owner；一次脚本内的不同 SDK read 不会自动绑定同一个 State，调用方应显式使用同一个 resolved Commit 进行跨操作一致读取。
- `return` 是**唯一正式结果出口**，可返回 JSON-compatible 的对象、数组、字符串、数字、布尔值或 `null`，MCP 成功结果统一为 `{ result: <返回值> }`。返回 `undefined` / 未执行 `return`、函数、`BigInt`、非有限数字、循环引用或其它不能无损表达为 JSON 的值时明确报执行结果错误，不能静默转换成 `null`、`{}` 或删字段。不额外提供独立的 `console.log` 输出合同；需要返回调试信息时直接放进 `return`。
- 每次 Invocation 的 JS 全局变量独立且结束即丢弃，不创建跨调用 Session；知识库持久状态只存在于原有 KG OS API / 数据库中。

例如只读脚本：

```js
const { state } = await evolution.overview();
const models = await ontology.read({ at: state, refs: ["node:Person"] });
const data = await graph.query({
  at: state,
  cypher: "MATCH (n:Person) RETURN n.name LIMIT 10"
});
return { state, models: models.results, data: data.rows };
```

#### SDK 能力边界

| Namespace | `kgos_query` | `kgos_mutate` 额外开放 |
| --- | --- | --- |
| `ontology` | `read` | `patch` |
| `object` | `read`、`readText` | `patch` |
| `graph` | `query`、`streamQuery` | `execute`、`streamExecute` |
| `evolution` | `overview`、`get`、`ancestry`、`history`、`diff` | 无额外顶层方法 |
| `evolution.state` | 无 | `create`、`setData`、`clearData` |
| `evolution.branch` | `list` | `create`、`delete` |
| `evolution.tag` | `list` | `create`、`move`、`delete` |
| `evolution.merge` | `list`、`get`、`conflicts` | `start`、`resolve`、`finalize`、`abort` |

- `kgos_mutate` 包含左列全部读取与右列写入方法，合计 **15 Read + 16 Write = 31 方法**。Go MCP Adapter 直接映射 Kernel 对应应用操作，且保持公共 SDK 的参数、返回值、错误类别与取消/流事件语义，不在 MCP 复制业务处理器、Compiler、Cypher 或 Merge Engine。`kgos_query` 不暴露任何右列方法；**每一次 Go Bridge 调用必须由宿主按 Tool 的实际权限、精确方法及参数校验**，不能只依靠冻结 JS 对象或前端类型。未来公共 SDK 新方法需分类、显式列入许可集并经过对照测试。
- 两个工具均使用同一个 Sandbox 实现。`kgos_mutate` 在 MCP Tool 级明确标记可能修改或删除状态，由 MCP 客户端按真实工具风险完成授权；**不为每个 SDK 方法另设一次确认协议**。`kgos_query` 是数据库只读 SDK 方法集合，不对外承诺所有底层执行都没有其它副作用；MCP metadata 不得作虚假安全声明。

#### Sandbox 选型、执行与资源边界

- **已采用选型**：使用 [QuickJS-NG WASI reactor](https://github.com/quickjs-ng/quickjs) 作为受控 `.wasm` 引擎，通过 Go 的 [wazero](https://github.com/tetratelabs/wazero) 嵌入 `kgosd`，不使用 Node.js Worker、`node:vm` / `vm2`、CGO JS 插件或独立 SDK Gateway。Promise Bridge、增量 Graph Stream 和实际不可信脚本隔离的验证以 [Phase 16](../development/phases/16-kgosd-unified-mcp.md) 与当前回归测试为证据，不以 [go-quickjs-wasi-reactor](https://github.com/aperturerobotics/go-quickjs-wasi-reactor) 外部项目本身代替验收；D102 不改变引擎或依赖版本。
- 每次 Invocation 创建隔离的 WASM Module / QuickJS runtime/context，脚本状态和 Promise 不跨请求持久化。仅向脚本暴露四个固定 namespace 的许可方法；WASI 不预开放宿主文件系统、环境变量、网络、任意模块加载或敏感日志能力，**不允许**脚本读取 Instance / OAuth Token、直接持有 Go Kernel 句柄或调用任意 HTTP。Go Host Bridge 只接受 `method + JSON-compatible 参数`，返回 JSON-compatible 值/公共安全错误，执行前按 Invocation 身份、Method allowlist 和资源预算校验。
- **固定引擎编译复用**：同一进程可复用固定 QuickJS WASM 的只读编译结果，以免每次调用重复编译耗尽脚本预算；不缓存用户脚本或共享 WASM Module、内存、QuickJS context、Promise 和 Bridge 状态。每个 Invocation 仍按自己的 memory pages 解码校验并创建独立实例，关闭或取消一个实例不清除其他实例所需的编译结果。冷编译串行进入，等待仍计入原请求 / 脚本 deadline，取消等待不得启动后续实例；失败不永久缓存为初始化错误。编译缓存仅在进程内保留固定引擎，生命周期随进程结束，不写入 Workspace 或新增磁盘缓存。生命周期与不同 Runtime 的复用依据 [wazero v1.12.0 CompilationCache](https://pkg.go.dev/github.com/tetratelabs/wazero@v1.12.0#CompilationCache)；执行预算和资源隔离合同不变。
- **异步调度**：Go 宿主可并发执行独立 Kernel 方法，但同一 Guest QuickJS/WASM 的 Promise resolve/reject、pending jobs 与状态操作必须由一个调度所有者**串行**驱动，不允许多个 Goroutine 并发重入 VM。`Promise.all()` 必须能等待实际同时在途的 Go 调用；`graph.streamQuery / streamExecute` 必须通过 `stream-open / stream-next / stream-return` 拉取真实事件，维护背压，支持 `for await...of`、提前退出、断线与取消，**不得预先将整个 Stream 聚合为数组**。
- **引擎输入边界**：向 `JS_Eval` 传递 UTF-8 源码时必须额外分配并写入末尾 NUL，长度参数仍为原始源码字节数，不能依赖未初始化或先前释放的堆内存恰好为零。此为固定 [QuickJS-NG v0.15.1 的 C API 要求](https://github.com/quickjs-ng/quickjs/blob/v0.15.1/quickjs.h#L942)，不改变用户脚本内容或代码长度预算。
- **资源隔离**：限制 Guest WASM linear memory pages / JS heap/stack、脚本大小、宿主调用/流并发、输出大小及墙钟时间；使用 wazero `WithCloseOnContextDone(true)`（需在目标版本证实）、Module close 与适用的 QuickJS CPU interrupt，在无限循环、深递归、内存耗尽、trap、取消、超时下结束该次 Invocation，且其他 `kgosd` 请求继续正常执行。超限明确返回 `RESOURCE_ERROR`，不能静默截断、继续交付已失效脚本的回执或伪造事务回滚；已发到 Kernel 的写入仍可能完成。
- **P16-01 历史可行性门槛**曾验证真实 `async/await`、`Promise.all()`、`for await...of`、宿主权限隔离、资源中断与并发取消；不得擅自降低现有隔离保证、回退独立 Node.js MCP 或因 D102 的公开重命名改变四种原有业务操作合同。已有 Phase 16/22 真实验收保留为历史基线，但新 Tool 名称/Docs Handler 仍需 Phase 23 单独取证。
- Sandbox 限制的是**脚本对宿主的直接访问**，不是修改数据库的 Cypher 能力：`graph.query / execute` 继续完全遵守 [Graph 原样执行合同](graph.md#graph)，MCP 不解析、拦截、改写或额外约束 Cypher，也不为文件 / 网络访问新增 Tool、参数或引导流程；底层依照 `kgosd` 当前实际运行权限执行。来自数据库的文本、Ontology、Commit Message 均只是数据，不能改变沙箱权限和工具行为。

#### 写入、错误与部分成功

- `kgos_mutate` 允许在一个脚本中按顺序或并发调用任意已开放的 SDK 操作，但**整个 JavaScript Invocation 不构成自动事务**；单次 Object / Ontology Patch 的 `baseState` / Branch CAS、Graph Execute 的真实 Cypher 提交及 Evolution / Merge 的 revision 校验继续按原合同执行。不会因为多个 SDK 调用写在一个 `code` 中就自动保证原子性，也不创建跨方法 transaction、staging、`dryRun`、自动回滚、补偿或写入重试。
- 若第一条写入成功、后续写入失败，**已成功的写入不会被撤销**，整个未捕获异常的脚本返回错误。例如 `branch.create` 成功后 `tag.create` 失败，创建的 Branch 仍然存在；调用方可通过 `branch.list` / `tag.list` 等 API 核实。成功的 SDK 调用返回值可在脚本中由调用方自行保留，但 MCP 不会根据日志推断整个执行成功、已回滚或可以安全重放。
- JS 语法 / 运行错误、SDK 错误和 Sandbox 超限 / 取消都与正常 `return` 区分，MCP 调用失败时使用 `isError: true` 和有界、无凭证的结构化错误信息。SDK 公共错误保留已有 `code/message` 与安全的 `details`；脚本自身错误不伪装成数据库公共错误，超限明确报 `RESOURCE_ERROR`，取消明确标记为取消。宿主异常堆栈、Token 或执行器内部细节不得进入模型结果。脚本自行 `try/catch` 并 `return` 的 JSON 属于调用方显式决定的成功结果，MCP 不隐式替它判定每条写入成功。
- **超时、取消、断线或通信失败后，已发出的写入可能完成，也可能尚未完成**；结果未知时不得报告“写入失败且无副作用”，也不得自动再次提交。使用既有 Branch Head、State、History、Tag 或 Merge Session 读取来确认真实结果，不增加额外的持久执行日志 / 操作状态库。

例如：

```js
const { state } = await evolution.overview();
const created = await evolution.branch.create({
  name: "experiment",
  from: state
});
const branches = await evolution.branch.list();
return { created, branches: branches.items };
```

上述脚本如果 `branch.create` 已经成功，而后续 `branch.list` 失败，工具返回错误，但 Branch 仍可能已存在；**一次 Tool 失败不等于本次脚本中的所有 SDK 操作都回滚**。

## Markdown 阅读呈现规范

目标 `kgos_ontology_overview` 的 `preview` 与 `kgos_commit_ancestry` 的 `markdown` 都是供 AI 阅读的 Markdown **正文**，不是将整份文档套进一个代码块。采用语义化代码块区分原始数据与导航结构：

- **导航**：Branch / Commit / Domain / Definition 的目录、准确 Ref、分页信息与跳转索引使用普通 Markdown 标题和表格；表格只存适合单行导航的字段，复杂长文本不能只挤在表格中。
- **Commit Message**：在每个 Commit 下以标记为 `markdown` 的独立 fenced code block **完整展示原始 Message**；不切割 `## 简介` / `## 改动`、不总结、不截断、不把其标题当成外层文档标题。无 Message 时明确显示缺省，不虚构文本。Preview 可另外解析规范简介的首个非空行用于**分支索引**，不改变正文的原样展示规则。
- **Ontology**：模型关系图使用 `mermaid`；Domain / Definition 的完整公共 Object Value 使用 `yaml` fenced code block，复用 [Object canonical YAML](object.md#object-value-与-representation) 的同一字段和序列化规则，不创建另一种摘要格式。分支、Domain、Definition 的定位 Ref 留在外层标题或索引中，不混入可编辑 Object body；完整 `includes`、Property、Constraint、Index、Relationship `from/to` 与长说明均不得丢失。必要的 Cypher / JSON 片段依真实数据类型使用对应语言标签。
- **安全转义**：fenced block 采用长度**严格大于正文中最长连续反引号序列**的反引号围栏（至少三个），避免 Message、说明或 YAML 值中的反引号提前闭合。表格单元、Mermaid 名称/Label、链接及其它非 fenced 展示位置要确定性转义，不让来自数据库的文本伪造章节、图边或指令；代码块语言标签由 renderer 选择，不由用户文本控制。
- **无损与计数**：代码围栏、标题、表格属于只读展示层，不修改 Commit / Ontology 存储，也不成为新的 Patch 格式。所有原始信息须可通过对应 SDK 公共值找回；Preview 按已有 UTF-8/LF 文档规范输出，必须**在全部代码块与转义最终渲染后**计算绝对 Offset / Lines。分页窗口可以落在 fenced block 中间，不插入额外边界行。

<a id="kgos_preview虚拟-markdown-文件"></a>

## `kgos_ontology_overview`：虚拟 Markdown 文件

### 输入与输出

```ts
type PreviewInput = {
  offset?: number;        // 默认 0，0-based 绝对行偏移
  limit?: number;         // 默认 300，允许 100..500
  viewRevision?: string;  // 继续读取已冻结的进程内预览
};

type PreviewOutput = {
  totalLines: number;     // 本份完整虚拟 Markdown 文档的行数
  offset: number;         // 本次读取起始行，0-based
  lineCount: number;      // 本次实际返回的行数
  viewRevision: string;   // 进程内视图标识，非 Commit/Branch identity
  preview: string;        // 原始 Markdown 行窗口
};
```

- 不传 `viewRevision`：枚举当前**全部 Branch**，按名称 UTF-8 bytes 升序生成一份**完整、不可变**的虚拟 Markdown 文档，存于 `kgosd` 的有界**进程内缓存**，再取 `offset..offset+limit` 窗口。没有分支筛选参数，所有分支的索引和绝对行号始终使用同一份完整文档。
- 传 `viewRevision`：从缓存中读取**原始同一份文档**，**绝不重新解析最新 Head 后拼接旧行号**。同一 revision 对应的内容、行号和 `totalLines` 均不变。缓存按被认证的调用者与绑定的 Instance 隔离，不能仅凭猜到或复用其他连接的 revision 读取对方视图。
- `offset` 是从文档**第 0 行**开始计数的绝对行偏移。各索引中的 `Offset` / `Lines` 使用同一坐标系；窗口 `[offset, min(offset+limit, totalLines))`。允许 `offset == totalLines` 返回 `lineCount=0`；负数、非整数或超出范围报错。尾页可不足 100 行。`lineCount` 是实际行数，不包含任何重复的分页提示行。
- 统一使用 UTF-8、LF 换行与恰好一个末尾换行：**`totalLines` 等于整个文档内 LF 的数量**，最后的终止 LF 不形成额外空行；连续分页按原始行拼接即可还原**同一份完整文件**。Markdown 表格或 Mermaid fenced block 可以跨窗口，不额外插入/删除边界行。
- 内存缓存可以过期或被驱逐，进程重启也会丢失。失效的 `viewRevision` 返回明确的 `VIEW_EXPIRED`（MCP adapter 级错误），AI 重新从 `offset=0` 获取新视图；不落盘、不存入 KG OS State，也不生成可写文件。文档过大无法安全完整生成时返回明确 `RESOURCE_ERROR`，**不得裁剪模型冒充完整**。这不等同于建立虚拟文件系统。

### 版本绑定与内容来源

- 使用 `evolution.overview()` 取得默认 Branch 名，`evolution.branch.list()` 枚举**全部**真实 Branch → Head Commit；每个 Branch **固定**为枚举时观察到的 `commit/<id>`，然后对该精确 Commit 读取 metadata 与完整 Ontology。列表/默认分支查询不承诺跨多个 HTTP 请求的原子时间快照；一旦生成文档，列出的 Head 与 Ontology 不会因为 Branch 后续移动而混用。
- 从每个 pinned Commit 的 `ontology.read({at: commit/...})` 全局 Overview 开始，按 cursor 展开**全部 Domain** 及其成员，使用 visited set 处理 Domain 多父级/循环，并继续覆盖所有 Definition。对已发现 Definition 以 `object.read({at: commit/..., refs})` 分批（遵守当前 1..100 规则）取得**完整公共 Object Value**。不混合当前分支与历史分支的 Schema / Semantics；不直接访问 Lithograph internal graph / Schema。
- 文档完整包含**所有公共 Ontology Domain、Node / Relationship Definition、直接成员关系、Property、Constraint、Index、完整原始说明与必要的准确 Ref**。`Domain includes` 必须完整显示；Property-local / Definition-level 的约束和索引、共享 Index targets、Relationship `from/to`（包括 `null`）不能因渲染形式而丢失。共享资源的展示不得误导成多个独立索引，额外 Label 不等于另一 Node Definition。
- 虚拟文件**仅预览 Ontology 结构与 Commit 元数据**，不枚举 Knowledge Node / Relationship 实例，也不扫描全部 Commit DAG、Tag、State Data。若某个 Commit 当前无法按 KG OS Ontology 合同解释，整次生成明确失败或诊断，不跳过该分支并返回伪完整文件。

### 文件排版及行窗口索引

下面用**只有一个 Branch 的最小示例**演示排版；ID、Offset、Lines 和业务模型为占位值，不是可执行的 Commit ID / 行号。真实文件必须列出全部 Branch 及其完整内容。文件内索引的 Offset 指向所在章节或 Definition 的**起始行（0-based）**，Lines 是该段完整行数，范围为 `[Offset, Offset + Lines)`；不使用相对章节的行号。生成器先确定每一段的内容与行数，再填入索引，确保索引改变自身长度时仍能算出准确的绝对行号。

````markdown
# 分支

**Default:** `branch/main`

| Branch | Head Commit | 当前简介（首行） | Offset | Lines |
| --- | --- | --- | ---: | ---: |
| `main` | `commit/aaa...` | 人物、企业与任职关系的知识世界 | `<offset>` | `<lines>` |

---

# main

**Ref:** `branch/main`
**State:** `commit/aaa...`

## Head Commit

| Field | Value |
| --- | --- |
| Author | KG OS |
| Message | 见下文原文代码块 |
| Committed At | 1790000000000000（UTC Unix microseconds） |
| Parents | `commit/ccc...` |

## Commit Message

```markdown
## 简介

人物、企业与任职关系的知识世界。

## 改动

- 新增 `WORKS_AT` Relationship Definition。
```

## Ontology

### 目录

| Section | Offset | Lines |
| --- | ---: | ---: |
| 模型关系图 | `<offset>` | `<lines>` |
| Domain 组织 | `<offset>` | `<lines>` |
| Definition 索引 | `<offset>` | `<lines>` |
| Definition 详情 | `<offset>` | `<lines>` |

### 模型关系图

```mermaid
flowchart LR
    Person["Person"]
    Company["Company"]
    Person -->|"WORKS_AT"| Company
```

### Domain 组织

| Domain Ref | Title | Description |
| --- | --- | --- |
| `domain:Work` | 工作 | 管理人与组织 |

| Domain Ref | Member Ref |
| --- | --- |
| `domain:Work` | `node:Company` |
| `domain:Work` | `node:Person` |
| `domain:Work` | `relationship:WORKS_AT` |

#### `domain:Work`

```yaml
name: "Work"
title: "工作"
description: "管理人与组织"
includes:
  - "node:Company"
  - "node:Person"
  - "relationship:WORKS_AT"
```

### Definition 索引

| Ref | Title | Description | Offset | Lines |
| --- | --- | --- | ---: | ---: |
| `node:Company` | 企业 | 组织机构 | `<offset>` | `<lines>` |
| `node:Person` | 人物 | 自然人 | `<offset>` | `<lines>` |
| `relationship:WORKS_AT` | 任职 | 人与企业的任职 | `<offset>` | `<lines>` |

### Definition 详情

#### `node:Company`

```yaml
name: "Company"
title: "企业"
description: "组织机构"
properties:
  - name: "name"
    type: "STRING"
constraints: []
```

#### `node:Person`

```yaml
name: "Person"
title: "人物"
description: "现实世界中的自然人。"
properties:
  - name: "name"
    description: "人物姓名"
    type: "STRING"
constraints: []
```

#### `relationship:WORKS_AT`

```yaml
name: "WORKS_AT"
title: "任职"
description: "人与企业的任职"
from: "node:Person"
to: "node:Company"
properties:
  - name: "since"
    description: "任职开始日期"
    type: "DATE"
constraints: []
```

````

排版规则：

1. **文件首部**始终是**全部 Branch** 的索引，列出准确 Head Commit、从 Message 取得的简介首行、对应完整分支区块的绝对 `Offset` / `Lines`。`Default` 始终表示真实默认分支，所有分支区块均存在于同一份完整文件，AI 按索引直接跳读。
2. 每个 **Branch 区块**先列准确 `branch/<name>` / pinned `commit/<id>`、Head Commit 作者、原始时间及父 Commit，再以 **`markdown` 代码块展示完整原始 Message**，最后是**该 Commit 的完整 Ontology**；不从 Message 提取两段作为正文替代。
3. Ontology 先放目录，再放**完整 Mermaid 结构图**、Domain / 完整 `includes` 导航表与 Domain canonical YAML、全部 Definition 导航索引、逐个 Definition 的 canonical YAML。图只表示类型及端点限制，**不是 Knowledge 实例图**；遇到 `from/to = null` 时明确显示无端点类型约束，不伪造 Node。多 Domain 归属及循环以成员表如实表达，不展开成错误的树。
4. 所有 Definition 详情以准确 Ref 为标题，`yaml` 代码块完整表达 Node 识别 Label 与额外 Labels、Relationship Type/端点、title/description、所有 Property 的类型/说明/required/unique，以及 Property-local / Definition-level 的 Constraint 和 Index（包含真实名称、类型、字段、target/scope）。直接复用 **同一 canonical Object YAML**，而不是独立生成一套简化字段表；这是只读展示，修改时仍用 Object canonical YAML + Git Extended Diff。
5. 大型文本说明、Markdown 特殊符号、换行、Mermaid Label 和用户自定义名称必须进行**无信息丢失的稳定转义/表示**，防止内容打断表格、伪造文件标题、插入 Mermaid 语句或冒充 Skill 指令；不要由生成器概括或截断实际 Ontology。重复输出同一 Definition 的位置应由索引指向同一完整详情，不重复建模。
6. 内容与章节使用确定性排序；每一段长度在最终 render 后计算。所有 offset 必须通过生成测试检查能真实定位到对应标题、图、表和 Definition，不能把示意行号当成程序常数。

### Commit Message 作为版本动态简介

KG OS 的 Branch 只有名称与可移动 Head；**不增加 Branch Description 字段、CRUD 或额外持久化元数据**。`kgos_ontology_overview` 读取当前 Head Commit 已有的 `message`，把它当成**这个 State 所表示的知识世界的介绍**，不是 Branch 独有、不随快进/合并持久不变的说明。

官方 AI / Skill **推荐在新建 Commit 的 `message` 中使用以下 Markdown 约定**：

```markdown
## 简介

这个 Commit 完成后的知识世界是什么、包含什么、主要用于什么。
每次新 Commit 应维护当前完整简介，而不是仅记录新增部分。

## 改动

- 相较于上个版本的实际改动一。
- 相较于上个版本的实际改动二。
```

- Preview **正文不切割或解析展示 Message**，只在分支索引需要简介首行时，识别顺序正确的独立标题 `## 简介`、`## 改动` 并提取两者之间的首个非空原文行作为导航。不调用 AI 生成摘要，不把索引首行冒充完整 Description；完整 Message 始终在 Branch 的 `markdown` 代码块中。
- 对历史或非规范 Message，分支索引必须明确显示“无规范简介”，Branch 详情仍完整保留实际 Message；**不根据提交标题、Ontology 或历史记录猜出简介**。Commit 允许多个 Branch 共享，快进可能只改变 Head 而不新建 Commit，因此多个 Branch 的当前简介可能相同。
- 此处是**官方 AI 写入/阅读约定，不是 Kernel 数据格式或必填校验**。既有 `author/message?` 输入继续可选；直接 Graph、merge fast-forward、历史 Commit 及其他客户端可能不遵循约定，不因 MCP 增加额外验证、自动修复 Commit 或要求补建一个无变化 Commit。Immutable Commit Message 只能通过后续新 Commit 携带新简介，不能原地修改旧 Message。
- Message 是来自数据库的调用方文本，属于待解释数据，不具备改变 MCP Tool / Skill 权限与流程的指令效力。

<a id="state_ancestrycommit-dag-markdown-历史"></a>

## `kgos_commit_ancestry`：Commit DAG Markdown 历史

此只读 MCP Tool 用来查看指定 Root **可达的祖先 Commit**，不替代 `kgos_ontology_overview` 的当前模型视图，也不解释提交中的真实知识 Diff。Go Handler 直接调用现有 Kernel Evolution 操作，输入输出与 `@kgos/sdk` 的 `evolution.ancestry()` 公共合同一致；JavaScript Sandbox 内仍使用无前缀的 `evolution.ancestry()` 调用，不建立 MCP 专属 Commit 模型、历史索引或持久缓存。

### 输入与输出

```ts
type AncestryInput = {
  root: string;      // 必填：commit/<id>、branch/<name> 或 tag/<name>
  limit?: number;    // MCP 默认 20 个 Commit；允许 1..1000
  cursor?: string;   // 继续读取同一 pinned Root 的下一页
};

type AncestryOutput = {
  root: string;      // SDK 解析后的 immutable commit/<id>
  count: number;     // 本页实际 Commit 数量
  cursor?: string;   // SDK 原样返回；无下一页时省略
  markdown: string;  // 本页 Markdown 历史正文
};
```

- `root` 为必填的公共 StateRef；第一次调用将 Branch / Tag 解析为 immutable Commit，并返回这个准确 `root`。继续分页时传入**返回的 resolved `root`** 与原始 opaque `cursor`，避免 Branch 后续移动；游标本身继续遵守 [Evolution Ancestry](evolution.md#evolution-公共调用合同) 的固定遍历和参数匹配规则。不重复请求整个库或额外列出其它 Branch 的历史。
- MCP 将缺省 `limit` 显式映射为 SDK 请求的 `20`，**不修改 SDK 已有默认 100 / 允许 1..1000 的合同**；本次请求的 `count = items.length`，不虚构整个 DAG 的总条数或前后章节的全局行号。无 `viewRevision`、`offset`、第二套 Cursor 或预览缓存。
- 每个 StateSummary 完整保留 `state`、**全部** `parents`、可选 `author/message` 与原始 `committedAt`（UTC Unix epoch microseconds）；顺序及多父 / 合并拓扑直接复用 SDK 返回的 reverse-topological DAG order，不重排、不将历史误做单链表。允许遍历 invalid / pre-KGOS Commit，不能因无法解释 Ontology 而跳过历史结点。
- `markdown` 使用 [统一呈现规范](#markdown-阅读呈现规范)：先给准确 Root、本页 Commit DAG 的 `mermaid` 图及带完整 Ref 的索引表，再按 SDK 顺序给出每个 Commit 的元数据与**完整原始 Message `markdown` 代码块**；无 Message 明确写无。Message 可能是任意 Markdown 或旧格式，不拆 `## 简介` / `## 改动`，不概括、不猜测、不截断。
- **Mermaid 是本页视图**：显示本页 Commit 与它们的直接父 Commit，按 `child → parent` 方向画真实 DAG 边；父 Commit 如果不在本页，显示其准确 Ref 并标记“未在本页展开”，不能把它误画成不存在或终止结点。Mermaid 标签须安全转义；既不承诺当前页等于全部历史，也不补造非 SDK 返回的边。
- 不读取 Ontology、Knowledge、State Data 或业务 Change；要查看历史 Snapshot 或实际 Diff 时由 `kgos_query` 调用已有 SDK。资源限制触发时明确返回 `RESOURCE_ERROR`，让调用方缩小 `limit`；即使 `limit=1` 仍过大也不能静默裁剪 Message。

排版示意：以下 ID、时间均为占位；为了演示跨页父结点，只展示两个已返回的 Commit。

````markdown
# Version History

**Root:** `commit/ddd...`
**Page Count:** 2

## Commit DAG（本页）

```mermaid
flowchart TD
    D["commit/ddd..."]
    B["commit/bbb..."]
    C["commit/ccc...（未在本页展开）"]
    A["commit/aaa...（未在本页展开）"]
    D --> B
    D --> C
    B --> A
```

## Commits

| State | Parents | Author | Committed At (µs) |
| --- | --- | --- | ---: |
| `commit/ddd...` | `commit/bbb...`, `commit/ccc...` | AI | 1790000000000000 |
| `commit/bbb...` | `commit/aaa...` | AI | 1789990000000000 |

## Commit 详情

### `commit/ddd...`

**Parents:** `commit/bbb...`, `commit/ccc...`
**Author:** AI
**Committed At:** 1790000000000000（UTC Unix microseconds）

#### Commit Message

```markdown
## 简介

人物与企业知识库。

## 改动

- 新增 WORKS_AT 关系。
```

### `commit/bbb...`

**Parents:** `commit/aaa...`
**Author:** AI
**Committed At:** 1789990000000000（UTC Unix microseconds）

#### Commit Message

```markdown
初始化人物模型。
```
````

## 官方 Skill 与私人 Plugin

**官方 Skill 源码已收敛为七个**：旧通用 `plugins/kgos/skills/kgos/SKILL.md` 已依用户明确清理要求从源码移除。它原先指导的 `kgos_docs`、`kgos_ontology_overview`、`kgos_commit_ancestry`、`kgos_query`、`kgos_mutate`、SDK 命名空间、State pin、Object Patch、Cypher、分页、Merge、Commit Message 与失败恢复，由 MCP 自描述 `kgos_docs` 和相应 Guide/SDK 合同承接。新任务按需读取文档与当前 State，不把完整 Ontology/Commit DAG 无界加载；没有 Skill 也能调用已授权 MCP。**仓库源码清理不证明私人 Plugin 已自动更新或七个 Skill 已通过目标客户端验收**，对应缺口仍归 Phase 25/27/28。

**安装职责（2026-10-26）**：官网双语教程负责用户手动部署、初始化、公网 HTTPS、连接并安装 ChatGPT 基础 MCP 应用，直到目标客户端的真实只读调用通过；`plugins/kgos/INSTALL.md` 从这个已连接应用开始，指导 AI 制作和安装版本化私人 Plugin、迁移定制、配置同包完整全局引导词与自检。当前可编辑源码只维护一份无独立版本号的全局引导词；正式安装使用所选 KG OS Release Tag 的冻结 INSTALL 和同包引导正文，不把新源码套用到旧包。主机、Embedding、模型、费用、账户/Workspace、权限与变更方案由用户选择。官方推荐 Compose + Web 初始化，不据此自动选用用户设备或执行部署；AI 不扫描设备、不重置或自动升级实例。只补问具体缺项，已授权步骤不重复确认，实质变更只确认受影响部分。

**用户教程与版本**：可编辑发布模板按语言唯一维护在 `distribution/site/src/content/service-installation/zh.md` 与 `en.md`；它们不直接作为最新版网页。正式发布后，已验证的完整正文与配套 INSTALL 保存为 `vX.Y.Z/` 快照，再由目录生成 `/zh/install/`、`/en/install/` 及同源 Markdown 下载。Compose / Docker 命令与 Web / 配置文件初始化四种组合共用持久化、非 root 身份、受控初始化与验收；初始化就绪后配置 Caddy HTTPS，已有代理可复用。官网按正式发布版本保存完整双语手册与对应 INSTALL 快照：`/zh/install/vX.Y.Z/`、`/en/install/vX.Y.Z/`、各语言对应 `.md` 下载及语言无关 `/install/vX.Y.Z/INSTALL.md`。`/zh/install/`、`/en/install/` 保留最新稳定版入口；版本切换和中英文切换保持选中版本。每版的正文、镜像 digest、AI 提示词、INSTALL 与 Plugin 发行资源绑定同版，历史页面不标为最新，也不跳到 main 或其它版本资源。最新版本由显式发布目录决定，不随开发包版本提前变化，不使用浮动 `:latest`。发布时保存完整配套资料，发布收尾将实际已发行版本注册到官网；下一版技术内容只编辑发布模板和 canonical INSTALL，不改已归档正文；新版本不覆盖旧版正文。本轮补齐 v0.3.0 官网配套资料，不改写其既有 Git Tag 或 Release。教程提供逐步操作、预期结果、异常恢复、服务升级与备份恢复，不展示内部评审措辞；真实 Docker/证书/客户端证据在开发记录中维护。

完整安装按以下依赖推进：

1. 用户手动部署或指定已有 `kgosd`，完成初始化、真实 Embedding、持久化、公网 HTTPS 与认证验收。`[server].public_origin` 为最终安全根 Origin；有效实例不重新初始化，不要求无关的宿主权限。
2. 用户在指定 ChatGPT 账户/Workspace 添加或复用基础 MCP 应用，按实际界面完成 OAuth、安装、启用及新会话只读调用验收。管理员 Token 只输入自己的 KG OS Web；CIMD/PKCE 不要求把 Token 当 client secret。服务重启使进程内 OAuth 凭证失效时重新授权原连接，不默认删除重建。
3. AI 确认已有应用与真实 app/connection ID、服务版本及对应官方资源；识别用户指定旧私人 Plugin 与旧版官方基线的差异，列出定制迁移、冲突、版本化名称及安装范围，并在制作前核对目标持久指令入口的容量与已有内容；不可观测时说明限制，不假定其他入口存在或具有全局效力。用户确认方案后执行。目标 Plugin ID、app ID 与 OAuth client_id 不混同；未知旧内容不视为没有定制。
4. 每次制作新的私人 Plugin，不原地更新旧 Plugin；展示名包含官方版本号，同版再次制作增加修订序号，实际对象保持独立。复用验证过的应用连接，保留七个官方 Skill 与完整引用资源，迁移用户定制；有冲突由用户选择，不以旧包整体覆盖新版。新版本失败保留旧版，创建结果未知先查状态，不盲目重复创建。
5. 在新会话验证新 Plugin 的实际安装、MCP 调用、版本、Skill 与引用资源，提供同包完整全局引导词和目标 ChatGPT 的配置步骤。保留现有个人指令，冲突由用户决定；空间不足不压缩官方正文，由用户选择可承载全文的持久指令入口或解决已有内容冲突，无法保存则保留未配置状态。配置保存与普通任务行为分别检查，不以 Doctor 探测冒充自动生效。新版本验收后，用户可选择卸载旧 Plugin；已有明确授权直接执行，保留共享 app/MCP 连接，不扩大共享或公开范围。

**自检与完成规则**：默认完整安装包含就绪服务、ChatGPT 应用、版本化私人 Plugin、七个官方 Skill、引导词与定制迁移结果；用户明确选择 MCP-only 时可在官网的连接验收后结束。按组件区分已安装、已配置、实际调用通过、待操作、失败与不可观测。必要的可操作项必须通过，隐藏全局指令来源或自动 Skill 选择等不可观测项目分别报告，不伪造加载证据，也不把它们变成永远无法通过的硬门槛；已确认缺失/错误不能当作不可观测略过。Doctor 自检覆盖安装相关 D1–D3，空知识库可通过；D4 知识质量、D5 维护调度与业务写入不是安装条件。失败或中断先核实现状，原授权内安全恢复，缺输入仅暂停依赖部分。

**服务升级**：先核对目标发行说明与适用升级路径，拉取固定镜像；暂停写入、停止服务后私有备份整个工作目录、启动配置和凭证，保留权限。Compose / Docker 分别按原参数与挂载替换镜像，不重新初始化、不修改代理或清理持久目录；升级后重验 State/数据/身份、HTTPS、OAuth 与 ChatGPT 调用。镜像回退不是数据恢复，未声明兼容时不承诺直接降级；恢复备份须由用户选择并说明会丢失备份后的写入。服务升级和私人 Plugin 升级独立。

通用 Plugin 模板不是可直接指向所有用户同一 MCP 地址的公共插件；不把动态连接 ID、Bearer Token、OAuth secret 或本地根目录写死进公开包。优先按 OpenAI 当前支持的 **注册 MCP Connection → 私有 Plugin 的 `.app.json` 引用 + 官方 Skill** 路径生成；`mcp.json` 可在需要便携 MCP 配置时单独选用，不与用户已有连接配置重复。`plugin.json`、`.app.json` 与 Skill 等具体文件布局按安装时的插件规范验证，**不把一种开发样例格式误当成所有客户端永远不变的产品合同**。

<a id="kgos-seven-skills"></a>

**公开安装与分发职责（D109）**：Plugin/Skill 内容真源保留在私有 `plugins/kgos/`，`kg-releases` 只接受生成器公开的 `plugin.json`、`.app.json.example` 和七个目标 Skill 的完整 Markdown 资源；私有源码内旧通用 `kgos` 已清理，但不会自动从用户已安装的私人 Plugin 中删除。`plugins/kgos/INSTALL.md` 是**唯一 AI 私人 Plugin 安装指南真源**，发布为 `kg-releases/INSTALL.md`；官网双语手动教程维护部署、ChatGPT 接入、升级与恢复；每版网页和 Markdown 下载共用该版本对应语言正文，INSTALL 为同版冻结快照，不作为第二份独立编辑真源。正式发行时 Plugin 归档与 GHCR 镜像跟随同一个经授权的产品 Tag，`.app.json` 中的用户连接 ID 必须由用户私下配置；公开候选资料不等于 Phase 25/27/28 的完整客户端验收。详见 [D109](decisions.md#d109-single-public-distribution-and-installer) 和 [Phase 30](../development/phases/30-private-source-public-releases.md)。

### 最终官方 Skill 清单与通用 Skill 退役（D107：目标方案）

**最终官方 Skill 集合固定为七个**：下文 [六个规范 Skill](#kgos-standards-skill-suite)（Knowledge、Ontology、Retrieval、Branch、VLog、Maintenance）加上独立只读诊断 [`kgos-doctor`](#kgos-doctor-v1)。七个 Skill 分别指导外部 AI 的知识工作或诊断；KG OS MCP 负责确定性能力与自描述操作手册，外部 AI 负责任务理解、执行与结果核实。**不再规划**通用 `kgos`、额外执行 Skill、总规范 Skill、自动分发 Router 或其它官方 Skill 作为最终集合的一部分。官方全局引导提示词是独立提示词资产，**不计入 Skill 数量**。

**退役与客户端边界**：旧通用 Skill 在仓库源码中的退役已经执行，原有操作知识已逐项映射到现行 `kgos_docs` / MCP Guide/SDK，并补齐了缺失的沙箱及错误说明。用户明确授权的是**源码清理**，不是更新其账户里已有的私人 Plugin 或豁免剩余阶段验收。七个目标 Skill 的实际安装、自动选择、只读与获授权写入，以及无旧 Skill 的客户端查询/修改/版本路径仍须在受控真实客户端验证。既有私人 Plugin 不会自动随源码删除而改变，更新/移除需单独得到授权并回读确认，不得冒充已完成。

**设计与交付分离**：目标计数为 **6 + 1 = 7**；D107 制定时只有过渡通用 Skill，现七个目标源码与清单均已齐备。七个 Skill 的实际交付进度分别由 [Phase 25](../development/phases/25-kgos-doctor.md)（Doctor）和 [Phase 27](../development/phases/27-knowledge-standards-skills.md)（六个规范）维护；[Phase 28](../development/phases/28-official-skill-roster.md)记录源码清理与尚未关闭的客户端迁移验收。源码已收敛不等于私人客户端已安装或最终七 Skill 已完成交付。

<a id="kgos-standards-skill-suite"></a>

### KG OS 官方知识规范 Skill 体系（D106：目标职责划分）

KG OS 采用**六个独立规范 Skill**，指导外部 AI 在知识生命周期中高质量地**定义 → 创作 → 检索使用 → 演进 → 维护 → 记录**。六者属于任务内的 `guidance`（规范/决策指导），不代替拥有实际任务结果的 Agent 或操作 Skill；它们本身不负责自动写入、调度、授权或判断操作已经完成。已确认的是下表的名称、职责和选择边界；具体规则、例外、示例、规范版本及资源布局留在逐个 Skill 的后续设计中确定。

| 规范 Skill | 何时适用 / 唯一负责的规范 | 不负责的邻近职责 |
| --- | --- | --- |
| `kgos-knowledge-standards` | **在既有 Ontology 下创作、复用、关联、修正和更新当前任务的 Knowledge 实例**：语义忠实、证据准确、身份/关系正确、更新冲突判断及写入核实；不以主观长期价值否决明确授权的合法保存 | 不设计模型粒度、Definition 或字段（Ontology）；不接管检索回答、全库周期维护、分支策略或 VLog 规则 |
| `kgos-ontology-standards` | **设计、扩展和调整 Ontology**：Domain 组织、Node/Relationship Definition、Property、Constraint、Index 的结构与语义质量，复用现有定义、避免模型冗余 | 不决定某条业务事实是否真实（Knowledge）；不复刻 Kernel Schema/Compiler 合同 |
| `kgos-retrieval-standards` | **查询、阅读和使用已有知识**：选取库/范围、固定 State、选择结构化/全文/向量/混合检索手段、关联证据、识别冲突、缺失和过期信息、可靠使用查询结果 | 不负责写入/维护内容（Knowledge/Maintenance）；不重新定义 Graph/Search 执行语法 |
| `kgos-branch-standards` | **组织和演进知识世界**：长期领域 Branch 与实验路径的用途、现有世界/Domain/独立 Instance 的边界、起始 State、版本说明、Diff、融合与安全生命周期 | 不设计具体本体或实例内容，不部署 Instance，不规定 VLog 正文，也不替代 Evolution/Lithograph 合同 |
| `kgos-vlog-standards` | **系统知识记录质量**：记录准入、事件与执行的语义边界、真实结果/验证、跨世界来源定位、后续补充与纠正，以及必要信息和披露边界 | 不决定实体粒度或Schema，不执行维护/调度，不管理Branch，不替代通用实例Patch或检索合同 |
| `kgos-maintenance-standards` | **持续知识质量维护决策**：确定知识世界/State及检查范围、识别并确认候选问题、选择最小有据的处置、验证效果与影响、延续未决维护事项 | 不替代Doctor环境诊断、通用单对象更新/检索/建模、不执行调度、Branch管理或VLog记录正文 |

**共同边界与互操作**：

- 这些规范是**外部 AI 的知识工作指导**，而非 KG OS Kernel 的固定领域模型。KG OS 现有 [Ontology](ontology.md#使用模型)、[Graph/Knowledge](graph.md#knowledge-数据访问)、[Evolution](evolution.md#evolution) 与 [MCP Tool/SDK 手册](#mcp-tool-help) 继续拥有底层事实和公共技术合同；规范不能发明强制 `Person`、`Document`、`Source` 节点、统一 `createdAt` 字段或新的数据库语法。
- **职责按被规范的对象归属**：模型关系类型由 Ontology 规范负责，已存在实体之间的知识关系由 Knowledge 规范负责；Knowledge 负责写入内容质量，Retrieval 负责可靠读取与理解；Branch 负责知识世界组织和版本演进策略，VLog 负责 `branch/vlog` 中**值得记录什么及如何真实记录**；Maintenance 负责维护流程和检验，重要维护结论的记录质量仍由 VLog 规范负责。交叉任务按需组合相关规范，不建立第七个总规范或必须先激活的 Router。
- **按任务独立选择**：读写、建模、版本、检索、巡检、系统记录可以分别应用相应规范；某个规范缺失不应阻止无 Skill 的 MCP 基础使用。客户端能否自动发现/激活或同时应用多个 Skill 取决于宿主，不依赖未经验证的 Skill 间自动转交。官方引导提示词和 `kgos_docs` 未来可以提供**简短的选择导航**，但不重复加载六份规则正文，也不把全部规则复制进 Server Instructions。
- **规范权威与安全**：不伪造事实、区分证据和推断、保留真实 State、遵守授权/只读边界等通用底线以现有 KG OS 合同为依据，六个 Skill 按需引用，不维护六份相互漂移的技术规则。规范 Skill 只指导决策，不授予访问权限；知识与 VLog 的写入由实际适用的任务或持续管理授权及 MCP 权限控制，不要求每条记录再次授权。用户的只读、不查库、不保存及具体范围限制仍优先适用。
- **Doctor 的消费边界**：[`kgos-doctor`](#kgos-doctor-v1) 独立执行只读诊断；未来仅在相关规范实际发布、版本可识别且证据足够时使用它的质量规则，缺少规则或不可验证就如实报告 `UNKNOWN`，不得凭“规划了六个 Skill”判知识符合标准或自动修复。
- **系统级 VLog 不变**：`branch/vlog` 仍是普通 Branch 上由外部 AI 依据官方约定存储的高价值知识记录，不是宿主诊断日志、内核保留 Schema、第二个数据库或自动化调度器。[VLog Skill](#vlog-standards-authoring) 只提供一套可选 `VLogEntry` **推荐建模参考**，而非官方固定 Ontology/字段合同；调用方以目标 Branch 的真实模型为准。Doctor 按实际模型与可核实证据只读判断，不假设推荐模型已安装；记录的保留与实际运行识别仍受具体可访问证据限制。

**设计与内容真源**：D106 固定六个规范的目标职责、同级边界及协作关系；各规范经独立授权逐项创作，具体正文与引用资源在对应 Skill 包中维护，不由本设计概述推定全部完成。已创作的 [Ontology Skill](../../plugins/kgos/skills/kgos-ontology-standards/SKILL.md)、[Knowledge Skill](../../plugins/kgos/skills/kgos-knowledge-standards/SKILL.md)、[Retrieval Skill](../../plugins/kgos/skills/kgos-retrieval-standards/SKILL.md)、[Branch Skill](../../plugins/kgos/skills/kgos-branch-standards/SKILL.md)、[VLog Skill](../../plugins/kgos/skills/kgos-vlog-standards/SKILL.md) 与 [Maintenance Skill](../../plugins/kgos/skills/kgos-maintenance-standards/SKILL.md) 内容设计如下；实际安装/客户端验收进度见 [Phase 27](../development/phases/27-knowledge-standards-skills.md)。

<a id="ontology-standards-authoring"></a>

#### Ontology 规范 Skill 的内容与验收设计

`kgos-ontology-standards` 采用 **核心建模原则 + 可审查质量标准 + 按场景读取的参考模型/反例 + 修改维护规则**。Skill 是任务内指导：适用于本体创建、扩展、修改、评审和维护，不接管实例写入、调度或独立发布。已授权的宿主任务继续负责执行和完成；评审请求不获得修复权限，概念设计不因缺 MCP 而被无关地阻断。

核心正文维护职责、权限、质量底线及明确的条件式资源路径；复杂决策、演进风险和案例按需读取，不要求每次加载全部案例。参考模型为原创教学实例，覆盖资料溯源、时效规则、人物组织、项目决策、事件过程、技术依赖，并补充度量观测和受控词表；每例说明需求、适用/不适用条件、完整模型、结构与语义的取舍、相邻反例、修改影响和可验证问题。来源、有效时间、身份、单位和状态等要求依实际需求触发，不把案例字段变成所有领域的强制 Schema。

模型表达遵循现行 Ontology/Object 合同。资料的来源与论断真伪、业务有效时间与 Commit 时间、模型语义与数据库可执行约束分别表达；不宣称描述中的枚举、时间排序、跨关系数量等规则已被数据库执行。案例中的 YAML/只读查询通过隔离的真实 Kernel/Lithograph 创建、回读和合成数据验证；语义取舍通过逐例正反情境审核，提示词与 Skill 合同按项目已有两套创作规范审核。文字审核、运行测试与独立模型行为证据分别记录，不能以一项替代另一项。内容正文由 Skill 包维护，执行证据归 [Phase 27](../development/phases/27-knowledge-standards-skills.md)，不在设计文件复制整份规范。

<a id="knowledge-standards-authoring"></a>

#### Knowledge 规范 Skill 的内容与验收设计

`kgos-knowledge-standards` 是 **既有模型下的知识实例质量指导**，不重做本体设计。六项规则分别约束语义忠实性、证据准确性、实例身份、关系正确性、更新与冲突、写入质量。写入前的局部查询用于核对对象/事实，不把它升级为 Retrieval 的回答策略；当前实例的去重和纠错不接管 Maintenance 的全库巡检。表达能力不足时说明具体模型缺口，不擅自增加字段、Definition、Label、约束或通过底层能力绕开授权；宿主任务另有明确模型修改授权时，按相应职责处理后继续实例工作，不增加通用审批节点。

知识准入仅核对用户指定范围、权限、信息能否被忠实表达及敏感信息边界，不设通用长期价值分数。用户明确陈述可以作为陈述、偏好或决定的实际依据，但保存为用户陈述不等于独立验证；不得以缺少外部链接为由一律拒存，也不得补造日期、身份、来源或确定程度。事实变动、原记录纠错、不同范围和未决证据冲突须分别判断，依据当前 Ontology 使用其既有表达；不另起一套通用 Claim/Fact 领域模型。

案例采用 **少量深入的决策对照**，而非领域 Schema 模板库：信息与证据、实体与关系、更新与冲突、写入边界与恢复。每例给出既定模型语义、原始输入和旧知识，解释正确处理、危险反例、改变结论的相邻条件及可验证结果；示例的名字、字段和数据只在该情境有效。独立行为用例覆盖更多分支，不把测试全集塞入 Skill。正文保持 guidance 的条件式资源加载，执行/交付由宿主任务负责；实际技术签名和错误合同继续由 `kgos_docs` 维护。

验收分别检查职责/提示词文本、案例决策语义、实际实例操作和模型行为。隔离 Kernel/Lithograph 验证涉及的实例写入、回读、无关值与模型不变、约束拒绝、并发及结果未知后的状态核对；不以数据库接受证明真实事实，不以模拟回执缺失宣称已经注入真实网络故障。独立模型执行只接收原始任务与必要上下文，判据与预期留在评测端。实际结果和剩余客户端验收由 [Phase 27](../development/phases/27-knowledge-standards-skills.md)维护，具体规范由对应 Skill 包维护。

<a id="retrieval-standards-authoring"></a>

#### Retrieval 规范 Skill 的内容与验收设计

`kgos-retrieval-standards` 是当前任务中的**知识检索与证据使用指导**。R1–R6 分别约束使用时机/问题所需证据、模型驱动的策略、候选确认与关联、覆盖度/停止条件、State/业务时间、证据综合与结果交付。任务依赖已积累知识时主动使用实际可访问的 KG OS；不强迫每个一般问题查库，不以历史记录代替当前仓库/运行事实，也不替全局引导提示词承担宿主配置或自动激活保证。

已有准确 Ref 可直接读取；需要理解结构时渐进读取实际 Ontology，不臆造领域类型、索引或以 Domain 充当实例命名空间。查询选择取决于问题的精确性、关系和覆盖要求；不设全文→向量→图的固定流水线。候选需核对身份、范围、来源与条件；全文/语义分数不是事实可信度。按具体证据缺口补查；已足够回答时结束，无法补齐时交付有依据的部分与限制，不无限扩大或虚报完整。

完整枚举、存在性、否定结论和探索示例采用不同的充分性要求。分页/过滤/索引覆盖、对象数与路径行数、缺失值和失败均影响结论；受限检索未命中不等于不存在，数据库中未记录不等于现实世界为假。Managed Semantic 的单字段、先内部 limit 后 post-YIELD 过滤及 Provider 失败边界继续由 [Ontology](ontology.md#语义索引的首版范围)和 [Graph](graph.md#graph-公共调用合同)拥有，不复制 SDK 手册或发明预过滤参数。多次关联读取复用真实 immutable State；历史比较可用明确标注的不同 State，多库不宣称拥有全局原子快照。

本规范不写入或修复知识、模型、索引、分支或 VLog，也不把缺索引/Provider视为自动修复授权。只读通道不等于无外部访问或零成本；实际权限与披露边界仍由任务/宿主控制。宿主已有其它明确授权时，检索结果提供身份、范围、证据与未知项，后续动作由对应职责继续，不新增审批节点或将未决推断变成确定输入。

内容采用精简入口、按决策加载的专业参考及少量深入的正反案例；案例以既有模型/合成数据为条件，不是领域 Schema 模板库。验收分开记录文本与职责审核、原始任务的独立模型试验、真实隔离 Kernel/Lithograph 查询测试；本地可控 embedding 服务仅检验引擎/Provider 协议、排名过滤与错误路径，不证明真实模型召回质量或生产服务可用。源码、测试及修订证据归 [Phase 27](../development/phases/27-knowledge-standards-skills.md)，不把单 Skill 创作当作整包客户端安装完成。

<a id="branch-standards-authoring"></a>

#### Branch 规范 Skill 的内容与验收设计

`kgos-branch-standards` 是**知识世界组织和演进的 guidance**。长期领域库（如小说经验、个人学习、系统 VLog）及派生实验路径都是普通 Branch 的合法用途，不要求统一回到 main，也不以任务结束、长期未写或未合并认定应删除。用途分类不落成 Branch Type、Owner、归档状态或第二套注册表。物理 Knowledge Base/Instance 仍由 [Architecture](architecture.md#knowledge-base)拥有；Branch 是完整状态的命名演进引用，不是独立文件或权限隔离。Domain 只组织本体，不能充当实例目录或独立版本；具体模型/实例分别由 Ontology/Knowledge 规范负责。

B1–B6 分别约束世界边界、创建与起始 State、长期用途连续性、State/版本记录、世界协作与融合、生命周期/恢复。按用户实际用途及独立演进需求选择现有世界或新 Branch，不因主题、新任务、Agent 或数据量自动分支；也不以最少分支为目标否定明确需要的长期领域库。选择需要的独立 Instance 仅判断隔离边界，不授权部署或修改认证配置。

Branch Create 继承**完整**源 State，不自动清空、按 Domain 筛选或生成新 Commit。全新领域可从实际已核实、仍可访问且 KG OS-valid 的干净基线开始；裸 Lithograph Root 不自动满足此要求。确认“空”需有覆盖模型和用户数据的相应证据，不要求每次已知派生都全库导出；当前快照清空也不代表祖先历史没有原内容。缺合适基线时说明缺口，不未经授权清理已有库。名称与 Head、实际模型/数据及既有 Commit 简介共同辅助定位；Message 属于 State、State Data 是可变 Commit sidecar，均不是分支专属元数据。

协作区分跨世界读取、按目标模型选择性引入和整个 State 的 Merge；Merge 按祖先差异处理新增/修改/删除，不是集合并集或指定 Domain 的复制。不因无底层冲突推定模型/知识语义相容，技术一致性与领域决定各由原职责处理。只读评审不启动会持久化 Session 的 `merge.start`；已授权合并按真实 pinned inputs/revision/Head 核对，目标改变或回执未知时先观察而非强制重放。删除 ref、不再日常使用、保留历史和物理擦除分别处理，不虚构归档/备份/GC保证或 SDK 能力。

入口保持最小核心与明确条件式引用；案例解释世界划分、起点继承、融合选择及历史生命周期的相邻合法情况，不复制 SDK 手册或领域 Schema。内容真源在 Skill 包，实际源码/资源审查、独立模型选择试验及隔离 Evolution/Kernel 测试归 [Phase 27](../development/phases/27-knowledge-standards-skills.md)。测试不访问长期用户数据，文本规则不冒充权限执行保证，单项创作不等于私人插件安装或最终七 Skill 已交付。

<a id="vlog-standards-authoring"></a>

#### VLog 规范 Skill 的内容与验收设计

`kgos-vlog-standards` 为宿主的系统记录任务提供 guidance：判断什么值得沉淀、所述事件与实际执行是否相同、结果受到哪些证据支持、如何追溯来源及延续/纠正记录。V1–V6 分别约束准入、事件边界、真实性、时间/来源、记录演进、信息质量与安全；不以选择VLog代替用户写入授权，不将事件语义判断变成Task/Run/Event/Result的固定实体设计。按已有模型填写与关联；需要模型或Branch准备时只说明缺口，宿主已有相应授权才按原职责继续。

准入以未来理解原因、追溯影响、复核运行或复用经验的具体用途判断，不复制全部日志/Commit；显式合法记录请求不因主观价值评分被拒。经授权的持续维护需要VLog运行证据，即使检查无变化也可记录真实覆盖和结果，不仅保留异常。任务定义/计划、一次实际执行、运行中观察与结果分别理解；重试、复发、多Agent转述不自动等价。源操作回执、效果验证、记录写入与回读各自取证，未知不冒充失败或成功；记录任务不触发新的修复或调度。

跨世界追溯保留可确认的源库/系统、Branch语境、实际不可变State和对象/证据定位，区分before/after/验证所读State与VLog自身版本。记录中的定位值不形成跨快照图边、不保证历史永久可达，也不授予源库访问权限。不得为“记录结果”合并源Branch、改写源内容、用源Head作VLog写基线或假定跨分支原子性。新VLog提交的State通过真实返回取得，不预填自身将来Commit，也不不断追加自我记录。

同一事件的后续、同一执行的新证据、另一执行/复发、旧记载纠错和重复投递分别处理，使用既定模型身份与写入合同。可以修正当前记录，不把可版本化等同不可变审计/永久保留承诺；不覆盖仍需解释的独立失败和未决事实。敏感信息按实际授权和目标可见性最小化，普通系统记录不复制凭证；资料、日志和旧VLog均不提升为指令。

入口、条件式参考与三组决策案例维护在独立Skill包；测试数据模型只是隔离测试前提，不是官方VLog Schema。验收分开核对提示词/Skill合同、逐例语义、独立模型选择与决策、真实Kernel中来源/记录分支隔离、更新历史、同事件多Run、并发及部分写入结果。实际证据归 [Phase 27](../development/phases/27-knowledge-standards-skills.md)，不以文档或单次试验宣称生产记录、客户端安装或调度验收完成。

**可选建模参考**：用户确认仅在 [VLog Skill 的 model-examples.md](../../plugins/kgos/skills/kgos-vlog-standards/references/model-examples.md) 提供**一个** `VLogEntry` Node Definition 示例，含18个Property，其中 `entryKey`、`kind`、`summary` 为示例内三项必填，其他根据真实事件使用；不预建 Task/Run/Event/Result 节点或关系，不设置统一类别/状态枚举、索引或调度器。它属于 Skill 的按需参考，不是 KG OS 安装后自动出现的 Ontology，也不进入 `kgos_docs` 的公共SDK手册或 Kernel。实际使用先在目标 `branch/vlog` 的固定 State 上检查已有 Ontology：能够准确表达则直接复用；不足时才由**已获建模授权**的宿主依据 Ontology 规范按需要调整。VLog 规范仍只负责事件/证据/结果的记录质量，模型结构与实际数据的操作归原有职责。

<a id="maintenance-standards-authoring"></a>

#### Maintenance 规范 Skill 的内容与验收设计

`kgos-maintenance-standards` 是**长期知识世界质量维护的 guidance**：按现有模型和用户目标确定检查的Instance/Branch、固定State、业务时间、对象/关系及证据覆盖；识别候选、确认真实问题或合理差异；选择保留、补充、局部纠正、审慎去重或指出模型缺口；核对目标问题、必要关联和无关对象，并结合真实历史指导后续关注点。M1–M6只约束AI决策，不成为持久字段、Kernel检测算法、质量分数或独立工作流。

重复、冲突、过时和缺关系须按实际身份作用域、来源、事实与主张、适用条件、业务时间和模型约束判断。文本同名/相似度、Commit较新、节点孤立、仅一页/Top-K未命中均不自动证实质量错误。**确认冲突不代表有依据选择赢家**；已证实问题且用户授权足够时也不无限搁置。按明确目标限制检查和影响：局部问题不强制全库扫描，要求全库覆盖时不能用抽样宣称完成；足够有界的零问题检查也可以是有效维护结果。

维护评审不产生写入权限；用户授权“检查并修复”时，已确认的局部修正与相应验证可以继续，但不自动包含删除全部疑似重复、批量迁移、修改Ontology、世界Merge、运行Scheduler或写VLog。具体实例/模型/检索/Branch操作回到对应规范及现行 `kgos_docs`；Doctor仍仅负责环境/就绪诊断。Target Branch并发、旧baseState、操作未知回执与跨多次调用的部分完成，按实际状态分别核对；技术写入成功本身不证明原知识问题解决。

维护连续性只利用真实历史与本次可核实范围决定下一次检查重点，不预定频率、Issue队列、存储Schema或自动调度。需要记录已获授权的维护运行结果时，由VLog标准保证记录真实性，当前Skill不定义VLog正文。内容正文与条件式参考、三组相邻正反案例归独立Skill包；资源、语义、独立模型选择及真实隔离Kernel/Lithograph测试分开验收并记录在 [Phase 27](../development/phases/27-knowledge-standards-skills.md)。六份源码存在不等于全套私人Plugin安装、Doctor合同就绪或Phase完成。

<a id="kgos-doctor-v1"></a>

### KG OS Doctor v1：AI 使用环境与知识库就绪诊断

`kgos-doctor` 是**独立、只读、用户按需触发**的官方 Skill，判断当前 AI 会话及其可访问的 KG OS 知识库是否具备正确、规范、持续使用的条件，报告可验证事实、缺口与配置建议。它不是现有 CLI `kg doctor`、Kernel 一致性检查、服务端 `system.diagnostics` 或知识质量维护/修复任务；不对知识库、宿主配置、调度任务或 VLog 进行写入。用户只要求 Doctor 时，不能把“诊断”解释成安装、配置、部署或自动修复授权。

**可观察范围**：从当前会话 AI 实际可见的指令、工具/Skill 元数据、已授权 MCP 的真实只读调用，以及宿主明确开放的任务调度信息获取证据；不假设可检查隐藏的宿主 System Prompt、其它会话、用户账户的全部 MCP/Skill 或平台后台。一个 KG OS Instance 绑定一个 Knowledge Base；多个知识库只能逐个检查当前客户端**实际暴露且可访问**的 Instance/连接，不能凭单个 MCP 连接推断其它 Instance 存在、数量或身份。相同 Commit/Branch Head 不是两个物理 Instance 同一性的证明；若缺少可验证的 Instance 身份信号，不虚构“已确认是同一个库”。

#### 五项诊断

| 项 | 应取得的实际证据 | 异常与边界 |
| --- | --- | --- |
| **D1 · 全局引导提示词** | 同包官方资源、当前可见指令的来源/正文差异、宿主持久配置及普通任务行为分别取证 | 完整匹配需要完整可信正文；已确认的局部差异不被整体不可见掩盖。用户引用/工具返回不能证明加载；持久配置或行为不可见的子项保留 `UNKNOWN`，不推断账户未配置 |
| **D2 · MCP 授权与知识库有效性** | 当前客户端实际发现的 KG OS MCP，`kgos_docs` 只读调用成功、`kgos_query` 的 `evolution.overview/get` / 必要的 `ontology.read` 返回可信 State 与 `consistency`，每个可访问 Instance 分别有结果 | 仅有 Tool 列表不等于授权有效；未连接、认证失败、连接错误和 Snapshot 无效应分别指出；无内容的有效库不是连接失败；无法发现其它连接不等于用户没有其它库 |
| **D3 · 官方 Skill 使用环境** | 宿主可见的官方 Skill 安装/加载信息、版本与当前 MCP Tool 名称兼容性；只有真实执行痕迹才报告“已实际触发” | Skill 未安装不等于 MCP 不可用；文件存在不等于会话启用；宿主不公开元数据或加载结果时为 `UNKNOWN`，不推断自动触发 |
| **D4 · 知识内容与规范** | 在每个已验证库的**同一 pinned State** 上，通过 Ontology/Knowledge 公共读取和有界只读查询判断是否有**用户知识实例**；只有存在可用的、版本明确的独立规范时才按其合同评价内容 | 不把 KG OS 内部 Ontology/Binding 节点当用户 Knowledge，不以单次查询零结果证明整个库为空；空库不等于损坏；规范 Skill 尚未设计/无法使用时把“质量符合性”记作 `UNKNOWN`，不得创造评分或强制领域模型 |
| **D5 · 持续维护与 VLog** | 经授权的外部任务平台证明任务存在、启用、计划与最近运行情况；逐库查看 `branch/vlog` 中可识别的高价值运行记录，核对最近结果、问题、处理结论与相应 State/Commit 证据 | 有 VLog 不代表调度仍启用；有调度不代表实际成功运行；未开放调度读取时只报告无法核实；只有已适用的维护/记录要求存在确定缺口才给 `WARN`；未启用的选配能力不是故障，不自动建立任务或补造 VLog |

**执行依赖**：D1 与 D3 可先按当前宿主可见性判断；D2 是数据库检查 D4 和 D5 中 VLog 读取的前提，但 D5 的外部调度状态可以独立检查。某连接无法读时只对该连接报告失败，依赖它的内容/VLog 子项标明 `UNKNOWN`，仍检查其它有效连接和可独立访问的调度信息。只读检测不执行 `kgos_mutate`、`graph.execute`、写入探针、全库无界扫描或隐藏的“为了检测而修改”；优先使用已存在的 `kgos_docs` 指南与五个 AI-facing Tool，不新增 Doctor 专用 MCP Tool。只读成功只证明已测试的读取权限，不能冒称写入权限已实测。外部平台任务状态只有在客户端确实可获取并授权读取时才检测；`kgosd` 本身不提供 Scheduler。

#### 系统级 VLog 约定与所有权

`branch/vlog` 拟作为**每个 Knowledge Base 内**由官方 Skill/外部 AI 共同遵循的系统级高价值记录空间，可用于周期性自检/整理任务、重要诊断结果、维护操作、模型演进、关键决定与重大事件。AI 提炼有依据的结论，记录实际执行时间、结果、影响范围、相关版本和证据；不复制普通调用日志、全过程调试输出、Token/密钥或其它无意义/敏感正文。写入权限来自各执行任务本身的明确授权，**Doctor 只读取并检查记录**。

该约定建立在现有 [Evolution Branch/State](evolution.md#branch-与-tag) 与调用方可定义 [Ontology/Knowledge](ontology.md#使用模型) 上：`vlog` 仍是普通可移动 Branch，拥有完整 Snapshot/Commit 历史，从源 State 创建时会继承既有业务模型与数据，**不是单独日志数据库或物理隔离区**；记录不会自动合并到 `main`，也不能默认把其普通继承内容当成 VLog 事件。KG OS Kernel/Lithograph 不预留名为 `vlog` 的 Branch，不硬编码日志 Schema、专用 Scheduler、Agent 或新查询接口。VLog Skill 中的 `VLogEntry` 仅是推荐范例；没有该类型也不自动判记录违规。实际保留要求由用户场景决定。仓库的 `docs/vlog/` 是开发日志目录，**不是**运行时 `branch/vlog`。

Doctor 只读取目标 `branch/vlog` 已存在的真实 Ontology 与 Knowledge，在能够可靠辨认记录身份、实际运行时间、任务/Run归属、结果与验证依据的范围内作结论；不能硬编码 `VLogEntry`、字段名或假设所有库采用推荐模型。无法确定记录语义、查询覆盖或版本证据时相应结论为 `UNKNOWN`，不能把字段缺失当成系统运行失败；只发现一个 `vlog` Branch，也不能推出任务已建立或最近运行成功。任务启用/预计时间仍属于外部调度平台，实际运行结论与 VLog 记录分别取证；不能互相代替。

#### 诊断状态、报告与未冻结细节

先依据任务目标和已启用能力判断适用性。预期空库、未启用 VLog、选择手动维护不自动构成缺口；不适用项说明原因，不计为通过或失败。目标不明时保留事实与判断限制，不为可选项逐项索取需求。适用检查中，每一项和每个已发现 Instance 分别给出 `PASS`（已确认满足）、`WARN`（有证据的使用缺口/建议）、`FAIL`（已确认不满足核心可用性或真实失败）、`UNKNOWN`（权限、宿主可见性、依赖或规范缺失导致无法判断）。报告必须包含检测范围、目标连接/State、检查依据、实际发现、原因与下一步引导；**未执行**和**不存在**不同，不以 `UNKNOWN` 冒充 `PASS`，也不生成缺乏证据的单一健康分数。关键接入失败与选配项（如周期任务或 Skill 缺失）应在摘要中分别说明；Doctor 的结果不构成修改授权。

#### Doctor Skill 与全局引导（初始设计：2026-10-21）

Doctor 的主类型为 **workflow**：它拥有“发现实际可访问范围 → 按新证据选择可执行检查 → 交付只读诊断”这一结果；不是第七份通用规范、Router 或维护 Agent。D1/D3/外部调度独立，D2 目标 State 的读取证据决定 D4/VLog 是否可继续。用户指定检查只执行相应范围及前置；全面诊断才覆盖 D1–D5。资源与具体判定由 [Doctor Skill](../../plugins/kgos/skills/kgos-doctor/SKILL.md)维护，技术签名仍从当前 `kgos_docs` 获取。该 Skill 的规范文本不是新的权限执行层。

全局引导词的唯一可编辑正文是 [Global AI Guidance](../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md)，具体责任与生效边界见[全局引导与日常职责](#global-ai-guidance-and-daily-responsibility)。当前 Doctor 包只分发这一份无版本号正文，供无 MCP 时对照，不计为额外 Skill，也不自动安装或注入宿主。引导词不独立编号；发行版本由 KG OS Release Tag 及同包 Plugin 标识，历史正文从对应 Tag / Release 取得，不能用当前文件冒充历史发行基线。

D1 分别报告**官方资源、当前可见指令、宿主持久配置、实际行为**。完整匹配须有完整可信正文，仅统一换行及末尾换行；已确认的可见条款差异须单独报告，不因其余配置隐藏而全部归为 `UNKNOWN`。正文来源与比较范围须明确；引用、对照资产、用户称已保存均不单独证明加载。已声明定制仍报告差异，不等同插件故障；无法核实历史来源时不臆断旧 Tag 或升级方向。行为仅凭可见普通任务轨迹判断，合理缓存复用、权限及更高优先级限制不算违规；Doctor 自身探测不证明此前或未来生效。持久配置与行为的未知分别保留，不泄露隐藏正文。

D2 的最小实测绑定一个明确目标 State，分别核对文档成功、实际读取、`valid` 一致性和 Ontology 可读；空模型仍可通过基础可用性。D3 分开安装、发现、加载、可见版本、兼容与使用证据；没有可靠完整目录或官方版本证据不宣称缺失或最新，不要求读入全部兄弟 Skill。

D4 限于**知识使用就绪性**：业务实例是否可解释/读取，Branch 简介与模型导航能否定位已观察内容，以及按实际可用规范发现的明显问题。不把原始图中的内部节点当用户知识，不以空模型、单页零结果或抽样通过断言全库为空/合格，不执行深度知识治理。缺可选说明或 Domain 不自动违规；缺规范时质量子项未知，已确认的读取事实保留。完整 Overview 超限时可用已验证 State 的有界 Ontology 读取继续，不能把局部读取冒充全视图成功。

D5 将任务定义/启用/计划、实际运行、记录保存、效果验证与问题连续性分开取证。按实际任务周期/时区和发生时间判断，不设统一过期天数；没有自动任务本身不构成缺口，手动维护合法；已约定周期维护而缺配置/有证据确认到期未执行时才报告相应缺口。未启用 VLog 不自动告警；已要求记录而目标缺失时报告未满足的记录条件。VLog 只按实际 Ontology 有界辨认，不以推荐模型为前置；记录中的成功主张不能代替源运行及效果验证。只读诊断不执行外部 Provider 测试或副作用不明的 Procedure，不增加后端接口。

**内容合同与宿主实证分离**：正文及判定已确认；宿主是否开放指令来源、Skill/版本/轨迹和任务 API，仍以当次真实能力为准，不可见即 `UNKNOWN`。各客户端真实安装、自动选用、不同 VLog 模型识别的验收证据由 [Phase 25](../development/phases/25-kgos-doctor.md)记录，不由源码创建推定全部通过。

<a id="task-scoped-knowledge-loading"></a>

## 初始化知识加载与知识记录质量

[D111](decisions.md#d111-task-scoped-knowledge-loading) 补充知识发现的适用范围；[D112](decisions.md#d112-global-ai-guidance-and-daily-responsibility) 以用户选定的六部分完整版更新日常责任与触发边界。先确定允许的环境与连接，再使用现有入口选择相关知识世界。本节不是 Web 首次安装流程，不新增 Kernel Agent、路由 Skill、知识库注册表或工具。旧包与私人安装不会自动升级；正文、安装指导及 Doctor 验证由 [Phase 32](../development/phases/32-knowledge-use-readiness.md) 实施。

### 先选择环境和连接

一个 Instance 对应一个物理 Knowledge Base；库内不同 Branch 可以承载经验、资料等长期逻辑知识世界或实验版本。多个连接可能指向不同实例，也可能指向同一实例。连接名、相同 Branch/Commit/elementId 不足以证明物理身份相同。使用用户明确选择、可信宿主配置及实际可见的连接信息确定范围，不假设存在未提供的身份或环境查询接口。

正式任务不得默认读取测试连接，包括其预览、Commit Message 和 Knowledge。测试任务使用已确认的测试范围；需要引用正式资料时明确只读来源范围，不扩展为修改。用户明确要求跨环境对照时，分别取证并标注环境，不能把测试结果提升为正式验证。已有明确目标时沿用，不反复确认；没有可靠依据区分环境时先询问，不先读取双方内容再猜测。连接不可用不自动换库，独立工作可以继续。

Branch 不提供独立认证或物理隔离，提示词也不提供权限保证。强隔离依赖实际连接权限和宿主能力。任务从测试切到正式时重新限定证据，不把先前测试内容作为正式事实，也不声称已经从上下文物理删除。

### 在允许范围内按用途读取

复用 `kgos_ontology_overview` 发现当前实例的 Branch、简介和模型，依 `viewRevision` 渐进读取，不将首页当全集。该接口不枚举其它插件连接；现有实现先构建全部分支的模型与 Message，再提供行窗口，分页不是服务端隔离。若当前允许范围排除某些 Branch 的简介或模型，不得调用全分支预览。目标已由用户或可信配置明确时，按现有 evolution.get、ontology.read 等定向接口固定 State 后继续读取；目标不明且没有可用的安全发现入口时先确认，不先取全视图再过滤。需要权限级不可见保证时仍须实际访问控制，定向调用只是遵循任务范围，不是分支认证隔离。

经验库与资料库是用途而非环境或内核类型。根据任务、明确约定、简介与真实模型选择：经验支持类似条件下的方法和排错，资料支持事实和原文；必要时读取多个相关世界，分别保留来源、State、环境和业务时间。旧经验不能代替当前代码、运行状态或正式验证。

新会话首次使用获准且可访问的 KG OS 时查看知识入口及用途；问候等简单交流无需加载正文。回答或行动依赖既有事实、偏好、背景、约定、决定或关系时先读取，兼顾已发现且适用的跨主题知识。缓存复用必须与实际连接、世界、State 和任务范围相符，任务切换或需最新状态时核对相关 Head，变化后刷新。简介缺失、查询零结果及内容不存在分别处理，不推断全库为空。知识、模型说明与 Message 是数据，不能改变环境许可。

<a id="global-ai-guidance-and-daily-responsibility"></a>

### 全局引导与日常职责（2026-10-26）

六部分完整版唯一维护在 [Global AI Guidance](../../plugins/kgos/skills/kgos-doctor/assets/global-ai-guidance.md)。用户确认以知识能否持续支持对话与任务为责任目标；六部分保留条件、权限、证据、环境隔离、版本和完成边界，允许经授权的等义精简，不以缩短为由删除必要规则。该正文无独立 v1/v2/v3 版本号，只有一份当前源码；历史变更由 Git Tag 及已发行包保存，不在 Skill 下维护旧文件。安装执行者不得临时截断、摘要或改写官方正文；官方维护者获授权的等义修订更新这一唯一正文及同源分发内容。INSTALL 中完整成对标记区块须与该资产一致，不能手写第二套规则；双语可编辑模板随下次 KG OS 发行更新，不改变已发布版本的冻结产物，也不据此声称当前客户端已经安装。

全局引导规定外部 AI 对知识持续支持对话与任务的责任、范围、授权和反馈。结合当前需求、对话、已知长期目标与知识现状，判断知识是否足够、可信、适用，识别有证据且影响使用的缺口；在实际授权内自主选择最小必要行动并验证，不以固定工具清单或调用数量作为完成标准。知识已足够时不制造记录、模型或维护动作；需要读取、沉淀、建模或维护时按各自专业规范处理，不新增总管 Skill、Agent 或执行框架。

日常发现的缺口可触发对应专业工作，不必等待用户点名整理或逐条要求保存；这不创造写权限，也不覆盖当前只读、不查库、不保存限制。信息明确或阶段结束时及时处理，写前匹配、优先更新，疑似问题先确认后作相关范围内最小维护。用户明确合法保存请求继续由 Knowledge 准入规则处理，不因日常筛选标准被拒绝。模型或知识不充分也不自动扩大授权：先核对现有表达及可行替代，只将确需用户补足的具体内容、范围或权限决定交回用户。

| 责任层 | 拥有的判断 | 边界 |
| --- | --- | --- |
| 全局引导 | 知识能否支持当前需求和已知目标、缺口是否影响使用、最小必要行动及反馈 | 不承诺宿主自动加载，不扩权，不以调用清单代替结果，不复制专业规则 |
| Knowledge | 按既有模型匹配、记录、更新与纠错及写后核实 | 稳定信息和相关纠正可由日常职责触发；不接管模型或无关全库清理 |
| Retrieval | 相关事实、偏好、背景、关系与跨主题证据的可靠读取 | 受范围与不查库要求约束，不自动修改发现的问题 |
| Maintenance | 已发现的一组疑似质量问题及相关范围的确认、最小处置和复核 | 也可由日常任务发现触发，不把每次实例编辑扩大为巡检 |
| VLog | 值得留存的系统决定、运行、验证和经验的记录质量 | 实际授权内及时记录，不重复每个调用、不接管修复或调度 |
| Ontology / Branch | 模型与知识世界/版本的各自专业判断 | 沿用既有职责；删除、合并、改模型、跨库处理核对实际授权 |
| Doctor | 按请求只读诊断正文、连接、Skill 与使用证据 | 不逐次运行、不实施日常维护；诊断结束交还宿主继续已授权任务 |

必要指导、连接或权限缺失只阻断依赖部分；先检查现有证据和可行替代，仍需用户决定时给出具体阻塞、已尝试方法、所需动作、推荐方案及影响。未知写入回执先检查实际状态，不换库或盲重试；重新批准不能代替执行证据，仅当具体恢复措施新增风险、受保护动作或超出原范围时取得对应授权。用户请求的读写交付实际结果；日常授权维护不逐条播报，影响结论的纠正、未决冲突、失败和待决定事项须简要说明。接口、名称与提交规范仍由当前 `kgos_docs` 及各 owner 维护。

### 知识名称与提交说明的产品质量

本项解决用户在知识库目录和版本记录中实际看到的名称与说明，不把私人聊天风格、固定报告话术或角色切换习惯作为产品功能。公共 Branch、Commit、State 和接口名称保持不变。

#### 分支名称

新建面向用户的知识世界或测试空间时，名称以用户使用的语言表达实际用途；保留用户明确指定的合法名称和已有稳定引用。用途应是名称主体，只有同用途需要区分时才添加场景、日期或短编号。不得仅以工具缩写、随机串或执行时间替代用途；不统一强制中文、固定前缀、大小写或斜杠树。命名只组织知识，不提供权限、环境或物理身份保证。

例如 `overnight-memory-20261025-1809` 作为面向中文用户的默认名称不足以表达具体用途，可用“长期记忆测试”表达目的；多人编辑的对照空间可用“项目协作测试·修改方案乙”。示例不是全局命名表，不授权重命名既有分支。先核实实际名称合法性和同名用途；合法字符受当前 API 合同限制，不能先假定示例必可写入。发生冲突时保留可理解的区别，不悄悄换成随机名称。

#### 提交说明

沿用[Commit Message 作为版本动态简介](#commit-message-作为版本动态简介)的两节结构和提取合同，不另建描述字段。官方 AI 在已授权、方法支持 message 且实际产生新 Commit 的路径，应按约定提供有内容的说明；Kernel 可选 message 的兼容性不变。内容质量要求：

- 简介首个非空行能独立说明当前知识世界的主要内容和用途；测试/合成资料必须明确性质。简介描述提交后已知完整范围，不只写本次新增项，不虚构未读取的全库事实；知识不足时先读取必要模型/资料或明确已知范围。
- 改动说明本次实际新增、修正、删除的对象和内容，必要时区分未验证效果及未解决问题；“更新”“测试成功”“合成最小复现：inline KEY”不能单独替代说明。
- 技术细节可保留，但不能代替用途和变化含义。“合成项目与负责人资料”有内容却缺使用目的，不能只凭标题齐全判定合格。
- 写入前检查名称/说明与实际目标、已知内容和操作一致；写入后按返回的不可变 State 回读实际 Message，再在允许读取预览的范围核对解析及展示。未知回执先核实状态，不重复写入；已有并发前进时区分本次版本与当前 Head，不把别人的新版本当作本次结果。
- 方法不支持 message、没有新 Commit、快进复用来源说明、历史记录缺失说明时，按实际结果记录适用性；不得伪造参数、强制额外空提交或修改 immutable Message。受限范围不允许全分支预览时，沿用定向读取，预览验证留到允许全视图的隔离测试中，不为验收越权读取。

#### 组件所有权与交付边界

| 组件与实际来源 | 本阶段修改 | 不承担的职责 |
| --- | --- | --- |
| `plugins/kgos/skills/kgos-branch-standards/references/origins-and-identity.md` | 命名判断、同名处理、用户指定名称及正反例 | 不新增命名字段或自动迁移 |
| `docs/guide/mcp-guides/evolution.md` | 提交说明内容、适用条件及回读规则的可执行唯一正文；提供仅 MCP 客户端可独立使用的最小命名要求及例子，不依赖其访问仓库 Skill | 不把模型指令变成 Kernel 强校验 |
| 分支 Skill 的 `references/versions-and-records.md`；知识 Skill 的 `references/write-verification.md`；本体 Skill 的 `references/evolution.md` 及各入口 | 在各自写入场景指向上述指南，保留独立使用必需的最小条件；普通知识编辑不依赖额外加载分支 Skill | 不复制第二套完整提交规范，不增加第八个 Skill |
| `packages/sdk/src/client.ts`、`packages/sdk/src/types.ts` 的方法/字段文档，`internal/mcpserver/server.go` 的 mutation Tool 说明 | 在 branch.create 命名入口、实际接受 message 的方法入口及 MCP mutation 入口提供短指引；明确先读服务端可达的适用指南；方法能力以类型和运行结果为准 | 覆盖实际支持 message 的 Patch、Graph execute/streamExecute、state.create、merge.finalize；不为 branch.create 等未支持路径发明参数 |
| `scripts/generate-mcp-docs.mjs` 及 `internal/mcpserver/docs/` 生成产物 | 通过已有生成链同步方法、类型与指南，检查来源与服务端可读文档一致 | 不直接维护生成副本、不无故修改生成器 |
| MCP Preview 与 Web 现有名称/版本显示 | 验证真实名称、简介提取和完整 Message 展示；发现实际提取/呈现缺陷时修复对应实现 | 不用显示别名掩盖原始数据，不自动改历史 |
| Kernel / Evolution 持久化 | 保留既有数据与接口合同 | 不新增强制格式、分支描述或历史重写 |

此方案通过写入指导、独立场景行为验收和持久结果检查提高质量，不声称提示词保证所有模型永远遵守。格式/资源一致性可自动检查，内容用途与真实变化仍须场景证据审核。来源缺失、规则未加载、生成不同步、真实写入不符分别保留发现，不能由文字审核替代行为验收。

现有数据整理与新写入规范是不同交付：本阶段列出旧记录问题、引用影响和可行处理方案，不默认执行重命名、删除重建、空提交补简介或改写历史。旧 Commit 原文继续可追溯；真正需要整理时另获具体对象和动作授权。更新 Skill、MCP 服务及账户安装分别验证，仓库文档提交不代表任何运行环境已生效。

### 规则所有权和升级

全局引导拥有初始化选择次序；七个 Skill 保持现有职责，处理选定世界内的专业判断。独立使用的 Skill 保留避免错目标所需的最小规则，不复制完整引导或新增必须加载的总规范。

更新规则时使用明确的新版本标记，同步唯一对照资产、安装说明与 Doctor 检查。保留现有用户指令，不把仓库更新当账户已更新，不把读到资产当宿主已加载。Doctor 分开报告可观察的连接范围、选择依据、正文加载和实际行为，缺证据记 UNKNOWN。文本审核、场景推演与真实客户端行为测试分别取证。

## 对照与验收边界

- **已验收旧镜像**：`@kgos/sdk` 的 Ontology/Object/Graph/Evolution 公共方法、单 `kgosd`/Instance 的安全 Go MCP/QuickJS、原四个 AI-facing Tool、app-only Web UI Resource，以及 Phase 22 的 `docs.read`/固定文档与 Lithograph v0.3.1。旧 Tool/Docs 在 Dev 的成功不证明 D102 已部署；证据见 [Phase 22](../development/phases/22-mcp-self-describing-docs.md)。
- **Phase 23 `done`**：五个 AI-facing Tool、独立批量 `kgos_docs`、旧 JavaScript `docs.read` 删除、Web Bridge、私人 Skill/Plugin 与 Ontology/Patch Guides 已实施并部署 Dev；修复分支安全文档问题后，用户报告的真实 ChatGPT 客户端五 Tool/31 SDK、隔离写入和错误恢复通过（总体覆盖标记 `PARTIAL`，不等于 SDK 缺陷）。Mac 全量质量、OpenClaw 原样 Docker/31 SDK 隔离、最终实现提交 `cfa3917` 的 [GitHub CI 2/2](https://github.com/bYiyLi/kg-os/actions/runs/39001850377) 全部成功。详情和客户端未覆盖项见 [Phase 23](../development/phases/23-mcp-tool-taxonomy-and-docs.md#阶段关闭记录2026-10-17)。
- 实现验收需要覆盖多个分支的不同 Head、两分支指向同一 Commit、Branch 并发前进、历史 Commit、Preview 分页拼接/过期、Ancestry 游标稳定与多父 DAG / 跨页父结点、完整原始 Message / 嵌套代码围栏与无 Message、Domain 循环、多重成员、`null` 端点、跨 Definition 共享 Index、canonical YAML 完整往返、长文本及 Markdown 注入、渲染后绝对行号、无法解释的 Snapshot、大型 Ontology 资源限制、安全沙箱逃逸、错误与取消后写入状态未知、真实 ChatGPT 认证/Plugin 流程。没有这些证据不能宣称 MCP 或 ChatGPT Web / Desktop 集成已经完成。

协议与安全依据（核对日期：2026-10-11）：

- [OpenAI：Build an MCP server](https://developers.openai.com/plugins/build/mcp-server)
- [OpenAI：Package your plugin](https://developers.openai.com/plugins/build/plugins)
- [OpenAI：Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt)
- [OpenAI：Build skills](https://developers.openai.com/plugins/build/skills)
- [Node.js：VM is not a security mechanism](https://nodejs.org/api/vm.html)
