# Phase 38：Knowledge Relationship 写入优化与可恢复故障诊断

<!-- cspell:words noobserver mcpserver finalbusy ctxcancel savepoint ENOSPC enospc tmpfs TMPFS cpus -->

**状态：in_progress。** 当前未提交工作树已固定正式 Lithograph **v0.3.7**（2026-11-14）。v0.3.6 的 SQLite 主库页数配额错误覆盖缺陷已由上游修复，KG OS 正式包 Host/Kernel 等七包集成、Phase38 三包 Race 连续三轮及明确的 `RESOURCE_ERROR` / SQLite13 断言通过，实际目录与手册验证一致，详见末节。本轮在同一 v0.3.7 正式镜像上完成 Linux 1 GiB/no-swap 两轮最高档 Relationship 写入、31/31 SDK/MCP、诊断降级及 Mac 完整 `pnpm validate`，结果均通过；v0.3.6 的历史证据仅保留历史归属。当前工作树仍未 Commit/Push，未形成自身精确 SHA 的公开 CI，也未发布或部署 KG OS 镜像。已提交后 HTTP 响应遗失的真实提交回读与拒绝重复写入回归已通过；真实 Linux 文件系统 ENOSPC 已有独立验证，物理设备损毁不开展破坏性测试；当前源码 SHA 的公开 CI 仍未验收，故保持 `in_progress`。

## 目标与现状

解决 KG OS v0.3.20 一次 Object Patch 同时创建两个 Node 与一条 Relationship 时触发的生产事故中暴露的两个缺口：关系创建 Cypher 的低选择性扫描/笛卡尔积候选风险；进程 OOM/SIGKILL 后请求根 Tool 身份和关键数据库执行阶段缺失，难以从普通日志排查。

宿主 2026-11-09 OOM 事实与 1 GiB 峰值已确认；生产 Trace 表示多个 lithograph.execute 完成，最后一个执行未结束，main Head 在恢复时保持不变。低效计划和 OOM **存在强相关嫌疑但因果归因仍待隔离复现**。不得因新开发计划修改真实生产数据、重试原 Patch 或假定所有写入均失败。

