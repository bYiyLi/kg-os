# 本地运行时

本文件是 KG OS v1 **Go `kgosd` 本地服务、内置 Web 交付、HTTP bind、`KG_HOME` runtime profile、单 Knowledge Base、单 Token 认证、Embedding Provider startup config/cache mapping、daemon lifecycle、Web hosting 与默认 endpoint** 的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；CLI 命令由 [CLI](cli.md) 负责。

## 本地服务模型

KG OS v1 采用 Go 实现的本地 `kgosd` daemon，作为 API 与内置 Web 的统一运行时入口。Kernel 与数据库调用编排在该服务内执行：

```text
kg CLI (Go) / SDK (TypeScript) ── API HTTP ───┐
Browser ───────── 页面 / API HTTP ────────────┤
                                              ▼
                                      kgosd（Go）
                                      ├── 内置 Web
                                      ├── net/http API
                                      └── KG OS Kernel → database/sql → Lithograph
```

`kgosd` 同时承载 API 与 Human-facing Web，因此 CLI、SDK 与 Web 使用同一个 KG OS Kernel 和同一组 Object / Graph / Evolution logical contract。部署和启动只需要这个 daemon，不单独安装、部署或启动 Web 服务；Web 与 API 共用进程、配置端口和 lifecycle。v1 不为 CLI 再建立 Unix socket / Named Pipe / gRPC 私有协议。

## HTTP bind 与标准本地 endpoint

v1 使用 IPv4 HTTP。`kg install` 的标准推荐值是本机 loopback：

```text
recommended host = 127.0.0.1
recommended port = 4765
recommended origin = http://127.0.0.1:4765
```

`server.host` 与 `server.port` 都必须由 `$KG_HOME/config.toml` 显式给出。v1 `server.host` 接受 IPv4 bind address；标准安装推荐 `127.0.0.1`，调用方也可以明确配置 LAN address 或 `0.0.0.0`。`kgosd` 只绑定配置解析得到的这一组 `host:port`，不额外监听第二个地址。

`server.host = "0.0.0.0"` 表示监听所有 IPv4 interfaces。由于 wildcard bind address 不是一个适合作为 client target 的远端地址，`kg` 在这种配置下仍连接 `127.0.0.1:<port>`；其它设备应使用运行 `kgosd` 主机的实际可达 IP。对于其它具体 `server.host`，本机 CLI 直接连接该 configured host。

如果目标端口已被其它进程占用，`kgosd` **启动失败并返回明确错误**；不能自动寻找下一个端口，也不能退回随机端口。这样 Web URL、CLI target 与本地工具观察到的 endpoint 始终来自确定配置，而不是进程启动时的隐式选择。

普通 API request / response 使用 HTTP + JSON；Object body 继续按 Object contract 使用 `application/yaml` 或 `application/json`；Graph streaming 使用 HTTP streaming + NDJSON。具体 HTTP method / route / metadata carrier 仍属于 HTTP adapter mapping，但不得改变 logical contract。

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

Web 构建产物随 `kgosd` 同一交付物发布，由 `kgosd` 的 HTTP server 直接提供页面和资源；本地业务 CLI 在需要时自动确保 daemon 已运行，同一个 configured origin 即可访问 Web 与 API。没有独立 Web 启动命令、第二个服务端口或单独部署步骤。

Web 与 CLI / SDK 在逻辑上都是公共 API 的客户端。服务端与 `kg` CLI 使用 Go；Web / SDK 使用 TypeScript。Web 构建出的浏览器代码经 `kgosd` HTTP 下载后在浏览器执行；这里的“同进程”只表示页面 / 资源服务与 API 服务由同一个 daemon 承载，不表示浏览器代码在 Go 进程内执行。

前后端代码分属 Go 与 TypeScript workspace，但这不产生第二个**产品部署服务**。Phase 00 开发环境可以使用 Vite dev server + proxy/HMR 作为开发工具，不要求把 Vite middleware嵌进 Go `net/http`；生产/本地正式运行的 Web构建产物仍由 `kgosd` 同端口直接提供，运行时不依赖 Vite。具体开发端口属于工程配置，不进入公开 endpoint contract。

Phase 00 的页面 / HTTP 壳层验收只是工程验证，不修改正式 daemon 的数据库就绪条件，不新增跳过初始化或认证的公共运行模式。开发脚本不得把尚未接入 Knowledge Base 的壳层标成正式 `running`；完整启动仍须通过下文的能力检查与 bootstrap。

### Web 交互设计状态

已确认 Web 内置于 `kgosd` 的交付与运行流程，与 CLI / SDK 共用 Kernel、业务合同和实例认证；人通过 Web 查看、管理和纠正知识。具体页面布局、导航与操作交互尚未细化，需在 Web 实施阶段沿用 Ontology / Object / Graph / Evolution 的现有能力补充。此项不阻塞 Kernel、daemon、CLI 或 SDK 的实现，也不表示 Web 页面设计已经完成。

## 单 Token 实例认证

KG OS v1 对 `kgosd` HTTP API surface 使用一个最小的 **single-token instance authentication**：一个 `KG_HOME` 只有一个持久 access token；持有该 token 就拥有该实例全部 API 能力。v1 不建立 user、password、role、scope、refresh token、OAuth、session account 或多租户授权模型。

