---
name: kgos-ontology-standards
description: Design, reuse and evolve KG OS Ontology using domain concepts, identity, categories, relationships, competency questions and real graph validation. Decide applicable Knowledge World, Domain and Branch boundaries. Use for ontology/model proposals and changes, not ordinary Knowledge edits with an already sufficient model.
---

# KG OS 本体论规范

本 Skill 负责**领域语义和知识结构的建模**，而不是根据业务名词直接创建数据库 Schema。采用“问题 → 概念 → 身份 → 关系 → 图结构 → 查询验证”的方法，在当前任务需要的深度下实施；不内置固定的 Event/Entity 或其它上层领域模型。

官方可复用 Ontology 库（规划地址）：<https://github.com/bYiyLi/kgos-ontologies>。

## 1. 确认世界、业务目标与能力问题

建模前必须明确目标知识世界的 Instance、Branch、State，检查当前 Ontology 和相关 Knowledge。先确定模型应回答的实际业务问题（Competency Questions）、必要查询与更新，以及一个合理的新类别或新实例场景；已有字段的局部调整只分析受影响语义，不为简单任务全量设计新领域本体。

根据数据归属与版本演进需求选择知识世界。已有世界能满足共同管理及关联需求时必须复用；禁止只因领域、主题、Agent、模型类别不同就新建 Branch。只有确需独立 State 演进、实验或已有独立管理责任时才考虑新建，并检查来源 State 的完整继承。VLog 专用归属遵循 VLog Skill。

## 2. 先确定本体语义，再决定数据库结构

必须先识别领域中的**持续对象、事件、时间、地点、概念/分类、来源**等实际存在的类别，而不是强制所有领域采用这六个 Definition。区分概念类型与实例、名称与真实身份、状态与发生事实、任务计划与实际执行、来源主张与验证结果。

设计时必须检查：

- **稳定语义**：每种概念是什么，不是什么；实际身份与生命周期怎样区分，同名、重名和时间变化如何处理。
- **分类与实例**：新增普通类别、角色或事件名称优先由已有适用 Knowledge 或 Property 表达，**禁止仅因新业务分类出现就创建新 Definition**；确有不同结构、约束或关系语义时可建新模型。
- **关系语义**：真实关联必须给出明确的端点、方向、成立条件与适用范围；相似、同现、版本先后或来源定位不自动形成因果或跨 Snapshot 图关系。
- **建模粒度**：有独立身份、关系、复用或生命周期需要时采用 Node；关系自身的角色、时间和其它事实优先用 Relationship Property；简单标量保留 Property。禁止一个万能 Entry 吞掉真实关系，也禁止机械把每个名词拆成 Node。

需要具体判断方法时读 [KG OS 本体论方法论](references/ontology-methodology.md)；需要按场景对照并运行示例时才读 [本体建模案例](references/modeling-examples.md)。只引用适用部分，不全量套用。

## 3. 复用已有 Ontology 与官方模型

必须核对真实 Definition 的语义、身份、关系、Constraint、Index 及相关实例，而非只比对字段名：

- 已可正确回答业务问题：复用。
- 缺少兼容的必要表达：优先最小扩展。
- 无法正确复用或扩展：提出新的概念/关系结构。

确需新建或扩展时，官方库可访问则从其 README 及适用模型说明核对 Definition、关系、示例查询、测试和确切 Tag/Commit，再按目标世界做选择性适配；不可访问时按已知需求继续自行设计。不整套导入参考模型，也不为了遵循示例而迁移已足够的既有知识图。

## 4. 形成最小且可演进的 Property Graph 方案

将已确认概念映射到适当 Node、Relationship、Property，必要时加入实际可执行的 Constraint、Index 和可选 Domain。跨领域共享对象需正确复用同一身份并按真实图关系关联，不能把 Domain 误当实体隔离、Branch 或关系类型。

方案必须明确区分**本次新增 Knowledge 可以解决的需求**与**真正需要修改 Ontology 的结构缺口**。新增抽象前必须说明它解决了哪条当前业务问题；合理扩展应能增加实例/分类而不反复修改 Definition，但不为追求 Schema 永不变化牺牲真实领域语义。

## 5. 用正反例、查询和扩展场景验证

设计阶段必须用实际适用的代表性数据和关键 Cypher 核对目标能力问题；还要检查身份冲突、关系方向、来源/时间限定及至少一个合理的新类别或新实例。明确哪些判断由数据库 Constraint 保证，哪些依赖 Agent/应用取证，禁止假定 KG OS 自动执行 OWL 分类、来源真伪或因果推理。

实际实施后重新读取目标 State 的 Ontology、受影响 Knowledge 和关系，并复验关键查询、约束及已有数据。只有模型 Schema 成功创建、参考案例通过或工具返回成功，不等于实际用户知识库通过验收。

## 6. 提交模型确认单

完成方案后必须读取 [Ontology 变更确认模板](references/model-confirmation-template.md)，向用户展示**本体语义与身份、实际改动、相关关系图、数据影响及新增类别的表达方式**，取得明确确认。仅复用现有结构的建模任务也应展示“无结构改动”与复用方案供确认；普通已有模型下的 Knowledge 写入不触发建模审批。

未经确认禁止创建、修改或删除 Ontology，迁移关联数据，或新建 Branch。已确认范围内的可逆实现细节与验证自主推进；只有实质性超出方案才重新确认受影响部分。

## 7. 实施、恢复与边界

实施以目标 Branch 最新 State、真实 Definition 和当前 `kgos_docs` 为依据，使用最小 Patch；不得覆盖定制模型、通过删除重建规避影响或为兼容不存在的未来需求增加层次。写入结果未知先回读核查，再决定恢复；仅讨论或评审时不得写入。

本 Skill 不代替普通 Knowledge 管理、VLog 记录、环境诊断、SDK/Cypher 文档或 Lithograph 版本引擎；所有技术方法、数据格式及错误合同以当前 KG OS 实例的 `kgos_docs` 为准。参考材料提供建模依据，不是另一个模型真源或后台 Agent。
