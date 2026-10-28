# Phase 28：官方 Skill 清单收敛与通用 Skill 退役

## 当前目标与状态（D115/D117，2026-10-28）

**状态：`in_progress`**。当前待发布源码目标为 **四个官方 Skill：Ontology、Knowledge、VLog 与 Doctor**。原 Ontology/Branch 统一职责现由 `kgos-ontology-standards` 承担，D114 的临时名称 Modeling 已于 D117 更名；原 Knowledge/Retrieval/Maintenance 合并为 Knowledge。不恢复旧通用 `kgos`。

当前目标集合：

- `kgos-ontology-standards`
- `kgos-knowledge-standards`
- `kgos-vlog-standards`
- `kgos-doctor`

### 当前 Acceptance

- **A28-01 · 源码与公开打包清单**：这四个且仅四个 Skill 目录出现在当前源码、打包白名单、插件清单检查与 Doctor 发现目标；被合并的旧目录不作为新候选重复导出。
- **A28-02 · Ontology 合同**：Skill 与 `references/` 中的方法论、三组完整建模示例和简版模型确认模板均可发现，概念/实例、分类/Definition、身份与图关系决策受实际问题驱动；模型与关系查询通过真实实例验证。未获确认不得修改 Ontology、迁移或创建 Branch。无改动模型选型仍需确认；普通 Knowledge 写入不被阻断。兼顾 VLog 独立归属及官方模型库不可用的回退。
- **A28-02a · VLog 自包含模型**：Plugin 中 VLog Skill 的 `SKILL.md`、`references/ontology.md`、`references/cypher.md` 三项均可读取并对应同版源码，包含完整 Definition YAML 与可验证业务查询；源码的 `tests/` 只用于隔离测试，不进入公开包。用户库已有合适模型时不强制安装或覆盖参考本体。
- **A28-03 · 旧版本与迁移**：已发布 v0.3.5 保留原七 Skill 和对应安装资料；用户私人 Plugin 不自动更新，须按其已获授权的独立安装/迁移流程操作，保留用户定制和原有连接。
- **A28-04 · 真实客户端与发行**：最终还需新四 Skill 的实际安装/发现、MCP-only 可用性、只读与经授权知识写入/模型修改行为、修订后的发布物/安装手册及发布 CI 证据；未执行则不得标记完成。

本轮只处理源码与必要的设计、测试同步，不提交、推送、发布或修改现有私人 Plugin。先前七 Skill 的验证和阶段记录仍保留为历史证据。

## 2026-10-21 七 Skill 原始计划与实施证据（历史）

以下保留 D107 时期的七 Skill 计划、验收与执行记录作为历史依据；当前目标以上文 D115 为准。
<!-- cspell:words mcpserver -->

## 目标与当前状态

**状态：`in_progress`（2026-10-21）**。最终官方 Skill 清单为 **六个规范 Skill + 一个 `kgos-doctor`，共七个**。用户明确要求清理历史无用资源后，已删除仓库内的过渡 `plugins/kgos/skills/kgos/SKILL.md` 并修订其当前引用、安装说明和 MCP 指引；原先的“完成全部客户端验收后才删源码”实施顺序因这次明确授权调整，**不代表 Phase 25/27/28 客户端验收已经通过**。既有私人 Plugin 没有被自动卸载或更新，Commit/Push/Release/部署也未由此授权。

本阶段的**独立完成条件**仍是让官方 Plugin 的实际可用清单从旧通用 `kgos` 过渡为**准确七个**，在不丢失 MCP 自描述操作指引与真实客户端可用性的前提下安全完成私人安装迁移。**源码清理只是其中一项已完成工作**。六个规范的内容与实现归 [Phase 27](27-knowledge-standards-skills.md)，Doctor 归 [Phase 25](25-kgos-doctor.md)，本阶段不重新设计或重复实施七份 Skill，只负责清单收敛、操作文档覆盖、安装更新及迁移验收。

