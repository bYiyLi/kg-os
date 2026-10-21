# Phase 28：KG OS 官方七 Skill 清单收敛与通用 Skill 退役

## 目标与当前状态

**状态：`planned`（2026-10-20，仅完成本迁移阶段的目标设计和开发计划）**。最终官方 Skill 清单确定为 **六个规范 Skill + 一个 `kgos-doctor`，共七个**；过渡版 `plugins/kgos/skills/kgos/SKILL.md` 仍保留，新增 Skill 的实际创作与验收由 Phase 25/27 维护。Phase 27 六规范与 Phase 25 Doctor 的目标七 Skill 源码现已齐备，但不等于最终清单迁移与真实客户端验收已完成。**本阶段未删除通用 Skill、未更新用户私人 Plugin、未提交/推送/部署。**

本阶段的**独立完成条件**是让官方 Plugin 的最终 Skill 清单从现有通用 `kgos` 过渡为**准确七个**，在不丢失 MCP 自描述操作指引与真实客户端可用性的前提下安全退役通用 Skill。六个规范的内容与实现归 [Phase 27](27-knowledge-standards-skills.md)，Doctor 归 [Phase 25](25-kgos-doctor.md)，本阶段**不重新设计或重复实施七份 Skill**，只负责清单收敛、操作文档覆盖、安装更新及迁移验收。

