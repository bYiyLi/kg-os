# 本地运行时

本文件是 KG OS v1 **`kgosd` 本地服务、HTTP bind、Embedding Provider startup config、daemon lifecycle、Web hosting、默认 endpoint 与 `~/.kgosd/` 本地目录布局**的设计真源。Kernel 能力由 [Object](object.md)、[Graph](graph.md) 与 [Evolution](evolution.md) 负责；CLI 命令由 [CLI](cli.md) 负责。

## 本地服务模型

KG OS v1 采用一个本地 `kgosd` daemon 作为统一运行时入口：

```text
kg CLI ───────────┐
SDK ──────────────┼── HTTP ──→ kgosd ──→ KG OS Kernel ──→ Lithograph
Browser Web ──────┘
```

`kgosd` 同时承载 API 与 Human-facing Web，因此 CLI、SDK 与 Web 使用同一个 KG OS Kernel 和同一组 Object / Graph / Evolution logical contract。v1 不为 CLI 再建立 Unix socket / Named Pipe / gRPC 私有协议，也不要求另起一个 Web server。

## HTTP bind 与默认 endpoint

v1 使用 IPv4 HTTP。默认配置只监听本机 loopback：

```text
default host = 127.0.0.1
default port = 4765
default origin = http://127.0.0.1:4765
```

`server.host` 与 `server.port` 都允许调用方在 `~/.kgosd/config.toml` 中显式覆盖。v1 `server.host` 接受 IPv4 bind address；默认值是 `127.0.0.1`。因此默认仍然只允许本机访问，但调用方可以明确配置 LAN address 或 `0.0.0.0`。`kgosd` 只绑定配置解析得到的这一组 `host:port`，不额外监听第二个地址。

`server.host = "0.0.0.0"` 表示监听所有 IPv4 interfaces。由于 wildcard bind address 不是一个适合作为 client target 的远端地址，`kg` 在这种配置下仍连接 `127.0.0.1:<port>`；其它设备应使用运行 `kgosd` 主机的实际可达 IP。对于其它具体 `server.host`，本机 CLI 直接连接该 configured host。

如果目标端口已被其它进程占用，`kgosd` **启动失败并返回明确错误**；不能自动寻找下一个端口，也不能退回随机端口。这样 Web URL、CLI target 与本地工具观察到的 endpoint 始终来自确定配置，而不是进程启动时的隐式选择。

普通 API request / response 使用 HTTP + JSON；Object body 继续按 Object contract 使用 `application/yaml` 或 `application/json`；Graph streaming 使用 HTTP streaming + NDJSON。具体 HTTP method / route / metadata carrier 仍属于 HTTP adapter mapping，但不得改变 logical contract。

## Web hosting

`kgosd` 自己提供 Human-facing Web：

```text
http://<host>:<port>/          → Web UI
same origin                    → KG OS API / streaming
```

Web 与 API 使用同一个 origin，因此 v1 不需要为了 Web 再设计独立前端 server、反向代理或跨 origin API。Web asset packaging、具体 API path、client-side routing 与 caching 属于实现 / Web adapter 合同。

## 本地模式不做认证

KG OS v1 的 daemon runtime **不定义认证或授权机制**：

- CLI / SDK 请求不携带 daemon token、Bearer token、API key 或其它本地 credential；
- Web 不需要登录 `kgosd` 才能调用本机 API；
- `kgosd` 不生成或保存 authentication token；
- 默认 `127.0.0.1` 只允许本机访问；如果调用方显式配置非 loopback `server.host`，同一个无认证 Web/API 会暴露到该 bind address 可达的网络。

因此 v1 的 configurable host 是一个明确的 operator choice，不是远程安全模型。非 loopback bind **不会自动启用认证、TLS 或权限隔离**；需要这些能力的多用户 / 不可信网络 deployment 必须另行设计。

## `~/.kgosd/` 目录

KG OS v1 在当前 OS 用户 home 下使用一个明确的 daemon home：

```text
~/.kgosd/
├── config.toml
├── kgosd.lock
├── extensions/
├── logs/
└── data/
```

这些目录职责固定如下。

### `config.toml`

`config.toml` 是持久的 **startup configuration**。v1 冻结 server、SQLite Extension、Full-text 与全局 OpenAI-compatible Embeddings 四组基础配置：