**设计真源**：[D107](../../design/decisions.md#d107-final-seven-official-skills) 规定唯一目标名单和退役条件；[MCP 目标方案](../../design/mcp.md#kgos-seven-skills) 拥有当前/目标差异、MCP 文档与 Plugin 合同；[D106 六个规范](../../design/mcp.md#kgos-standards-skill-suite)、[D104 Doctor](../../design/mcp.md#kgos-doctor-v1) 分别拥有各自职责。旧 Phase 15/16/23 的通用 `kgos`/私人 Plugin 交付属于历史；早期私人 Plugin 可能仍可用，不能回写为从未存在或已经自动迁移。

## 依赖和迁移约束

- **实际源基线**：私有 `plugins/kgos/skills/` 现在只有七个官方目录；旧通用 Skill 已从源码删除，原有操作指南逐项映射到 `kgos_docs` 和相应 Guide/SDK 文档。唯一 `plugins/kgos/INSTALL.md` 指导 MCP-only、七 Skill 私人候选包、Global Guidance 和 Doctor 验收。**公开候选包同样仅有七项，但用户账户内的旧私人 Plugin 尚未核实更新**。
- **基础工具独立可用**：依 [Phase 23](23-mcp-tool-taxonomy-and-docs.md)，`kgos_docs` 自描述 MCP Tool、五个 AI-facing Tool 与 SDK 方法可不经 Skill 使用；退役通用 Skill 不得削弱这一边界或把 SDK 31 方法重复制到七个规范 Skill。
- **阶段依赖**：Phase 25 的 `kgos-doctor` 与 Phase 27 的六个规范 Skill 均须通过目标客户端验收，才能最终关闭本阶段的安装与客户端迁移验收。源码层面的预先清理不替代该证据。两者可独立推进；已有只读盘点和文档覆盖检查不依赖私人 Plugin 更新。
- **权限与兼容**：私人 Plugin 绑定真实用户 MCP App ID；仓库模板变动不会自动更新既有安装。更新/替换用户私人 Plugin、Commit、Push 或发布需要各自授权，不因本迁移计划自行执行。`MCP-only` Plugin 可继续存在，但不是“第八个 Skill”。

## Feature 与实施顺序

| Feature | 应实施的工作 | 对应验收 |
| --- | --- | --- |
| **P28-00 现状和职责覆盖盘点** | 已逐条核对退役通用 `kgos` 仍有价值的操作指引，并映射到 `kgos_docs`、现行 MCP 行为或目标规范；后续仍需完整客户端复验 | A28-01、A28-02 |
| **P28-01 自描述文档补全（仅真实缺口）** | 已在所属 MCP Guide 补齐脚本返回/错误、Preview/Ancestry 分页说明并重新生成内嵌文档；不复制到七份规范、不新增专用 Tool、总规范或兼容别名 | A28-02 |
| **P28-02 最终清单候选包** | 待 Phase 25/27 对应真实客户端验收，用只有七个目标 Skill 的隔离候选私人 Plugin 包验证装配与真实客户端选用；不自动修改用户既有私人安装 | A28-01、A28-03 |
| **P28-03 通用 Skill 源码退役** | 已依用户明确授权清理仓库中旧 `skills/kgos/SKILL.md`，同步 `plugins/kgos/INSTALL.md`、MCP 指引及当前引用；新官方源码与导出均只有七项。**真实私人安装的旧文件需等候后续客户端验收和独立授权处理** | A28-02、A28-04 |
| **P28-04 真实客户端与最终 Review** | 检查 MCP-only 和含七 Skill 私人 Plugin 的工具调用、选择与只读/获授权写入；检查旧用户安装的迁移指导与失败恢复，跑相关质量门禁和最终 diff | A28-01–05 |

## Acceptance

### A28-01 · 七个且仅七个

- 最终官方 Skill 安装/发布清单按**集合**检查，恰为：`kgos-knowledge-standards`、`kgos-ontology-standards`、`kgos-retrieval-standards`、`kgos-branch-standards`、`kgos-vlog-standards`、`kgos-maintenance-standards`、`kgos-doctor`。
- 官方目标包与最新官方安装说明都不再出现可安装的通用 `kgos`、总规范、独立执行/Router Skill；不会因 `MCP-only` 模式或全局引导提示词额外计算一个 Skill。源码已清理；旧私人 Plugin 仍可能含通用 Skill，不能据此认定它已经在用户账户被卸载。

### A28-02 · 无通用 Skill 仍能正确使用 MCP

- 将已退役 `skills/kgos/SKILL.md` 的历史必要工具说明逐项映射到现行 `kgos_docs`/MCP 真实合同，特别是工具权限、SDK 参数与返回、State/Branch/分页、目标写入、失败或超时后先读实际 State 再决定重试。
- 对**未安装任何 Skill**的 MCP 客户端完成真实文档发现、只读查询、Ontology 查询、版本读取和相应错误处理；授权写入只在隔离环境进行，不能把“能看到 `kgos_mutate`”记为写入已验收。
- 仓库源码删除已依用户本次明确授权执行；**没有实际客户端覆盖证据时，禁止进一步卸载既有私人 Plugin 或宣称全部迁移验收完成**。仅修复已核实的文档缺口，避免构建新帮助系统。

### A28-03 · 七个 Skill 的独立职责与可选用性

- 现有 Phase 25/27 完成证据与目标客户端实际装配一致；六个规范分别提供自己的规范指导，`kgos-doctor` 只读诊断，复杂任务由外部 AI 按已授权 MCP 执行。
- 针对各自典型请求检查正确选择、相邻任务冲突、无 Skill 的 MCP 基础访问；不能因宿主未保证自动联动而声称已经自动调用多个 Skill，也不把 Skill 选择当作认证或访问授权。

### A28-04 · 通用 Skill 退役与私人安装安全

- **源码内**的过渡 `skills/kgos/SKILL.md` 及对应当前引用已在用户本次授权下清理。仍须核对新模板绑定真实已有 MCP App ID、读取当前 `kgos_docs` 并通过真实安装验收；移除前后保持 MCP Tool 名称、OAuth、Token、业务 Kernel、用户 Knowledge 数据和历史版本不变。
- 旧私人 Plugin 需要明确的**用户自行或获授权更新路径**，实际安装的旧 Release 不因仓库迁移而被声称自动更新或删除；若更新不受客户端支持，保留用户现有可用版本并报告限制，不擅自重建连接、覆盖授权或丢失数据。

### A28-05 · 审核、文档与完成证据

- 完成 Plugin 模板/安装说明与 MCP 自描述文档的必要同步、Skill 清单验证、真实目标客户端只读和受控写入/版本路径的定向测试、仓库要求的代码/文档质量检查及最终 diff Review；若变更触及 Docker/Go/发布路径，按仓库门禁补足对应本地/隔离 Docker/最终 SHA CI，不以旧阶段的 CI 代替新实现结果。
- Phase 25/27 已分别满足其独立验收；本 Phase 必须额外证明**最终七个 Skill** 的实际打包、正确选择与通用 Skill 退役，无故障回退要求通过现有用户安装/更新机制表达，不新增平行兼容层。
- 只有实际通过这些验收并保留对应证据，才允许标记 `done`；文档已设计 ≠ 七个 Skill 已创建 ≠ 通用 Skill 已退役 ≠ Plugin 已部署/发布。

## 评审与当前剩余任务

- 检查是否错误地把已经删除的通用 `kgos` 当成“第八个官方目标”，或把源码先行退役当成已有私人客户端整体验收；是否为了迁移引入额外执行/路由 Skill，或把六个规范/Doctor 的内容写到本 Phase 重新定义。
- 检查 `kgos_docs` 已包含必要的真实业务说明，实际客户端能否在没有旧 Skill 时完成安全操作；不能使用模板源码和模拟回答冒充真实 MCP/ChatGPT 通过。
- 检查旧私人 Plugin 是否确实保持独立、已有用户连接和数据没有被自动修改；任何失败要保留实际状态和未关闭验收项。

**当前证据**：Phase 27 六规范与 Phase 25 Doctor 均已有源码，官方仓库与分发生成器均只保留七个目标 Skill；原通用操作指引的 MCP 文档映射见下方专项记录。七 Skill 的**真实私人客户端安装/选择/写入**仍未完成，既有私人 Plugin 未改动，Phase 保持 `in_progress`；本次未提交、未推送、未部署。

## 2026-10-21：旧通用 Skill 源码清理与操作指引核对

用户明确要求清理历史旧 Skill。只清理 KG OS 仓库中不再属于官方清单的 `plugins/kgos/skills/kgos/SKILL.md` 及其失效的**当前**引用；不改写旧 Phase 的实际验收历史，不涉及任何真实用户私人 Plugin、Knowledge Base、Branch、Token、Web 开发改动或独立 Lithograph 仓库。

| 旧通用 Skill 的必要内容 | 当前唯一操作说明与确认 |
| --- | --- |
| 工具发现、五个 AI Tool、SDK 对象与只读/读写分界 | `kgos_docs` 的 `index.md` / `guides/index.md`、MCP Tool schema 与 `guides/graph.md`；`kgos_query` 只读，`kgos_mutate` 需实际授权 |
| JS 函数体、显式 JSON 返回、资源预算、流与脚本错误 | `guides/index.md` / `guides/errors.md` 与对应 SDK 方法页；本次补齐旧入口中仍有价值的限制和 catch 后错误语义 |
| 完整 Ontology/Commit 发现、分页及版本一致性 | `guides/reading.md`、`guides/evolution.md`；本次补齐 Preview 首 300 行、绝对偏移、`viewRevision` 过期与 DAG 分页注意事项 |
| Branch Head、immutable State、Patch、Commit Message、Merge | `guides/index.md`、`guides/objects.md`、`guides/evolution.md` 与相关 SDK 页；写入前先解析实际目标，单次 Patch 与多次调用的事务边界不同 |
| 中断/超时/部分成功及并发控制 | `guides/errors.md` / `guides/evolution.md`；未知写入先回读目标 State/History/Session，不盲目重试 |
| Skill 选择、客户端安装/更新及是否实际激活 | 七个独立 Skill 的 `SKILL.md`、`plugins/kgos/INSTALL.md` 和 `kgos-doctor` D3；文件存在、安装、加载与实际使用分别验证 |

**本轮核对边界**：

- 私有源码 `plugins/kgos/skills/` 已只剩七个目录；`scripts/render-kg-releases.mjs` 既有白名单也只导出这七项，唯一 `INSTALL.md` 路径未变化。新增分发回归断言要求私有源码目录与公开候选目录的七项集合完全一致。
- `docs/guide/mcp-guides/` 是 MCP `guides/` 页的维护输入，本轮新增的内容已同步至 `internal/mcpserver/docs/guides/`；不在旧 Skill 或七个规范中重复维护 SDK 接口手册。
- 在当前实际 `kgos-dev` MCP 连接上，直接使用独立 `kgos_docs` 读取 `guides/index.md` 与 `guides/errors.md`，并通过 `kgos_query` 实际只读取得 `evolution.overview()` 的 State/默认 Branch。这说明**已部署的 MCP-only 基础读取可用**，不意味着本轮改过的内嵌文档已部署、七个 Skill 在 ChatGPT 自动选择成功或读写/版本路径已全部验收。
- 新的真实私人客户端七 Skill 选用、隔离环境中经授权的写入/版本路径及已安装旧私人 Plugin 的受控升级，继续保留为 A28-02–05 与 Phase 25/27 的未完成门禁；不得把源码删除当作发布、私人卸载或 Phase `done`。
