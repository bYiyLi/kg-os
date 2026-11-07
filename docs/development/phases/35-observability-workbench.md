# Phase 35：KG OS SQLite 运行观测与请求诊断工作台

<!-- cspell:words TRUNC tmpfs mcpserver -->

## 目标与状态

**`in_progress`（2026-11-07）：P35-01–05 的主要代码已落地，P35-06 正在进行综合验证与 Review；尚未完成全部 A35-01–08 验收，也未提交、推送、发布或部署。** 当前实施证据与缺口维护在文末，文档检查不代替实际运行验收。

在已完成的 [Phase 19](19-observability.md) 结构化事件、Request ID、业务真实结果、进程指标和诊断摘要基础上，实现 [D126](../../design/decisions.md#d126-sqlite-observability-workbench) 确认的**独立 SQLite 诊断库及浏览器运行观测页面**。最终页面展示系统概览、资源与请求趋势（含慢请求曲线）、系统事件，以及底部左右联动的「最近请求树 ↔ 执行日志」；**不再维护完整 JSONL 常规日志文件**。

本 Phase 是**一个交付与验收单位**，以下 P35-01–06 是内部依赖顺序，不拆成多个独立 Phase。**确认使用 OpenTelemetry Go API/Trace SDK** 负责进程内链路追踪，复用现有 `slog`、SQLite 和 Metrics；诊断数据不进入 Lithograph、Knowledge、Commit、VLog 或业务事务。不部署 Collector、OTLP/Jaeger/Tempo、外部日志服务、Agent、监控 Server、新 MCP Tool 或管理角色，也不引入 OTel Logs/Metrics SDK。生产升级、Tag/Release 与正式部署不因该计划自动获准。

## Design Inputs 与当前代码基线

- 观测数据、持久化、身份、API、错误/资源口径以 [Observability](../../design/observability.md) 为唯一真源；[D97 历史基线](../../design/decisions.md#d97-kgos-observability) 由 [D126](../../design/decisions.md#d126-sqlite-observability-workbench) **定向替换**存储/页面部分，其业务结果真实性和安全规则仍有效。
- [Runtime `logs/`](../../design/runtime.md#logs) 拥有 Instance 目录/启动与清理边界，[Web 运行观测](../../design/web.md#运行观测工作台d126phase-35-目标) 拥有布局、联动和认证后的浏览器体验；原有 [公共错误合同](../../design/contracts.md#公共错误合同)、[MCP](../../design/mcp.md)、[Web Session/Boot Guard](../../design/web.md#连接认证与恢复) 与 [Phase 34](34-mcp-resilience.md) 保持。
- **确认的页面视觉输入**：[OBS1 运行观测工作台原图](../../design/assets/web/OBS1-observability-workbench.jpeg)，[素材登记](../../design/web-materials.md#obs1-运行观测工作台2026-11-07)。开发时对照其资源/请求趋势、系统事件、左侧树形请求和右侧执行日志的布局；所有数值、示例 ID、错误及事件均为虚构展示，不能据此推断服务器已提供相关数据。
- **Trace SDK 参考**：[OpenTelemetry Go 手动插桩](https://opentelemetry.io/docs/languages/go/instrumentation/) 和 [Go `sdk/trace`](https://pkg.go.dev/go.opentelemetry.io/otel/sdk/trace)（2026-11-07 核对）。采用 SDK 的 TracerProvider、SpanContext、SpanProcessor、BatchSpanProcessor/SpanExporter，**不再另写一套 Span ID 生成与树生命周期**；自定义适配器只把安全投影写入已有的诊断 SQLite。实施时按本仓库 Go 版本选择可用的稳定 OTel 版本并锁定依赖；设计确认不表示依赖已经安装。
- **Phase 19 历史基线（非现行代码状态）**：当时 `internal/observability/observer.go` 使用 `slog.JSONHandler` 和进程内 Metrics，`rotation.go` 轮转 JSONL，内部 CLI 分支写 `kgosd.log`，Docker 默认 stderr，`Business()` 在操作完成时生成 `operation_id`。它们是 Phase 35 变更前的已验收行为，不应再描述为当前正式目标。
- **Phase 35 当前未提交实现**：`internal/observability/store.go`、`trace.go`、`query.go` 和 `metrics.go` 承担独立 SQLite、OTel、指标和只读查询；`cmd/kgosd` 已切换常规日志源并限制启动输出；MCP、Sandbox、Kernel、Lithograph Host 已接入手动阶段埋点；`internal/daemon/observability_routes.go` 和 `packages/sdk` 提供三条保护查询；`packages/web/src/features/observability/` 已提供 OBS1 工作台。具体最终合同仍以 Design Owners 为准，代码存在不等于所有 A35 通过。
- 既有 `docs/development/README.md` 对 Phase 14/25/26/27/28/29/30/32/33/34 的用户人工结项与例外仍有效；这些历史遗留缺项**不自动并入**本 Phase。开发时保留无关工作树改动，不以旧 CI、旧 Docker 镜像或原 Phase 19 的测试替代新功能验证。

## Features、顺序与交付

| Feature | 交付内容 | 前置条件 | 验收 |
| --- | --- | --- | --- |
| **P35-01 嵌入式诊断存储/日志切换** | 独立 `observability.sqlite`、诊断 Schema 与索引、WAL/队列/批量写、保留/容量约束、私有权限、运行时应急 stderr；停止完整 JSONL 文件写入和全量 Docker stderr | Phase 19 / D126 | A35-01、02 |
| **P35-02 OpenTelemetry 请求链路** | 接入 OTel Go API/Trace SDK、阶段手动插桩与真实父子 Context；保留可信 Request/Operation ID；有界 BatchSpanProcessor + 安全 SQLite Exporter、非阻塞开始事件、`slog` 与 Span ID 关联、完成/中断/未知结果 | P35-01 | A35-02、03 |
| **P35-03 指标与运行事件** | Go/Linux 资源采集、时序桶、慢请求口径、健康/重启/压力事件和可信 OOM 分类；异常缺口可见 | P35-01/02 | A35-04 |
| **P35-04 受保护诊断 API / SDK** | 既有 diagnostics 兼容；overview、requests/list、requests/get、logs/list 四项只读/有界查询，统一 `@kgos/sdk` 类型与客户端；全局日志返回实际 Request ID，严格限定时间、级别和 cursor | P35-01–03 | A35-05 |
| **P35-05 Web 观测工作台** | 左侧入口，顶部指标卡与紧凑系统事件摘要/历史弹窗、中部两张趋势图、底部左请求树/右日志、清晰的父子连接线、真实全局日志默认列表与选择后的精确过滤/解除过滤、筛选/分页/局部最大化、深浅主题/双语和响应式 | P35-04 | A35-06 |
| **P35-06 质量与交付收尾** | 受限内存/磁盘、并发/重启、错误注入、安全回归、Mac 质量、隔离 Docker、最终 Review、CI 与说明同步 | P35-01–05 | A35-07、08 |

按链路依赖依次完成实现与验证，不从截图或示例数据推定后端能力。Phase 35 只在 `internal/observability` 和已有真实执行边界集成 OTel Trace SDK，不引入自动采集原始业务参数的埋点、第二套 Span 引擎或新的遥测服务；前端组件按实际需要评估现有 shadcn/ui 与轻量图表/树表库，避免提前添加通用抽象、额外数据库和不必要的 OTel 组件。

## Acceptance

### A35-01 正式存储唯一性与兼容

1. 首次运行和已初始化 Instance 均创建独立的 `.kgos/logs/observability.sqlite`，模式、所有权及 WAL/SHM 权限正确；重启可读取已提交的诊断信息，`kgos.db`、State、Session 和认证状态不受影响。
2. Docker、前台 `kgosd` 与内部 CLI 启动均**不再持续写入**完整 `kgosd.log*` 或将全部请求日志复制到 stderr；启动地址/stdout 和 CLI 的 JSON-first 业务输出不受污染，关键启动/诊断库故障有安全 stderr 诊断。现有内部 CLI 的 `kgosd.startup.log` 当前通过 `O_TRUNC` 打开但未按文件体积硬限制输出；本阶段必须补齐有界早期输出并验证它不会变成第二套常规日志。
3. 旧 JSONL 历史文件不被自动删除、导入或误算成新 SQLite 的历史记录；版本升级/回退与读写失败不会破坏知识库。不能假设旧镜像能够读新诊断库：回退时其诊断状态必须安全隔离。

### A35-02 诊断库容量、写入与降级

1. 实测单写入者、短事务、有限队列、日志级别过滤和允许事件丢失的显式状态；OTel BatchSpanProcessor 队列与 SQLite 写入队列**同时受限并计入内存/丢失预算**。并发请求、读写锁冲突、WAL checkpoint、时间/容量清理期间**不阻塞业务提交**、不递归写错误、不无限积累内存。正常关闭有期限内 OTel ForceFlush/Shutdown 与数据库 flush/close，超期不伪称完整持久化；数据库路径为非符号链接且越界被拒绝。
2. 覆盖磁盘满、只读/权限拒绝、文件损坏、连接失败、队列溢出及持续高日志量；业务真实结果与 HTTP/MCP/Stream 输出保持原样，故障以受控应急摘要和诊断不可用/已丢弃标志呈现。
3. 用真实文件大小检查主库、`-wal`、`-shm` 与临时空间，验证最近 24 小时/64 MiB **工程初值**下的清理/截断可控；不只检查主库页数，也不承诺超越 SQLite/WAL 机制的绝对瞬时物理上限。超过覆盖范围的数据不假装仍存在。

### A35-03 链路及业务结果真实性

1. 真实 MCP/HTTP 请求含服务端 `request_id`，不同 Kernel 操作有不同开始时创建的 `operation_id`；**OpenTelemetry SDK** 生成并传播 `trace_id`、`span_id` 与父子 SpanContext，供 SQLite 按真实父子关系组织同一请求多操作、嵌套/并发执行树，且没有平行的自造 Span ID/树管理器。`slog` 安全事件关联有效 SpanContext，日志不会只因时间接近被归错 Span；未经认证的客户端 `traceparent` 等不能影响权威树关系。
2. 测试 `kgos_run` 先持久写入成功后 Tool 失败、Graph NDJSON terminal error、HTTP 200 内 MCP 业务失败、取消、超时、断连；已提交结果不因上层错误被覆盖，未知副作用不假定失败/回滚，不自动重放。
3. 测试 OTel `SpanProcessor.OnStart` 非阻塞投递开始事件及 `BatchSpanProcessor` / 自定义 `SpanExporter` 的完成态写入、超时/取消、队列溢出与丢失报告；固定阶段在默认日志级别仍可展示，不按每行或循环创建 Span，不使用会提前丢弃未知慢请求/失败的概率头部采样。隔离容器内强制停止后，尚未完成的请求/阶段显示 `incomplete/unknown` 或明确缺失，不合成结束/提交记录，不把日志不足视为业务未发生；未落盘的开始/结束事件可丢失但必须报告覆盖边界。

### A35-04 指标、趋势与生命周期

1. 真实 Go heap、RSS、可用 cgroup memory、CPU/GC 采样的来源与单位正确；不可用项明确标记，不把 Heap 当总内存。历史时间桶显示覆盖、断档和丢弃记录；当前进程 diagnostics 原有计数仍在重启时归零，历史曲线可跨重启读取已保存的行。
2. 请求总量、成功/错误、慢请求（完成耗时 `> 2s`）口径正确，慢请求与成功/错误可以重叠；HTTP transport、MCP 业务错误不能误计为相同成功事件；观测 UI 自身轮询/静态资源不放大业务趋势。
3. 正常关闭和缺失正常停止事件可区分；无宿主可信证据时不报告 OOM 已确认。本阶段**不新增特权宿主采集器**，必须实测缺乏证据时显示 unavailable/未知，不能用退出码 137 猜测。若测试环境有可信且可归属于本 Instance 的宿主 OOM 事件，额外验证其归因与显示；没有该输入时不能伪造已确认 OOM 正例。

### A35-05 只读 API、认证与数据隔离

1. 三个新增 API 以及 SDK 方法按 [Observability](../../design/observability.md#只读接口与安全边界) 查询真实数据，按时间、固定枚举、Request/Span ID、cursor、limit 限制结果；大窗口、非法 ID、注入文本、无效 cursor、超量分页有明确的安全错误，不执行任意 SQL 或原始文件读取。
2. Instance Bearer 或有效 Web Access Bearer + Boot Guard 能读；未认证、过期/跨 Instance 会话、错误 Boot Guard 和仅有 MCP OAuth Token 的请求均按原权限边界拒绝，不泄露私密字段。
3. 原 `POST /api/v1/system/diagnostics` 响应保持兼容，Web 设置的已有摘要读取仍可使用；诊断库不可用时历史查询明确报告不可用，不以空数据代替异常。
4. 四个只读诊断 API 可以同时查询，超过 2 个时不得因人工读取槽位返回 `ErrReadBusy` / HTTP 500；SQLite 连接池等待、请求取消和单次查询截止都要实测，同时保留真实数据库/鉴权错误与响应界限。

### A35-06 浏览器页面真实交互

1. 观测入口位于「设置」上方，知识世界/图谱选择保持；进入观测视图不会继续无意义查询知识画布。桌面、窄屏/缩放、深浅主题、中英语言与键盘/屏幕阅读器有真实浏览器验证。
2. 资源和请求曲线、系统事件来自真实数据。请求趋势含慢请求曲线；不存在独立「工具调用 Top 6」「慢请求」「链路追踪」卡片。
3. 左侧请求树展开/选择与右侧日志按精确 ID 联动；请求/阶段切换、日志级别过滤、搜索、分页、全屏与返回焦点正确，自动刷新不丢失已展开项或滚动位置；查看超时、无日志、历史淘汰、数据丢失和失效认证显示可信状态。
4. V2 交互验收：顶部紧凑且无无效装饰性控件，最新一条系统事件摘要位于标题与筛选操作之间；时间筛选使用单一 Base UI Select Trigger，图标/值/箭头不形成嵌套边框，鼠标和键盘选择最近 1/6/24 小时触发正确的实际查询范围；中部两张趋势图完整占据图表区域，窄屏顶部事件独立成一行。移除通用的「知识库业务操作不受影响」横幅，概览、请求详情、日志失败分别准确提示；「近期事件」弹窗不得将最多 50 条概览记录冒称完整历史；请求父子 Span 用真实时间绘制瀑布条，未结束阶段不合成耗时；日志显示精确 Request/Span 范围与已加载数量，可清除筛选恢复全局，切换范围不呈现上一选择的日志。
5. 并发诊断请求不中断正常页面加载；一次临时 5xx 或非取消传输错误可在原范围内有限重试后恢复，权限/无效请求不自动重试，切换请求或离开页面能取消旧请求，真正持续失败仍明确提示且不冒充空数据。

### A35-07 资源与长期故障压力

1. 在**1 GiB Linux amd64 Docker**、与正式运行相同的基础组件和固定工作负载下，记录启用 OTel Trace SDK 与 SQLite 前后的 RSS 峰值、CPU、P95 请求延迟、GC、Span/Exporter 队列和 SQLite/WAL/SHM 体积以及观测查询 P95；至少覆盖正常负载、突发并发、慢请求、轮转替代清理、多次重启和诊断库降级。
2. 第一轮性能工程门槛建议为新增常驻内存不超过 32 MiB、正常业务请求 P95 增量不超过 5%；若真实测试表明不可行，先 Review 原因、成本与影响，再调整方案，不能直接以文档目标代替数据或降低验收。不能以机器空闲时的单次 Smoke 宣称容量安全。
3. OTel Span 数量/属性/事件、BatchSpanProcessor 队列、常驻 SQLite 写队列、时间桶、事件缓存和查询并发都有可验证边界；默认不会从第三方自动插桩采集脚本、Cypher 或用户内容。日志/资源暴涨不能让观测系统自身触发 OOM 或严重拖慢 Kernel。测试须使用隔离的临时 Instance/Volume，不向生产或长期 Dev 注入故障。

### A35-08 集成、Review 与完成证据

1. Mac 上运行相关 Go 单测/竞态、SDK/Web Vitest、Playwright、Markdown/链接/拼写/格式和现有 `pnpm validate`，检查新增 OpenTelemetry Go 依赖版本/许可证、Span Context 关联、Exporter 白名单与超时、私有字段红线、存储迁移、旧 API/认证、streaming、故障复原和最终 `git diff --check`。
2. 按 [D94](../../design/decisions.md#d94-openclaw-docker-development-and-ci) 在 OpenClaw **隔离 Linux amd64 Docker/临时 Volume** 验证真实 API/MCP/SDK、授权、重启历史、存储故障、内存压力与非 root 文件权限；不在 Mac 运行 Docker，也不破坏长期 Dev。
3. 完整阶段验证需在**最终实施 revision**上取得现行公开 Ubuntu Validate + Docker CI 的成功证据；Commit、Push、Release、部署分别遵守授权，不把旧 Phase 19 CI 证明成新阶段通过。Review 所发现的范围内问题修复并复验，记录命令/版本/环境/结果与未验证例外。

## Review 特别关注

| 风险 | 检查方式 |
| --- | --- |
| 数据冗余与递归记录 | SQLite 是唯一常规持久化；stderr 仅应急；观测 API 自身不能循环生成“用户请求”或错误风暴 |
| 业务阻塞/内存压力 | 队列有界、SQLite 不在业务事务内、查询超时/取消、WAL 与清理空间真实验证 |
| 请求树伪关联 | ID 在开始时传播；不同 Operation/Span 不因相邻时间误归类；并发/中断可信呈现 |
| OTel / SQLite 双管道 | SDK 管理 Span 生命周期，Exporter 只负责安全投影；两层队列均有界，OnStart 不做同步 SQLite I/O，队列溢出/优雅停止的丢失状态真实可见 |
| 不受信的追踪输入 | 不接受客户端 `traceparent` 作为权威父级；禁止自动导出第三方 Span Resource/属性、事件或业务输入 |
| 敏感内容外泄 | INFO/DEBUG/应急 stderr、数据库字段、API JSON 都使用白名单，不记录脚本/Cypher/Patch/Token |
| 业务结果不真实 | HTTP 200、MCP Tool code、Kernel Commit 与可能副作用各自由真实层确定 |
| OOM 误诊 | 无可信宿主事件时显示原因未知；不能依赖退出码 137 独立判断 |
| 旧客户端与日志迁移 | 既有 diagnostics、Stream、CLI 输出、D97 历史文件及 Web/MCP 认证均保持边界 |

## 完成条件与当前证据

- **当前：`in_progress`。** P35-01–05 的主要代码与测试已落入本地未提交工作树；P35-06 的多轮 Review 和运行验证仍在进行，尚不具备 `done` 的全部验收证据。Phase 19 的 `done` 只代表其历史 JSONL/诊断摘要验收。
- **已完成的阶段性验证（2026-11-07，非最终 CI）**：Mac `pnpm check:go` 通过；Vitest 889/889 通过且分支覆盖率 90.13%；专项桌面、窄屏及树/日志联动 Playwright 已通过。OpenClaw 隔离 Linux amd64 1 GiB/1 CPU/非 root Container 用当前源码 `kgosd 0.3.17`、Lithograph 0.3.4（发布包 SHA-256 已核对）、离线构建 Jieba 成功初始化、真实 HTTP/MCP 查询及授权拒绝；`6000` 次请求 × `16` 并发均成功，初步 P95 中位数 96.18 ms，峰值进程 RSS 约 118 MiB；优先级队列改进后的诊断请求未完成数与事件丢弃数均为 0，OTel Span 在批处理结束后收敛为完整终态。已验证正常停止重启后的历史可读。
- **本地完整门禁与浏览器回归（2026-11-07）**：上一轮 `pnpm validate` 已通过前置安装/依赖、TypeScript、Lint/文档/秘密扫描、构建、Go 静态检查与全量测试、Go Race、Go 语句覆盖率 90.1%、Go 安全检查、Vitest 889/889（分支覆盖率 90.13%）、MCP Contract、TS Type Coverage、重复/无用代码检查；当时全量 Playwright 因并行 [Phase 36](36-host-neutral-mcp-oauth.md) 的 MCP OAuth Resource 已规范化为 `https://kgos.example.com/mcp`、旧 Setup 断言仍期待站点根地址而失败。现已**仅同步** `tests/e2e/setup-acceptance-helpers.ts` 的受保护 Resource 预期，Issuer 仍为 `https://kgos.example.com`，不回退 OAuth 服务合同；修正后的 Setup 10/10、**全量 Playwright 83/83 通过（无失败与跳过）**。`pnpm check:licenses`、`pnpm check:security` 与 `pnpm check:diff` 已独立通过。
- **修复后的本地整仓门禁（2026-11-07）**：在同步 Setup OAuth Resource 断言并新增破损诊断 SQLite 回归测试后，重新执行完整 `pnpm validate`，**退出码 0**。覆盖了依赖、类型、文档/拼写、安全与许可证检查、构建、Go 单测/竞态与覆盖率（语句 **90.1%**）、Vitest **889/889**、MCP Contract、TS Type Coverage、重复/无用代码、全量 Playwright **83/83** 与 diff。前述 77/1/5 为修复前的对照结果，已经不再是当前失败项。
- **最终源码隔离 Docker 再验证**：在临时且与长期 Dev/Prod 隔离的 Linux amd64 Docker lab 组装当前 `kgosd 0.3.17` + Lithograph v0.3.4 + Jieba；临时镜像 `sha256:ebdf7e8663a8d691da690813588e2e7e8abddc9d12765fa60d494cf93cc1e844`，1 GiB、1 CPU、非 root。新实例初始化，600 次 / 16 并发无错误（P95 96.243 ms），真实 MCP `kgos_query` 的 4 个 Span 与关联日志均通过受保护 API 回读，丢弃 0。该镜像由当前源码及官方校验过的扩展**隔离组装**，不应被描述为已通过正式发行 Dockerfile 的构建/CI。
- **故障矩阵运行实测（2026-11-07，隔离 Linux amd64 1 GiB，当前源码组装镜像）**：各场景使用单独的临时 Instance；诊断 SQLite **已损坏**及 `logs/` **权限拒绝**均实测业务 HTTP 200、历史诊断显式 `unavailable`，未破坏 `kgos.db`；独立 8 MiB tmpfs **磁盘写满**期间 260 次业务请求成功，诊断降级，释放空间后恢复（记录 1812 个丢弃事件）；外部 SQLite `BEGIN IMMEDIATE` **写锁冲突**期间 180 次业务请求成功，释放锁后诊断恢复（记录 256 个丢弃事件）；在真实未完整接收 HTTP Body 的请求开始事实落库后，对**该临时容器 SIGKILL**，待旧容器退出后从相同临时目录重启，`requests/get` 回读的对应请求仍为 `incomplete`、`finished_at=null`，且不合成 OOM 归因。额外在新 Instance 的诊断库预置 **97.76 MiB** 纯测试事件，容量策略淘汰 8191 条最老事件、220 次业务请求成功且无缺失请求终态，覆盖显示 `truncated=true`、`dropped=1120`。超预算测试后诊断主库/WAL/SHM 合计约 **101.92 MiB**：64 MiB 是 D126 的*工程软预算*，不是瞬时磁盘硬配额；此结果证明了淘汰与降级，**不能声称已硬限制物理文件在 64 MiB 内**。另新增了破损 SQLite 原字节及 `kgos.db` 不被覆盖的 Go 回归测试。测试环境没有持久 Dev/Prod 数据，故障恢复过程中未自行修改 Knowledge 或业务提交。
- **尚缺的最终验收证据**：故障场景及全量 Playwright 的既有缺项已经补测；1 GiB 测试使用隔离 Runtime *组装镜像*（当前 Linux 二进制 + 已核对版本的扩展），不等同于 `Dockerfile.unified` 生产构建及 Ubuntu GitHub CI。最终阶段验收仍需在最终实施 revision 上取得正式 Dockerfile 构建和公开 Ubuntu Validate + Docker CI 成功记录；本轮未经单独授权 Commit/Push，不以旧版 CI 代替。Phase 36 等并行开发的未提交修改必须保留。
- 功能、性能、安全、隔离 Docker、必要 CI 和 Review 均取得与交付源码对应的真实证据后，才能标 `done` 并同步路线、受影响的运行指南及各自 owner。若某类验证真实受阻，明确保留缺口而非把 `ready` 或局部实现称为交付完成。

### V2 排障工作区本地改版与复验（2026-11-07，未提交）

- **修改范围**：仅调整 `packages/web/src/features/observability/` 的标题与紧凑数据状态、近期事件弹窗（真实 overview 最多 50 条）、Request/Span 相对瀑布时间轴、精确日志范围/可见数量与字段展开；新增请求/分页切换的异步关联回归。布局与行为写入 [Web 设计真源](../../design/web.md#运行观测工作台d126phase-35-目标)。不新增后端 API、特权采集、监控服务或跨 Instance 权限。
- **最终 Web 验证**：Mac `pnpm typecheck`、定向 ESLint/Prettier 通过；最新 `pnpm test:coverage` **909/909**，TS 分支覆盖率 **90.03% ≥ 90%**；全量 Playwright **84/84** 通过，最后请求切换修复后又运行观测专项 Playwright **3/3** 通过。新加的定向测试包含异步旧分页返回不污染新请求。
- **合并工作树其它质量证据**：同一轮 `pnpm validate` 完成依赖、全仓 Lint、构建、Go 静态/功能/Race 与覆盖率（Go 语句 **90.1% ≥ 90%**），但命令运行达到 Nexum 执行会话 **10 分钟上限**，在开始 Go 安全扫描时被终止，**不报告整体 `validate` 退出码 0**。随后单独完成 Go 安全扫描（无发现漏洞）、Vitest/MCP 结果合同、类型覆盖率（99.79%）、重复/无用代码、Playwright、三语言许可证、npm 高危审计和 `pnpm check:diff`；npm 审计有 3 个低危、8 个中危告警，未触发 high 门禁。上述证据各自按实际执行和结果成立。
- **发布与阶段边界**：这些是当前本地未提交的 Phase 35/36 合并工作树证据，不是新的公开 CI、正式 `Dockerfile.unified` 测试或真实生产部署；完整阶段仍为 `in_progress`。保留 Phase 36 等其它现有修改，不自动 Commit/Push/Release。
- **顶部事件位置调整与复验（同日后续反馈）**：将系统事件移至 Web Header 中央，显示最新一条事件及受限历史弹窗；中部由三列改为双图，移除含「知识库业务操作不受影响」的通用橙色横幅，概览不可用时才给出区域错误，已载入但刷新失败或历史不完整时在顶部简短标示。Mac `pnpm typecheck`、全仓 `pnpm lint`、`pnpm test:coverage` **909/909**（分支 **90.04%**）、专项 Playwright **3/3**、`pnpm check:diff` 与 `git diff --check` 已通过；源码 Vite 临时预览代理到未重启的 5184 测试后端，5185 HTTP 200。该预览不是正式部署，阶段仍未达到最终公开 CI 验收。
- **时间范围选择器后续修复与复验**：原日历图标外层边框加原生 `select` 形成嵌套焦点边框，已替换为共享 Base UI Select 的单一 Trigger、值与箭头；保留语义化 Time range 标签与 1/6/24 小时服务端时间窗口。专门 Playwright 用例验证键盘打开/退出、三档值与 API 查询时间差，**4/4** 观测及导航浏览器用例通过；Vitest 新增真实 Select 回调、窗口计算、局部状态与事件 Dialog 交互覆盖，`pnpm test:coverage` **913/913**、分支 **90.11% ≥ 90%**，`pnpm typecheck` 与定向 ESLint 通过。本段为前述旧测试数字后的新增证据，不改变最终公开 CI/Docker 验收缺口。
- **诊断读取并发修复与复验（2026-11-08，本地未提交）**：删除独立的 `readSlots=2` 和 `ErrReadBusy` 立即拒绝路径，保留 3 个 SQLite 最大连接、2–3 秒 Context 截止及原分页范围；满连接池查询改为等待空闲连接或取消/超时。Web 的概览、请求列表、所选阶段与全局日志初次读取对临时 5xx/非取消传输错误至多重试一次，401 与主动取消不重试；旧请求范围仍隔离。新增连接池占满时的等待/取消测试、24 并发四路查询及 Web 临时恢复/取消/认证用例。实际执行 `pnpm check:go`、`pnpm test:go:race` 和 `pnpm test:go:coverage` 均退出码 0（Go 语句 **90.1%**）；`pnpm test:coverage` **917/917**（Web 分支 **90.12%**）、全仓 Lint、正式 Build、观测专项 Playwright **4/4**、`pnpm check:diff` 与 `git diff --check` 均通过。另在单独临时 Instance 上运行新构建的真实 Go HTTP：四项诊断只读 API **24 个并发调用全部 HTTP 200 / available**（各 6 次），完整清理临时 Instance；不把该隔离本地测试冒充 1 GiB Linux Docker/公开 CI。完整 Phase 仍为 `in_progress`。

### 日志可靠性专项 Review（2026-11-08，本地未提交）

- **本轮修改**：关键 Access、Tool、Kernel 业务结果、安全决策及 Runtime 生命周期日志不被 `KGOS_LOG_LEVEL=WARN/ERROR` 误过滤，使用既有有界关键队列；HTTP 外层按认证完成后的可信来源更新请求终态，并以固定 `operation` 区分已注册 API；Graph NDJSON 保留真实 HTTP 200，同时把后续终止错误和公共 code 记入请求结果；同一 MCP HTTP 请求先失败后成功时保留失败 Tool 的身份和 code。修正诊断 API 服务端错误的安全关联事件、SQLite/Lithograph 固定错误分类与启动/存储故障的有界 stderr 根因类别。未新建数据库、外部日志系统或增加不可信业务数据输出。
- **新增回归**：`internal/observability/logging_review_test.go` 覆盖 ERROR 级别的关键事件持久化、认证后 Web/MCP 来源、精确 API 静态标识、可选日志过滤、存储错误分类和 Stream 失败不可覆盖；`internal/daemon/logging_review_test.go` 覆盖 HTTP 200 后 Graph terminal error 的历史结果、观测查询自身失败的安全 Request ID/类别；原有关键队列和同一请求多个 Tool 的测试同步真实合同。Mac 执行 `go test -tags sqlite_fts5 ./internal/observability ./internal/daemon ./internal/lithograph ./internal/mcpserver ./cmd/kgosd` **退出码 0**。这仅为定向验证，仍须进一步核对最终合并工作树的 Go Race、其它质量门禁、隔离 Docker/正式 CI；尚不标记 Phase `done`。
- **后续专项 Review 与证据（同日）**：在现有执行树之外补充了普通 JSON API 公共错误码的安全记录，涵盖认证、参数解析与方法/格式拒绝，修复了注册端点 `/oauth/register` 被误认为静态流量的遗漏。新增 `internal/daemon/logging_http_errors_test.go` 验证 HTTP 401/400/406、嵌套安全中间件、真实 `error_code` 与不记录私密正文；运行 `go test -tags sqlite_fts5 ./internal/observability ./internal/daemon ./internal/kernel ./internal/mcpserver ./cmd/kgosd` **退出码 0**。此前本轮还已完成 `pnpm lint`、`pnpm test:coverage`、`pnpm check:diff`、Go 全仓语句覆盖率 **90.1%**、`pnpm test:go:race` 和浏览器 Playwright **85/85**（退出码均为 0）；这些证据**先于本段最新小修改**，最新源码仍需做针对性的最终门禁回归。最终 Dockerfile/公开 CI 仍未验收，不据此宣布 Phase 完成。
- **末轮日志归属 Review 与验收**：对照 Setup Controller 的实际四条路由，补齐 `setup.status`、`setup.rotate-token`、`setup.initialize`、`setup.validate-embedding` 的安全静态操作标识，并让 `SetupError` 的公共错误码随请求日志回读；新增对应成功/错误分类测试。最后一次源码修订后重新运行 `pnpm check:go`、`go test -tags sqlite_fts5 -race ./internal/observability ./internal/daemon ./cmd/kgosd`、`pnpm lint`、`git diff --check`，**全部退出码 0**。前一修订已独立通过完整 `pnpm test:go:race`、`pnpm test:go:coverage`（Go 语句 **90.1%**）和浏览器 Playwright **85/85**；末轮只补充安全静态路由分类与相应测试，没有改变业务接口/页面协议。日志专项本地 Review 未发现剩余阻断项；完整 Phase 35 的正式 Dockerfile/公开 CI 尚未重新验收，不因此标记 `done`。