唯一设计真源：[Object 内部关系编译](../../design/object.md#knowledge-relationship-的内部创建与查询成本)、[Observability 阶段记录](../../design/observability.md#patch-stage-diagnostics)、[Object Patch 既有事务合同](../../design/object.md#object-公共调用合同)、[MCP 错误与恢复](../../design/mcp.md#mcp-对外健壮性合同)；Graph 仍把使用者 Cypher 原样交给 Lithograph。旧事故基线是 Lithograph v0.3.4；当前未提交 KG OS 工作树已锁定正式 **v0.3.7** 并完成本轮 Mac 定向验证，但尚未发布对应 KG OS 镜像；v0.3.6 隔离验证按原记录保留。Lithograph 谓词优化由其独立 Phase 21 交付，**本阶段不直接实施另一个仓库的计划**。

## Features 与实施顺序

| 工作 | 交付与依赖 | 验收 |
| --- | --- | --- |
| P38-01 无副作用复现基线 | 以脱敏合成 Source/Claim/证据边构造与事故等形的多 Object Patch，固定当前模型/State/现行版执行计划与资源指标；避免对生产 main 重试 | A38-01 |
| P38-02 关系写入最小修复 | 内部 createKnowledgeRelationship 用先各自过滤端点、再 CREATE 的 Cypher；公共 SDK、alias、事务和数据模型不变 | A38-02、03 |
| P38-03 早期诊断事件 | MCP Tool 在入口绑定身份、Kernel 写 Operation 开始/阶段、已有 Lithograph Span 的安全 query_family 与 db_call_seq、Web 最后阶段展示；终态与业务结果不伪造 | A38-04、05 |
| P38-04 资源与 stderr 兜底 | 安全、限流、低开销的极少量 Docker 应急摘要；现有 SQLite 唯一完整诊断库、资源快照与丢失状态仍准确 | A38-05、06 |
| P38-05 Lithograph 集成与端到端 | 核对 v0.3.7 独立正式制品并固定依赖；本轮 Mac Host/Kernel、容量错误断言及手册已验证，Docker/完整 MCP 等门禁按末节各版本实际证据维护 | A38-07 |
| P38-06 全量验收及 Review | Mac 质量、OpenClaw 隔离 Docker、生产等形内存/终止故障、正式 CI、诊断操作指引与最终 diff | A38-08 |

## Acceptance

- **A38-01 复现可信**：固定匿名 fixture、输入 Patch 结构、真实 Base Commit、Ontology/Binding 数、Node/Relationship 数、Lithograph 镜像版本、容器内存限制、请求/Trace 与资源峰值；旧故障的直接 OOM 与创建路径的性能嫌疑分别呈现。旧查询大图实验必须有资源上限，禁止盲目在生产运行。
- **A38-02 正确关系**：同 Patch 创建两个新 Node、一条依赖新 alias 的关系；已有端点、自环、仅关系 Add、混合 Ontology + Knowledge、关系 Type/属性均按现有公共合同得到准确的 created Ref。不得引入独立图写提交或新的公共参数。
- **A38-03 失败原子性**：缺失/错误端点、冲突、Constraint/Schema 拒绝、中途取消/资源错误/超时、同 Branch stale base 保持原错误与完整回滚；必要时从 Branch Head/History/State 真正回读，不能以日志终态决定是否已写入。
- **A38-04 不完整请求可定位**：Tool started 在成功/参数错误/未返回/进程 SIGKILL 后能尽可能按 request_id、trace_id、run_id 和固定 Tool 名阅读；已持久化的开始 Tool 不会变成空。Kernel stage、Operation ID 和已有 Lithograph Span 中的 query_family 与单 Operation 的 db_call_seq、真实调用序列在终止后保留最近已写入证据，受保护 API/Web 能按 Request ID 呈现；不把 incomplete 当 failed 或 committed，不凭 Span 数推断崩溃语句。
- **A38-05 关键事件与日志安全**：ERROR 级别仍保留少量关键 started/阶段记录；终态事件优先、阶段可合并，新的阶段日志不能挤掉确定的业务结果；安全白名单阻断 Token、Patch/Cypher/JS 正文、对象名称/来源、未清洗错误、绝对路径和任何完整请求；多 Tool/多 Operation 与跨重启的归属准确。后台诊断库不可用、队列满、静态/轮询和日志截断状态清晰，独立错误不递归。
- **A38-06 业务不被诊断拖累**：单写入有界队列、非阻塞 OnStart 和 stderr、无请求路径诊断 SQLite 等待，无业务库与诊断库同事务；1 GiB/no-swap Linux 压力下记录 OTel/队列/SQLite/WAL、CPU、RSS、P95、stderr 增量和事件丢失。用户写入不得因日志失败被拒绝/重试；必要的关键阶段不能被高频普通日志挤掉；同机同负载测量诊断有无启用时的 P95/RSS，并验证终态在阶段高压下优先保存。意外 SIGKILL 可能导致最后一条未 flush，必须报告实际 coverage，不作审计级承诺。
- **A38-07 跨版本真实集成**：Lithograph 自己的版本已完成其查询优化、真实 SQL 扩展/兼容/内存验收且正式制品核验通过，KG OS 才升级固定依赖和 MCP Cypher 文档；不得凭设计/commit 推定已发布。KG OS 单独使用旧依赖的关系 SQL 修复可先独立验收，但与最终底层版本的集成门禁不能省略。
- **A38-08 交付门禁**：Go 定向/Race、原有语句覆盖率和完整 pnpm validate、SDK/MCP 错误合同、Web 观测页、实际 Dockerfile Linux amd64、1 GiB synthetic stress/kill/重启、真实诊断 API 按 ID 读取、公开 CI、必要使用指引、敏感信息 Review 与最终 diff 均有此次最终源码的通过记录后才标 done。Commit、Push、Tag、Release、部署各自按独立授权执行。

## Review 与完成判定

逐一检查失效求值语义、双端点候选重复、staged read-back、事务中断及真实不完整日志；对每项发现采用最小改动并重验受影响门禁。重点复核在 OOM 之前是否留下足以缩小范围的日志、是否没有泄漏正文和日志自身是否导致新的内存或数据库锁负载。即使完整通过，也不承诺绝对零 OOM，只能对测得版本、规模和限制负责。

P38-05 只接受已发行且通过独立核验的底层版本；当前 v0.3.7 已完成正式制品核验与本轮 Mac 定向联测；此前 v0.3.6 的隔离 Docker 联测为历史证据，后续门禁不由版本号推断。生产故障记录的补充或更正需要针对当前知识库的明确授权及真实回读，不随本计划自动写入 KG OS Prod。

## 2026-11-10 v0.3.4 历史开发与验收记录（未结项）

本轮验证对象为 Yi Mac KG OS 仓库的 main@2d06a06 加当前**未提交工作区**，并非已有 Release；容器镜像 kgos-phase38-isolated:local 在 OpenClaw Linux amd64 由该工作区的独立同步副本构建，固定 **Lithograph v0.3.4**。测试副本位于 /data/apps/KgosDev/validation/phase38-20261110-isolated/，全部业务写入使用独立临时 Docker Volume，不碰长期 Dev 或生产 Instance。正式 Dockerfile.unified 未修改；OpenClaw 缺少默认 docker0 设备，构建使用 host 网络，且仅在隔离目录的临时 Dockerfile 对 Web builder 增加 npm 代理声明；这属于宿主构建网络适配，不是产品运行配置。

| 验收目标 | 实际结果 | 未闭合边界 |
| --- | --- | --- |
| A38-01 事故等形复现 | `scripts/phase38-query-baseline.py` 用已发布 Lithograph v0.3.4（SHA-256 `eee552c633df971e6a020f377c6df8d8f6884647f94c51c56f1343388ab78f83`）、SQLite 3.51.0、匿名 80 Node 内存图和固定两个 Node ID 实测旧查询 `LabelIndexScan → Cartesian → LabelIndexScan → Filter` 为 **12,960 dbHits**，两段 MATCH + 各自 WHERE 为 **320 dbHits**，返回结果相同；测试只在小规模执行旧 Cartesian。另以实际 v0.3.4 在 **505 Binding + 752 Knowledge Node** 同一私有临时 Fixture 执行关系创建与诊断，不碰生产 | 事故语义是 Source/Claim/证据边，本 Fixture 用合成 Person/KNOWS 与相同 Patch 依赖形状；历史生产 OOM 的唯一根因未得证，不能从小样本直接推导大图加速比例 |
| A38-02、03 关系及原子性 | 两段 MATCH 分别约束端点，在一个 Object Patch 事务内创建关系；Mac 真实 Lithograph 定向集成覆盖新别名、已有端点、自环、错误端点、stale 与 State 回读；同一最终源码复跑 Phase 04 混合 Ontology/Knowledge、取消请求、关系替换、缺失端点回滚及 Phase 37 同 Branch 竞争六组集成测试全部通过；Linux MCP 写入后按 State 核对实际 Node/Relationship 数量，拒绝后 Branch Head 不动 | 提交过程中精确中断/超时及完整约束冲突注入仍需专项实测，不能拿请求开始前已取消代替中途取消 |
| A38-04、05 诊断恢复 | MCP Tool started、Operation/阶段、query_family/db_call_seq、受保护 API 与 Web 已实现；Mac ERROR 级别、20,000 阶段事件优先级、真实 SIGKILL 后不完整请求已有回归；在 Linux amd64 1 GiB/no-swap 容器内 6 项 Phase38 观测测试（含子进程真实 SIGKILL）全部通过；Linux ERROR/INFO 能按 Request ID 取得最后持久阶段和数据库 Span，未泄露测试消息 | 未持久化事实不承诺恢复；诊断不代表已提交 |
| A38-06 关系压力 | scripts/mcp-phase38-stress.mjs 在 Linux amd64 执行 752 节点 ERROR/INFO、1502 节点 INFO 三组，各 30 次串行关系 Patch、32 次 8 Branch 并行关系 Patch，加回滚、诊断 API、SIGKILL/重启。实际 cgroup memory.max=1073741824、memory.swap.max=0；三组均 oom_kill=0、诊断 dropped=0。cgroup 峰值分别为 **196567040 / 195391488 / 212062208 bytes**；串行 P95 **133.12 / 127.76 / 169.16 ms**，并行 P95 **1668.91 / 1298.62 / 2127.01 ms**。stderr 总量为 9972 / 9770 / 10376 bytes，未含测试 Patch/Message | ERROR/INFO 是日志等级对照，**不是**关闭诊断/开启诊断的同负载对照；相关资源开销验收仍待证 |
| A38-06 大模型并发回归 | 当前 Phase 38 镜像复跑既有 scripts/mcp-phase37-performance.mjs：5 Domain + 50 Definition + 450 Property = **505 Binding**，341 次受追踪请求、意外失败 0；串行 30 写、2 并发 60 写、8 并发 240 写、同 Branch 8 竞争一胜七 stale；8 Branch 吞吐 **7.40 writes/s**、cgroup 峰值 **337149952 bytes（321.53 MiB）**，OOM Kill=0；纯 Knowledge Add/Update/Delete 底层调用数仍为 **17/19/20** | 该组主要是 Knowledge Node/本体操作，不冒称混合 Relationship 事故负载 |
| A38-08 本地与 Linux 基线 | Mac 当前代码的 pnpm validate 退出码 0：Go 语句覆盖率 **90.2%**，Web 分支覆盖率通过，Playwright **85/85**，jscpd **0 clones**，Go Race、许可/安全与文档门禁通过。OpenClaw Linux amd64 单进程隔离镜像通过 **31/31 SDK**、OAuth 重启/刷新/撤销、持久化与清理。新增压力脚本通过 node --check、Prettier、ESLint、重复代码检查 | 本地验证不能替代正式 Ubuntu Validate + Docker CI；后续源码变化须重跑受影响门禁 |

### 本轮补充的真实故障/性能证据

- **组合事故规模**：`scripts/mcp-phase38-stress.mjs` 使用 `KGOS_PHASE38_BINDINGS=505`、`KGOS_PHASE38_NOISE_NODES=750`，同一个临时 Instance 实际建立 5 Domain、50 Definition、450 Property（505 Binding）、752 Person Node，再创建多次两新 Node/一关系 Patch。启用诊断时 20 次串行关系写入 P95 **318.85 ms**、8 Branch 共 32 次并行写入 P95 **2981.95 ms**，cgroup 峰值 **413.79 MiB**、`oom_kill=0`、诊断 dropped=0；初始关系真实 Ref 与最后 Branch State 可回读，SIGKILL 后 State 和诊断仍保留。
- **无诊断持久化降级对照**：同镜像、同 505 Binding/750 个无关 Node/20+32 次写入、同 1 GiB/no-swap，独立临时 Volume 故意使 `.kgos/logs` 不能初始化；业务仍成功、错误回滚正确、观测 API 返回 `availability="unavailable"`，SIGKILL 后重启业务 State 不变。串行/并行 P95 **331.04/3890.68 ms**、cgroup 峰值 **400.20 MiB**、`oom_kill=0`。这是**持久诊断正常/不可用**的对照，不等同完全关掉 OTel/Observer，也不能仅凭单次性能差值推断诊断开销比例。
- **更轻的重复对照**：752 Node、30 串行 + 32 并行 Patch，启用/不可用/启用三轮，串行 P95 分别 **141.58/132.08/122.67 ms**，并行 P95 **964.55/1514.78/1535.77 ms**，内存峰值 **305.79/298.80/330.52 MiB**；全部成功、无 OOM。并发 P95 波动较大，不能将一次有无诊断的比值概括为固定开销。
- **持续 Review 回归**：新增真实旧 `spans` 表结构升级测试，确认新 `query_family/db_call_seq` 列默认值与旧 incomplete Span 均保留；多 Operation 下序号从 1 重新开始、`query_family` 严格白名单、最近已保存阶段不跨 Operation 串联。`internal/daemon/observability_routes.go` 已修复未绑定 Store 时直接访问的空指针风险；四个保护 API 返回 unavailable，`/api/v1/system/diagnostics` 仍能读取当前进程指标，现有认证不改变。Mac 的以上定向/Race 测试已通过；最终全仓质量门禁复核见下文。
- **只读操作指引**：[Object Patch 关系写入故障排查](../../guide/relationship-patch-diagnostics.md) 介绍 Request/Trace/Operation、`last_stages`、可信 Docker cgroup/OOM 证据和 Branch State 回读，不引导无证据重试。

本机基线可通过 `/opt/homebrew/bin/python3.14 scripts/phase38-query-baseline.py .cache/lithograph/v0.3.4/darwin-arm64/lithograph.dylib` 复跑；Linux 1 GiB 压力脚本必须在 OpenClaw 以独立 Volume、隔离镜像运行。两项脚本的旧查询只在 80 Node 上执行，不可把危险的旧 Cartesian 语句放到生产数据库做负载实验。

### 2026-11-10 最终工作树的质量门禁增量

- 当前源码入口新增 `pnpm test:docker:phase38`，由 Linux amd64 下的 `KGOS_PHASE38_IMAGE` 指向独立镜像，默认运行受限的关系写入/诊断/重启测试；已在 OpenClaw 用该**正式脚本入口**运行并通过，实际限制为 1 GiB、无 Swap、Node/Relationship 结果和 Branch Head 回读正确、`oom_kill=0`、诊断覆盖无丢失，临时 Volume 与容器已清理。该命令并不部署长期 Dev。
- 加入该入口前，完整质量门禁先后抓到压力脚本 Docker 字段拼写和 Knip 未引用脚本两项问题。前者仅添加固定模板字段的局部 cspell 忽略，后者将脚本注册到 `package.json`；没有放宽全局拼写、Knip、重复代码或测试阈值。两项定向检查之后均通过。
- **重新运行最终源码 `pnpm validate`：exit 0**。真实 Go 全仓 Race、Go 语句覆盖率不低于 90%、Web 分支覆盖率 **90.22%**、TypeScript type-coverage **99.79%**、Playwright **85/85**、零重复代码、Knip、MCP 协议测试、文档、许可、构建与 diff 门禁均通过。NPM Audit 显示当前无 High 及以上漏洞；非阻塞的 8 个 Moderate、3 个 Low 仍按现有依赖安全政策披露，不伪称无任何依赖告警。上述均为当前 Mac 工作树测试，**不是**公开 `kg-releases` CI。

公开 CI 需要在推送的精确 Git SHA 上执行；Commit、Push、Tag、Release 和 Dev/Prod 部署仍未授权，均为**未执行**。2026-11-10 14:50（UTC+8）重新核对 Lithograph 独立仓库：Phase 21 **本地实现与验收已标记 done**，但工作区代码仍未提交、推送、Tag 或 Release；经只读查询 origin 远端，最新正式 Tag 仍为 **v0.3.4**。因此不能将其未发行的 NodeIdSeek / Predicate Routing 优化当作 KG OS 已锁定的依赖；A38-07 仍待真实发布制品联测。压力测试观察到 OOM 为零，只能对实测负载负责。

### 2026-11-10 约束冲突原子性补强及完整复验

- **A38-03 补强**：`internal/kernel/relationship_write_phase38_integration_test.go` 新增真实 v0.3.4 Lithograph 测试 `TestPhase38RelationshipConstraintFailureRollsBackStagedGraph`。同一个 Object Patch 先暂存两个 Person 节点和第一条 KNOWS 关系，第二条关系使用相同 `key` 触发 Relationship UNIQUE Constraint；实测返回 `CodeConstraint`（公共错误码 `CONSTRAINT_ERROR`），`branch/main` 的 Head 仍为原模型 State，按该 State 查询 Person 和 KNOWS 的计数均为零。不是只在事务前拒绝无效输入，也没有修改公共 API。**精确中途取消/超时、Commit 期间资源故障仍未专项注入**，不可将此项直接标为全部完成。
- **本轮定向回归**：新用例单独在 Mac 原生 v0.3.4 环境执行通过；`go test -race -tags=sqlite_fts5,lithograph_smoke -count=3` 对两项 Phase 38 Relationship 集成测试重复三轮通过；新测试已 `gofmt`，`git diff --check` 通过。
- **本轮最终源码完整质量门禁**：用仓库固定 Node **24.15.0**、pnpm **10.34.5** 重新执行 `pnpm validate`，实际 **exit 0**；Go 全仓 Race 通过、语句覆盖率 **90.2%**，Vitest **95 个文件 / 932 项测试通过**，Playwright **85/85**，TypeScript 类型覆盖率、静态检查、构建、许可、密钥与 diff 检查均通过。依赖审计无 High/Critical，仍有 **8 Moderate + 3 Low** 非阻塞告警。此结果验证当前 Mac 未提交工作树，**不替代** Linux 发行镜像或公开 CI。此前 Linux 1 GiB/no-swap 合成压力和真实 SIGKILL 证据仍适用于未改变的生产执行路径；本轮新增的是测试及本条验收记录，未改变镜像生产代码。
- **阶段状态仍为 `in_progress`**：A38-07 Lithograph Phase 21 正式发行制品联测、最终精确 Git SHA 公开 CI、精确中途资源故障矩阵，以及完整诊断开启/完全关闭的同负载对照尚未满足。本轮未提交、推送、发布或部署。

### 2026-11-10 Lithograph v0.3.5 正式制品集成与压力复验

**验证版本与边界**：Yi Mac KG OS `main@2d06a06` 加当前未提交工作树，正式 Lithograph **v0.3.5** 已发行并锁定于 `scripts/lithograph-artifacts.mjs`、`Dockerfile.unified` 和 `internal/lithograph/types.go`，同时更新 MCP Cypher 手册及函数/Procedure 清单。正式 macOS arm64 发行归档 SHA-256 为 `dbfe9c40bea4231f6aeda0b445f967640817ded83f3a8d9c3914c68710f2b779`，Linux x64 为 `504b6dd3321007abdd4d7aff2a87ab3219518b39fec583662debea7f6fa8f7dc`；两者均已真实下载校验。其他平台的哈希来自 Release 元数据，不冒称已运行。上述是未发布的 KG OS 本地源码依赖，不代表长期 Dev/Prod 已升级。

| 验收 | 实际 v0.3.5 证据 | 覆盖边界 |
| --- | --- | --- |
| A38-01 查询基线 | `scripts/phase38-query-baseline.py` 在相同 80 Node 和端点下实测旧/新两种 Cypher：v0.3.4 的 dbHits **12960/320**，v0.3.5 均为 **6**，结果一致。v0.3.5 两端均采用 NodeIdSeek；旧计划仍可能显示 Cartesian，但执行不再放大无关 Node 扫描 | 小样本读计划不是历史生产 OOM 唯一因果证明 |
| A38-02、03 正确写入与原子性 | `node scripts/test-lithograph.mjs` 的真实 v0.3.5 Kernel/Daemon/Runtime 集成通过；Phase38 Relationship UNIQUE 约束拒绝时整批 Node/Relationship/Head 回滚，且 `post_schema_relationships` 阶段被持久化后再主动取消，仍不移动 Head。相关集成三轮 Go Race 通过 | Commit 期间真实 I/O 故障、精确时间点超时仍未全矩阵注入 |
| A38-04、05、07、08 正式 Docker 和 MCP | OpenClaw 隔离目录 `/data/apps/KgosDev/validation/phase38-v035-20261110-final/` 原样 `Dockerfile.unified` 成功构建 Linux amd64。和临时网络适配构建产物的 kgosd、Lithograph、Provider SHA-256 全部相同。正式 Dockerfile 镜像 1 GiB 下 **31/31 SDK 方法**、OAuth restart/refresh/revoke、非 root、单进程、无 Node Runtime、持久化和清理通过 | 这是隔离 Docker，不等于公开发行 CI 或生产部署 |
| A38-01、06 事故语义回归 | 压测脚本增加 `KGOS_PHASE38_FIXTURE=source-claim`：在 505 Binding（5 Domain、50 Definition、450 Property）+ 750 无关 Node 的 752 业务 Node 中，执行 Source → EVIDENCES → Claim 的 20 次串行与 8 Branch × 4 次并行 Patch。P95 **334.31 / 4174.70 ms**；cgroup 峰值 **291553280 B（278.05 MiB）**、oom_kill=0、诊断 dropped=0；SIGKILL 后 Head 和诊断保留 | 合成语义形状而非原生产对象正文 |
| A38-06 同机降级对照 | 同镜像、同 505 Binding/752 Node、20+32 写入，故意令独立诊断库不可初始化；业务可写、诊断 API 返回 unavailable、回滚和重启正常，P95 **328.13 / 3904.76 ms**，cgroup 峰值 **285528064 B（272.30 MiB）**，oom_kill=0 | 关闭了有效 SQLite/OTel 持久化和追踪，但**并非关闭全部进程内 Observer/Metric**；单轮 P95 波动不能推定固定开销 |
| A38-06 较大规模 | 相同 Source/Claim 形状扩到 505 Binding + **1502 业务 Node**，30 次串行、32 次并行关系 Patch。P95 **367.45 / 5203.07 ms**，峰值 **310988800 B（296.58 MiB）**，oom_kill=0、dropped=0，SIGKILL 后状态和诊断可读 | 实测限于受限合成负载，并非任意规模保证 |
| A38-06 大模型非关系回归 | `scripts/mcp-phase37-performance.mjs` 在 505 Binding 下复跑 8 Branch **480 次 Add/Update/Delete**，吞吐 **7.12 writes/s**，cgroup 峰值 **347.68 MiB**，oom_kill=0，同 Branch 冲突和 State 检查通过 | 属于 Ontology/Knowledge 回归，不替代 Relationship 压测 |
| A38-08 本地质量 | v0.3.5 最终代码及 Source/Claim 压测脚本更新后，使用 Node **24.15.0**、pnpm **10.34.5** 重新执行 `pnpm validate` **exit 0**；Go Race、statement **90.2%**、Vitest **95 文件/932 项**、Playwright **85/85**、类型/格式/安全/许可/MCP 文档/diff 全部通过。NPM Audit 无 High/Critical，仍有 8 Moderate 和 3 Low 非阻塞告警 | 本地全量门禁不能代替最终 Git SHA 的公开 CI |

**跨版本真实数据复核（A38-07）**：在同一个独立临时 SQLite 文件中先用正式 v0.3.4 扩展创建 Source → EVIDENCES → Claim 并记录 immutable Commit，再使用正式 v0.3.5 扩展重新打开旧库；旧 Commit 的一条关系可以读取，新写入形成新 Commit 且旧历史仍为原一条，新 State 为两条。针对同一个旧 State 的 `graphView.requireAnyLabels`，Source/Claim 同时可见时返回一条，只允许 Claim 时返回零条，验证了历史关系和端点诱导的 Graph View 语义。测试结束自动删除临时数据库；没有以重建测试库冒充跨版本读取。

**同机重复对照（A38-06）**：在第一次诊断 enabled、诊断库 unavailable 两组之后，使用相同正式镜像及 505 Binding/752 Source/Claim Node 的 **20+32** 负载再次运行 enabled；P95 **330.04/4498.07 ms**，cgroup 峰值 **301223936 B（287.27 MiB）**，oom_kill=0、诊断 dropped=0，SIGKILL 恢复成功。两次 enabled 的并发 P95 分别是 **4174.70** 和 **4498.07 ms**，降级对照为 **3904.76 ms**；不能从三次有波动的测量推断固定百分比开销。更新测试脚本之后，旧默认 Person/KNOWS 形状的 32 Node 隔离小负载也已实际通过。

**最终 Review**：逐项核对 Object Patch 新 alias、关系两端过滤、事务失败回滚、诊断 Tool/Operation/Span 归属、字段白名单、终态队列优先、SIGKILL 恢复、正式发行制品 Hash、MCP 文档绑定与测试数据隔离；以上已验证范围没有发现新的待修复代码缺陷。保留下面明确列出的未通过门禁，不把“review 无新 finding”扩展为任何规模绝不会 OOM 或系统不存在缺陷的保证。

**结项判定**：Lithograph v0.3.5 发布前置、真实制品锁定和 P38-05 集成已通过；Source/Claim 语义合成与多规模关系压力也已覆盖。A38-03 的 Commit 阶段资源/超时精确故障矩阵、A38-06 完全关闭进程内诊断的严格同负载实验仍保留为未验证，不能用诊断库不可用替代。A38-08 的公开 Ubuntu Validate + Docker CI 必须在获授权提交和推送后的**精确 Git SHA** 上验收。本轮未动生产数据，未 Commit、Push、Tag、Release 或部署。

### 2026-11-10 Commit 真实 I/O 失败与诊断彻底断开对照

**A38-03：真实事务的三种 Commit 边界失败（Go Race × 3）**。新增 `internal/lithograph/phase38_commit_failure_integration_test.go` 的 `TestPhase38CommitBoundaryFailuresKeepUnpublishedState`，每次在独立临时数据库、固定 Branch Head 的显式事务中真实暂存 `Phase38Source → PHASE38_EVIDENCES → Phase38Claim`，并在本事务中读到一条边，然后分别注入：

- `deadline_after_stage`：暂存完成后，传入已到期的 Commit context，确认返回 `context.DeadlineExceeded`；显式 Abort/Close 后 Branch Head 未移动。
- `lost_write_connection`：在 Commit 边界让 `database/sql` 丢弃底层写入连接；Commit 返回错误，不能复用残留的 staged transaction。
- `query_only_commit`：在已经暂存数据的同一个 SQLite 连接上设置 `PRAGMA query_only=ON`，**真实执行** `lithograph_tx_commit()` 得到 `LITHOGRAPH_IO_ERROR: attempt to write a readonly database`；不是仅提前取消调用。

上述三个场景均对同进程 Head、Relationship Count、Host 关闭及**数据库重新打开后的 Head 与 Relationship Count**进行回读；写入均未部分发布、全新写入可恢复成功。实际 `go test -race -tags=sqlite_fts5,lithograph_smoke -count=3` 相关测试退出 0。原先尝试在 staged write 之后通过第二个 SQLite Writer 抢锁的测试**失败**：当前 Lithograph 已持有 SQLite Write Lock，竞争 Writer 自己提前返回 `database is locked`，不是 Commit 失败，故未保留该错误的故障模型。精准让 Commit SQL *执行期间*发生 `context.DeadlineExceeded` 或物理磁盘损坏尚无稳定复现；不能把这三项扩大解释成完整介质故障矩阵。

**A38-06：真正断开请求诊断的同机 A/B/A 负载**。在 `/data/apps/KgosDev/validation/phase38-v035-20261110-final/` 的专用测试目录中，复制已验收的源码形成临时变体 `src-diagnostics-off`，仅在测试副本的 `cmd/kgosd/main.go` 断开 Store 初始化和 `observability.WithObserver(ctx, observer)`；不修改 KG OS 正式源码、公共参数、配置或生产镜像。仍通过相同 `Dockerfile.unified` 构建，Lithograph/Provider 二进制 SHA 与正式镜像一致。仅 `KGOS_PHASE38_DIAGNOSTICS=off` 和测试镜像名 `kgos-phase38-v035-noobserver:local` 搭配时压测脚本允许此模式，并通过诊断 API 返回 `unavailable` 验证关闭效果；不是正式运行时可配置的模式。

| 同一受限环境、合成负载 | Off 第 1 轮 | On（正式镜像） | Off 第 2 轮 |
| --- | ---: | ---: | ---: |
| `Source → EVIDENCES → Claim`，505 Binding / 752 Node | 20 串行 + 32 并发 | 20 串行 + 32 并发 | 20 串行 + 32 并发 |
| 串行 P95 | 318.38 ms | 315.57 ms | 321.70 ms |
| 8 Branch 并发 P95 | 4011.81 ms | 3390.24 ms | 3508.62 ms |
| cgroup memory.peak | 268.40 MiB | 285.86 MiB | 281.36 MiB |
| CPU 采样峰值 | 324.90% | 333.70% | 347.31% |
| 诊断 dropped | 无 Store，不适用 | **0** | 无 Store，不适用 |
| stderr 总量 | 74 B | 11184 B | 74 B |
| `memory.max` / `memory.swap.max` | 1 GiB / 0 | 1 GiB / 0 | 1 GiB / 0 |
| OOM Kill、失败回滚、SIGKILL 后 Head 回读 | **0 / PASS / PASS** | **0 / PASS / PASS** | **0 / PASS / PASS** |

三轮在同一 OpenClaw amd64 宿主、相同正式 v0.3.5 数据库引擎和同一负载参数下**顺序执行**，每轮独立 Volume、无生产数据；Off 两轮使用专用测试构建，On 使用已通过原样 Dockerfile 构建和 31/31 SDK Smoke 的正式镜像。此对照比 `unavailable`（诊断库无法初始化，但仍保留部分进程内 Observer）更严格，证据显示 **未观察到诊断开启引起确定性的 P95 恶化**；内存差异仍包含容器启动、堆、OS 缓存和执行波动，不能推定固定百分比。On 的 SQLite/WAL 实际持久化、最终阶段和数据库 Span 均已回读，Off 不伪造诊断事件。当前 A38-06 的“启停对照”已取得对应证据，无需添加产品运行时新开关。

**仍待验收**：本阶段当前未提交、推送、Tag、Release、部署；`A38-08` 要求的**最后精确 Git SHA 的公开 Ubuntu Validate + Docker CI**尚无法由本地/隔离 OpenClaw 代替。极端时间点的 Commit SQL 内部超时、真实物理磁盘损坏也未专项稳定复现。未经上述必需门禁的真实通过结果，不得将 `in_progress` 改为 `done`。

### 2026-11-10 真实写入中途 SIGKILL 及 1 GiB 测试进程压力边界

**A38-03、04 新增真实在途 Crash/Recovery**：`internal/kernel/phase38_live_sigkill_integration_test.go` 新增 `TestPhase38SIGKILLDuringStagedRelationshipPatch`。独立临时 KG OS Instance 内，由真实 `Kernel.PatchObjects` 在**单个显式事务**中暂存 2 个 Node + 300 条 `PHASE38_EVIDENCES` 关系；直到另外的诊断 SQLite 已将 `business.operation.stage=read_back`（所有关系已进入事务，但尚未确认 Commit）和对应 `kgos_mutate` Tool ID 持久化后，父进程才对正在执行 Patch 的子进程发送真正的 SIGKILL。没有清理回调或正常关闭；重新打开**同一个数据库文件**后，按当前 Head 查询 Node/Relationship 数量，拒绝半提交，只允许完整回滚或完整提交，并检查诊断 Tool 身份仍在、请求为 `incomplete`、最近持久化阶段可读，以及新写入继续可用。该用例实际 **Mac Go Race 连续 3 轮通过**，三次都在提交前保留原 Head、0 个 Node 和 0 条 Relationship，没有误报为已完成。

**Linux amd64 真实扩展复验**：测试源码只同步到 OpenClaw 专用隔离 `src`，从已验收的 `kgos-phase38-v035-unified:local` 镜像提取真实 v0.3.5 Lithograph、Provider 和 Jieba `.so`；`kgos-phase38-builder:local` 使用 Go 1.27.3、`CGO_ENABLED=1` 与 SQLite FTS5，**1 GiB / 0 Swap** cgroup 内执行同一真实 KG OS 子进程 SIGKILL 测试。单轮 Go Race 通过；不带 Race 的测试二进制在**同一进程连续 3 轮**通过、`memory.peak=530477056 B（约 506 MiB）`、`oom_kill=0`。以上都是本阶段独立临时 Volume/DB，与长期 Dev/Prod 隔离。

**不可忽略的测试插桩压力**：Go Race 二进制在**同一测试进程 `-count=3`、1 GiB 限额**下，第 1 轮通过、第 2 轮被 OOM Kill，cgroup `memory.peak=1073741824`、`oom_kill=1`。为了区分编译器与运行时，已先在无 1 GiB 限制的独立 builder 中生成测试二进制再单独运行，**问题仍可复现，不能归咎编译器**。改为同一个 1 GiB 容器内**三次独立 Race 测试进程**后 3/3 通过，`oom_kill=0`，但 cgroup 峰值仍触及 1 GiB 且 `memory.events.max=76`；说明该插桩测试的内存余量不足，不能隐瞒。此前正式 `kgosd` 的 Source/Claim、505 Binding、752/1502 Node 的无 Race 压测均 0 OOM；本记录不把 Race 插桩测试进程的 OOM 推断为正式服务 OOM，也不宣称所有内存压力均已消除。后续若需要把 Race 测试放入 cgroup，应使用足够测试运行时内存；正式服务 1 GiB 验收仍在专用独立 Docker 镜像进行。

**全仓门禁的旁路不稳定测试修复**：复验 `pnpm validate` 第一次在 `TestOAuthConsentCodeCapacityNeverConsumesPendingApproval` 遇到预期 503、实际 200 的时间敏感失败。该旧测试在真实 SQLite 连续写入 `maxPendingOAuth` 条短期 Code 时依赖只有 1 秒的真实墙钟窗口，较忙宿主上部分 Code 会在断言前过期。只在 `internal/mcpserver/oauth_phase17_security_test.go` 的测试 Fixture 冻结 `broker.now` 为种子 `base`，断言容量后再显式推进到 `base+2s`；**未修改 OAuth 生产合同或实现**。该用例已普通 Go 连续 **6/6**、Race **3/3** 通过；全仓门禁重新执行结果以最终完整退出码为准，不用旧的失败记录冒充通过。

**本阶段仍未 Done 的准确含义**：上述真实业务在途 Crash、数据库恢复、诊断不完整证据、Commit 写拒绝和完整诊断关闭对照均已有直接验证。最后精确 Git SHA 的公开 Ubuntu Validate/Docker CI 未执行，真实物理磁盘损坏及精准 Commit 内部的异步 Deadline 边界仍非完全覆盖；这不阻止继续实现与本地复核，但不得提前报告已经跑过远端 CI、提交或生产部署。

**Race 重复运行的容量复验**：在 **2 GiB / 0 Swap** 的独立 Linux cgroup 中执行预先编译的同一个 Go Race 测试二进制，单个测试进程使用 `-count=3`，实际 **3/3 通过**，`memory.peak=1415344128 B（约 1.32 GiB）`、`oom_kill=0`。这证实该插桩测试的三轮进程内峰值超过 1 GiB，不代表正式非 Race `kgosd` 必须配置 2 GiB；仍保留对测试进程内存积累原因的审慎限定，不放宽正式产品 1 GiB 压力验收标准。

**A38-06 最大有界压力上限复核**：在 OpenClaw 的独立临时 Docker Volume 中，使用之前正式 `Dockerfile.unified` 构建且已通过 SDK/MCP 31/31 的 `kgos-phase38-v035-unified:local`，以 `KGOS_PHASE38_FIXTURE=source-claim`、`KGOS_PHASE38_BINDINGS=505`、`KGOS_PHASE38_NOISE_NODES=2000`、`KGOS_PHASE38_SERIAL=50`、`KGOS_PHASE38_PARALLEL=8` 运行当前脚本最高有界负载：5 Domain + 50 Definition + 450 Property（505 Binding）、**2002 个 Source/Claim Node**，50 次串行和 32 次并发 Relationship Patch。实际 `memory.max=1073741824`、`memory.swap.max=0`，串行/并发 P95 **404.24 / 5175.63 ms**、并发吞吐 **3.79 writes/s**、cgroup `memory.peak=342212608 B（约 326.36 MiB）`、`oom_kill=0`、诊断 `dropped=0`，错误端点及 Stale 回滚后 Head 不变、已持久化的最后 `commit` 阶段和 DB Span 可读取、SIGKILL 后 Head/诊断保留。本测试只证明已测规模内表现，不等于任意历史深度、任意并发或磁盘故障均可承受。

**最终全仓门禁（本轮补强后的工作树）**：Yi Mac `main@2d06a06` 加全部当前未提交改动，在 Node 24.15.0 / pnpm 10.34.5 / Go 1.27.3 / Rust 1.97.1 下，新增真实在途 SIGKILL 用例及测试专用 OAuth 时钟修正后，`pnpm validate` **真实 exit 0**。Go Race、Go 全仓 statements **90.2%**、Vitest **95 文件 / 932 测试通过**、Playwright **85/85**、TypeScript type-coverage、0 克隆、Knip、MCP 31 方法 / 134 页嵌入文档一致性、License、Secret、Diff 全部通过；npm audit 仍为 **8 Moderate + 3 Low** 非阻塞告警，没有 High/Critical。此处“完成”仅表示最后当前工作树的**本地代码和隔离验收**已通过，不代表已经 Git Commit/Push 或在正式公开 CI 上验证目标 SHA；Phase 38 状态仍为 `in_progress`。

### 2026-11-10 并发 INTERNAL_ERROR 风险复核与压测脚本补强

- **历史单轮失败，尚未归因**：在正式 Lithograph v0.3.5 与 Phase 38 已修改的 KG OS 镜像 `kgos-phase38-v035-outcome:local` 上执行 505 Binding、2002 个 Source/Claim Node、50 串行 + 32 并发关系 Patch 的隔离 1 GiB/no-swap 测试。50 次串行成功，但一次并发 `object.patch` 返回公共 `INTERNAL_ERROR`，当次压测 `result=incomplete`、无完成的并发/回滚/重启统计；**未取得可证明根因的底层错误证据，不得视为通过或宣称问题已修复**。
- **增强不确定失败时的诊断回收**：`scripts/mcp-phase38-stress.mjs` 保持所有本来允许的有限负载与单独临时 Docker Volume，改为 `Promise.allSettled`，确保同一测试的并发工作分支全部结束后才查询和清理；失败时仅保留安全的公共 Error Code/Retryable、Request ID、Operation ID、最后已持久化阶段和可信的 Lithograph `query_family/db_call_seq`、cgroup 概要。不记录任意用户 Patch/Cypher/JS 正文或未清洗底层错误文本，不自动重试任何结果不确定的写入；故障详情读取失败单独标记 `unavailable`。终态仍清理临时容器和 Volume。
- **同一镜像最高档独立复跑**：在增强故障分支的前一版脚本上，连续两轮 `50+32` 写入均通过：串行/并发 P95 分别 **411.99/5038.56 ms**、**408.77/5312.52 ms**，cgroup 内存峰值 **344.88 / 304.18 MiB**，两轮均 `oom_kill=0`、诊断 `dropped=0`、SIGKILL 后 Branch Head 和诊断均可回读。随后将仅在失败时执行的敏感字段白名单进一步收紧，并在当前脚本上以 50 个无关节点、5 次串行、8 次并发执行独立小负载 Smoke，结果通过、无 OOM/丢失、状态/重启正确。两轮成功只能证明该测试没有再次触发错误，**不能抵消历史失败或得出概率为零**。
- **Review 结论**：没有据此擅自调整 MCP 请求超时、数据库连接池、正式生产内存、Lithograph 事务或公共错误返回；缺少故障发生时准确的 Request/Span/Branch 结果证据，暂不把 `INTERNAL_ERROR` 归因给 SQLite、HTTP 或并发客户端。后续若复现，按当前新增的有界详情缩小到具体 Operation，再作有证据的最小代码修复与重验。最后当前源码的 `pnpm validate` 必须独立全量通过，不能用上一轮旧源码的退出码代替；最终 Git SHA 公开 CI 仍未执行。

### 2026-11-10 已知底层运行故障的安全公共分类

- **Review 找到确定的代码缺口**：`internal/lithograph/errors.go` 已能从真实结构化 Lithograph 错误区分 `BUSY`、`STORAGE_ERROR`；但 `internal/kernel/errors.go` 的 `AsPublicError` 原先未处理这两类，默认返回 `INTERNAL_ERROR`。此缺口与此前出现过的并发 INTERNAL_ERROR 相关性**未得到具体失败请求证实**，不能归因或声称消除那次偶发错误。
- **最小修复**：KG OS Kernel 只把可信的上述两个数据库运行类别映射至已有 `IO_ERROR`，输出固定安全提示并在内部保留原始 cause；没有新增公共错误类别或对原始错误字符串做模式匹配。`kgos_mutate` 在结果不确定时仍 `retryable=false`，必须读取实际 State/History；不改底层 Lithograph、数据库连接池、MCP 执行超时或产品内存配置。公共合同在 `docs/design/contracts.md` 明确归属。
- **红绿测试**：`internal/kernel/coverage_contract_test.go` 增加结构化 `BUSY` / `STORAGE_ERROR` 的公共映射与不泄露路径/凭证回归。修复前真实 `go test` 两项子测试因 `INTERNAL_ERROR` 失败，修复后 `go test -race -tags=sqlite_fts5,lithograph_smoke -count=3` 的相关 Kernel / 事务前拒绝 / 约束冲突测试退出 0。此验证的是安全错误分类，**不是**对历史不确定写入的补偿或重试。

### 2026-11-11 SQLite 写锁竞争根因复验与最终源码修复

- **新复现事实**：在Lithograph v0.3.5、505 Binding / 2002 Source/Claim Node、50次串行与8 Branch×4并发的1GiB/无Swap隔离镜像中，一次并发 `object.patch` 返回 `IO_ERROR`。可信受保护诊断API按Request ID回读到最后真实阶段 `tx_begin`、对应Operation ID和之前的数据库Span序列，`oom_kill=0`、`dropped=0`。随后**只在OpenClaw隔离构建副本**的同一个`Begin`错误分支加入固定格式、无正文的测试插桩；在等形负载下一次真实复现，直接输出 `structured=true category=BUSY sqlite_code=5`。因此当前8路并发写入故障明确可由SQLite单物理Writer锁争用触发，**不等于有证据证明2026-11-09生产OOM或最早那一笔INTERNAL_ERROR也具有相同唯一根因**。隔离插桩从未写回Mac正式源码或产品日志。
- **最小实现**：`internal/lithograph/host.go` 保留既有write pool **4** 和read pool **8**，只把write connection的`_busy_timeout`从 **5000 ms** 改为 **15000 ms**，read pool保持 **5000 ms**。无公共配置、新队列、锁语义改变或未知结果的自动重试；默认MCP执行Deadline仍为30s。`internal/kernel/errors.go`只把可信结构化`BUSY`/`STORAGE_ERROR`映射为固定安全的现有`IO_ERROR`，同时保存内部cause；`docs/design/contracts.md`与`docs/design/implementation.md`同步对应owner合同。
- **真实测试**：新增`internal/lithograph/phase38_busy_timeout_integration_test.go`验证实际SQLite连接`PRAGMA busy_timeout`（write 15000/read 5000）及连接池数量；用两条真实连接在第一条`BEGIN IMMEDIATE`占用物理Writer锁**6秒**后释放，第二条能等待并成功获取锁，真实Go Race连续 **2轮**通过。原有3轮事务Commit I/O错误、Context过期、连接失效及写连接恢复回归保持通过。前一轮15s**仅测试镜像**还完成3组相同最高档受限压力，均无OOM和诊断丢失，随后已使用**正式Mac修改源码**重建原样`Dockerfile.unified`镜像（`kgos-phase38-v035-finalbusy15:local`）；其两轮最终最大负载实测数据如下。

| 最终正式代码镜像（每轮均505 Binding、2002 Node、50串行+32并发） | 第1轮 | 第2轮 |
| --- | ---: | ---: |
| 串行P95 | 421.44 ms | 549.34 ms |
| 并发P95 | 5007.84 ms | 4560.19 ms |
| 8 Branch并发吞吐 | 3.41 writes/s | 3.58 writes/s |
| cgroup memory.peak | 308.41 MiB | 323.48 MiB |
| cgroup memory.max / swap.max | 1 GiB / 0 | 1 GiB / 0 |
| OOM Kill / 诊断dropped | 0 / 0 | 0 / 0 |
| Stale/非法端点回滚、SIGKILL后Head与诊断回读 | PASS | PASS |

- **兼容与降级**：上述正式镜像在OpenClaw通过 **31/31 SDK/MCP**、OAuth restart/refresh/revoke、non-root单进程持久化/清理。相同镜像在诊断SQLite有意不可用时，用505 Binding / 752 Node、20串行+32并发关系Patch独立复测：P95 **319.34/3623.64 ms**，内存峰值 **323.22 MiB**、`oom_kill=0`，业务成功、`availability=unavailable`、Stale/非法端点失败不移动Head、SIGKILL后State恢复。此前记录的Off/On/Off诊断开销对照仍成立，不能用本次降级测试替代真正关闭Observer的A/B/A基线。
- **Review与限制**：这项修复处理了**真实已复现的`BUSY`锁等待耗尽**，不推导任意并发都不超时或任意查询无OOM；仍不自动重放结果不确定的Patch，必须查看State/History。当前本地全量质量和公开精确Git SHA CI分开报告；后者需要独立Commit/Push许可，未经真实执行仍为未完成。所有受限负载都只在临时Volume中运行，未向长期Dev/Prod的Knowledge Branch写入测试数据。

### 2026-11-11 Nexum 续作：同源码隔离 Docker 与回归复验

- **被测来源及构建**：Yi Mac `main@2d06a06` 加本地当前未提交的 Phase 38 实现；将该工作树只读来源复制到 OpenClaw 专用临时目录，以正式 `Dockerfile.unified` 构建 Linux amd64 镜像 `sha256:330ac164e54e0686780686dacd8de102fc257022e37a879e985e8db505747765`。构建仅在调用时选择已存在、等版本的镜像仓库基础镜像及宿主网络/代理，未修改产品 Dockerfile、公共配置或长期 Dev；原始 Docker Hub metadata 曾因 size validation 失败，默认 bridge 又因 Docker 宿主缺少网卡而失败，须与真实产品测试结果分开。Docker 缓存层仍依据复制的当前源码生效，不声称每层都从零编译。
- **最高档两轮实际压力**：每轮都在新建且自动清理的临时 Volume 中加载 **505 Binding、2002 Source/Claim Node**，运行 50 次串行加 8 Branch × 4 次（32 次）并发 Relationship Patch；内存 `memory.max=1073741824`、`memory.swap.max=0`。P95 和 cgroup 峰值均取每轮实际输出，不能与不同硬件直接比较：

  | 当前独立镜像最高档 | 第 1 轮 | 第 2 轮 |
  | --- | ---: | ---: |
  | 串行 P95 | 429.56 ms | 673.74 ms |
  | 并发 P95 | 4809.89 ms | 5827.46 ms |
  | 8 Branch 吞吐 | 4.02 writes/s | 3.69 writes/s |
  | `memory.peak` | 318849024 B | 317337600 B |
  | `oom_kill` / 诊断 `dropped` | 0 / 0 | 0 / 0 |
  | Stale/非法端点回滚、Head 不变、SIGKILL 重启并保留诊断 | PASS | PASS |

- **诊断降级与过滤**：同镜像以 505 Binding / 752 Node、20 串行 + 32 并发写入，故意让诊断 SQLite 路径不可用时仍整体通过，串行/并发 P95 为 **341.66/4142.19 ms**，`memory.peak=281608192 B`、`oom_kill=0`，返回 `availability=unavailable` 而不影响业务。独立的 `KGOS_LOG_LEVEL=ERROR` 轮同样通过，串行/并发 P95 为 **373.59/3849.71 ms**，`memory.peak=308981760 B`、`oom_kill=0`、`dropped=0`，真实请求仍能回读最后 `commit` 阶段和 DB Span。两轮均完成异常回滚、Branch Head 和重启检查。
- **跨接口验收**：相同新镜像在隔离 Volume 内通过 **31/31 实际 MCP/SDK**、OAuth restart/refresh/revoke、Web/API、非 root、Node-free 单进程及持久化回归。Mac 的 Phase 38 Kernel/Lithograph/Observability 定向 `go test -race -count=3` 全部通过；单独 Playwright **85/85** 通过，先前完整 `pnpm validate` 已证实 Go coverage **90.2%**、Vitest **95 文件 / 932 测试**、Type coverage、License、0 生产重复片段及其它常规检查。分别重跑 License/Security/Diff 也退出 0；npm audit 无 High/Critical，仍报告 8 Moderate + 3 Low。
- **并行构建干扰（不能记作全量通过）**：本轮第一次 `pnpm validate` 在 Go/前端门禁已通过后，于 Playwright 阶段因外层执行时限中断；单独 Playwright 后续 85/85 成功。第二次 `pnpm validate` 在 Go Race 阶段失败，原因是另一个独立进程同时在同一工作树执行 `pnpm validate`，其 `pnpm build` 调用了会删除整个 `artifacts/` 的 `pnpm clean`，导致正在运行的测试找不到 Jieba `.dylib`。日志明确为文件不存在，而非关系语义断言或 Race Detector 报告；不能将第二次失败抹去，也不能擅自结束其它进程。需要在无共享 `artifacts/` 竞争时取得**本次**完整退出码。
- **状态和授权**：当前测试没有发现新的 Phase 38 业务正确性回归；未新增公共 API、自动重试、配置或服务。最后精确 Git SHA 的公开 Ubuntu Validate / Linux Docker CI 尚未运行，Commit SQL 内部精确异步 Deadline 和真实物理磁盘损坏仍非完全覆盖；在这些必需证据补齐前 Phase 38 保持 `in_progress`，不声称提交、推送、发布或部署。

### 2026-11-11 Context 可取消事务开始边界与最终源码验收

- **Red：确实存在超时后阻塞**。在正式 Lithograph v0.3.5 上以两条SQLite物理写连接持有真实WAL Writer锁，设置请求Context在250 ms到期。原来完整15秒的SQLite `busy_timeout`忙处理器在取消后超过3秒仍未返回；新增Go Race定向测试真实失败。这个发现属于显式Transaction Begin之前的错误/取消时序，不用只检查配置值代替。
- **最小修复**：`internal/lithograph/write_connection.go`和`internal/lithograph/transaction.go`仅对**尚未成功建立**的`tx_begin`启用每次250 ms忙等待与可由Context停止的50 ms间隔，总重复等待预算最多15秒（连接池获取仍遵守请求自身Context）；每次结构化`BUSY`失败均discard该连接，在新连接上重试**进入事务之前的动作**，不复用未知连接、不重做任何已经进入事务的Mutation、Execute或Commit。事务成功建立后恢复既有写连接15秒busy预算；原读连接5000 ms、写连接15000 ms及write 4/read 8物理池合同不变。取消与事务建立完成恰好竞争时，在对外返回前额外检查Context，已取消的交易通过discard清理、不会交付给调用方。无需为此引入全局串行队列、额外持久对象、用户配置或自动重放Patch。
- **Green：真正的原生扩展回归**。Mac Go Race对`TestPhase38BusyWriterRespectsCanceledRequest`、`TestPhase38BeginContinuesAfterLongWriterLock`、连接池PRAGMA、Write Lock 6秒恢复、Commit I/O、已暂存节点/关系、失联连接等组合连续3轮通过；单独确认250ms超时的Begin及时失败、6秒真实锁占用释放后Begin继续且只提交一个Node。此前原生SQLite忙处理器自身不能被Context及时抢占，因此只宣称KG OS显式Begin边界的可取消等待；不把它外推到Graph Execute中每种SQL内部阻塞或物理磁盘损坏。
- **Linux正式构建和压力**：OpenClaw中将最终Mac源码编成与产品一致的`Dockerfile.unified` Linux amd64专用测试镜像`kgos-phase38-ctxcancel-final:local`；仍使用v0.3.5正式Linux归档、1 GiB `memory.max`/0 Swap，每轮505 Binding（5 Domain/50 Definition/450 Property）+2002 Source/Claim Node，50次串行与8 Branch×4次并发`object.patch`。**两轮全部通过**，串行P95分别**424.82/407.79 ms**，并发P95**3128.18/3623.84 ms**，并发吞吐约**3.68/3.96 writes/s**，cgroup内存峰值**339.2/337.95 MiB**，`oom_kill=0`、诊断`dropped=0`；Stale/错误端点拒绝不移动Head，SIGKILL重启后State和诊断仍可读。同一最终镜像`31/31 SDK/MCP`、OAuth重启/刷新/撤销、non-root和持久化/清理Smoke通过。
- **最终代码诊断失效隔离**：使用相同`kgos-phase38-ctxcancel-final:local`正式测试镜像，独立Volume内故意令诊断SQLite无法初始化，505 Binding、752 Source/Claim Node、20串行+32并发Patch均成功；串行/并发P95 **325.62/2229.41 ms**、cgroup内存峰值 **347.93 MiB**、`oom_kill=0`，观测API返回`availability=unavailable`、业务结果不受影响。非法端点/Stale均拒绝且Head未变；SIGKILL后业务State恢复，诊断本来不可用故不冒称可回读。此前A/B/A全关闭Observer对照专门测量旧Begin路径的诊断额外开销；本段只验证新Begin实现的诊断失效容错，不用两套不同代码的P95推导最新诊断固定成本。
- **局限与尚未交付**：单次P95有随机波动，不能用本阶段两轮测试证明无限并发与历史深度下的性能上界；SQLite单物理Writer瓶颈仍真实存在。这项改动只保障安全前置Begin的取消，不允许对已执行SQL、未知结果事务或运输失败自动重放。当前开发计划保持`in_progress`，在最终源码 Git SHA 的公开 Ubuntu Validate/Docker CI、极端Commit执行中故障合同未得到真实验收前，不宣称Phase 38整体Done，也不将测试专用镜像部署到长期Dev/Prod。

**最终 Context-aware Begin 全仓验收**：在 Yi Mac 当前未提交 `main@2d06a06` 工作树、Node 24.15.0、Go 1.27.3、Rust 1.97.1 下执行 `pnpm validate`，实际 **exit 0**。包含 Go Race、Go 全仓 statements **90.2%**、Vitest **95文件通过**、Playwright **85/85**、TypeScript type coverage、MCP生成文档一致性、ESLint/Prettier、依赖扫描、许可证、Secret和Diff；npm audit无High/Critical，仍有8 Moderate+3 Low非阻塞告警。此结果仅适用于此次最终代码工作树，不代表已经在公开`kg-releases`的精确 Git SHA 执行Ubuntu Validate/Docker CI，也不证明所有未注入的物理故障均不会发生。部署、Tag、Release均未执行。

### 2026-11-11 事务注册期取消竞争与 GitHub 精确 SHA 验收

- **首个已验证交付**：KG OS `main@18e04b815c86dffbd70124b7d8e8559003b0cf1d` 已实际提交并推送到 `origin/main`，公开 `kg-releases` 对应 `source.json` 精确绑定该 SHA；[公开 CI Run 42863585578](https://github.com/bYiyLi/kg-releases/actions/runs/42863585578) 的 `prepare`、`Validate private source`、`Build and seal tested Linux amd64 candidate` 真实成功。该 Run 只证明 `18e04b8` 对应源，不自动验证随后工作树中的新增注册期取消保护。
- **新发现与实现**：在 `Host.Begin` 已成功完成 `lithograph_tx_begin` 后，`registerTransaction` 可能需要等待 `Host` 生命周期 mutex；等待期间 request Context 可被取消。原先只在注册之前检查 Context，可能把已取消的 transaction 返回调用方。`internal/lithograph/transaction.go` 在 `registerTransaction` 成功后再核对 `operationCtx.Err()`；已取消时调用原有 `transaction.Close()` 执行 abort/连接清理，返回取消错误与可能出现的清理错误，不对业务 Patch/Commit 做自动重试，不修改写锁等待预算和公共接口。
- **真实锁、生命周期和数据不变验证**：`internal/lithograph/phase38_busy_timeout_integration_test.go` 新增 `TestPhase38CanceledDuringRegistrationDoesNotReturnTransaction`：使用实际正式 Lithograph v0.3.5 的独立连接持有 SQLite Writer Lock，另一连接进入 `Begin`，用测试期持有 Host mutex 迫使注册等待，随后取消请求并释放 mutex；断言不会返回事务、错误符合 `context.Canceled`、`host.transactions` 和写连接归还状态正确、实际 `branch/main` Head 不变。与已存在 6 秒写锁等待、250 ms Deadline、Commit SQL I/O 错误、连接失联/恢复组合，在 Mac Go Race 的 `-count=3` 下全部通过。
- **剩余完成门禁**：上述注册期修复属于已通过 `18e04b8` CI **之后**的代码增量，须按本次实际提交的**新精确 SHA**重新执行 Mac `pnpm validate`、隔离 Linux amd64 1 GiB/无 Swap 压测、31/31 SDK/MCP Smoke、公开 Ubuntu Validate 和 Docker 候选封装，均有真实通过结果后才可对其宣称交付。最初事故的真实物理介质损坏/Commit SQL 内部精确异步 Deadline 未复现时继续注明范围；不得把历史测试或旧 SHA 的绿灯作为这些测试的证据。

### 2026-11-11 Go 安全门禁变化与 1.27.4 补丁升级

- **公开新 SHA 的真实失败**：`0b80a82b16f8b2b9fd1d0f3080dc643d17b4b607` 的 [公开 CI Run 42970846496](https://github.com/bYiyLi/kg-releases/actions/runs/42970846496) 在完整 `pnpm validate` 的 **第 9/18 阶段**（`check:go:security` / `govulncheck -test`）返回非零；`prepare` 成功，Docker Job 因依赖失败被跳过，不能算已通过。复现时本地 `govulncheck` 明确报告 Go 标准库 `net/http@go1.27.3` 的 [GO-2026-6859](https://pkg.go.dev/vuln/GO-2026-6859)（HTTP/1 服务端崩溃风险），修复于 `go1.27.4`；扫描未报告其它包漏洞。本项与 Phase 38 事务修复无直接因果关联，但实质阻断 A38-08 的发布前安全门禁，不得屏蔽或添加漏洞豁免。
- **统一的最小工具链修复**：根据 2026-11-11 的官方 [Go 下载元数据](https://go.dev/dl/?mode=json) 确认稳定 `go1.27.4` 与 `linux-amd64` 归档 SHA-256 `7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840`；已升级 `go.mod`、本地 build/test/security/setup/check 工具链固定版本、`Dockerfile.unified` 官方 Linux 归档及 builder 基础镜像、公开 CI Go 安装、测试候选工具链样例、Dev build 归档 URL 和工程使用指南。保持 Lithograph **v0.3.5**、依赖清单及 Go 安全检查原样有效，不引入新配置/绕过；Dev Compose 的既有旧 Go builder 镜像仅提供 gcc 等构建底座，Dockerfile **仍覆盖安装并核验实际 Go 1.27.4**。
- **已完成的定向修复验证**：Yi Mac 已真正安装/执行 `go version go1.27.4 darwin/arm64`，`pnpm check:dependencies` 与相同 `pnpm check:go:security` **exit 0**，漏洞扫描明确 `No vulnerabilities found.`。官方 Docker Hub 也确认 `golang:1.27.4-bookworm` 当前有效；这是依赖/安全修复的定向结果，不能代替修改后最终工作树的 Go Race、Go Coverage、Linux 容器压力及**新精确 Git SHA 公开 CI**。
- **结论边界**：截至本段录入，补丁已修改本地源码但尚未完成新 SHA 全量交付，Phase 38 保持 `in_progress`。原本未稳定复现的 Commit SQL 内部精确异步超时及物理介质损坏仍需如实列为专项未验收，不将真实 SQLite `query_only` I/O 失败、连接失效或 SIGKILL 扩大解释为所有介质故障。

### 2026-11-11 Go 1.27.4 最终源码质量与隔离压力复验

- **来源与配置**：在 Yi Mac `main@0b80a82` + 本次仅 Go 安全补丁的 15 个暂存文件上测试，Lithograph 正式固定为 `v0.3.5`、Go `1.27.4`、Node `24.15.0`、pnpm `10.34.5`、Rust `1.97.1`，其余用户 Phase 36 OAuth 和 Phase 37 计划改动保持未暂存、未经本补丁授权写入。Linux 测试源码由已提交 HEAD 及**仅本次暂存差异**构成，在 OpenClaw 独立目录回读 SHA-256 与暂存源码一致，避免将工作树内的无关修改引入镜像。
- **Mac 最终全量门禁**：修正文档新增小节的一处 `MD012` 双空行后，实际 `pnpm validate` **exit 0**。同一工作树的 Go Race、Go statements **90.2%**、`govulncheck -test` **No vulnerabilities found**、Vitest **95 文件 / 932 测试通过**、Playwright **85/85**、Type Coverage、0 clones、Staticcheck、Dependencies、MCP docs、License、Secrets、Markdown/Spelling/Diff 等质量门禁全部通过。NPM 全量审计仍报告 **8 Moderate / 3 Low**，无 High/Critical；不能把这些非阻断项记作“没有任何安全告警”。另有独立全仓 Go Race、Go Coverage `90.2%`、官方候选分发 `22/22`、Phase 38 定向 Go Race 连续多轮成功结果。
- **Linux 正式镜像（实际 Go 1.27.4）**：使用未修改的 `Dockerfile.unified` 在隔离 OpenClaw Linux amd64 构建正式单进程镜像 `kgos-phase38-go1274-20261111:local`（镜像列表 ID `sha256:ec789562a3fea2aa4feb66f0f12ec23ea01cdbc89e3981f7b30271b333bb8d77`）。官方 `golang:1.27.4-bookworm` 镜像在该宿主发生 Docker metadata/bridge 错误；隔离构建**仅通过参数选用已缓存的旧 Go builder 镜像作为 GCC 底座**，Dockerfile 本身依然下载、核验并覆盖安装 Go **1.27.4**（官方归档 SHA-256 固定），执行时明确断言实际 `go1.27.4 linux/amd64`。Web/Native/Go 编译及最终镜像构建成功；不能把本次隔离适配冒称为默认 Docker Hub 网络可用，公开 CI 须单独验证默认路径。
- **最高档独立压力两轮**：每轮在独立临时 Volume、1 GiB `memory.max` / 0 Swap 中加载 **505 Binding / 2002 Source/Claim 节点**，执行 **50 串行 + 8 Branch×4 并发（32）关系 Patch**，并做 Stale/错误端点 Head 回读、受保护诊断查询及真实 SIGKILL 后 State/诊断恢复。两轮并发 P95 **3080.74 / 3046.83 ms**，内存峰值 **330907648 / 359153664 bytes（315.58 / 342.51 MiB）**；两轮 `oom_kill=0`、诊断 `dropped=0`、State/诊断恢复 **PASS**。测试负载在规定规模均完成，不能推导任意数据规模和并发场景不会 OOM。
- **跨接口与诊断失败**：同一 `Go 1.27.4` 镜像通过 **31/31** SDK/MCP、Web/API、OAuth 重启/刷新/撤销、non-root、持久化/清理；单独让诊断 SQLite `unavailable` 后在 **505 Binding / 752 Node / 20 串行 + 32 并发** 下仍业务成功，串行/并发 P95 **322.93 / 2771.91 ms**、峰值 **302.37 MiB**、`oom_kill=0`，Stale/错误端点及 SIGKILL 后**业务** State 仍可读，诊断本来不可用故不能声称其已恢复。本次 OpenClaw 目录与镜像已按用户要求定向删除并回读，长期 Dev 为 healthy，未操作生产或发布。
- **下一步和未证实边界**：此处只完成修改源码的 Mac/Linux 本地验证，新 Git SHA 的**公开 Ubuntu Validate / Docker 候选制品一致性**仍待 Commit、Push 和真实运行结果，不能使用先前成功的 `18e04b8` CI 或失败的 `0b80a82` CI 替代。Commit SQL 内部极端异步 Deadline、真实物理介质损坏未获得稳定专项注入证据，Phase 38 整体 `in_progress`，不把受限测试理解为绝对零缺陷。

### 2026-11-11 最终提交 d40485c 的正式公开 CI 验收回读

- **正式源码与上游引用一致**：Yi Mac `main` 和 `git ls-remote origin refs/heads/main` 均指向 `d40485c26032f8f4e1e1c2dd37da9fb57477e541`；`kg-os` 的 GitHub 同步 Run [42979634133](https://github.com/bYiyLi/kg-os/actions/runs/42979634133) 为 `success`；公开 `kg-releases/main` 的 `source.json` 确认为此 `revision`、`ref=refs/heads/main`。没有拿公开仓库自身 Commit SHA 充当 KG OS 源码 SHA。
- **A38-08 公开质量/镜像门禁**：[公开 CI Run 42979660934](https://github.com/bYiyLi/kg-releases/actions/runs/42979660934) 为 `completed/success`，`prepare`、Ubuntu `Validate private source`、`Build and seal tested Linux amd64 candidate` 均成功；仅不适用的网站归档快速通道被跳过。完整 `pnpm validate`、镜像 OCI 构建与重新加载后的 Docker Smoke、候选制品上传/下载回读、OCI 身份验证的实际步骤均 `success`；与此前失败于 Go 1.27.3 标准库漏洞的 Run 42970846496 严格区分。
- **候选制品回读**：GitHub Actions Artifact ID **13837227640**，名称 `kgos-candidate-d40485c26032f8f4e1e1c2dd37da9fb57477e541-42979660934-1`，`size_in_bytes=66017409`，`expired=false`，完整 Artifact SHA-256 为 `7b8e9aa9ebec4698c4e5a322816665f4ba24928b5eb5082644a02bacb4b79e7d`。这是 GitHub 对完整打包 Artifact 的摘要，**不等于 OCI image digest**。该 Artifact 是候选验收物，不是 Release/Tag/部署。
- **阶段完成判定**：A38-01/02/04/05/06/07 的实际集成与受限压力证据已记录，A38-08 的最终源码完整 Validate 与正式 Docker CI 已通过；A38-03 的 Constraint/Stale/中途取消/真实 `query_only` Commit I/O 错误/连接失效/SIGKILL/State 回读也已通过。但**Commit SQL 执行中极端异步 Deadline 与真实物理介质损坏**仍无稳定专项注入证据，继续保留 `in_progress`，不能从 CI 全绿推导所有极端故障已覆盖。
- **清理和范围**：OpenClaw 专用 Phase 38 测试目录、镜像、容器及 Volume 已核对清理，长期 Dev `kgos-dev-mcp-1` 仍 `healthy`，Prod 未修改。Yi Mac 中未授权混入本阶段的 Phase 36 OAuth 和 Phase 37 路线图工作树修改保持原样。本次只补充开发计划的真实验收状态，不重新修改已验证的代码、Lithograph 底层或外部配置。

### 2026-11-11 故障注入补强、Review 与新一轮隔离压力（当前工作树）

- **来源边界**：Yi Mac `main@b3b3c50` 加当前未提交 Phase 38 修改；Docker 源码副本在 OpenClaw 专用 `validation/phase38-final-fault-20261111/src` 建立时，`internal/lithograph/host.go`、两个新增/扩展故障测试源码的 SHA-256 已与 Mac 当时工作树相等。以正式 `Dockerfile.unified` 构建独立 Linux amd64 `kgos-phase38-fault-final:local`，镜像 ID `sha256:b65beb21fa950ed6fd409b6ea5d5f9767e1a02b60b6affcc20c676a4e2d73ddc`。后续只增强 Mac **测试断言**及文档，不改动该镜像中的业务实现，因此已有镜像压力证据不被冒称为之后源码测试文件的构建证明。
- **最高档压力两轮**：每轮独立临时 Docker Volume，`memory.max=1073741824`、`memory.swap.max=0`，505 Binding（5 Domain、50 Definition、450 Property）、2002 Source/Claim 节点、50 次串行 + 8 Branch×4 次并发关系 Patch。第一轮串行/并发 P95 **417.36 / 2962.00 ms**、内存峰值 **358051840 B**、并发吞吐 **3.99 writes/s**；第二轮 **418.34 / 3396.92 ms**、**356630528 B**、**3.53 writes/s**。两轮 `result=passed`、`oom_kill=0`、诊断 `dropped=0`；Stale/错误端点的 Branch Head 保持不变，SIGKILL 后 Head 与已持久化诊断均可回读。仅证明本次规模与环境中的表现。
- **同镜像跨接口及诊断降级**：独立 Docker Smoke 通过真实 **31/31 SDK/MCP**、OAuth restart/refresh/revoke、non-root 单进程 Web/API/MCP 与持久化。诊断 SQLite 故意不可用时，以 505 Binding / 752 Node、20 串行 + 32 并发 Patch 通过，串行/并发 P95 **335.28 / 2973.26 ms**、`memory.peak=330674176 B`、`oom_kill=0`，诊断 API 正确报告 `unavailable`、业务正常、回滚与 SIGKILL 后 State 可读；不可声称原本不可用的诊断已恢复。
- **实际 COMMIT SQL 内部取消与超时**：`internal/lithograph/phase38_commit_failure_integration_test.go` 通过临时独立 DB 上真实 `sqlite3.SQLiteConn.RegisterCommitHook`，等待确认 native COMMIT hook 已执行后才取消请求，或让真实 `context.WithTimeout` 的 Deadline 在 hook 内到期；hook 明确拒绝 COMMIT，分别获得 `context.Canceled` / `context.DeadlineExceeded`。失败后的同进程/重新打开 DB 的 Head 和关系数量保持原状，新写入正常。不能据此推定 hook **允许成功提交时**异步网络中断下客户端总能知道最终提交结果；结果未知仍须通过 State/History 回读。
- **受限页数与损坏恢复的 A/B 校验**：在独立临时业务 SQLite 文件中将 `PRAGMA max_page_count` 锁在当前页数后写入约 4 MiB 不可压缩属性，真实写入被拒绝且 Branch Head 未移动，关闭并重开后无部分数据；对照试验在**同一数据库解除限制后**用完全相同的 Cypher/属性成功写入并验证页数增长，排除无关语法错误造成的假通过。另独立注入文件头损坏、部分截断与 0 字节截断，均无法重新打开，恢复已关闭时取得的完整测试快照后 `integrity_check=ok`、原 State 与 Relationship 数量一致，新写入恢复。零长度**已存在**文件由 KG OS Host 拒绝自动初始化；非空 DB 仅保证已访问坏页可被探测，启动时不遍历全库，**模拟损坏不等于真实物理介质故障**。
- **真实残留缺口，不掩盖**：上述容量限制触发时 Lithograph **v0.3.5** 实际返回结构化 `INTERNAL_ERROR`（SQLite code **1**），内部内容为 `write savepoint rollback: no such savepoint` 及后续连接隔离，**不是**可直接证明的结构化 `SQLITE_FULL` 或 KG OS 公共 `IO_ERROR`。当前验证成立的是**无半提交、连接隔离和重新打开后的可恢复写入**；底层异常清理造成的错误分类仍需 Lithograph 独立定位，不应在 KG OS 对原始错误文本猜测、强制改写公共错误或重放结果未知的 Mutation。没有真实介质损坏的专项证据前保留此边界；由于本轮工作树新变更尚无它自身精确 Git SHA 的公开 Ubuntu Validate/Docker CI，Phase 38 继续保持 `in_progress`，不宣称发布或部署。
- **Mac 故障定向回归**：本次补强的 native Commit 中断/Deadline、页数 A/B 与文件损坏/恢复三组在 Go 1.27.4 + Lithograph v0.3.5 下，`go test -race -tags=sqlite_fts5,lithograph_smoke -count=3 -run '^TestPhase38(CancelledWhileSQLiteCommitIsExecuting|SQLitePageQuotaRejectsPatchWithoutPartialCommit|CorruptSQLiteFileFailsClosedAndIntactSnapshotRestores)$' ./internal/lithograph` **真实 exit 0**，同时通过单轮 `-v` 逐项核对取消/Deadline 的错误类型和恢复后的 Branch/Relationship 数据。
- **Mac 最终全仓质量门禁**：修复本轮文档 `savepoint` 拼写词表错误后，实际使用 Node v24.15.0 / pnpm 10.34.5 / Go 1.27.4 的完整 `pnpm validate` **exit 0**。全仓 Go Race 通过，Go 总语句覆盖率 **90.2%**（要求 ≥90%），`govulncheck -test` 未发现已知漏洞，Vitest **95/95 测试文件通过**，Playwright **85/85 E2E 通过**；MCP 文档生成校验、静态检查、类型、构建、依赖许可证、diff 与生产依赖高危安全门禁也通过。npm audit 报告 3 low/8 moderate，未触发当前 high 阈值，但不把该状态称为零 npm 漏洞。
- **专用资源清理实际回读**：测试前核对三份 Linux JSON 报告均 `result=passed`；随后定向删除 `kgos-phase38-fault-final:local` 镜像及 `/data/apps/KgosDev/validation/phase38-final-fault-20261111` 专用目录，重新检查对应镜像不存在、目录不存在、无 `kgos-phase38-*` 容器及 Volume，返回 `CLEANUP_PHASE38_ISOLATED=PASS`；长期 Dev `kgos-dev-mcp-1` 为 `healthy`，未触及 Prod。本轮未提交、推送、Tag、Release、部署，也未把 Phase 36 OAuth / Phase 37 工作树改动纳入本阶段。最终新 SHA 的公开 CI 与 Lithograph 底层配额错误处理仍未闭合，故 **`in_progress` 不变**。

### 2026-11-14 Lithograph v0.3.6 升级、正式镜像与 Phase 38 复验（当前未提交工作树）

- **来源与升级边界**：Yi Mac `main@b3b3c50` 加本轮 KG OS 工作树修改；保留预先存在的 Phase 36 OAuth、Phase 37 及 Phase 38 改动。官方 Lithograph [v0.3.6 Release](https://github.com/bYiyLi/Lithograph/releases/tag/v0.3.6) 于 2026-11-14 02:40:02 UTC 发布，非 Draft/Prerelease。直接核验 `SHA256SUMS` 六平台并固定于 `scripts/lithograph-artifacts.mjs`，macOS arm64 `a13621ee03af5a145e9b88d6b5e5a2cd1cb0c23cf24b8be73a4a7490c0e5a369`、Linux amd64 `f781cebf1f959bf0c0560ae0c6151675049eded2a5da073edd92b02cdb686c9a`；macOS 真实归档下载与哈希、扩展/Provider 清单回读通过。`internal/lithograph/types.go`、`Dockerfile.unified`、依赖检查、MCP Cypher 手册/文档产物和 SDK 类型说明一并固定 0.3.6；Go/Cypher Profile `CY25-2026.08`、Storage Format 3 均未变化。未改 Lithograph 独立仓库、公共参数或已有知识数据。
- **真实目录与查询成本**：macOS arm64 正式 v0.3.6 SQLite 3.51.0 实际 `SHOW FUNCTIONS` 与固定清单核对 **172/172** 同名同类别签名项、`SHOW PROCEDURES` **38/38** 同名同读写模式；`pnpm generate:docs` / `pnpm check:docs` 验证 **31 方法、76 类型、134 页**，`pnpm check:dependencies` 通过。80 个合成 Node 的旧/新 MATCH、相同端点和结果均为 **6 dbHits**；旧形状的 EXPLAIN 仍可含 Cartesian 但两端使用 NodeIdSeek，不能以 EXPLAIN operator 名猜测执行工作量，也不能由小图推导生产 OOM 根因。
- **跨版本原 SQLite 历史**：独立临时数据库使用官方 v0.3.5 真实扩展创建 Source→EVIDENCES→Claim 并记录旧 immutable Commit，再关闭原进程、用官方 v0.3.6 装载**同一数据库**；旧 Commit 上仍只有一条 Relationship，新写入新 Commit 后当前 State 变为两条，旧 Commit 仍为一条，`PRAGMA integrity_check=ok`。未通过复制新库冒充升级，也未修改 KG OS 长期 Dev/Prod。
- **Mac 测试**：Node 24.15.0、pnpm 10.34.5、Go 1.27.4 上 `node scripts/test-lithograph.mjs` exit 0（真实 Lithograph/Runtime/Runtimeprofile/Kernel/Daemon/kgosd）；Phase 38 Lithograph/Kernel/Observability 的 `go test -race -count=3 -run '^TestPhase38'` exit 0。完整 `pnpm validate` **真实 exit 0**，全仓 Go Race、总语句覆盖 **90.2%**、`govulncheck -test` 无已知漏洞、Vitest **95 文件**、Playwright **85/85**，类型、格式、文档、License、Diff、依赖安全门禁均通过；npm audit 当前有 **14 moderate + 4 low**，无 High/Critical，不说成零 npm 漏洞。
- **Linux 正式 Dockerfile**：OpenClaw 只读复制 Mac 当前源码到 `/data/apps/KgosDev/validation/phase38-v036-20261114-isolated/src`，`Dockerfile.unified`、版本脚本、Go Host 和故障测试文件 SHA-256 与 Mac 实际一致；以仓库原始 `Dockerfile.unified` 构建正式单进程 Linux amd64 测试镜像 `kgos-phase38-v036-20261114:local`，镜像 ID `sha256:1e99564d6faaeabba04adfc4c5037c0eb40155537da02d45a67a14871aebd7a5`。OpenClaw 仅在构建参数中使用现有镜像仓库、host 网络、代理和缓存 Go GCC 底座，Dockerfile 仍独立安装校验 **Go 1.27.4**，Lithograph Linux 归档 SHA 固定且构建成功；没有因此更改正式 Dockerfile 的运行平台或在 Mac 上运行 Docker。
- **最高档关系压力（两轮均 PASS）**：各轮使用独立临时 Docker Volume，cgroup `memory.max=1073741824`、`memory.swap.max=0`，505 Binding（5 Domain、50 Definition、450 Property）、2002 Source/Claim Node、50 次串行 + 8 Branch×4 次并发（32）关系 Patch。第一轮串行/并发 P95 **387.16/3537.51 ms**、并发吞吐 **3.99 writes/s**、峰值 **426663936 B**；第二轮 **396.08/2625.33 ms**、**4.41 writes/s**、峰值 **366927872 B**。两轮 `oom_kill=0`、诊断 `dropped=0`；Stale/非法端点返回原公共错误且 Head 不变、真实 SIGKILL 重启后 Head 与已持久化诊断仍可读。这只证明实测规模和环境，不是无限图规模/并发上界。
- **跨接口与失效隔离**：同一镜像真实 **31/31 SDK/MCP**、OAuth restart/refresh/revoke、non-root、无 Node.js、单 kgosd Web/API/MCP、持久化/清理 Smoke 完成。诊断 SQLite 故意 `unavailable` 的独立测试仍在 505 Binding / 752 Node、20 串行 + 32 并发下通过，串行/并发 P95 **325.28/2055.03 ms**、峰值 **394649600 B**、`oom_kill=0`，业务成功、异常回滚及 SIGKILL 后业务 State 保留；诊断本就不可用，不虚称已恢复。
- **已复现且仍未解决的底层缺口**：使用正式 v0.3.6 重跑 `TestPhase38SQLitePageQuotaRejectsPatchWithoutPartialCommit`（真实 exit 0），受限 `PRAGMA max_page_count` 阻止大属性写入、同一 DB 恢复后无半提交且解除配额的同输入可成功；然而实际错误**仍为**结构化 `LITHOGRAPH_INTERNAL_ERROR` / SQLite code 1，含 `rollback-to-savepoint failed (no such savepoint: lithograph_write_3)`、连接 quarantine，没有保留应有的结构化 `RESOURCE_ERROR`/`SQLITE_FULL`。这与 Phase 22 的独立 TEMP/VFS FULL 测试边界不同。不得在 KG OS 通过扫描原始错误字符串猜测类别或自动重放结果未知的写入；需按 Lithograph 独立项目的事务清理合同另行定位。Native Commit hook 拒绝中途 Cancel/Deadline、数据库损坏文件的拒绝打开与恢复在 v0.3.6 下 Go Race 复验通过；真实物理损坏及已提交后客户端响应遗失仍没有完整故障注入证据。
- **清理、状态与剩余门禁**：核对三份 Linux 报告均 `result=passed`、31/31 Smoke 成功后，按测试独占目录定向删除上述镜像和 `/data/apps/KgosDev/validation/phase38-v036-20261114-isolated`，回读 `V036_ISOLATED_SOURCE_IMAGE_CLEANUP=PASS`；长期 `kgos-dev-mcp-1` 仍为 `healthy`，不触及正式生产。源代码**已修改、Mac/Linux 已验证，但尚未 Commit/Push**，所以不存在本轮新精确 Git SHA 的公开 Ubuntu Validate / Docker CI，也未 Tag/Release/部署。历史 `d40485c` 的公开 CI 不覆盖本轮 v0.3.6 与预存工作树改动，A38-08/底层存储错误分类在这些边界未闭合前继续 `in_progress`。

### 2026-11-14 Lithograph v0.3.7 容量恢复修复与依赖升级（当前未提交工作树）

- **上游正式身份**：Lithograph [v0.3.7 Release](https://github.com/bYiyLi/Lithograph/releases/tag/v0.3.7) 于 `2026-11-14T09:00:31Z` 发布，Release ID `445162514`、latest、非 Draft/Prerelease；源码/Tag peeled Commit为`b4da549fc98555188a391358e0f000d94d2fd544`，main和Tag各一轮完整CI四项及六平台矩阵全部通过，Tag自动发布成功。正式下载七项资产的SHA256/大小与GitHub API及Tag CI制品均一致，包内VERSION、两份扩展架构和许可证/NOTICE通过。固定macOS arm64归档`08cec6f8addc4ceba469ee53ee20a33887f88433e985ccb6daee5a44874ecc6d`、Linux x64归档`762947714026873e8da5e2b9b4b04966e225f9dc9d663619339614e66836873d`，其余四平台同步固定。
- **当前修改范围**：保留`main@b3b3c50`及原有Phase36/37/38工作树改动；本轮仅升级固定版本/六平台SHA、Host预期、Dockerfile、依赖检查、inventory、SDK版本说明与MCP手册，并补强现有容量断言和同步本阶段记录。KG OS包版本仍为0.3.20；未增加错误字符串猜测、公共错误码、自动重放或新的事务状态机。SQL/Profile `CY25-2026.08`、storage format3和Provider SPI保持。
- **旧版真实变红、新版修复闭环**：现有`TestPhase38SQLitePageQuotaRejectsPatchWithoutPartialCommit`新增必须满足结构化`RESOURCE_ERROR`、SQLite13及native13 cause的断言。正式v0.3.6真实失败为`INTERNAL_ERROR`/1，含不存在SAVEPOINT与quarantine；正式v0.3.7三轮Race均为`RESOURCE_ERROR`/13，保留原有无半提交、原Branch State、重开和解除配额后同输入成功对照。没有通过忽略错误类别使测试变绿，页数配额仍不代表物理介质损坏。
- **本轮真实验证**：普通安装脚本实际下载校验v0.3.7后，`node scripts/test-lithograph.mjs` exit0，覆盖Lithograph/Runtime/Runtimeprofile/测试辅助/Kernel/Daemon/kgosd七包；随后`go test -race -tags=sqlite_fts5,lithograph_smoke -count=3 -run '^TestPhase38' -v ./internal/lithograph ./internal/kernel ./internal/observability` exit0，60.09秒、无skip，三次配额断言均为Resource13。正式Mac库实际SQLite3.51.0的172条签名/169函数名及38项Procedure与inventory的签名、类别、deprecated、读写mode和outputs一致。`pnpm check:docs`验证31方法/76类型/134页，`pnpm check:dependencies`含runtime-bundle测试通过；使用既有Node24.15.0/pnpm10.34.5，没有放宽engines或修改lock。
- **上游运行与本轮边界**：上游正式Linux包在1GiB/no-swap完成DELETE/WAL、五类边界各三轮，共30次FULL/30次同连接成功对照，以及普通SQL/Provider/历史回归，峰值288161792B、OOM0、TEMP为空且owned资源回收。Linux/macOS预验二进制与正式包逐字节相同，bookworm/glibc2.36依赖检查适用于该正式Linux二进制；这不是本轮KG OS Docker镜像的构建或MCP压力验收。本轮未重复v0.3.6的完整Docker/最高档压力，也未触及长期Dev/Prod数据。
- **真实交付状态**：依赖、断言与文档已修改并完成上述验证，KG OS本轮未Commit/Push/Tag/Release/部署，故仍没有该最终工作树新精确SHA的公开Ubuntu Validate/Docker CI。真实物理介质损坏、Commit后响应遗失及其余阶段门禁未据此闭合，Phase38继续`in_progress`。完整上游证据见[Lithograph补丁验收记录](https://github.com/bYiyLi/Lithograph/blob/main/docs/development/phases/22-high-performance-query-optimizer.md#v037-full-recovery)；本轮定向证据为本机Lithograph的`target/v037-full-recovery-evidence/kgos-*`，不得把候选预验或旧镜像结果冒称本轮正式Docker通过。

### 2026-11-14 Lithograph v0.3.7 正式 Docker 与 KG OS 全仓回归（同一未提交工作树）

- **验证对象与身份**：Yi Mac `main@b3b3c50` 加当前未提交工作树，固定正式 Lithograph **v0.3.7**、Profile `CY25-2026.08`、Storage Format **3**；本轮没有改写已经核验的升级版本、外部公共接口或事务语义。OpenClaw 独立源码目录 `/data/apps/KgosDev/validation/phase38-v037-20261114-isolated/src` 的 `Dockerfile.unified`、`scripts/lithograph-artifacts.mjs`、`internal/lithograph/types.go`、配额故障回归测试和 Cypher inventory 的 SHA-256 均与 Mac 当时内容相同，长期 Dev/Prod 数据未用于压力测试。
- **真实跨版本读写**：macOS arm64 正式包在 SQLite **3.51.0** 下，`scripts/phase38-query-baseline.py` 对相同 80 个匿名 Probe Node 的旧/新两种 MATCH 结果相同、两种路径均 **6 dbHits**（非生产 OOM 因果证明）。用正式 **v0.3.6** 创建 Source→EVIDENCES→Claim 并生成 immutable Commit，完整关闭连接后在**同一 SQLite 数据库**用正式 **v0.3.7** 打开：旧 Commit 保留原一条关系，新写入生成不同 Commit 且当前版本两条，旧 Commit 仍只返回一条，`PRAGMA integrity_check=ok`。
- **原始正式 Dockerfile 构建**：OpenClaw Linux amd64 使用仓库 `Dockerfile.unified`、现有 host 网络和镜像代理参数构建独立镜像 `kgos-phase38-v037-20261114:local`，镜像 ID **`sha256:88ab7442fb1ead714621d07bbed97230d4c2ea70a724546aae0e66f2dd460fed`**；正式 Lithograph Linux x64 归档的 SHA-256 **`762947714026873e8da5e2b9b4b04966e225f9dc9d663619339614e66836873d`** 由 Dockerfile 实际校验为 OK。Go 构建工具链仍受 Dockerfile 的 **1.27.4** 版本与归档哈希检查约束；这是隔离本地镜像，不是正式发行或长期 Dev/Prod 部署。
- **两轮最高档写压力（均 PASS）**：每轮独立 Docker Volume，`memory.max=1073741824`、`memory.swap.max=0`，**505 Binding**（5 Domain、50 Definition、450 Property）、**2002 Source/Claim Node**、**50 次串行 + 8 Branch×4 次并发关系 Patch**。第一轮串行/并发 P95 **376.84/3638.48 ms**、并发吞吐 **4.17 writes/s**、`memory.peak=323567616 B`；第二轮 **374.88/2779.10 ms**、**4.19 writes/s**、`memory.peak=307974144 B`。两轮 `oom_kill=0`、诊断 `dropped=0`；Stale Base 和无效端点返回原公共错误并保持 Head 不变，真实 SIGKILL 后 Head 和已持久化诊断仍可读取。不外推为无限规模或任意查询性能保证。
- **真实统一 MCP/SDK**：对上述**同一 v0.3.7 镜像**执行官方 `scripts/mcp-unified-docker-smoke.mjs`，实际 **31/31 SDK/MCP**、OAuth restart/refresh/revoke、单一非 root `kgosd` Web/API/MCP、无 Node.js 运行时、持久化与隔离清理全部通过。不是模拟 SDK 或复用 v0.3.6 旧镜像成绩。
- **诊断 SQLite 不可用的降级验证**：同一 v0.3.7 镜像，独立 1 GiB/no-swap、**505 Binding / 752 Node、20 串行 + 32 并发**，串行/并发 P95 **301.60/1810.35 ms**，峰值 **291606528 B**、`oom_kill=0`；诊断准确报告 `unavailable`，业务正常、Stale/错误端点回滚及 SIGKILL 后 Head 保持不变。由于有意使诊断不可用，不能声称其记录在重启后恢复。
- **Mac 完整质量门禁**：Node **24.15.0**、pnpm **10.34.5**、Go **1.27.4**、官方 Lithograph v0.3.7，`pnpm validate` **实际 exit 0**，包括全仓 Go Race、总语句覆盖率 **90.2%**、Go `govulncheck -test` 无已知漏洞、Vitest **95/95 文件**、Playwright **85/85 E2E**，MCP 文档/SDK 合同、类型、格式、构建、依赖许可证、差异与安全门禁通过。npm audit 有 **14 moderate + 4 low**，无 High/Critical；不报告成零 npm 漏洞。已有 Phase 38 `RESOURCE_ERROR` / 原始 SQLite code **13** 配额负例继续由全仓真实 Go 测试覆盖，原先 v0.3.6 的 `INTERNAL_ERROR` 缺陷未在本轮复现。
- **验证后清理与剩余边界**：回读两轮最高档及一轮诊断降级 JSON 均 `result=passed`，同镜像 SDK `31/31` 通过后，定向清理镜像与专用源码目录，重新验证 **`V037_ISOLATED_IMAGE_AND_DIRECTORY_CLEANUP=PASS`**；长期 `kgos-dev-mcp-1` 仍 **healthy**，未触及生产。本轮只是工作树代码/文档及本地/隔离验收：**未 Commit、Push、Tag、Release 或部署**；本轮新代码未取得其自身精确 Git SHA 的公开 Ubuntu Validate/Docker CI。真实物理介质损坏及 Commit 成功后客户端响应丢失的未知写结果亦未进行完整专项注入，Phase 38 保持 **`in_progress`**。

### 2026-11-14 Object Patch Commit 成功但 HTTP 响应丢失：故障回归与 Review（未提交工作树）

- **设计与范围**：沿用 [Object 单次事务与 strict baseState](../../design/object.md#object-公共调用合同)、[Relationship 内部编译](../../design/object.md#knowledge-relationship-的内部创建与查询成本) 和 [Observability confirmed/unknown](../../design/observability.md#关键业务事件)；不增加幂等 Key、自动 Mutation 重试、第二套提交记录或新公共错误码。先前 Lithograph v0.3.7 容量限制 `RESOURCE_ERROR`/SQLite 13、native COMMIT 拒绝、Constraint/Cancel/SIGKILL 回滚测试保持有效。本轮补的是**实际成功提交后、响应未送达调用方**，不是把调用前 Deadline 或 Commit 被 SQLite 拒绝冒充结果未知的写入。
- **新增真实网络边界测试**：`internal/daemon/phase38_lost_patch_response_integration_test.go` 的 `TestPhase38CommittedRelationshipPatchWithLostHTTPResponseIsNotReplayed` 在独立临时 KG OS Runtime 中执行真实已认证 `POST /api/v1/object/patch`。同一个 Patch **先声明 Relationship、再声明两个 Source/Claim 节点**，实际事务提交成功；测试包装器仅在完整 API Handler 生成 HTTP 200 及三份创建 Ref 后，通过 HTTP/1.1 `Hijack` 关闭对应 TCP 连接、丢弃响应，而不是提前取消数据库事务。真实 HTTP 客户端收到传输错误，没有读到成功结果；用 Branch Head 和真实 Graph Query 回读确认**两个 Node、一条 EVIDENCES Relationship、一个新 State**，同一原 `baseState` 的不安全重试收到 `409 STALE_BASE_STATE`，Head 与对象计数不变。
- **诊断结果和安全边界**：Kernel 才是 durable outcome owner；本测试观察到第一次 `business.operation.finished=committed` 和明确重试的 `rejected`，未把客户端未知结果错记成数据库回滚。客户端若发生断线，仍必须先读目标 Branch/History 再决定后续操作；测试**不证明任意网络错误、真实硬件损坏或未知时刻的 Commit 中断必然能确认结果**。它只证明服务端已成功提交但 HTTP 响应丢失的精确边界。
- **本轮测试与 Review**：先在测试夹具中发现并修正 Relationship 必需 `properties` 缺失、以及诊断断言需精确过滤 `business.operation.finished` 两项；没有削弱业务行为断言。正式 Lithograph v0.3.7 + Go 1.27.4，单次 `go test -tags=sqlite_fts5,lithograph_smoke -count=1 -run '^TestPhase38CommittedRelationshipPatchWithLostHTTPResponseIsNotReplayed$' -v ./internal/daemon` **exit 0**；`go test -race -tags=sqlite_fts5,lithograph_smoke -count=3 -run '^TestPhase38CommittedRelationshipPatchWithLostHTTPResponseIsNotReplayed$' ./internal/daemon` **exit 0**，三轮均实际执行、无跳过。随后同一工作树的完整 `pnpm validate` **exit 0**：Go 全仓 Race、90.2% 语句覆盖率、`govulncheck -test` 无已知漏洞、Vitest 95 文件、Playwright 85/85、类型/格式/MCP 文档/许可/差异/安全门禁通过；npm audit 仍有 **14 moderate / 4 low**、无 High/Critical。Review 未发现需改动生产事务/诊断路径的问题，新增代码仅为回归测试。
- **压力证据与剩余门禁**：本轮没有修改任何业务 Runtime 代码或正式 Lithograph v0.3.7 pin，故不重复此前**同一正式 v0.3.7 镜像**已通过的 OpenClaw Linux amd64 两轮 505 Binding/2002 Node/1 GiB/no-swap/50 串行+32 并发/SIGKILL、31/31 SDK/MCP 以及诊断不可用降级压力；实测指标和镜像身份均见前节。新增 HTTP 测试仅在 Mac 原生 Go 执行，**不宣称再次完成新的 Linux 镜像构建**。真实物理介质故障仍缺专项注入，且当前工作树尚未 Commit/Push，无法对本轮源码执行精确 SHA 的公开 Ubuntu Validate / Docker CI；不覆盖其它 Phase 36/37 工作树修改，不发布、不部署，Phase 38 **保持 `in_progress`**。

### 2026-11-14 Linux 真实文件系统 ENOSPC / Phase 38 存储故障验收（授权待交付）

- **与旧测试的区分**：之前的 `PRAGMA max_page_count` 属于 SQLite pager 配额，损坏文件头/截断属于关闭后测试镜像破坏；本轮在 **OpenClaw Linux amd64 受限隔离容器**中，使用独占 **16 MiB tmpfs** 实际将临时文件写到内核 `write(2)` 返回 **`ENOSPC`**，之后在同一个真实已暂存 Source→EVIDENCES→Claim 的显式 Lithograph transaction 上调用 `tx_commit`。这是实际 OS 文件系统空间耗尽，不是调用 SQLite PRAGMA 模拟；也不是对宿主硬盘执行破坏性物理测试。
- **安全边界**：新增 `internal/lithograph/phase38_enospc_integration_test.go` 限定 `linux && lithograph_smoke`、仅显式环境变量 `KGOS_PHASE38_ENOSPC_ROOT=/phase38` 时启用；验证测试文件系统类型为 `TMPFS_MAGIC` 且总容量在 8–32 MiB，拒绝向其他路径填盘。测试 Docker `--network none --memory 1g --memory-swap 1g --cpus 2 --tmpfs /phase38:rw,size=16m,mode=1777`；业务 SQLite/填充文件均位于此 tmpfs 下的自动清理临时目录。Mac 及普通 CI 因未启用该专用 fixture 而跳过 Linux 磁盘填充，不会向 `/tmp`、Workspace 或持久磁盘执行写满操作。
- **真实结果**：以原仓库 `Dockerfile.unified --target daemon-builder` 构建 Go **1.27.4** 和正式 Lithograph **v0.3.7** 二进制的独立 Linux amd64 测试镜像 `kgos-phase38-enospc-builder-20261114:local`，镜像 ID `sha256:8e0e5024c8032bb63d27bc2295f64adc45c7852d0fc153bee27fffcdabba4ab3`；测试源码与 Mac 当时 SHA-256 相同。实际 `os.File.Write` 收到 Linux `ENOSPC` 后，`Transaction.Commit` 明确失败且保留 Lithograph `RESOURCE_ERROR` / SQLite code **13**（native `SQLITE_FULL`），没有把存储失败覆盖成 `INTERNAL_ERROR`。解除文件系统占用后，Branch Head 未移动、原两个 Node/一条 Relationship 不残留；关闭并重开同一个数据库后结果仍未泄漏，写入恢复，`PRAGMA integrity_check=ok`。
- **可重复回归**：隔离 Linux 普通 `go test -tags=sqlite_fts5,lithograph_smoke -run '^TestPhase38LinuxTmpfsENOSPCKeepsRelationshipPatchAtomic$' -count=1 -v ./internal/lithograph` **exit 0**；随后同一正式引擎和独立 16 MiB tmpfs 上 `go test -race -tags=sqlite_fts5,lithograph_smoke -run '^TestPhase38LinuxTmpfsENOSPCKeepsRelationshipPatchAtomic$' -count=3 -v ./internal/lithograph` **exit 0**，三轮均实际执行、无 skip，且错误类别、Head/Graph/恢复行为相同。此前 macOS 正式 v0.3.7 的 Cancel/Deadline、页数配额、受损文件恢复定向回归本轮再次通过。未修改生产事务、错误映射或用户数据。
- **验收界限**：该真实 OS 失败与其他故障注入覆盖 Phase 38 A38-03 的资源错误、恢复和原子性边界；不宣称对真实硬件控制器损坏、任意瞬时 I/O 中断、介质不可修复坏块作了破坏性复现，也不因此推导绝对无 OOM。A38-08 仍要求**当前最终 Git SHA** 的公开 Ubuntu Validate/Docker CI，通过后再判定阶段 `done`。本轮提交/推送已经获准但尚未报告成功，不进行 Tag、Release 或 Dev/Prod 部署。
