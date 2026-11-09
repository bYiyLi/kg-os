# Phase 37：Ontology Binding 增量编译与 Knowledge Patch 写入优化

**状态：`in_progress`（核心实现、本地门禁及 OpenClaw Linux 隔离验收已通过；公开 CI 待提交/推送授权）。** 2026-11-09 用户授权设计、开发、性能测试及持续 Review。源代码尚未被提交、推送或部署，不冒称 CI/生产验收。

## 目标与依据

修复 `Object Patch` 对未修改 Ontology 的 505 个内部 Binding 无条件执行约 505 次 Lithograph `SET` 的实现缺陷。目标是纯 Knowledge Patch **0 次内部 Binding 写入**，Ontology Patch 只修改变化的内部元数据和关系，同时维持单事务原子性、历史身份、Schema/Knowledge 合同及 State 一致性。

设计真源：[Ontology Binding 与连续性](../../design/ontology.md#binding-record-与-schema-locator)、[Ontology Patch 增量语义](../../design/ontology.md#patch-到真实变化)、[Object Patch](../../design/object.md)、[Implementation 增量编译](../../design/implementation.md#增量-binding-编译与纯-knowledge-patch)。依赖 Phase 02/04、Phase 07（Merge）、Phase 35（Trace）已具备的能力；不以 Phase 35 整体关闭为前置，不修改 Lithograph。

## 实施范围与验收

| 工作 | 验收条件 |
| --- | --- |
| P37-01 Knowledge 与 Ontology 写入边界 | 对 Ontology logical no-op（包括 Knowledge-only Add/Update/Delete）不执行 Binding sync，也不重复执行 staged Ontology 全量读取与 5 项计数；Knowledge 独立 read-back；Knowledge 成功提交、失败回滚、stale base 无提交；纯 no-op 不创建 Commit |
| P37-02 增量内部 Binding 写入 | 仅 `name/title/description` 变化的现存 Domain/Definition/Property Binding 执行 `SET`；Definition kind 不允许变更；新增/删除按真实差量，未改元数据的 Binding 不写入，rename 保留稳定 element ID |
| P37-03 Domain membership 与覆盖 | 按稳定端点 ID 差量 reconcile，不变端点不写入；同名 Definition 删除重建时即使 `includes` 文本相同也重连；现存 membership ID 不变；Domain/Definition/Property rename、删除、同 Patch 新建、关系引用派生均正确 |
| P37-04 安全与版本合同 | 单事务含 Knowledge+Ontology 的混合 Patch、Schema/Constraint/Index 与数据改写、失败回滚、Staged Snapshot 校验、Branch/History/Diff/Merge 行为保持现有合同；同一 Branch 的 8 路同 baseState 并发只能一个提交，其余必须 `STALE_BASE_STATE`，无部分写入且旧 State 不变 |
| P37-05 生产规模回归 | 隔离真实 Lithograph 使用至少 505 个内部 Binding，Knowledge-only Patch 不执行 staged Ontology 重读与 Binding 基数统计，观察数据库 `lithograph.execute` 数量不随 Binding 数线性增加；记录实际次数及改动前后差异，避免用 Mock 结果代替 |
| P37-06 质量与 Review | Go 定向、race、Go 覆盖率（≥90%）、完整 `pnpm validate`、真实扩展集成与独立源码/文档 Review；修复发现并重跑受影响检查；`git diff --check`、文档链接/引用、状态确认 |
| P37-07 隔离部署与发布门禁 | 已在 OpenClaw 用正式 Dockerfile 构建 Linux amd64 镜像；1 GiB/no-swap 隔离容器通过 31/31 SDK 与重启/持久化 Smoke；505 Binding 下两轮 671 请求性能测试通过，包含独立 Branch 吞吐及同 Branch strict-base 竞争；无意外失败、无 OOM；临时资源清理完成。公开 CI 仍需提交/推送授权 |

## 实施顺序

1. 从现行 `patch_execute.go` 的 `isNoOp` 判定限定内部 Graph sync，并且只对 Ontology 有变化的事务执行 staged Ontology 全量验证；Knowledge-only 保留 staged Knowledge read-back。
2. 在 `compiler_internal.go` 比较旧/新 Binding 的有效元数据；只写变化对象，membership 的端点 ID 未变时不发写语句，不增加持久化状态或配置。
3. 增加真实 Lithograph 的 Knowledge-only/505 Binding 计数和改名、领域关系、失败路径回归，复用既有 Patch 测试工具及 Trace 收集。
4. 运行全套必要质量门禁与隔离验收；检查最终 diff 并针对 Review 缺陷修正；同步本文件的实证结果与路线状态。性能测试入口：Linux amd64 上设置 `KGOS_PHASE37_PERF_IMAGE=kgos-phase37-perf:local` 后运行 `pnpm test:phase37:performance`；默认 1 GiB/no-swap、505 Binding、20 轮串行、2 路与 8 路独立 Branch 并发各 20 轮，最后执行 8 路同 Branch、同 baseState 竞争。

## 边界和风险

- 本次不是取消 Ontology 一致性校验；`validateStagedSnapshot`、Binding coverage、Graph Type、受影响 Knowledge 的安全校验继续有效。
- 单次业务 Patch 在未改变业务结构时应减少内部写入，不承诺总 Cypher 调用数为零（仍有读取与校验）。
- 不能仅凭从 548/534 次调用下降证明 OOM 根治。Linux 的 1 GiB OOM、容器内存峰值和 Lithograph native 缓存/事务峰值须分别测试；不得擅改生产内存限制或将生产诊断库当 fixture。
- 只修改 KG OS 源码、设计和计划；不修改 Lithograph 仓库、正式知识库、生产实例或分发/发布资产。

## 实施和验收证据

- 2026-11-09 初始代码审阅：`patch_execute.go` 已提供 Ontology `isNoOp()`；`compiler_internal.go` 对所有现存 Domain/Definition/Property Binding 无条件 `SET`，Domain membership 已具备稳定关系 ID 的差量处理；当前本体规模（生产 `main`）为 6 Domain、108 Definition、391 Property，合计 505 个内部 Binding。生产 OOM 两次对应 548 / 534 个 Lithograph 执行 span；由于峰值归因未分析完整，这些仅证明修复的调用冗余，不构成 OOM 根因单因果证明。
- **实现（本地提交，尚未推送）**：`patch_execute.go` 对 Ontology logical no-op 跳过 `syncInternalGraph`，继续执行 staged internal graph / snapshot / Knowledge 校验；`compiler_internal.go` 保留 ID mapping、增删与 Domain 端点差量，同名 Binding 的 `name/title/description` 未变化时不再执行重复 `SET`。没有新增 API、持久状态、依赖或更改 Lithograph 仓库。
- **Review 发现并修复**：不能因 Domain 的 `includes` 文本完全相等就跳过 membership 计算；同一 Patch 删除旧 Definition 并重建同名 Definition，会产生新的内部 Binding ID。已保留基于 element ID 的增量 reconcile，并新增真实数据库回归 `TestPhase37SameNameDefinitionRecreationUpdatesDomainEndpoint`，验证新边端点、没有重复、旧 State 仍可读，已通过。
- **进一步减少 Knowledge-only 调用**：`patch_execute.go` 现在仅在 Ontology 有变化时执行 `validateStagedInternalGraph` 与 `validateStagedSnapshot`。纯 Knowledge Patch 的 base Ontology 已在事务前固定 State 上读取、校验，事务中不改变 Schema/Graph Type/Binding，因此重复 staged Ontology 读取不是必要门禁；`validateStagedKnowledge` 仍对每个被修改对象进行 staged read-back 与 canonical equality。真实 505 Binding 回归的目标调用数更新为 Knowledge Add/Update/Delete **17/19/20**，Ontology Definition/Property/Domain 修改仍 **27/27/27**。
- **真实 Lithograph v0.3.4 本地回归**：`TestPhase37KnowledgePatchDoesNotRewrite505Bindings` 使用全新临时 Instance 创建 5 Domain + 50 Definition + 450 Property = **505 Binding**，对 Knowledge Add/Update/Delete、单个 Definition Title、Property Title、Domain membership 分别记录的 `lithograph.execute` Span 数为 **28 / 30 / 31 / 27 / 27 / 27**；六条 Patch、内部 Binding count 与稳定 ID、修改后元数据均通过，Trace 无截断。实际 SQL 调用量中还包括完整 staged 校验，**不等于有 27 次 Binding 写入**；本阶段的 Knowledge Binding 写入路径在 `noOp` 判定下为零。旧生产 548/534 是不同输入的故障请求，仅用于定位冗余工作，不作为严格同输入性能对照。Knowledge-only 由原 28/30/31 降至 17/19/20，减少的 11 次是重复 staged Ontology 校验；仍保留 baseState Ontology 读取、Knowledge 写入和 staged Knowledge read-back。
- **其他本地回归**：新增 `TestInternalMetadataChanged` 覆盖 nil/empty、同值指针、改名、title/description 新增、删除及修改。原有 Domain membership identity、Definition/Property/Relationship rename、mixed Patch、失败回滚、Branch/History/Diff/Merge 场景在完整 Go native 测试与 race 中通过。新增 Phase 37 三项真实扩展测试在最终 Go Race / Coverage 套件中通过：505 Binding fixture、同名 Definition 删除重建，以及 8 路同 Branch strict-base 并发竞争。
- **公开 CI 覆盖率问题与修复**：上一轮公开 main Run `42498494390` 的 Validate 在 coverage 阶段因分支覆盖率 **89.89%** 低于既有 **90%** 门槛失败；本机 Phase 37 全量验证的覆盖率为 **90.11%**，余量不足。未降低门槛；新增 Domain Overview 非对象、Relationship Definition、超页、空名称和 items 超 total 的真实回归，补齐缺失图端点与 G6 标签渲染、ThemeToggle 已选/切换两种交互，并保留 BFS 原有安全兜底。最终完整 `pnpm validate` 的本机 Web 分支覆盖率为 **90.31%**，高于既有 90% 门槛。
- **Mac 全仓门禁（最终工作树）**：使用 Node **24.15.0**、pnpm **10.34.5**、Go **1.27.3**、Lithograph **v0.3.4**、现有 Jieba 构建，最终 `pnpm validate` **退出 0**。Go 普通测试、race、漏洞检查与语句覆盖率 **90.1%** 通过；Web 分支覆盖率 **90.31%**；TypeScript 类型覆盖率 **99.79%**；MCP 合同 4/4；Playwright **85/85**；依赖、许可证、密钥、Markdown、拼写、Lint、Knip、重复检测和 `check:diff` 均通过。生产依赖审计无已知漏洞；全量审计有 3 low / 8 moderate，无 high，符合门禁。
- **OpenClaw Linux 镜像构建与 Smoke**：将当前工作树同步至 `/data/apps/KgosDev/src/KGOS`（不含 Git 元数据、私有配置、数据库、构建缓存及本地依赖），使用仓库 `Dockerfile.unified` 和固定基础镜像构建 `kgos-phase37-perf:local`。镜像 ID `sha256:2c0b84caf6f3d1d5792f650e34a95d229e575c211f7516069199c604ba5bfc5c`，Linux amd64，62,858,441 bytes。Docker Smoke 在 `--memory=1g --memory-swap=1g`（无容器 Swap）及 host-network 隔离下退出 0：非 root、无 Node 运行时、单一 `kgosd`、Web/API/MCP、MCP daemon SDK **31/31**、OAuth restart/refresh/revoke、持久化与清理均通过。为绕开宿主缺失的 `docker0`，只对临时测试容器使用 host network；未修改或重启 Docker daemon。
- **OpenClaw Linux 505 Binding 压力测试（两次独立运行）**：宿主 12 vCPU / 8 GiB RAM / 无宿主 Swap；每次在 1 GiB/no-swap 容器和临时 Volume 中创建 5 Domain + 50 Definition + 450 Property（505 Binding），先预热，再测试 3 次 Ontology 修改、20 轮串行 Knowledge Add/Update/Delete（60 次）、2 路并发各 20 轮（120 次）、8 路并发各 20 轮（480 次）。每轮共 **663 个 Patch 请求**，两轮合计 **1,326 个请求**；每轮 Trace 全部成功、`failedRequests=0`。每笔 Knowledge Add/Update/Delete 的 `lithograph.execute` 次数始终为 **17/19/20**，Ontology Definition/Property/Domain 修改各 **27** 次。
- **Linux 性能数据**：最初两轮 663 请求基线的 cgroup `memory.peak` 分别 **354.66 MiB**、**349.32 MiB**。加入同 Branch 竞争后的两轮各 **671 个 MCP Patch 请求**（含 8 个同 Branch 请求），峰值分别 **358.89 MiB**、**375.91 MiB**，均低于 1 GiB；两轮均 `oom=0`、`oom_kill=0`、`oom_group_kill=0`、`OOMKilled=false`、`RestartCount=0`，退出码 0、`failedRequests=0`，每轮另有 7 个被合同预期的 `STALE_BASE_STATE` 拒绝。独立 Branch 8 路并发 480 次写入的端到端工作流吞吐分别 **7.34**、**7.17 writes/s**；2 路并发 120 次分别约 **4.09**、**4.0 writes/s**；串行 60 次约 **2.17 writes/s**。8 路独立 Branch 并发服务端 Trace p95：Add **1.17–1.55 s**、Update **1.28–1.48 s**、Delete **1.42–1.46 s**。每轮同 Branch 8 路竞争均为 **1 成功 + 7 个 `STALE_BASE_STATE`**，端到端耗时 **463 ms / 384 ms**，最终 Branch Head 等于唯一成功 Commit，图中恰好一条新 Knowledge，固定 base State 中仍为 0 条。竞争阶段的 cgroup 当前内存约 **303.37 MiB**、**326.25 MiB**；文件缓存属于 cgroup file memory，不等于匿名堆持续泄漏。吞吐计时包含 Branch Head 读取及 Update 前的对象读取，代表 MCP 工作流吞吐，不是纯 SQL 微基准。独立 Branch 并发 Worker 共享同一临时数据库；同 Branch 竞争另行按同一 baseState 测试。
- **同一 Branch 并发验收**：新增 `TestPhase37ConcurrentObjectPatchesOnSameBranchUseStrictBaseState`，使用真实 Lithograph、8 个同步启动的 Kernel Patch，全部基于同一 Branch Head；`pnpm test:go:race` 完整 native/race 套件通过。OpenClaw MCP 性能脚本再以同样的 8 路同 Branch / 同 baseState 竞争独立运行两次：每轮恰好 1 次提交、7 次 `STALE_BASE_STATE`，Trace 记录 1 succeeded + 7 stale，未出现其它错误；最终 Branch Head 与唯一胜者 Commit 相同，目标 Label 下只有 1 个 Knowledge，旧 base State 仍为 0 个。
- **临时资源与长期服务**：两轮结束后均无残留 `kgos-phase37-perf-*` 容器或 Volume；长期 KG OS Dev、小说项目、Nexum、Neo4j、WeaveNovel 等容器均仍在运行，未重启。OpenClaw `/docker` 最后为 125 GiB 总量、31 GiB 已用、89 GiB 可用（26%）。镜像仅留在 OpenClaw 本机 `kgos-phase37-perf:local`，未推送仓库；未升级长期 Dev/Prod。
- **外部交付边界**：用户于 2026-11-09 明确授权保留 GitHub `bYiyLi/kg-os` 当前 `PUBLIC` 状态，直接推送源码并发布新版本；据此不修改仓库可见性。已核对当前正式发行 `v0.3.19`，下一补丁版本选定 `v0.3.20`，源/公开同名 Tag 均不存在，公开二进制分发门禁 `KGOS_BINARY_DISTRIBUTION_APPROVED=true`。本轮 Push、候选 CI、不可变 Tag、正式 Release、镜像及官网归档仍按各自真实回执验收，不把用户授权或本地准备视为已发布。