服务端 credential 的唯一真源是 `$KG_HOME/auth.json`：

```json
{
  "token": "<opaque-secret>"
}
```

第一次 daemon startup 时，如果 `auth.json` 不存在，`kgosd` 使用 cryptographically secure random source 生成至少 256 bit entropy 的 opaque token，并原子创建该文件；后续 restart 继续读取并复用同一 token，**不会因为 restart 自动轮换 credential**。`auth.json` 已存在但无法读取、JSON/字段非法或 token 为空时启动 fail closed，不能静默覆盖为新 token。v1 不提供 token rotation API / CLI；operator 若要手工替换 credential，属于 daemon 停止后的本地 secret 管理，不是 Knowledge Base mutation。

`auth.json` 是 runtime secret，不属于 Knowledge Base State、Commit Data、配置 fingerprint 或 Evolution。POSIX 上新建文件权限必须为 `0600`；其它平台使用等价的当前用户私有访问控制。token 不得写入日志、error `message/details`、lock file、State、HTTP response body 或诊断 dump。

所有 `kgosd` **API request** 都必须携带：

```http
Authorization: Bearer <token>
```

不接受 query parameter、URL、request body 或 cookie 作为 token 的第二种 canonical carrier。缺失、空、malformed 或不匹配的 Bearer credential 都返回同一个 `AUTHENTICATION_FAILED`，HTTP adapter 使用 `401 Unauthorized`，不得通过错误差异泄露 credential validity。实现比较 token 时使用适合 secret 的 constant-time comparison。

客户端 credential 继续通过 Bearer 进入 daemon，但本机 CLI 可以复用当前 profile 的本地 secret：

- `kg` CLI 的 credential resolution 固定为：非空环境变量 `KG_TOKEN` 优先；否则读取当前 `$KG_HOME/auth.json`。显式 `KG_TOKEN` 存在但错误时不得 fallback 到本地文件；CLI 不提供 `--token`，也不把 token 写入 stdout/stderr；
- SDK 必须由调用方显式提供 token，再统一发送 Bearer header；
- Human-facing Web 不拥有 credential-free API 旁路；浏览器端必须先取得 token，再对所有 API request 发送同一 Bearer credential。exact browser credential entry/storage 属于 Web adapter 实现合同，但不得让 token 进入 URL 或 server-side session account；
- `kgosd` 自身启动、首次创建 `auth.json` 与本地 CLI 为业务命令自动 spawn daemon 都不是 HTTP API request，因此不要求预先存在客户端 token；daemon ready 后，原始业务 request 仍必须按上述规则取得 token 并发送 Bearer header。

标准推荐的 `127.0.0.1` 仍是安全边界的一部分。Bearer token 提供**认证**，不提供 transport confidentiality；v1 仍不内置 TLS。显式绑定 LAN address / `0.0.0.0` 时，在不可信网络上使用明文 HTTP 会暴露 bearer credential；多用户、细粒度授权、TLS 或公网安全部署必须另行设计。

## KG OS distribution

官方 native distribution 必须把 CLI、daemon 与 KG OS 必需的 SQLite extensions 作为同一个可移动目录交付。当前 macOS / Linux package layout 固定为：

```text
<distribution>/
├── kg
├── kgosd
├── extensions/
│   ├── lithograph.<platform-library-suffix>
│   └── lithograph-openai-compatible.<platform-library-suffix>
└── manifest.json
```

`kg install` 以自身 executable 的 canonical directory 定位同 distribution 的 `kgosd` 与 `extensions/`，不依赖当前 working directory、PATH 中另一个同名 daemon 或用户手工提供官方 library path。release manifest 必须包含这些 files 的 SHA-256；`kg install` 在写配置前验证 required sidecar 存在且 hash 与 manifest 一致，`kg doctor` 只读执行同一完整性检查。package validation 要从 distribution 目录外执行 `kg doctor/install` 与真实 daemon smoke，证明布局自包含。当前支持目标沿用既有 macOS / Linux x64/arm64 工程基线；本节不新增平台承诺。

installer 写入 `config.toml` 时，把 distribution 中的 Lithograph 与 OpenAI-compatible Provider library canonical absolute path 作为 required local `sqlite.extensions[].source`，并写入 manifest 中对应 SHA-256 与各自公开 entrypoint。daemon startup 后仍由既有 resolver 把这些 source 固定为 `$KG_HOME/extensions/<sha256>/` 的 immutable runtime artifact；installer 不建立第二套 extension cache。额外第三方 extension 继续由通用 `[[sqlite.extensions]]` 合同表达，不改变官方 distribution 的固定 required artifacts。

## `KG_HOME` runtime profile

KG OS v1 使用环境变量 `KG_HOME` 选择唯一 runtime profile。未设置时使用当前 OS 用户 home 下的 `~/.kgosd`；设置时整个 daemon、CLI target discovery、credential、relative Provider cache path、extension cache、日志与 Knowledge Base 都切换到该目录；显式 absolute Provider cache path仍按配置指向 profile 外位置。`KG_HOME` 自身不写入 `config.toml`，因为它负责定位 `config.toml`；实现必须把 effective `KG_HOME` 解析为明确的绝对目录，不能让不同组件各自解释相对路径。