```toml
[server]
host = "127.0.0.1"
port = 4765

[[sqlite.extensions]]
source = "https://github.com/bYiyLi/Lithograph/releases/download/v0.1.1/lithograph-linux-x64.tar.gz"
sha256 = "<64-hex-sha256>"
library = "lithograph.so"
entrypoint = "sqlite3_lithograph_init"

# 其它 SQLite extension 使用同一加载机制；这里的 tokenizer 注册名由插件自身定义。
[[sqlite.extensions]]
source = "/opt/kgos/extensions/sqlite-jieba.so"

[fulltext]
analyzer = "jieba"

[embedding]
base_url = "https://api.example.com/v1"
model = "text-embedding-model"
dimensions = 1536
similarity = "cosine"
# 二选一，也可以都不配表示无认证：
# api_key_env = "EMBEDDING_KEY"
# api_key = "sk-..."
```

省略 `server.host` 等价默认 `127.0.0.1`；省略 `server.port` 等价默认 `4765`。`server.host` 必须是合法 IPv4 address string；v1 不把 hostname / DNS resolution 引入 bind contract。

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
        ~/.kgosd/extensions/<sha256>/
               ↓
        direct library or safely extracted archive
               ↓
        resolved local library path
```

archive extraction 必须 fail-closed：拒绝 absolute path、`..` traversal、symlink/hardlink、device/special entry 与越界 `library`；download / decompression / extracted-size 受实现资源上限约束。先写临时文件/目录，hash 与 extraction 全部成功后再原子发布 content-addressed cache。缓存命中时重新确认目标 artifact 与 hash 一致；缓存可删除并从 source 重建，不属于 Knowledge Base history 或 correctness source。远程 cache 已存在且有效时，daemon restart 不要求网络可用。

`kgosd` 对每个新 SQLite connection 使用**同一批已解析的本地 artifacts**：仅在 host C API 层临时允许 extension loading，按配置顺序调用 SQLite extension load API，随后立即关闭该能力；业务 Cypher/SQL 不获得任意 `load_extension()` 权限。任一 configured extension 在任一 connection 加载失败，该 connection 不进入可用池。

KG OS 还需要 Lithograph Native ABI 完成 streaming execution 与 explicit transaction，因此 generic loader 之外必须有一个**自动 capability binding** 步骤，但仍不要求配置 `kind = "lithograph"`：daemon 对同一批 resolved local shared libraries 使用平台 dynamic-loader symbol lookup，只做导出符号发现/函数指针绑定，不通过这条路径再次执行 SQLite extension init；必须恰好有一个 resolved library 暴露 KG OS 当前要求的完整 Lithograph ABI 1 symbol family（`lithograph_v1_execute/validate/tx_begin/tx_execute/tx_commit/tx_abort/free`）。零个、多个候选或只暴露部分 family 都返回 extension capability error。实际调用这些函数前，对应 library 仍必须已经通过 SQLite extension-loading path 在**目标 `sqlite3*` connection** 完成注册；Native ABI binding 不能实例化第二套 SQLite，也不能替代 `.load` 生命周期。

因此“Lithograph 是 KG OS 必需数据库能力”由公开 symbol/capability probe 证明，而不是由 extension 配置中的名字、顺序、文件名或 `kind` 猜测。缺少兼容 Lithograph capability 时 Knowledge Base 不能开放。

SQLite Extension 是与 `kgosd` 同权限执行的 native code。配置文件因此属于 operator trust boundary：KG OS 不 sandbox 插件，不根据 Ontology/AI 输入动态添加 extension，也不把 remote headers/token/options bag 暴露给业务调用方。修改 extension source/hash/library/entrypoint 只在下一次 daemon start/restart 生效；它本身不创建 State 或自动执行任何数据 migration。

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

KG OS v1 **只支持 OpenAI-compatible Embeddings API**，因此没有 `embedding.provider` 字段，也不建立 provider plugin / registry。`embedding.base_url`、`embedding.model`、`embedding.dimensions` **全部必填**：

- `base_url` 是 API root，必须是 absolute `http://` 或 `https://` URL，不允许 query / fragment；canonical form 去掉末尾 `/`。KG OS 请求 `${base_url}/embeddings`，因此 OpenAI 官方服务应配置为 `https://api.openai.com/v1`，本地兼容服务可使用例如 `http://127.0.0.1:8080/v1`；
- `model` 是非空模型 ID，原样放入 embeddings request；KG OS 不通过 List Models 猜模型；
- `dimensions` 是该 endpoint/model 实际返回的正整数向量维度。v1 **不把 `dimensions` 发送给远端**，而是用它建立内部 Vector Schema/Index 并校验每个返回 embedding 的长度，因此不要求兼容服务实现 OpenAI 可选的 dimensions request parameter；
- `similarity` 缺省为 `cosine`，v1 只允许 KG OS/Lithograph 当前共同支持的值；它影响本地 Vector Index，不发送给远端服务；
- `api_key` 与 `api_key_env` 都是 optional 且**互斥**。`api_key` 直接保存非空 secret；`api_key_env` 保存非空环境变量名称，`kgosd` 启动时解析且目标变量必须存在并为非空。两者都不配置表示该 endpoint 无需认证。二者任一解析出 credential 后，请求添加 `Authorization: Bearer <credential>`；未配置 credential 时不发送 `Authorization` header。

