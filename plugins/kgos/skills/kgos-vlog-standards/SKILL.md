---
name: kgos-vlog-standards
description: Record and review important KG OS system events, decisions, operations, verification and reusable lessons with truthful provenance and continuity. Use the optional event-centered graph Ontology and tested Cypher examples when needed. Not for ordinary domain facts, schema mutation, scheduling or environment diagnosis.
---

# KG OS VLog 规范

VLog 是系统活动的专业知识记录，不是调用流水账、固定工作流或 Kernel 内置日志服务。每轮主动检查和日常维护的触发由 Global AI Guidance 负责；本 Skill 只约束系统记录的选择、语义、证据和演进。

## 1. 确定记录范围与知识世界

- 保存经确认的重要系统决定、故障与变化、实际任务执行及验证结果、可复用技术经验；有明确记录要求的无变化巡检也可如实记录覆盖和结果。正常工具回执、重复对话或每次 Commit 不自动成为独立 VLog。
- 先核对目标 Knowledge Base 中的 `branch/vlog`、当前 State、真实 Ontology 和相关旧记录。普通业务事实仍归原知识世界；不得把缺失的 `vlog` 分支静默替换为 `main`。
- 已有模型能准确表达就复用。需要创建 Branch 或调整模型，先遵守 `kgos-ontology-standards` 的方案展示与用户确认；普通已有模型下的 VLog 内容操作在获准范围内自主完成。
- 需要讨论或采用事件本体，或现有模型确有表达缺口时，按需读取 [事件本体参考](references/ontology.md)；只需要查询时按需读取 [业务 Cypher](references/cypher.md)。模型仅为可选参考，不因安装 Skill 自动入库。

## 2. 判断事件身份与事实边界

- 区分决定/计划、实际事件、一次操作或尝试、执行回执、独立验证及其结果。计划不等于执行，执行成功不等于效果通过，验证结论只适用于实际环境、版本与范围。
- 同一事件可以有多次尝试和后续验证；真实不同的执行与失败不能被最后一次成功覆盖，同一次执行的重复报告不应制造新事件。事件、任务和执行身份按真实来源与范围核对，不由标题、时间相近或不同 Agent 数量推断。
- 本体通过 `Event -[:HAS_TYPE]-> Concept` 区分部署、故障、验证等类型；**新增事件类别优先创建 Concept Knowledge**，不为每个类别新增 Node Definition。计划尚未发生时不伪装为已发生 Event。

## 3. 真实性、时间与来源

- 记录实际发生的事、关联对象、发生/观察时间、影响范围、执行与验证证据及仍未知的部分。不编造结果、根因、身份、时间或来源；用户陈述可以保存为用户报告，不能冒充 AI 独立验证。
- 涉及其它知识世界或外部系统时，明确来源 Instance、Branch、对象和相关固定 State 的角色（修改前、修改后、验证），**分别于 VLog 本次写入 State**。来源定位字符串不是跨 Branch/Instance 的 Graph Relationship；只连接目标 Snapshot 内真正存在的节点。
- 不为凑字段造 Time、Place 或 Source 节点：简单时间可用 Event 属性；地点必须是真实空间位置，服务环境属于 Entity；证据需具备独立引用或关联需求时再建 Source。敏感原文、凭证和无权披露内容不得带入记录。

## 4. 新增、补充与纠正

- 先比对相关记录与实际事件身份；有新事件或独立执行时按既有模型保存，有同一事件进展/补充验证时延续相应记录，原记载错误时纠正，不把纠错当作发生过一次业务变化。
- 没有新信息就复用。来源冲突而无法裁决时保留归属与未决，不能按最新文本、单一回执或相似度选定结论。
- 具体 Knowledge 增删改、身份/关系匹配、并发及恢复遵循 `kgos-knowledge-standards` 和当前 `kgos_docs`；本 Skill 不复制第二套 API、事务或 Cypher 手册。

## 5. 核实与交付

- 写入后必须按实际返回 State 回读记录及必要关系，确认目标 `branch/vlog`、身份、内容和来源定位。源任务执行、独立验证、VLog 写入及写后回读属于四种不同结果，不得相互替代。
- 超时或回执未知先核对实际记录，不随机换键重复写入；VLog 保存失败不得触发重做已完成的源操作。不为普通记录的保存成功再创建一条自我记录。
- 报告实际保存与验证结果；用户只要求讨论或只读评审时不写库。记录不授予修复、部署、Scheduler、跨世界 Merge 或 Schema 修改权限。

## 参考资源

- [ontology.md](references/ontology.md)：六类通用概念、关系语义、完整 KG OS Definition YAML、复用与演进规则。
- [cypher.md](references/cypher.md)：按业务问题组织的参数化 Cypher，需核对目标真实模型与 State；本包测试直接执行这些查询。

Skill 的模型和查询是可复用参考，不是所有知识世界的强制 Ontology。不存在的新模型依 `kgos-ontology-standards` 的实际授权和确认流程实施；当前数据库签名只以 `kgos_docs` 为准。