**设计真源**：[D107](../../design/decisions.md#d107-final-seven-official-skills) 规定唯一目标名单和退役条件；[MCP 目标方案](../../design/mcp.md#kgos-seven-skills) 拥有当前/目标差异、MCP 文档与 Plugin 合同；[D106 六个规范](../../design/mcp.md#kgos-standards-skill-suite)、[D104 Doctor](../../design/mcp.md#kgos-doctor-v1) 分别拥有各自职责。旧 Phase 15/16/23 的通用 `kgos`/私人 Plugin 交付属于**历史及目前仍可用的实现**，不回写为从未存在。

## 依赖和迁移约束

- **实际源基线**：`plugins/kgos/skills/kgos/SKILL.md` 仍负责 `kgos_docs` 路由与工具选择、`kgos_query`/`kgos_mutate` 读写区分、State/Branch/Commit/分页与未知写入恢复等指引；`plugins/kgos/INSTALL.md` 已补充 MCP-only、七 Skill 私人候选包、Global Guidance 和 Doctor 验收路径。**官方模板仍保留旧通用 Skill，私人 Plugin 尚未更新**，本阶段状态与正式退役门槛不变。
- **基础工具独立可用**：依 [Phase 23](23-mcp-tool-taxonomy-and-docs.md)，`kgos_docs` 自描述 MCP Tool、五个 AI-facing Tool 与 SDK 方法可不经 Skill 使用；退役通用 Skill 不得削弱这一边界或把 SDK 31 方法重复制到七个规范 Skill。
- **阶段依赖**：Phase 25 的 `kgos-doctor` 与 Phase 27 的六个规范 Skill 均已实际完成相应目标客户端验收，才能完成本阶段的最终模板收敛与通用 Skill 移除。两者可独立推进；本阶段早期只读盘点和文档覆盖检查无需等待。
- **权限与兼容**：私人 Plugin 绑定真实用户 MCP App ID；仓库模板变动不会自动更新既有安装。更新/替换用户私人 Plugin、Commit、Push 或发布需要各自授权，不因本迁移计划自行执行。`MCP-only` Plugin 可继续存在，但不是“第八个 Skill”。

## Feature 与实施顺序

| Feature | 应实施的工作 | 对应验收 |
| --- | --- | --- |
| **P28-00 现状和职责覆盖盘点** | 逐条核对当前通用 `kgos` 所有仍有价值的操作指引，定位它们在 `kgos_docs`、现行 MCP 行为或目标规范中的权威归属；识别重复和迁移缺口 | A28-01、A28-02 |
| **P28-01 自描述文档补全（仅真实缺口）** | 若存在必须依赖旧 Skill 才能正确操作的当前缺口，仅在对应 MCP Guide/SDK 说明中做必要补全、正确验证；不复制到七份规范、不新增专用 Tool、总规范或兼容别名 | A28-02 |
| **P28-02 最终清单候选包** | 在 Phase 25/27 已完成后，用隔离的候选私人 Plugin 包验证七个目标 Skill 的装配与真实客户端选用；不提前修改现有通用 `kgos` 模板或用户私人安装 | A28-01、A28-03 |
| **P28-03 通用 Skill 受控退役** | 候选包及无需旧 Skill 的真实查询/修改/版本任务均验收成功后，才更新**官方模板**为最终七 Skill、移除旧 `skills/kgos/SKILL.md`，同步 `plugins/kgos/INSTALL.md`、相关指南与旧引用；不操作用户私有安装实例 | A28-02、A28-04 |
| **P28-04 真实客户端与最终 Review** | 检查 MCP-only 和含七 Skill 私人 Plugin 的工具调用、选择与只读/获授权写入；检查旧用户安装的迁移指导与失败恢复，跑相关质量门禁和最终 diff | A28-01–05 |

## Acceptance

### A28-01 · 七个且仅七个

- 最终官方 Skill 安装/发布清单按**集合**检查，恰为：`kgos-knowledge-standards`、`kgos-ontology-standards`、`kgos-retrieval-standards`、`kgos-branch-standards`、`kgos-vlog-standards`、`kgos-maintenance-standards`、`kgos-doctor`。
- 官方目标包与最新官方安装说明都不再出现可安装的通用 `kgos`、总规范、独立执行/Router Skill；不会因 `MCP-only` 模式或全局引导提示词额外计算一个 Skill。验收前仍保留过渡 Skill，不因期望目标删掉实际可用的现有资源。

### A28-02 · 无通用 Skill 仍能正确使用 MCP

- 将当前 `skills/kgos/SKILL.md` 所有必要的工具使用说明逐项映射到现行 `kgos_docs`/MCP 真实合同，特别是工具权限、SDK 参数与返回、State/Branch/分页、目标写入、失败或超时后先读实际 State 再决定重试。
- 对**未安装任何 Skill**的 MCP 客户端完成真实文档发现、只读查询、Ontology 查询、版本读取和相应错误处理；授权写入只在隔离环境进行，不能把“能看到 `kgos_mutate`”记为写入已验收。
- 没有真实覆盖证据时禁止删除旧 Skill 或宣称“通用 Skill 已无必要”；仅修复已核实的具体文档缺口，避免构建新帮助系统。

### A28-03 · 七个 Skill 的独立职责与可选用性

- 现有 Phase 25/27 完成证据与目标客户端实际装配一致；六个规范分别提供自己的规范指导，`kgos-doctor` 只读诊断，复杂任务由外部 AI 按已授权 MCP 执行。
- 针对各自典型请求检查正确选择、相邻任务冲突、无 Skill 的 MCP 基础访问；不能因宿主未保证自动联动而声称已经自动调用多个 Skill，也不把 Skill 选择当作认证或访问授权。

### A28-04 · 通用 Skill 退役与私人安装安全

- 仅在 A28-01–03 通过后，移除**官方模板中的**过渡 `skills/kgos/SKILL.md` 及对应引用，核对新模板仍能绑定真实已有 MCP App ID、读取当前 `kgos_docs` 并通过真实安装验收；移除前后保持 MCP Tool 名称、OAuth、Token、业务 Kernel、用户 Knowledge 数据和历史版本不变。
- 旧私人 Plugin 需要明确的**用户自行或获授权更新路径**，实际安装的旧 Release 不因仓库迁移而被声称自动更新或删除；若更新不受客户端支持，保留用户现有可用版本并报告限制，不擅自重建连接、覆盖授权或丢失数据。

### A28-05 · 审核、文档与完成证据

- 完成 Plugin 模板/安装说明与 MCP 自描述文档的必要同步、Skill 清单验证、真实目标客户端只读和受控写入/版本路径的定向测试、仓库要求的代码/文档质量检查及最终 diff Review；若变更触及 Docker/Go/发布路径，按仓库门禁补足对应本地/隔离 Docker/最终 SHA CI，不以旧阶段的 CI 代替新实现结果。
- Phase 25/27 已分别满足其独立验收；本 Phase 必须额外证明**最终七个 Skill** 的实际打包、正确选择与通用 Skill 退役，无故障回退要求通过现有用户安装/更新机制表达，不新增平行兼容层。
- 只有实际通过这些验收并保留对应证据，才允许标记 `done`；文档已设计 ≠ 七个 Skill 已创建 ≠ 通用 Skill 已退役 ≠ Plugin 已部署/发布。

## 评审与当前剩余任务

- 检查是否错误地把 `kgos` 过渡资源当成“第八个官方目标”或提前删除；是否为了迁移引入额外的执行/路由 Skill，或把六个规范/Doctor 的内容写到这一个 Phase 重新定义。
- 检查 `kgos_docs` 已包含必要的真实业务说明，实际客户端能否在没有旧 Skill 时完成安全操作；不能使用模板源码和模拟回答冒充真实 MCP/ChatGPT 通过。
- 检查旧私人 Plugin 是否确实保持独立、已有用户连接和数据没有被自动修改；任何失败要保留实际状态和未关闭验收项。

**当前证据**：本阶段只有设计和迁移计划；Phase 27 六规范与 Phase 25 Doctor 均已有源码，但最终七 Skill 的真实安装/整体验收尚未完成。通用 `kgos` 文件仍存在且可供当前 Plugin 使用，本阶段保持 `planned`，不能把其它阶段的单项源码交付当作清单收敛或通用 Skill 退役。