一个 `KG_HOME` 固定对应：

```text
one KG_HOME
    = one runtime profile
    = at most one active kgosd
    = exactly one Knowledge Base target
```

目录布局冻结为：

```text
$KG_HOME/
├── config.toml
├── auth.json
├── kgosd.lock
├── kgos.db
├── cache/
├── extensions/
└── logs/
```

这些条目职责固定如下。

### `config.toml`

`config.toml` 是持久的 **startup configuration**。v1 使用 server、Embedding cache policy、SQLite Extension、Full-text 与 Embedding 五组配置。正式 Runtime 不依赖缺失字段的隐式默认值：`kg install` 必须写出完整显式配置，手工配置也必须满足同一完整性校验。以下以 macOS 本地安装路径为例；实际路径由安装产物决定：

```toml
[server]
host = "127.0.0.1"
port = 4765

[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096

[[sqlite.extensions]]
source = "/opt/kgos/extensions/lithograph.dylib"
entrypoint = "sqlite3_lithograph_init"
sha256 = "<distribution-manifest-sha256>"

[[sqlite.extensions]]
source = "/opt/kgos/extensions/lithograph-openai-compatible.dylib"
entrypoint = "sqlite3_lithographopenaicompatible_init"
sha256 = "<distribution-manifest-sha256>"

# 其它 SQLite extension 仍使用同一加载机制，但每项都显式提供真实 init symbol。

[fulltext]
analyzer = "unicode61"

[embedding]
base_url = "https://api.openai.com/v1"
model = "text-embedding-3-small"
dimensions = 1536
similarity = "cosine"
api_key_env = "OPENAI_API_KEY"
```

`server.host` 与 `server.port` 都是必填显式值；`server.host` 必须是合法 IPv4 address string，v1 不把 hostname / DNS resolution 引入 bind contract。`kg install` 的交互向导可以把 `127.0.0.1` / `4765` 作为推荐值显示，但用户按 Enter 只表示明确采用该值，最终配置仍完整写出。

`[fulltext]` 与 `[embedding]` 属于 Knowledge Base 初始化配置。交互安装进入这组配置前只提示一次：

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

