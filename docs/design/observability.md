# KG OS 可观测性

<!-- cspell:words mcpserver goroutines tracestate -->

本文是 KG OS **日志、关键业务事件、请求关联、运行指标及诊断存储/查询**的唯一设计真源。适用范围是单进程 Go `kgosd`、Kernel、HTTP API、Web 认证、OAuth、MCP 与 Sandbox，以及 TypeScript SDK/CLI 的必要诊断适配。历史基线见 [D97](decisions.md#d97-kgos-observability) 和已完成的 [Phase 19](../development/phases/19-observability.md)；新的目标合同由 [D126](decisions.md#d126-sqlite-observability-workbench) 决定，交付与验收归 [Phase 35](../development/phases/35-observability-workbench.md)。

**历史 Phase 19 基线**：`slog` JSON Lines、Request ID、业务事件、进程内 Metrics 和只读摘要，曾通过轮转文件或 Docker stderr 输出。**Phase 35 当前本地未提交实现**：已接入 OpenTelemetry Go Trace SDK、独立 SQLite 诊断数据、受保护 API 和 Web 排障页面，并取消常规 JSONL 双写；最终 Linux Docker/公开 CI 尚未完成验收，不能视为已发布或部署。历史 Phase 19 的实施/验收记录不随新目标追改。

## 目标与边界

可观测性回答四个问题：**发生了什么、在哪个执行阶段出错、真实业务结果是什么、进程当前的负载与错误趋势如何**。日志和指标属于 Instance 的**可丢弃诊断数据**，不是 Knowledge Graph、Ontology、Commit DAG、State Data、版本历史或不可丢失的审计账本。

- 继续使用 Go 标准库 `log/slog` 和进程内计数器；Phase 35 引入 **OpenTelemetry Go API/Trace SDK** 管理进程内 Span 生命周期、父子关系和 Context 传播，新增**一个与 `kgos.db` 完全隔离的嵌入式 SQLite 诊断数据库**。不使用 OpenTelemetry Logs/Metrics SDK 取代现有日志/指标；不部署 Collector、OTLP 接收端、Jaeger/Tempo、独立观测 Server、后台 Agent 或 Lithograph 私有接口，不让诊断数据库成为业务依赖。
- 只记录 **KG OS 基础设施操作**（Patch、Graph Execute、Evolution、认证、Tool），不理解调用方领域业务，不记录例如“订单完成”等知识语义事件。
- 不改变 Kernel 公共业务结果、Lithograph Cypher、事务边界、OAuth 权限、CLI JSON-first 输出和 MCP Tool 的成功/失败合同。日志失败不能重试写操作或改变已确认的持久化结果。
- `internal/daemon` 负责传输边界与认证类型识别；`internal/mcpserver` 负责 Tool/OAuth 语义结果；`internal/kernel` 在实际业务结果确认处产生业务事件；`internal/runtime` 负责生命周期、实例本地日志路径；Lithograph Host 只观察调用耗时与安全分类错误，不修改 Lithograph。
- Phase 35 增加普通浏览器的运行观测页面和受保护的诊断读取 API；不增加 MCP 诊断 Tool、新用户/角色系统或将 MCP OAuth Token 当成 HTTP 管理权限。普通 Web 与 ChatGPT MCP Apps 沿用各自已有的认证边界，不能因共用 UI 而绕过授权。

## 四类信号与归属

| 信号 | 责任边界 | 默认行为 |
| --- | --- | --- |
| System log | `kgosd` 生命周期、Runtime/Host 初始化、不可恢复故障、受控资源异常 | 结构化事件写诊断 SQLite；数据库不可用时关键故障限流输出 stderr |
| Access log | HTTP API、Web 认证、OAuth 和 MCP 网络/Tool 边界 | 记录入口类别、固定路由/Tool 名、结果、耗时；不记录 URL 原文或正文 |
| Business event | Kernel 所确认的关键写操作；OAuth/Web 安全动作由各自拥有者确认 | **成功、拒绝、失败、结果未知均有准确事件**；不依赖 HTTP 状态推断提交 |
| Metrics | Go 进程的聚合计数、耗时分布和资源快照 | 当前计数/快照留内存，历史时间桶与资源采样写诊断 SQLite |

HTTP 汇总排除已知的 Docker 健康探测（`GET /mcp` 返回预期 401），避免将正常 readiness 探测计为真实请求失败；未认证的业务 POST 仍计入 HTTP 非 2xx。静态资源不产生逐条 INFO 日志，但仍计入 HTTP 请求量。

一次请求允许有一条 Access log、多个不同业务操作事件及必要的异常/阶段日志；这些不是同一条事件的重复投递。读取请求通常只有访问日志；慢读取或失败可补安全诊断日志，不逐对象记录业务事件。静态 Web 资源及频繁健康检查默认不写逐请求 INFO 日志，避免流量噪声。

## 结构化日志合同

### 级别、编码及字段

- `kgosd` 继续用 `slog` 产生带安全字段的结构化事件，规范时间为 UTC RFC 3339（实际存储可用等价的精确时间戳），字段名和枚举值固定英文；Phase 35 的正式持久化目标是 SQLite 表，**不再额外生成完整 JSON Lines 文件**。下面的 JSON 对象仅示意事件的逻辑字段，不意味着新版本仍采用 JSONL 持久化。
- `KGOS_LOG_LEVEL` 可选，`DEBUG|INFO|WARN|ERROR`（大小写不敏感），默认 `INFO`；无效非空值在启动时明确拒绝；从进程环境读取，修改后需重启 daemon，**不属于初始化后不可变的 `config.toml`**。它控制可选日志详细程度，**不关闭**请求根、必要阶段、关键业务结果与指标聚合；不新增日志格式、输出目录、采样率或业务事件开关配置。
- 关键 `http.request.finished`、`mcp.tool.finished`、`business.operation.finished`、`security.authorization.decided` 和 Runtime 启停/故障事件在已启用诊断存储时**不受 INFO 过滤**；进入独立的有界优先队列，普通 INFO/DEBUG 与指标不得抢占其槽位。优先事件仍为尽力交付，队列饱和或诊断库失效时可能丢失，必须统计缺口，不能承诺审计级不丢失。
- INFO：启动/停止、完成的关键操作；WARN：安全拒绝、限流、超时、结果未知；ERROR：内部故障；DEBUG：经字段白名单筛选的执行阶段。业务参数无效等预期拒绝可以记 INFO，不把每个用户输入错误当作系统故障。
- 公共字段：`time`、`level`、`component`、`event`、`run_id`；请求内可附 `request_id`、`operation_id`；在有效 OpenTelemetry Span Context 下可附 `trace_id`、`span_id`、`parent_span_id`；操作完成可附 `duration_ms`、`outcome`、`error_code`。缺省字段省略，不填造假的值或 `null`。
- `run_id` 每次 `kgosd` 启动生成新的随机非凭证标识，仅用于跨重启分组；`request_id` 与 `operation_id` 的规则见下节。时间和 duration 使用真实测量结果，不使用 HTTP 200 推定业务成功。
- `component` 和 `event` 为固定枚举，例如 `runtime.started`、`http.request.finished`、`mcp.tool.finished`、`business.operation.finished`、`security.authorization.decided`；字段由专用 typed/allowlist 调用点提供，禁止通用 `map[string]any` 将原始请求或 `error.Error()` 自动序列化。

示例说明沿用 Phase 19 的逻辑字段，不代表真实日志、SQLite 行或最新实现：

```json
{
  "time": "2026-10-15T02:30:00Z",
  "level": "INFO",
  "component": "kernel",
  "event": "business.operation.finished",
  "run_id": "run_4de596a873c74e0ab28af6c1e8a6d459",
  "request_id": "req_5a8c96a2e31d4fc7b14a81dc906254ae",
  "operation_id": "op_7c9dd321e64f45ecb9a3038df1024bea",
  "surface": "mcp",
  "operation": "object.patch",
  "outcome": "committed",
  "target_kind": "knowledge",
  "affected_count": 3,
  "result_state": "commit/<64-hex>",
  "duration_ms": 125
}
```

### 日志内容的安全白名单

**只能输出显式准许的结构化字段**：固定操作/路由/Tool 标识、通过认证后的入口类型、HTTP 状态、公共错误 code、安全分类阶段、计数、时长、已验证的 opaque Commit ID、运行标识。`surface` 取 `api|web|mcp|internal`：Web Bearer 与 MCP OAuth 等只有在认证成功后才能可靠区分；现有 `webBearer` 中间件在验证 Web Bearer 后会把请求内部映射为 Instance Bearer，必须**在成功验证处向 Context 注入受信入口标记**，不能在下游只根据已经改写的 Authorization 再推断来源。同用 Instance Bearer 的 CLI、直接 SDK 和其它 API 调用一律记 `api`，不能从 User-Agent 或自报 Header 猜成某个人或 CLI。

HTTP 访问事件中的 `operation` 是**已注册静态 API/OAuth 路由的固定标识**，非精确匹配的请求只记 `api.unmapped` 等类别，不记录原始 URL。HTTP 外层必须读取认证完成后通过可信 Request Context 传播的 `surface`；持久请求根的最终来源由完成事件更新，不能永久使用认证前的初值。一个 MCP HTTP 请求包含多个 Tool 时，请求根摘要可保留首个失败 Tool/错误码，其他 Tool 的真实结果分别从关联日志/Span 核对，不让后续成功调用覆盖失败归因。

已注册 OAuth 动态客户端注册入口 `/oauth/register` 也必须归类为 `oauth`，而非静态资源。Setup 的 `status`、`rotate-token`、`initialize`、`validate-embedding` 各有固定操作标识，初始化故障不能全部混成 `api.unmapped`。普通 JSON API（包括进入 Kernel 之前发生的解析、校验及认证失败）在**服务端公共错误编码位置**向现有 HTTP 响应包装器传递固定 `error_code`，使请求终态与日志能按 Request ID 关联错误类别；只传已筛选的公共 Code，不检查响应正文、不增加返回 Header 或改变错误格式。没有可信公共错误时省略该字段，不能由 HTTP 状态猜测。

不得记录 Authorization、Cookie、Session、Instance/OAuth Token、Code、PKCE、`state`、Credential/API Key、请求与响应正文、Cypher、Patch、JavaScript、Ontology/Knowledge Value、原始 URL/Query、任意 Header、本机绝对路径、原始用户名/客户端自报身份，或可能含有这些内容的未筛选错误文本、堆栈与数据库异常。Branch/Tag/Definition/Object 名称和用户提供的 Author/Message 也是可能敏感的业务数据，默认不入日志；需要定位时使用记录的已确认 Commit/State 关联已有版本查询。DEBUG 也不放宽此白名单；错误根因只记录固定的 `stage`、`cause_class` 与公共 `error_code`，不能直接输出未清洗的底层 `err.Error()`。

认证失败、未授权的 OAuth 请求不能暴露可判定凭证有效性的差异；记录固定的 `auth_kind`、`decision` 和低基数拒绝类别，不记录用户提交的 Client ID、回调、来源 IP 或凭证摘要。SQLite 及应急 stderr 只能承载白名单字段；Web 仅可经受保护 API 读取经过再次约束的诊断投影，不是原始日志下载入口。

## 请求关联与真实结果

1. `kgosd` 在 HTTP 入口为每个请求**自行生成**足够随机的 `request_id`（至少 128 bit entropy），写入 Context、日志与响应 Header `X-KGOS-Request-ID`；不把客户端提交的同名 Header 作为权威 ID。发生认证拒绝或普通业务错误也返回此 Header；Graph streaming 的 Header 必须在首字节前可见。路径/Method 查询仍使用现有路由合同。
2. HTTP → MCP handler/Tool → Sandbox Bridge → Kernel → Lithograph Host 的 Context 继承同一可信 Request ID 和当前 OpenTelemetry Span Context。一次 `kgos_run` 可以执行多个 Kernel 写操作；每次独立操作在**开始时**生成 KG OS 的 `operation_id`，执行阶段的 `trace_id`、`span_id` 与父级 `parent_span_id` 则由 OpenTelemetry SDK 的 SpanContext/父子关系确定，**不另实现一套自有 Span ID 生成器/树生命周期**。无 HTTP Context 的内部调用可以有独立操作标识，不虚构入口来源。Phase 19 的完成时生成 Operation ID 是待 Phase 35 修正的实现基线。
3. Access log 保留**实际 HTTP transport**状态、固定 route、duration；请求结果另按可信终态表达。普通 JSON 错误记录实际公共 `error_code`，MCP Tool 另以**真实 Tool result**记录成功/错误。MCP HTTP 200 内可能是 Tool error，Graph NDJSON HTTP 200 内可能是 terminal `error` event：终止错误要携带安全的公共 `error_code`，并将请求结果记为 `error`，但**不得篡改实际 HTTP 200**。Graph streaming 的 `summary` 与消费取消/断连分别记录，`rows` 已发送不代表操作整体成功。
4. 公共 HTTP JSON 错误结构及现有 Graph NDJSON `columns/row/summary/error` 不改变。TypeScript SDK 的 Daemon/Transport Error 可附只读可选 `requestId`，便于 Web/CLI 调用方复制诊断编号；CLI 的成功 stdout、失败 stderr JSON envelope 与 exit code 保持现有合同，不混入日志或 ANSI 文本。OAuth/MCP 返回结构不为日志而增加业务字段。
5. 状态码、Tool 错误、Kernel 返回值来自各自**真实结果来源**；HTTP Middleware 不读取/缓存响应 body，不推断写入、不破坏 `http.Flusher`、流式背压、取消、响应接口或低层错误处理。

## 关键业务事件

事件由**真正确认业务操作结果的那一层**发出，不在 HTTP、SDK、MCP Adapter 各复制一份。所有关键写操作无论成功与否至少产生一条 `business.operation.finished` 结果事件；同一次写入通过不同入口调用时只有一份 Kernel 业务结果事件。调用方可选择 Context 关联，但不能改变业务结果。

| 操作 `operation` | 记录的真实业务结果与边界 |
| --- | --- |
| `ontology.patch`、`object.patch` | 以共享 Patch 提交/严格校验结果为准；支持 mixed Ontology + Knowledge，避免两个入口重复记录；记录经确定的目标种类、变更对象数量、base/result Commit（存在时）；no-op 不得记 `committed` |
| `graph.execute` | 非流式、流式 Execute 的底层完成/提交状态、可确认的 State 与 counters；原样 Cypher 可以只读、DDL 或写入，**不能只凭执行入口推断发生了 Mutation**，不能解析或记录 Cypher |
| `evolution.state.create`、`evolution.state.set_data`、`evolution.state.clear_data` | 已确认的 State/metadata 操作结果；State Data 不等于版本化业务图写入 |
| `evolution.branch.create/delete`、`evolution.tag.create/move/delete` | 已确认的引用变化结果；记录资源类型和相关 Commit，不记录用户自定义名称 |
| `evolution.merge.start/resolve/finalize/abort` | Session 状态操作分别确认；`finalize` 成功才可以声明对应 Commit/Branch 结果已提交；`abort` 只代表 Session 取消，不代表撤销此前已提交的其它操作 |
| `web.auth.login/logout`、`oauth.authorization.approve/deny`、`oauth.token.exchange` | 作为独立 `security.*` 事件，由认证/OAuth owner 在真正接受/拒绝时发出；不声称新的用户身份或改变授权历史 |

统一 `outcome`：

- `committed`：已确认持久写入成功；只能在底层明确确认之后记录，包含实际 Commit/版本结果（若该操作产生 Commit）。
- `applied`：已确认生效但不是“新增已持久 Commit”的操作（如 Session 冲突解决或某些引用/安全状态变化）；不得冒充图 Commit。
- `no_change`：成功但未产生变更（例如 Patch no-op）；不能计为修改成功的提交。
- `rejected`：在任何可能产生副作用前已明确拒绝，例如参数校验/权限拒绝/严格 base 不匹配。
- `failed`：已经有足够证据确认该操作失败**且没有留下相关持久副作用**；不得仅根据超时、客户端断线或上层 Tool 错误得出该结论。
- `unknown`：请求中断、取消、超时或失败发生于可产生副作用之后且结果尚未确认；只能通过之后读取 Branch Head、State/History、Merge Session 等已有事实核对，不自动重试或发起补偿。

`kgos_run` 的**每次底层写操作**独立形成业务事件；整个 Tool 最终失败不覆盖先前已确认成功的事件，Tool 本身只记录一次调用结果。Graph Execute 的 partial stream、通信异常、结果尚未确认时使用 `unknown`，不得根据 HTTP 200、已输出 row 或脚本 Promise 的最终状态推导 `committed`；写操作的无副作用结论也必须有底层证据。错误代码来自既有 [公共错误合同](contracts.md#公共错误合同)，不创建第二套 KG OS 业务错误语义。

这些是**尽力交付的诊断事件，不是 exactly-once、事务性 outbox 或审计保证**。日志写入失败不得回滚已提交的事务、掩盖原业务响应、阻断 daemon 的正常服务，也不得重放写入补日志；缺失事件不能据此证明没有发生操作。

### MCP 健壮性与 OAuth 恢复事件

MCP Tool 的 code=ok 才是业务成功，isError=false 或 HTTP 200 不能替代此判断。统一入口对成功、参数拒绝、内部异常、panic、超时各记录一次真实终态并释放 in-flight；此前已确认的 Kernel 写入事件不受后续脚本错误覆盖。OAuth 刷新、幂等重试、重放拒绝和撤销只记录现有 Request ID、固定 operation/outcome/error_code 或静态 cause_class；不记录 Token、Code、assertion、客户端任意文本或原始 panic/堆栈。认证后端暂时不可用记作服务故障，不能伪装凭证无效或永久撤销；失败日志不改变事务结果，也不触发写入重放。

## 输出、保留与应急通道（Phase 35 目标）

| 运行方式 | 正式结构化持久化 | 独立应急出口 |
| --- | --- | --- |
| Docker `kgosd` | `<workspace>/.kgos/logs/observability.sqlite` | 仅启动、诊断库故障与其他关键应急信息写 stderr；`docker logs` 不再承诺包含完整请求日志 |
| 手动前台 `kgosd` | 同一 Instance 私有 SQLite | 启动失败与诊断库不可用的安全摘要写 stderr；原有启动地址 stdout 合同不变 |
| 内部 CLI 自动启动 | 同一 Instance 私有 SQLite | 现有 `kgosd.startup.log` 仅用于早期启动诊断/启动地址交接，保持有限体积，不再长期保存完整业务日志 |

`logs/` 目录模式 `0700`；SQLite 主文件及其 `-wal`、`-shm` 由 KG OS 管理为私有诊断文件，拒绝符号链接和目录越界目标，不能因升级降低既有文件安全边界。诊断库不属于 Knowledge Base、State、事务、OAuth/Web Session 或正式备份，损坏时只能在诊断边界**保留/隔离受损文件再有界重建**，失败则降级为仅当前进程摘要；不能删除、替换或回滚 `kgos.db`。

新实现不再写入 `kgosd.log` / `kgosd.log.N`，也不同时输出一份完整 JSONL 到 stderr；旧版留下的日志文件仍是历史文件，**不自动删除、导入、再索引或视为新观测库的历史覆盖**。现有 Phase 19 的 10 MiB × 5 轮转规则只描述旧实现。容器日志由宿主负责应急输出的留存；容器内部无需为常规诊断重复落盘。

诊断库初始化、写批或启动/退出失败的 stderr 只报告固定 `stage` 和 `cause_class`（如 `permission`、`busy`、`disk_full`、`corrupt`、`deadline_exceeded`），不拼接原始 SQLite/OS 错误文本。观测 API 正常轮询不写普通访问日志或请求树；只有自身服务端读取失败时才产生一次安全的 `observability.query.failed` 事件（含 Request ID 与固定操作/类别），不会递归读取失败数据库；此事件若因存储不可用而丢失，只能依赖有界 stderr 应急信息。

默认展示最近 24 小时，诊断数据库按**时间与容量双重限制**保留，容量工程初值为 64 MiB，需覆盖主库、WAL 及管理开销的监测与清理；不能把主文件大小单独当成物理上限。按批删除过期记录、控制写事务及读快照寿命、按需 checkpoint/回收空间。空间不足时主动停止接受可丢弃事件并暴露丢失/截断状态，不因维护而阻塞业务；实际覆盖不足 24 小时必须如实返回起止时间。

SQLite 开启 WAL，使用**有界队列、单写入执行者、小事务批量写入和受限读取连接**，复用现有 Go SQLite 驱动；关键调用方不等待日志事务完成。正常停止时可在固定期限内冲刷队列、关闭连接，不能无限等待；磁盘满、锁冲突、权限、损坏或队列溢出时限流向 stderr 输出白名单故障摘要，记录已丢弃诊断事件的计数/可见状态；不递归经失效 SQLite 写故障日志，不重复提交业务写操作，也不保证进程被 SIGKILL 时尚在队列内的事件能恢复。诊断数据是尽力保存的观察记录，不是 exactly-once 审计账本。

## 内置运行指标与只读诊断

- 指标由进程内固定集合维护：自启动运行秒数、当前 HTTP/MCP 并发数、HTTP 请求总量与非 2xx 总量、HTTP 耗时桶、MCP Tool 调用/业务失败/超时次数、Kernel 关键操作次数与结果类别、Sandbox 资源预算触发次数、Go heap alloc bytes 和 Goroutine 数。指标随进程重启清零，**不承诺跨重启保留或等于历史审计记录**。
- 只使用固定的操作类别、路由模板、Tool 名和结果枚举作为聚合维度；**不使用** Request ID、Branch/Object Ref、User-Agent、URL、IP、Token、用户文本等高基数字段。耗时从真实执行段测量，长流持续时间包括完整生命周期；不得凭 Response Status 计算 MCP Tool 的逻辑失败率。
- 在现有统一监听器上新增 **`POST /api/v1/system/diagnostics`**（请求体为 `{}`）的只读 JSON 摘要。沿用现有 API Instance Bearer 或有效的 Web Access Bearer/Boot Guard；OAuth Access Token 只允许访问 MCP，不能通过该路由绕开认证。无开放 CORS、无第二个监听器、无独立服务或额外用户权限体系。
- 返回自启动以来的汇总及当前快照，结构至少包含 `uptime_seconds`、`process.heap_alloc_bytes`、`process.goroutines`、`http.requests_total`、`http.non_2xx_total`、`http.in_flight`、`http.latency_ms_buckets`、`mcp.tool_calls_total/tool_errors_total/tool_timeouts_total`、`business.operations_total/outcomes`。耗时桶为固定边界、累计计数（例如 `<=50`、`<=250`、`<=1000`、`>1000` 毫秒），实际 wire 编码由 Phase 19 依据这些语义确定并测试，不借此新增业务 API/历史查询。
- **现有** `POST /api/v1/system/diagnostics` 仍只返回进程摘要，不能借此查询、下载或筛选日志，不改变原响应和认证语义；它不是 Health/Ready 判据，也不根据进程内计数推断 Lithograph 数据完全健康。Phase 35 的结构化诊断查询走**新增的受保护只读 API**，不能把新 API 等同于原始日志访问。

## 运行观测数据与查询（D126，Phase 35 目标）

### 数据来源、关联身份与 SQLite 结构

一个 `kgosd` 进程拥有本 Instance 的单一诊断库。事件在 HTTP/MCP/Sandbox/Kernel/Lithograph Host 的**真实执行点**产生，经字段白名单筛选后投递至受控写入队列；不反向解析任意 Cypher、脚本、业务响应或底层 SQLite 私有表。当前进程计数仍是内存快照，**跨重启的历史数据由已提交的诊断库行提供**，两者不能混称为同一个计数来源。

| 诊断集合 | 真实采集来源与核心字段 | 主要读取用途 |
| --- | --- | --- |
| `requests` | HTTP 入口和可信 Tool 终态；`run_id`、`request_id`、固定入口/Tool、开始/结束时刻、耗时、实际状态/公共错误分类 | 最近请求列表、筛选、慢请求；同一 HTTP/MCP 传输请求不重复算作两次业务调用 |
| `spans` | OpenTelemetry Go Trace SDK 生成的有界阶段记录；`trace_id`、`span_id`、`parent_span_id`，及可信关联的 `request_id`、`operation_id`、阶段枚举、起止和结果 | 在最近请求内按 SDK 的真实父子关系构造树；可有嵌套或并发子阶段 |
| `log_events` | 现有 `slog` 的安全事件；时间、级别、组件、事件枚举、关联的 `request_id` / `operation_id` / 有效 `trace_id` / `span_id`，以及受控 outcome / error_code / duration | 右侧按请求、Operation 或 Span 精确筛选执行日志 |
| `metric_buckets` | 现有 HTTP/MCP/业务计数器，Go Runtime、可用的 Linux 进程/cgroup 资源接口；时间桶及真实样本覆盖 | 请求量/成功/错误/慢请求曲线、CPU/内存/GC 与资源压力趋势 |
| `system_events` | Runtime 启停、已确认的资源警告与恢复证据；`run_id`、时间、固定事件/原因和证据级别 | 系统事件轴、可确认的重启/中断和 OOM 证据 |

以上是最小**逻辑集合**，主键、索引和物理 SQL Schema 是 Phase 35 的工程编码，不改变既有公共 Knowledge 或业务模型。请求 ID 在同一诊断库内需能和运行身份可靠关联；内部调用没有 HTTP 请求时不虚构 Request ID，可以有无根请求的安全系统事件。为高频查询建立必要的时间、`request_id`、`span_id`、`parent_span_id` 索引；不为原始用户文本建立 Full-text/Vector 索引。SQLite `schema_version` 只用于诊断库自己的格式迁移，不能引入 Lithograph Schema 或 KG OS Evolution。

### OpenTelemetry Go Trace 与本地 SQLite 接入

- **Trace 所有权**：`internal/observability` 初始化并持有本进程的 OpenTelemetry `TracerProvider` / `Tracer`；由 HTTP 入口创建本地根 Span，MCP/Tool、Sandbox、Kernel 与 Lithograph Host 在现有 Go `context.Context` 内手动创建有界、真实的子 Span，包含并发子调用。复用 OTel API/SDK 自身的 `trace_id` / `span_id` 和父级关系，不引入第二套自行维护的 Trace 树或通用埋点框架，不要求 SDK 自动拦截请求正文。每个业务请求保留原服务端生成的 `request_id`，每个独立 Kernel 操作保留 `operation_id`；二者是独立于 OTel ID 的可信诊断关联键，不替换现有 HTTP Header、MCP 业务合同或业务结果语义。
- **可信传播与日志关联**：内部传播只使用服务端创建/继承的 Go Context，不接受未经认证的客户端 `traceparent`、`tracestate` 或自报 Span ID 来决定本 Instance 的权威父子关系。`slog` 在真实 Span Context 可用时提取 `trace_id`、`span_id`，与原 `request_id` / `operation_id` 一起关联；没有 Span 的启动/内部事件不虚构 Trace ID，无法精确定位的日志只能归属已知上层。Span 名与属性只记录固定操作/阶段枚举、可靠结果、时长及安全错误类别；不自动输出 OTel Resource 的任意属性、事件、Links 或未筛选 `error.Error()`。
- **写入适配**：用受限的自定义 `SpanExporter` 将 SDK 已结束的 Span 投影成安全字段，交给 Phase 35 **已有的单写入 SQLite 管道**；`slog` 安全记录、指标桶及系统事件走同一个受控诊断存储，不另建 OTel 日志数据库/Exporter 或重复保存完整日志。生产使用有界 `BatchSpanProcessor`，其队列/批量/超时与 SQLite 写入队列**分别计入总内存和丢失预算**；不启用可能阻塞业务的 `WithBlocking`，不使用同步 `SimpleSpanProcessor` 将 SQLite I/O 放在请求路径。Exporter 遵守调用的 Context 超时/取消，数据库故障不递归产生新 Span 或业务失败。
- **开始与异常终止**：`BatchSpanProcessor` 主要导出**已经结束**的 Span，单靠它无法恢复 SIGKILL/OOM 前尚未结束的阶段；可用一个极轻量 `SpanProcessor.OnStart` 将必要根/关键阶段开始事实**非阻塞地投递到同一有界诊断写入管道**，`OnEnd` 的完成态仍由批量导出处理。开始事件和结束事件都属于尽力持久化，排队尚未写入时仍会丢失；恢复时缺少真实结束记录，只能标记 `incomplete/unknown`，不能据此断言业务失败或 OOM。正常关闭按已有固定期限有序 `ForceFlush` / `Shutdown`，先处理 SDK 的已结束 Span，再关闭诊断写入器。
- **采样与资源**：默认对被纳入最近业务请求的**有限入口和固定阶段**保持记录，不使用可能在完成前丢掉慢请求/错误链路的概率头部采样；健康探测、静态资源、观测页轮询在创建 Trace 前排除，且不为每个查询 row、对象或高频循环创建 Span。`KGOS_LOG_LEVEL=DEBUG` 只控制日志详细度，不决定必要 Trace 的存在。Span 数量、属性/事件大小、批量队列、磁盘空间和查询并发全部有界；压力下允许诊断数据丢失并反馈覆盖缺口，不能因记录 Span 增加业务重试或阻塞 Kernel。阶段总耗时可能包含子阶段，聚合时不重复相加。

OpenTelemetry 只提供 Trace 生命周期和上下文标准，**不会自动完成本产品的 SQLite 表、`slog` 关联、业务真相或 Web 查询**。官方接口依据：[Go 手动插桩](https://opentelemetry.io/docs/languages/go/instrumentation/) 与 [Go `sdk/trace`](https://pkg.go.dev/go.opentelemetry.io/otel/sdk/trace)（2026-11-07 核对）。开发时选取与当前 `go.mod` 兼容的稳定版本并锁定依赖，不从示例版本号推断仓库已安装 SDK。

正常结束由真正完成的 owner 写终态；OOM、SIGKILL、超时或取消若发生在无法确认结果的阶段，保留**未完成/结果未知**，不能在恢复时伪造完成时间、`failed` 或 `committed`。父阶段总耗时可能包含子阶段，聚合时不得重复相加。每个请求根、Operation 和 Span 都可能只有部分日志；未携带 Span ID 的日志最多匹配到已知 Request/Operation 层级，**不能凭时间接近就自动归入某个子阶段**。

### 资源、趋势与系统事件口径

- 当前快照继续使用 `runtime.MemStats` / `runtime/metrics` 等 Go 能力；CPU/RSS、容器限制与用量只读取当前运行环境明确提供的 Linux 进程/cgroup 指标，分别标记 Go heap、进程 RSS 和容器 memory，不混为同一个“内存”。GC/资源采样使用有界固定频率并写入历史时间桶；缺失来源以 `unavailable` 表示，不补造数据。
- 页面显示的版本必须来自**当前正在运行的 `kgosd` 构建信息**而不是仓库 Tag 或上一次发布结果；运行中/ready 与诊断可用性分别判断，单次指标响应不能证明整个 Lithograph/Provider 健康。
- 历史趋势按真实事件/采样生成固定时间桶，记录窗口、覆盖范围、样本数量及诊断丢失情况。请求成功、错误、未知/中断分别表达；慢请求指**确实完成且耗时超过 2 秒**的请求，可与成功或错误重合，不能与它们简单相加。MCP 的业务成功以 Tool code/result 为准，不把 HTTP 200 视为成功；业务调用统计与原 HTTP transport Metrics 保持独立口径。
- 健康探测、静态资产和诊断工作台自身的轮询不进入**面向使用者的请求趋势和最近业务请求**，避免页面自动刷新制造假流量；现有 `/system/diagnostics` 的 HTTP transport 累计规则不因新图表改变。没有足够覆盖时，UI 明示缺口，不插值为零。
- `runtime.starting`、`runtime.stopped`、已确认的压力事件组成系统时间线。上一 `run_id` 缺少正常停止记录只能说明**可能异常中断**，并非 OOM 证据；退出码 137 单独也不能证明 OOM。只有可靠宿主/容器 OOM 事件且能对应时间、容器与运行实例时才标 `oom_confirmed`。不授予 `kgosd` Docker Socket 或特权宿主访问；Phase 35 **不承诺新增宿主事件采集器**，没有可信证据时 OOM 数量显示不可用/未知，异常重启单独显示，不为了凑出 OOM 数字推断根因。

### 只读接口与安全边界

在现有统一 HTTP listener 上，Phase 35 增加四个需要有效 Instance Bearer 或 Web Access Bearer + Boot Guard 的操作；不增加独立端口、公开 CORS、管理用户系统或 MCP Tool：

| POST 路径 | 入参/结果合同 |
| --- | --- |
| `/api/v1/system/observability/overview` | 有界时间范围 → 系统当前状态、指标时间桶、系统事件、来源与实际覆盖窗口、存储降级/丢失状态 |
| `/api/v1/system/observability/requests/list` | 时间窗口、受控入口/状态/慢请求筛选、cursor 和 limit → 有界请求根摘要分页及覆盖/截断信息 |
| `/api/v1/system/observability/requests/get` | 可信 `request_id`、所选 `operation_id` / `span_id`（可选）及日志 cursor/limit → 请求树与所选范围内的日志分页；只能通过已有真实关联筛选 |
| `/api/v1/system/observability/logs/list` | 时间窗口、可选级别、cursor/limit → 当前 Instance 跨请求的真实结构化日志有界分页，每条记录保留可信 `request_id`；不进行客户端逐请求 N+1 聚合，也不提供原始日志下载或任意字段全文检索 |

所有时间范围、枚举、ID、cursor、页大小及响应体均必须校验和限制；数据库执行使用参数化 SQL、必要索引与查询截止/取消，不允许任意 SQL、模糊的全文文件搜索、原始日志下载、跨 Instance 路径访问或暴露敏感字段。结果中必须区分 `available` / `unavailable`、实际覆盖起止、`truncated`、`dropped` 与权限/实例错误，历史数据缺失不能伪装成“0 请求”。`request_id` 本身不是授权令牌，不能用于绕过原有认证。

**诊断读并发与恢复**：SQLite 仍通过有界连接池（现行 3 个连接）、WAL、单次查询 2–3 秒 Context 截止和分页限制控制成本；**不额外设置「最多 2 个同时读取、第三个立即拒绝」的独立槽位**。常规多路诊断请求在连接池中有界等待，直到取得连接或请求取消/超时；连接等待、SQLite 错误与诊断库不可用不能误报为成功的空结果，诊断负载也不能拖住业务数据库事务。

SDK 新增对应只读 HTTP 类型/方法，由普通浏览器 Web 复用现有 Client、Session 和 Boot Guard。ChatGPT MCP Apps 不借 OAuth Token 直接调用这些 HTTP 管理路由；若没有相应**已设计并授权的**宿主桥接，运行观测只在普通浏览器出现。原 `POST /api/v1/system/diagnostics` 响应保持兼容。

### 故障恢复、迁移与性能边界

诊断库故障时，原内存诊断摘要仍可在条件允许时返回；历史查询报告 unavailable，应急安全 stderr **限流**且不递归依赖诊断库。持久化队列有容量/字节上限和明确的丢弃次序，允许记录流失但不得让 Queue、SQLite 的锁或 checkpoint 阻塞 Kernel 的业务事务。重启仅恢复 SQLite 已提交的诊断信息；不合成在宕机期间不存在的日志，也不把“没有日志”解释为“没有业务写入”。

升级从旧 JSONL 输出切换到 SQLite 后，不自动导入或删除 `kgosd.log*`；既有 Phase 19 日志轮转和 Docker 全量 stderr 输出保持**历史证据**而非 Phase 35 当前目标。日志目录被复制、诊断库缺失或损坏均不得改变业务 `kgos.db` 的打开/初始化/Recovery 结果。Phase 35 应先在 1 GiB Linux amd64 Docker 中对比启用前后的峰值 RSS、CPU、请求 P95、数据库/WAL 实际空间、重启/磁盘满场景；不以尚未实测的性能数值宣称达标。

## 与现有合同的关系

- [Runtime](runtime.md#logs)：原有 `.kgos/logs/` 路径与 lifecycle 保留；诊断数据不成为 Knowledge Base history。
- [CLI](cli.md#json-first-stdout)：成功 stdout 和失败 stderr JSON 仍用于机器消费；后台 daemon 日志不写入业务 stdout/stderr，启动输出约定在 daemon 自身保持。
- [MCP](mcp.md)：Tool 返回、JavaScript sandbox 结果/预算、OAuth 凭证、超时及已写入不可自动回滚语义保持原样。
- [Graph](graph.md)、[Evolution](evolution.md) 与 [Object](object.md)：业务事件只忠实记录这些 owner 已定义的结果，不构造独立事务或 versioning。
- [Web](web.md)：现有登录与连接授权入口不重做；只消费未来 SDK 可选的 Request ID 和受保护诊断摘要。
