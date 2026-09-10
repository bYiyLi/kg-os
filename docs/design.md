# KG OS 设计

本文是 KG OS 当前技术架构与数据设计的真源。产品定义见 [README](../README.md)，协作规则见 [AGENTS](../AGENTS.md)。

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | [目标架构](#目标架构)、[Lithograph 边界](#lithograph-边界)、[Knowledge Base](#knowledge-base)、[Ontology](#ontology)、[Definition](#definition)、[版本模型](#版本模型) |
| 待设计 | [待设计合同](#待设计合同)，包括语义元数据物理编码、Schema element 稳定引用、Definition 公共格式与删除语义 |
| 待实现 | [工程实现待办](#工程实现待办)；实际实现依赖 Lithograph 对应公开能力已经可用 |

**已确认不等于已实现；未实现不等于未设计。** Lithograph 的当前实现状态只以 Lithograph 仓库为准，不在 KG OS 复制第二份 Phase 状态。

## 核心理念：一切皆可被定义

> **一切皆可被定义。**

KG OS 通过明确定义，让知识、关系、结构和约束能够被建模和操作。

KG OS 不替调用方定义世界，而是提供**定义世界并操作这个世界**的基础设施。

### 直接边界

- Kernel 不预定义具体领域的本体、节点、关系或知识语义。
- 调用方负责定义自己的领域模型和语义。
- KG OS 的确定性能力应作用于明确的定义，而不是依赖 Kernel 内部的隐式领域判断。
- KG OS 不根据上层业务意图绕过 Lithograph 已生效的 Schema、transaction 或 version contract。
- 理解、提炼、分类和建模等认知决策仍属于外部 Agent 与 Skill。

### 这不意味着

- 所有领域必须使用同一种固定模型。
- 所有内容必须提前静态定义。
- 核心理念会自动决定全部机制；具体已确认范围以下文为准。

## 目标架构

KG OS 是构建在 Lithograph 之上的 AI-first 高级知识库。KG OS 不再维护独立 Graph Engine、Ontology Schema Engine、Search Engine 或 Version Engine；这些底层数据库能力以 Lithograph 的公开合同为准。

```text
AI / Agent / Skill / CLI / SDK / Web
                 │
                 ▼
               KG OS
      ┌──────────────────────┐
      │ Ontology             │
      │ Knowledge            │
      │ Definition view      │
      │ AI / Human interface │
      └──────────┬───────────┘
                 │
                 ▼
            Lithograph
      ┌──────────────────────┐
      │ Cypher 25            │
      │ Property Graph       │
      │ Graph Type / Schema  │
      │ Constraint / Index   │
      │ Search               │
      │ Versioning           │
      └──────────┬───────────┘
                 │
                 ▼
               SQLite
```

责任边界：

| 层 | 负责 |
| --- | --- |
| KG OS | 知识库产品语义、Ontology semantic metadata、Definition 聚合视图、知识管理、AI-facing CLI / Skill、Human-facing Web |
| Lithograph | Property Graph、Cypher 25、Graph Type / Schema、Constraint、Index、Search、版本化图存储与 Git-like version operations |
| SQLite | Lithograph 的运行宿主、持久化文件、connection、transaction 与基础数据库机制 |

KG OS 的设计必须建立在 Lithograph **公开能力**之上，而不是 Lithograph 的内部存储实现之上。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和版本的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Lithograph 的公开查询与 Schema 语义继续以其冻结的 Cypher 25 compatibility profile 为准；Cypher 25 没有的 Ontology 语义由 KG OS 在上层表达，不修改 Lithograph 方言。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 加载 Lithograph extension；
- 在需要跨多个 Lithograph operation 保证持久化原子性时建立 caller-owned SQLite transaction。

KG OS 不使用 SQLite 直接建立第二套知识、Ontology、Search 或 Version 业务表，也不绕过 Lithograph 用 SQL 修改图数据或 Schema。

因此：**KG OS 使用 Lithograph 的数据库能力；SQLite 是 Lithograph 的宿主与事务基础，不是 KG OS 的业务数据接口。**

## Knowledge Base

一个 KG OS Knowledge Base 对应一个由 Lithograph 承载的知识世界。当前确认的核心组成是：

```text
Knowledge Base
├── Ontology
│   ├── Structure  → Lithograph Schema
│   └── Semantics  → KG OS graph data
└── Knowledge Data → Lithograph graph data
```

Ontology semantic metadata 与普通 Knowledge 都作为 Lithograph 中的正常 Property Graph 数据保存；Ontology Structure 则由 Lithograph 的 versioned Schema 承载。KG OS 不为这三部分建立彼此独立的数据库、历史或结构真源。

调用方定义领域模型。KG OS Kernel 不预定义 `Person`、`Company`、`works_at` 等领域概念，也不执行理解、分类、提炼或建模决策；这些认知工作仍属于外部 Agent / Skill。

## Ontology

KG OS Ontology 是一个知识库对“这个世界如何建模，以及这些模型意味着什么”的完整定义。它不是一份独立 Schema 文件，而是两个来源的组合：

```text
KG OS Ontology
├── Structure  → Lithograph Schema
└── Semantics  → KG OS semantic metadata graph
```

### Structure：Lithograph 是唯一结构真源

Ontology 的结构部分完全复用 Lithograph 当前公开设计中的 Cypher 25 Graph Type / Schema 能力。具体可表达范围始终以 Lithograph 自己的 Cypher compatibility profile 和公开合同为准。

结构信息包括但不限于：

- Graph Type 与 element type；
- Node label 与 Relationship type；
- Property 与 property type；
- key、unique、existence / `NOT NULL` 及其它 Lithograph 已支持的 current-graph constraints；
- Lithograph / Cypher 25 原生表达的关系结构。

KG OS 不复制这些信息，不再保存第二份 `type`、`required`、`unique`、`from/to`、`cardinality` 或其它自定义结构约束。只要某项结构语义已经由 Lithograph Schema 表达，KG OS 就从 Lithograph 读取并以它为准。

因此旧设计中的以下能力被替代，不再属于 KG OS 产品合同：

- KG OS 自定义 Ontology Schema JSON；
- JSON Schema Draft 2020-12 作为 KG OS 领域属性 Schema；
- KG OS 自定义 `unique` / `cardinality` 约束引擎；
- Ontology Meta-Schema；
- 为本体语义修改 GraphQLite 或创建 KG OS 专用 Graph Engine。

### Semantics：KG OS 只补充解释语义

Cypher 25 Graph Type 没有定义面向 AI / 用户的任意自然语言 Schema description。KG OS 因此只为 Lithograph Schema element 补充解释性 semantic metadata，而不扩展 Lithograph。

首个最小语义集合固定为：

| 字段 | 作用 |
| --- | --- |
| `title` | 面向 AI / 人的简短显示名称 |
| `description` | 对 Schema element 含义、用途或边界的自然语言说明 |

例如概念上：

```text
Person
  title: 人物
  description: 表示现实世界中的自然人。

Person.name
  title: 姓名
  description: 该人物的规范姓名。

WORKS_AT
  title: 任职
  description: 表示一个人在某个组织中的任职关系。
```

这些 semantic metadata 是 **KG OS 拥有的普通 Property Graph 数据**，通过 Lithograph 正常图写入保存并参与 Lithograph 的版本历史。Lithograph 只负责存储和查询，不理解 `title` / `description` 的 KG OS 产品语义。

KG OS semantic metadata 不允许重复保存 Lithograph 已经拥有的结构信息。增加新的 semantic metadata 字段前必须有当前真实需求；`examples`、`aliases`、`prompt`、`instructions` 等不在当前合同中。

### 自描述目标

AI 获取完整 Ontology 时，应能够同时取得：

```text
Lithograph Schema
        +
KG OS semantic metadata
        ↓
完整、可理解的 Ontology
```

AI 不需要读取 KG OS 源码、外部 Markdown 或另一套 Schema 数据库才能理解当前 Knowledge Base 的模型。结构事实由 Lithograph 提供，解释语义由 KG OS metadata 提供。

## Definition

KG OS 对上提供一个统一的本体定义视图，下文称 **Definition**。Definition 是 API / CLI / Skill / Web 面向上层的逻辑资源，**不是独立持久化模型，也不是新的结构真源**。

### Read

读取 Definition 时，KG OS 动态组合：

```text
Lithograph Schema state
        +
semantic metadata graph
        ↓
Definition view
```

例如上层可以得到概念上类似：

```json
{
  "name": "Person",
  "title": "人物",
  "description": "表示现实世界中的自然人",
  "properties": {
    "name": {
      "type": "STRING",
      "nullable": false,
      "title": "姓名",
      "description": "该人物的规范姓名"
    }
  }
}
```

这里的 `type`、`nullable` 和其它结构约束实时来自 Lithograph；`title` / `description` 来自 KG OS semantic metadata。上例只说明聚合原则，不冻结最终公共 JSON 格式。

### Create / Update

Definition 的创建或修改必须改变真实知识模型，而不是只改一份配置文档。

KG OS 将一次上层修改拆分为：

```text
Definition change
      │
      ├── structural change
      │      → Lithograph Schema mutation
      │
      └── semantic change
             → Lithograph graph mutation
```

- 结构修改必须使用 Lithograph 原生 Schema / Cypher 25 能力；
- 只修改 `title` / `description` 时只写 semantic metadata graph；
- 同时包含结构和语义修改时，两部分都必须成功后才把整个 KG OS 操作视为成功。

需要跨多个 Lithograph operation 保证整体持久化原子性时，KG OS 在同一 connection 上使用 caller-owned SQLite transaction。SQLite transaction 只承担 transaction boundary，不改变“所有业务数据通过 Lithograph”的边界。

Lithograph 当前设计中每个 mutating Cypher query 有自己的逻辑 Commit 语义。因此 KG OS **不承诺一个 Definition API 调用恰好对应一个 Lithograph Commit**；多步操作的 Commit 粒度遵守 Lithograph 公开执行合同，外层 transaction 负责这些步骤是否整体 durable。

### Delete

Definition 删除必须同时处理 Lithograph Schema 与对应 semantic metadata，但“删除定义时是否以及如何处理已经存在的 Knowledge Data”尚未冻结。该行为会改变数据生命周期合同，列入[待设计合同](#待设计合同)，实现前必须明确，不能从 Schema 删除行为自行推导级联数据删除。

### 操作面

上层最终需要覆盖以下能力族：

- list definitions；
- get definition；
- create definition；
- update definition；
- delete definition；
- inspect definition history / diff。

具体 CLI command、SDK method、request / response JSON 与 error contract 尚未冻结；这些接口只能聚合或编排 Lithograph 能力，不能形成第二套 Schema 或 Version 状态。

## 版本模型

KG OS 不为 Ontology 或 Knowledge 再建立一套独立版本系统。Lithograph Commit / Branch 是 Knowledge Base 的唯一版本真源。

原因是同一个 Lithograph Commit 已经可以同时覆盖：

```text
commit/<id>
├── Ontology Structure   → versioned Lithograph Schema
├── Ontology Semantics   → versioned graph data
└── Knowledge Data       → versioned graph data
```

因此 KG OS 不引入 `ontologyVersion`、`knowledgeVersion` 或另一套 Commit ID。

KG OS 直接复用 Lithograph 提供的版本能力，包括其公开合同中的：

- Commit / Branch / History；
- Time-travel；
- Diff / Patch；
- Merge / Rebase / Squash；
- Reset / Revert。

KG OS 可以提供 **Ontology-specific view**，例如只显示某两个 version 之间的 Schema 变化与 semantic metadata 变化，但这个视图只是对 Lithograph history / diff 的过滤和解释，不产生新的历史。

历史 Definition 也必须从目标 Lithograph Snapshot 的 Schema 与同一 Snapshot 的 semantic metadata 动态组合，不能使用当前 metadata 去解释旧 Schema，也不能使用当前 Schema 去解释历史 metadata。

## Knowledge 数据访问

普通 Knowledge 的 CRUD、结构化查询、图遍历、全文／向量搜索以及其它数据库能力都通过 Lithograph 公开接口完成。KG OS 不因为需要更高层知识语义就绕过 Lithograph 存储。

Ontology 负责告诉上层“当前 Knowledge 应按什么模型理解”；真实约束是否成立以及查询 / mutation 的数据库语义由 Lithograph 按其公开 Schema 与 Cypher 合同负责。

## 本次架构替换

当前仓库尚无 KG OS 业务实现，因此本次是设计基线替换，不存在已经发布的 KG OS 数据格式需要兼容迁移。

旧基线：

```text
KG OS
→ 自定义 Ontology Schema / JSON Schema / unique / cardinality
→ 自建 Graph Engine（GraphQLite fork）
→ SQLite
```

新基线：

```text
KG OS
→ Ontology / Knowledge / Definition
→ Lithograph public capabilities
→ SQLite
```

本次替换不改变 KG OS 的产品核心：AI-first、Graph-first、调用方定义领域模型、Agent 在 Kernel 外部，以及“一切皆可被定义”。改变的是底层责任归属：通用数据库能力回归 Lithograph，KG OS 聚焦知识库语义与交互。

## 关键设计决定

### D1 Lithograph 是 KG OS 的数据库核心

- 决定：KG OS 的图、Schema、Search、Versioning 统一依赖 Lithograph 公开能力。
- 依据：这些能力已经属于独立通用数据库 Lithograph 的产品边界，KG OS 不应复制实现。
- 备选：继续维护 KG OS 自建 Graph Engine。
- 取舍：KG OS 明显简化，但实现进度受 Lithograph 对应公共能力的实际可用性约束。

### D2 Ontology Structure 只有一个真源

- 决定：Ontology Structure 直接使用 Lithograph Schema；KG OS 不保存第二套结构 Schema。
- 依据：避免结构重复、漂移和双重约束语义。
- 备选：Lithograph Schema + KG OS JSON Schema 并存。
- 取舍：KG OS 能表达的结构能力以 Lithograph / Cypher 25 已支持范围为边界；不能自行添加 Lithograph 不支持的结构语义。

### D3 解释语义作为普通图数据

- 决定：`title` / `description` 由 KG OS semantic metadata graph 承载。
- 依据：Cypher 25 Graph Type 当前没有通用 description annotation；普通图数据可以在不修改 Lithograph 的前提下承载上层语义并自动版本化。
- 备选：给 Lithograph 增加 KG OS 专用 Schema annotation。
- 取舍：KG OS 需要维护 Schema element 与 semantic metadata 的稳定关联。

### D4 Definition 是聚合视图，不是存储模型

- 决定：上层统一 CRUD Definition，读取时合并 Lithograph Schema 与 semantic metadata，写入时分派到真实底层能力。
- 依据：AI / Web 不应该理解两套底层来源，但也不能为了接口方便复制结构真源。
- 备选：持久化完整 Definition JSON。
- 取舍：读取和修改需要聚合 / 编排，但消除了 Definition 与真实 Schema 漂移的问题。

### D5 只使用 Lithograph 的版本历史

- 决定：Ontology、semantic metadata 与 Knowledge 共用 Lithograph Commit / Branch。
- 依据：Schema 和普通 graph data 都已经进入 Lithograph canonical history。
- 备选：KG OS 单独维护 Ontology version。
- 取舍：版本身份统一；Ontology-specific history 需要由 KG OS 从统一 history 中筛选解释。

### D6 SQLite 是 Host，不是 KG OS 数据接口

- 决定：KG OS 只为 Lithograph 使用 SQLite connection / extension loading / transaction boundary，不直接维护知识业务表。
- 依据：避免绕过 Lithograph 的 Schema、版本和数据完整性合同。
- 备选：KG OS 在同一 SQLite database 中直接维护并查询业务表。
- 取舍：所有持久化知识能力必须能通过 Lithograph 公共接口完成。

## 待设计合同

以下问题尚未冻结，但不会回退前述架构原则：

1. **Semantic metadata 物理模型**：KG OS-owned label / relationship / property 如何编码，以及如何避免与调用方领域名称冲突。
2. **Schema element 稳定引用**：semantic metadata 如何稳定指向 Graph Type、element type、Property 等 Lithograph Schema element；必须基于 Lithograph 公开、稳定的 Schema identity / introspection 能力，不依赖 `_lithograph_*`。
3. **Definition 公共合同**：统一的 kind / identity、读取形态、create/update patch 语义、error model、CLI / SDK / Skill interface。
4. **Definition 删除语义**：删除结构定义时，对现有 Knowledge Data、semantic metadata 与历史引用的处理边界。
5. **多步写入映射**：如何把一个 Definition 操作拆成最少的 Lithograph mutation，并在不创造第二套 transaction / commit 语义的前提下报告结果。
6. **Knowledge API 与 Search**：KG OS 面向 AI 的知识 CRUD、结构化查询、全文／向量／混合检索的聚合合同。
7. **Human-facing Web**：Ontology / Knowledge / History 的查看、管理和纠正交互。

这些合同应在需要实现对应能力前逐项设计；没有当前需求的扩展字段、抽象层或兼容层不提前加入。

## 工程实现待办

实现顺序应建立在 Lithograph 对应公开能力真实可用的基础上，具体 readiness 始终从 Lithograph 仓库检查，不在这里复制状态。

1. 建立最小 Lithograph host / client 边界，只暴露 KG OS 所需公开能力，不访问内部表。
2. 设计并实现 semantic metadata 的 Lithograph 图模型与稳定 Schema element binding。
3. 实现 Definition read aggregation，验证结构字段全部来自 Lithograph、语义字段全部来自 KG OS metadata。
4. 实现 Definition create / update 编排与跨步骤 transaction rollback。
5. 实现 Ontology history / diff 的 Lithograph version 过滤视图。
6. 在 Definition 合同稳定后，再建立 AI-facing CLI / Skill、SDK 与 Human-facing Web。

实现、验证、提交和推送必须分别按仓库真实状态报告；设计完成不代表 Lithograph 依赖能力或 KG OS 功能已经实现。