`api_key_env` 是减少 secret 落盘的推荐方式；`api_key` 是明确支持的便利方式。使用 inline `api_key` 时，`config.toml` 就是 secret-bearing file，调用方应把文件权限限制给当前用户；KG OS 不在日志、错误、HTTP/CLI 输出中回显 credential，也不把它写入 State / Commit Data。未知 `[embedding]` 字段直接返回配置错误，不预留任意 headers/options bag。

#### OpenAI-compatible Embeddings 子集

这里的 **OpenAI-compatible** 只冻结 KG OS 实际使用的 Embeddings 子集，不承诺兼容 OpenAI 的其它 API。当前 wire contract 以 OpenAI `POST /embeddings` 的请求/响应形状为依据：

```http
POST {base_url}/embeddings
Content-Type: application/json
Authorization: Bearer <credential>   # 仅在配置 credential 时
```

```json
{
  "model": "text-embedding-model",
  "input": "text to embed"
}
```

实现允许为了 backfill/refresh 合并多个独立文本，把 `input` 发送为 `string[]`；兼容 endpoint 因此必须接受 String 或 Array<String> 两种输入。KG OS v1 不发送 `user`、`encoding_format`、`dimensions` 或 provider-specific options；服务返回 numeric float array 即可。

响应至少必须包含可解释的 `data[]`，每个 entry 具有整数 `index` 与 numeric `embedding[]`。单输入必须能得到 index `0` 的唯一 embedding；批量输入必须对每个输入恰好有一个唯一 index，KG OS 按 `index` 而不是 response array 顺序关联输入。每个 embedding 必须只包含 finite number，且长度严格等于配置的 `dimensions`；缺项、重复/越界 index、非数值/NaN/Infinity、维度不符、非成功 HTTP status、无法解析 JSON 或 transport timeout/网络错误都属于 `EMBEDDING_PROVIDER_ERROR`。响应中的 `object`、`model`、`usage` 等其它 OpenAI 字段不是 KG OS correctness source，可以存在但不要求消费。

Embedding 配置是 **kgosd 运行前置条件**。缺少 `[embedding]`、`base_url/model/dimensions` 非法、`api_key + api_key_env` 同时出现，或 `api_key_env` 无法解析为非空 credential 时，`kgosd` 不能开放 Knowledge Base 业务能力。启动只验证配置形状与本地 credential 来源，不把一次远端 health check / sample embedding request 作为数据库可读性的前置条件。endpoint 临时故障只让本次 SemanticText resolution / managed-vector mutation 返回 `EMBEDDING_PROVIDER_ERROR`。

KG OS **不把 embedding config 或其 fingerprint/generation 写入 State、State Data 或其它 reserved metadata**。每次 SemanticText resolution、semantic Index backfill 或 managed-vector refresh 都直接使用当前进程启动时读取的 `[embedding]`。修改 `base_url/model/dimensions/similarity` 后 restart 照常打开已有 Knowledge Base：不会比较旧向量的生成配置，不会自动批量重算，也不会返回 embedding-space mismatch。

因此如果 operator 在已有 managed vectors 的库上切换到语义不兼容的 model/endpoint，旧向量与以后生成的 query/new managed vectors 可能不在同一向量空间；KG OS v1 **不检测也不修复这种配置漂移**。维度或数据库约束真正不兼容时，相关后续操作按现有 provider / Schema / type error fail closed，但 daemon 本身仍按当前合法配置正常启动。正常部署应为同一 Knowledge Base 保持稳定的 embedding semantic config。

`kgosd` **只在进程启动时读取配置**。运行期间修改 `config.toml`：

