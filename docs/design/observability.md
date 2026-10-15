# KG OS 可观测性

<!-- cspell:words mcpserver goroutines -->

本文是 KG OS **日志、关键业务事件、请求关联和运行指标**的唯一设计真源。适用范围是当前单进程 Go `kgosd`、Kernel、HTTP API、Web 认证、OAuth、MCP 与 Sandbox，以及 TypeScript SDK/CLI 的必要诊断适配。实现与验收见 [Phase 19](../development/phases/19-observability.md)；[D97](decisions.md#d97-kgos-observability) 记录架构取舍。

本合同已由 [Phase 19](../development/phases/19-observability.md) 实现并完成验收：`internal/observability` 为单进程 `kgosd` 提供结构化日志、业务事件、Request ID、指标与只读诊断 API；本地 CLI 由 daemon 自管 `.kgos/logs/kgosd.log` 轮转，`kgosd.startup.log` 保存启动地址输出/早期诊断，容器继续使用标准日志流。具体实现、Mac/Dev 及 GitHub CI 成功证据归 Phase 19 开发记录维护。

## 目标与边界

可观测性回答四个问题：**发生了什么、在哪个执行阶段出错、真实业务结果是什么、进程当前的负载与错误趋势如何**。日志和指标属于 Instance 的**可丢弃诊断数据**，不是 Knowledge Graph、Ontology、Commit DAG、State Data、版本历史或不可丢失的审计账本。

- 使用 Go 标准库 `log/slog` 和进程内计数器，不新增观测 Server、外部采集依赖、独立数据库、后台 Agent、分布式追踪系统或 Lithograph 私有接口。
- 只记录 **KG OS 基础设施操作**（Patch、Graph Execute、Evolution、认证、Tool），不理解调用方领域业务，不记录例如“订单完成”等知识语义事件。
- 不改变 Kernel 公共业务结果、Lithograph Cypher、事务边界、OAuth 权限、CLI JSON-first 输出和 MCP Tool 的成功/失败合同。日志失败不能重试写操作或改变已确认的持久化结果。
- `internal/daemon` 负责传输边界与认证类型识别；`internal/mcpserver` 负责 Tool/OAuth 语义结果；`internal/kernel` 在实际业务结果确认处产生业务事件；`internal/runtime` 负责生命周期、实例本地日志路径；Lithograph Host 只观察调用耗时与安全分类错误，不修改 Lithograph。
- 普通浏览器和 ChatGPT 内嵌 Web 共用已有客户端。Phase 19 不做 Web 监控大屏、通用日志查询 UI、MCP 诊断 Tool 或新的用户/角色系统。

## 四类信号与归属

| 信号 | 责任边界 | 默认行为 |
| --- | --- | --- |
| System log | `kgosd` 生命周期、Runtime/Host 初始化、不可恢复故障、受控资源异常 | 事件化 JSON；INFO、WARN、ERROR，DEBUG 可开启 |
| Access log | HTTP API、Web 认证、OAuth 和 MCP 网络/Tool 边界 | 记录入口类别、固定路由/Tool 名、结果、耗时；不记录 URL 原文或正文 |
| Business event | Kernel 所确认的关键写操作；OAuth/Web 安全动作由各自拥有者确认 | **成功、拒绝、失败、结果未知均有准确事件**；不依赖 HTTP 状态推断提交 |
| Metrics | Go 进程的聚合计数、耗时分布和资源快照 | 有界、进程内、重启清零；受保护的只读摘要 |

HTTP 汇总排除已知的 Docker 健康探测（`GET /mcp` 返回预期 401），避免将正常 readiness 探测计为真实请求失败；未认证的业务 POST 仍计入 HTTP 非 2xx。静态资源不产生逐条 INFO 日志，但仍计入 HTTP 请求量。

一次请求允许有一条 Access log、多个不同业务操作事件及必要的异常/阶段日志；这些不是同一条事件的重复投递。读取请求通常只有访问日志；慢读取或失败可补安全诊断日志，不逐对象记录业务事件。静态 Web 资源及频繁健康检查默认不写逐请求 INFO 日志，避免流量噪声。

## 结构化日志合同

### 级别、编码及字段

- `kgosd` 统一使用每行一个 UTF-8 JSON 对象（JSON Lines），时间为 UTC RFC 3339，字段名称和枚举值固定英文；人类可读文案不作为可查询字段。
- `KGOS_LOG_LEVEL` 可选，`DEBUG|INFO|WARN|ERROR`（大小写不敏感），默认 `INFO`；无效非空值在启动时明确拒绝；从进程环境读取，修改后需重启 daemon，**不属于初始化后不可变的 `config.toml`**。首版不设日志格式、输出目录、采样率或业务事件开关配置。
- INFO：启动/停止、完成的关键操作；WARN：安全拒绝、限流、超时、结果未知；ERROR：内部故障；DEBUG：经字段白名单筛选的执行阶段。业务参数无效等预期拒绝可以记 INFO，不把每个用户输入错误当作系统故障。
- 公共字段：`time`、`level`、`component`、`event`、`run_id`；请求内可附 `request_id`、`operation_id`；操作完成可附 `duration_ms`、`outcome`、`error_code`。缺省字段省略，不填造假的值或 `null`。
- `run_id` 每次 `kgosd` 启动生成新的随机非凭证标识，仅用于跨重启分组；`request_id` 与 `operation_id` 的规则见下节。时间和 duration 使用真实测量结果，不使用 HTTP 200 推定业务成功。
- `component` 和 `event` 为固定枚举，例如 `runtime.started`、`http.request.finished`、`mcp.tool.finished`、`business.operation.finished`、`security.authorization.decided`；字段由专用 typed/allowlist 调用点提供，禁止通用 `map[string]any` 将原始请求或 `error.Error()` 自动序列化。

示例仅表示 Phase 19 的目标格式，非真实运行日志：

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

不得记录 Authorization、Cookie、Session、Instance/OAuth Token、Code、PKCE、`state`、Credential/API Key、请求与响应正文、Cypher、Patch、JavaScript、Ontology/Knowledge Value、原始 URL/Query、任意 Header、本机绝对路径、原始用户名/客户端自报身份，或可能含有这些内容的未筛选错误文本、堆栈与数据库异常。Branch/Tag/Definition/Object 名称和用户提供的 Author/Message 也是可能敏感的业务数据，默认不入日志；需要定位时使用记录的已确认 Commit/State 关联已有版本查询。DEBUG 也不放宽此白名单；错误根因只记录固定的 `stage`、`cause_class` 与公共 `error_code`，不能直接输出未清洗的底层 `err.Error()`。

认证失败、未授权的 OAuth 请求不能暴露可判定凭证有效性的差异；记录固定的 `auth_kind`、`decision` 和低基数拒绝类别，不记录用户提交的 Client ID、回调、来源 IP 或凭证摘要。日志文件/容器日志只供受信运维访问，不作为开放 API。

## 请求关联与真实结果

1. `kgosd` 在 HTTP 入口为每个请求**自行生成**足够随机的 `request_id`（至少 128 bit entropy），写入 Context、日志与响应 Header `X-KGOS-Request-ID`；不把客户端提交的同名 Header 作为权威 ID。发生认证拒绝或普通业务错误也返回此 Header；Graph streaming 的 Header 必须在首字节前可见。路径/Method 查询仍使用现有路由合同。
2. HTTP → MCP handler/Tool → Sandbox Bridge → Kernel → Lithograph Host 的 Context 继承同一 Request ID。一次 `kgos_run` 可以执行多个 Kernel 写操作；每次独立操作再生成 `operation_id`，让同一请求下多个业务结果可区分。无 HTTP Context 的内部调用也可以有独立操作标识，不虚构入口来源。
3. Access log 以**实际 HTTP transport**状态、固定 route、duration 结尾；MCP Tool 另以**真实 Tool result**记录成功/错误。MCP HTTP 200 内可能是 Tool error，Graph NDJSON HTTP 200 内可能是 terminal `error` event：不得把它们统计为业务成功。Graph streaming 的 `summary` 与消费取消/断连分别记录，`rows` 已发送不代表操作整体成功。
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

## 输出、轮转与保留

| 运行方式 | 正式输出 | 管理责任 |
| --- | --- | --- |
| 本地 CLI 自动启动 daemon | `<workspace>/.kgos/logs/kgosd.log`，JSON Lines 为主 | KG OS 的唯一日志写入/轮转 owner；日志文件模式 `0600`、目录 `0700` |
| 手动前台 `kgosd` | JSON Lines 输出到 stderr；原有供运行脚本读取的启动地址 stdout 行仍保留 | 前台运行者负责收集 stderr |
| Docker `kgosd`（包含 OpenClaw Dev） | JSON Lines 输出到标准容器日志流，保持 `pnpm dev:mcp logs/logs-follow` 可用 | Docker/Compose 的日志 driver 与保留上限负责；不在容器内再落一份重复文件 |

本地日志默认每文件 **10 MiB**，最多 **5 个文件（含当前）**，超过阈值顺序轮转，最大保留约 50 MiB，不设无限增长或日常人工清理依赖；日志目录和轮转文件保持私有权限，禁止通过符号链接重定向到 Instance 以外或已有敏感文件。需要处理现有 CLI 的 `spawn` stdout/stderr 文件 descriptor：**只能有一个轮转 owner**，不能让旧的常驻 append FD 在轮转后继续写入已移动文件；启动早期错误仍须有可读取的安全诊断出口。仓库受控 Dev Compose 应配置有界 Docker 日志保留；正式镜像无法单独控制宿主 Docker 的日志 driver/retention，部署者必须配置有界保留，不能把本地轮转误当作容器日志上限。

日志为诊断缓存，备份不包含它们；删除/轮转不能影响 `kgos.db`、Lock、OAuth/Web Session 或其它业务状态。磁盘满、权限错误、日志写入失败都必须有明确安全降级，不允许因日志能力丢失使已经成功的业务操作变成对外失败，也不产生失控的重复错误日志。

## 内置运行指标与只读诊断

- 指标由进程内固定集合维护：自启动运行秒数、当前 HTTP/MCP 并发数、HTTP 请求总量与非 2xx 总量、HTTP 耗时桶、MCP Tool 调用/业务失败/超时次数、Kernel 关键操作次数与结果类别、Sandbox 资源预算触发次数、Go heap alloc bytes 和 Goroutine 数。指标随进程重启清零，**不承诺跨重启保留或等于历史审计记录**。
- 只使用固定的操作类别、路由模板、Tool 名和结果枚举作为聚合维度；**不使用** Request ID、Branch/Object Ref、User-Agent、URL、IP、Token、用户文本等高基数字段。耗时从真实执行段测量，长流持续时间包括完整生命周期；不得凭 Response Status 计算 MCP Tool 的逻辑失败率。
- 在现有统一监听器上新增 **`POST /api/v1/system/diagnostics`**（请求体为 `{}`）的只读 JSON 摘要。沿用现有 API Instance Bearer 或有效的 Web Access Bearer/Boot Guard；OAuth Access Token 只允许访问 MCP，不能通过该路由绕开认证。无开放 CORS、无第二个监听器、无独立服务或额外用户权限体系。
- 返回自启动以来的汇总及当前快照，结构至少包含 `uptime_seconds`、`process.heap_alloc_bytes`、`process.goroutines`、`http.requests_total`、`http.non_2xx_total`、`http.in_flight`、`http.latency_ms_buckets`、`mcp.tool_calls_total/tool_errors_total/tool_timeouts_total`、`business.operations_total/outcomes`。耗时桶为固定边界、累计计数（例如 `<=50`、`<=250`、`<=1000`、`>1000` 毫秒），实际 wire 编码由 Phase 19 依据这些语义确定并测试，不借此新增业务 API/历史查询。
- 诊断 API **不能直接查询、下载或筛选原始日志**，不暴露工作区绝对路径、Token、请求详情或 Knowledge 内容；它不是新的 Health/Ready 判据，不根据进程内计数推断 Lithograph 数据完全健康。未来 Web 状态页可以使用它，但不在 Phase 19 内开发。

## 与现有合同的关系

- [Runtime](runtime.md#logs)：原有 `.kgos/logs/` 路径与 lifecycle 保留；诊断数据不成为 Knowledge Base history。
- [CLI](cli.md#json-first-stdout)：成功 stdout 和失败 stderr JSON 仍用于机器消费；后台 daemon 日志不写入业务 stdout/stderr，启动输出约定在 daemon 自身保持。
- [MCP](mcp.md)：Tool 返回、JavaScript sandbox 结果/预算、OAuth 凭证、超时及已写入不可自动回滚语义保持原样。
- [Graph](graph.md)、[Evolution](evolution.md) 与 [Object](object.md)：业务事件只忠实记录这些 owner 已定义的结果，不构造独立事务或 versioning。
- [Web](web.md)：现有登录与连接授权入口不重做；只消费未来 SDK 可选的 Request ID 和受保护诊断摘要。
