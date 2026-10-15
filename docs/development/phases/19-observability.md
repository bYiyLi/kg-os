# Phase 19：KG OS Observability（关键业务事件与运行诊断）

<!-- cspell:words mcpserver mcpsandbox -->

## 目标与状态

**`done`（2026-10-15）：P19-01–05 的实现、Mac 全量质量、隔离 Docker、长期 Dev 和最终推送 SHA 的 GitHub CI 8/8 均已验收；不包含正式 Release/生产部署。**

把当前单进程 `kgosd` 的启动/错误文本与 CLI append 日志升级为内建可观测性：统一 JSON Logs、可靠表达**关键业务操作真实结果**的 Business Events、跨 HTTP/MCP/Kernel 的 Request ID，以及进程内 Metrics 和受现有认证保护的只读诊断摘要。

本 Phase 是**一个交付与验收单位**，内部按 P19-01–05 顺序实施。改动必须限于 KG OS Runtime、Daemon、MCP、Kernel 的观测注入、SDK 最小必要诊断字段、本地/容器日志承载和直接测试；**不修改 Lithograph 仓库**，不做 Web 状态面板、监控服务、日志数据库、新 MCP Tool、审计数据库或领域知识模型。Commit、Push、Dev 部署、Tag/Release/生产部署是独立动作，计划存在不代表这些动作已授权执行。

## Design Inputs 与可核对的实现基线

