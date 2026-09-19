# 本地运行时

本文件是 KG OS v1 **TypeScript / Node.js `kgosd` 本地服务、内置 Web 交付、HTTP bind、`KG_HOME` runtime profile、单 Knowledge Base、单 Token 认证、Embedding Provider startup config、daemon lifecycle、Web hosting 与默认 endpoint** 的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；CLI 命令由 [CLI](cli.md) 负责。

## 本地服务模型

KG OS v1 采用一个以 TypeScript 实现、运行在 Node.js 上的本地 `kgosd` daemon，作为 API 与内置 Web 的统一运行时入口。Kernel 与数据库调用编排在该服务内执行：

```text
kg CLI / SDK ── API HTTP ───┐
Browser ── 页面 / API HTTP ─┤
                            ▼
                 kgosd（TypeScript / Node.js）
                 ├── 内置 Web
                 ├── HTTP API / control
                 └── KG OS Kernel → Lithograph
```

`kgosd` 同时承载 API 与 Human-facing Web，因此 CLI、SDK 与 Web 使用同一个 KG OS Kernel 和同一组 Object / Graph / Evolution logical contract。部署和启动只需要这个 daemon，不单独安装、部署或启动 Web 服务；Web 与 API 共用进程、配置端口和 lifecycle。v1 不为 CLI 再建立 Unix socket / Named Pipe / gRPC 私有协议。

## HTTP bind 与默认 endpoint

v1 使用 IPv4 HTTP。默认配置只监听本机 loopback：

```text
default host = 127.0.0.1
default port = 4765
default origin = http://127.0.0.1:4765
```

`server.host` 与 `server.port` 都允许调用方在 `$KG_HOME/config.toml` 中显式覆盖。v1 `server.host` 接受 IPv4 bind address；默认值是 `127.0.0.1`。因此默认仍然只允许本机访问，但调用方可以明确配置 LAN address 或 `0.0.0.0`。`kgosd` 只绑定配置解析得到的这一组 `host:port`，不额外监听第二个地址。

`server.host = "0.0.0.0"` 表示监听所有 IPv4 interfaces。由于 wildcard bind address 不是一个适合作为 client target 的远端地址，`kg` 在这种配置下仍连接 `127.0.0.1:<port>`；其它设备应使用运行 `kgosd` 主机的实际可达 IP。对于其它具体 `server.host`，本机 CLI 直接连接该 configured host。

如果目标端口已被其它进程占用，`kgosd` **启动失败并返回明确错误**；不能自动寻找下一个端口，也不能退回随机端口。这样 Web URL、CLI target 与本地工具观察到的 endpoint 始终来自确定配置，而不是进程启动时的隐式选择。

普通 API request / response 使用 HTTP + JSON；Object body 继续按 Object contract 使用 `application/yaml` 或 `application/json`；Graph streaming 使用 HTTP streaming + NDJSON。具体 HTTP method / route / metadata carrier 仍属于 HTTP adapter mapping，但不得改变 logical contract。

## Web hosting

`kgosd` 自己提供 Human-facing Web：

```text
http://<host>:<port>/          → Web UI
same origin                    → KG OS API / streaming
```

Web 构建产物随 `kgosd` 同一交付物发布，由 `kgosd` 的 HTTP server 直接提供页面和资源；执行 `kg daemon start` 后，同一个 configured origin 即可访问 Web 与 API。没有独立 Web 启动命令、第二个服务端口或单独部署步骤。

Web 与 CLI / SDK 在逻辑上都是公共 API 的客户端。服务端 TypeScript 在 Node.js 中运行；Web TypeScript 构建出的浏览器代码经 `kgosd` HTTP 下载后在浏览器执行。这里的“同进程”指页面 / 资源服务与 API 服务由同一个 daemon 承载，不是把浏览器执行并入 Node.js。