- 不触发 file watch / hot reload；
- 不改变当前进程的 effective config；
- 不触发当前进程自动退出；
- `server.host` / `server.port`、`sqlite.extensions`、`fulltext` 与 `embedding` 的新值只在下一次 `kgosd` 启动时生效。

因此这些配置都是 restart-read settings。`kg daemon restart` 只负责让新 startup config 被重新读取；它不比较已有 Knowledge Base 的历史配置、不触发 Full-text / Embedding 数据迁移或自动重建。普通业务命令仍不能因为磁盘上的 config 文件变化而自行 hot-reload / restart daemon。

### `extensions/`

`extensions/` 是 SQLite Extension resolver 的 content-addressed artifact cache。目录名使用实际 artifact SHA-256；remote archive 解包后的文件也只存在对应 hash root 下。这个目录不是插件 registry、安装数据库或 Knowledge Base State：删除未被运行进程使用的 cache 只会让下次启动重新从配置 source 解析，不能改变任何 Commit/Branch。运行中的 daemon 固定使用启动时已经解析的 artifacts，不因 cache/source 文件后来变化而让新 connection 漂移到另一份 native binary。

### `kgosd.lock`

`kgosd.lock` 是 **single-instance lock + active endpoint locator**，不是配置文件、PID file 或 runtime state database。每个 `~/.kgosd/` profile 同一时间最多一个 active `kgosd`。

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

### `data/`

`data/` 是 `kgosd` 拥有的持久 runtime data 根目录。daemon 重启不能把 `data/` 当作临时状态清理。

当前只冻结这个 ownership 与根路径；**Knowledge Base 在 `data/` 中的具体布局暂不由本决定定义**。一个 daemon 最终管理一个还是多个 Knowledge Base，以及对应的命名、选择、文件路径和 lifecycle，会直接影响 CLI / Web target 模型，需要在该主题设计时单独冻结，不能从 `data/` 目录存在推导出来。

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
resolve ~/.kgosd/
→ open/create kgosd.lock
→ acquire exclusive OS lock
→ clear stale lock content
→ load config.toml once
→ validate server + sqlite.extensions + fulltext + embedding config
→ resolve every SQLite extension source to immutable local artifacts
→ discover exactly one complete Lithograph Native ABI provider from those artifacts
→ resolve configured host + port
→ open SQLite connection
→ load the resolved extension set in config order
→ verify Lithograph public capability
→ validate effective Full-text analyzer on the connection
→ open / bootstrap active Knowledge Base and Kernel
→ bind <host>:<port>
→ write active local endpoint into kgosd.lock
→ serve Web + API
```

任一步失败都必须结束该次启动并释放 OS lock；不能留下一个“看起来 active”的逻辑实例。`kg daemon start` 负责把 `kgosd` 作为 detached/background child 启动并等待它达到 `running`；`kgosd` 自身仍保持 foreground process 语义。

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
- v1 不提供 local token / auth；显式配置非 loopback host 也不会改变这一点；
- Web 与 API 由同一 `kgosd` origin 提供；
- `config.toml` 不 hot reload；host / port 通过显式 restart 生效；
- `[[sqlite.extensions]]` 是唯一 SQLite loadable-extension 配置入口；Lithograph 与第三方 tokenizer/其它 SQLite extension 都走同一 resolver/load lifecycle，不由业务请求动态加载；
- remote extension 必须 SHA-256 pin，最终总是从 daemon-local immutable artifact 加载；每个 SQLite connection 都加载同一解析结果；
- `[fulltext].analyzer` 是 KG OS 创建/重建 managed Full-text Index 时使用的 daemon runtime config，缺省 `unicode61`；已有 IndexDefinition 保留其 versioned analyzer；
- `[embedding]` 是 daemon 必填运行配置；SemanticText 与 managed-vector create/refresh 都直接使用当前进程配置；
- Full-text / Embedding runtime config 不持久化为 Knowledge Base fingerprint/generation。修改后 restart 照常启动，不检查已有数据配置、不自动迁移或批量重建；operator 负责长期语义兼容性；
- `kgosd.lock` 只承担 single-instance + active-endpoint 定位，不保存 PID 或业务状态；
- 业务命令不隐式启动 `kgosd`；
- `~/.kgosd/` 是 daemon runtime/config/persistent-data home，但不是 KG OS Knowledge graph 本身的另一套存储模型；
- `data/` 的 Knowledge Base layout 与 target semantics 必须由后续独立设计决定。
