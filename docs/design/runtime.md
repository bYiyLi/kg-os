# 本地运行时

本文件是 KG OS v1 **Go `kgosd`、统一 HTTP 监听与 Web/MCP hosting、Workspace Root / `.kgos` Instance Directory、动态 loopback endpoint、Instance Token、native Runtime package、Embedding Provider startup config/cache mapping 与 daemon lifecycle** 的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；MCP 协议、外部认证与沙箱见 [MCP](mcp.md)，TypeScript Client / npm 分发见 [Client](client.md)，CLI 命令见 [CLI](cli.md)。

## 本地服务模型

KG OS v1 采用 Go 实现的 `kgosd` daemon，作为 API 与内置 Web 的统一运行时入口；**Phase 16 目标**是把 MCP 接入同一服务进程、同一 HTTP listener，Kernel 与数据库调用编排仍在该服务内执行：

```text
@kgos/cli / @kgos/sdk ── API HTTP ────────────┐
Browser ───────── 页面 / API HTTP ────────────┤
                                              ▼
                                      kgosd（Go）
                                      ├── --root <workspace-root>
                                      ├── 内置 Web
                                      ├── net/http API
                                      └── KG OS Kernel → database/sql → Lithograph
```

`kgosd` 当前已承载 API 与 Human-facing Web；目标增加 MCP 与 OAuth HTTP endpoints，而不是再启动一个 MCP Server。CLI、SDK、Web 与 MCP 共享同一个 KG OS Kernel 和 Object / Graph / Evolution 业务合同；Web 静态代码仍只在浏览器运行。v1 不为 CLI 再建立 Unix socket / Named Pipe / gRPC 私有协议。

## HTTP bind 与 active endpoint

CLI-managed v1 Runtime 只使用 IPv4 loopback HTTP。每个 Instance daemon 启动时绑定：

```text
127.0.0.1:0
```