- 唯一设计真源：[Observability](../../design/observability.md)，架构决定 [D97](../../design/decisions.md#d97-kgos-observability)；已有 [Runtime logs](../../design/runtime.md#logs)、[CLI stdout/stderr](../../design/cli.md#json-first-stdout)、[MCP 写入及超时](../../design/mcp.md#javascript-sdk-执行)、[Graph streaming](../../design/graph.md)、[Evolution](../../design/evolution.md) 不得被新的日志逻辑改变。
- 修改前 `cmd/kgosd/main.go` 与 `internal/daemon/server.go` 主要输出非结构化启动/错误行，`packages/cli/src/runtime.ts` 使 daemon 继承对 `.kgos/logs/kgosd.log` 的 append FD 且无轮转；当前修改已由 `internal/observability` 与 CLI 处理结构化写入、文件轮转及启动日志分离；`internal/runtimeprofile/profile.go` 继续拥有 `LogsDir` 路径。
- `internal/daemon/api.go` 汇聚 HTTP 业务路由和现有 Web Session/Boot Guard；`internal/mcpserver/server.go` 是实际 Tool/HTTP 边界，`internal/mcpsandbox` 有独立 Bridge 执行限制；`internal/kernel` 的共享 Patch、Graph、Evolution 才能提供真实业务提交与 Session 结果。
- 当前 Dev 使用 [OpenClaw Compose](../../../compose.dev.yaml) 单一 `kgosd` 服务，`pnpm dev:mcp logs` / `logs-follow` 经 Docker logs 读取；Mac 负责代码和定向/全量质量检查，Docker 实测在 OpenClaw，正式 Release/生产不属于本 Phase 实现授权。
- 现有 [Phase 14](14-web.md) 仍 `deferred`，[Phase 16](16-kgosd-unified-mcp.md)、[Phase 17](17-mcp-web-authorization.md) 和 [Phase 18](18-chatgpt-embedded-web.md) 的真实已完成/例外记录不被重写；不得让 Observability 依赖尚未完成的 Web 页面。

## Feature、依赖与交付

| Feature | 交付范围 | 依赖 | Acceptance |
| --- | --- | --- | --- |
| **P19-01 Logging Foundation** | Go `slog`、白名单字段、级别与 `KGOS_LOG_LEVEL`；前台 stderr、CLI 后台安全文件承载与 10 MiB × 5 轮转、容器日志保留与兼容；启动/关闭/错误 | 现有 Runtime/CLI/Compose | A19-01 |
| **P19-02 Request Context 与 Access/Tool 诊断** | 服务端生成 `request_id`、HTTP Header、跨 Handler/Tool/Sandbox/Kernel Context、`operation_id`、流式安全包装；MCP 业务错误与 HTTP 状态分别记录；SDK Error 可选 `requestId` | P19-01 | A19-02 |
| **P19-03 关键业务与安全事件** | Kernel 共享 Patch、Graph Execute（含 streaming）、Evolution/ Merge 的确认结果事件；Web 登录/退出和 OAuth 批准/拒绝/Token 交换事件；去重和 `unknown` 副作用分类 | P19-01/02；现有 Kernel/认证 owner | A19-03 |
| **P19-04 Metrics 与诊断 API** | 固定桶/计数的进程内聚合、资源快照、受保护的 `POST /api/v1/system/diagnostics`；无外部监控依赖或高基数标签 | P19-02/03；现有受控 HTTP API | A19-04 |
| **P19-05 集成、安全与交付验收** | 定向/集成/回归、日志轮转和权限、敏感信息泄漏测试、Mac 完整质量、隔离 Linux Docker、CI 门禁与最终 Review；同步必要操作指南 | P19-01–04 | A19-05 |

先建最小共用 Logger/Context/结构化结果合同，再在真正的业务执行边界写日志。不要通过拦截响应正文、解析 Cypher/JavaScript、扫描 DB 私有表、重复 SDK 调用或另建 outbox 来“推测业务”。同一 Patch 走 `ontology.patch` 或 `object.patch` 时，只产生一次业务完成事件；一个 `kgos_run` 中每个独立 Kernel 写操作应各自留下结果，Tool 结果另记访问日志。

## Acceptance

### A19-01 统一日志与输出边界

1. INFO/WARN/ERROR/DEBUG 的过滤、默认 INFO、无效非空 `KGOS_LOG_LEVEL` 的启动失败及重启生效有测试；JSON Lines 可以逐行解码，公共字段与事件枚举稳定；DEBUG 仍只输出白名单。
2. 直接运行 `kgosd` 时 JSON 日志写 stderr，原有启动地址 stdout 行保持；`@kgos/cli` 成功 stdout、异常 stderr 结构化 envelope、Graph NDJSON 和 exit code 不出现额外日志文本；现有 `doctor/init` 的 TTY 规则不受影响。
3. 本机 CLI 自动启动的日志保留在 `.kgos/logs/kgosd.log`；触发真实连续写入轮转证明 10 MiB × 5 上限、`0700/0600` 权限、符号链接拒绝、旧 stdout/stderr FD 不继续污染已轮转文件；启动早期失败有诊断。重启后仍能读取新的日志，异常退出不影响 lock/stale recovery。
4. OpenClaw/正式统一 Docker 镜像仍能通过容器日志获取同样事件；受控 Dev Compose 设置有界 driver retention，并在 Docker 实测；正式镜像自身不保证宿主日志轮转，交付运行说明须明确外部容器日志保留要求。不把容器日志复制到 Instance 的第二份文件，原 `dev:mcp logs/logs-follow` 命令保持可用。

### A19-02 Request ID 和跨层追踪

1. 请求成功、401、4xx、5xx、MCP HTTP 以及 Graph NDJSON 首字节之前都有本服务生成的 `X-KGOS-Request-ID`，且不采纳攻击者自报 Header；一个请求的 API/MCP/Sandbox/Kernel 相关事件均能用同一 ID 找到，多个 Kernel 操作各有独立 `operation_id`。Web Bearer 在已有 `webBearer` 中间件完成认证并映射 Instance Bearer 时显式保留可信 `surface=web` Context；普通 Instance Bearer、伪造 Header 不得获得此来源身份。
2. 相同 HTTP 200 下的成功 MCP Tool 与失败 Tool 可被区分；Graph 普通返回与中途 NDJSON error、客户端断连、取消和 timeout 都按真实结果记录。包装器保持流式 `Flusher`/传输行为与取消，不缓存响应体或重复读取业务流。
3. SDK 的 `KGOSDaemonError` / `KGOSTransportError` 可读取可选 `requestId`（仅在确有服务端 Header 时存在），没有 Header 也照常处理；原有公共错误 JSON、OAuth、MCP 协议、CLI stdout/stderr 均不改变。
4. 静态资源不输出每次普通成功访问的 INFO 记录；Docker 周期性的 `GET /mcp` 预期 401 健康探测不增加 HTTP 失败计数；未授权业务 POST 仍计入失败统计。所有日志维度为固定值或安全有限值，不对每次流式 row 额外打一条日志。

### A19-03 关键业务事件的真实性

1. Ontology-only、Knowledge-only、mixed Patch，以及严格 base 失败、no-op、真正 commit：只产生一条对应操作结果事件；`committed` 仅在真实 Commit 成功后出现，包含可确认 State 与变更计数，没有 Patch 正文。
2. Graph Execute 的只读/写入 Cypher、DDL、无变更、普通与 streaming 成功/异常均用**底层可确认结果**标记，绝不因 `execute` 入口或 HTTP 200 推断 mutation/commit；Graph Query 普通读取不产生业务写入事件。
3. Evolution State/State Data、Branch/Tag 和 Merge start/resolve/finalize/abort 均有匹配真实效果的事件；仅 `finalize` 确认后记录该 Merge 的提交，`abort` 不伪造以前操作的回滚。
4. 构造 `kgos_run`“先成功写入、后一步失败”与并发调用测试：前一操作仍记已提交，后一步按已知结果记 `rejected/failed/unknown`，外层 Tool 的错误不覆盖已提交事件；取消/超时/断线发生在可能写入之后只记 `unknown`，后续既有 API 核对真实 Branch/History；不能自动重试补偿。
5. Web Session 登录/退出、OAuth 授权同意/拒绝、Token 交换成功及失败，记录固定安全结果；不会暴露 token、cookie、client id、redirect URI 或根凭证，也不会在 shared Instance Bearer 情况下虚构具体人类身份。
6. 日志写入失败/磁盘满不改变成功事务、HTTP/MCP response 或重放写入；诊断事件不是不可丢失审计保证。按事件级别、stage、public error code 核查故障可定位，而不需打印原始 `err.Error()`。

### A19-04 Metrics 与受保护只读摘要

1. 真实请求/Tool/业务结果形成累计计数和固定耗时桶，当前并发从 0 回落，进程资源快照可读，重启后归零。HTTP 非 2xx 与 MCP Tool 内部失败分别统计，不能把 HTTP 200 的 Tool error 当成成功。
2. `POST /api/v1/system/diagnostics` 用现有 API 的有效 Instance Bearer 或合规 Web Access Bearer/Boot Guard 返回有界 JSON；无认证、仅有 MCP OAuth Token、失效 Web Session、跨 Instance 一律拒绝。请求体必须是 `{}`；只读不创建 State/Commit 或写入数据库。
3. 指标不包含高基数标签、日志、URI、原始对象内容或 secret；没有新增独立数据库、指标监听端口、公开 `/metrics`、业务 Tool 或 Web 仪表盘。错误、重启与内存压力下不会让 Metrics 阻断 Kernel。

### A19-05 综合验收与 Review

1. Mac 运行 Go/TypeScript 定向测试、日志安全和代码质量检查、全量 `pnpm validate`、`git diff --check` 与最终定向 Review；独立 fresh-source 的构建/测试确保不依赖本机日志、缓存或已有 Dev 状态。
2. 按 [D94](../../design/decisions.md#d94-openclaw-docker-development-and-ci) 在 OpenClaw **隔离** Linux amd64 Docker/临时 Volume 验证非 root、真实 API/MCP/OAuth、Tool 错误、请求关联、持久数据/重启与受控日志上限；不得用破坏性操作修改长期 Dev Instance。长期 Dev 部署需单独授权，不能用旧镜像的日志验收替代本 Phase。
3. 在本次实际源码 revision 上取得 GitHub Actions Ubuntu Validate、既有六平台 native/package 和 Docker build/smoke 的成功证据；没有 CI/远端验收不得默认标记 `done`。Release Tag、GHCR 正式发布与生产部署不属于本 Phase 的自动动作。
4. Review 覆盖：中间层 stream 和 response interface 兼容、错误结果真实语义、Patch/MCP 多步避免重复、身份归属、安全字段白名单、日志轮转 FD 所有权、无高基数 Metrics、认证边界、log I/O 故障、与已冻结业务合同一致；关闭本阶段范围内 findings，并同步 owner 文档/操作指南/状态。

## Review 特别检查

| 风险 | 必须核对的反例 |
| --- | --- |
| 把 HTTP 200 当业务成功 | Tool error、Graph terminal NDJSON error 不能计为已提交 |
| 把调用完成当持久化确认 | Graph Execute 可以只读；Merge resolve 不是 finalize；Patch no-op 不是 commit |
| 上层错误覆盖下层成功 | `kgos_run` 前一个写入成功、后一个失败时，两者必须保留各自真实结果 |
| 日志泄漏 | Token、Cookie、OAuth code、URL Query、原始 JavaScript/Cypher/Patch、错误堆栈即使 DEBUG 也不能出现 |
| 日志膨胀与句柄失效 | 长时 daemon 写入、轮转、启动 FD、Docker driver 均需实测；不能只测启动一次 |
| 权限与客户端回归 | Web Bearer/Boot Guard、OAuth Token 与 API 的 audience 保持隔离；SDK/CLI/MCP/Stream 不改业务协议 |

## 完成条件与当前证据

- **阶段状态：`done`（2026-10-15）**。P19-01–05 均已实现并完成相关 Acceptance；真实 Lithograph Kernel 写入、MCP 多步部分成功、Web/SDK 诊断认证、Request ID、安全日志、Sandbox 指标和轮转均通过针对性测试。包含最终 `CANCELLED` 修复的 Mac `pnpm validate` **exit 0**：Go 静态/竞态、statement coverage **90.0%**、TypeScript/Lint、Vitest **228/228**、Playwright **26/26**、Native、打包、依赖/许可证、安全和 diff 门禁通过；依赖审计仍报告 **1 个已忽略 high** 与 **1 个 low**，不把忽略项称为零漏洞。
- **Review 修正（2026-10-15）**：`internal/observability/observer.go` 的 `Tool` 统计已把 `CANCELLED` 从 `tool_timeouts_total` 中剔除；取消仍计入 Tool errors，真正 `TIMEOUT` / `DEADLINE_EXCEEDED` 才计入超时。`internal/observability/extra_test.go` 覆盖资源失败、超时、取消的区分；定向测试和修复后的完整质量门禁均通过。
- **隔离 Docker 证据**：OpenClaw 从仅包含 Phase 19 变更的暂存 Git 树 `26be2b7fb266acc04cdfdd19b8cb1a20dc11a52f` 导出干净源码，Linux amd64 镜像 `kgos-phase19-staged:26be2b7fb2` 构建成功；`KGOS_UNIFIED_DOCKER_SMOKE_IMAGE=kgos-phase19-staged:26be2b7fb2 node scripts/mcp-unified-docker-smoke.mjs` 在随机临时 Volume **exit 0**，验证非 root、Node-free、统一 Web/API/MCP、31/31 SDK 调用及重启持久化。源码包含 `CANCELLED` 修复，不包含无关 Web 未提交修改；最终 GitHub CI 又从推送 SHA 独立构建并通过同一 Docker Smoke。
- **长期 Dev（2026-10-15）**：按用户授权，从独立干净 Git worktree 的 `0bc47eeeba83091434d60d699c918b32a35ecda5`（`clean`）执行正式 `dev:mcp deploy`；部署前完成 SQLite 在线一致性备份，自动切换和只读统一 Web/API/MCP/OAuth/5 Tool 验收均成功。UTC 记录 `2026-10-15T06:19:26Z`、当前镜像 `sha256:9b409ec1090e4099cc236805a9057e4e651b6ecaa8500e6656438268fd24369a`，之后 `pnpm dev:mcp check` exit 0；带现有 Instance Bearer 的 `POST /api/v1/system/diagnostics` 返回 200，无认证返回 401，服务端 Request ID 格式及安全指标字段正确，Docker `json-file` 使用 `10m × 5` 保留。另使用实际部署的 `kgos-dev-mcp:local` 镜像在**独立随机临时 Volume** 执行 `node scripts/mcp-unified-docker-smoke.mjs`，真实 MCP SDK **31/31**、非 root、无 Node、重启持久化验收均以 exit 0 结束。长期 Dev 没有执行测试写入，也未引入其他未提交 Web 改动。
- **Git 与 Review 交付**：Phase 19 实现提交 `0bc47ee`（45 个文件）、Dev 验收记录 `a9ac341`、Windows 文件权限测试修复 `aef5dbc` 均已提交并非强制推送到 `origin/main`；标准 pre-commit `pnpm check:quick` 成功。Review 发现的 `CANCELLED` 超时误计、Windows POSIX 权限断言已修复，针对本阶段的最终 Review 未发现剩余会影响验收的事项。原有 Phase 14/Web 未提交改动未混入这些提交。
- **最终远端 CI**：提交 [`aef5dbce6dd243172d48085950d7a96465e65c66`](https://github.com/bYiyLi/kg-os/commit/aef5dbce6dd243172d48085950d7a96465e65c66) 的 [GitHub Actions CI Run 38693436299](https://github.com/bYiyLi/kg-os/actions/runs/38693436299) 状态 **completed / success，8/8 Jobs 全绿**：Ubuntu `Validate`、`Unified Docker / Linux amd64` 以及 Native Runtime `darwin-arm64`、`darwin-x64`、`linux-arm64`、`linux-x64`、`win32-arm64`、`win32-x64`。先前 Run `38692324423` 的 Windows POSIX 权限断言失败已由 `aef5dbc` 修复并在新 Run 的两项 Windows Job 实际验证通过。此 CI 不等于 Tag、GHCR Release 或生产部署；后者没有执行，仍需分别授权。