前后端代码按 workspace 模块组织，但这不产生第二个部署服务。[Phase 00 开发宿主](../development/phases/00-engineering-foundation.md#phase00-development-host)采用 Vite middleware 供开发时页面与热更新使用，复用 kgosd HTTP server 和同一端口；HMR WebSocket 与该 server 一起关闭。交付物使用构建后的静态资源，运行时不依赖 Vite dev server。具体页面框架、布局、API path、client-side routing 与 caching 仍按 Web adapter 的实际需要实现。

Phase 00 的页面 / HTTP 壳层验收只是工程验证，不修改正式 daemon 的数据库就绪条件，不新增跳过初始化或认证的公共运行模式。开发脚本不得把尚未接入 Knowledge Base 的壳层标成正式 `running`；完整启动仍须通过下文的能力检查与 bootstrap。

### Web 交互设计状态

已确认 Web 内置于 `kgosd` 的交付与运行流程，与 CLI / SDK 共用 Kernel、业务合同和实例认证；人通过 Web 查看、管理和纠正知识。具体页面布局、导航与操作交互尚未细化，需在 Web 实施阶段沿用 Ontology / Object / Graph / Evolution 的现有能力补充。此项不阻塞 Kernel、daemon、CLI 或 SDK 的实现，也不表示 Web 页面设计已经完成。

## 单 Token 实例认证

KG OS v1 对 `kgosd` HTTP surface 使用一个最小的 **single-token instance authentication**：一个 `KG_HOME` 只有一个持久 access token；持有该 token 就拥有该实例全部 API / control 能力。v1 不建立 user、password、role、scope、refresh token、OAuth、session account 或多租户授权模型。

服务端 credential 的唯一真源是 `$KG_HOME/auth.json`：

```json
{
  "token": "<opaque-secret>"
}
```

第一次 daemon startup 时，如果 `auth.json` 不存在，`kgosd` 使用 cryptographically secure random source 生成至少 256 bit entropy 的 opaque token，并原子创建该文件；后续 restart 继续读取并复用同一 token，**不会因为 restart 自动轮换 credential**。`auth.json` 已存在但无法读取、JSON/字段非法或 token 为空时启动 fail closed，不能静默覆盖为新 token。v1 不提供 token rotation API / CLI；operator 若要手工替换 credential，属于 daemon 停止后的本地 secret 管理，不是 Knowledge Base mutation。

`auth.json` 是 runtime secret，不属于 Knowledge Base State、Commit Data、配置 fingerprint 或 Evolution。POSIX 上新建文件权限必须为 `0600`；其它平台使用等价的当前用户私有访问控制。token 不得写入日志、error `message/details`、lock file、State、HTTP response body 或诊断 dump。

所有 `kgosd` **API 与 control request** 都必须携带：

```http
Authorization: Bearer <token>
```

不接受 query parameter、URL、request body 或 cookie 作为 token 的第二种 canonical carrier。缺失、空、malformed 或不匹配的 Bearer credential 都返回同一个 `AUTHENTICATION_FAILED`，HTTP adapter 使用 `401 Unauthorized`，不得通过错误差异泄露 credential validity。实现比较 token 时使用适合 secret 的 constant-time comparison。

客户端 credential 与服务端文件严格分离：

- `kg` CLI **只从非空环境变量 `KG_TOKEN` 取得 credential**，不自动读取 `auth.json`，也不提供 `--token`；
- SDK 必须由调用方显式提供 token，再统一发送 Bearer header；
- Human-facing Web 不拥有 credential-free API 旁路；浏览器端必须先取得 token，再对所有 data/control API request 发送同一 Bearer credential。exact browser credential entry/storage 属于 Web adapter 实现合同，但不得让 token 进入 URL 或 server-side session account；
- `kgosd` 自身启动、首次创建 `auth.json` 与**当前 profile 没有 active daemon 时** `kg daemon start` 的本地 process spawn 不是一个 HTTP API request，因此不要求预先存在客户端 token；一旦 active daemon 存在，任何 CLI/SDK/Web 对它的 HTTP 操作（包括 `start` 的 running/idempotent 检查以及 `status/stop/restart` 的 control 调用）都遵守上述认证合同。

默认 `127.0.0.1` 仍是安全边界的一部分。Bearer token 提供**认证**，不提供 transport confidentiality；v1 仍不内置 TLS。显式绑定 LAN address / `0.0.0.0` 时，在不可信网络上使用明文 HTTP 会暴露 bearer credential，属于 operator 明确承担的部署风险；多用户、细粒度授权、TLS 或公网安全部署必须另行设计。

## `KG_HOME` runtime profile

KG OS v1 使用环境变量 `KG_HOME` 选择唯一 runtime profile。未设置时默认使用当前 OS 用户 home 下的 `~/.kgosd`；设置时整个 daemon、CLI target discovery、credential、embedding cache、extension cache、日志与 Knowledge Base 都切换到该目录。`KG_HOME` 自身不写入 `config.toml`，因为它负责定位 `config.toml`；实现必须把 effective `KG_HOME` 解析为明确的绝对目录，不能让不同组件各自解释相对路径。

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
├── extensions/
└── logs/
```

这些条目职责固定如下。

### `config.toml`

`config.toml` 是持久的 **startup configuration**。v1 使用 server、Embedding cache policy、SQLite Extension、Full-text 与 Embedding 默认值五组配置。以下以 macOS 本地安装路径为例；路径必须替换成实际存在、包含 Managed Semantic 能力的构建：

```toml
[server]
host = "127.0.0.1"
port = 4765

[cache]
enabled = true
max_size_mb = 4096

[[sqlite.extensions]]
source = "/opt/kgos/extensions/liblithograph.dylib"
entrypoint = "sqlite3_lithograph_init"

[[sqlite.extensions]]
source = "/opt/kgos/extensions/liblithograph_openai_compatible.dylib"

# 其它 SQLite extension 仍使用同一加载机制。
[[sqlite.extensions]]
source = "/opt/kgos/extensions/sqlite-jieba.dylib"

[fulltext]
analyzer = "jieba"

[embedding]
base_url = "https://api.openai.com/v1"
model = "text-embedding-3-small"
dimensions = 1536
similarity = "cosine"
api_key_env = "OPENAI_API_KEY"
```

省略 `server.host` 等价默认 `127.0.0.1`；省略 `server.port` 等价默认 `4765`。`server.host` 必须是合法 IPv4 address string；v1 不把 hostname / DNS resolution 引入 bind contract。

### Cypher 执行连接

`kgosd` 根据调用入口选择连接：Graph `query` 使用只读连接，Graph `execute` 使用读写连接。调用方选择入口，KG OS 不解析语句推断类型；写语句进入只读入口时交给底层拒绝，不自动换成读写连接重试。两类连接都加载同一批配置的 extensions，并按请求设置执行上下文，不能把其它请求留下的 checkout 当作默认值。Graph 的语句范围见 [Graph](graph.md#graph)。

Bearer token 仍是实例的统一认证。通过认证的调用方可使用 Lithograph 支持的 Cypher；KG OS 不额外禁止 `LOAD CSV` 等文件 / 网络能力。实际文件路径位于运行 `kgosd` 的主机，访问权限由宿主进程和 Lithograph 决定；只读是数据库执行边界，不是无外部 I/O 模式。这里没有开放 raw SQL 或改变 extension 的 startup-only 加载合同。

**只读连接与自动缓存仍需底层衔接验证。** 当前核对的 Lithograph 工作树在 SQLite `main` 物理只读时跳过 persistent embedding cache publish；因此直接使用物理只读连接虽然可以查询，却不能自动保存本次新算出的向量。KG OS 的目标同时保留“查询走只读连接”和“启用缓存时自动持久保存”，具体连接 / 内部缓存写入机制由 Lithograph 解决并提供公开合同。本次不把“可写连接 + `at`”写成只读连接的等价实现，不擅自新增缓存数据库、预热命令或 KG OS 解析逻辑，也不声称该组合已经实现。验收归 [Implementation](implementation.md#managed-semantic-integration-readiness)。

### Embedding result cache

Embedding cache 交给 Lithograph 管理，KG OS 不再创建独立 `$KG_HOME/cache.db`。source 与 query text 的持久 embedding cache 都保存在 `kgos.db` 的数据库内部派生区，memory cache / TEMP HNSW 由 connection 管理；它们都不属于 State、Commit、Branch 或业务真源。KG OS 不直接读写内部 cache 表。

保留已确认的配置入口与 4 GiB 默认预算：

```toml
[cache]
enabled = true
max_size_mb = 4096
```

- 省略整段等价上述值；`enabled` 为 Boolean，`max_size_mb` 为正整数，1 MB 仍按 1 MiB 解释。
- daemon 启动、打开 / bootstrap 数据库后，以独立 maintenance execution 调用 `CALL db.index.semantic.cache.configure({enabled: $enabled, maxBytes: $maxBytes})`，参数分别来自 `enabled` 与 `max_size_mb * 1024 * 1024`，转换须检查整数溢出；不直接改内部表。
- 显式设置默认值使 KG OS 继续使用 4 GiB，而不是无意采用 Lithograph 自身的 1 GiB 默认值。配置不创建 State；`[cache]` 修改后 restart 生效。
- 预算约束的是持久 embedding payload，不是整个 `kgos.db` 文件，也不包含 HNSW / query memory / extension artifact cache。Lithograph 按 oldest-entry/FIFO 淘汰，不在 read hit 时写 LRU metadata；删除后 SQLite 页面可复用，但不保证文件立即缩小。旧独立 `cache.db` 的 LRU / 文件收缩规则随责任移交取消，不在 KG OS 补做另一套缓存实现。
- `enabled=false` 时持久 cache 不读不写，已有 entries 保留；查询仍可用 Provider + TEMP/memory 执行。KG OS 只通过公开 maintenance procedure 配置 / 清理，不能删除 `kgos.db` 来清缓存。

启用缓存时，source 与 query text 都按同一流程处理：先查缓存，miss 才调用 Embedding Provider，成功并通过结果校验后自动保存。缓存存在的目的就是减少重复 API 调用；普通查询是正常填充路径，调用方不需要预热。Provider 等待不持有 SQLite writer；持久发布使用底层短事务，不产生 Commit、不移动 Branch。既有缓存身份、FIFO、容量预算和错误处理继续遵守 Lithograph，不增加 KG OS 自有缓存层。

当前 Lithograph 的自动持久发布要求 `main` 可写；物理只读连接跳过发布的现状及 KG OS 接入缺口见上面的[执行连接](#cypher-执行连接)。不能把 memory/TEMP 命中当作跨连接或重启后持久复用的证明。

`db.index.semantic.rebuild` 保留为底层维护能力，不是正常查询、索引创建或业务写入的前置条件。KG OS 不新增预热 CLI/API、启动全库预热或后台 scheduler。调用方若明确执行维护 Cypher，使用 Graph `execute` 的读写连接，由 Lithograph 判断参数和事务合法性。

### SQLite Extension source resolver

`[[sqlite.extensions]]` 是 **kgosd 创建 SQLite connection 时必须加载的通用 SQLite loadable-extension 列表**。Lithograph 本身也通过这套配置提供，不再由 KG OS binary 内嵌、写死安装路径或另设 `[lithograph]` 特例；Jieba tokenizer、其它 tokenizer、SQL function、virtual table 或未来其它 SQLite extension 都使用同一机制。配置数组顺序就是每个 connection 的加载顺序，配置了就表示 required；v1 不增加 `kind/name/enabled/optional/capabilities` 等插件注册层。

每个 entry 的合同固定为：

- `source` **必填**，只能是本机 absolute file path 或 absolute `https://` URL；不接受 relative path、`http://`、其它 scheme、目录或自动按插件名发现/下载。KG OS 不维护插件 registry/package manager。
- `source` 可以直接指向当前平台可加载的 `.so` / `.dylib` / `.dll`，也可以指向 `.tar.gz` / `.zip` archive。archive 必须额外提供 `library`，它是解包根目录内要交给 SQLite 加载的精确 relative regular-file path；direct library 不提供 `library`。v1 不做 glob、basename 猜测或平台自动选包。
- `entrypoint` optional；省略时使用 SQLite 标准 entrypoint resolution，提供时把该非空 symbol name 交给 SQLite C API。它只选择 shared library 中的初始化入口，不声明插件类别。
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

`kgosd` 对每个新 SQLite connection 使用**同一批已解析的本地 artifacts**：仅在宿主 SQLite 驱动的 connection 初始化阶段临时允许 extension loading，按配置顺序调用驱动提供的 extension load API，随后立即关闭该能力；业务 Cypher/SQL 不获得任意 `load_extension()` 权限。任一 configured extension 在任一 connection 加载失败，该 connection 不进入可用池。

generic loader 之外仍要验证 Lithograph capability，但不要求配置 `kind = "lithograph"`。对当前实际 connection 检查 Lithograph version / initialization、Managed Semantic 与所需 SQL 函数能力；显式事务检查下面的 SQL `tx_*` 入口，不再为了该事务链路单独绑定 Native `tx_*` symbols。当前 [Graph](graph.md#graph-公共调用合同) 仍采用普通 Native execution；其 execution / streaming adapter 所需 ABI symbols 必须来自同一批 resolved libraries 中唯一匹配的 provider，且完整满足该 adapter 的调用需求；缺失、多个候选或不兼容时拒绝开放 Knowledge Base。

实际 Native 调用仍要求对应 library 已在**目标 SQLite connection** 完成 extension-load 注册，且使用该连接的同一个 `sqlite3*`；绑定不能实例化第二套私有 SQLite，也不能替代 extension-loading lifecycle。SQLite 驱动及所需 Native adapter 的 Node.js 接入属于工程选型与真实集成验证，不因 TypeScript 语言决定就宣称已经完成。Lithograph 身份与能力由公开 probe 证明，不根据配置名字、顺序或文件名猜测。

SQLite Extension 是与 `kgosd` 同权限执行的 native code。配置文件因此属于 operator trust boundary：KG OS 不 sandbox 插件，不根据 Ontology/AI 输入动态添加 extension，也不把 remote headers/token/options bag 暴露给业务调用方。修改 extension source/hash/library/entrypoint 只在下一次 daemon start/restart 生效；它本身不创建 State 或自动执行任何数据 migration。

### Lithograph 调用入口

KG OS 的多语句单-State mutation（例如 Object Patch 与 bootstrap）通过 SQLite 驱动调用 Lithograph 的 SQL 显式事务封装，全部调用使用同一个独占 checkout 的 connection：

| SQL 函数 | KG OS 使用方式 |
| --- | --- |
| `lithograph_tx_begin(options_json)` | 传入目标 Branch、expectedHead 与 metadata；底层开启其拥有的 SQLite 事务 |
| `lithograph_tx_execute(query, params_json, options_json)` | 执行 compiler 生成的 Cypher，并读取当前事务中的结果 |
| `lithograph_tx_commit()` | 底层完成图 Commit 与 SQLite 提交，返回最终 State；纯读事务不创建新 Commit |
| `lithograph_tx_abort()` | 显式取消时回滚底层事务；失败已自动 abort 时不再重复结束事务 |

这些函数只改变调用入口，Object Patch 的 strict base、no-op、单-State 与 fail-closed 规则仍由 [Object](object.md#object-公共调用合同)拥有。`tx_commit` 内部包含 SQLite 提交，KG OS 不在外面另套 `BEGIN/COMMIT`，也不把普通 SQLite 事务改成自动合并图 Commit。一次事务的 connection 不能在执行期间借给其它请求。

SQL `tx_*` 封装不等于所有 Lithograph Native 能力都已被 SQL 替代。公共 Graph 的流式执行、取消、外部 I/O 与 transaction subquery 继续遵守 [Graph 合同](graph.md#graph-公共调用合同)；不能把所有查询换成 `lithograph_rows()`，也不能把完整结果缓冲后再输出 NDJSON 当作已验证的底层流式接入。所需 SQL / Native adapter 与 Node.js 的集成必须以实际加载扩展和调用测试验收，见 [工程待办](implementation.md#typescript-运行时与数据库接入)。当前 KG OS 尚无这条调用链的实现或验收结果；底层 SQL 封装的可用版本以 Lithograph 的公开合同与交付证据为准。

### Full-text 全局配置

KG OS v1 的 Full-text 只暴露一个 daemon-global 运行时分词配置：

```toml
[fulltext]
analyzer = "jieba"
```

省略整个 `[fulltext]` 等价 `analyzer = "unicode61"`。`analyzer` 是非空、无 NUL 的**完整 FTS5 tokenizer specification STRING**，例如 `unicode61`、`porter unicode61`、`jieba`；KG OS 不解析第三方 tokenizer 的业务参数含义。它只决定 KG OS **新建或因业务定义变化重建** managed Full-text Index 时写入的 `fulltext.analyzer`，不负责根据名字寻找插件，也不覆盖已有 IndexDefinition。若 specification 需要第三方 tokenizer，对应实现必须由前述 `[[sqlite.extensions]]` 在每个 connection 上注册。

KG OS v1 不公开 per-Index analyzer、`fulltext.eventually_consistent`、tokenizer path/arguments registry 或其它 FTS5 建表 options。Ontology 只声明“哪些字段需要 Full-text”。KG OS **创建或因业务定义变化重建** Full-text IndexDefinition 时写入当前 `[fulltext].analyzer`，并保持 `fulltext.eventually_consistent = false`；已经存在且本次不需要重建的 IndexDefinition 保留自己的 versioned analyzer。KG OS 不把 analyzer 配置、fingerprint 或 generation 额外写入 Knowledge Base。

每个 SQLite connection 在配置 extension 全部加载后、进入可用池前，都必须对**当前 `[fulltext].analyzer`**做无持久副作用的 FTS5 capability probe；未知 tokenizer、参数构造失败或运行时依赖缺失都使该 connection 初始化失败。这个 probe 只验证本次 daemon 要用于新建/重建索引的 analyzer，不要求启动时枚举并验证全部历史 State 曾经使用过的 tokenizer。

打开已有 Knowledge Base 时，KG OS **不比较**当前 `[fulltext].analyzer` 与库中已有 IndexDefinition，也不迁移或批量重建历史索引。历史 Full-text query 继续使用目标 State 的 versioned IndexDefinition 实际保存的 analyzer；如果那个 tokenizer 当前没有通过 `sqlite.extensions` 注册，则只让该次 Full-text 操作返回 `FULLTEXT_ANALYZER_UNAVAILABLE`。修改 runtime analyzer 后 restart 仍照常启动，后续新建/重建 Full-text Index 使用新值。

KG OS 不承诺检测第三方 extension 在同一 analyzer name 下偷偷替换算法/词典；远程 artifact SHA-256 pin 能固定 binary bytes，但插件外部资源仍由 operator 负责版本化。这与 Lithograph 的 tokenizer 可复现性边界一致。对同一 Knowledge Base 长期保持 analyzer 语义稳定是 operator responsibility，v1 不建立配置兼容检查或迁移机制。

### Embedding 配置与索引映射

KG OS v1 继续使用 OpenAI-compatible Embeddings。`[embedding]` 是 **新建 / 因业务定义变化必须重建 Semantic Index 的默认配置**；实际 HTTP client 由独立的 `lithograph-openai-compatible` SQLite extension 提供。它与 Lithograph 通过同一 `[[sqlite.extensions]]` 列表加载到每个 connection，注册名固定为 `openai-compatible`。KG OS 不新增 provider registry、下载器或另一套 HTTP adapter。

配置字段：

| 字段 | 规则 |
| --- | --- |
| `base_url` | 必填，absolute HTTP(S) API root，无 query/fragment，去掉末尾 `/` |
| `model` | 必填非空模型 ID，不通过 List Models 猜测 |
| `dimensions` | 必填 Integer 1..4096，必须等于服务实际返回维度 |
| `similarity` | 缺省 `cosine`，允许 `cosine` / `euclidean`，映射到索引配置 |
| `api_key_env` | 可选，非空环境变量名；变量属于 kgosd 进程环境，启动时检查其值存在且非空 |

省略 `api_key_env` 表示 endpoint 无需认证。KG OS 不再接受内联 `api_key`；未知字段返回配置错误，不开放任意 headers/options bag。`[embedding]` 与本地扩展依然是 daemon 的运行前置条件；启动不发远端 health check 或 sample embedding 请求。

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
      encoding_format: 'float'
    },
    dimensions: 1536,
    similarity: 'cosine'
  }
)
```

Relationship 使用同形的 `createRelationshipIndex`。无认证时省略 `api_key_env`。`send_dimensions=false` 延续 KG OS 原来不向 endpoint 发送可选 dimensions 参数的约定；响应仍由 Provider 校验 exact dimension / finite FLOAT32。Provider 负责 batching、timeout/retry、取消与响应解码；KG OS 不复制这些实现。当前 Provider 会发送 `encoding_format: "float"`，兼容 endpoint 必须接受该请求形状，不再沿用旧文档“绝不发送 encoding_format”的 HTTP adapter 合同。

完整 provider/config/dimensions/similarity 由 Lithograph 保存到 versioned IndexDefinition。KG OS 的 Ontology body 隐藏这些运行参数，但 decoder/compiler 必须保留未改变的底层配置。**修改 `[embedding]` 后 restart 只改变之后创建 / 必须重建索引的默认值；已有索引和历史查询仍使用各自保存的配置。** 不自动重写历史，不增加 KG OS State fingerprint/generation 或配置迁移系统。索引定义固定配置不等于快照远端模型；同名 endpoint/model 或扩展外部资源的语义稳定性仍由部署者负责。

#### 凭证不落库

KG OS 只保留 `api_key_env` 认证输入，不增加内联密钥的转接层。索引只保存环境变量**名称**；Provider 在发请求时读取 kgosd 环境中的实际值，KG OS 不把解析后的 secret 写回 `providerConfig`、State、日志或错误。

环境变量名称随索引定义保存；历史索引仍引用原名称，修改当前默认名称不改写它们。普通 credential rotation 可保持同名变量并重启进程；若新 credential 会把相同 endpoint/model 路由到不同 embedding space，则必须按新的索引配置处理，不能把它当作只有认证值变化的轮换。KG OS 不增加 secret registry 或隐藏环境变量约定。Lithograph 本身仍支持直接配置 `api_key`，但该低层能力不进入 KG OS 的公共配置 profile。

实际 Semantic query/rebuild 先解析目标索引所需 Provider；Provider 未注册时，即使缓存完整也失败。扩展存在但远端服务不可用时，只在确实需要计算缺失 embedding 时影响检索；普通 graph read、纯 source 写入与没有改变 Semantic definition 的 merge 不调用服务。新增 / 改变索引的本地配置校验失败仍阻止 Schema publication。错误映射由 [公共合同](contracts.md#公共错误合同)负责。

### 配置生效时机

`kgosd` **只在进程启动时读取配置**。运行期间修改 `config.toml`：

- 不触发 file watch / hot reload；
- 不改变当前进程的 effective config；
- 不触发当前进程自动退出；
- `server.host` / `server.port`、`cache`、`sqlite.extensions`、`fulltext` 与 `embedding` 的新值只在下一次 `kgosd` 启动时生效。

因此这些配置都是 restart-read settings。`kg daemon restart` 只负责让新 startup config 被重新读取；它不比较已有 Knowledge Base 的历史配置、不触发 Full-text / Embedding 数据迁移或自动重建。普通业务命令仍不能因为磁盘上的 config 文件变化而自行 hot-reload / restart daemon。

### `extensions/`

`extensions/` 是 SQLite Extension resolver 的 content-addressed artifact cache。目录名使用实际 artifact SHA-256；remote archive 解包后的文件也只存在对应 hash root 下。这个目录不是插件 registry、安装数据库或 Knowledge Base State：删除未被运行进程使用的 cache 只会让下次启动重新从配置 source 解析，不能改变任何 Commit/Branch。运行中的 daemon 固定使用启动时已经解析的 artifacts，不因 cache/source 文件后来变化而让新 connection 漂移到另一份 native binary。

### `kgosd.lock`

`kgosd.lock` 是 **single-instance lock + active endpoint locator**，不是配置文件、PID file、credential store 或 runtime state database。每个 `KG_HOME` 同一时间最多一个 active `kgosd`。

`kgosd` 启动时 open/create 此文件并尝试获取 OS-level exclusive file lock；整个进程生命周期持续持有该 lock。另一个 `kgosd` 无法取得 lock 时必须停止启动，不能通过不同端口绕过 single-instance 约束。

取得 lock 后，新的 owner 先覆盖任何旧内容。HTTP bind 成功并且本机 control endpoint 已确定后，文件只需要保存当前 active daemon 的本机可连接 endpoint，例如：

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

如果 `$KG_HOME/kgos.db` 不存在，daemon startup 创建新的 SQLite database、初始化 Lithograph，并按 [Architecture](architecture.md#knowledge-base-bootstrap) 完成 KG OS bootstrap；如果已经存在，则按当前 public capability 与 KG OS consistency contract 打开/验证。切换 `KG_HOME` 就是切换整个 runtime profile 与 Knowledge Base，不在运行中的 daemon 内切库。

## Daemon lifecycle

`kgosd` 自身始终是 **foreground server**：直接执行 `kgosd` 时不 self-daemonize、不 fork 到后台。这样 terminal、launchd、systemd、Windows Service 或其它 supervisor 都可以直接管理同一个进程模型。

`kg` 提供四个明确的 operator command：

```text
kg daemon start
kg daemon status
kg daemon stop
kg daemon restart
```

普通 Object / Graph / Evolution 命令 **不会自动启动 daemon**。没有 active daemon 时，它们按 CLI transport-unavailable 规则失败，不产生隐藏 process side effect。

### 启动

直接 `kgosd` 与 `kg daemon start` 最终都进入同一个 daemon startup path：

```text
resolve KG_HOME (default ~/.kgosd)
→ open/create kgosd.lock
→ acquire exclusive OS lock
→ clear stale lock content
→ load $KG_HOME/config.toml once
→ load existing $KG_HOME/auth.json or securely create it once
→ validate server + cache + sqlite.extensions + fulltext + embedding config
→ resolve every SQLite extension source to immutable local artifacts
→ resolve configured host + port
→ open SQLite connection
→ load the resolved extension set in config order
→ verify Lithograph SQL transaction / Managed Semantic capabilities and Provider registration
→ bind and verify Native Graph execution capabilities on the same SQLite connection
→ validate effective Full-text analyzer on the connection
→ open / bootstrap $KG_HOME/kgos.db and Kernel
→ configure Lithograph embedding cache policy through a standalone maintenance call
→ resolve bundled Web assets
→ bind <host>:<port> for Web + API/control
→ write active local endpoint into kgosd.lock
→ serve Web shell + authenticated API/control
```

任一步失败都必须结束该次启动并释放 OS lock；不能留下一个“看起来 active”的逻辑实例。`kg daemon start` 负责把 `kgosd` 作为 detached/background child 启动并等待它达到 `running`；`kgosd` 自身仍保持 foreground process 语义。对于**原本没有 active daemon**的 bootstrap/local start，父 CLI 不读取 `auth.json`、也不能调用未认证 health endpoint；它等待 child 成功取得 lock 并在完成 config/auth/database validation、HTTP bind 后发布 endpoint，或观察 child 提前退出 / startup timeout。因为 endpoint 只在上述 startup steps 成功后发布，所以该 lock publication 是这一条本地 spawn path 的 ready signal，不构成 credential-free API/control endpoint。

`start` 是 idempotent：已有健康 `running` daemon 时返回当前实例，不再启动第二个进程。两个并发 `start` 最终也只能有一个 `kgosd` 获得 exclusive lock；另一个 caller 在观察到 winner 已经 `running` 后可以按同一成功结果返回。

### 当前实例发现与状态

业务 CLI 与 daemon operator **优先使用 active lock 中的 endpoint**，而不是重新用磁盘上的 `config.toml` 推测当前进程监听位置。这样运行中修改 host / port 后，旧 daemon 仍然可以被正常访问和停止。

状态判断遵守：

```text
kgosd.lock 未被其它进程持有              → stopped
lock 被持有，但尚未发布 endpoint           → starting
lock 被持有，endpoint 的 control status=running → running
lock 被持有，endpoint 的 control status=stopping → stopping
lock 被持有并已有 endpoint，但 control HTTP 不可用 → unavailable
```

stale `kgosd.lock` 文件因为没有 active OS lock，只能解释为 `stopped`，不能把旧 endpoint 当成正在运行的 daemon。

### 停止

`kg daemon stop` 从 active lock 取得当前 endpoint，并通过同一个 HTTP service 请求 graceful shutdown，不读取 PID、不直接 `kill` 进程。daemon shutdown path 至少保证：

```text
进入 stopping
→ 不再接受新的业务操作
→ 让已接受操作到达安全完成点；未提交 transaction 必须 rollback
→ 关闭 Lithograph / SQLite connection lifecycle
→ flush 必要日志
→ 退出进程并释放 OS lock
```

平台正常 termination signal / event（例如 Unix SIGINT / SIGTERM）也进入同一个 graceful shutdown path。`stop` 对已经 `stopped` 的状态是 idempotent success。若 lock owner 仍存在但 HTTP control channel 不可用，v1 不根据 PID 做 force kill；CLI 返回 daemon unavailable，由用户或外部 supervisor 处理异常进程。

### Restart 与配置生效

`kg daemon restart` 等价于显式的 lifecycle composition：

```text
stop current active daemon using lock endpoint
→ old process releases lock
→ start new kgosd
→ new process重新读取当前 config.toml
→ publish new active endpoint
```

如果 daemon 原本已经 stopped，`restart` 直接执行 start。因此手工修改运行中的 `config.toml` 不会让老进程漂移或退出；调用方在准备应用新 startup config 时显式执行 restart。

### OS service manager 边界

v1 不建立自己的开机启动注册、service installation 或 process supervisor。需要长期托管时，macOS launchd、Linux systemd user service、Windows Service 等只需要执行 foreground `kgosd`。`kg daemon start` 是方便用户/AI 的本地 background launcher，不替代操作系统 service manager。

exact HTTP control route、background detach 的平台实现、shutdown wait timeout 和 system-service packaging 属于工程实现合同，不改变上述 lifecycle 语义。

## 边界

- `kg`、SDK、Web 都不能直接访问 SQLite / Lithograph 来绕过 `kgosd`；
- v1 不提供随机端口 fallback；
- v1 不提供第二种 IPC transport；
- `KG_HOME` 是唯一 runtime profile selector；未设置时默认 `~/.kgosd`，一个 profile 只承载 `$KG_HOME/kgos.db` 这一个 Knowledge Base；
- `auth.json` 是该 profile 的持久 server credential；所有 daemon API/control request 使用 Bearer token，CLI 只从 `KG_TOKEN` 取得客户端 credential；
- v1 只有单 token 全权限认证，不提供 user / role / scope / OAuth / TLS；非 loopback plaintext HTTP 仍不是不可信网络安全模型；
- `kgosd` / Kernel 使用 TypeScript + Node.js；内置 Web 随 daemon 交付，与 API 共用进程、端口和 lifecycle，不单独部署 Web 服务；
- `config.toml` 不 hot reload；host / port 通过显式 restart 生效；
- `[[sqlite.extensions]]` 是唯一 SQLite loadable-extension 配置入口；Lithograph 与第三方 tokenizer/其它 SQLite extension 都走同一 resolver/load lifecycle，不由业务请求动态加载；
- remote extension 必须 SHA-256 pin，最终总是从 daemon-local immutable artifact 加载；每个 SQLite connection 都加载同一解析结果；
- `[fulltext].analyzer` 是 KG OS 创建/重建 managed Full-text Index 时使用的 daemon runtime config，缺省 `unicode61`；已有 IndexDefinition 保留其 versioned analyzer；
- `[embedding]` 是 daemon 必填的 Semantic Index 创建默认值；已有索引与历史 query 使用自身 versioned provider/config；
- `[cache]` 默认开启、默认 4 GiB，映射到 Lithograph 持久 embedding cache 的 payload 预算，不创建独立 `cache.db`；
- Full-text analyzer 与 Semantic provider/config 正常保存在各自 versioned IndexDefinition；KG OS 不保存第二份 fingerprint/generation，不在 restart 时自动迁移或批量重建；
- `kgosd.lock` 只承担 single-instance + active-endpoint 定位，不保存 PID 或业务状态；
- 业务命令不隐式启动 `kgosd`；
- `$KG_HOME` 是 daemon runtime/config/credential/cache/persistent-data home，但不是 KG OS Knowledge graph 本身的另一套存储模型；
- Knowledge Base target 仍为 `$KG_HOME/kgos.db`；其中的派生 cache 通过公开 procedure 管理，不作为第二个 Knowledge Base；v1 没有单-daemon多库 selector。