端口 `0` 表示由 OS 为本次进程分配空闲端口。实际 endpoint 不是持久配置，而是在 daemon 完成 startup validation 与 bind 后写入当前 Workspace Root 的 `.kgos/kgosd.lock`。因此多个不同 Instance 可以同时运行，不需要用户手工分配端口，也不会因为固定 `4765` 冲突。**D105 的受限 Web 模式**可以先发布可连接的 listener/locator，但此时 locator 只证明端口可达；只有 [setup status](#web-first-run-bootstrap) 的 `ready` + 真实 runtime checks 才证明**业务可用**，CLI/SDK 不能再仅凭 locator 将未初始化实例当作业务 ready。

CLI 不从 `config.toml` 推测 endpoint，只使用当前 Instance Directory 的 active lock locator。v1 的 CLI-managed Runtime 不提供 LAN / wildcard bind；如果未来需要远程或多机访问，必须单独设计 TLS、endpoint discovery 与 deployment/security contract，不能把本地 single-token loopback 模型直接外推到不可信网络。

Phase 16 [统一 MCP 接入设计](mcp.md#部署与责任划分)将在 `kgosd` **现有同一 HTTP handler** 中注册 `/mcp`、OAuth 与发现路由。现有 CLI 自动启动路径仍保持 `127.0.0.1:0`，不因安装 MCP 就自动开启公网监听；只有显式网络配置才可扩大监听范围。MCP 外部 Token / OAuth 与原有 API 的 Instance Token 分离，不能把 MCP OAuth 凭证直接作为 `/api/*` 的认证旁路。

普通 API request / response 使用 HTTP + JSON。Phase 02 已有的 Ontology editable-body adapter 继续可以通过 `Accept: application/yaml | application/json` 返回单 Object body；D73 新增的**通用 Object batch read**则通过 JSON `ObjectReadResult` 一次传输整批 logical Object Value，canonical YAML / raw JSON batch body属于 client presentation，不要求 daemon 再逐 Object做 representation negotiation。Graph streaming 使用 HTTP streaming + NDJSON。具体 HTTP method / route / metadata carrier 仍属于 HTTP adapter mapping，但不得改变 logical contract。

### Graph HTTP streaming framing

Graph HTTP streaming 把底层 `lithograph_rows()` success events 映射为 NDJSON `columns`、`row`、`summary`。HTTP adapter 额外定义一个**只用于流式失败的 terminal `error` event**：

```json
{"type":"error","error":{"code":"IO_ERROR","message":"...","details":{}}}
```

- streaming success response 的 Content-Type 为 `application/x-ndjson; charset=utf-8`。daemon在拿到并完成第一个 Lithograph event的 adapter encoding之前不得提前提交 2xx status；如果此时已经失败，使用普通 non-2xx `application/json` public error envelope，response body不进入 NDJSON stream。
- 一旦 `columns` 或任意 `row` 已经写出，HTTP status 已经不能再表达后续数据库失败；此时成功必须以唯一 terminal `summary` 结束，失败必须尽力以唯一 terminal `error` 结束，二者互斥。`error` 不是 Graph query row，也不改变底层错误 code。
- 如果 socket/write failure、process termination 或其它 transport failure 导致 daemon 无法发送 terminal `error`，client 只会观察到没有 `summary/error` 的不完整 stream；这必须被解释为 transport failure，而不是成功或“没有副作用”。
- v1 streaming 使用 pull-based backpressure：daemon 只有在当前 event 已完成 NDJSON encode、写入并 flush 到 HTTP writer 后，才从 SQLite `Rows` 拉取下一个 event；不得用无界 goroutine/channel 预读数据库结果。client disconnect / write failure 取消 request context并关闭 rows，使 driver能够触发 SQLite interrupt / cursor cleanup。

SDK / Web 可以在消费到 partial rows 后报告 terminal daemon error；CLI 的 stdout/stderr/exit 映射由 [CLI](cli.md#error-与-exit-code)定义。

## Web hosting

`kgosd` 自己提供 Human-facing Web：

```text
http://<host>:<port>/          → Web UI
same origin                    → KG OS API / streaming
```

Web 构建产物随 Linux amd64 Docker 镜像一起交付，由 `kgosd` 的 HTTP server直接提供页面和资源；本地业务 CLI 在需要时自动确保该 Workspace Instance 的 daemon 已运行，同一个 active endpoint即可访问 Web 与 API。没有独立 Web 启动命令、第二个服务端口或单独部署步骤。

ChatGPT MCP Apps 仍共享 `packages/web` 源码和 `kgosd` 内嵌构建链：普通 Web 由 HTTP `/` 分发，额外的自包含 MCP App HTML 由同进程受认证 `/mcp` 上的 `resources/read` 返回。两种产物的宿主入口不同，但复用 React 业务界面；不增加第二个 Web 域名、Node 运行服务或监听端口。UI Resource / Tool 协议见 [MCP](mcp.md#chatgpt-mcp-apps-ui-合同)，组件复用见 [Web](web.md#chatgpt-内嵌-webmcp-apps)。

Web 与 CLI / SDK 在逻辑上都是公共 API 的客户端。`kgosd` / Kernel 使用 Go；CLI / SDK / Web 使用 TypeScript。Web 构建出的浏览器代码经 `kgosd` HTTP 下载后在浏览器执行；这里的“同进程”只表示页面 / 资源服务与 API 服务由同一个 daemon承载，不表示浏览器代码在 Go 进程内执行。

前后端代码分属 Go 与 TypeScript workspace，但这不产生第二个**产品部署服务**。Phase 00 开发环境可以使用 Vite dev server + proxy/HMR 作为开发工具，不要求把 Vite middleware嵌进 Go `net/http`；生产/本地正式运行的 Web构建产物仍由 `kgosd` 同端口直接提供，运行时不依赖 Vite。具体开发端口属于工程配置，不进入公开 endpoint contract。

Phase 00 的页面 / HTTP 壳层验收只是工程验证，不改变 Knowledge Base 的真实就绪条件。按 [D105](decisions.md#d105-web-first-run-and-runtime-bootstrap) 新目标，正式 daemon 可在**未初始化**时提供受限 setup HTTP/Web，但不得因此标记业务 `ready`；完整 API/MCP 仍须通过下文能力检查、Bootstrap 与 receipt，详情见 [无配置启动](#web-first-run-bootstrap)。当前代码仍需 Phase 26 才具备该受限模式。

## 统一 HTTP / MCP hosting（Phase 16 目标）

```text
同一个 kgosd Go 进程、同一个 HTTP listener
  /                浏览器 Web 静态资源
  /api/v1/*        现有 Instance Bearer API
  /mcp             外部 Bearer / OAuth 认证的 MCP Streamable HTTP
  /.well-known/*   MCP OAuth 发现（启用 OAuth 时）
  /oauth/*         MCP OAuth 授权与 Token（启用 OAuth 时）
                 → 同一个 Kernel → Lithograph
```

- **默认不变**：`kgosd --root <workspace>` 按原有 CLI-managed 生命周期监听 `127.0.0.1:0`；`kgosd.lock` 继续记录实际 active endpoint，single-instance OS lock / readiness / `auth.json` 规则不变。MCP 不产生第二份 Instance、不单独启动子 daemon、不使用 SDK 经 HTTP 回调自身。
- **显式统一监听**：目标支持 `kgosd --root <workspace> [--host <address>] [--port <0..65535>] [--tls-cert <path> --tls-key <path>]`；网络选项可由 `KGOSD_HOST` / `KGOSD_PORT` / `KGOSD_TLS_CERT` / `KGOSD_TLS_KEY` 提供，命令行优先、未指定时保持现有默认。TLS 证书与私钥必须成对。端口 0 仍发布真实绑定端口；不增加独立 MCP 监听地址 / 端口。
- **安全入口**：监听 `0.0.0.0` 只是网络暴露，不代表已提供 TLS。远程使用必须有真实 HTTPS 或可信的加密代理 / 通道，且路由保护生效；用户自行选择代理或隧道。即使一个 listener 对外，`/api/v1/*` 仍使用既有 Instance Bearer / 受控临时 Web Bearer，`/mcp` 采用 Phase 17 的 Instance Bearer（可信客户端）或 MCP OAuth Access Token；Web 静态资源可匿名读取，但 Web 调用业务 API 不可绕过认证。外部 OAuth MCP 调用方永不取得 `auth.json` Token。
- **启用规则**：MCP 与已经就绪的当前 Instance 共用根认证，不再要求第二个管理员 Token；OAuth discovery/授权仍需显式 issuer。MCP 路径、OAuth、预算和安全规范由 [MCP owner](mcp.md#部署交付与运行合同) 定义。此规则按 [D95](decisions.md#d95-unified-mcp-web-authorization) 替代旧 Phase 16 / D93 的独立管理员 Token 记述。
- **部署模型**：单进程不等于必须对所有路由公开放行；用户可在同一个 HTTPS 入口上对代理路由设置自己的限制，但 KG OS 不新增网络 Gateway。正式 Docker 仅交付一个运行 `kgosd` 的容器，Web 资源与 QuickJS WASM 编译进产品产物，运行时不依赖 Node.js MCP Server。旧独立 Node MCP 和双进程 Docker 源码已从工作树清理，Git 历史保留为迁移证据；**当前实现、开发验收、CI 与发布状态统一由 [Phase 16](../development/phases/16-kgosd-unified-mcp.md) 维护**。

### Web 交互设计状态

已确认 Web 内置于 `kgosd` 的交付与运行流程，与 CLI / SDK 共用 Kernel、业务合同和实例认证；人通过 Web 查看、管理和纠正知识。页面布局、版本覆盖式 DAG、独立查询结果帧、本体聚合编辑、持久 UI / 草稿、连接适配与状态覆盖由 [Web 设计](web.md)拥有。该文区分用户已确认默认与工程方案；当前 Web 仍是壳层，新增 UI 存储 / API 也尚未实现，设计文档不表示页面交互已经实现或验收。此项不阻塞 Kernel、daemon、CLI 或 SDK 的实现。

## 单 Token 实例认证

KG OS v1 以一个 `<workspace-root>/.kgos` Instance Token 作为唯一根凭证；持有根凭证拥有全部 API 权限。不建立用户账号、密码、角色、Scope 或多租户。**浏览器 Web 认证是该根凭证派生的登录状态**：首次提交根 Token 后，daemon 创建独立、可撤销的持久 Web Session；Cookie 不包含根 Token；刷新页面只需验证 Session 并取得本次页面的临时 Web Bearer。MCP OAuth Code/Access/Refresh Token 是另一条仅限 MCP 的授权链，Web Cookie 不能直接调用 MCP。

服务端 credential 的唯一真源是 `<workspace-root>/.kgos/auth.json`：

```json
{
  "token": "<opaque-secret>"
}
```

在原有完整 Runtime 初始化或直接 daemon startup 时，如果 `auth.json` 不存在，`kgosd` 使用 cryptographically secure random source 生成至少 256 bit entropy 的 opaque token，并原子创建该文件；后续 restart 继续读取并复用同一 token，**不会因为 restart 自动轮换 credential**。D105 允许无配置启动时**延迟到 Web 第四步**复用该原子生成机制；此前不开放业务认证和写入。`auth.json` 已存在但无法读取、JSON/字段非法或 token 为空时启动 fail closed，不能静默覆盖为新 token。v1 不提供 token rotation API / CLI；operator 若要手工替换 credential，属于 daemon 停止后的本地 secret 管理，不是 Knowledge Base mutation。

`auth.json` 是 runtime secret，不属于 Knowledge Base State、Commit Data、配置 fingerprint 或 Evolution。POSIX 上新建文件权限必须为 `0600`；其它平台使用等价的当前用户私有访问控制。token 不得写入日志、error `message/details`、lock file、State、HTTP response body 或诊断 dump。

所有已就绪 `kgosd` 的**普通业务 API request** 都必须携带（D105 的少量公开 Setup status、未认领 claim 和初始化期授权/Session 例外见 [受限启动](#web-first-run-bootstrap)，不能用来调用业务）：

```http
Authorization: Bearer <token>
```

不接受 query parameter、URL、request body 或 cookie 作为普通业务 API 的 credential carrier。Bearer 为 Instance 根 Token，或仅在同源 Web 完成 Session 校验后发放的**进程内 Web Access Bearer**（不返回 Instance 根 Token）。二者都在服务端验证；Web Access Bearer 不可调用 `/mcp`、不能绕过 Boot Guard，daemon 重启后须用持久 Cookie 重新获取。没有 Bearer 的业务 API 仍返回 `AUTHENTICATION_FAILED` / 401；不因浏览器附带 Cookie 就开放普通 API。根 Token 保持常量时间比较。

客户端 credential 继续通过 Bearer 进入 daemon：

- `@kgos/cli` 的 credential resolution 固定为当前 Workspace Root 的 `.kgos/auth.json`；Workspace Root 只可来自 `--root` 或 `KGOS_ROOT`，不读取 `KG_TOKEN`、其它 root 或全局 credential fallback，也不把 token 写入 stdout/stderr；
- SDK 必须由调用方显式提供 token，再统一发送 Bearer header；
- Human-facing Web 没有免认证的业务 API 旁路；首次输入根 Token 并验证成功后，浏览器保存独立 Session Cookie，后续页面仅持有临时 Web Access Bearer。浏览器不保存根 Token，也不将其放在 URL、Cookie、Web 数据库或日志中；
- `kgosd` 自身启动、首次创建 `auth.json` 与本地 CLI 为业务命令自动 spawn daemon 都不是 HTTP API request，因此不要求预先存在客户端 token；daemon ready 后，原始业务 request 仍必须按上述规则取得 token 并发送 Bearer header。

固定 loopback bind 是当前安全边界的一部分。Bearer token 提供**认证**，错误 / stale endpoint 指向持有不同 token 的 Instance 时会拒绝请求；完整复制 `.kgos` 可保留相同 token，单靠 Bearer 不能证明物理目录归属，这一端口复用场景由下文拟新增的 [Web connection guard](#web-operational-数据目录)检测。现有无 guard 的 CLI / 第三方请求不因此新增物理 identity 保证。Bearer 不提供 transport confidentiality。v1 CLI-managed Runtime不暴露LAN bind，也不内置TLS；多用户、远程访问、细粒度授权或公网部署必须另行设计。

### 持久 Web Session 与刷新恢复

Web 登录使用单一根 Token，不引入账号或密码，也不把其凭证保存进 `.kgos/web/ui.db`（该 UI 存储目前尚未实现）。服务端独立管理 `<root>/.kgos/web-sessions.json`：0600 私有文件、0700 Instance 目录、原子写入、固定数量上限；仅存随机 Session ID 的 SHA-256 摘要、根 Token 指纹与到期时间，不存 Cookie 原值或根 Token。记录不属于知识版本历史。Cookie 名称使用本机 Instance 根目录路径的摘要命名空间，防止同一浏览器在不同端口打开多个 Workspace 时 Cookie 互相覆盖；复制另一目录的 Session 文件也不能凭原 Cookie 自动登录。登录、主动退出、过期及根 Token 更换使会话按记录撤销或失效；daemon 重启从独立文件恢复。Session 采用 30 天闲置有效期，每次成功恢复滚动延长；闲置超期必须重新提供根 Token，不暗中延长被登出的登录状态。

同源 Web 认证入口独立于业务 API：

| 接口 | 要求与返回 |
| --- | --- |
| `POST /api/v1/web/auth/login` | 必须携带根 `Authorization: Bearer`，以及符合当前同源 HTTPS / loopback HTTP 的 `Origin`。成功持久化 Session 后设置 `HttpOnly; SameSite=Strict; Path=/api/v1/web/auth` Cookie，HTTPS 附加 `Secure`；响应仅返回当前 daemon 的随机 Web Access Bearer（不包含根 Token） |
| `POST /api/v1/web/auth/session` | 仅用于当前同源 Web 恢复；校验 `Origin`、Session Cookie、根 Token 指纹和有效期，滚动延长 Session，返回新的**本次进程** Web Access Bearer；失效返回 401 并清除 Cookie，不需根 Token |
| `POST /api/v1/web/auth/logout` | 使用 Session Cookie 且必须满足严格同源 `Origin`，持久撤销 Session 及其派生 Web Access Bearer，清除 Cookie；重新访问或刷新不能自动登录 |

登录、恢复、退出和错误响应一律 `Cache-Control: no-store`，无跨域 CORS，Cookie 不可由 JS 读取；Session Cookie **不允许直接认证** `/api/v1/ontology`、`/api/v1/graph`、`/mcp` 或 `/oauth/token`。浏览器业务 SDK 统一发送被进程内验证的临时 Web Access Bearer，并携带 `X-KGOS-Expected-Daemon-Boot`。Web Access Bearer 只在同一进程内有效，普通 CLI/SDK 的根 Bearer 不受影响；过期、撤销或 daemon 重启后旧值不能继续写入。已有 Web MCP 授权 `/oauth/request` 和 `/oauth/decision` 只可借此已验证的同源 Web 会话调用，不让 Cookie 直接调用 MCP 或签发 Grant；批准仍须服务端独立校验 OAuth request 与显式确认。对不安全方法验证精确同源 `Origin`，不得依赖 SameSite 防护替代 CSRF 校验。TLS 终止代理应由其明确提供 HTTPS 访问；不得信任任意客户端传入的 `X-Forwarded-Proto` 来放松 Cookie 或 Origin 检查。

## Docker 原生运行文件（唯一当前交付）

<a id="native-runtime-package"></a>

当前 KG OS **不再发行新的 platform-specific native npm Runtime 包**。Linux amd64 Docker 镜像在构建时编译当前 `kgosd`，随镜像内置以下文件（不是另一套独立产品）：

```text
/opt/kgos/
├── kgosd
├── extensions/
│   ├── lithograph.so
│   ├── lithograph-openai-compatible.so
│   └── kgos-jieba.so
└── manifest.json
```

- 镜像直接使用经过 SHA-256 校验的固定 Lithograph / Provider v0.3.3 Release，并从 `native/jieba` 锁定的 Rust 源码构建官方 Jieba；不再获取历史 `@kgos/runtime-linux-x64` npm 包。构建时按**实际** `kgosd`、三个扩展、Jieba Notice 与许可证生成七文件 SHA-256 manifest，版本来自当前 KG OS 源码，而不是任何旧 Runtime 包。镜像自身用 `v<version>` Tag 与精确源码 revision 标识。
- `kgosd` 仍从可执行文件相邻的 manifest/extensions 找到 required official artifacts，启动时验证后固定到 `<workspace>/.kgos/extensions/<sha256>`，与原有 Instance 及 SQLite 连接的一致性规则相同。额外扩展继续由 `[[sqlite.extensions]]` 显式定义，不依赖 Node/npm 运行时。
- **只支持 Linux amd64** 的正式运行镜像。已发行六平台 npm Runtime 属于历史；本地开发把已验证的原生文件组装在 `artifacts/runtime/<platform>-<arch>/`，供 Web/E2E 和保留的内部 CLI 使用，不再依赖平台 npm manifest。它不是新的分发格式或跨平台发行承诺。分发与 Release 见 [Client](client.md#docker-only-交付)、[D99](decisions.md#d99-linux-amd64-docker-only-distribution)。

<a id="instance-root"></a>

## Workspace Root 与 Instance Directory

KG OS v1 不使用默认 home profile、current directory discovery 或向父目录搜索实例。CLI 先按 `--root <workspace-root>` > 非空 `KGOS_ROOT` > error 得到唯一 Workspace Root；daemon 自身仍要求显式 `--root <workspace-root>`，不读取 `KGOS_ROOT`、`KG_HOME` 或其它 selector。环境变量解析只属于 CLI adapter。

一个 Workspace Root 固定对应：

```text
one Workspace Root
    = one <root>/.kgos Instance Directory
    = one KG OS Instance
    = at most one active kgosd
    = exactly one Knowledge Base target
```

目录布局冻结为：

```text
<root>/
└── .kgos/
    ├── config.toml
    ├── auth.json
    ├── embedding-api-key  # 仅 Web 引导使用，初始化时按需创建；私有文件（D105 目标）
    ├── kgosd.lock
    ├── kgos.db
    ├── initialized.json
    ├── cache/
    ├── extensions/
    ├── logs/
    └── web/             # 新增设计，当前路径实现尚未建立
        ├── ui.db        # 独立普通 SQLite；运行时可有 -wal / -shm
        └── cache/       # 可淘汰的 Web 结果缓存
```

Workspace Root 可以包含任意调用方文件；KG OS 不在其顶层散落 Instance 内部文件。下文未特别说明时，“Instance Directory”都指 `<root>/.kgos`。旧 v0.1.x root-is-Instance 布局不是当前合同；Runtime 不自动搬迁或双读两种路径。

### Web operational 数据目录

本轮 Web 持久化方案固定使用 `<root>/.kgos/web/ui.db` 与 `<root>/.kgos/web/cache/`，由该 Instance 的唯一 daemon 管理；普通 UI SQLite 不加载 Lithograph / Provider extensions，与 Knowledge Base 和 Provider cache 隔离。UI 文件绑定 daemon 实际验证的 databaseId，记录与恢复语义由 [Web 工作区数据](web.md#web-工作区数据)拥有；内部库绑定不等于新增全局物理 Instance identity。

浏览器通过拟新增的已认证 daemon API 读写规定记录，不能指定 root / 文件路径或读取 `auth.json`。目录采用当前用户私有权限并拒绝路径重定向；UI 库在首次已认证 Web 请求时按需建立，其失败不阻断已有 Kernel API，也不成为 `init` / Runtime readiness 前置条件。当前 Runtime Paths、HTTP 与 SDK 均尚未实现此目录或接口；本段是工程设计，不是当前落盘事实。

HTTP connection guard 已实现：daemon 每次创建正式 HTTP handler 时生成非持久随机 v4 UUID `daemonBootId`，已认证 `POST /api/v1/web/data/info` 可读取；API request 若带可选 `X-KGOS-Expected-Daemon-Boot`，在 Bearer 认证后、dispatch 前核对本次进程值，不匹配返回 `WEB_CONNECTION_CHANGED` / 409。Web 的 `/oauth/request` 与 `/oauth/decision` 授权交互携带该 header 时也受保护；OAuth Token 交换及其他路径保持自己的认证合同。此 guard 不是第二 credential 或全局物理 Instance identity；无该 header 的现有 CLI / 第三方 API 行为不变。`info` 当前固定报告 `storageStatus=unsupported`（UI store 尚未实现），不依赖 UI 库就绪且不会伪造 ready。Web 显式重连行为见 [连接、认证与恢复](web.md#连接认证与恢复)。

<a id="initialized-json"></a>

### `initialized.json`

`initialized.json` 是原由 CLI 发布、按 [D105](decisions.md#d105-web-first-run-and-runtime-bootstrap) 扩展为 **CLI、Web 与 daemon 自动初始化共享**的 versioned first-run completion receipt。它不是 startup configuration、Knowledge Base State、Commit metadata 或配置 fingerprint；当前格式仍只有 `{"version":1}`。只有完整 `config.toml` 已发布、official/additional extensions 就绪、Instance credential 与 `kgos.db` 建立、Lithograph / KG OS bootstrap 完成，且同一 Instance token 的 authenticated readiness 成功后，才能原子发布该 receipt。三种入口不得分别定义成功标准。

receipt 缺失表示首次初始化尚未完成，即使 `config.toml` 已存在；正常业务 API/CLI/MCP 仍不能在其缺失时执行隐式 Bootstrap。**仅 daemon 启动与显式 Web / CLI 初始化入口**可运行下文规定的共享初始化流程，并在成功后补写 receipt。receipt 已存在但 `auth.json` / `kgos.db` 等完成态必要 artifact 缺失属于不一致状态，必须 fail closed，不自动重建成另一个 Instance。

`doctor` 可以用这个 receipt 区分 config-only recovery state 与“已初始化但 daemon 当前 stopped”的正常状态。删除 receipt 不删除 Knowledge Base，也不修改 config；它只会让下一次合规的 daemon startup / 显式 init 重新证明当前 Instance 的完整 readiness。KG OS 不把 receipt 内容用于 Ontology / Object / Graph / Evolution 语义，也不因为它存在就绕过 daemon 自身的数据库/extension/bootstrap 校验。

<a id="web-first-run-bootstrap"></a>

### 无配置启动、共享初始化与先于鉴权的门禁（D105，目标设计）

KG OS 正式 Docker 只运行**一个 `kgosd`、一个 HTTP listener、一个 Workspace / Instance lock**。未提供 `config.toml` 不再阻止启动**受限的 Web 初始化模式**，也不要求安装 Node/CLI 或另起初始化 Web Server。浏览器可以按五步流程完成配置；高级用户可以事先手工编写完整合法的 `config.toml` 后直接启动。启动及 HTTP dispatch **先确定初始化状态，再决定是否进入普通业务认证**；缺配置不能伪装成 Token 认证失败。

| 持久状态与检查结果 | 运行状态及入口 | 必须遵守的边界 |
| --- | --- | --- |
| 无 config、无 receipt 且无必须保护的旧实例数据 | `setup_required`：提供基础 Web 初始化页面 | 不创建空 `kgos.db`，不启动业务 Kernel/MCP |
| 完整合法 config，无有效 receipt | 启动时进入 `initializing`，自动使用共享初始化过程；Web 可查看进度 | 对既有合法数据只恢复缺失步骤，不删除/重建 |
| Web 第五步提交完整配置，无 receipt | `initializing`：在当前 daemon 内触发同一初始化过程 | 原子发布配置，不另起占用锁/端口的 daemon |
| receipt 有效，且当前启动的 config、Token、扩展、数据库/Kernel 全部验证成功 | `ready`：开放正常 Web / API / MCP | 保留原 Token、State、Branch、历史和认证会话 |
| config 非法、旧布局/持久文件冲突，或已有 receipt 但必要文件损坏/丢失 | `error`：提供只读状态和恢复指引；仅“合法已有配置、无 receipt、可恢复执行失败”允许持有 Token 的显式 resume | fail closed；不得重置或覆盖原有知识库与管理员凭证 |

**配置文件存在不等于 ready**：仍必须获得经过真实 authenticated readiness 才发布的 `initialized.json`；receipt 存在也不能跳过当前启动的 Runtime/DB 能力检查。无 receipt 时再次启动或显式重试可沿用原有合法 config、Token、扩展和 DB 恢复；初始化步骤的部分持久结果不得在失败后冒充完成。运行期间手工补齐/编辑 `config.toml` 不会触发监听或热重载，**下次启动**才进入自动初始化。Web 的“重新开始”只重置未提交的表单草稿，不等于删除已持久化文件或知识。

**内部 readiness 与对外门禁不能互相阻塞**：共享初始化器在本进程中打开并验证真实 Runtime、Kernel/Lithograph 和已持有的 Instance Token，调用**同一正式业务 Handler 的进程内 authenticated readiness**（不经过外部初始化门禁、不产生可从网络调用的例外路由，不新建监听/进程）。现有 `cmd/kgosd/init.go` 的 authenticated overview 验收语义保持不变。readiness 未通过时，对外普通业务 API 仍始终返回 503；成功后先原子发布 receipt、再使当前 listener 的业务门禁转为 `ready`。在进程内做受控 readiness 并不是向匿名 HTTP 请求开放业务路由；对外没有“临时允许访问”的窗口。底层 Handler/Session 实例在就绪切换期间要保持当前 boot/session 一致性，或用原有会话 Cookie 安全恢复新的临时 Web Bearer，**不能要求第四步已登录用户重新输入管理员 Token**。

#### HTTP 路由优先级与受限服务

1. `GET /api/v1/setup/status` 在所有运行状态可**无 Bearer**读取，仅返回 `state=setup_required|initializing|ready|error`、必要的安全状态说明，错误时不泄漏本机路径、Token、API Key、扩展内部报错；固定 `Cache-Control: no-store`。页面跳转与前端显示必须以当前 daemon 的这一结果为准，不能用浏览器缓存中的“已初始化”猜测。
2. **浏览器 HTML 页面**：未 ready 时 `GET /` 和其他可导航的 Web 页面统一重定向到 `/setup`，该页面不弹正常业务登录；已 ready 时 `GET /setup` 重定向至 `/` 并恢复正常 Session/Token 鉴权。初始化页面的 JS/CSS/favicon 等静态资源始终可访问，不误重定向。
3. **业务协议**：未 ready 的普通 `/api/v1/*`、`/mcp`、OAuth / discovery 和 MCP Apps Resource，在业务鉴权前返回 `503 INSTANCE_NOT_INITIALIZED`（JSON 或对应 MCP 协议错误），**绝不返回 HTML / 302**，也不得创建/访问业务 Kernel；拥有已完成 receipt 但运行时损坏的错误状态使用 `503 INSTANCE_UNAVAILABLE`，不假装是一个可以重新创建的空库。新 code/HTTP 映射由 [公共错误合同](contracts.md#初始化门禁与-setup-错误) 统一管理。
4. 仅 `setup/status`、setup 写入接口以及第四步所需的现有 `web/auth/login|session|logout` 是未 ready 时的**显式例外**。达到 ready 后，普通业务调用仍按原有 Instance Bearer / Web Session / Boot Guard / MCP OAuth 认证；全部 setup 写入接口立即关闭，返回 `409 SETUP_CONFLICT`。Status 依旧可只读，页面 `/setup` 不再可进入。

首次使用遵循 [Web 五步界面](web.md#web-first-run-setup)；最小后端目标 API 为：

认领管理员 Token 不等于完成初始化。用户从第四步返回第三步，只要实例仍为 `setup_required` 且磁盘没有 `config.toml`，就可重新验证当前向量参数，不因 `auth.json` 已存在而阻断。配置发布、开始初始化、完成及异常状态仍保持禁止验证，不允许借此接口覆盖已保存配置；未认证请求继续受同源、目标地址、超时、并发和响应大小限制。初始化入口不应暴露给不可信网络。

| 接口 | 调用边界 | 实际作用 |
| --- | --- | --- |
| `GET /api/v1/setup/status` | 所有状态，无 Bearer | 安全状态与初始化进度；前端据此导航/轮询 |
| `POST /api/v1/setup/validate-embedding` | 仅 `setup_required`、磁盘无 `config.toml` 且浏览器同源；管理员 Token 已认领仍可重新验证 | 对未保存的 URL/模型/密钥执行一次真实 Embeddings 请求并检查向量维度，不创建配置或完成状态 |
| `POST /api/v1/setup/claim` | `setup_required` 且无 `auth.json`；符合既有同源请求校验，**不新增一次性部署证明** | 原子创建 256-bit Instance Token；**仅成功首次创建时返回根 Token 一次**，供用户保存并调用现有 Web login；自动初始化执行中不得插入匿名认领 |
| `POST /api/v1/setup/rotate-token` | 仅 `setup_required`、`auth.json` 已有合法管理员令牌、尚未发布 `config.toml` 且浏览器同源；无须提供旧 Token 或 Web Session | 原子替换 `auth.json` 中的管理员 Token，新 Token 仅在本次成功响应展示；旧 Token、Cookie Session 和 Web Access Bearer 同时失效，浏览器用新 Token 自动登录 |
| `POST /api/v1/web/auth/login`、`POST /api/v1/web/auth/session`、`POST /api/v1/web/auth/logout` | 根 Token 已存在时可在未 ready 期间复用现有 Session 合同 | 第四步建立/恢复 Web 登录状态，不授予业务 API 绕过初始化门禁的能力 |
| `POST /api/v1/setup/initialize` | 未 ready、已持有有效 Instance Bearer 或 Web Access Bearer | 第五步首次提交完整配置及可选 Web API Key，或对**已有合法 config 且无 receipt** 发起仅恢复初始化、不更新配置的显式请求；客户端按 status 轮询真实结果 |

**第三步真实验证（D105 优化）**：`POST setup/validate-embedding` 接受 `{"base_url":"...","model":"...","dimensions":4096,"similarity":"cosine","apiKey":null}`；留空密钥由浏览器显式传 `null`，不再有“无密钥”开关。服务端只在 `setup_required` 且同源请求下调用 `{base_url}/embeddings`，发送短测试文本及 OpenAI-compatible 的 `model/input/encoding_format:"float"`，**不发送 `dimensions`**；仅真实 HTTP 200、合法向量响应且返回维度与配置完全相符时确认成功。结果只报告成功维度或有界、不会回显密钥的稳定失败原因，不作为本地数据库 Bootstrap 的额外硬前置。验证出口允许公网及普通私网 Embedding 服务（包含 `10/8`、`172.16/12`、`192.168/16` 及 IPv6 ULA），避免 DNS 解析到私网地址时误报服务不可用；保留本机回环、链路本地、元数据及其它特殊保留地址拒绝规则。未认证出口仍禁用环境代理与重定向，并限制超时、请求/响应体和并发数量；使用方应避免将未初始化服务暴露在不可信网络中。测试不写入 Key、Config、Session 或 Knowledge。Web 仅在当前草稿对应的验证成功后显示“下一步”，任何参数修改均使旧验证结果失效。

最小 wire shape 固定为：`GET setup/status` 返回例如 `{"state":"setup_required","credentialConfigured":false}`；`credentialConfigured` 只报告是否已有合法的 `auth.json`，不返回其内容；`initializing` 可以附 `phase=configuration|extensions|authentication|database|readiness` 的阶段标识，`error` 只附无 secret 的公开错误摘要。`POST setup/claim` 首次创建返回 `201 {"token":"<new-instance-token>"}` 和 `Cache-Control: no-store`；已有凭证返回 `409 SETUP_CONFLICT` 而不是泄漏旧 Token。`POST setup/initialize` **首次新配置**接收严格 JSON `{"config":{"embedding":{"base_url":"...","model":"...","dimensions":1536,"similarity":"cosine"},"cache":{"path":"cache/openai-compatible.db","max_size_mb":4096},"fulltext":{"analyzer":"jieba"},"sqlite":{"extensions":[]}},"apiKey":"<user-supplied-secret>"}`；`apiKey` 只能是非空字符串或显式 `null`（无需认证），不得包含内联到 `config.toml` 的 `api_key` / 任意 `api_key_env`。**合法 config 已发布、但 receipt 尚不存在**时，同一端点可接收空对象 `{}` 作为仅重新执行未完成初始化的请求，严禁附带新配置或密钥；config 非法或已完成实例不能通过此形式恢复。成功受理返回 `202 {"state":"initializing"}`，不包含提交密钥，最终结果必须通过 status 查询；已存在任何 config 时，绝不接受带新 config 的 Web payload 静默覆盖。Setup 状态、认领、初始化和 Session 写入响应一律 `Cache-Control: no-store`，不允许跨域 CORS。

Web 第二步与第三步只在浏览器本次向导内保存未提交草稿，**点击“下一步”不创建半成品 `config.toml`**。第五步请求提交经过严格类型/范围/未知字段校验的完整 `[server]` 与 Cache、SQLite、Full-text、Embedding 配置：Web 默认提供 `cache.path=cache/openai-compatible.db`、`cache.max_size_mb=4096`、`fulltext.analyzer=jieba`、额外 `sqlite.extensions=[]`；Embedding 要求完整 URL、模型、维度、`cosine|euclidean` 及凭证模式。它们是 Web UI 显式生成的值，不改变手工 `config.toml` 必须完整的合同，也不允许用缺字段表示关闭 Embedding、Full-text 或 Cache。

**凭证分工**：第四步生成/复用的管理员 Token 只归 `auth.json`；第三步填写的 Embedding API Key 不得进入 `config.toml`、IndexDefinition、版本历史、响应日志或诊断。手工配置继续使用当前 `embedding.api_key_env` + 宿主环境变量，不要求 Web secret 文件。Web setup 则把 Key 原子写入 `<workspace>/.kgos/embedding-api-key`（文件权限 0600、目录私有），生成的 `embedding.api_key_env` 固定使用专用名字 `KGOS_WEB_EMBEDDING_API_KEY`；仅当 config 显式指向此专用名字时，Runtime 才在 Provider 初始化之前安全读取私有文件并注入该**单个 daemon 进程**的对应环境变量，之后仍由既有 Provider operation-time 解析，不增加通用密钥注册中心或内联 `api_key`。该保留环境变量若同时由宿主设置，应报明确配置冲突而非悄悄选一边。Web API Key 留空即为无需认证的 endpoint（`api_key_env=""`，不创建 Key 文件）。若私有 Key 文件缺失/权限错误，保留已有配置，报告错误，不假装服务已就绪；Web 不提供已初始化后的任意密钥改写接口。**首次保存先原子发布并校验私有 Key 文件，再原子发布完整 config**；中断后的孤立私有文件不构成初始化完成，config 已发布但 Key 不可读取时 fail closed，不删除配置/已有数据，也不因重试暴露旧 Key。

当前 `auth.json` 原子生成 / root Token 只持一份，不新增账号、密码、角色或一套安装 Token。首次匿名 `claim` 仍只可成功一次；已有 Token 且**尚未提交初始化配置**时，可通过同源 `rotate-token` 无须旧凭证直接重新生成。服务端串行检查 `setup_required`、尚无 `config.toml`、磁盘旧凭证与当前内存凭证一致，再通过私有临时文件原子替换为新随机 Token；旧 Token 与旧 Web Session 失效，只有新 Token 能重新登录。配置已发布、初始化中、ready 或凭证/文件异常时不得轮换。每次新 Token 只在成功创建响应中显示一次，普通状态和登录接口不会回显旧明文。**未初始化前匿名轮换属于明确的安全取舍**：任何能通过同源限制访问该接口的人，都可能使已认领的管理员 Token 失效并获得新的管理员凭证；因此初始化入口必须仅对可信环境开放。保留现有 Origin / Sec-Fetch-Site 检查、文件权限及部署边界，不为此增加额外认证。

初始化与重试必须序列化：同时打开两个浏览器、重复点击或 daemon 检测到手工 config 新出现时，只允许一个写入/Bootstrap，其他请求返回当前 status 或 `409 SETUP_CONFLICT`，不可覆盖外部写入，也不可运行第二个需重新持锁/监听的 daemon。响应丢失不能假定操作没有生效；浏览器从 status 恢复。合法配置的失败恢复只调用已认证的 `{}` resume，不删除/覆盖配置；无法安全恢复的损坏/非法配置只能要求用户修复文件并重启。达到真实 ready 后复用当前 HTTP listener/Session/Token，先通过进程内 authenticated readiness，**随后发布 receipt 并开放外部业务门禁**；失败保留可安全重试的状态和诊断。实现与隔离验收归 [Phase 26](../development/phases/26-web-first-run-bootstrap.md)，**本地未提交工作树已实现上述受限启动，仍须 Phase 26 最终质量与 CI 验收后才算正式交付**。

### `config.toml`

`[server].public_origin` 是新版本首次初始化必填的实例对外访问根地址，统一提供 Web/API/MCP/OAuth Origin。浏览器默认从 `location.origin` 预填，允许用户修改；它与本机监听 Host/Port 是两种配置，不能由请求 Header、监听地址或环境变量偷偷覆盖。必须为 HTTPS origin，只有本机 loopback 开发可使用 HTTP；不能包含 path、query、fragment 或账号。OAuth Issuer 从本字段加载，MCP 连接地址在其后拼接现有 `--mcp-path`（默认 `/mcp`）。已存在且不含此字段的旧版 `config.toml` 仍然可加载，但不启用 OAuth；升级前需手工增加此字段后重启。新 Web 初始化始终明确写入，管理员以后可修改并通过重启生效，不支持热更新。已废弃的 `--mcp-oauth-issuer` / `KGOS_MCP_OAUTH_ISSUER` 启动入口明确拒绝；迁移时先把现有值写入 `[server].public_origin` 再删除旧入口。填写地址不会自动创建公网接入或 TLS 证书。

`config.toml` 是 Instance Directory 中持久的 **Instance startup configuration**。v1 使用 Embedding cache policy、caller additional SQLite Extension、Full-text 与 Embedding 四组配置。最终文件始终写出完整显式配置；`init` 可以按 [CLI Init](cli.md#init) 为 KG OS-owned 字段解析产品默认值，手工配置仍必须满足同一完整性校验。official Lithograph / Provider / Jieba由native Runtime package拥有，不写入config：

```toml
[server]
public_origin = "https://kgos.example.com"

[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

# 仅用于调用方额外 SQLite extension；official Lithograph / Provider / Jieba 不在这里声明。
[[sqlite.extensions]]
source = "/absolute/path/custom-tokenizer.dylib"
entrypoint = "sqlite3_custom_tokenizer_init"
sha256 = "<optional-local-or-required-remote-sha256>"

[fulltext]
analyzer = "jieba"

[embedding]
base_url = "https://api.openai.com/v1"
model = "text-embedding-3-small"
dimensions = 1536
similarity = "cosine"
api_key_env = "OPENAI_API_KEY"
```

`cache.path` 等 Instance-relative path 以 `<workspace-root>/.kgos` 为解析基准，而不是 Workspace Root 顶层。

`[fulltext]` 与 `[embedding]` 属于 Knowledge Base 初始化配置。交互 `init` 进入这组配置前只提示一次：

```text
以下配置初始化后禁止修改。
```

英文对应：

```text
The following settings must not be changed after initialization.
```

这条约定不引入配置 fingerprint、历史快照、修改检测、阻止、后续 warning、doctor 比较或自动迁移；`kgosd` 始终只在 startup 解析当前文件。

### Cypher 执行连接

`kgosd` 根据调用入口选择 connection，但不解析用户 Cypher：Graph `query` 使用本次 operation 独占的物理只读 connection；先通过 `lithograph.commit.get(request.at)` 把调用方 StateRef 解析为 exact `commit/<id>`，再以 `options.at=<resolved commit>` 执行原始 Cypher并把同一 commit作为 response `state`。如果某个 Lithograph procedure 本身不允许 `at`，保留其公开错误；KG OS 不根据 procedure name绕过 Snapshot contract。

Graph `execute` 使用本次 operation 独占的读写 connection。进入用户 Cypher 前必须确认 connection 处于 SQLite autocommit / 无 active Lithograph explicit transaction 状态，并先完整执行 `CALL lithograph.branch.checkout($branch)` 建立调用方要求的 connection-local default Branch；随后执行原始 Cypher时**不附加 `options.branch`**。`author/message` 只有调用方显式提供时才作为普通 execution options传入；若目标 procedure不接受这些 options，按 Lithograph公开错误失败。这样 `branch.*` / `tag.*` / Merge Session等自行携带 target的 procedure不需要 KG OS特例表，也不会被无条件 branch option破坏。

用户 Cypher本身可以合法改变 connection checkout，但这个 checkout **只属于当前 operation**，不能成为 pooled connection 的跨请求状态。任何读写 connection 归还 pool 前都必须处于可安全复用的 canonical baseline：SQLite autocommit、没有 active Lithograph explicit transaction，并 checkout 到 `main`。该规则覆盖成功、普通执行错误、stream terminal error、caller cancellation 与 streaming early-close；清理可以使用独立的有界内部 cleanup context，不得因为原 request context 已取消就跳过。只要实现无法证明这三个条件全部成立，就必须 discard 该物理 connection，让 pool 后续新建 connection，而不是把未知 checkout / transaction 状态重新放回池。

因此并发 operation 即使分别 checkout `branch/a`、`branch/b`、`branch/c`，后续 Version/ref operation 也不能观察到随机 pooled connection 上的历史 active Branch。Evolution 的 branch/tag/merge/state 等 public operation继续只使用自己显式的 target参数；它们取得的 write connection必须已经满足上述 reusable baseline。`main` 是 KG OS Instance bootstrap 后始终存在的内部 neutral checkout，但这不建立 public “current Branch”。写语句进入 `query` 时由物理只读 / `at` boundary拒绝，不自动换成读写 connection重试。两类 connection都加载同一批配置的 extensions。Graph 的语句范围见 [Graph](graph.md#graph)。

Bearer token 仍是实例的统一认证。通过认证的调用方可使用 Lithograph 支持的 Cypher；KG OS 不额外禁止 `LOAD CSV` 等文件 / 网络能力。实际文件路径位于运行 `kgosd` 的主机，访问权限由宿主进程和 Lithograph 决定；只读是数据库执行边界，不是无外部 I/O 模式。这里没有开放 raw SQL 或改变 extension 的 startup-only 加载合同。

Lithograph v0.3.3 的 Managed Semantic read 不再要求写 `kgos.db` 来发布 text -> Vector cache，因此 Graph `query` 可以使用物理只读 `main` connection。Provider 若启用自己的独立 cache database，仍可以按 providerConfig 写该 cache；这个写入不改变 Lithograph graph/schema/history/ref，也不把只读 Graph 入口升级成读写 connection。Phase 01 的真实 Go driver / release artifact 验证保留为历史 host-level 基线；每次依赖升级仍须按 [Implementation](implementation.md#managed-semantic-integration-readiness) 与 [当前升级阶段](../development/phases/24-lithograph-v033-upgrade.md)重新验证只读/读写、Provider cache、取消及公共 Graph 端到端行为。

### Embedding result cache

KG OS 不实现 text -> Vector cache，也不调用 Lithograph cache procedure。Lithograph v0.3.3 把 persistent embedding result cache 交给具体 Embedding Provider；KG OS 的 `[cache]` 只是**创建 / 因业务定义变化必须重建 OpenAI-compatible Semantic Index 时的默认 providerConfig mapping**。

配置入口：

```toml
[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096
```

- `path` 与 `max_size_mb` 都是必填；`max_size_mb` 为正整数，1 MB 按 1 MiB 解释。交互 `init` 可以推荐 `cache/openai-compatible.db` 与 `4096`，但不能通过字段缺失表达默认值。
- `path` 为 absolute path 时原样使用；relative path 统一相对当前 `<workspace-root>/.kgos` Instance Directory 解析，compiler 写入 `providerConfig.cache.path` 前必须得到 absolute path，避免进程 cwd 改变 cache identity / location。
- v1 Provider cache 始终启用；`kgosd` 只确保 path 的父目录存在，不预创建、ATTACH、检查内部表或直接维护 cache database；OpenAI-compatible Provider 自己负责 cache marker/schema、lookup、publish、FIFO budget、并发与损坏处理。Provider 必须拒绝把 cache file 指向 `kgos.db`。
- `max_size_mb` 映射为 Provider `cache.max_bytes = max_size_mb * 1024 * 1024`，转换必须检查整数范围。预算只约束 Provider 定义的 vector payload，不是 cache SQLite 文件物理大小，也不包含 Lithograph HNSW/TEMP materialization 或 extension artifact cache。
- compiler 固定写入 `providerConfig.cache.enabled=true`；KG OS 不公开 disable/skip cache 的安装配置。Provider cache hit/miss 对 Lithograph 与 KG OS correctness 不可见，删除 cache 只会增加后续 Provider 调用。
- `[cache]` 是 Semantic Index 创建 / replace 时使用的 provider cache 配置；已经存在及历史 IndexDefinition 继续保留它们 versioned 的 providerConfig。KG OS 不扫描、迁移或改写历史配置。
- `db.index.semantic.rebuild` 仍是 Lithograph TEMP Semantic/HNSW maintenance，不是填充 Provider-owned embedding cache 的入口；KG OS 不新增预热 CLI/API、后台 scheduler 或第二套 cache service。

v0.3.2 已修复 Provider cache 对同一空路径的首次多进程初始化竞争，v0.3.3 继承该修复；旧 v0.3.1 的串行预热规避只适用于其历史版本。本次升级保持 Provider cache 的配置、独立文件与 ownership，不新增 KG OS 预热流程。固定版本依据见上游 [v0.3.2 发布说明](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/releases/v0.3.2.md#provider-cache-首次并发初始化修复)与 [Known Issues](https://github.com/bYiyLi/Lithograph/blob/v0.3.3/docs/reference/known-issues.md#provider-cache-first-use)。

Provider cache database 是 runtime/derived data，不属于 State、Commit、Branch、Lithograph storage format 或 Knowledge Base correctness source。relative `path` 可以显式配置为 `cache/openai-compatible.db` 并解析到 `<workspace-root>/.kgos/cache/`；absolute path 也允许位于 Instance Directory 外。由于写入 IndexDefinition 的 cache path 是 versioned absolute path，移动/复制 Workspace / Instance **不会**自动重写既有索引的 recorded path；v1 不提供 cache-path migration。查询旧索引时仍使用该索引自己的 recorded config，cache路径不可创建/打开时按 Provider公开 I/O/config错误失败。

### SQLite Extension source resolver

`[[sqlite.extensions]]` 只表达 **caller additional SQLite loadable extensions**。Official Lithograph、OpenAI-compatible Provider 与 KG OS Jieba tokenizer 由当前 platform native Runtime package提供，不要求用户在 `config.toml` 重复声明 source/path。其它 tokenizer、SQL function、virtual table或未来额外SQLite extension继续使用这套通用配置；配置了就表示required，v1不增加 `kind/name/enabled/optional/capabilities` 等插件注册层。SQLite FTS5 对同名 tokenizer 使用后注册覆盖前注册的语义，因此 caller additional extensions 必须先于 official Jieba 加载，official Jieba 最后注册，确保最终 `jieba` 始终由 KG OS Runtime 拥有。

每个 SQLite connection 的完整 extension load order 固定为：

```text
1. official Lithograph
2. official lithograph-openai-compatible Provider
3. caller [[sqlite.extensions]]，保持 config array order
4. official KG OS Jieba tokenizer（最后注册，固定最终 `jieba` identity）
```

调用方不能用 additional entry替换 official artifact，也不能把自定义extension插入 Lithograph / Provider official slot。caller extension 即使注册同名 `jieba`，随后 official Jieba 的最终注册也必须覆盖它；其它 caller tokenizer/function/virtual table registration继续保留。

每个 entry 的合同固定为：

- `source` **必填**，只能是本机 absolute file path 或 absolute `https://` URL；不接受 relative path、`http://`、其它 scheme、目录或自动按插件名发现/下载。KG OS 不维护插件 registry/package manager。
- `source` 可以直接指向当前平台可加载的 `.so` / `.dylib` / `.dll`，也可以指向 `.tar.gz` / `.zip` archive。archive 必须额外提供 `library`，它是解包根目录内要交给 SQLite 加载的精确 relative regular-file path；direct library 不提供 `library`。v1 不做 glob、basename 猜测或平台自动选包。
- `entrypoint` **必填**，必须是非空、无 NUL 的 SQLite extension init symbol。KG OS 把该 symbol 原样交给 driver 的 extension-loading API，不做 filename-derived symbol 猜测。caller additional extension 必须由 operator 填写自身真实 init symbol；official Lithograph / Provider / Jieba 的 entrypoint由Runtime package合同固定。
- `sha256` 对 **远程 source 必填**，必须是 64 位 lowercase hex，校验的是下载得到的原始 artifact bytes；本地 source 可省略，提供时同样必须匹配。无论配置是否显式给出，resolver 都会计算实际 artifact SHA-256，并以内容 hash 固定本次 daemon 使用的 artifact identity。

远程 URL 只作为 artifact location，不是可执行 identity。resolver 可以跟随有界的 **HTTPS → HTTPS** redirect，以支持 GitHub Releases 这类下载；不得降级到 HTTP。`releases/latest/download/...` 可以配置，但仍由 `sha256` 固定本次允许的 bytes：若远端 `latest` 已变化且本地没有旧 hash cache，校验失败而不是自动升级。因此正式可复现部署优先使用带版本号 URL + SHA-256。

caller source先解析成Instance-local immutable artifact。official Runtime artifact也按manifest hash固定到同一个content-addressed cache后，完整resolved set才进入SQLite connection lifecycle：

```text
local source --------------------┐
                                 ├─ read/download bytes
https source -- bounded redirect ┘
               ↓
        verify configured SHA-256 when present/required
               ↓
        actual SHA-256 content identity
               ↓
        <workspace-root>/.kgos/extensions/<sha256>/
               ↓
        direct library or safely extracted archive
               ↓
        resolved local library path
```

archive extraction 必须 fail-closed：拒绝 absolute path、`..` traversal、symlink/hardlink、device/special entry 与越界 `library`；download / decompression / extracted-size 受实现资源上限约束。先写临时文件/目录，hash 与 extraction 全部成功后再原子发布 content-addressed cache。缓存命中时重新确认目标 artifact 与 hash 一致；缓存可删除并从 source 重建，不属于 Knowledge Base history 或 correctness source。远程 cache 已存在且有效时，daemon restart 不要求网络可用。

`kgosd` 对每个新 SQLite connection 使用**同一批已解析的本地 artifacts**：仅在宿主 SQLite 驱动的 connection 初始化阶段临时允许 extension loading，按“official Lithograph → official Provider → caller additional config order → official Jieba”逐项调用可接受显式 `(library, entrypoint)` 的 driver API，随后立即关闭该能力；业务 Cypher/SQL 不获得任意 `load_extension()` 权限。official Jieba 最后注册后再验证当前 Full-text analyzer。任一 official 或 configured additional extension 在任一 connection 加载失败，该 connection 不进入可用池。Go host通过 process-private registered driver / connection hook把这一步绑定到每个物理 connection 的创建，不能只在 `*sql.DB` 初始 connection加载一次后假设 pool后续 connection自动继承。

Go SQLite runtime固定使用 `go-sqlite3` bundled amalgamation，并以 `sqlite_fts5` build tag构建；不得使用 `libsqlite3` 把 SQLite版本漂移到宿主系统，也不得使用 `sqlite_omit_load_extension` 移除 KG OS 所需的 extension capability。startup仍必须实际 probe `sqlite_version() >= 3.45.0`、FTS5 与完整 resolved extension set加载成功，build tag本身不作为运行证据。

generic loader之外仍要验证 Lithograph capability，但不要求 caller 配置 `kind = "lithograph"`。connection initialization分为两层：**物理 connection 构造**只负责打开目标 database、按固定顺序加载完整 resolved extension set、验证 host SQLite version/FTS5并确认 `lithograph_version()` 可调用；**Lithograph database activation** 必须先由一个独占 read-write bootstrap connection完成。`lithograph_version()` 在尚未初始化的干净 database上返回 `databaseId:null` 与 `storageFormat.current:null`，此时 bootstrap connection执行一次 `lithograph_init()`；已有 database则按返回的 databaseId/storage format/profile做兼容性验证。只有初始化/迁移和 Root/`main`验证成功后，connection才允许进入后续 Lithograph SQL / Provider capability probe。

当前 daemon `[embedding]` / `[cache]` 显式配置在已完成 Lithograph initialization的独占 bootstrap write connection上通过公开 SQL做**可回滚 local validation probe**：`lithograph_tx_begin()` → staged `db.index.semantic.createNodeIndex`（随机 probe index/label/property，使用当前 provider/config/dimensions/similarity）→ `lithograph_tx_abort()`。CREATE只调用 Provider本地 `validate`，不得触发 `embedBatch` / network；probe成功后不得留下 Commit、Schema、Index或 Branch变化。official Provider init失败已经使 connection不可用，因此其 connection-local registration不需要读取 private client-data；缺少 `openai-compatible` registration或当前 config非法时 probe失败并终止 startup。

bootstrap成功后才建立/开放正常 read-only 与 read-write connection set。每个新物理 connection仍经同一个 connection hook加载相同 artifacts并执行 host probe，再以 `lithograph_version()`确认自己看到的 `databaseId`、storage format与启动时 bootstrap结果一致；Full-text analyzer在每个 usable connection上验证。read-only connection不重复 staged Provider write probe，Provider registration由该 extension在该 connection上的 successful init负责，实际 Semantic query仍按目标 IndexDefinition执行 Provider validation。

Go SQLite driver 必须让每个实际 connection 使用同一个 native SQLite runtime 完成 database open、extension registration、SQL execution 与 context cancellation；不得为了扩展加载、Provider cache 或查询取消再实例化第二套 private SQLite runtime。Lithograph 身份与能力只由公开 SQL probe 证明，不根据配置名字、顺序或文件名猜测。

SQLite Extension 是与 `kgosd` 同权限执行的 native code。配置文件因此属于 operator trust boundary：KG OS 不 sandbox 插件，不根据 Ontology/AI 输入动态添加 extension，也不把 remote headers/token/options bag 暴露给业务调用方。修改 extension source/hash/library/entrypoint 只在下一次 daemon start/restart 生效；它本身不创建 State 或自动执行任何数据 migration。

### Lithograph 调用入口

KG OS 的多语句单-State mutation（例如 Object Patch 与 bootstrap）通过 SQLite 驱动调用 Lithograph 的 SQL 显式事务封装，全部调用使用同一个独占 checkout 的 connection：

| SQL 函数 | KG OS 使用方式 |
| --- | --- |
| `lithograph_tx_begin(options_json)` | 传入目标 Branch、expectedHead 与 metadata；底层开启其拥有的 SQLite transaction |
| `lithograph(query, params_json, options_json)` | active transaction 内执行 compiler 生成的 Cypher，自动加入同一 staged state |
| `lithograph_rows(query, params_json, options_json)` | active transaction 内执行同一 Cypher core，并按 `columns -> row* -> summary` 流式消费结果 |
| `lithograph_tx_commit()` | finalize 唯一最终 Commit 并提交底层 transaction；pure-read / empty-delta 不虚构新 Commit |
| `lithograph_tx_abort()` | 显式取消时回滚底层 transaction；失败已自动 abort 时不再重复结束 transaction |

Object Patch 的 strict base、no-op、单-State 与 fail-closed 规则仍由 [Object](object.md#object-公共调用合同)拥有。KG OS 不在 `tx_begin/commit` 外另套 SQLite `BEGIN/COMMIT`，不提供 `tx_execute` adapter，也不复制 Lithograph transaction state machine。一次 active transaction 的 connection 在 terminal operation 前保持独占。

公共 Graph 同样只使用 SQL surface：非 streaming 使用 `lithograph()`，streaming 使用 `lithograph_rows()`。后者是真正的 Lithograph execution stream，可承载 read/write、external I/O 与 transaction subquery；KG OS 不再需要 Native Graph adapter。Go integration 必须用真实 v0.3.3 extension 验证 streaming、`context.Context` cancellation、early close、partial/durable batch 语义与错误映射，见 [工程待办](implementation.md#go-运行时与数据库接入)。

### Full-text 全局配置

KG OS v1 的 Full-text 只暴露一个 daemon-global 运行时分词配置：

```toml
[fulltext]
analyzer = "jieba"
```

`[fulltext].analyzer` 在最终 `config.toml` 中仍是必填显式值，是非空、无 NUL 的**完整 FTS5 tokenizer specification STRING**，例如 `jieba`、`unicode61`、`porter unicode61`；KG OS 不解析第三方 tokenizer 的业务参数含义。新 Instance 的 `init` 在调用方没有提供 `--fulltext-analyzer` 时**直接解析为 `jieba`，不询问、不要求 AI/CI 显式传 flag**，并把 `analyzer = "jieba"` 写进配置。调用方仍可通过 `--fulltext-analyzer <fts5-spec>` 显式覆盖，例如选择 `unicode61`；手工配置缺少 `analyzer` 仍是配置错误。

`jieba` 是 KG OS Runtime 的 official FTS5 tokenizer 名称，不再要求 caller 通过 `[[sqlite.extensions]]` 自行安装。产品合同冻结的是**最终注册名、默认行为与可复现性要求**；测试candidate需pin具体 tokenizer implementation / dictionary source并构建package，以取得 [Jieba tokenizer research](../research/jieba-tokenizer.md) 要求的每个受支持平台 build/load/query证据。license与artifact identity选择门全部通过后，才能接受该实现为正式可分发的official Jieba。受支持 Runtime target必须使用同一逻辑 tokenizer 与词典版本；同一 v1 analyzer 名称不能在普通升级中静默换成不同分词语义。未来若必须升级到会改变 tokenization 的实现/词典，需要新的 analyzer identity或显式迁移设计，不能在 `jieba` 名称下无声替换。已有 Instance 的 `config.toml` 与历史 Full-text IndexDefinition 不自动改写；例如 v0.1.0 已显式保存 `unicode61` 的 Instance 继续使用自身配置。

`[fulltext].analyzer` 决定 KG OS **新建或因业务定义变化重建** managed Full-text Index 时写入的 `fulltext.analyzer`；若调用方显式覆盖为其它第三方 specification，对应 tokenizer 仍必须由前述 `[[sqlite.extensions]]` 在每个 connection 上注册。

KG OS v1 不公开 per-Index analyzer、`fulltext.eventually_consistent`、tokenizer path/arguments registry 或其它 FTS5 建表 options。Ontology 只声明“哪些字段需要 Full-text”。KG OS **创建或因业务定义变化重建** Full-text IndexDefinition 时写入当前 `[fulltext].analyzer`，并保持 `fulltext.eventually_consistent = false`；已经存在且本次不需要重建的 IndexDefinition 保留自己的 versioned analyzer。KG OS 不把 analyzer 配置、fingerprint 或 generation 额外写入 Knowledge Base。

每个 SQLite connection 在完整 resolved extension set 全部加载后、进入可用池前，都必须对**当前 `[fulltext].analyzer`**做无持久副作用的 FTS5 capability probe；未知 tokenizer、参数构造失败或运行时依赖缺失都使该 connection 初始化失败。这个 probe 只验证本次 daemon 要用于新建/重建索引的 analyzer，不要求启动时枚举并验证全部历史 State 曾经使用过的 tokenizer。

打开已有 Knowledge Base 时，KG OS **不比较**当前 `[fulltext].analyzer` 与库中已有 IndexDefinition，也不迁移或批量重建历史索引。历史 Full-text query 继续使用目标 State 的 versioned IndexDefinition 实际保存的 analyzer；如果那个 tokenizer 当前没有通过 `sqlite.extensions` 注册，则只让该次 Lithograph Full-text 操作按底层公开 category 失败，不能退化为空结果或改用当前 analyzer。KG OS raw Graph 不解析 Cypher 或错误文案来把这类底层执行失败重新分类为 `FULLTEXT_ANALYZER_UNAVAILABLE`；该 KG OS code 只属于前述当前 `[fulltext].analyzer` capability probe。虽然初始化合同要求该配置初始化后禁止修改，Runtime 不实现历史值检测。

official `jieba` 的算法/词典可复现性由 KG OS Runtime artifact/version 负责；调用方显式覆盖为其它第三方 analyzer 时，KG OS 不承诺检测第三方 extension 在同一 analyzer name 下偷偷替换算法/词典，远程 artifact SHA-256 只能固定配置 source bytes，插件外部资源仍由 operator 负责版本化。这与 Lithograph 的 tokenizer 可复现性边界一致。Runtime 不为已有 Instance 建立配置迁移系统。

### Embedding 配置与索引映射

KG OS v1 继续使用 OpenAI-compatible Embeddings。`[embedding]` 是 Knowledge Base 初始化时确定、之后供新建 / 因业务定义变化必须重建 Semantic Index 使用的全局配置；实际 HTTP client 由 native Runtime package自带的 `lithograph-openai-compatible` SQLite extension提供。它作为第二个 official artifact紧随 Lithograph加载到每个connection，注册名固定为 `openai-compatible`；不通过 caller `[[sqlite.extensions]]` 重复声明。KG OS 不新增 provider registry、业务下载器或另一套 HTTP adapter。

配置字段：

| 字段 | 规则 |
| --- | --- |
| `base_url` | 必填，absolute HTTP(S) API root，无 query/fragment，去掉末尾 `/` |
| `model` | 必填非空模型 ID，不通过 List Models 猜测 |
| `dimensions` | 必填 Integer 1..4096，必须等于服务实际返回维度 |
| `similarity` | 必填，允许 `cosine` / `euclidean`，映射到索引配置 |
| `api_key_env` | 字段必填；非空时是 Provider operation-time 读取 credential 的环境变量名，startup 只校验名称本身，不要求当前值存在；空字符串表示调用方明确配置了无需认证的 endpoint |

KG OS 不接受字段缺失来表达 embedding 默认或禁用；也不接受内联 `api_key`。未知字段返回配置错误，不开放任意 headers/options bag。`[embedding]` 的**静态配置**与 official Provider registration 依然是 daemon 的运行前置条件，但非空 `api_key_env` 对应的 secret 不是 startup readiness 条件；启动不解析该变量、不发远端 health check 或 sample embedding 请求。

`api_key_env` 路径的 compiler 映射示例：

```cypher
CALL db.index.semantic.createNodeIndex(
  'document_semantic',
  ['Document'],
  'content',
  {
    provider: 'openai-compatible',
    providerConfig: {
      base_url: 'https://api.openai.com/v1',
      model: 'text-embedding-3-small',
      api_key_env: 'OPENAI_API_KEY',
      send_dimensions: false,
      encoding_format: 'float',
      cache: {
        enabled: true,
        path: '/absolute/instance-root/cache/openai-compatible.db',
        max_bytes: 4294967296
      }
    },
    dimensions: 1536,
    similarity: 'cosine'
  }
)
```

Relationship 使用同形的 `createRelationshipIndex`。startup config 的 `embedding.api_key_env` 字段始终显式存在；其值为空字符串时，compiler 只在生成的 Provider `providerConfig` 中省略 `api_key_env`。`send_dimensions=false` 延续 KG OS 原来不向 endpoint 发送可选 dimensions 参数的约定；响应仍由 Provider 校验 exact dimension / finite FLOAT32。Provider 负责 batching、timeout/retry、取消与响应解码；KG OS 不复制这些实现。当前 Provider 会发送 `encoding_format: "float"`，兼容 endpoint 必须接受该请求形状，不再沿用旧文档“绝不发送 encoding_format”的 HTTP adapter 合同。

完整 provider/config/dimensions/similarity 由 Lithograph 保存到 versioned IndexDefinition。KG OS 的 Ontology body 隐藏这些运行参数，但 decoder/compiler 必须保留未改变的底层配置。初始化合同要求 `[embedding]` 初始化后禁止修改；KG OS 仍不自动重写历史，不增加 KG OS State fingerprint/generation、修改检测或配置迁移系统。索引定义固定配置不等于快照远端模型。

#### 凭证不落库

KG OS 在 Provider/IndexDefinition 层仍只保留 `api_key_env` 这一认证输入，不增加内联密钥的转接层。配置值非空时，索引只保存环境变量**名称**；`init`、普通 CLI Runtime ensure 与 `kgosd` startup 都不预先解析这个变量。Provider 只在实际 Semantic operation 需要形成 effective request identity 时读取 kgosd 环境中的实际值；这一步可能发生在 Provider cache lookup 之前，因此即使最终不发 HTTP，也属于该次 Semantic operation 的按需解析；缺失/空值使该次 Semantic operation 按 Lithograph 当前 Provider mapping 以 `INVALID_ARGUMENT` 失败，但不影响 daemon startup、Ontology/Object/Evolution 或不需要 Semantic Provider 的 Graph operation。KG OS 不把解析后的 secret 写回 `providerConfig`、State、日志或错误。配置值为空时表示 no-auth endpoint，索引不保存 `api_key_env`。D105 新增的**首次 Web 表单 API Key**只经 [受限启动设计](#web-first-run-bootstrap) 指定的私有文件注入专用环境变量，并非 Provider 新字段或启动时的在线认证检查；原有人工提供环境变量的模式仍然成立。

环境变量名称随索引定义保存；历史索引仍引用原名称，修改当前默认名称不改写它们。普通 credential rotation 可保持同名变量并重启进程；若新 credential 会把相同 endpoint/model 路由到不同 embedding space，则必须按新的索引配置处理，不能把它当作只有认证值变化的轮换。KG OS 不增加 secret registry 或隐藏环境变量约定。Lithograph 本身仍支持直接配置 `api_key`，但该低层能力不进入 KG OS 的公共配置 profile。

实际 Semantic query/rebuild 先解析目标索引所需 Provider；Provider 未注册时，即使缓存完整也失败。扩展存在但远端服务不可用时，只在确实需要计算缺失 embedding 时影响检索；普通 graph read、纯 source 写入与没有改变 Semantic definition 的 merge 不调用服务。新增 / 改变索引的本地配置校验失败仍阻止 Schema publication。错误映射由 [公共合同](contracts.md#公共错误合同)负责。

### 配置生效时机

已进入完整运行态的 `kgosd` **只在启动/打开 Runtime 时读取配置**；D105 无配置启动属于特殊的受限阶段，Web 第五步写入的配置由本次首次 Runtime Open 读取，**不是对已经打开的 Runtime 做热更新**。完整运行态修改 `config.toml`：

- 不触发 file watch / hot reload；
- 不改变当前进程的 effective config；
- 不触发当前进程自动退出；
- `cache`、caller `sqlite.extensions`、`fulltext` 与 `embedding` 的新文件值只在下一次 `kgosd` 启动时被读取。

KG OS 不检测运行中的 `config.toml` 是否被修改，也不因为文件变化自行 hot-reload / restart daemon。下一次进程启动读取当前文件；其中 `[fulltext]` / `[embedding]` 虽然属于“初始化后禁止修改”的 Instance 初始化合同，Runtime 仍不保存旧值进行比较。

### `extensions/`

`extensions/` 是 Instance Directory 内 SQLite Extension resolver 的 content-addressed artifact cache。目录名使用实际 artifact SHA-256；remote archive 解包后的文件也只存在对应 hash root 下。这个目录不是插件 registry、安装数据库或 Knowledge Base State：删除未被运行进程使用的 cache 只会让下次启动重新从配置 source 解析，不能改变任何 Commit/Branch。运行中的 daemon 固定使用启动时已经解析的 artifacts，不因 cache/source 文件后来变化而让新 connection 漂移到另一份 native binary。

### `kgosd.lock`

`kgosd.lock` 是 **single-instance lock + active runtime locator**，不是配置文件、credential store 或 runtime state database。每个 Instance Directory 同一时间最多一个 active `kgosd`。D105 受限 listener 可先发布 locator，但其业务就绪必须继续依据 receipt 和真实状态检查，不改变单实例独占规则。

`kgosd` 启动时 open/create 此文件并尝试获取 OS-level exclusive file lock；整个进程生命周期持续持有该 lock。另一个 `kgosd` 无法取得 lock 时必须停止启动，不能通过不同端口绕过 single-instance 约束。

取得 lock 后，新的 owner 先覆盖任何旧内容。daemon可以先写入启动中的 `pid/version`；HTTP bind 与全部 startup validation成功后发布完整 active locator，例如：

```json
{
  "pid": 48321,
  "endpoint": "http://127.0.0.1:51423",
  "version": "0.1.0"
}
```

endpoint 永远是本机 loopback URL。token绝不能写入lock；CLI从同一Instance Directory的 `auth.json` 取得credential。**文件存在本身不表示 daemon正在运行。** daemon ownership只由进程持有的OS file lock仲裁；locator用于client发现，业务request的Bearer认证再提供错连Instance时的fail-closed保护。进程崩溃时OS释放lock，即使文件内容残留也只是stale locator。下一次成功取得lock的daemon覆盖它。

正常 graceful shutdown 与 crash 的 locator 语义不同：持有权威 lock 的 daemon 在正常关闭时先把 locator 内容清空并 sync，再释放 OS lock；因此已完成初始化的 Instance 在正常 stop 后由 CLI 观察为 `stopped`。SIGKILL、进程崩溃或机器异常不能保证执行这一步，残留内容仍按 D79 作为 stale locator处理，`doctor` 报 `unavailable`，下一业务 Runtime ensure 只能通过新的 daemon contender 实际取得 OS lock来确认并恢复，CLI 不自行删除或锁定文件。

### `logs/`

`logs/` 保存 `kgosd` 的本地诊断日志，不属于 Knowledge Base history 或业务状态真源。结构化日志、关键业务事件、请求关联、文件轮转/保留、容器日志分工与 Metrics 统一由 [Observability](observability.md) 拥有；具体实现与已通过的验收证据见 [Phase 19](../development/phases/19-observability.md)。

### `kgos.db`

v1 Knowledge Base 的唯一 target 固定为 `<workspace-root>/.kgos/kgos.db`，不再增加其它 `data/` 中间目录。daemon重启不能把 `kgos.db` 当作临时状态清理。`kgosd` 不在一个Instance内维护 Knowledge Base name、registry、selector或多库connection target，CLI也不提供 `base list/use` 或 `--base`。

如果 `<workspace-root>/.kgos/kgos.db` 不存在，daemon startup创建新的 SQLite database、初始化 Lithograph，并按 [Architecture](architecture.md#knowledge-base-bootstrap) 完成 KG OS bootstrap；如果已经存在，则先解析 `branch/main` 当前 head。该 head 已满足当前 KG OS consistency contract 时按既有 Knowledge Base打开，**不要求 startup扫描并证明所有历史Commit、Branch或Tag都KG OS-valid**；invalid history仍按高层接口/Graph既有诊断边界处理。只有当前 `main` 不是 KG OS-valid时才检查是否满足fresh Root baseline：满足则bootstrap，否则拒绝automatic adoption。切换Knowledge Base就是下一次CLI使用另一个明确 Workspace Root，不在运行中的daemon内切库。

## Daemon lifecycle

`kgosd` 自身始终是 **foreground server**：它不 self-daemonize、不 fork 到后台。下面 CLI-managed daemon 规则是历史 npm/本机运行入口；当前正式发行仅为 Linux amd64 Docker 单进程，D105 让这一进程在**无配置时也能提供受限 Web**。不因此增加第二套监听服务或 daemon 自我守护机制。

普通用户不直接管理 `kgosd`；daemon lifecycle不进入v1 public CLI namespace。成功完成首次 `init` 后，保留的**内部开发 CLI** 针对已解析 Workspace Root 执行 Runtime ensure：已有 healthy compatible active daemon 时复用，没有 usable owner 时从本仓库已组装的本地 Runtime bundle 后台 spawn `kgosd --root <absolute-root>` 并等待 ready。旧 npm 发行 CLI 的历史安装行为不因此追溯改变。这个自动 spawn 只为本地内部开发服务，不改变业务 HTTP/Bearer 边界。

### 启动

以下是**当前已实现的完整 Runtime 启动链路**；D105 的目标是在持有同一锁且提供受限 HTTP listener 后，按 [初始化状态](#web-first-run-bootstrap) 选择只读 Web Setup、自动 Bootstrap 或正常完整 Runtime。图中的“未加载 config 则失败”“endpoint 发布才等于业务 ready”仅是现有实现基线，不能被当作新目标：

```text
require and resolve --root <absolute-workspace-root>
→ derive Instance Directory <root>/.kgos
→ open/create kgosd.lock
→ acquire exclusive OS lock
→ clear stale lock content
→ publish starting pid/version without any token
→ ensure runtime-owned directories required by this Instance
→ verify this kgosd native package manifest / target / version
→ load <root>/.kgos/config.toml once
→ load existing <root>/.kgos/auth.json or securely create it once
→ statically validate cache + caller sqlite.extensions + fulltext + embedding config; do not resolve embedding api_key_env
→ resolve official Runtime extensions + caller configured extensions to <root>/.kgos/extensions/<sha256>
→ open one exclusive read-write bootstrap connection to <root>/.kgos/kgos.db
→ connection hook loads official Lithograph → official Provider → caller additional extensions → official Jieba and verifies host SQLite >=3.45 + FTS5
→ call lithograph_version(); if databaseId/storageFormat.current are null, run lithograph_init(); otherwise verify compatible existing database
→ verify Root/main and freeze this startup databaseId/storage-format/Instance baseline
→ validate effective Full-text analyzer on the bootstrap connection
→ run staged Semantic create + tx_abort to validate current openai-compatible provider/config without network or durable Schema
→ activate normal read-write/read-only connection sets; every physical connection reloads the same artifacts and must match the frozen Lithograph baseline
→ verify SQL execution / true-stream / context-cancellation primitives on the activated runtime
→ resolve branch/main and open existing KG OS-valid head, or bootstrap only a fresh Root baseline; otherwise fail closed
→ validate the D68 reserved Ontology Schema + internal-marker subgraph invariants required by the main head, without a full Knowledge-data scan
→ resolve bundled Web assets
→ bind 127.0.0.1:0 for Web + API
→ write active pid/endpoint/version into kgosd.lock
→ serve Web shell + authenticated API
```

在以上**旧完整 Runtime 路径**中，任一步失败都必须结束该次启动并释放 OS lock，不能留下一个“看起来 active”的逻辑实例。旧本机 `init` 在配置发布后把 `kgosd` 作为 detached/background child 启动并等待 `running`，再做 authenticated readiness 检查；成功后 daemon 保持运行。D105 的新受限 HTTP 模式即使 Kernel 尚未 ready 也可以发布 active endpoint；**新 `GET /api/v1/setup/status` 与已有 receipt/readiness** 必须进一步区分“HTTP 服务活着”和“业务可用”。完整初始化出错而仍安全保留的受限 listener 只能服务状态/恢复引导，不能假称业务启动成功；普通 CLI/SDK/MCP 不得把它当作就绪 Kernel。

自动start必须幂等且并发安全：已有healthy compatible `running` daemon时不再启动第二个进程；多个caller并发触发ensure时最终只有一个 `kgosd` 获得exclusive lock，其它caller等待winner发布endpoint后复用。active locator报告不同/不兼容Runtime version时CLI fail closed，不静默kill或替换正在运行的daemon。

### 当前实例发现与状态

业务CLI **只使用当前Instance Directory locator中的endpoint**，而不是从config或固定端口推测监听位置；token只从同一Instance Directory的 `auth.json` 取得。业务CLI在首次init未完成（例如缺少auth/db/bootstrap）时不得把Runtime ensure当作隐式onboarding；这类状态只能由 `init` 恢复。CLI 不需要、也不得为了判断 Runtime 状态引入第二套 native file-lock client；exclusive lock 的唯一仲裁者是 daemon。CLI 需要启动时可以 spawn contender，最终只有真正取得 daemon OS lock 的进程继续启动，loser退出后 caller继续等待winner locator或明确失败。

状态判断遵守：

```text
无有效 locator                                      → stopped / start candidate
locator 只有 pid/version、尚无 endpoint                → starting hint
endpoint可连接且version兼容                            → running candidate
endpoint不可连接                                      → recovery candidate
endpoint可连接但version不兼容                          → mismatch
```

locator只是发现信息，不能替代daemon持有的OS lock。stale `kgosd.lock` 内容不能单独证明daemon仍在运行，PID是否存在也不是 ownership 真源，避免 PID reuse 造成误判。endpoint 不可连接时，CLI Runtime ensure允许启动一个当前版本的 **contender**；contender能否取得 `kgosd.lock` 的 OS exclusive lock才是 stale recovery 的权威仲裁：

```text
unreachable locator
→ spawn contender
→ contender acquires OS lock
   → old owner 已不存在 / stale locator confirmed
   → contender覆盖旧 locator并按正常startup成为唯一daemon
→ contender cannot acquire OS lock
   → live owner仍存在
   → caller在有界等待后仍无ready endpoint则报告Runtime unavailable
```

多个 CLI 并发发现同一 stale locator时仍只能有一个 contender取得lock，其余caller等待winner发布新endpoint；不得先删除lock文件、根据PID force-kill、或绕过single-instance lock启动第二个daemon。locator错误endpoint如果指向另一个KG OS Instance，endpoint本身可连接时仍进入正常认证边界，原始业务请求必须因为per-root token不匹配而在进入Kernel前认证失败，CLI不得把认证失败当成stale locator再fallback其它root/token。reachable但版本不兼容的active daemon继续fail closed，不静默替换。

`doctor` 仍保持 side-effect-free：它看到 unreachable locator 时可以报告 `unavailable`，但不得为了判定 stale 而 spawn contender、删除 locator 或获取第二套 CLI-side lock。上述 recovery candidate 只属于**业务命令的 Runtime ensure**；因此“doctor 报 unavailable”与“下一条业务命令可以通过 daemon-held OS lock 仲裁自动恢复”并不冲突。

### 停止边界

daemon 自身仍保留统一 graceful shutdown path；Unix SIGINT / SIGTERM 或测试进程终止触发停止时至少保证：

```text
进入 stopping
→ 不再接受新的业务操作
→ 让已接受操作到达安全完成点；未提交 transaction 必须 rollback
→ 关闭 Lithograph / SQLite connection lifecycle
→ flush 必要日志
→ 在仍持有 OS lock 时清空并 sync kgosd.lock locator
→ 退出进程并释放 OS lock
```

若 active lock owner 存在但 HTTP 不可用，业务 CLI 返回 Runtime unavailable，不根据 PID 做 force kill、也不私自替换 owner。v1 不提供普通用户 daemon stop/restart 命令。

v1 不定义 launchd/systemd registration、开机启动、service installation、Windows Service 或长期 supervisor packaging。CLI background detach 与 ready wait timeout 属于本机实现合同；如果未来需要正式 service-manager integration，再单独定义稳定 Runtime 安装位置、升级与 stop/restart 语义，不能让外部服务配置绑定 npm 临时/cache 路径。

## 边界

- CLI、SDK、Web 都不能直接访问 SQLite / Lithograph 来绕过 `kgosd`；
- CLI-managed Runtime固定使用loopback动态端口，不从Instance config选择端口；
- v1 不提供第二种 IPC transport；
- Workspace Root 只由 CLI 的 `--root` / `KGOS_ROOT` 明确解析；daemon 接收显式 `--root`，不存在 `KG_HOME`、默认 profile、cwd/parent discovery 或 hidden current base，一个 Workspace 只承载 `<root>/.kgos/kgos.db`；
- `auth.json` 是该 Instance Directory 的持久 server credential；ready 后的业务 API 仍使用 Bearer token，D105 仅公开少量初始化 status/首认领/预初始化 Web Session 入口，本机 CLI 只读取同一 Workspace 的 `.kgos/auth.json`，不存在 `KG_TOKEN` override；
- v1只有单token全权限认证，不提供user / role / scope / OAuth / TLS；CLI-managed daemon只监听loopback；
- `kgosd` / Kernel / Database Host使用Go；`@kgos/sdk` / `@kgos/cli` / Web使用TypeScript；内置Web随daemon native package交付，与API共用进程、endpoint和lifecycle；
- `config.toml` 不 hot reload，也不做修改检测；当前文件只在下一次 daemon startup 读取；
- official Lithograph / Provider / Jieba来自当前native Runtime package；`[[sqlite.extensions]]`只表达caller additional SQLite extensions；两类artifact最终都走同一startup resolver/load lifecycle，不由业务请求动态加载；
- remote extension 必须 SHA-256 pin，最终总是从 daemon-local immutable artifact 加载；每个 SQLite connection 都加载同一解析结果；
- `[fulltext].analyzer` 在最终配置中必填，`init` 未显式覆盖时写入 official `jieba`；`[embedding]` 的全部字段也是必填初始化配置；`init`时明确提示初始化后禁止修改，但Runtime不保存历史值进行检查；
- `[cache].path/max_size_mb` 必填且 cache 始终启用，映射到 OpenAI-compatible Provider 的独立 SQLite cache，不写 Lithograph `main`；
- Full-text analyzer 与 Semantic provider/config 正常保存在各自 versioned IndexDefinition；KG OS 不保存第二份 fingerprint/generation，不在 restart 时自动迁移或批量重建；
- `kgosd.lock` 承担single-instance + active `pid/endpoint/version`定位，但不保存token或业务状态；
- 已完成首次 init 的业务命令在 compatible active daemon 不存在时自动启动当前 npm native package 的 `kgosd --root ...` 并等待 ready；`doctor` 始终 side-effect-free，`init` 则按 D82 主动启动 daemon 直到完整 readiness；
- `<root>/.kgos` Instance Directory 是 config/credential/cache/persistent-data home，但不是 KG OS Knowledge graph 的第二套存储模型；
- Knowledge Base target 为 `<root>/.kgos/kgos.db`；Provider cache 是独立 derived runtime data，不属于 Knowledge Base storage；v1 没有单-daemon多库 selector。