用户 Cypher本身可以合法改变 connection checkout。KG OS 不尝试在语句后猜测或恢复原 checkout；任何 connection在下一次 operation使用前都必须按该 operation重新建立或明确覆盖所需 context，绝不能把 pool中残留的 active Branch当作默认值。写语句进入 `query` 时由物理只读 / `at` boundary拒绝，不自动换成读写 connection重试。两类 connection都加载同一批配置的 extensions。Graph 的语句范围见 [Graph](graph.md#graph)。

Bearer token 仍是实例的统一认证。通过认证的调用方可使用 Lithograph 支持的 Cypher；KG OS 不额外禁止 `LOAD CSV` 等文件 / 网络能力。实际文件路径位于运行 `kgosd` 的主机，访问权限由宿主进程和 Lithograph 决定；只读是数据库执行边界，不是无外部 I/O 模式。这里没有开放 raw SQL 或改变 extension 的 startup-only 加载合同。

Lithograph v0.3.0 的 Managed Semantic read 不再要求写 `kgos.db` 来发布 text -> Vector cache，因此 Graph `query` 可以使用物理只读 `main` connection。Provider 若启用自己的独立 cache database，仍可以按 providerConfig 写该 cache；这个写入不改变 Lithograph graph/schema/history/ref，也不把只读 Graph 入口升级成读写 connection。Phase 01 已用真实 Go driver + release artifact 完成 read-only/write connection、Provider readiness/cache mapping 与 cancellation 的 host-level integration 验证；公共 Graph HTTP surface 实现后仍须按 [Implementation](implementation.md#managed-semantic-integration-readiness) 做端到端验证。

### Embedding result cache

KG OS 不实现 text -> Vector cache，也不调用 Lithograph cache procedure。Lithograph v0.3.0 把 persistent embedding result cache 交给具体 Embedding Provider；KG OS 的 `[cache]` 只是**创建 / 因业务定义变化必须重建 OpenAI-compatible Semantic Index 时的默认 providerConfig mapping**。

配置入口：

```toml
[cache]
path = "cache/openai-compatible.db"
max_size_mb = 4096
```

- `path` 与 `max_size_mb` 都是必填；`max_size_mb` 为正整数，1 MB 按 1 MiB 解释。交互 installer 可以推荐 `cache/openai-compatible.db` 与 `4096`，但不能通过字段缺失表达默认值。
- `path` 为 absolute path 时原样使用；relative path 统一相对 effective `KG_HOME` 解析，compiler 写入 `providerConfig.cache.path` 前必须得到 absolute path，避免进程 cwd 改变 cache identity / location。
- v1 Provider cache 始终启用；`kgosd` 只确保 path 的父目录存在，不预创建、ATTACH、检查内部表或直接维护 cache database；OpenAI-compatible Provider 自己负责 cache marker/schema、lookup、publish、FIFO budget、并发与损坏处理。Provider 必须拒绝把 cache file 指向 `kgos.db`。
- `max_size_mb` 映射为 Provider `cache.max_bytes = max_size_mb * 1024 * 1024`，转换必须检查整数范围。预算只约束 Provider 定义的 vector payload，不是 cache SQLite 文件物理大小，也不包含 Lithograph HNSW/TEMP materialization 或 extension artifact cache。
- compiler 固定写入 `providerConfig.cache.enabled=true`；KG OS 不公开 disable/skip cache 的安装配置。Provider cache hit/miss 对 Lithograph 与 KG OS correctness 不可见，删除 cache 只会增加后续 Provider 调用。
- `[cache]` 是 Semantic Index 创建 / replace 时使用的 provider cache 配置；已经存在及历史 IndexDefinition 继续保留它们 versioned 的 providerConfig。KG OS 不扫描、迁移或改写历史配置。
- `db.index.semantic.rebuild` 仍是 Lithograph TEMP Semantic/HNSW maintenance，不是填充 Provider-owned embedding cache 的入口；KG OS 不新增预热 CLI/API、后台 scheduler 或第二套 cache service。

Provider cache database 是 runtime/derived data，不属于 State、Commit、Branch、Lithograph storage format 或 Knowledge Base correctness source。relative `path` 可以显式配置为 `cache/openai-compatible.db` 并解析到 `$KG_HOME/cache/`；absolute path 也允许位于 profile 外。由于写入 IndexDefinition 的 cache path 是 versioned absolute path，复制 `kgos.db` 或改变 `KG_HOME` **不会**自动重写既有索引的 recorded path；v1 不提供 cache-path migration。查询旧索引时仍使用该索引自己的 recorded config，cache路径不可创建/打开时按 Provider公开 I/O/config错误失败。

### SQLite Extension source resolver

`[[sqlite.extensions]]` 是 **kgosd 创建 SQLite connection 时必须加载的通用 SQLite loadable-extension 列表**。Lithograph 本身也通过这套配置提供，不再由 KG OS binary 内嵌、写死安装路径或另设 `[lithograph]` 特例；Jieba tokenizer、其它 tokenizer、SQL function、virtual table 或未来其它 SQLite extension 都使用同一机制。配置数组顺序就是每个 connection 的加载顺序，配置了就表示 required；v1 不增加 `kind/name/enabled/optional/capabilities` 等插件注册层。

每个 entry 的合同固定为：

- `source` **必填**，只能是本机 absolute file path 或 absolute `https://` URL；不接受 relative path、`http://`、其它 scheme、目录或自动按插件名发现/下载。KG OS 不维护插件 registry/package manager。
- `source` 可以直接指向当前平台可加载的 `.so` / `.dylib` / `.dll`，也可以指向 `.tar.gz` / `.zip` archive。archive 必须额外提供 `library`，它是解包根目录内要交给 SQLite 加载的精确 relative regular-file path；direct library 不提供 `library`。v1 不做 glob、basename 猜测或平台自动选包。
- `entrypoint` **必填**，必须是非空、无 NUL 的 SQLite extension init symbol。KG OS 把该 symbol 原样交给 driver 的 extension-loading API，不做 filename-derived symbol 猜测。Lithograph 可以使用 `sqlite3_lithograph_init`；OpenAI-compatible Provider 使用其 provider-specific 公开 symbol `sqlite3_lithographopenaicompatible_init`；虽然它也导出 generic `sqlite3_extension_init`，KG OS 示例与官方配置优先使用 provider-specific symbol。其它 extension 必须由 operator填写自身真实 init symbol。
- `sha256` 对 **远程 source 必填**，必须是 64 位 lowercase hex，校验的是下载得到的原始 artifact bytes；本地 source 可省略，提供时同样必须匹配。无论配置是否显式给出，resolver 都会计算实际 artifact SHA-256，并以内容 hash 固定本次 daemon 使用的 artifact identity。

远程 URL 只作为 artifact location，不是可执行 identity。resolver 可以跟随有界的 **HTTPS → HTTPS** redirect，以支持 GitHub Releases 这类下载；不得降级到 HTTP。`releases/latest/download/...` 可以配置，但仍由 `sha256` 固定本次允许的 bytes：若远端 `latest` 已变化且本地没有旧 hash cache，校验失败而不是自动升级。因此正式可复现部署优先使用带版本号 URL + SHA-256。

所有 source 都先解析成 daemon-local immutable artifact，再进入 SQLite connection lifecycle：

```text
local source --------------------┐
                                 ├─ read/download bytes
https source -- bounded redirect ┘
               ↓
        verify configured SHA-256 when present/required
               ↓
        actual SHA-256 content identity
               ↓
        $KG_HOME/extensions/<sha256>/
               ↓
        direct library or safely extracted archive
               ↓
        resolved local library path
```

archive extraction 必须 fail-closed：拒绝 absolute path、`..` traversal、symlink/hardlink、device/special entry 与越界 `library`；download / decompression / extracted-size 受实现资源上限约束。先写临时文件/目录，hash 与 extraction 全部成功后再原子发布 content-addressed cache。缓存命中时重新确认目标 artifact 与 hash 一致；缓存可删除并从 source 重建，不属于 Knowledge Base history 或 correctness source。远程 cache 已存在且有效时，daemon restart 不要求网络可用。

`kgosd` 对每个新 SQLite connection 使用**同一批已解析的本地 artifacts**：仅在宿主 SQLite 驱动的 connection 初始化阶段临时允许 extension loading，按配置顺序逐项调用可接受显式 `(library, entrypoint)` 的 driver API，随后立即关闭该能力；业务 Cypher/SQL 不获得任意 `load_extension()` 权限。任一 configured extension 在任一 connection 加载失败，该 connection 不进入可用池。Go host通过 process-private registered driver / connection hook把这一步绑定到每个物理 connection 的创建，不能只在 `*sql.DB` 初始 connection加载一次后假设 pool后续 connection自动继承。

Go SQLite runtime固定使用 `go-sqlite3` bundled amalgamation，并以 `sqlite_fts5` build tag构建；不得使用 `libsqlite3` 把 SQLite版本漂移到宿主系统，也不得使用 `sqlite_omit_load_extension` 移除 KG OS 所需的 extension capability。startup仍必须实际 probe `sqlite_version() >= 3.45.0`、FTS5 与 configured extension加载成功，build tag本身不作为运行证据。

generic loader之外仍要验证 Lithograph capability，但不要求配置 `kind = "lithograph"`。connection initialization分为两层：**物理 connection 构造**只负责打开目标 database、按顺序加载全部 configured extensions、验证 host SQLite version/FTS5并确认 `lithograph_version()` 可调用；**Lithograph database activation** 必须先由一个独占 read-write bootstrap connection完成。`lithograph_version()` 在尚未初始化的干净 database上返回 `databaseId:null` 与 `storageFormat.current:null`，此时 bootstrap connection执行一次 `lithograph_init()`；已有 database则按返回的 databaseId/storage format/profile做兼容性验证。只有初始化/迁移和 Root/`main`验证成功后，connection才允许进入后续 Lithograph SQL / Provider capability probe。

当前 daemon `[embedding]` / `[cache]` 显式配置在已完成 Lithograph initialization的独占 bootstrap write connection上通过公开 SQL做**可回滚 local validation probe**：`lithograph_tx_begin()` → staged `db.index.semantic.createNodeIndex`（随机 probe index/label/property，使用当前 provider/config/dimensions/similarity）→ `lithograph_tx_abort()`。CREATE只调用 Provider本地 `validate`，不得触发 `embedBatch` / network；probe成功后不得留下 Commit、Schema、Index或 Branch变化。任一 configured extension init失败已经使 connection不可用，因此 Provider extension的 connection-local registration不需要读取 private client-data；缺少 `openai-compatible` registration或当前 config非法时 probe失败并终止 startup。

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

公共 Graph 同样只使用 SQL surface：非 streaming 使用 `lithograph()`，streaming 使用 `lithograph_rows()`。后者是真正的 Lithograph execution stream，可承载 read/write、external I/O 与 transaction subquery；KG OS 不再需要 Native Graph adapter。Go integration 必须用真实 v0.3.0 extension 验证 streaming、`context.Context` cancellation、early close、partial/durable batch 语义与错误映射，见 [工程待办](implementation.md#go-运行时与数据库接入)。

### Full-text 全局配置

KG OS v1 的 Full-text 只暴露一个 daemon-global 运行时分词配置：

```toml
[fulltext]
analyzer = "jieba"
```

`[fulltext].analyzer` 是必填显式值，是非空、无 NUL 的**完整 FTS5 tokenizer specification STRING**，例如 `unicode61`、`porter unicode61`、`jieba`；KG OS 不解析第三方 tokenizer 的业务参数含义。`kg install` 可以把 `unicode61` 作为推荐值，但最终文件必须显式写出选择。它决定 KG OS **新建或因业务定义变化重建** managed Full-text Index 时写入的 `fulltext.analyzer`；若 specification 需要第三方 tokenizer，对应实现必须由前述 `[[sqlite.extensions]]` 在每个 connection 上注册。

KG OS v1 不公开 per-Index analyzer、`fulltext.eventually_consistent`、tokenizer path/arguments registry 或其它 FTS5 建表 options。Ontology 只声明“哪些字段需要 Full-text”。KG OS **创建或因业务定义变化重建** Full-text IndexDefinition 时写入当前 `[fulltext].analyzer`，并保持 `fulltext.eventually_consistent = false`；已经存在且本次不需要重建的 IndexDefinition 保留自己的 versioned analyzer。KG OS 不把 analyzer 配置、fingerprint 或 generation 额外写入 Knowledge Base。

每个 SQLite connection 在配置 extension 全部加载后、进入可用池前，都必须对**当前 `[fulltext].analyzer`**做无持久副作用的 FTS5 capability probe；未知 tokenizer、参数构造失败或运行时依赖缺失都使该 connection 初始化失败。这个 probe 只验证本次 daemon 要用于新建/重建索引的 analyzer，不要求启动时枚举并验证全部历史 State 曾经使用过的 tokenizer。

打开已有 Knowledge Base 时，KG OS **不比较**当前 `[fulltext].analyzer` 与库中已有 IndexDefinition，也不迁移或批量重建历史索引。历史 Full-text query 继续使用目标 State 的 versioned IndexDefinition 实际保存的 analyzer；如果那个 tokenizer 当前没有通过 `sqlite.extensions` 注册，则只让该次 Full-text 操作返回 `FULLTEXT_ANALYZER_UNAVAILABLE`。虽然初始化合同要求该配置初始化后禁止修改，Runtime 不实现历史值检测。

KG OS 不承诺检测第三方 extension 在同一 analyzer name 下偷偷替换算法/词典；远程 artifact SHA-256 pin 能固定 binary bytes，但插件外部资源仍由 operator 负责版本化。这与 Lithograph 的 tokenizer 可复现性边界一致。对同一 Knowledge Base 长期保持 analyzer 语义稳定是 operator responsibility，v1 不建立配置兼容检查或迁移机制。

### Embedding 配置与索引映射

KG OS v1 继续使用 OpenAI-compatible Embeddings。`[embedding]` 是 Knowledge Base 初始化时确定、之后供新建 / 因业务定义变化必须重建 Semantic Index 使用的全局配置；实际 HTTP client 由独立的 `lithograph-openai-compatible` SQLite extension 提供。它与 Lithograph 通过同一 `[[sqlite.extensions]]` 列表加载到每个 connection，注册名固定为 `openai-compatible`。KG OS 不新增 provider registry、下载器或另一套 HTTP adapter。

配置字段：

| 字段 | 规则 |
| --- | --- |
| `base_url` | 必填，absolute HTTP(S) API root，无 query/fragment，去掉末尾 `/` |
| `model` | 必填非空模型 ID，不通过 List Models 猜测 |
| `dimensions` | 必填 Integer 1..4096，必须等于服务实际返回维度 |
| `similarity` | 必填，允许 `cosine` / `euclidean`，映射到索引配置 |
| `api_key_env` | 字段必填；非空时必须是环境变量名且启动时检查其值存在且非空，空字符串表示调用方明确配置了无需认证的 endpoint |

KG OS 不接受字段缺失来表达 embedding 默认或禁用；也不接受内联 `api_key`。未知字段返回配置错误，不开放任意 headers/options bag。`[embedding]` 与本地扩展依然是 daemon 的运行前置条件；启动不发远端 health check 或 sample embedding 请求。

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
        path: '/absolute/KG_HOME/cache/openai-compatible.db',
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

KG OS 只保留 `api_key_env` 这一认证输入，不增加内联密钥的转接层。配置值非空时，索引只保存环境变量**名称**；Provider 在发请求时读取 kgosd 环境中的实际值，KG OS 不把解析后的 secret 写回 `providerConfig`、State、日志或错误。配置值为空时表示 no-auth endpoint，索引不保存 `api_key_env`。

环境变量名称随索引定义保存；历史索引仍引用原名称，修改当前默认名称不改写它们。普通 credential rotation 可保持同名变量并重启进程；若新 credential 会把相同 endpoint/model 路由到不同 embedding space，则必须按新的索引配置处理，不能把它当作只有认证值变化的轮换。KG OS 不增加 secret registry 或隐藏环境变量约定。Lithograph 本身仍支持直接配置 `api_key`，但该低层能力不进入 KG OS 的公共配置 profile。

实际 Semantic query/rebuild 先解析目标索引所需 Provider；Provider 未注册时，即使缓存完整也失败。扩展存在但远端服务不可用时，只在确实需要计算缺失 embedding 时影响检索；普通 graph read、纯 source 写入与没有改变 Semantic definition 的 merge 不调用服务。新增 / 改变索引的本地配置校验失败仍阻止 Schema publication。错误映射由 [公共合同](contracts.md#公共错误合同)负责。

### 配置生效时机

`kgosd` **只在进程启动时读取配置**。运行期间修改 `config.toml`：

- 不触发 file watch / hot reload；
- 不改变当前进程的 effective config；
- 不触发当前进程自动退出；
- `server.host` / `server.port`、`cache`、`sqlite.extensions`、`fulltext` 与 `embedding` 的当前文件值只在下一次 `kgosd` 启动时被读取。

KG OS 不检测运行中的 `config.toml` 是否被修改，也不因为文件变化自行 hot-reload / restart daemon。下一次进程启动读取当前文件；其中 `[fulltext]` / `[embedding]` 虽然属于“初始化后禁止修改”的安装合同，Runtime 仍不保存旧值进行比较。

### `extensions/`

`extensions/` 是 SQLite Extension resolver 的 content-addressed artifact cache。目录名使用实际 artifact SHA-256；remote archive 解包后的文件也只存在对应 hash root 下。这个目录不是插件 registry、安装数据库或 Knowledge Base State：删除未被运行进程使用的 cache 只会让下次启动重新从配置 source 解析，不能改变任何 Commit/Branch。运行中的 daemon 固定使用启动时已经解析的 artifacts，不因 cache/source 文件后来变化而让新 connection 漂移到另一份 native binary。

### `kgosd.lock`

`kgosd.lock` 是 **single-instance lock + active endpoint locator**，不是配置文件、PID file、credential store 或 runtime state database。每个 `KG_HOME` 同一时间最多一个 active `kgosd`。

`kgosd` 启动时 open/create 此文件并尝试获取 OS-level exclusive file lock；整个进程生命周期持续持有该 lock。另一个 `kgosd` 无法取得 lock 时必须停止启动，不能通过不同端口绕过 single-instance 约束。

取得 lock 后，新的 owner 先覆盖任何旧内容。HTTP bind 与全部 startup validation 成功后，文件只需要保存当前 active daemon 的本机可连接 endpoint，例如：

```json
{
  "endpoint": "http://127.0.0.1:4765"
}
```

如果 effective bind host 是 `0.0.0.0`，这里记录供本机 `kg` 使用的 `http://127.0.0.1:<port>`，而不是 wildcard address。其它具体 host 记录对应 effective local client endpoint。

**文件存在本身不表示 daemon 正在运行。** active ownership 以 OS file lock 是否被另一个进程持有为准；进程崩溃时 OS 自动释放 lock，即使文件内容残留也只是 stale content。下一次成功取得 lock 的 `kgosd` 会覆盖它。因此 v1 不保存 PID、version、startedAt 或第二份 configured endpoint，也不需要 `run/daemon.json`。

### `logs/`

`logs/` 保存 `kgosd` 的本地诊断日志。日志格式、rotation 与 retention 属于运维实现合同；它不是 Knowledge Base history，也不能成为业务状态真源。

### `kgos.db`

v1 Knowledge Base 的唯一 target 固定为 `$KG_HOME/kgos.db`，不再增加 `data/` 中间目录。daemon 重启不能把 `kgos.db` 当作临时状态清理。`kgosd` 不在一个 profile 内维护 Knowledge Base name、registry、selector 或多库 connection target，`kg` 也不提供 `base list/use` 或 `--base`。

如果 `$KG_HOME/kgos.db` 不存在，daemon startup 创建新的 SQLite database、初始化 Lithograph，并按 [Architecture](architecture.md#knowledge-base-bootstrap) 完成 KG OS bootstrap；如果已经存在，则先解析 `branch/main` 当前 head。该 head 已满足当前 KG OS consistency contract 时按既有 Knowledge Base 打开，**不要求 startup 扫描并证明所有历史 Commit、Branch 或 Tag 都是 KG OS-valid**；invalid history仍按高层接口/Graph既有诊断边界处理。只有当前 `main` 不是 KG OS-valid 时才检查是否满足 Architecture 定义的 fresh Root baseline：满足则执行首次 bootstrap，否则拒绝自动 adoption。切换 `KG_HOME` 就是切换整个 runtime profile 与 Knowledge Base，不在运行中的 daemon 内切库。

## Daemon lifecycle

`kgosd` 自身始终是 **foreground server**：直接执行 `kgosd` 时不 self-daemonize、不 fork 到后台。这样 terminal、launchd、systemd、Windows Service 或其它 supervisor 都可以直接管理同一个进程模型。

普通用户不通过 `kg daemon ...` 管理进程；该 namespace 不进入 v1 public CLI。任何需要本地 daemon 的业务命令都先执行 Runtime ensure：已有 healthy active daemon 时直接复用，没有 active owner 时后台 spawn `kgosd` 并等待 ready。这个自动 spawn 是业务 CLI 的本地运行前置，不改变原始业务 request 的 HTTP/Bearer 边界。

### 启动

直接 `kgosd` 与 CLI Runtime ensure 的 background spawn 最终都进入同一个 daemon startup path：

```text
resolve KG_HOME (default ~/.kgosd)
→ open/create kgosd.lock
→ acquire exclusive OS lock
→ clear stale lock content
→ ensure runtime-owned directories required by this profile
→ load $KG_HOME/config.toml once
→ load existing $KG_HOME/auth.json or securely create it once
→ validate server + cache + sqlite.extensions + fulltext + embedding config
→ resolve every SQLite extension source to immutable local artifacts
→ resolve configured host + port
→ open one exclusive read-write bootstrap connection to $KG_HOME/kgos.db
→ connection hook loads the resolved extension set in config order and verifies host SQLite >=3.45 + FTS5
→ call lithograph_version(); if databaseId/storageFormat.current are null, run lithograph_init(); otherwise verify compatible existing database
→ verify Root/main and freeze this startup databaseId/storage-format/profile baseline
→ validate effective Full-text analyzer on the bootstrap connection
→ run staged Semantic create + tx_abort to validate current openai-compatible provider/config without network or durable Schema
→ activate normal read-write/read-only connection sets; every physical connection reloads the same artifacts and must match the frozen Lithograph baseline
→ verify SQL execution / true-stream / context-cancellation primitives on the activated runtime
→ resolve branch/main and open existing KG OS-valid head, or bootstrap only a fresh Root baseline; otherwise fail closed
→ validate the D68 reserved Ontology Schema + internal-marker subgraph invariants required by the main head, without a full Knowledge-data scan
→ resolve bundled Web assets
→ bind <host>:<port> for Web + API
→ write active local endpoint into kgosd.lock
→ serve Web shell + authenticated API
```

任一步失败都必须结束该次启动并释放 OS lock；不能留下一个“看起来 active”的逻辑实例。CLI Runtime ensure 把 `kgosd` 作为 detached/background child 启动并等待它达到 `running`；`kgosd` 自身仍保持 foreground process 语义。对于原本没有 active daemon 的本地 start，父 CLI 等待 child 成功取得 lock 并在完成 config/auth/database validation、HTTP bind 后发布 endpoint，或观察 child 提前退出 / startup timeout。endpoint publication 是本地 ready signal，不构成 credential-free API endpoint；ready 后 CLI 再解析 credential并发送原始业务 request。

自动 start 必须幂等且并发安全：已有健康 `running` daemon 时不再启动第二个进程；多个业务 caller 并发触发 ensure 时最终也只能有一个 `kgosd` 获得 exclusive lock，其它 caller 等待 winner 发布 endpoint 后复用。

### 当前实例发现与状态

业务 CLI **只使用 active lock 中的 endpoint**，而不是重新用磁盘上的 `config.toml` 推测当前进程监听位置。

状态判断遵守：

```text
kgosd.lock 未被其它进程持有                  → stopped
lock 被持有，但尚未发布 endpoint               → starting
lock 被持有、已发布 endpoint 且本地 TCP 可连接      → running
lock 被持有、已发布 endpoint 但本地 TCP 不可连接    → unavailable
```

stale `kgosd.lock` 文件因为没有 active OS lock，只能解释为 `stopped`，不能把旧 endpoint 当成正在运行的 daemon。

### 停止与外部托管

daemon 自身仍保留统一 graceful shutdown path；平台正常 termination signal / event（例如 Unix SIGINT / SIGTERM）或外部 service manager 触发停止时至少保证：

```text
进入 stopping
→ 不再接受新的业务操作
→ 让已接受操作到达安全完成点；未提交 transaction 必须 rollback
→ 关闭 Lithograph / SQLite connection lifecycle
→ flush 必要日志
→ 退出进程并释放 OS lock
```

若 active lock owner 存在但 HTTP 不可用，业务 CLI 返回 Runtime unavailable，不根据 PID 做 force kill、也不私自替换 owner。v1 不提供普通用户 daemon stop/restart 命令。

### OS service manager 边界

v1 不建立自己的开机启动注册、service installation 或常驻 process supervisor。需要长期托管时，macOS launchd、Linux systemd user service、Windows Service 等只需要执行 foreground `kgosd`。普通业务 CLI 的 auto-start 只保证当前 profile 在需要时有可用 Runtime，不替代操作系统 service manager。

background detach、ready wait timeout 和 system-service packaging 属于工程实现合同，不改变上述 lifecycle 语义。

## 边界

- `kg`、SDK、Web 都不能直接访问 SQLite / Lithograph 来绕过 `kgosd`；
- v1 不提供随机端口 fallback；
- v1 不提供第二种 IPC transport；
- `KG_HOME` 是唯一 runtime profile selector；未设置时默认 `~/.kgosd`，一个 profile 只承载 `$KG_HOME/kgos.db` 这一个 Knowledge Base；
- `auth.json` 是该 profile 的持久 server credential；所有 daemon API request 使用 Bearer token，本机 CLI 使用 `KG_TOKEN` 优先、否则读取当前 profile 的 `auth.json`；
- v1 只有单 token 全权限认证，不提供 user / role / scope / OAuth / TLS；非 loopback plaintext HTTP 仍不是不可信网络安全模型；
- `kgosd` / Kernel / `kg` CLI 使用 Go；SDK / Web 使用 TypeScript；内置 Web 随 daemon 交付，与 API 共用进程、端口和 lifecycle，不单独部署 Web 服务；
- `config.toml` 不 hot reload，也不做修改检测；当前文件只在下一次 daemon startup 读取；
- `[[sqlite.extensions]]` 是唯一 SQLite loadable-extension 配置入口；Lithograph 与第三方 tokenizer/其它 SQLite extension 都走同一 resolver/load lifecycle，不由业务请求动态加载；
- remote extension 必须 SHA-256 pin，最终总是从 daemon-local immutable artifact 加载；每个 SQLite connection 都加载同一解析结果；
- `[fulltext].analyzer` 是必填初始化配置；`[embedding]` 的全部字段也是必填初始化配置；安装时明确提示初始化后禁止修改，但 Runtime 不保存历史值进行检查；
- `[cache].path/max_size_mb` 必填且 cache 始终启用，映射到 OpenAI-compatible Provider 的独立 SQLite cache，不写 Lithograph `main`；
- Full-text analyzer 与 Semantic provider/config 正常保存在各自 versioned IndexDefinition；KG OS 不保存第二份 fingerprint/generation，不在 restart 时自动迁移或批量重建；
- `kgosd.lock` 只承担 single-instance + active-endpoint 定位，不保存 PID 或业务状态；
- 业务命令在 active daemon 不存在时自动启动 `kgosd` 并等待 ready；`doctor` 与 `install` 本身不因此启动 daemon；
- `$KG_HOME` 是 daemon runtime/config/credential/cache/persistent-data home，但不是 KG OS Knowledge graph 本身的另一套存储模型；
- Knowledge Base target 仍为 `$KG_HOME/kgos.db`；Provider cache 是独立 derived runtime data，不属于 Knowledge Base storage；v1 没有单-daemon多库 selector。
