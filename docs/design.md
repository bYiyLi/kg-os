# KG OS 设计

本文是 KG OS 当前技术架构与数据设计的真源。产品定义见 [README](../README.md)，协作规则见 [AGENTS](../AGENTS.md)。

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | [目标架构](#目标架构)、[Lithograph 边界](#lithograph-边界)、[Knowledge Base](#knowledge-base)、[Ontology](#ontology)、[Definition](#definition)、[Knowledge 数据访问](#knowledge-数据访问)、[Evolution](#evolution)，以及 Ontology semantic graph 的内部隔离与 Binding Record / Schema Locator 绑定模型 |
| 待设计 | [待设计合同](#待设计合同)，包括内部保留标识的具体编码、Ontology / Knowledge / Evolution 公共 wire contract 与删除语义 |
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
      │ Evolution            │
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
| KG OS | 知识库产品语义、Ontology semantic metadata、Definition 聚合视图、Knowledge 管理、Knowledge Base 状态演进的业务化能力、AI-facing CLI / Skill、Human-facing Web |
| Lithograph | Property Graph、Cypher 25、Graph Type / Schema、Constraint、Index、Search、immutable Commit DAG、Branch、Tag、Commit Data 与版本化状态操作 |
| SQLite | Lithograph 的运行宿主、持久化文件、connection、transaction 与基础数据库机制 |

KG OS 的设计必须建立在 Lithograph **公开能力**之上，而不是 Lithograph 的内部存储实现之上。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和状态演进的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Lithograph 的公开查询与 Schema 语义继续以其冻结的 Cypher 25 compatibility profile 为准；Cypher 25 没有的 Ontology 语义由 KG OS 在上层表达，不修改 Lithograph 方言。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 加载 Lithograph extension；
- 在需要跨多个 Lithograph operation 保证持久化原子性时建立 caller-owned SQLite transaction。

KG OS 不使用 SQLite 直接建立第二套知识、Ontology、Search、State 或 Evolution 业务表，也不绕过 Lithograph 用 SQL 修改图数据、Schema 或 version refs。

因此：**KG OS 使用 Lithograph 的数据库能力；SQLite 是 Lithograph 的宿主与事务基础，不是 KG OS 的业务数据接口。**

## Knowledge Base

一个 KG OS Knowledge Base 对应一个由 Lithograph 承载的知识世界。公共能力分为 Ontology、Knowledge 与 Evolution 三个域，但这不意味着一个 State Snapshot 内存在三份并列内容。当前模型是：

```text
Knowledge Base
├── State Space / Evolution
│   ├── State DAG        → Lithograph Commit DAG
│   ├── Branch refs      → Lithograph Branch
│   ├── Tag refs         → Lithograph Tag
│   └── State Data       → Lithograph Commit Data
│
└── State Snapshot
    ├── Ontology
    │   ├── Structure    → Lithograph Schema
    │   └── Semantics    → KG OS graph data
    │       ├── Definition / Property 业务解释
    │       └── Domain 业务组织
    └── Knowledge Data   → Lithograph graph data
```

Ontology semantic metadata 与普通 Knowledge 都作为 Lithograph 中的正常 Property Graph 数据保存；Ontology Structure 由 Lithograph 的 versioned Schema 承载。一个 immutable State Snapshot 只由同一 Lithograph Commit 下的 Ontology Structure、Ontology Semantics 与 Knowledge Data 构成。Evolution 管理这些 State 的 DAG、引用与注释，不是 Snapshot 内的第三种业务数据。

State Data 是对某个 State 的**当前业务注释**，不是该 State Snapshot 的 immutable 内容。Branch / Tag 同样是当前引用状态。读取历史 State 时可以同时返回当前 State Data 与当前仍指向该 State 的 Tag / Branch，但这些 sidecar/ref 不表示“该 Commit 创建当时的注释或引用状态”。需要被 versioning、Cypher query、Constraint、Diff 或 Merge 共同管理的业务事实必须保存为 Ontology / Knowledge，而不是 State Data。

调用方定义领域模型。KG OS Kernel 不预定义 `Person`、`Company`、`works_at` 等领域概念，也不执行理解、分类、提炼或建模决策；这些认知工作仍属于外部 Agent / Skill。

## Ontology

KG OS Ontology 是一个知识库对“这个世界如何建模、这些模型意味着什么，以及这些模型在业务上如何组织”的完整定义。它不是一份独立 Schema 文件，而是两个来源的组合：

```text
KG OS Ontology
├── Structure  → Lithograph Schema
└── Semantics  → KG OS semantic metadata graph
```

### Structure：Lithograph 是唯一结构真源

Ontology 的结构部分完全复用 Lithograph 当前公开设计中的 Cypher 25 Graph Type / Schema 能力。具体可表达范围始终以 Lithograph 自己的 Cypher compatibility profile 和公开合同为准。

Lithograph Schema 同时可能包含 KG OS 运行自身 semantic graph 所需的 reserved internal element definitions。它们仍由 Lithograph versioned Schema 承载，但属于 KG OS infrastructure implementation，不属于调用方 Ontology Structure。KG OS 对外读取 Ontology Structure 时只投影调用方定义的 Schema element，并排除 KG OS-owned reserved internal Schema element；这只是业务可见性过滤，不建立第二套结构状态。

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

### Semantics：KG OS 补充业务语义与组织

Cypher 25 Graph Type 没有定义面向 AI / 用户的任意自然语言 Schema description，也不负责 KG OS 的业务领域组织。KG OS 因此在 Lithograph 之上补充两类上层语义，但不扩展 Lithograph：

1. **Schema semantics**：解释 Definition、Relationship 与 Property 在业务上代表什么；
2. **Domain organization**：把 Definition 按调用方需要组织成可递归浏览的业务领域图。

这两类语义都属于 KG OS 产品层，不改变 Lithograph Schema、Constraint、Index、查询语义或版本模型。

#### Schema semantics

对于 Lithograph Schema element，首个最小解释语义集合固定为：

| 字段 | 作用 |
| --- | --- |
| `title` | 面向 AI / 人的简短显示名称；可缺省 |
| `description` | 对 Schema element 含义、用途或边界的自然语言说明；可缺省 |

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

WORKS_AT.since
  title: 任职开始日期
  description: 此次任职关系开始生效的日期。
```

字段语义不引入独立的顶层 Ontology 对象。`Person.name`、`WORKS_AT.since` 等 Property 的 `title` / `description` 在对外 Definition 中直接作为对应 Property 的业务解释返回；底层如何把这份语义绑定到 Lithograph Schema element 属于 KG OS 内部编码。

这些 semantic metadata 是 **KG OS 拥有的普通 Property Graph 数据**，通过 Lithograph 正常图写入保存并参与 Lithograph 的版本历史。Lithograph 只负责存储和查询，不理解 `title` / `description` 的 KG OS 产品语义。

KG OS semantic metadata 不允许重复保存 Lithograph 已经拥有的结构信息。增加新的 semantic metadata 字段前必须有当前真实需求；`examples`、`aliases`、`prompt`、`instructions` 等不在当前合同中。

#### Domain：业务组织

`Domain` 是 KG OS Ontology 中用于组织和解释一组 Definition 的轻量业务抽象。它不是 Lithograph Graph Type、namespace、权限边界、数据隔离边界或独立版本单元。

Domain 的最小逻辑模型是：

```text
Domain
├── name
├── title?
├── description?
└── includes → Domain | Definition
```

- `name`：Domain 的业务名称，同时作为当前 Snapshot 中的公共定位名称；Domain rename 会改变公共引用，但内部 Domain Node identity 保持连续；具体 wire serialization 由公共合同冻结；
- `title` / `description`：面向 AI / 人的可选业务解释；
- `includes`：Domain 的业务组织关系，可以指向另一个 Domain，也可以指向 Definition。

例如：

```text
Business
├── Organization
│   ├── Person
│   ├── Company
│   └── WORKS_AT
└── Commerce
    ├── Product
    └── Order
```

逻辑上等价于：

```text
Business     -[:INCLUDES]-> Organization
Business     -[:INCLUDES]-> Commerce
Organization -[:INCLUDES]-> Person
Organization -[:INCLUDES]-> Company
Organization -[:INCLUDES]-> WORKS_AT
Commerce     -[:INCLUDES]-> Product
Commerce     -[:INCLUDES]-> Order
```

`INCLUDES` 表示 KG OS 的业务组织语义，不改变被组织 Definition 的 Lithograph Schema。

Domain 保持弱约束：

- Domain 可以包含 Domain，从而形成任意层级的业务组织；
- 同一个 Domain 可以被多个 Domain 包含；
- 同一个 Definition 可以被多个 Domain 包含；
- Definition 不要求必须属于 Domain；
- KG OS 不要求 Domain 形成 tree 或 DAG，不把层级自动转换成 namespace；
- Domain 不限制跨 Domain Relationship，也不产生 Schema、权限或数据隔离；
- KG OS 不判断领域划分是否“合理”，这属于调用方 / 外部 Agent 的建模决策。

因此循环业务组织本身不作为 Ontology 写入错误；任何递归读取、展开或聚合必须使用 visited-set、去重和有界遍历，不能因为调用方建立 cycle 而无限递归。

删除 Domain 只删除该 Domain 及其 KG OS 业务组织关系；它不因为 `includes` 而删除被组织的 Definition、Lithograph Schema 或 Knowledge Data。

#### Semantic graph 的内部边界

Domain、`INCLUDES` 与 Schema semantic metadata 和普通 Knowledge 共存在同一个 Lithograph versioned graph 中，但 KG OS 必须能明确区分自身内部 Ontology semantic graph 与调用方 Knowledge：

- 所有 KG OS Ontology 内部 Node 都必须携带同一个 KG OS-owned reserved internal marker Label；具体字符串编码属于实现常量，不进入公共 wire contract；
- KG OS 内部 Relationship 只连接 KG OS internal Node，不通过普通 graph edge 直接连接调用方 Knowledge Node；
- Knowledge `get` / `list` / `expand` / `query` / `mutate` / `execute` 必须由 KG OS 构造 Lithograph execution options，并使用 Lithograph 公开 `graphView` 能力排除 reserved internal marker；调用方不能通过 Knowledge 公共接口覆盖这个内部 Graph View；
- Ontology semantic graph 的内部读取使用相反的 Graph View，只允许 KG OS internal Node 进入本次 Cypher 的可见 Property Subgraph；
- 这种隔离必须在 Lithograph Planner / Executor / Search / mutation boundary 生效，不能由 KG OS 对查询结果事后过滤，也不能通过直接访问 `_lithograph_*` 实现；
- Lithograph `graphView` 不是认证系统，因此拥有底层 Lithograph 原始访问权的主体仍可绕过 KG OS 查看完整 graph；KG OS 只保证其自身公开能力不会泄漏或误改内部 semantic graph。

KG OS internal graph 使用普通 Lithograph graph data，因此仍受目标 Snapshot 的 Lithograph Schema / Constraint 约束。为了让调用方可以使用 closed / strongly constrained Graph Type，KG OS 必须在**同一份 Lithograph versioned Schema** 中维护自身运行所需的 reserved internal element types / properties；这些内部 Schema element 不是调用方 Ontology Structure，不创建 Binding Record，也不参与 Domain organization；它们不在 KG OS 的 Ontology read view、`list definitions` 或 Ontology search 中返回，也不能通过 KG OS 的普通 Define 能力修改。KG OS 不为它们建立第二套 Schema。若 Lithograph 的公开 Schema 能力无法同时表达调用方结构与这些必要 internal types，则该 KG OS 实现路径视为依赖能力不足，不能退回直接 SQL 或旁路存储。

#### Binding Record 与 Schema Locator

Definition 本身仍然只是聚合视图，不作为新的持久化 Schema 对象。KG OS 在 semantic graph 内使用稳定的 **Binding Record** 保存业务解释与组织关系，再通过 **Schema Locator** 在同一 Snapshot 中确定性定位 Lithograph Schema element：

```text
Domain
  │
  └── INCLUDES
          ↓
Definition Binding Record
  ├── stable internal graph element identity
  ├── title? / description?
  └── target Schema Locator
          ↓
    Lithograph Schema element

Definition Binding Record
  │
  └── property metadata relation
          ↓
Property Binding Record
  ├── stable internal graph element identity
  ├── title? / description?
  └── target Schema Locator
          ↓
    Lithograph Property
```

Binding Record 是 KG OS-owned 的内部普通 Node，使用 Lithograph graph element identity 获得跨 Commit 的稳定内部身份；这个 identity 只表示“同一个 KG OS metadata / binding record”，**不冒充 Lithograph Schema element 的永久 identity，也不自动成为公共 `definitionId`**。

Schema Locator 只负责在目标 Snapshot 的 Lithograph Schema 中定位当前结构。当前最小逻辑形式是：

```text
Node Definition
→ { kind: node, identifyingLabel }

Relationship Definition
→ { kind: relationship, identifyingRelationshipType }

Node Property
→ { owner: Node Definition Locator, propertyName }

Relationship Property
→ { owner: Relationship Definition Locator, propertyName }
```

具体字段名与序列化不在内部设计中冻结；实现必须映射到 Lithograph 当时公开的 Graph Type / Schema introspection contract。Schema Locator 不保存 Commit ID，因为 Binding Record 本身已经与 Schema 一起进入同一个 Lithograph Snapshot；读取时始终以目标 Commit 同时解析 Binding Record 和 Schema。

因此 KG OS 明确区分：

```text
Binding Record identity
→ KG OS 内部语义对象的连续性

Schema Locator
→ 某个 Snapshot 中的结构定位

Lithograph Schema
→ 结构事实的唯一真源
```

KG OS 不要求 Lithograph 为 Node element type、Relationship element type 或 Property 新增跨版本永久 `SchemaElementId`。如果 Lithograph 未来提供通用稳定 Schema identity，KG OS 可以在新的设计修订中评估是否采用，但当前合同不依赖它。

当调用方通过 KG OS 明确执行 Definition / Property 的 rename 时，KG OS 可以在产品层保持 Binding Record 连续：同一个 caller-owned SQLite transaction 中先按 Lithograph 公开 Schema mutation contract 完成结构变化，再把同一个 Binding Record 的 Schema Locator 更新到新结构地址；Domain `INCLUDES` 等指向 Binding Record 的组织关系不需要重建。Lithograph 是否把底层结构变化表达为原生 rename，或 old element remove + new element add，不改变 KG OS 的 Binding Record 连续性。

如果有人绕过 KG OS 直接修改 Lithograph Schema，导致当前 Snapshot 中某个 Binding Record 的 Schema Locator 无法解析，或解析到与 Binding Record kind 不一致的结构，KG OS 必须把该 Snapshot 判定为 **Ontology consistency error**：不猜测 rename target、不自动迁移 metadata、不静默删除 Binding Record。历史 Snapshot 仍按各自当时的 Binding Record + Schema Locator 正常解析。

#### 公共身份与引用

KG OS 不建立一套覆盖所有资源的额外 UUID / Resource ID 体系。公共身份优先复用资源 owner 已经拥有的稳定 identity，或使用当前 Snapshot 中足以确定定位的业务名称：

| 资源 | 公共身份 / 定位依据 |
| --- | --- |
| State | Lithograph Commit identity |
| Branch | Lithograph Branch name |
| Tag | Lithograph Tag name |
| Knowledge Node / Relationship | Lithograph element identity |
| Node Definition | `kind=node` + 当前 Schema identifying name |
| Relationship Definition | `kind=relationship` + 当前 Relationship Type / Schema identifying name |
| Property | owner Definition reference + 当前 property name |
| Domain | 当前 Domain name |

`node:Person`、`relationship:WORKS_AT`、`domain:organization` 这类写法可以作为概念示例，但不冻结最终 CLI / JSON 序列化。

Definition、Property 与 Domain 的**公共引用**用于在一个确定 Snapshot 中定位当前对象，不承担跨版本永久身份。显式 rename 后公共引用随名称变化；KG OS internal Binding Record / Domain Node 的稳定 Lithograph graph element identity 负责跨 Commit 的内部连续性，使 History / Diff 可以把 rename 解释为同一对象的演化，而不是要求调用方持有额外 UUID。

因此：

```text
public reference
→ 在目标 Snapshot 中定位对象

internal graph identity
→ KG OS 内部识别跨 Snapshot 连续性
```

内部 Binding Record / Domain Node identity 当前不进入 v1 公共 identity。未来只有出现必须跨 rename 长期持有 opaque public identifier 的真实需求时，才重新评估是否暴露稳定公共 ID。

历史对象定位必须同时带有目标 State 语义：同一个 `node:Person` 在不同 State 中可以存在、缺失或已经 rename。概念上等价于 Git 的 `<commit>:<path>`——State 确定 Snapshot，对象 reference 在该 Snapshot 内定位对象；这不要求 KG OS 创建第二套 object-version identity。

### 自描述目标

AI 获取完整 Ontology 时，应能够同时取得：

```text
Lithograph Schema
        +
KG OS Schema semantics
        +
KG OS Domain organization
        ↓
业务化、可理解的 Ontology
```

AI 不需要读取 KG OS 源码、外部 Markdown 或另一套 Schema 数据库才能理解当前 Knowledge Base 的模型。结构事实由 Lithograph 提供，业务解释与 Domain organization 由 KG OS semantic graph 提供。

## Definition

KG OS 对上提供一个统一的本体定义视图，下文称 **Definition**。Definition 是 API / CLI / Skill / Web 面向上层的逻辑资源，**不是独立持久化模型，也不是新的结构真源**。

公开 Ontology 不额外暴露 `OntologyElement`、`SchemaElementMetadata`、`PropertyMetadata` 等中间资源。AI-facing 产品模型保持为：

```text
Ontology
├── Domain
│   └── includes → Domain | Definition
└── Definition
    ├── Lithograph Structure
    ├── title? / description?
    └── Properties
        ├── Lithograph Structure
        └── title? / description?
```

Relationship Definition 与 Node Definition 使用同一原则；Relationship 自身和它的 Property 都可以拥有 `title` / `description`，而端点、Relationship Type、Property type 与 Constraint 等结构事实全部来自 Lithograph。

### Read

读取 Definition 时，KG OS 动态组合：

```text
Lithograph Schema state
        +
Definition / Property Binding Records
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

### AI-facing Ontology read view

KG OS 面向 AI 可以提供完整或局部的业务化 Ontology JSON。这个 JSON 是 **read-time aggregate view**，不是持久化文件，也不是可以与 Lithograph Schema 并列修改的第二真源。

概念上，一个 Ontology read view 可以类似：

```json
{
  "state": {
    "id": "<resolved-state>"
  },
  "context": {
    "branch": "main"
  },
  "domains": [
    {
      "name": "business",
      "title": "业务",
      "description": "企业经营活动相关的知识模型。",
      "includes": [
        "domain:organization"
      ]
    },
    {
      "name": "organization",
      "title": "组织与人员",
      "description": "描述人员、组织以及人员与组织之间的关系。",
      "includes": [
        "definition:Person",
        "definition:Company",
        "definition:WORKS_AT"
      ]
    }
  ],
  "definitions": [
    {
      "kind": "node",
      "name": "Person",
      "title": "人物",
      "description": "表示现实世界中的自然人。",
      "properties": {
        "name": {
          "type": "STRING",
          "nullable": false,
          "title": "姓名",
          "description": "该人物的规范姓名。"
        },
        "birthday": {
          "type": "DATE",
          "nullable": true,
          "title": "出生日期",
          "description": "该人物的出生日期。"
        }
      }
    },
    {
      "kind": "node",
      "name": "Company",
      "title": "公司",
      "description": "表示现实世界中的公司或企业组织。",
      "properties": {
        "name": {
          "type": "STRING",
          "nullable": false,
          "title": "公司名称",
          "description": "公司通常使用的名称。"
        }
      }
    },
    {
      "kind": "relationship",
      "name": "WORKS_AT",
      "title": "任职",
      "description": "表示一个人在某家公司任职的事实。",
      "from": {
        "definition": "Person"
      },
      "to": {
        "definition": "Company"
      },
      "properties": {
        "since": {
          "type": "DATE",
          "nullable": true,
          "title": "任职开始日期",
          "description": "此次任职关系开始生效的日期。"
        }
      }
    }
  ]
}
```

这个示例冻结的是**信息责任和聚合原则**，不是最终 wire schema：

- `type`、`nullable`、relationship structure、constraints、indexes 等结构信息只从目标 resolved State 对应的 Lithograph Snapshot 投影；
- `title` / `description` 来自同一 State Snapshot 中解析成功的 Definition / Property Binding Record；Domain organization 通过指向这些 Binding Record 的 `INCLUDES` 关系读取；
- `from` / `to` 只表示 AI-facing 对 Lithograph Relationship structure 的友好投影，最终形态必须忠实于 Lithograph 公开 Graph Type 模型；
- 与某 Definition 相关的 Constraint / Index 可以作为便利视图返回，但 canonical ownership 仍属于 Lithograph versioned Schema；
- resolved State identity 是该 read view 的权威状态身份；`branch` / `tag` 只是读取上下文，因为它们可以显式移动；
- Definition 的 Domain membership 不保存为第二份单值 `domain` 字段；需要反向查看时，从 Domain `includes` 动态推导。

完整 Ontology view 不是 AI 每次调用都必须加载的上下文。KG OS 应同时提供渐进式读取能力，使 AI 可以先浏览 Domain，再获取某个 Domain 的成员，最后读取相关 Definition，避免大型知识库把全部 Ontology 一次性塞入上下文。

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
- 只修改 `title` / `description` 时只更新对应 Binding Record；
- 同时包含结构和语义修改时，两部分都必须成功后才把整个 KG OS 操作视为成功。

需要跨多个 Lithograph operation 保证整体持久化原子性时，KG OS 在同一 connection 上使用 caller-owned SQLite transaction。SQLite transaction 只承担 transaction boundary，不改变“所有业务数据通过 Lithograph”的边界。

Lithograph 当前设计中每个 mutating Cypher query 有自己的逻辑 Commit 语义。因此 KG OS **不承诺一个 Definition API 调用恰好对应一个 Lithograph Commit**；多步操作的 Commit 粒度遵守 Lithograph 公开执行合同，外层 transaction 负责这些步骤是否整体 durable。操作成功后必须返回最终 resolved State identity，使调用方不需要理解内部产生了多少个 Commit。

AI-facing read view 与 write contract 必须明确分离。完整 Ontology / Definition JSON 主要用于读取和理解，不等同于可整体 `PUT` 回去的持久化对象。写入请求表达“希望改变什么”：

- 修改结构 → Lithograph Schema mutation；
- 修改 Definition / Property 的 `title` / `description` → Binding Record graph mutation；
- 显式 rename Definition / Property → Lithograph Schema mutation + 同一 Binding Record 的 Schema Locator 更新；
- 创建、修改、删除 Domain 或 `includes` → semantic graph mutation；
- 同一个上层操作涉及多类 mutation 时，按本节 transaction 边界整体判断成功或失败。

KG OS 不能因为 read view 中同时出现结构和语义字段，就把完整 JSON 再保存一份。

### Delete

Definition 删除必须同时处理 Lithograph Schema 与对应 semantic metadata，但“删除定义时是否以及如何处理已经存在的 Knowledge Data”尚未冻结。该行为会改变数据生命周期合同，列入[待设计合同](#待设计合同)，实现前必须明确，不能从 Schema 删除行为自行推导级联数据删除。

### Ontology 能力面

KG OS 面向 AI / SDK / Web 的 Ontology 能力按职责收敛为四组：**Read、Define、Organize、History**。这是产品能力边界，不冻结最终 CLI command、SDK method 或 HTTP route 名称。

```text
Ontology Capability
│
├── Read
│   ├── get ontology
│   ├── list domains
│   ├── get domain
│   ├── list definitions
│   ├── get definition
│   └── search ontology
│
├── Define
│   ├── create definition
│   ├── update definition
│   └── delete definition
│
├── Organize
│   ├── create domain
│   ├── update domain
│   └── delete domain
│
└── History
    ├── history
    └── diff
```

#### Read：发现与理解本体

Read 负责告诉上层“这个知识世界是怎么定义的”，不修改 Ontology：

- `get ontology`：读取 Ontology 概览；默认应优先返回适合导航的摘要，而不是强制展开全部 Definition；需要时可以请求完整业务化 Ontology view；
- `list domains`：枚举 Domain；
- `get domain`：读取 Domain 的 `title` / `description`、直接 `includes` 与必要的业务组织上下文；递归展开遵守前述 graph-safe 规则；
- `list definitions`：枚举 Definition，包括未加入任何 Domain 的 Definition；Domain 不能成为发现 Definition 的唯一入口；
- `get definition`：返回由 Lithograph Structure 与 KG OS semantic metadata 组成的完整业务化 Definition；
- `search ontology`：在 Ontology 范围内查找相关 Domain、Definition、Relationship 与 Property，匹配 `name`、`title`、`description` 等可检索语义；底层搜索能力继续复用 Lithograph，不建立第二套 Search Engine。

Read 的所有能力使用同一套 **State reference semantics**：调用方可以引用一个确定 State，也可以通过 Branch / Tag 引用 State；Branch / Tag 在读取开始时解析并 pin 到底层 immutable Commit。**解析后的 State identity 是返回结果的权威状态身份，Branch / Tag 只是可移动引用。** KG OS 不为此建立独立的 `State Context` 资源或第二套状态身份；具体 ref serialization 由公共合同冻结。

大型 Ontology 应优先支持渐进式读取：

```text
get ontology
      ↓
get domain / list definitions / search ontology
      ↓
get definition
```

AI 不需要为了理解局部任务而一次加载整个 Ontology。

#### Define：定义真实模型

Define 负责创建、修改和删除 Definition：

- `create definition`；
- `update definition`；
- `delete definition`。

Definition 是这一能力族的生命周期边界。Property、Relationship Property 与它们的 `title` / `description` 不暴露独立 CRUD；增加、删除、修改 Property 或 Property semantics 都通过所属 Definition 的 create / update 完成。

Node Definition 与 Relationship Definition 共享同一能力族，不建立 `create node model`、`create relationship model` 等重复 API。具体结构 mutation 仍由 Lithograph Schema 执行，KG OS 只负责编排上层请求。

`delete definition` 属于正式能力面，但其对已经存在 Knowledge Data 的处理行为仍由[待设计合同](#待设计合同)中的 Definition 删除语义决定；在该合同冻结前不能自行推导 cascade、reject 或保留行为。

#### Organize：组织业务模型

Organize 只负责 Domain 的生命周期：

- `create domain`；
- `update domain`；
- `delete domain`。

`includes` 是 Domain 自身的一部分，因此 Domain→Domain 与 Domain→Definition membership 的增加和移除统一通过 `update domain` 表达，不额外暴露 `add definition to domain`、`remove domain from domain` 等碎片化接口。

Organize 不改变被组织 Definition 的 Lithograph Schema，也不改变权限、namespace、数据隔离或版本边界。

#### History：解释本体演化

History 只提供 Ontology-specific 的历史解释能力：

- `history`：查看 Ontology、某个 Domain 或某个 Definition 在 Lithograph history 中的相关变化；
- `diff`：比较两个 State 之间的 Ontology 变化，并可以按 Ontology、Domain 或 Definition 范围过滤。

History 不按对象复制成 `definition history`、`domain history`、`ontology history` 三套接口；target / scope 是同一能力的过滤维度。底层 Commit DAG、raw Diff/Patch、Merge 等数据库语义仍全部属于 Lithograph；KG OS 只返回排除了 internal semantic graph 表达细节后的 Ontology 业务视图。

Binding Record 的稳定 graph element identity 可以作为 KG OS **内部** history continuity anchor。例如一个 Definition 在两个 Snapshot 之间显式 rename 时，History 可以识别为“同一个 Binding Record 的 Schema Locator 发生变化”，而不是仅凭两个名称字符串猜测 rename。v1 History target / response 不暴露该 internal identity；公共结果使用目标 State 与业务 reference 表达对象和变化。

例如 KG OS 可以把同一个 Lithograph diff 中的 Schema 与 semantic graph 变化解释为：

```text
Person
+ property: nationality STRING
+ nationality.title: 国籍
+ nationality.description: 此人的国籍

Commerce
+ includes: Product
```

这里的输出是业务化解释，不产生新的 Ontology history。

#### 能力边界

Ontology 公共能力不暴露以下内部或重复接口：

- Property 独立 CRUD；
- `OntologyElement` / `SchemaElementMetadata` / binding record CRUD；
- raw semantic metadata graph CRUD；
- Domain tree validation 或业务合理性判断；
- Ontology 自己的 State / Branch / Tag / Evolution API；
- 与 Lithograph 重复的 Schema、Constraint、Index 或 Search Engine。

具体 request / response JSON、patch 表达、分页、搜索参数、已确认 identity/reference 规则的 wire serialization、CLI / SDK / Skill 命名与 error contract 仍属于[待设计合同](#待设计合同)。公共接口只能聚合或编排 Lithograph 能力，不能形成第二套 Schema、Search、State 或 Evolution 状态。

## Evolution

Evolution 是 KG OS 对 **Knowledge Base 状态演进**的公共能力域。它不创建第二套版本系统，而是把 Lithograph 的 immutable Commit DAG、Branch、Tag 与 Commit Data 映射成适合知识世界的 State、演进路径、状态标签和状态注释。

### State：Knowledge Base 的不可变状态

一个 KG OS State 与一个 Lithograph Commit 一一对应，并直接复用其底层 Commit identity；KG OS 不创建 `stateId` 到 Commit ID 的第二套持久化映射。最终公共 wire 是否使用 `state/...`、裸 ID 或其它表示仍由 Evolution wire contract 冻结，但其 identity 必须可无歧义映射到唯一 Lithograph Commit。

一个 State Snapshot 同时覆盖：

```text
State
└── immutable Snapshot
    ├── Ontology Structure   → versioned Lithograph Schema
    ├── Ontology Semantics   → versioned graph data
    │   ├── Definition / Property semantics
    │   └── Domain / INCLUDES organization
    └── Knowledge Data       → versioned graph data
```

因此 KG OS 不引入 `ontologyVersion`、`knowledgeVersion` 或另一套 State history。Ontology、Knowledge 与 Evolution 共享同一个底层 Commit DAG。

### State Data：可修改的状态注释

State Data 直接复用 Lithograph Commit Data，是调用方附加在某个 State 上的 mutable JSON annotation。KG OS 不预定义 `title`、`time`、`stage`、`world` 等业务字段，也不把 State Data 解释成领域事实。

State Data 与 State Snapshot 必须严格区分：

- State / Snapshot immutable；
- State Data 可以 set / replace / clear，不因此创建新 State；
- State Data 不进入 Ontology / Knowledge query、Constraint、Diff 或 Merge；
- 修改 State Data 不改变 State identity；
- 如果一项数据需要随世界状态一起历史化、查询、约束、Diff 或 Merge，它必须进入 Ontology / Knowledge，而不是 State Data。

因此 State detail 可以在读取时聚合 immutable State metadata 与当前 State Data，但响应必须保持字段边界，不能让 State Data 看起来像创建 Commit 时冻结的 Snapshot 内容。Branch / Tag 的枚举由独立能力负责；State `get` 不要求为了附带所有反向 refs 而扫描整个 ref 集合。

### Branch 与 Tag

KG OS 使用 Lithograph Branch 表达**可以继续演进的命名路径**，使用 Lithograph Tag 表达**显式命名的 State 引用**：

```text
Branch
→ 会随该 Branch 上成功的 Ontology / Knowledge write 向新 State 前进

Tag
→ 指向某个 State
→ 不随普通 write 自动移动
→ 只有显式 move 才改变目标
```

KG OS 不把 Lithograph connection-local `checkout` 提升为公共 Evolution 能力。AI / SDK 读取必须显式传递 State / Branch / Tag reference，写入必须显式指定目标 Branch，避免依赖隐藏的 connection state。底层实现可以按 Lithograph 合同管理 connection，但该状态不能成为 KG OS 公共请求语义的一部分。

### State reference

Ontology / Knowledge Read 共享同一套 State 引用语义：调用方可以直接引用确定 State，也可以通过 Branch / Tag 引用；KG OS 在 operation 开始时解析到 immutable State，并在整个 operation 中保持 pinned Snapshot。所有 read response 应返回最终 resolved State identity，使 Branch / Tag 后续移动不会改变已经返回数据的解释。这里的 State / Branch / Tag reference 类似 Git ref resolution，不建立独立 `State Context` 对象。

Ontology / Knowledge Write 则必须明确目标 Branch。普通写入继续由 Lithograph 自动产生 Commit，KG OS 不要求调用方执行 `mutate -> commit` 两步。一个 KG OS write 可以因为内部编排产生多个 Lithograph Commit，但成功响应必须返回**最终 State identity**；调用方无需依赖内部 Commit 数量来继续工作。

### Evolution 能力面

KG OS 当前只提升对知识世界有直接产品意义的版本能力，不镜像 Lithograph 的全部 Version Procedure：

```text
Evolution Capability
│
├── Read
│   ├── overview
│   ├── get
│   ├── graph
│   └── diff
│
├── State
│   ├── create
│   ├── set data
│   └── clear data
│
├── Branch
│   ├── list
│   ├── create
│   └── delete
│
├── Tag
│   ├── list
│   ├── create
│   ├── move
│   └── delete
│
└── merge
```

这些名称描述逻辑能力，不冻结最终 CLI command、SDK method 或 HTTP route。

`overview` 只返回适合导航的轻量摘要，例如 default Branch 及其 resolved head，并且不得扫描或展开完整 State DAG。Branch / Tag 的完整枚举分别通过 `branch.list` / `tag.list` 完成；当前没有真实需求要求为了假设中的超大 ref 集合提前冻结另一套分页机制，后续如底层能力和规模约束需要再加入。

`get` 读取一个 resolved State 的 immutable metadata 与当前 State Data。它不自动加载该 Snapshot 的全部 Ontology / Knowledge，也不默认反向枚举所有指向它的 Branch / Tag；真正的数据内容继续通过 `ontology.*` / `knowledge.*` 使用同一个 resolved State 读取。

`graph` 从调用方指定的 State / Branch / Tag root 开始读取该 root **可达的 ancestry DAG**，每次只返回 bounded slice，并通过 opaque cursor 渐进遍历。它返回轻量 State topology / metadata，默认不展开 State Data，更不加载每个 State 的 Knowledge Snapshot。State 数量很大时不提供“一次返回整个 DAG”的合同；不同 Branch 的独立演进空间通过选择对应 root 分别导航，不为“全库一次聚合所有 roots”增加第二套历史索引。

`diff` 返回 **KG OS public Knowledge Base diff**，而不是 raw Lithograph patch。它只比较两个 immutable State Snapshot，把同一个底层 State diff 业务化为公开 Ontology change 与 Knowledge change，并过滤 KG OS internal Binding Record、reserved Label / Relationship、Schema Locator 等实现细节；mutable State Data、Branch 与 Tag 不进入该 diff。Ontology `diff` 与 Knowledge `diff` 是该统一状态变化的 scope-specific view，而不是独立历史系统。Raw Lithograph Patch 不作为 KG OS 当前 Evolution 公共能力。

`state.create` 在调用方明确指定的 Branch 上建立一个新的业务 State，即使当前 Ontology / Knowledge Snapshot 与 parent 相同；底层映射到 Lithograph explicit empty-delta Commit，可同时设置初始 State Data。它不引入 Git working tree / staging，也不改变普通 Ontology / Knowledge write 自动产生 State 的规则。因为 Snapshot 可以与 parent 完全相同，`diff(parent, state)` 合法为空，即使新 State 拥有不同的 State Data。

`set data` / `clear data` 只修改 State Data sidecar，不创建新 State。`branch.create/delete` 与 `tag.create/move/delete` 只操作对应 Lithograph ref；Tag 不因 Branch write、merge 或其它普通状态演进自动移动。

`merge` 操作整个 Knowledge Base State，包括调用方 Ontology Structure、Ontology Semantics 与 Knowledge Data。底层使用 Lithograph merge，但 KG OS 必须把 conflict 与结果转换为公开 Ontology / Knowledge 语义，不向调用方泄露 internal semantic graph representation；如果某个底层冲突无法安全映射为公共对象，KG OS 返回不暴露内部标识的 consistency/conflict error，而不是透传 raw slot。Merge 成功后返回最终 State identity；State Data 与 Tag 的继承 / 移动继续服从 Lithograph sidecar/ref 规则，不由 KG OS 隐式猜测业务意图。

Lithograph 仍然提供 Patch、Rebase、Squash、Reset、Revert、GC、checkout 等通用数据库能力，但 KG OS 当前没有已确认需求要求把它们全部提升为公共产品能力。未来只有出现明确 KG OS 使用场景时才增加，不因底层存在就复制一套接口。

### History 与历史读取

历史 Definition 必须从目标 State Snapshot 的 Schema 与同一 Snapshot 的 semantic metadata 动态组合，不能使用当前 metadata 去解释旧 Schema，也不能使用当前 Schema 去解释历史 metadata。

历史 Domain 与 Ontology organization 同样从目标 State Snapshot 的 semantic graph 读取。任何 Ontology read view 都必须在同一个 State 上组合 Schema、Definition semantics、Domain organization 与相关结构投影，不能跨 State 拼接。

Ontology / Knowledge 自己的 `history` / `diff` 继续保留，但它们只是 Evolution / Lithograph history 的业务 scope：

```text
Evolution
→ 整个 Knowledge Base 的状态演进

Ontology History
→ Ontology scope 的演进解释

Knowledge History
→ Knowledge scope 的演进解释
```

它们不建立对象级 Commit、Branch、Tag 或第二套历史 identity。

## Knowledge 数据访问

Knowledge 表示知识库中真实存在的图数据。KG OS 不在 Lithograph Property Graph 之上再建立 `Entity`、`Fact`、`KnowledgeItem` 或其它第二套持久化知识对象模型。

逻辑数据模型保持与 Lithograph 一致：

```text
Knowledge
├── Node
│   ├── element identity
│   ├── 0..N Labels
│   └── Properties
│
└── Relationship
    ├── element identity
    ├── exactly 1 Relationship Type
    ├── From
    ├── To
    └── Properties
```

Ontology 与 Knowledge 的职责不同：

```text
Ontology
→ 定义“这些结构和字段在业务上是什么意思”

Knowledge
→ 保存“这个世界里实际有哪些节点、关系和值”
```

例如 Ontology 定义：

```text
Person
Company
Person -[:WORKS_AT]-> Company
```

对应的 Knowledge 可以是：

```text
张三 : Person
OpenAI : Company

张三 -[:WORKS_AT {role: "Engineer"}]-> OpenAI
```

Node / Relationship 的技术身份直接使用 Lithograph 公开的稳定 element identity；KG OS 不再创建 `knowledgeId`、`entityId` 或另一套元素身份。业务唯一性仍由调用方定义的 Ontology / Lithograph Schema 负责，不能把数据库 element identity 当成业务唯一键。

Knowledge 的 Property、Label、Relationship Type、端点、类型和查询语义都以 Lithograph 当前 Snapshot 中的真实 graph data 为准。KG OS 可以把 Label / Relationship Type 与对应 Ontology Definition 组合成更适合 AI 的业务化读取结果，但不能复制一份独立结构状态。具体 Definition reference 与 JSON wire shape 仍由[待设计合同](#待设计合同)冻结。

### Knowledge 能力面

KG OS 对外提供“高频快捷能力 + 完整 Cypher 能力”。高频操作不要求 AI 每次生成查询语句；快捷能力表达不了的复杂操作直接交给 Lithograph Cypher，KG OS 不创建第二门查询语言或第二套 Search DSL。

```text
Knowledge Capability
│
├── Read
│   ├── get
│   ├── list
│   ├── expand
│   └── query
│
├── Write
│   ├── mutate
│   └── execute
│
└── History
    ├── history
    └── diff
```

这些名称描述逻辑能力，不冻结最终 CLI command、SDK method 或 HTTP route。

#### Read：高频读取与任意只读 Cypher

`get` 按 Lithograph element identity 读取一个确定的 Node 或 Relationship；这是最直接的单元素读取快捷能力。

`list` 用于简单、高频的枚举与分页，例如按 Label 或 Relationship Type 浏览数据。`list` 不扩展成一套复杂过滤 DSL；需要组合条件、聚合、多跳图模式或其它复杂读取时使用 `query`。

`expand` 用于从一个 Node 快速读取直接相邻的 Relationship 与 Node，服务最常见的知识图浏览。方向、关系类型过滤、返回数量等具体参数属于公共 wire contract；复杂路径查询直接使用 `query`，不让 `expand` 演化成第二套 traversal language。

`query` 执行任意 **read-only Cypher**。它直接使用 Lithograph 的只读执行路径，必须拒绝 graph / schema / version/ref mutation、外部 I/O、connection-state mutation 或其它副作用。全文、向量、结构化条件、图遍历、聚合、排序与混合检索都可以由 AI 在同一个 Cypher 查询中按 Lithograph 当前公开能力自由组合，因此 KG OS 不额外建立 `search knowledge` 能力。

所有 Knowledge Read 都使用上述统一 State reference semantics。通过 Branch / Tag 读取时必须先解析并 pin 到 immutable State；返回结果带 resolved State identity。KG OS 不建立 `knowledgeVersion`。

#### Write：结构化 mutation 与完整可写 Cypher

`mutate` 是常规 Knowledge 写入的结构化入口。它支持以下基础 operation：

```text
create_node
create_relationship
update
delete
```

Node 与 Relationship 的 `update` / `delete` 使用同一种 element identity 定位目标，不按对象类型复制两套更新接口。最终 operation JSON、Property patch 与删除参数属于公共 wire contract。

`mutate` 原生支持 batch：一个请求中的 `operations` 可以只有一个 operation，也可以有多个 operation。因此 batch 不是另一套平行能力，而是 `mutate` 的核心语义。

同一 `mutate` 中，后续 operation 可以通过 request-local temporary reference 引用本次请求前面刚创建的 Node / Relationship。例如：

```json
{
  "operations": [
    {
      "op": "create_node",
      "ref": "person",
      "labels": ["Person"],
      "properties": {
        "name": "张三"
      }
    },
    {
      "op": "create_node",
      "ref": "company",
      "labels": ["Company"],
      "properties": {
        "name": "OpenAI"
      }
    },
    {
      "op": "create_relationship",
      "type": "WORKS_AT",
      "from": "person",
      "to": "company",
      "properties": {
        "role": "Engineer"
      }
    }
  ]
}
```

上例只冻结“batch 可以使用临时引用串联本次新建元素”的能力，不冻结最终字段命名。

一个 `mutate` 请求默认具有 all-or-nothing 的持久化语义：任一 operation 失败，整个请求的 Knowledge 写入都不 durable。KG OS 通过同一 connection 上的 caller-owned SQLite transaction 组合必要的 Lithograph mutation；这只定义 KG OS 请求级 transaction boundary，**不承诺一个 mutate 恰好产生一个 Lithograph Commit**。逻辑 Commit 粒度继续服从 Lithograph 公开执行合同；成功结果必须返回该请求完成后的最终 State identity。

`execute` 使用 Lithograph 的通用 Cypher execution path，供 AI 在结构化 `mutate` 无法方便表达时直接执行**普通 Knowledge graph-data mutation Cypher**，例如条件更新、`MERGE`、复杂模式匹配后修改或其它数据 mutation。只读任务应优先使用 `query`，从而获得明确的物理只读边界。Schema / Constraint / Index mutation 属于 Ontology Structure 能力，Branch / Tag / State / Merge mutation 属于 Evolution，不通过 Knowledge `execute` 暴露；Knowledge `execute` 也不能访问 `_lithograph_*` 内部实现或 KG OS 内部 Ontology semantic graph。成功的 writable `execute` 同样返回最终 State identity。

因此 Knowledge 写入的使用原则是：

```text
常规单次结构化修改
→ mutate with one operation

常规批量结构化修改
→ mutate with operations[]

复杂任意修改
→ execute Cypher
```

#### History：知识演化视图

`history` 与 `diff` 都是 Lithograph 统一版本历史上的 Knowledge-specific 视图：

- `history`：查看某个 Knowledge element 或指定 Knowledge scope 的相关历史变化；
- `diff`：比较两个 State 之间的 Knowledge graph 变化，并按需要过滤到目标元素或知识范围。

KG OS 不建立第二套 Knowledge State / Branch / Tag / Version。History 只筛选和业务化解释统一 State DAG / Diff 中属于普通 Knowledge 的变化，并默认排除 KG OS 内部 Ontology semantic graph。

### Knowledge 能力边界

Knowledge 公共能力遵守以下边界：

- 不建立 `Entity`、`Fact`、`KnowledgeItem` 等第二套 graph element；
- 不建立 KG OS query language、Search DSL 或独立 Search Engine；
- 不把全文、向量或混合检索拆成独立 Knowledge capability，AI 可以在 read-only Cypher 中按 Lithograph 语义自由组合；
- 不额外建立顶层 `batch` API；batch 是 `mutate.operations[]` 的原生能力；
- 不为 Node / Relationship 分别复制完整 CRUD surface；共同操作尽量按 element identity 统一；
- 不建立 Knowledge 自己的 ID、Schema、State、Branch、Tag 或 version state；
- 不允许普通 Knowledge API 返回或修改 KG OS 内部 Ontology semantic metadata，也不访问 Lithograph 内部表。

普通 Knowledge 的 CRUD、Cypher query / mutation、图遍历、全文／向量能力以及其它数据库语义最终都通过 Lithograph 公开接口完成。Ontology 负责告诉上层“当前 Knowledge 应按什么模型理解”；真实约束是否成立以及 query / mutation 的数据库语义由 Lithograph 按其公开 Schema 与 Cypher 合同负责。

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
→ Ontology / Knowledge / Evolution / Definition view
→ Lithograph public capabilities
→ SQLite
```

本次替换不改变 KG OS 的产品核心：AI-first、Graph-first、调用方定义领域模型、Agent 在 Kernel 外部，以及“一切皆可被定义”。改变的是底层责任归属：通用数据库能力回归 Lithograph，KG OS 聚焦知识库语义与交互。

## 关键设计决定

### D1 Lithograph 是 KG OS 的数据库核心

- 决定：KG OS 的图、Schema、Search 与 versioned-state mechanism 统一依赖 Lithograph 公开能力。
- 依据：这些能力已经属于独立通用数据库 Lithograph 的产品边界，KG OS 不应复制实现。
- 备选：继续维护 KG OS 自建 Graph Engine。
- 取舍：KG OS 明显简化，但实现进度受 Lithograph 对应公共能力的实际可用性约束。

### D2 Ontology Structure 只有一个真源

- 决定：Lithograph Schema 是全部结构状态的唯一真源；KG OS 对外 Ontology Structure 是其中调用方 Schema element 的业务投影，排除 KG OS-owned reserved internal Schema element。KG OS 不保存第二套结构 Schema。
- 依据：避免结构重复、漂移和双重约束语义。
- 备选：Lithograph Schema + KG OS JSON Schema 并存。
- 取舍：KG OS 能表达的调用方结构能力以 Lithograph / Cypher 25 已支持范围为边界；KG OS 可以在同一 Schema 中维护自身 internal graph 必需的 reserved infrastructure definitions，但不能把这些定义提升为调用方 Ontology 语义，也不能自行添加 Lithograph 不支持的结构语义。

### D3 Ontology 上层语义作为普通图数据

- 决定：Definition / Property 的 `title` / `description` 由稳定的 KG OS internal Binding Record 承载；Domain / `INCLUDES` 直接组织这些 Binding Record；Binding Record 通过 Snapshot-scoped Schema Locator 指向同一 Snapshot 的 Lithograph Schema element。全部仍是 Lithograph 中的普通 versioned graph data。
- 依据：Cypher 25 Graph Type 当前没有通用 description annotation，也不负责 KG OS 业务组织；普通图数据可以在不修改 Lithograph 的前提下承载上层语义并自动版本化。
- 备选：给 Lithograph 增加 KG OS 专用 Schema annotation。
- 取舍：KG OS 需要维护 Binding Record 与 Schema Locator 的一致性，并通过 Lithograph Graph View 在普通 Knowledge 访问中隔离自身 internal graph；内部 graph 同时受完整 Lithograph Schema / Constraint 约束，因此需要同一 Schema 中的 reserved internal element definitions。

### D4 Definition 是聚合视图，不是存储模型

- 决定：上层统一 CRUD Definition，读取时合并 Lithograph Schema 与 semantic metadata，写入时分派到真实底层能力。
- 依据：AI / Web 不应该理解两套底层来源，但也不能为了接口方便复制结构真源。
- 备选：持久化完整 Definition JSON。
- 取舍：读取和修改需要聚合 / 编排，但消除了 Definition 与真实 Schema 漂移的问题。

### D5 Evolution 只映射 Lithograph 的统一状态历史

- 决定：Ontology、semantic metadata 与 Knowledge 共用同一个 Lithograph Commit DAG；KG OS 把 Commit 解释为 State，把 Branch / Tag / Commit Data 分别解释为演进路径、状态标签与 State Data，但不建立第二套 State storage、identity 或 history。
- 依据：Schema 与普通 graph data 已经进入 Lithograph canonical history，且 Lithograph 已提供 Commit Data / Tag 等通用 state sidecar/ref 能力。
- 备选：KG OS 单独维护 State、Tag、annotation 或 Ontology version。
- 取舍：状态身份与数据库 history 统一；KG OS 需要提供业务化 Evolution view，并严格区分 immutable State Snapshot 与 mutable State Data / refs。

### D6 SQLite 是 Host，不是 KG OS 数据接口

- 决定：KG OS 只为 Lithograph 使用 SQLite connection / extension loading / transaction boundary，不直接维护知识业务表。
- 依据：避免绕过 Lithograph 的 Schema、版本和数据完整性合同。
- 备选：KG OS 在同一 SQLite database 中直接维护并查询业务表。
- 取舍：所有持久化知识能力必须能通过 Lithograph 公共接口完成。

### D7 Domain 是弱约束的业务组织图

- 决定：Domain 通过 `includes → Domain | Definition` 组织 Ontology，不要求 tree / DAG，不产生 namespace、Schema scope、权限或数据隔离。
- 依据：Domain 的当前需求是帮助 AI / 人按业务语境浏览和理解模型，而不是重新定义模型结构；Lithograph 已经承担真实图和 Schema 约束。
- 备选：建立强层级 Domain tree、独立 Domain Schema 或 Domain-local namespace。
- 取舍：调用方可以表达多父级、跨领域和 cycle；KG OS 的递归读取必须 graph-safe，但不替调用方判断业务组织是否合理。

### D8 AI-facing Ontology 是业务化聚合视图

- 决定：AI 获取由 Lithograph Schema、KG OS Schema semantics 与 Domain organization 动态组合的 Ontology JSON；该 JSON 不是持久化 Schema，也不是整体回写对象。
- 依据：AI 需要直接理解“模型是什么、字段是什么意思、模型如何组织”，但底层仍必须保持单一结构真源和单一版本真源。
- 备选：让 AI 分别读取 Lithograph Schema 与 KG OS metadata，或持久化一份完整 Ontology JSON。
- 取舍：KG OS 需要提供 read aggregation 和渐进式读取，并明确 read/write contract 分离。

### D9 Ontology 能力按生命周期收敛为四组

- 决定：Ontology 公共能力固定按 Read、Define、Organize、History 四组职责组织；Property 随 Definition 管理，`includes` 随 Domain 管理；Read 直接复用统一的 State / Branch / Tag reference semantics，不建立额外状态上下文资源。
- 依据：AI 需要发现、理解、定义、组织和审阅变化，但这些任务不要求为每种 Schema element 或 membership 建立一套重复 CRUD；能力应围绕真实 owner 与 lifecycle 收敛。
- 备选：按 Domain / Definition / Property / Relationship 分别暴露完整 CRUD，或按 Discover / Understand / History 等用户旅程建立重叠接口族。
- 取舍：公共能力面更小、更稳定；最终 wire contract 仍需定义统一 target、scope、pagination、search 与 patch 表达。

### D10 Knowledge 使用快捷能力加 Cypher 完整能力

- 决定：Knowledge 公共面提供 `get` / `list` / `expand` 等高频 Read、结构化 `mutate`、只读 `query`、Knowledge graph-data 可写 `execute` 以及 `history` / `diff`；复杂查询、Search 与数据修改能力不重新抽象，直接使用 Lithograph Cypher。
- 依据：AI 不应为每个简单操作重复生成 Cypher，但 KG OS 也不应为全文、向量、图遍历、复杂过滤或 mutation 再发明一套能力语言。快捷能力解决调用便利，Cypher 保留完整表达能力。
- 备选：所有操作都要求 AI 写 Cypher；或为 CRUD、Search、Graph Query、Vector Search、Full-text Search、Batch Mutation 分别建立完整公共 API。
- 取舍：KG OS 需要维护少量稳定快捷合同和 `mutate` batch 编排；同时 `query` 必须具有真实 read-only 边界，`mutate` 的请求级原子性必须由 transaction 编排保证。

### D11 Binding Record 提供语义连续性，Schema Locator 只负责定位

- 决定：KG OS 不要求 Lithograph 提供永久 `SchemaElementId`。Definition / Property semantic metadata 使用有稳定 Lithograph graph element identity 的内部 Binding Record；Binding Record 保存 Snapshot-scoped Schema Locator，Locator 只在目标 Commit 的 Schema 中确定性定位 element type / Property。
- 依据：KG OS 当前需要的是 metadata、Domain membership 与显式 rename/history 的连续性，而不是把 Lithograph Schema 自身改造成带永久对象 ID 的另一种模型。Binding Record 已经能承担 KG OS 的连续性需求；结构事实仍由 Lithograph Schema 唯一拥有。
- 备选：仅以名称字符串同时承担跨版本连续 identity；要求 Lithograph 新增跨版本永久 Schema element identity；在 KG OS 再建立一份独立结构 Schema。
- 取舍：通过 KG OS 执行的显式 rename 必须原子更新 Lithograph Schema 与 Binding Record Locator；绕过 KG OS 的直接 Schema 修改可能产生 consistency error，KG OS 不做无依据自动修复。

### D12 Evolution 不镜像 Lithograph Version Procedure

- 决定：KG OS 当前 Evolution 只提供 `overview/get/graph/diff`、State create/data、Branch lifecycle、Tag lifecycle 与 merge；不因为 Lithograph 有 patch/rebase/squash/reset/revert/gc/checkout 就全部复制为 KG OS 公共能力。
- 依据：KG OS 的产品职责是知识世界的状态演进，不是通用数据库版本控制客户端；直接复制底层接口会扩大公共合同并泄露 internal semantic graph / connection-local 机制。
- 备选：一比一包装 Lithograph Version Procedure。
- 取舍：KG OS 公共能力更小、更稳定；高级数据库版本操作仍可由 Lithograph 提供，未来出现真实 KG OS use case 时再按业务语义提升。

### D13 State 引用显式且所有状态写入返回最终 State

- 决定：Ontology / Knowledge Read 直接使用 State / Branch / Tag reference；Branch / Tag 在 operation 开始时解析并 pin 到 immutable State，不再建立独立 `State Context` 抽象。Ontology / Knowledge Write 显式指定目标 Branch，不暴露 checkout；任何创建新 State 的 KG OS 操作成功后都返回最终 State identity，多步编排不要求调用方理解内部 Commit 数量。
- 依据：Git-style ref 已足以表达“读取哪个 Snapshot / 推进哪个 Branch”，无需再增加一层状态对象；同时 AI 与并发调用不应依赖 connection-local 隐式状态。
- 备选：建立独立 State Context request object；依赖 Lithograph checkout；或仅返回业务 mutation result 不返回 State。
- 取舍：公共模型更小；最终 JSON / CLI 中如何序列化 State、Branch、Tag reference 仍需冻结，但不会产生第二套状态身份。

### D14 公共身份优先复用 owner identity 或名称定位

- 决定：KG OS 不建立全局 Resource ID / UUID 体系。State 与 Knowledge element 分别直接复用 Lithograph Commit / element identity；Branch / Tag 使用其名称；Definition 使用 kind + 当前 Schema identifying name；Property 使用 owner Definition reference + property name；Domain 使用当前 name。Definition / Property / Domain 的跨 rename 连续性由 KG OS internal graph identity 维护，不作为 v1 public identity。
- 依据：这些资源已经有足够的确定性定位信息；额外 UUID 会建立第二套身份映射，却没有当前使用场景需要调用方跨 rename 持有 opaque public identifier。
- 备选：为 Definition、Property、Domain 统一生成稳定 public UUID；直接暴露 Binding Record / Domain Node 的 Lithograph element identity。
- 取舍：rename 后公共名称引用会变化，历史读取必须结合目标 State；KG OS History / Diff 仍可依靠内部稳定 identity 识别连续性。若未来出现真实的跨 rename opaque-reference 需求，再通过新的设计修订评估稳定 public ID。

## 待设计合同

以下问题尚未冻结，但不会回退前述架构原则：

1. **Internal physical identifiers**：为 internal marker、Definition Binding、Property Binding、Domain、`INCLUDES` 与 Binding Record 间关系选择具体 KG OS-owned reserved Label / Relationship Type / Property key，并定义 Lithograph Schema 中对应 reserved internal element definitions。具体字符串是实现级持久化编码，不提升为公共 Ontology 概念。
2. **Definition / Ontology 公共 wire contract**：在已确认的 Read / Define / Organize / History 能力边界内，冻结已确认 Definition / Property / Domain reference 与 State / Branch / Tag reference 的具体 wire serialization、target / scope、分页、Ontology search、读取形态、渐进式读取、create/update/rename patch 语义、consistency error model、最终 State result 与 CLI / SDK / Skill interface。v1 不暴露内部 Binding Record / Domain Node identity；本文示例与能力名只冻结信息责任和逻辑操作，不冻结最终 wire schema 或命令命名。
3. **Definition 删除语义**：删除结构定义时，对现有 Knowledge Data、Binding Record、Domain membership 与历史引用的处理边界。
4. **多步写入映射**：如何把一个 Definition create/update/rename/delete 操作拆成最少的 Lithograph Schema / graph mutation，并在不创造第二套 transaction / commit 语义的前提下报告最终 State 与业务结果。
5. **Knowledge 公共 wire contract**：Node / Relationship 的 AI-facing graph view、已确认 Lithograph element identity / Definition reference 的 wire serialization、`get` / `list` / `expand` 参数与分页、State / Branch / Tag reference 的具体请求形态、read-only `query` 的 request / result、`mutate.operations[]` 与 request-local reference、`execute` 结果与最终 State、Knowledge `history` / `diff` target / scope、error model 与 CLI / SDK / Skill interface。全文／向量／混合检索不建立第二套合同，继续通过 Cypher 使用 Lithograph 对应能力。
6. **Evolution 公共 wire contract**：冻结已确认 State / Branch / Tag reference 的具体序列化与 ref resolution error、`overview` 摘要形态、`get` 的 immutable metadata / mutable State Data 分层、Branch / Tag list、`graph` root / cursor 与 ancestry traversal shape、State Data size/error boundary、`state.create`、Branch / Tag mutation、业务化 `diff`、merge conflict / result 映射、最终 State result 与 CLI / SDK / Skill interface。Raw Lithograph patch、checkout、rebase、squash、reset、revert、gc 当前不进入该公共合同。
7. **Human-facing Web**：Ontology / Knowledge / Evolution / History 的查看、管理和纠正交互。

这些合同应在需要实现对应能力前逐项设计；没有当前需求的扩展字段、抽象层或兼容层不提前加入。

## 工程实现待办

实现顺序应建立在 Lithograph 对应公开能力真实可用的基础上，具体 readiness 始终从 Lithograph 仓库检查，不在这里复制状态。

1. 建立最小 Lithograph host / client 边界，只暴露 KG OS 所需公开能力，不访问内部表。
2. 冻结 reserved internal physical identifiers 后实现 Ontology semantic graph：Definition / Property Binding Record、Domain / `INCLUDES`、同一 Lithograph Schema 中的 internal element definitions，以及基于 Lithograph `graphView` 的 Knowledge/Internal 隔离与 Snapshot-scoped Schema Locator resolution。
3. 实现 Ontology Read：概览、Domain / Definition 渐进式读取、`list definitions`、Ontology search 与统一 State / Branch / Tag reference semantics；验证结构字段全部来自 Lithograph，`title` / `description` 与 Domain organization 全部来自 KG OS semantic graph。
4. 实现 Define / Organize：Definition 与 Domain create / update 编排，Property 随 Definition、`includes` 随 Domain 管理，并完成 read/write contract 分离与跨步骤 transaction rollback。
5. 实现 Evolution 基础 Read：`overview`、State `get`、从明确 root 渐进读取 ancestry DAG 的 `graph`，以及 Branch / Tag list；保持 immutable State 与 mutable State Data / refs 的返回边界。
6. 实现 Evolution mutation：State create/data、Branch lifecycle、Tag lifecycle 与 whole-Knowledge-Base merge；不暴露 checkout，不复制尚无 KG OS use case 的 Lithograph Version Procedure。
7. 实现统一 History / Diff 的 Lithograph version 过滤与业务解释视图，Evolution diff 覆盖公开 Ontology + Knowledge 并隐藏 internal semantic graph；Ontology / Knowledge history/diff 作为 scope-specific view。
8. 实现 Knowledge Read 快捷能力与 read-only `query`：`get` / `list` / `expand` 只读取普通 Knowledge，所有读取固定到同一 resolved State，复杂检索与图查询直接走 Cypher。
9. 实现 Knowledge Write：`mutate` 支持单 operation、batch operations 与 request-local temporary reference，并用 caller-owned transaction 保证请求级 all-or-nothing；`execute` 暴露 Lithograph 可写 Cypher，不创建第二套 mutation language；成功写入返回最终 State identity。
10. 在 Ontology / Knowledge / Evolution 公共合同稳定后，再建立 AI-facing CLI / Skill、SDK 与 Human-facing Web。

实现、验证、提交和推送必须分别按仓库真实状态报告；设计完成不代表 Lithograph 依赖能力或 KG OS 功能已经实现。
