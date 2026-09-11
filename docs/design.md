# KG OS 设计

本文是 KG OS 当前技术架构与数据设计的真源。产品定义见 [README](../README.md)，协作规则见 [AGENTS](../AGENTS.md)。

## 设计状态导航

| 状态 | 范围与入口 |
| --- | --- |
| 已确认 | [目标架构](#目标架构)、[Lithograph 边界](#lithograph-边界)、[Knowledge Base](#knowledge-base)、[Ontology](#ontology)、[Definition](#definition)、[Object](#object)、[Knowledge 数据访问](#knowledge-数据访问)、[Graph](#graph)、[Evolution](#evolution)，以及 Ontology semantic graph 的内部隔离、Binding Record / Schema Locator、owner-backed Object Ref、单一 Object Value、canonical YAML editable representation + JSON representation、Git Extended Diff textual Patch 与 strict base-State mutation 模型 |
| 工程剩余 | [剩余依赖与工程合同](#剩余依赖与工程合同)只包括**不需要重新裁决核心产品语义**的依赖与工程设计：Lithograph public Schema projection / locator 依赖、Object Patch logical-slot → Lithograph operation 的实现映射、CLI / SDK / HTTP / Skill adapter mapping，以及 Human-facing Web。Object / Graph / Evolution 的 logical wire、StateRef、ObjectRef、pagination、typed value、error envelope、Patch transport 与 `__kgos_` internal persistence encoding 已在本文冻结；不得再把这些工程剩余项解释成 core model 尚未设计 |
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
      │ Public Capabilities  │
      │ ├── Object           │
      │ ├── Graph            │
      │ └── Evolution        │
      │                      │
      │ Data Semantics       │
      │ ├── Ontology         │
      │ └── Knowledge        │
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
| KG OS | Object / Graph / Evolution 公共能力、Ontology semantic metadata、Definition / Domain / Knowledge 的 AI-facing Object 投影、Knowledge Base 状态演进的业务化解释、AI-facing CLI / Skill、Human-facing Web |
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

一个 KG OS Knowledge Base 对应一个由 Lithograph 承载的知识世界。这里必须区分**公共能力面**与**State Snapshot 中的数据语义**：

```text
Public Capability
├── Object      → 定位、读取、维护明确对象
├── Graph       → 查询、遍历、搜索、集合级计算 / mutation
└── Evolution   → State / Branch / Tag / History / Diff / Merge

State Snapshot Data Semantics
├── Ontology    → 世界如何建模、模型是什么意思
└── Knowledge   → 世界中实际存在的 Node / Relationship / Property values
```

Ontology 与 Knowledge 仍是 KG OS 的核心产品语义和数据责任，但**不是另外两套平行公共 CRUD API**。一个 State Snapshot 内也不存在 Object、Graph、Evolution、Ontology、Knowledge 五份数据；Object / Graph 是访问同一 Ontology / Knowledge Snapshot 的公共能力，Evolution 管理 Snapshot 的版本演进。当前存储模型是：

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

State Data 是对某个 State 的**当前业务注释**，不是该 State Snapshot 的 immutable 内容。Branch / Tag 同样是当前引用状态。读取历史 State detail 时可以读取该 State **当前** State Data；Branch / Tag 是否当前指向它属于独立 Evolution ref 状态，不默认反向扫描进 State detail。无论通过何种能力读取，这些 sidecar/ref 都不表示“该 Commit 创建当时的注释或引用状态”。需要被 versioning、Cypher query、Constraint、Diff 或 Merge 共同管理的业务事实必须保存为 Ontology / Knowledge，而不是 State Data。

调用方定义领域模型。KG OS Kernel 不预定义 `Person`、`Company`、`works_at` 等领域概念，也不执行理解、分类、提炼或建模决策；这些认知工作仍属于外部 Agent / Skill。

### Knowledge Base bootstrap

KG OS v1 只负责初始化自己创建或明确以**空 Lithograph Root State**交给 KG OS 的 Knowledge Base，不自动接管一个已经包含调用方 graph / Schema history 的任意 Lithograph database。自动 adoption 会要求 KG OS 猜测已有 Schema element 与 semantic Binding / Domain 的业务意图，属于独立的数据导入 / 迁移问题，不是普通启动流程。

Bootstrap 流程是：先执行 Lithograph `lithograph_init()` 得到空图 Root Commit 与 `main`，再通过 Lithograph 公开 mutation 能力建立当前 KG OS 版本要求的 reserved internal Schema resources，使 `main` 最终指向第一个 **KG OS-valid State**。Bootstrap 完成前不开放 Object / Graph / 普通 Evolution mutation；若不能通过 Lithograph 公共能力在不留下 durable inconsistent KG OS State 的前提下完成 reserved resources 建立，则初始化失败，不退回直接 SQL 或内部表写入。

Lithograph Root Commit 与 bootstrap 过程中不可作为正常 KG OS Snapshot 解释的底层 Commit 仍保留在 immutable DAG；它们属于 pre-KGOS / invalid history，只能按 D31 的 Evolution 诊断规则查看。KG OS 公共业务能力从第一个 KG OS-valid State 开始。未来若需要把已有 Lithograph database 导入 KG OS，必须另行设计显式 adoption / migration contract；v1 不做自动推断。

## Ontology

KG OS Ontology 是一个知识库对“这个世界如何建模、这些模型意味着什么，以及这些模型在业务上如何组织”的完整定义。它不是一份独立 Schema 文件，而是两个来源的组合：

```text
KG OS Ontology
├── Structure  → Lithograph Schema
└── Semantics  → KG OS semantic metadata graph
```

### Structure：Lithograph 是唯一结构真源

Ontology 的结构部分完全复用 Lithograph 当前公开设计中的 Cypher 25 Graph Type / Schema 能力。具体可表达范围始终以 Lithograph 自己的 Cypher compatibility profile 和公开合同为准。

Lithograph Schema 同时可能包含 KG OS 运行自身 semantic graph 所需的 reserved internal Schema resources，包括 element / property definitions 以及实现 KG OS 内部完整性所需的 Constraint / Index definition。它们仍由 Lithograph versioned Schema 承载，但属于 KG OS infrastructure implementation，不属于调用方 Ontology Structure。KG OS 对外读取 Ontology Structure 时只投影调用方定义的 Schema resources，并排除全部 KG OS-owned reserved internal Schema resources；这只是业务可见性过滤，不建立第二套结构状态。

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

字段语义不引入独立的**持久化顶层 Ontology entity**。`Person.name`、`WORKS_AT.since` 等 Property 的 `title` / `description` 在 Definition 中仍作为对应 Property 的业务解释；为了统一 Object read / patch，Property 同时是一个以 owner Definition Ref + property name 定位的**可寻址 child Object projection**。这个 Object 身份不意味着 KG OS 额外持久化一个 Property entity；底层结构仍由 Lithograph Schema 拥有，业务语义仍由 Property Binding Record 承载。

Definition Object 可以为了整体理解包含其 Property 的完整业务化投影；Property Object 则提供针对单个 Property 的小上下文读取与修改。两者是同一底层状态的**重叠投影**，不是两份数据。调用方可以任选父级 Definition entry 或 child Property entry 表达一次 Property change，但同一个 Object Patch 不允许两个 entry 对同一底层 Property state 产生重叠修改；检测到这种 parent / child overlap 时必须 reject，而不是按 entry 顺序决定胜负。

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

- `name`：Domain 的业务名称，同时作为当前 Snapshot 中的公共定位名称；v1 要求 decode 后为 1..255 UTF-8 bytes，禁止 NUL 与 ASCII control character，同一个 State 内 Domain name 唯一。名称按原始 Unicode code point / UTF-8 bytes 区分，不做 normalization 或 case folding；Domain rename 会改变公共引用，但内部 Domain Node identity 保持连续，wire 使用本文 `domain:<percent-encoded-name>`；
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

KG OS v1 为所有 KG OS-owned internal graph / Schema identifier 保留 exact UTF-8 prefix `__kgos_`。调用方创建或修改的 Label、Relationship Type、Property key、Graph Type resource name、Constraint name、Index name 等只要以该 prefix 开头，都在 KG OS 公共 mutation boundary 返回 `RESERVED_IDENTIFIER`；比较按 Lithograph identifier 的实际 name semantics，不额外做 Unicode normalization。这个 namespace 只服务 KG OS 基础设施，不进入调用方 Ontology 语义。

v1 internal semantic graph 的最小持久化编码固定为：

```text
Node labels
  __kgos_internal             # 所有 KG OS internal Node 的 marker
  __kgos_definition_binding
  __kgos_property_binding
  __kgos_domain

Relationship types
  __kgos_property_of          # Property Binding -> Definition Binding
  __kgos_includes             # Domain -> Domain | Definition Binding

Property keys
  __kgos_kind                 # definition: node | relationship
  __kgos_name                 # 当前 definition/property/domain name
  __kgos_title
  __kgos_description
```

Definition Binding 的当前 Schema Locator 由 `__kgos_kind + __kgos_name` 表达；Property Binding 的 locator 由自身 `__kgos_name` 加 `__kgos_property_of` 指向的 Definition Binding 当前 locator 组成。这样 rename 只更新对应 Binding Record 的当前 locator component，stable internal Node identity 与 Domain / Property ownership edge 不重建。Domain 使用 `__kgos_name` 作为当前公共 name；`title` / `description` 都是 optional。KG OS 不再为 locator 保存 JSON blob、第二套 Schema AST 或额外 UUID。

这些 exact identifier 是 KG OS internal persistence-format constant；未来修改必须通过显式 KG OS migration 保持已有 State 可解释，不能在普通软件升级中静默改名。internal Graph Type / Constraint 只声明上述真实所需 element/property legality；没有已验证性能或完整性需求时不提前增加 internal Index / Constraint，Binding coverage、Domain/Definition/Property uniqueness 与 kind/locator consistency 继续由本文定义的 KG OS consistency validation 保证。

- 所有 KG OS Ontology 内部 Node 都必须携带 reserved marker Label `__kgos_internal`；它属于已冻结 internal persistence encoding，不进入公共 Object / Graph wire；
- KG OS 内部 Relationship 只连接 KG OS internal Node，不通过普通 graph edge 直接连接调用方 Knowledge Node；
- 面向普通 Knowledge 的 Object `list` / `search` / `read` / `patch` 与 Graph `query` / `execute` 必须由 KG OS 构造 Lithograph execution options，并使用 Lithograph 公开 `graphView` 能力排除 reserved internal marker；调用方不能通过这些公共能力覆盖这个内部 Graph View；
- 普通 Knowledge mutation 的 **candidate target state** 也必须保持在公共 Graph View 内：Object Patch / Graph Execute 不得给普通 Node 添加 reserved internal marker，不得创建 / 改造成 KG OS-owned internal Relationship Type，也不得设置 KG OS-owned reserved internal Property key。即使调用方猜到具体内部字符串，mutation boundary 也必须 reject，不能先写入再依靠读取过滤隐藏；
- Ontology semantic graph 的内部读取使用相反的 Graph View，只允许 KG OS internal Node 进入本次 Cypher 的可见 Property Subgraph；
- 这种隔离必须在 Lithograph Planner / Executor / Search / mutation boundary 生效，不能由 KG OS 对查询结果事后过滤，也不能通过直接访问 `_lithograph_*` 实现；
- Lithograph `graphView` 不是认证系统，因此拥有底层 Lithograph 原始访问权的主体仍可绕过 KG OS 查看完整 graph；KG OS 只保证其自身公开能力不会泄漏或误改内部 semantic graph。

KG OS internal graph 使用普通 Lithograph graph data，因此仍受目标 Snapshot 的 Lithograph Schema / Constraint 约束。为了让调用方可以使用 closed / strongly constrained Graph Type，KG OS 必须在**同一份 Lithograph versioned Schema** 中维护自身运行所需的 reserved internal element types / properties，以及当前实现真实需要的 internal Constraint / Index definition。这些内部 Schema resources 不是调用方 Ontology Structure，不创建调用方 Binding Record，也不参与 Domain organization；它们不能通过 Object `list` / `search` 被发现，不能通过普通 Object `read` / `patch` 访问，也不能通过 Graph 能力读取或修改。KG OS 不为它们建立第二套 Schema。若 Lithograph 的公开 Schema 能力无法同时表达调用方结构与这些必要 internal resources，则该 KG OS 实现路径视为依赖能力不足，不能退回直接 SQL 或旁路存储。

隔离同时作用于**输入 target**，而不是只过滤输出：调用方通过 Graph Type / Definition / Property / Constraint / Index Object Patch 创建或修改 Ontology Structure 时，任何直接定义 reserved internal identifier、与其发生命名冲突、或让调用方 Constraint / Index target 指向 reserved internal Schema resource 的目标状态都必须在编译前 reject。调用方不能通过知道内部名字来跨越 Object / Graph visibility boundary。

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

在一个 **KG OS-valid State** 中，每个调用方可见的 Definition 与 Property 都必须恰好存在一个对应的 Definition / Property Binding Record，即使 `title` / `description` 全部缺省。Binding Record 因而不仅保存可选语义，也承担 Domain organization 与跨 rename continuity anchor。KG OS-owned reserved internal Schema resources 是这一覆盖规则的例外，不创建调用方 Binding Record；调用方可见 Graph Type / standalone Constraint / Index 本来也不使用 Binding Record，其身份和内容直接归 Lithograph Schema 所有。

因此一致性检查是双向的：Binding Record 的 Schema Locator 必须解析到正确 kind 的当前 Schema element；同时每个调用方可见的 Definition / Property Schema element 也必须能找到唯一 Binding Record。缺失、重复、悬空或 kind 不匹配都属于 **Ontology consistency error**。通过 KG OS Object Patch 进行 create / rename / delete 时必须原子维护这个一一对应关系；绕过 KG OS 直接修改 Lithograph Schema 可以使目标 Snapshot 不再是 KG OS-valid State，KG OS 不猜测或自动补建 Binding。

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

Schema Locator 的 KG OS internal persistence encoding 已由本节 `__kgos_` Binding 字段冻结：Definition 使用 `__kgos_kind + __kgos_name`，Property 使用 `__kgos_name + __kgos_property_of` 的 owner locator。解析时再映射到 Lithograph 公开 Graph Type / Schema introspection contract；KG OS 不把 Schema Locator 另序列化为公共 JSON/YAML 对象。Schema Locator 不保存 Commit ID，因为 Binding Record 本身已经与 Schema 一起进入同一个 Lithograph Snapshot；读取时始终以目标 Commit 同时解析 Binding Record 和 Schema。

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

当调用方通过 Object Patch 明确请求 Definition / Property rename 时，KG OS 在产品层保持 Binding Record 连续，并把 rename 编译为 Lithograph 当前公开能力能够表达的**语义保持目标 Snapshot change**。这个合同不要求 Lithograph 提供原生 rename；底层可以表现为 old element remove + new element add，并必须同步完成 D17 定义的已有 Knowledge migration。Domain `INCLUDES` 等指向 Binding Record 的组织关系不因此重建。成功结果必须返回被 rename Object 自身的旧 Ref → 新 Ref transition。若 Relationship Definition rename 派生出大量 Relationship replacement，旧 Relationship Ref 在新 State 中失效，调用方通过 Graph 重新发现新 Relationship；Evolution diff/history 只保证可审计新旧集合变化，不承诺恢复一对一 oldRef → newRef 映射。

如果有人绕过 KG OS 直接修改 Lithograph Schema，导致上述双向 Binding 覆盖不成立，KG OS 必须把该 Snapshot 判定为 **Ontology consistency error**：不猜测 rename target、不自动创建或迁移 metadata、不静默删除 Binding Record。历史 KG OS-valid Snapshot 仍按各自当时的 Binding Record + Schema Locator 正常解析。

Consistency-invalid Lithograph Commit 仍然存在于底层 DAG，KG OS 不篡改历史把它“修掉”。Evolution `overview` / `get` / `ancestry` 可以为了诊断暴露该 Commit / ref 的轻量 identity、topology、State Data 与一致性状态，但不能把它伪装成正常可解释 Snapshot。Object `list` / `search` / `read` / `patch`、Graph `query` / `execute` 以及会创建新 State 或把 Branch / Tag 指向目标 Snapshot 的 KG OS mutation 都要求相关 base / target State 满足当前 KG OS consistency invariants；否则返回 consistency error。修复这种绕过 KG OS 造成的底层状态不属于 v1 自动恢复能力。

#### Object Ref 与公共身份

KG OS 不建立一套覆盖所有资源的额外 UUID / Resource ID 体系。Object Ref 直接复用对象 owner 已有的原生 identity，或使用当前 Snapshot 中足以确定定位的业务名称；KG OS 不再把原生 identity 包装成第二种公开地址：

| Object | Object Ref / 定位依据 |
| --- | --- |
| Knowledge Node | Lithograph `elementId()`，例如 `n:123` |
| Knowledge Relationship | Lithograph `elementId()`，例如 `r:456` |
| Current Graph Type | Lithograph 公开 current Graph Type locator / identity |
| Node Definition | `kind=node` + 当前 Schema identifying name |
| Relationship Definition | `kind=relationship` + 当前 Relationship Type / Schema identifying name |
| Property | owner Definition Ref + 当前 property name |
| Standalone Constraint | Lithograph 公开 constraint identity / name |
| Index Definition | Lithograph 公开 index identity / name |
| Domain | 当前 Domain name |

Object Ref v1 的 canonical string serialization 固定为：

```text
Knowledge Node             n:<decimal-id>
Knowledge Relationship     r:<decimal-id>
Node Definition            node:<name>
Relationship Definition    relationship:<name>
Property                   property:<owner-definition-ref>#<property-name>
Domain                     domain:<name>
Current Graph Type         graph-type:<lithograph-locator>
Standalone Constraint      constraint:<lithograph-locator>
Index Definition           index:<lithograph-locator>
```

其中 `<name>`、`<property-name>` 与 Lithograph locator component 先按 UTF-8 编码，再按 RFC 3986 percent-encoding 作为单个 component 序列化；unreserved bytes `ALPHA / DIGIT / - . _ ~` 保持原样，其它 byte 使用 `%HH` uppercase hex。KG OS 不做 Unicode normalization、case folding 或名称重写。Property 的 owner 只能是 `node:...` 或 `relationship:...` Definition Ref；因为 component 内的 `#` 必须 percent-encode，raw `#` 可以无歧义作为 owner Ref 与 property name 的分隔符。

公共 API 输入的 Object Ref 必须是 canonical serialization：percent escape 使用 uppercase `%HH`，可保持 unreserved 的 byte 不能额外 percent-encode，decode 后必须是合法 UTF-8；同一个 Object 不接受多种等价 Ref 拼写。非 canonical / 非法编码返回 `INVALID_ARGUMENT`，不存在的 canonical Ref 才返回 `OBJECT_NOT_FOUND`。

`graph-type:` / `constraint:` / `index:` 后的 locator 只是 Lithograph **公开 canonical locator / identity 的无损字符串编码**，不建立 KG OS name→ID mapping。若 Lithograph 对某类 Schema resource 尚未提供可无歧义序列化的公开 canonical locator，该 Object kind 的实现继续按前述规则视为底层公共能力阻塞；KG OS 不通过内部表或自建 UUID 补洞。

Knowledge element 必须直接使用 Lithograph 已公开的 `n:<id>` / `r:<id>`，不能再转换成 `/knowledge/n:<id>`、`object:n:<id>` 或其它 KG OS 专用身份。Graph 查询返回的 `elementId()` 因而可以原样用于 Object `read` / `patch`，也可以原样重新用于 Cypher。

“统一 Object Ref”表示所有 Object 都通过一个公共 `ref` 概念定位，**不表示所有 Ref 都是同一种 Lithograph value**。只有 Knowledge Node / Relationship 的 `n:<id>` / `r:<id>` 是 Cypher `elementId()` 字符串，可以直接用于 `elementId()` 比较；Definition / Property / Domain / Graph Type / Constraint / Index Ref 是各自 owner 的 Schema / KG OS locator，只用于相应 Object / Evolution 语义，不能当作 Knowledge elementId 传入 Cypher。Object discovery result 按本文 `ObjectSummary` 同时返回 `kind + ref`，调用方不需要从任意 locator 内容猜 Object kind。

如果 Lithograph 对某类 versioned Schema resource 尚未提供足以无歧义 read / mutate / history 的公共 locator / identity，KG OS 不得通过读取内部表、生成持久 UUID 或维护 name→ID side table 来补洞；对应 Object kind 的实现 readiness 视为被底层公共能力阻塞，直到 Lithograph 自身公共合同能够支持。这个规则保证“统一 Object”不会反过来迫使 KG OS 建立第二套 Schema identity。

State / Branch / Tag 不是另一类 Object identity，而是 Evolution reference：State 直接复用 Lithograph Commit identity，Branch / Tag 直接复用各自名称。一个历史对象的完整定位语义是 **State reference + Object Ref**；两者保持独立字段，不拼成新的永久 ID。

Definition、Property 与 Domain 的 Object Ref 用于在一个确定 Snapshot 中定位当前对象，不承担跨版本永久身份。显式 rename 后 Object Ref 随名称变化；KG OS internal Binding Record / Domain Node 的稳定 Lithograph graph element identity 负责跨 Commit 的内部连续性，使 Evolution History / Diff 可以把 rename 解释为同一对象的演化，而不是要求调用方持有额外 UUID。

因此：

```text
Object Ref
→ 在目标 Snapshot 中定位对象

State reference + Object Ref
→ 定位历史 Snapshot 中的对象

internal graph identity
→ KG OS 内部识别跨 Snapshot 连续性
```

内部 Binding Record / Domain Node identity 当前不进入 v1 公共 identity。未来只有出现必须跨 rename 长期持有 opaque public identifier 的真实需求时，才重新评估是否暴露稳定公共 ID。

### 自描述目标

AI 需要形成对完整 Ontology 的理解时，应能够只通过 KG OS 公共 Object 能力逐步取得：

```text
Lithograph Schema
        +
KG OS Schema semantics
        +
KG OS Domain organization
        ↓
业务化、可理解的 Ontology
```

这不承诺一个独立的“完整 Ontology Object”或 `get ontology` API。AI 可以通过 Object `list` / `search` 发现相关 Domain / Definition / Property，再通过 Object `read` 取得同一 resolved State 的业务化投影，并在调用方上下文中组合完整理解。AI 不需要读取 KG OS 源码、外部 Markdown 或另一套 Schema 数据库才能理解当前 Knowledge Base 的模型。结构事实由 Lithograph 提供，业务解释与 Domain organization 由 KG OS semantic graph 提供。

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

公开 Definition Object Value 的最终外层字段与 child Property 形态由 [Object Value 与 representation](#object-value-与-representation) 统一冻结；本节只拥有聚合语义：结构约束实时来自 Lithograph，`title` / `description` 来自同一 State 的 KG OS semantic metadata，不保存第二份完整 Definition JSON。

### AI-facing Ontology discovery

Ontology 是由多个可寻址 Object 共同表达的业务模型，不再建立独立的 `get ontology` / `list definitions` / `get domain` / `search ontology` 公共 API，也不把“一份完整 Ontology JSON”定义成另一个可整体读写的顶层资源。除了 Domain / Definition / Property，Lithograph current Graph Type、standalone Constraint 与 Index definition 也作为只投影底层 Schema state 的 Object 暴露，从而让全部 versioned Ontology Structure 都能通过同一个 Object 模型读取和维护，而不是另开 Schema 管理接口。

AI 通过统一 Object 能力渐进理解 Ontology：

```text
Object list / search
        ↓
发现 Domain / Definition / Property / Graph Type / Constraint / Index Object Ref
        ↓
Object read
        ↓
读取相关 Object 的 canonical business projection
```

Definition Object 的结构字段只从目标 resolved State 的 Lithograph Schema 投影；`title` / `description` 从同一 State 的 Binding Record 投影；Domain Object 的 `includes` 从同一 State 的 semantic graph 投影。Definition 的 Domain membership 不保存为第二份单值字段，需要反向查看时从 Domain `includes` 动态推导。

调用方或 Human-facing Web 可以为了展示或上下文准备，把同一 resolved State 中多个 Object read result 组合成一个临时 Ontology aggregate view；这只是 client / presentation aggregation，不是新的 KG OS 公共资源、Object Ref、持久化格式或 mutation target。大型 Ontology 因此天然支持渐进读取，不要求 AI 一次加载完整模型。

### Create / Update

Definition Object 的创建或修改必须改变真实知识模型，而不是只改一份配置文档。

KG OS 将一次 Definition Object target change 拆分为：

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

Object Patch compiler 只使用 Lithograph **当前公开允许调用方构造 / 执行的能力**。当目标 graph / Schema / Index change 可以按 Lithograph 公共合同构造成合法 canonical Patch 时，KG OS 可以优先使用 `patch.apply` 以复用其 `before` condition 与单 Commit 原子应用语义；这不是 KG OS 对 Lithograph 的额外能力要求。无法或不适合通过单个 canonical patch 表达时，KG OS 在同一 connection 上使用最少的 Lithograph 公开 operation，并由 caller-owned SQLite transaction 保证请求级整体持久化原子性。SQLite transaction 只承担 transaction boundary，不改变“所有业务数据通过 Lithograph”的边界。

KG OS 不把内部编排步骤提升为公共语义。操作成功后必须返回最终 resolved State identity；如果调用方直接寻址修改的 Object 因 rename / restructure 导致底层 identity replacement，还必须返回该 Object 的 Ref transition。Definition-level migration 派生出的海量 Relationship replacement 遵守 Object 章节的批量迁移规则，不承诺逐对 transition。调用方不需要理解 KG OS 最终选择了 canonical patch、Cypher、Schema mutation 或其组合。

AI-facing Object read view 与 Patch contract 必须明确分离。调用方为了理解而临时组合的 Ontology aggregate view 不是 KG OS 顶层资源，也不等同于可整体 `PUT` 回去的持久化对象；单个 Object 的 canonical YAML 才是 Git Extended Diff Patch 的稳定 base。Patch 表达“希望目标 Object 变成什么”：

- 修改结构 → Lithograph Schema mutation；
- 修改 Definition / Property 的 `title` / `description` → Binding Record graph mutation；
- 显式 rename Definition / Property → rename 语义本身要求**保持已有 Knowledge 的业务含义**。KG OS 必须自动编排完成使目标 Snapshot 合法所必需的结构迁移：同步更新引用旧 Definition / Property 名称的 Lithograph Schema / Constraint / Index definition；Node Definition identifying label rename 迁移受影响 Node 的 identifying Label；Property rename 只迁移按 Lithograph 当前 Schema coverage 属于其 owner Definition 的 element 上对应 property value 到新 key，不能把同名 key 在无关 Definition / schema-free data 上做全图 rename；Relationship Definition / type rename 在 Lithograph 不能原地修改 Relationship Type 时重建受影响 Relationship，并保持端点与 Property。若同一个 physical element / property slot 同时受其它 Definition 约束，使局部 rename 无法在不改变其它模型语义的前提下完成，或新 key 已有值且未被同一 Patch 明确解决，或任何 Schema / Constraint / 底层能力使这种语义保持迁移无法安全完成，则整个 Patch 失败；不能静默覆盖数据，也不能只改 Schema Locator 后留下旧 Knowledge 与新 Definition 脱节；
- 其它 restructure → 只执行由调用方目标 Object change 明确要求、以及为满足 Lithograph / KG OS 一致性所必需的变化；不得借 restructure 隐式删除无关 Knowledge；
- 创建、修改、删除 Domain 或 `includes` → semantic graph mutation；
- 同一个上层操作涉及多类 mutation 时，按本节 transaction 边界整体判断成功或失败。

KG OS 不能因为 read view 中同时出现结构和语义字段，就把完整 JSON 再保存一份。

### Delete

Definition / Property 删除遵循 **不隐式修改 Knowledge** 的原则。Ontology 结构删除不能自动级联删除、迁移或保留为 orphan 的普通 Knowledge Data。

删除规则针对**整个 Object Patch 明确声明的目标变化**检查，而不是只检查单个 delete operation。KG OS 先以 `baseState` 读取当前 Snapshot，再把同一 Patch 中显式声明的 Knowledge / Ontology 变化组成目标 Snapshot 计划：

```text
base State
        ↓
应用本次 Object Patch 的显式目标变化
        ↓
校验目标 Snapshot 是否仍存在 Knowledge / Schema dependency
        ↓
存在依赖 → reject
不存在依赖 → 原子执行
```

在应用同一 Patch 中所有显式变化后的 **planned target Snapshot** 上，Knowledge dependency 至少包括：

- 删除 Node Definition 后，planned target Knowledge 中仍有使用该 Definition 的 Node；
- 删除 Relationship Definition 后，planned target Knowledge 中仍有使用该 Definition 的 Relationship；
- 删除 Property 后，planned target Knowledge 中仍有该 Property 的实际值。

具体“某个 graph element 是否使用目标 Schema element”的判断必须服从 Lithograph 当前公开 Schema / graph 语义，KG OS 不另外发明一套实例判定规则。若 Lithograph Schema 自身还存在结构依赖，删除同样必须满足 Lithograph 的公开 Schema mutation contract，KG OS 不绕过底层一致性约束。

只要目标 Snapshot 中仍存在任一 Knowledge 或 Schema dependency，整个 Object Patch 失败，不产生部分 durable 结果。KG OS v1 不提供 `force`、`cascade`、`preserve_orphan` 等隐式删除模式；但调用方可以在**同一个 Object Patch** 中显式迁移或删除依赖 Knowledge，再删除 Definition / Property，只要这些变化全部明确出现在 Patch 中并且最终目标 Snapshot 合法。这样既保留请求级原子性，也不把数据迁移意图交给 KG OS 猜测。

删除成功时，KG OS 只删除当前新 State 中属于该 Ontology 结构及其 semantic metadata 的内容：

- Definition：删除对应 Lithograph Schema definition、Definition Binding Record、其 Property Binding Records，以及指向该 Definition Binding Record 的 Domain `INCLUDES` 关系；
- Property：删除对应 Lithograph Schema property 与 Property Binding Record；
- 其它不相关 Domain、Definition 与普通 Knowledge 不受影响。

这些删除只改变新产生的 State。历史 State immutable，过去 Snapshot 中的 Definition / Property、Binding Record、Domain membership 与 Knowledge 仍按当时状态正常读取和解释。

## Object

Object 是 KG OS 面向 AI / SDK / Web 的统一**可寻址、可读取、可编辑投影**。Ontology 与 Knowledge 仍然保持各自的数据责任，但不再各自维护一套 CRUD surface；Domain、Definition、Property、Lithograph current Graph Type / standalone Constraint / Index definition，以及 Knowledge Node / Relationship 都通过同一个 Object 模型被定位和维护。

Object 不是新的持久化层。每次读取都从目标 State 的 Lithograph Schema、普通 Knowledge graph 与 KG OS internal semantic graph 动态生成；每次修改都必须回写到底层真实 owner，不能保存第二份 Object JSON 作为真源。

### Object 能力面

```text
Object Capability
│
├── list
├── search
├── read
└── patch
```

这些名称描述逻辑能力，不冻结最终 CLI command、SDK method 或 HTTP route。**Object Patch 的交互模型已经冻结为“canonical YAML + Git Extended Diff textual Patch”**。文本 Patch 语法直接采用普通 two-way `git diff -p` / Git Extended Diff 格式，KG OS 不再定义自己的 section marker、hunk grammar 或 path escaping。

`list` 用于按 Object kind / scope 做轻量枚举与分页，只返回定位和必要摘要，不因为某个 scope 下对象很多就展开所有 Object 内容。`search` 用于不知道准确 Ref 时发现相关 Object；Ontology 的 `name` / `title` / `description` 等语义可以进入这一能力，但它不演化成第二套 Search DSL。海量 Knowledge 的条件发现、关系遍历、全文/向量混合检索等复杂任务继续由 Graph `query` 完成。

### Object Value 与 representation

`read` 接受 State reference + Object Ref，先解析出唯一的逻辑 **Object Value**，再按调用方需要序列化。YAML 与 JSON 只是同一 Object Value 的不同 representation，不是两份对象状态、两套 Schema 或第二持久化真源。

Object Value 的**逻辑内容和 ownership 已由各 owner 章节确认**，serialization contract 不重新设计它们：Domain 使用已确认的 `name / title? / description? / includes`；Definition / Property 聚合 Lithograph Structure 与对应 `title? / description?`；Knowledge Node / Relationship 投影 Lithograph 当前 graph state；current Graph Type / standalone Constraint / Index 直接投影各自 Lithograph Schema resource 的 owner state。本文已经冻结 KG OS 自己拥有的字段、顺序、typed value 与调用合同；唯一仍依赖底层设计的是 `structure` 内部如何无损投影 Lithograph public Schema resource。

v1 已能从当前 owner contract 冻结的 Object Value shape 如下；这些字段描述**可编辑 owner state**，Object Ref、resolved State、Object kind 等定位 metadata 不放进 canonical body：

```text
Domain
  name
  title? / description?
  includes[]                 # Object Ref

Knowledge Node
  labels[]
  properties{}

Knowledge Relationship
  type
  start                      # n:<id>
  end                        # n:<id>
  properties{}

Node / Relationship Definition
  name
  title? / description?
  structure                  # Lithograph public Schema projection
  properties[]               # 按 Property name 排序的完整 child Property projection

Property
  name
  title? / description?
  structure                  # Lithograph public Property Schema projection

Graph Type / Constraint / Index
  structure                  # 对应 Lithograph public Schema resource projection
```

`structure` **不是 KG OS 自建 Schema AST**。它必须由 Lithograph 的公开 Schema introspection contract 无损投影，并可由 KG OS 编译回 Lithograph 公共 Schema mutation；在 Lithograph 尚未冻结相应 canonical public projection 的部分，KG OS 实现被该公开能力阻塞，而不是由 KG OS 先发明另一套结构模型。

`structure` 仍必须服从 owner-only、single-slot 原则，不能把已经由外层字段或 child Object 拥有的状态再复制一遍：Definition 的 `structure` 不重复自身 identifying `name`，也不内联 child Property state；Property 的 `structure` 不重复 Property `name` / `title` / `description`；Graph Type 的 `structure` 只包含 D27 定义的 graph-level owner state，不内联 Definition / Property / Constraint / Index；Constraint / Index 的 `structure` 只包含自身 Lithograph owner state，并以 public locator / Object Ref 引用其它资源而不是复制其可变内容。KG OS renderer / parser 必须把每个可编辑 logical slot 映射到唯一位置；如果 Lithograph introspection 原始结果有嵌套重复，projection 层负责归一化，而不是原样制造第二个 mutation owner。

v1 确认两种公开 serialization：

```text
Object Value
├── application/yaml  → canonical editable representation
└── application/json  → equivalent structured representation
```

- **YAML 是唯一 canonical editable representation。** 同一个 immutable State + 同一个 Object Ref 必须由 KG OS renderer 产生确定、可重放的 canonical YAML；字段顺序、集合排序、缩进、多行字符串、escaping 与特殊 typed value 的 canonical rendering 由 Object serialization contract 冻结；
- **JSON 是同一 Object Value 的等价结构化 representation。** JSON wire 继续复用适用的 Lithograph JSON typed-value encoding，不为 Integer64、Temporal、Point、Vector、UUID 等值再建立第二套类型编码；SDK / Web 可以把 `application/json` payload 解析成语言内 Object / Map，这不构成另一种 wire format；
- KG OS **不定义自己的 YAML 方言或 YAML 子语言**。调用方提交的 YAML 只要能由标准 YAML 1.2 parser 解析，并能无歧义映射为目标 Object 的合法 logical value，就可以进入后续 Object schema / type validation；同义但非 canonical 的 YAML 写法不会因为格式不同而被拒绝。Parser 必须在构造普通 Map/List/String/value tree 前拒绝 duplicate mapping key；anchors / aliases 可以使用，但展开后必须是有限、无循环并可映射到普通 Object Value；unknown/custom tag 只有在能按 KG OS/Lithograph 已知 value encoding 无歧义解释时才合法，否则返回 `INVALID_ARGUMENT`。resource/depth/alias-expansion limit 命中返回 `RESOURCE_ERROR`，而不是由 KG OS 猜测或截断输入；
- canonical YAML 是 Git Extended Diff 的唯一文本 base。JSON 可以作为文本或结构化数据读取，但 v1 Object Patch 不以 JSON serialization 作为 diff base，因此 Patch request 不需要额外携带 `yaml | json` patch-format selector；
- 核心 Object 合同不发明 `representation: {mode, format}` 之类参数。HTTP adapter 使用标准 content negotiation：客户端通过 `Accept: application/yaml` 或 `Accept: application/json` 请求 representation，响应通过对应 `Content-Type` 声明实际媒体类型。CLI / SDK 可以提供 `--format`、`readText`、`readObject` 等便利接口，但它们只是同一 Object Value / serialization contract 的适配，不建立新的数据模型；
- State、Object Ref、请求时使用的 Branch / Tag 等定位上下文仍属于 read result metadata，不是可编辑 Object Value。具体 HTTP header / response envelope、CLI 输出包装和 SDK method shape 仍由 transport contract 冻结。

canonical YAML renderer v1 使用 YAML 1.2 block style，并固定：2-space indentation、LF document newline、文档末尾一个 newline、不输出 anchors / aliases / custom tags、不输出 comment；固定字段按上面各 Object shape 的顺序输出，动态 map key 与 set-like collection 按 UTF-8 byte ascending 排序。固定 schema field name 使用 plain key；调用方数据产生的动态 map key 一律 double-quote。

String rendering 必须无损：

- 不含 `LF` 的 String 一律使用 double-quoted scalar；
- 含 `CR` 或其它需要 escape 的 control character 时，即使同时含 `LF` 也使用 double-quoted scalar；backslash、double quote、BS / FF / LF / CR / TAB 以及其它 control character 按 JSON string escaping 规则确定性转义，避免依赖 YAML emitter 的自由选择；
- 其余包含 `LF` 的 String 使用 literal block，不使用 folded `>`：逻辑值末尾没有 `LF` 时用 `|-`，恰好一个 trailing `LF` 时用 `|`，两个及以上 trailing `LF` 时用 `|+` 并输出对应 trailing blank lines；
- UTF-8 printable Unicode character 保持原字符，不做 normalization 或 ASCII escaping。

其它 scalar / typed value rendering 继续以 Lithograph JSON v1 为类型边界，并固定：`null` 写作 `null`；Boolean 只写 `true / false`；JSON safe-range Integer 使用无前导 `+`、无多余前导零的 base-10 scalar，超出 safe range 继续使用 `$type: Integer` + decimal String；finite Float 使用能 round-trip 回同一 IEEE-754 value 的 shortest decimal，并且 lexical form 必须带小数点或 exponent 以区别 Integer，整数值 Float 例如 `1.0` 不能规范化成 `1`，negative zero 固定保留为 `-0.0`；NaN / ±Infinity 继续使用 Lithograph `$type: Float` tagged form。Temporal、Duration、Point、Vector、UUID 与 reserved-`$type` Map wrapper 都与 Lithograph JSON v1 同构。

因此 canonical renderer 往返解析必须得到逐 code point 相同的 String 和同一 typed scalar value，不允许为了“更好看”增加/移除末尾换行、把 Float 改成 Integer，或丢失特殊值类型。缺省的可选 `title` / `description` 不输出；结构性 collection 即使为空也输出为空 collection。Lithograph typed value 只是在 YAML 中表达同一 tagged map，不创建第二套特殊类型语法。

输入仍遵守 D34：调用方不需要复刻 canonical renderer 的风格，只要标准 YAML 能无歧义解析为同一合法 Object Value 即可；成功写入后再次 `read` 会规范化回 canonical YAML。

### Object 公共调用合同

Object 的逻辑 wire contract 独立于具体 HTTP route、CLI command 或 SDK method；不同 adapter 必须保持下列字段与语义，不得因为 transport 不同产生第二套行为。

共同类型：

```text
ObjectKind =
  domain | node-definition | relationship-definition | property |
  graph-type | constraint | index | knowledge-node | knowledge-relationship

ObjectSummary = {
  kind,
  ref,
  name?,
  title?
}

Page<T> = {
  state,          # 本次读取 pin 的 ResolvedState
  items: T[],
  cursor: string? # null 表示结束
}
```

这里使用的 `StateRef / ResolvedState` 直接引用 Evolution [State reference](#state-reference) 的唯一 canonical grammar；Object 不维护第二份版本引用定义。

所有 pageable read 的 `limit` 省略时为 `100`，v1 接受 `1..1000`；`cursor` 是 opaque continuation，只能与产生它时相同的 resolved State、operation 和 filters 一起继续使用。调用方不能解析或修改 cursor；不匹配时返回 `INVALID_ARGUMENT`。

`list`：

```text
request  = { at: StateRef, kind?, scope?: all|ontology|knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

结果按 `kind`、canonical Object Ref 的 UTF-8 bytes 升序稳定排序。`scope=ontology` 覆盖 Domain / Definition / Property / Graph Type / Constraint / Index；`scope=knowledge` 覆盖 Knowledge Node / Relationship；省略 scope 等价 `all`。`kind` 与 scope 冲突时返回 `INVALID_ARGUMENT`。

`search`：

```text
request  = { at: StateRef, query: string, kind?, scope?: all|ontology|knowledge, limit?, cursor? }
response = Page<ObjectSummary>
```

它只是 Object discovery，不建立 correctness-sensitive Search DSL。`query` 必须是非空 String；v1 不做 relevance ranking：

- canonical Object Ref 与 query 完全相等时命中；
- Domain / Definition / Property 的 identifying name、`title`、`description`，以及 Graph Type / Constraint / Index 的公开 resource name / locator，对 query 做 Unicode default case-fold 后的 substring match；不做 Unicode normalization；
- Knowledge Node / Relationship 除 canonical Object Ref exact match 外不承诺属性文本搜索，属性全文、向量、关系与条件 discovery 继续使用 Graph Cypher。

匹配后的结果仍按 `kind`、canonical Object Ref UTF-8 bytes 升序分页，因此没有 score/ranking cursor。搜索算法未来可以增加新的 discovery surface，但不能让已经定义的 exact Ref / name / title / description match 消失或改变同一 API 的排序语义。

`read`：

```text
request = { at: StateRef, ref: ObjectRef }

result metadata = {
  state: ResolvedState,
  kind: ObjectKind,
  ref: ObjectRef
}

result body = canonical YAML | equivalent JSON Object Value
```

representation 仍通过 adapter 的标准 content negotiation / format selection 决定，不加入业务 request field。canonical body 只包含 Object Value；metadata 必须由 adapter 的 metadata channel 与 body 分离，不能为了返回 `state/ref/kind` 把它们混入可编辑 YAML。SDK 可以把两者组合成一个语言内 result object，但 Patch base 始终只取 canonical YAML body。

`patch`：

```text
request = {
  baseState: ResolvedState,
  branch: string,
  patch: string,       # Git Extended Diff over canonical YAML
  author?: string,
  message?: string
}

response = {
  state: ResolvedState,
  created: [ { alias, kind, ref } ... ],
  transitions: [ { from, to } ... ]
}
```

`baseState` 只接受 immutable `commit/<id>`，不能传 Branch / Tag；`branch` 使用 Lithograph Branch name validation。Patch 中已有 Object target 直接使用 canonical Object Ref；新增 Object target 固定为 `new:<kind>:<alias-component>`，其中 `<kind>` 使用上述 ObjectKind，alias component 使用与 Object Ref 相同的 RFC 3986 component encoding。alias 只在本请求内存在。成功无 effective delta 时 `state == baseState` 且不创建 Commit。

`author/message` 直接映射为本次操作**实际新建 Commit**的 Lithograph immutable metadata，KG OS 不解释其业务语义。Object Patch 无 effective delta 时没有新 Commit，因此即使 request 带 `author/message` 也不为保存 metadata 单独创建 State；需要显式 empty-delta State 时使用 `state.create`。

同一个 `new:<kind>:<alias-component>` 也用于 patched YAML 中所有“本应填写 Object Ref、但引用本请求新对象”的位置；例如新 Relationship 的 `start/end` 可以引用 `new:knowledge-node:alice`，Domain `includes` 可以引用新 Definition alias。alias decode 后必须是 1..255 UTF-8 bytes，禁止 NUL 与 ASCII control characters；同一 Patch 内 `(kind, alias)` 唯一。alias 永不出现在成功后的 canonical Object Value，执行成功后必须通过 `created` 返回最终 Ref。

`created.alias` 返回 decode 后的逻辑 alias String，不返回 percent-encoded target component；`created` 按 `kind` + alias UTF-8 bytes 升序，`transitions` 按 `from` Object Ref UTF-8 bytes 升序。Patch entry 原始文本顺序不影响 result ordering。

因此 `n:123` / `r:456` 等系统分配 identity 不会因为 AI 修改 YAML 而被重新赋值。Definition / Domain / Property 的 identifying name 属于业务结构本身，可以出现在 canonical YAML / JSON Object Value 中；修改这些名称表示 rename，并按 Ref transition 语义处理。

Object Value / canonical YAML 遵守 **owner-only projection**：只包含当前 Object 自己拥有的可编辑状态，以及指向其它 Object 的 Ref；不能为了“更易理解”把其它独立 Object 的可变内容复制进当前 representation。例如 Knowledge Node 可以包含自己的 Labels / Properties，但不能内联这些 Label 对应 Definition 的 `title` / `description`；Relationship 可以保存 endpoint Ref，但不能内联 endpoint Node 内容；Domain 保存 `includes` Ref，不复制成员 Definition。需要额外语义时由 AI 继续 `read` 对应 Ref。唯一明确的重叠投影是 Definition → Property parent/child 关系，并受 D21 overlap rule 约束。

同一原则适用于 Lithograph Schema aggregation：Current Graph Type Object 只投影不能由 child Definition / Property / Constraint / Index Object 独立拥有的 graph-level state；如果为了理解需要展示其 element definitions，只返回 child Object Ref / summary，不复制可编辑 Definition 内容，也不允许通过 Graph Type Patch 间接 add/update/delete Definition。Definition lifecycle 继续由 Definition Object 管理；KG OS compiler 在需要调用 whole-Graph-Type 底层操作时从同一 target Object set 重新合成完整 Lithograph Schema，而不是把底层整体结构原样暴露成第二个公共 mutation target。

Constraint ownership 同样按 Lithograph 真实 Schema model 切分：属于 Graph Type / element definition 本身的 property type、key、existence / `NOT NULL` 等内生结构继续由 Definition / Property Object 表达；Lithograph 明确建模为 **standalone constraint definition** 的资源只由 Constraint Object 拥有。Definition 为理解需要展示相关 standalone Constraint / Index 时只能返回 Ref / summary，不能复制成第二份可编辑定义。Index definition 统一由 Index Object 拥有。

Owner-only 不禁止**引用目标自身 rename 引起的派生 Ref rewrite**。如果 Constraint / Index / Domain 等 Object 保存了对 `node:Person` 或某 Property 的逻辑引用，而该被引用 Object 在同一 Patch 中 rename，KG OS 可以自动把这些 locator 重写为目标 Snapshot 的新 Ref，以保持原有引用关系；这类 rewrite 只能改变 locator，不得顺带修改 Constraint / Index 的其它配置或 Domain membership 语义。调用方若在同一 Patch 中还显式修改该 Constraint / Index，其显式变化与派生 locator rewrite 必须在 logical-slot normalization 后不冲突，否则整体 reject。

`patch` 是明确 Object 的统一 mutation 模型。调用方不是提交 JSON Patch、JSON Merge Patch 或 `op/path/value` mutation DSL，而是以 Object `read` 的 canonical YAML 为 base，提交**文件式文本 Patch**。Patch 可以覆盖：

```text
Add
Update
Delete
Rename
Restructure
```

Object Patch v1 的 textual syntax 固定采用普通 two-way **Git Extended Diff**，即 `git diff -p` 生成的 patch text 形态；Git `diff-format` 是语法参考，但 KG OS v1 只承诺本文明确列出的可应用 profile，未来 Git 增加的新格式不会自动进入 KG OS 合同：

- 每个 Object target 映射为一个标准 `diff --git a/<target> b/<target>` file entry；这里的 `<target>` 是 Object transport contract 序列化后的 owner-backed Object Ref，或新增 Object 的 request-local alias + object kind target。`a/` / `b/` 是 Git patch 的语法前缀，不是 KG OS 虚拟目录、Object Ref 的组成部分或持久 identity；
- Update / Restructure 使用标准 `---` / `+++` 与 unified `@@ ... @@` hunks；Add 使用标准 `new file mode 100644`、`--- /dev/null`、`+++ b/<target>`；Delete 使用标准 `deleted file mode 100644`、`--- a/<target>`、`+++ /dev/null`；
- Rename 使用标准 `diff --git a/<old-target> b/<new-target>` 与 `rename from` / `rename to` extended headers，可以同时包含 unified hunks。`<old-target>` 定位 `baseState` 中已有 Object；`<new-target>` 只表达 rename 后的目标 locator，不改变 D23“Patch 内其它已有对象引用仍按 baseState Ref 解析”的规则；
- 一个多 Object Patch 直接由多个标准 `diff --git` file entry 组成，不增加 KG OS 自有 Patch wrapper 或 section delimiter；
- Object target 字符串放入 Git path slot 后，特殊字符的 quoting / escaping 服从 Git patch 的 pathname quoting 规则；KG OS 不再定义第二套 Patch path escaping。已有对象 target 使用上面 canonical Object Ref；新增对象使用 `new:<kind>:<alias-component>`；
- 标准 `similarity index` / `dissimilarity index` / `index <hash>..<hash>` 等 Git metadata 如果出现，只是 Patch framing / advisory metadata，不是 KG OS identity、concurrency guard 或业务状态；`baseState` + target Branch 才是 Object Patch 的权威并发基线；
- v1 不接受 Git combined diff、copy semantics、binary patch、symlink / submodule、mode-only mutation 或其它没有 Object mutation 语义的 Git patch 形式。Add / Delete 使用的 `100644` 只作为 canonical YAML regular-file framing，不产生权限或文件模式业务状态；
- KG OS 采用的是成熟 Git patch **文本语法**，不是 Git filesystem / index / blob 模型。Patch parser/application 必须把 file target 映射到 Object Ref，或新增对象的 alias + object kind，再按本文 strict base-State、exact apply、owner-only、overlap、dependency、derived migration 与 all-or-nothing 规则执行；不得直接把 `git apply` 的文件系统行为当成 KG OS mutation semantics。

这五类描述的是统一 Patch 能表达的**变化类别**，不是给所有 Object kind 强行增加相同生命周期。每个 Object 的合法 target change 仍由其真实 owner contract 决定：例如系统分配 Knowledge element identity 不能 rename；current Graph Type 的存在 / 生命周期服从 Lithograph Graph Type 语义；Constraint / Index 是否支持原生 rename 或只能 drop + create 以 Lithograph 公开 Cypher contract 为准。KG OS 可以为已明确设计的 Definition / Property / Domain rename 提供上层语义，但不能仅因为 Patch 有 `Rename` 类别就给其它底层资源发明新数据库语义。

对于公共 Ref 由自身 identifying name 决定的顶层 Object（当前包括 Domain、Definition、独立寻址的 Property Object，以及未来 owner contract 明确支持 rename 的其它 name-backed Object），**修改自身 identifying name 必须使用 Git Rename entry**；普通 Update / Restructure entry 不能只在 YAML 中把顶层 `name` 改成另一个值。Rename header 的 `<old-target> → <new-target>` 是该顶层 rename 的显式 locator delta；如果同一个 entry 的 YAML hunk 也修改 `name`，其目标必须与 `<new-target>` 解码出的 identifying name 完全一致，否则返回 `OBJECT_CONFLICT`。如果 YAML hunk 没有触碰 `name`，compiler 以 Rename header 派生目标 Object Value 的新 identifying name。Definition 内嵌 child Property 的 rename 仍是该 Definition entry 内的 child logical-slot change，不要求把 parent file entry 本身 rename。

一个 Object Patch 可以同时包含一个或多个 Git patch file entry。已有对象的 entry 通过 old/current target 解码出的 canonical Object Ref 定位；新增对象尚无最终 Object Ref，使用已经冻结的 `new:<kind>:<alias-component>` 定位该 entry。不得再创建 KG OS 自有 Patch section header、escaping grammar，也不得在后续 adapter 设计中替换成另一套 JSON mutation language。

Object projection 允许为读取便利包含 child Object 内容，但一个 Patch 内的 target change 必须可归一化为**不重叠的底层 logical slots**。例如 Definition entry 可以直接修改 `Person.email`，Property entry 也可以单独修改同一个 Property；二者不能在同一 Patch 同时触碰该 Property。KG OS 在执行顺序之前先检测这种 overlap，存在重叠即整体拒绝，避免同一个目标因 entry 顺序产生不同结果。

因为 Object Patch 严格基于 `baseState`，**Patch 中对任何已经存在 Object 的引用都按 baseState Object Ref 解析**。如果同一 Patch 把 `node:Person` rename 为新的 Ref，其他 entry 要继续引用“同一个 Definition”时仍使用 base Ref `node:Person`；KG OS 通过本次 rename continuity 把该逻辑引用带到目标 Snapshot。调用方不能依赖尚未产生的 target Ref 在同一 Patch 中重新定位该已有对象。只有本次新建、在 baseState 中不存在的 Object 使用 request-local alias。成功后新的 Ref 只通过 alias mapping / Ref transition 返回。这样多 Object Patch 的引用解析完全由 `baseState + Ref | alias` 决定，不依赖 entry 顺序或对未来 Ref 的猜测。

Object Patch 以调用方实际读取的 immutable `baseState` 为 patch base、以明确 Branch 为 write target。**v1 使用 strict base-State 语义：执行开始时 target Branch 的当前 head 必须仍等于 `baseState`；如果 Branch 已前进，则整个 Patch 以 `STALE_BASE_STATE` 失败，不把基于旧文本生成的 Patch 自动套用到新 State，也不自动 rebase / merge。** 执行期间 Lithograph branch-head compare 再发现并发移动时同样映射为 `STALE_BASE_STATE`。

在 base State 校验通过后，KG OS 重新生成对应 Object canonical YAML，精确应用 textual Patch 得到目标 YAML，使用标准 YAML parser 解析为 target Object Value / target Object set，再执行 Object schema / type、Ontology / Knowledge dependency、Schema、Graph View 与其它公开规则校验，最后编排 Lithograph。请求默认 all-or-nothing；任一变化失败都不能留下部分 durable 结果。

对于 Update / Rename / Restructure，KG OS 不把“应用 Patch 后得到的一整份 YAML”当成 `PUT` 语义，而是比较 base Object Value 与 patched YAML 解析得到的 Object Value，只把调用方**显式改变的 logical slots**作为 target delta；Rename entry 的 old/new target 额外贡献该 Object identifying locator 的显式 rename delta。未被 textual Patch 改动的字段只是 context，不会阻止同一请求为了 rename、referential integrity 或 consistency 产生必要的 derived migration。例如 Relationship Definition rename 与某条 Relationship 的 Property update 可以同时存在：该 Relationship entry 没有编辑的旧 type 字段不会覆盖 mandatory type migration。反过来，如果调用方显式修改的 slot 与 mandatory derived change 要写同一 slot 且目标不同，则整个 Object Patch 冲突失败，不按 entry 顺序覆盖。

Textual Patch application 使用**精确 base**，不使用普通文件工具可能提供的 fuzzy hunk matching、自动 offset 猜测或“尽量应用”。Update / Delete / Rename entry 的 Object Ref 必须在 `baseState` 中存在，不存在返回 `OBJECT_NOT_FOUND`；Add 不具有 upsert 语义，planned target 中若最终形成重复 Object Ref / identifying name 则返回 `OBJECT_CONFLICT`。删除一个在 base State 中不存在的 Object 也不是成功 no-op。调用方要修改已有对象必须显式使用其原 Ref，要创建对象必须显式 Add。

KG OS 在编译前计算 Object Patch 的**有效 target delta**。如果所有 entry 归一化后都没有改变 Ontology / Knowledge Snapshot，则 Object Patch 不调用底层 mutation、不创建新的 State，并返回 `baseState` 作为最终 State；需要“Snapshot 内容不变但显式产生一个新业务 State”时只能使用 Evolution `state.create`。Graph `execute` 仍遵守 Lithograph writable Cypher 自己的 Commit 语义，不由这条 Object Patch 规则改写。

Patch 表达的是**目标 Object 要变成什么**，不是要求底层必须原地修改。调用方不能直接给系统分配的 identity 重新赋值，例如不能把 `n:123` 改写成 `n:999`；但 Label、Property、Relationship Type、Relationship endpoint、Definition identifying name、Domain organization 等业务结构都可以成为目标变化。若 Lithograph 可以保持底层 identity，成功结果继续返回原 Ref；若某项变化只能通过 replacement / migration 实现，例如当前 Lithograph 合同下 Relationship Type / endpoint 变化需要删除旧 Relationship 并创建新 Relationship，KG OS 可以这样编排，并在本次结果中返回旧 Ref → 新 Ref transition。这个 transition 是 mutation result，不创建持久的第二套 Knowledge identity / alias。

Knowledge Object 删除同样遵守“无隐式数据损失”：删除 Relationship 只删除该 Relationship；删除仍有 incident Relationship 的 Node 时，Object Patch 必须 reject，除非同一个 Patch 已显式删除或重构这些 Relationship。Object Patch 不把 `Delete n:<id>` 静默解释为 `DETACH DELETE`。如果调用方确实需要条件级 / 集合级 detach 行为，可以通过 Graph `execute` 明确写出 Lithograph / Cypher 对应 mutation。

新增 Object 在执行前可能还没有最终 owner-backed Object Ref。一个 Patch 内可以使用 request-local temporary alias 串联本次新建对象；在同一 Patch 中，任何本应填写 Object Ref 的目标位置都可以引用此前或同时声明的新 Object alias，例如新 Relationship 的 endpoint 可以引用本次新建 Node。alias resolution 必须基于整个 Patch 的声明图完成，不能依赖 entry 文本顺序；不存在、重复 `(kind, alias)` 或形成无法解析的 alias reference 时整个 Patch 失败。alias 只存在于请求内部，成功后必须映射到 Lithograph / Schema / Domain 实际产生的 Object Ref，不成为第二套持久身份。

KG OS 的 Object Patch 不是 raw Lithograph Patch。实现只在 Lithograph 公共合同允许构造合法 canonical Patch 且目标变化可以完整映射时使用 `patch.apply`；否则只能使用最少的公开 Cypher / Schema operation 并由 caller-owned SQLite transaction 组合。**caller-owned SQLite transaction 只保证这些 query 的持久化 all-or-nothing，不会把每个 mutating query 已产生的 Lithograph Commit 链折叠成一个 Commit。** 因此 fallback 产生的每一个最终可见 Lithograph Commit 都必须仍是可被 KG OS 正常读取的合法 State；如果某个 target change（典型如新 Definition / Property 需要 Schema element 与 Binding Record 同时出现）必须跨多个 owner 修改，而任何顺序都会产生 missing/dangling Binding 的 intermediate Commit，则现有多-query fallback 不合法，必须等待 Lithograph 提供能在**一个 Commit**中表达该 mixed Snapshot change 的公开能力。任何路径都不能直接修改 `_lithograph_*`，也不能引入 KG OS 自己的 transaction / version 真源。

Object `list` / `search` / `read` 使用统一 State reference semantics。Branch / Tag 在读取开始时解析并 pin 到 immutable State，并返回 resolved State identity。Object `patch` 不接受模糊的“当前最新版本”作为文本 base：调用方必须提供明确 immutable `baseState` 与目标 Branch。成功写入返回本文 `patch` response 中的最终 State、`created` 与 `transitions`。对调用方**直接寻址并修改**后发生 identity replacement / rename 的 Object，结果必须返回旧 Ref → 新 Ref transition。Definition-level Relationship Type rename 可能派生出大量 Relationship replacement；这类 derived replacement 不承诺永久的一对一 Ref transition mapping，旧 Relationship Ref 在新 State 中失效，调用方通过 Graph 在新 State 中重新发现 Relationship，新旧集合变化通过 Evolution diff/history 审计。

### Object 能力边界

- 不建立虚拟文件系统或把“目录路径”作为第二套 Object identity；稳定文本与 Git Extended Diff Patch 只是 AI 交互方式；
- 不建立 Definition / Domain / Property / Node / Relationship 各自完整 CRUD surface；
- 不为 Graph Type / Constraint / Index 再建立平行 Schema API；它们作为 Lithograph-owned Schema Object projection 进入同一个 Object surface，且不获得 KG OS semantic Binding Record，除非未来出现真实业务语义需求再单独设计；
- Object 统一的是 **State Snapshot 内 Ontology / Knowledge 对象**的定位与维护；State Data、Branch、Tag、Merge 等版本 sidecar / ref 不是 Snapshot Object，由 Evolution 负责，不为它们再套一层 Object identity；
- 不暴露 `OntologyElement`、Binding Record、Schema Locator、reserved internal graph element / Schema resource 等实现资源；
- 不允许通过 Object 能力绕过 Knowledge / internal semantic graph 的 `graphView` 隔离；
- 不把 Object `search` 扩展成 Graph traversal、全文、向量、聚合和复杂过滤语言；这些能力继续属于 Graph / Lithograph；
- 不把 Lithograph raw Patch 直接提升为 KG OS Object wire contract，公共 Patch 始终使用业务 Object / Object Ref 表达。

## Evolution

Evolution 是 KG OS 对 **Knowledge Base 状态演进**的公共能力域。它不创建第二套版本系统，而是把 Lithograph 的 immutable Commit DAG、Branch、Tag 与 Commit Data 映射成适合知识世界的 State、演进路径、状态标签和状态注释。

### State：Knowledge Base 的不可变状态

一个 KG OS State 与一个 Lithograph Commit 一一对应，并直接复用其底层 Commit identity；KG OS 不创建 `stateId` 到 Commit ID 的第二套持久化映射。公共 wire 按 D35 直接使用 Lithograph `commit/<64-lowercase-hex>` 作为 resolved State identity。

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

State Data 保留 Lithograph Commit Data 的“absence 与 JSON `null` 不同”语义：没有 sidecar 时 `hasData=false` 且 `data=null`；显式执行 `set data null` 后 `hasData=true` 且 `data=null`。`set data` 接受任意合法 JSON value，包括 `null`；`clear data` 才表示移除 sidecar。

KG OS 不为 State Data 再定义第二套业务 schema 或任意固定 byte 上限；JSON 合法性、底层可接受资源大小与失败类别直接服从 Lithograph Commit Data / `RESOURCE_ERROR` 公共合同。adapter 可以设置请求体级 transport limit，但不能把它解释成 State Data 的持久化语义上限。

因此 State detail 可以在读取时聚合 immutable State metadata 与当前 State Data，但响应必须保持字段边界，不能让 State Data 看起来像创建 Commit 时冻结的 Snapshot 内容。Branch / Tag 的枚举由独立能力负责；State `get` 不要求为了附带所有反向 refs 而扫描整个 ref 集合。

### Branch 与 Tag

KG OS 使用 Lithograph Branch 表达**可以继续演进的命名路径**，使用 Lithograph Tag 表达**显式命名的 State 引用**：

```text
Branch
→ 会随该 Branch 上成功的 Object Patch / Graph Execute 向新 State 前进

Tag
→ 指向某个 State
→ 不随普通 write 自动移动
→ 只有显式 move 才改变目标
```

KG OS 不把 Lithograph connection-local `checkout` 提升为公共 Evolution 能力。AI / SDK 读取必须显式传递 State / Branch / Tag reference，写入必须显式指定目标 Branch，避免依赖隐藏的 connection state。底层实现可以按 Lithograph 合同管理 connection，但该状态不能成为 KG OS 公共请求语义的一部分。

### State reference

Object / Graph Read 共享同一套 State 引用语义：调用方可以直接引用确定 State，也可以通过 Branch / Tag 引用；KG OS 在 operation 开始时解析到 immutable State，并在整个 operation 中保持 pinned Snapshot。所有 read response 应返回最终 resolved State identity，使 Branch / Tag 后续移动不会改变已经返回数据的解释。这里的 State / Branch / Tag reference 类似 Git ref resolution，不建立独立 `State Context` 对象。

v1 wire 直接复用 Lithograph Version Descriptor，不建立第二套字符串：

```text
StateRef      = commit/<64-lowercase-hex> | branch/<name> | tag/<name>
ResolvedState = commit/<64-lowercase-hex>
```

Branch / Tag name validation 与 Lithograph 完全一致；KG OS 不做大小写折叠、路径重写或别名。任何接受 StateRef 的 read 都在开始时解析并 pin，返回值中的 `state` 永远使用 ResolvedState，而不是把调用方传入的 Branch / Tag 原样当成已解析 State。

Object Patch / Graph Execute 必须明确目标 Branch。普通写入继续由 Lithograph 自动产生 Commit，KG OS 不要求调用方执行“修改后再手工 commit”的两步流程。KG OS 应优先把一次 Object Patch 编译为 Lithograph 可原子应用的单 Commit change；确实需要多步公开操作时由 caller-owned SQLite transaction 保证请求级 all-or-nothing。成功响应必须返回**最终 State identity**；调用方无需依赖内部 Commit 数量来继续工作。

### Evolution 能力面

KG OS 当前只提升对知识世界有直接产品意义的版本能力，不镜像 Lithograph 的全部 Version Procedure：

```text
Evolution Capability
│
├── Read
│   ├── overview
│   ├── get
│   ├── ancestry
│   ├── history
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

### Evolution 公共调用合同

Evolution wire 同样使用 transport-neutral logical shape；State Data 原样是 JSON value，不引入 KG OS 业务 schema。

公共结果类型：

```text
StateSummary = {
  state: ResolvedState,
  parents: ResolvedState[],
  author: string?,
  message: string?,
  committedAt               # UTC Unix epoch microseconds
}

Change = {
  change: add | update | delete | rename | restructure,
  kind: ObjectKind,
  path: string,          # RFC 6901 JSON Pointer over logical Object Value; "" = whole Object
  beforeRef?: ObjectRef,
  afterRef?: ObjectRef,
  before?,
  after?
}

HistoryEntry = {
  state: ResolvedState,
  parents: ResolvedState[],
  change: Change?        # explicit empty-delta State 在 all-scope history 中为 null
}

MergeConflict = {
  conflictId: string,
  kind: ObjectKind,
  path: string,          # 与 Change.path 相同的 public logical slot
  baseRef?: ObjectRef,
  oursRef?: ObjectRef,
  theirsRef?: ObjectRef,
  base?,
  ours?,
  theirs?
}

MergeResolution = {
  conflictId: string,
  choice: ours | theirs | value,
  value?                 # choice=value 时必填
}
```

`Change.path` 只用于解释 Diff / History 的逻辑位置，不是 mutation API；Object Patch 仍只接受 Git Extended Diff。`before/after` 使用对应 public Object Value / Lithograph typed value 的 JSON-compatible representation，不返回 internal slot。Add 只有 `afterRef`，Delete 只有 `beforeRef`，Update / Restructure 对 identity 未变化的 Object 令 `beforeRef == afterRef`。只有 owner 已有 continuity evidence 能证明 rename 前后仍是同一个 Object 时，Rename Change 才同时给出不同的 `beforeRef/afterRef`，例如 Definition / Property / Domain 的 Binding / Domain identity continuity。Knowledge Relationship 因 type / endpoint change 发生 replacement 时，D20 明确不持久化 old→new continuity，因此 Evolution Diff / History 必须表现为独立 Delete + Add；当次 Object Patch response 的 `transitions` 不能被 History 事后用来拼接生命周期。Definition-level 派生的大量 Relationship replacement 同样表现为可分页的 Delete/Add change。

`history.items` 的分页单位是 **一个 State 中的一条 public Change**；同一个 State 有多条变化时可以出现多个相同 `state/parents` 的 HistoryEntry。显式 empty-delta State 在 `scope=all` 时仍返回一个 `change=null` entry，使业务 State 的存在不会因为 Snapshot diff 为空而从 History 消失。

`committedAt` 直接复用 Lithograph Commit metadata 的 UTC Unix epoch microseconds，不再转换成另一套时间字符串；它是 immutable Commit metadata，不等同于业务时间字段。

```text
overview()
→ { defaultBranch: string, state: ResolvedState }

get({ state: StateRef })
→ {
    state: ResolvedState,
    parents: ResolvedState[],
    author: string?,
    message: string?,
    committedAt,
    consistency: {
      status: valid | invalid,
      issues: [ { code, message } ... ]
    },
    hasData: boolean,
    data
  }

ancestry({ root: StateRef, limit?, cursor? })
→ { root: ResolvedState, items: StateSummary[], cursor? }

history({ root: StateRef, scope: all|ontology|knowledge|object,
          object?: { anchorState: StateRef, ref: ObjectRef }, limit?, cursor? })
→ { root: ResolvedState, items: HistoryEntry[], cursor? }

diff({ before: StateRef, after: StateRef,
       scope: all|ontology|knowledge|object,
       object?: { anchorState: StateRef, ref: ObjectRef }, limit?, cursor? })
→ { before: ResolvedState, after: ResolvedState, items: Change[], cursor? }
```

`scope=object` 时必须提供 `object`，其它 scope 不接受 `object`。`anchorState` 在 operation 开始时解析并 pin 为 immutable anchor；它只负责证明 Object continuity，不替代 `root`、`before` 或 `after` 的 traversal/diff 范围。History 中 resolved `anchorState` 必须位于 resolved `root` 的 ancestry 内；Diff 中 resolved `anchorState` 必须等于 resolved `before` 或 `after`，否则返回 `INVALID_ARGUMENT`。History / Diff 内部变化按 public Object / Knowledge semantics 聚合，不暴露 Binding Record、Schema Locator、reserved identifiers 或 raw Lithograph Patch slot。

`get.consistency` 是 invalid State 的诊断入口。`status=valid` 时 `issues=[]`；`status=invalid` 时至少以公开 issue code 区分 `BINDING_MISSING`、`BINDING_DUPLICATE`、`BINDING_DANGLING`、`BINDING_KIND_MISMATCH` 与 `RESERVED_SCHEMA_INVALID`，`message` 只描述公开 Object / Schema kind，不泄露 internal element identity 或 `_lithograph_*`。其它 Evolution topology read 不要求为每个历史 State 执行完整 consistency scan；调用方需要诊断某个 State 时使用 `get`。

`ancestry` / `history` / `diff` 的 `limit` 与 cursor 使用和 Object pagination 相同的基础规则：省略 limit 为 `100`，v1 接受 `1..1000`，cursor opaque 且绑定 operation、resolved root/before/after、scope/filter；输入不匹配返回 `INVALID_ARGUMENT`。

`ancestry` 的 State 顺序直接复用 Lithograph `log` 的 deterministic DAG order：reverse-topological；同一 topology level 先按 `committedAt` descending，再按 Commit ID ascending。`history` 使用同一 State order，同一 State 内多条 `Change` 按 `kind`、`beforeRef ?? afterRef`、`path`、`change` 的 UTF-8 bytes 升序。`diff` 不存在 State traversal order，直接按同一 canonical Change key 升序。cursor 保存 pinned traversal / change frontier，不受 Branch / Tag 后续移动影响。

`ancestry` 可以穿过 invalid / pre-KGOS Commit，因为它只暴露 topology / lightweight metadata；`history` 与 `diff` 不解释 invalid Snapshot。`history.root` 必须是 KG OS-valid State，并且向 ancestry 回溯时在第一个 invalid / pre-KGOS parent 处终止业务 history，不跨该边界猜 continuity；第一个 KG OS-valid bootstrap State 可以作为 history genesis，以 `change=null` 表示 public Snapshot 没有可解释的前置 KG OS State。`diff.before/after` 与 object `anchorState` 都必须是 KG OS-valid State，否则返回 `CONSISTENCY_ERROR`。

State / ref mutation：

```text
state.create({ branch, data?, author?, message? })
→ { state: ResolvedState }

state.setData({ state: StateRef, data })
→ { state: ResolvedState, data }

state.clearData({ state: StateRef })
→ { state: ResolvedState }

branch.list()
→ { items: [ { name, state } ... ] }

branch.create({ name, from: StateRef })
→ { name, state }

branch.delete({ name })
→ { name, previousState }

tag.list()
→ { items: [ { name, state } ... ] }

tag.create({ name, target: StateRef })
→ { name, state }

tag.move({ name, target: StateRef })
→ { name, previousState, state }

tag.delete({ name })
→ { name, previousState }

merge({
  branch,
  source: StateRef,
  expectedTarget?: ResolvedState,
  resolutions?: MergeResolution[],
  author?,
  message?
})
→ {
  status,
  targetState: ResolvedState,
  sourceState: ResolvedState,
  state?: ResolvedState,
  conflicts: MergeConflict[]
}
```

KG OS 没有 connection-local active Branch，因此 `branch.create.from` 必须显式提供，不继承 Lithograph connection checkout。`branch.list` / `tag.list` v1 沿用当前设计的完整有界 ref enumeration，并按 ref name UTF-8 bytes 升序；不为了尚未验证的大 ref 集合提前增加 cursor，如果实际规模或底层接口证明需要分页，再以兼容扩展增加。

D31 对 invalid State 的限制只阻止业务 Snapshot 继续演进或把新 ref 指向 invalid target：`state.create` 的 Branch head、`branch.create.from`、`tag.create/move.target` 与 `merge` source/target 都必须解析到 KG OS-valid State。`state.setData/clearData` 只修改 Commit Data sidecar，因此允许作用于 invalid State，便于诊断注释；`branch.delete` / `tag.delete` 只移除 ref，也允许清理当前指向 invalid State 的引用。这些 sidecar/ref cleanup 不把 invalid Snapshot 重新解释为业务 State。

`merge.status` 固定为 `up_to_date | fast_forward | merged | conflict`。`conflict` 是正常结构化结果，不依赖 error channel。每次调用开始时 target Branch head pin 为 `targetState`，`source` pin 为 `sourceState`；成功的 `up_to_date / fast_forward / merged` 返回最终 `state`，`conflict` 不创建 State、`state` 省略且 Branch 不移动。

`merge.author/message` 只有 `status=merged` 真正创建新 Merge Commit 时写入该 Commit；`up_to_date` 与 `fast_forward` 都不为了保存 metadata 创建额外 Commit。`state.create` 总会创建新 Commit，因此它的 `author/message` 总能落到新 State；Graph `execute` 继续服从 Lithograph writable query 自身的 Commit/no-op metadata 语义。

Conflict result 只暴露可映射到公共 Object / Graph 的 conflict；`path` 使用 public logical Object Value 的 RFC 6901 slot，`base/ours/theirs` 与对应 Ref 都是 public representation。`conflictId` 对同一 `(merge-base, targetState, sourceState, public slot)` 必须确定性稳定，但不是持久资源 identity。

第一次尝试没有 resolution 时可以省略 `expectedTarget`；如果返回 `status=conflict`，调用方重试并提交 `resolutions` 时**必须**把上次返回的 `targetState` 作为 `expectedTarget`，并应使用已 resolved 的 `sourceState` 作为 source。执行开始时 target Branch head 与 `expectedTarget` 不一致则返回 `BRANCH_HEAD_MOVED`，旧 conflictId / resolution 不会自动套到新 head。`resolutions` 的 conflictId 必须恰好来自当前重新计算出的 conflict set；unknown / duplicate conflictId 返回 `INVALID_ARGUMENT`。`choice=value` 的显式 value 使用该 public target slot 自身的 value encoding；无法安全映射为 public target 的底层冲突返回 `CONSISTENCY_ERROR`，不泄露 internal graph / schema identifiers。

`overview` 只返回适合导航的轻量摘要，例如 default Branch 及其 resolved head，并且不得扫描或展开完整 State DAG。Branch / Tag 的完整枚举分别通过 `branch.list` / `tag.list` 完成；当前没有真实需求要求为了假设中的超大 ref 集合提前冻结另一套分页机制，后续如底层能力和规模约束需要再加入。

`get` 读取一个 resolved State 的 immutable metadata 与当前 State Data。它不自动加载该 Snapshot 的全部 Ontology / Knowledge，也不默认反向枚举所有指向它的 Branch / Tag；真正的数据内容继续通过 Object / Graph 使用同一个 resolved State 读取。

`ancestry` 从调用方指定的 State / Branch / Tag root 开始读取该 root **可达的 State ancestry DAG**，每次只返回 bounded slice，并通过 opaque cursor 渐进遍历。它返回轻量 State topology / metadata，默认不展开 State Data，更不加载每个 State 的 Knowledge Snapshot。State 数量很大时不提供“一次返回整个 DAG”的合同；不同 Branch 的独立演进空间通过选择对应 root 分别导航，不为“全库一次聚合所有 roots”增加第二套历史索引。这里刻意不使用 `graph` 作为能力名，避免与顶层 Graph / Cypher 能力混淆。

`history` 返回统一 State DAG 上与调用方 scope / Object address 相关的业务变化序列；`diff` 比较两个 immutable State Snapshot。两者都把底层历史业务化为公开 Object / Knowledge graph 变化，并过滤 KG OS internal Binding Record、reserved Label / Relationship、Schema Locator 等实现细节；mutable State Data、Branch 与 Tag 不进入 Snapshot diff。

Object-specific History / Diff **不能只用裸 Object Ref 作为跨版本 continuity anchor**。任何基于名称 / locator 的 Ref 都可能在旧对象删除后被新的资源重新使用；因此对象级历史定位使用上述 `object.anchorState + object.ref`。KG OS 在 anchor State 内先解析该 Object，再只使用 owner 已有的稳定 continuity evidence 跟踪后续历史：Definition / Property / Domain 使用 internal Binding / Domain identity，Knowledge 使用 Lithograph element identity，Graph Type / Constraint / Index 使用 Lithograph 公开 Schema history / identity 能实际提供的连续性。若底层对某类 Schema resource 只有名称而没有可证明的跨 drop+create identity，KG OS 不把同名新资源猜成旧对象的延续。

Ontology / Knowledge / 单 Object 历史都只是同一 `history` / `diff` 的 scope filter，不建立平行 History API。History / Diff 结果可能因为批量 migration 很大，因此公共 wire 必须支持 bounded result / cursor，而不是承诺一次返回全部变化。Raw Lithograph Patch 不作为 KG OS 当前 Evolution 公共能力。

`state.create` 在调用方明确指定的 Branch 上建立一个新的业务 State，即使当前 Ontology / Knowledge Snapshot 与 parent 相同；底层映射到 Lithograph explicit empty-delta Commit，可同时设置初始 State Data。它不引入 Git working tree / staging，也不改变普通 Object Patch / Graph Execute 自动产生 State 的规则。因为 Snapshot 可以与 parent 完全相同，`diff(parent, state)` 合法为空，即使新 State 拥有不同的 State Data。

`set data` / `clear data` 只修改 State Data sidecar，不创建新 State。`branch.create/delete` 与 `tag.create/move/delete` 只操作对应 Lithograph ref；Tag 不因 Branch write、merge 或其它普通状态演进自动移动。

`merge` 操作整个 Knowledge Base State，包括调用方 Ontology Structure、Ontology Semantics 与 Knowledge Data。底层使用 Lithograph merge，但 KG OS 必须把 conflict 与结果转换为公开 Object / Graph 语义，不向调用方泄露 internal semantic graph representation。参与 merge 的 KG OS State 必须满足 Binding coverage、reserved internal graph / Schema 等当前 KG OS consistency invariants；候选 merged Snapshot 也必须在目标 Branch move durable 之前通过同一套 consistency validation。包括 fast-forward 在内，只要 source / candidate 无法作为 KG OS-valid Snapshot 解释，merge 就失败且不能移动目标 Branch。如果某个底层冲突或 consistency failure 无法安全映射为公共对象，KG OS 返回不暴露内部标识的 consistency/conflict error，而不是透传 raw slot。Merge 成功后返回最终 State identity；State Data 与 Tag 的继承 / 移动继续服从 Lithograph sidecar/ref 规则，不由 KG OS 隐式猜测业务意图。

Lithograph 仍然提供 Patch、Rebase、Squash、Reset、Revert、GC、checkout 等通用数据库能力，但 KG OS 当前没有已确认需求要求把它们全部提升为公共产品能力。未来只有出现明确 KG OS 使用场景时才增加，不因底层存在就复制一套接口。

### History 与历史读取

历史 Definition 必须从目标 State Snapshot 的 Schema 与同一 Snapshot 的 semantic metadata 动态组合，不能使用当前 metadata 去解释旧 Schema，也不能使用当前 Schema 去解释历史 metadata。

历史 Domain 与 Ontology organization 同样从目标 State Snapshot 的 semantic graph 读取。任何 Ontology read view 都必须在同一个 State 上组合 Schema、Definition semantics、Domain organization 与相关结构投影，不能跨 State 拼接。

KG OS 不再为 Ontology / Knowledge 各自建立 `history` / `diff` API。Evolution `history` / `diff` 接受 scope 与 **anchor State + Object Ref** 过滤，同一能力既能解释整个 Knowledge Base，也能聚焦 Ontology、Knowledge 或某个明确 Object。Binding Record / Domain Node 的稳定 internal graph identity 可以作为 Definition / Property / Domain rename 的内部 continuity anchor。普通 Knowledge Node / Relationship 则只按 Lithograph element identity 跟踪：如果直接 Relationship Patch 因 type / endpoint 变化产生 replacement，新 Ref 的对象级 history 从新 Relationship 创建开始，不跨 Ref transition 冒充同一个持久对象；当次 mutation result 与 State diff 可以同时显示旧 Relationship 删除和新 Relationship 创建。Definition-level 批量 Relationship replacement 同样只保证新旧集合变化可审计，不虚构一对一 mapping。

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

Knowledge 的 Property、Label、Relationship Type、端点、类型和查询语义都以 Lithograph 当前 Snapshot 中的真实 graph data 为准。Knowledge Object Value / canonical YAML 只投影这个 Node / Relationship 自己的 graph state；Label / Relationship Type 本身就是对当前 Ontology Structure 的名称引用，但 KG OS 不把对应 Definition 的 `title` / `description` 等可变语义复制进 Knowledge Object representation。AI 需要理解这些 Label / Type 时，使用对应 Definition Object Ref 继续读取。Node / Relationship 的 logical model 与公共 body shape 已由本文确认；剩余依赖只涉及 Lithograph-owned Schema resource projection，不重新设计 Knowledge model。

## Graph

Graph 是 KG OS 面向普通 Knowledge 图的通用计算入口，直接复用 Lithograph Cypher 25，不再提供 `get` / `list` / `expand` / `mutate` 等另一套 Knowledge CRUD / traversal language。

```text
Graph Capability
│
├── query
└── execute
```

`query` 执行任意 **普通 Knowledge graph-data 范围内的 read-only Cypher**。它直接使用 Lithograph 的只读执行路径，并受公共 Knowledge Graph View 约束。除了拒绝 graph / schema / version/ref mutation、外部 I/O、connection-state mutation 或其它副作用，还必须拒绝会绕过公共能力边界的 read-only surface：current Graph Type / Constraint / Index 等 Schema introspection 通过 Object 读取，Commit / Branch / Tag / log 等 version introspection 通过 Evolution 读取，KG OS internal procedure / metadata 不通过 Graph 暴露。全文、向量、结构化条件、图遍历、聚合、排序与混合检索都可以由 AI 在同一个 Knowledge Cypher 查询中按 Lithograph 当前公开能力自由组合，因此 KG OS 不额外建立 Graph Search DSL。

当 `query` 返回 Lithograph Node / Relationship 时，其 `elementId()` `n:<id>` / `r:<id>` 就是对应 Knowledge Object Ref；KG OS 不做 identity 转换。AI 可以把这个 Ref 直接交给 Object `read` / `patch`，也可以原样重新写入 Cypher。这个直接互操作只适用于 Knowledge element Ref；Schema / Domain 等其它 Object Ref 不是 `elementId()`。Scalar、Map、List、Path、aggregate 等普通 query result 只是计算结果，不因为来自 Graph 就自动成为 Object。

`execute` 使用 Lithograph 的通用 Cypher execution path 执行**普通 Knowledge graph-data mutation Cypher**，适合条件级、集合级、大规模或模式驱动的 mutation，例如条件更新、`MERGE`、复杂模式匹配后修改。一个或少量明确 Object 的维护优先使用 Object Patch；需要对大量匹配结果逐个生成 Object Patch 时，应直接使用 Graph `execute`。

Graph Type / Definition / Property / Constraint / Index mutation 属于 Object 的 Ontology Structure 维护语义，Branch / Tag / State / Merge 属于 Evolution，不通过 Graph `execute` 暴露。Graph 也不能访问 `_lithograph_*` 内部实现或 KG OS internal Ontology semantic graph。

Graph `query` / `execute` 使用统一 State reference semantics：读取可以引用 State / Branch / Tag，并在 operation 开始时 pin 到 immutable State；写入必须显式指定目标 Branch。Graph `execute` 是 command-based Cypher mutation，不继承 Object textual Patch 的 explicit `baseState` 合同：它以执行开始时解析出的目标 Branch head 为输入 Snapshot，并继续使用 Lithograph 的 branch-head compare 处理执行期间并发移动。成功的 writable `execute` 返回最终 State identity。Graph 与 Object 共享同一 Knowledge `graphView` isolation，不建立 `knowledgeVersion` 或第二套数据身份。

### Graph 公共调用合同

Graph v1 直接复用 Lithograph JSON v1 的 parameter / value encoding，避免 Node / Relationship / Temporal / Point / Vector / UUID 等值在 KG OS 再定义一遍。逻辑 request / response：

```text
query({
  at: StateRef,
  cypher: string,
  params?: map
})
→ {
  state: ResolvedState,
  columns: string[],
  rows: value[][]
}

execute({
  branch: string,
  cypher: string,
  params?: map,
  author?: string,
  message?: string
})
→ {
  state: ResolvedState,
  columns: string[],
  rows: value[][],
  counters: map
}
```

`query.at` 必填，避免 AI / SDK 依赖隐藏的 current Branch。`execute.branch` 必填且没有 `baseState`；执行开始时读取该 Branch head，执行期间仍使用 Lithograph compare-and-move。`rows` 与 parameter 统一使用 Lithograph JSON v1 tagged-value encoding；`counters` 复用 Lithograph public summary counter names。

大型 result 的 adapter 可以流式传输 `columns` 一次、`row` 零到多次、最终 summary 一次，但 row/value semantics 与上述 bounded result 完全相同；streaming 只是 transport，不建立第二套 Graph API。

### Graph 能力边界

- 不建立 KG OS query language、Search DSL、Traversal DSL 或独立 Search Engine；
- 不把全文、向量或混合检索拆成独立 Graph capability；
- 不通过 Graph `query` 暴露 Schema `SHOW` / introspection 或 Version Procedure；Ontology Structure introspection 属于 Object，State / ref / history introspection 属于 Evolution；
- 不再维护与 Object Patch 重复的 Knowledge `mutate` / CRUD surface；
- 不为 Node / Relationship 建立 KG OS 自己的 ID；
- 不允许普通 Graph query / execute 返回或修改 KG OS internal Ontology semantic metadata，也不访问 Lithograph 内部表。

Ontology 负责告诉上层“当前 Knowledge 应按什么模型理解”；Object 负责明确对象的读取与维护；Graph 负责关系发现、计算与集合级 mutation；真实约束和 query / mutation 数据库语义由 Lithograph 按其公开 Schema 与 Cypher 合同负责。

## 公共错误合同

KG OS adapter 的稳定 error envelope：

```json
{
  "code": "OBJECT_NOT_FOUND",
  "message": "...",
  "details": {}
}
```

`details` 只放公开可定位信息并可省略；不能包含 `_lithograph_*`、Binding Record identity、reserved internal Schema locator 或其它实现细节。Graph / Schema / value 错误在不泄露内部实现时尽量保留 Lithograph 已公开且对调用方有意义的稳定 category，例如 `PARSE_ERROR`、`SEMANTIC_ERROR`、`TYPE_ERROR`、`SCHEMA_ERROR`、`CONSTRAINT_ERROR`、`INVALID_ARGUMENT`、`BRANCH_NOT_FOUND`、`TAG_NOT_FOUND`、`BRANCH_HEAD_MOVED`、`RESOURCE_ERROR`、`IO_ERROR`、`INTERNAL_ERROR`。Evolution `merge` 的可解决业务冲突按上文返回 `status=conflict`，不把正常 conflict discovery 强制变成 error response。

KG OS 自有稳定 code 至少包括：

```text
OBJECT_NOT_FOUND
OBJECT_CONFLICT
PATCH_BASE_MISMATCH
STALE_BASE_STATE
CONSISTENCY_ERROR
UNSUPPORTED_OPERATION
STATE_NOT_FOUND
RESERVED_IDENTIFIER
```

Lithograph `VERSION_NOT_FOUND` 在 KG OS 公共语义中映射为 `STATE_NOT_FOUND`；Object Patch 的起始/执行期 head mismatch 映射为 `STALE_BASE_STATE`；Git hunk 无法精确应用到 `baseState` 重新生成的 canonical YAML 时返回 `PATCH_BASE_MISMATCH`，不能 fuzzy/offset apply，也不能误报为 Branch stale；Binding coverage、reserved internal graph/schema 等 KG OS invariants 失败映射为 `CONSISTENCY_ERROR`。HTTP status、CLI exit code 与 SDK exception class 属于 adapter mapping，不改变上述 error code。

Object Patch 的错误归类固定为：

- Git Extended Diff / YAML **语法无法解析** → `PARSE_ERROR`；
- Git form 语法合法但不在 KG OS v1 profile（combined diff、binary、copy、mode-only 等）→ `UNSUPPORTED_OPERATION`；
- malformed / non-canonical Object Ref、StateRef、cursor、alias，unknown alias，duplicate `(kind, alias)`，或 request field 组合非法 → `INVALID_ARGUMENT`；
- YAML 可解析但字段类型、Lithograph tagged value 或 Object Value shape 不合法 → `TYPE_ERROR`；
- exact hunk 与 regenerated base canonical YAML 不匹配 → `PATCH_BASE_MISMATCH`；
- existing target 不存在 → `OBJECT_NOT_FOUND`；
- duplicate Add target/name、parent/child overlap、explicit-vs-derived slot 冲突、rename target 与显式 `name` 不一致 → `OBJECT_CONFLICT`；
- 触碰 `__kgos_` reserved namespace → `RESERVED_IDENTIFIER`；
- owner lifecycle 本身不允许请求的变化 → `UNSUPPORTED_OPERATION`；
- target Snapshot 违反 Lithograph Schema / Constraint → 保留 `SCHEMA_ERROR` / `CONSTRAINT_ERROR`；
- target Snapshot 违反 KG OS Binding / internal isolation consistency → `CONSISTENCY_ERROR`。

这些 code 表示稳定的调用方可观察类别；`message/details` 可以增加诊断信息，但不能通过文案改变 code 语义。

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
→ Object / Graph / Evolution + Ontology / Knowledge semantics
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

- 决定：Lithograph Schema 是全部结构状态的唯一真源；KG OS 对外 Ontology Structure 是其中调用方 Schema resource 的业务投影，排除 KG OS-owned reserved internal Schema resources。KG OS 不保存第二套结构 Schema。
- 依据：避免结构重复、漂移和双重约束语义。
- 备选：Lithograph Schema + KG OS JSON Schema 并存。
- 取舍：KG OS 能表达的调用方结构能力以 Lithograph / Cypher 25 已支持范围为边界；KG OS 可以在同一 Schema 中维护自身 internal graph 必需的 reserved infrastructure definitions，但不能把这些定义提升为调用方 Ontology 语义，也不能自行添加 Lithograph 不支持的结构语义。

### D3 Ontology 上层语义作为普通图数据

- 决定：Definition / Property 的 `title` / `description` 由稳定的 KG OS internal Binding Record 承载；Domain / `INCLUDES` 直接组织这些 Binding Record；Binding Record 通过 Snapshot-scoped Schema Locator 指向同一 Snapshot 的 Lithograph Schema element。全部仍是 Lithograph 中的普通 versioned graph data。
- 依据：Cypher 25 Graph Type 当前没有通用 description annotation，也不负责 KG OS 业务组织；普通图数据可以在不修改 Lithograph 的前提下承载上层语义并自动版本化。
- 备选：给 Lithograph 增加 KG OS 专用 Schema annotation。
- 取舍：KG OS 需要维护 Binding Record 与 Schema Locator 的一致性，并通过 Lithograph Graph View 在普通 Knowledge 访问中隔离自身 internal graph；内部 graph 同时受完整 Lithograph Schema / Constraint 约束，因此需要同一 Schema 中的 reserved internal Schema resources。

### D4 Definition 是聚合视图，不是存储模型

- 决定：Definition 作为 Object 的一种业务化聚合视图，读取时合并 Lithograph Schema 与 semantic metadata，Object Patch 写入时分派到真实底层能力。
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

### D8 Ontology 通过 Object 渐进自描述，不建立完整 Ontology 资源

- 决定：AI 通过 Object `list` / `search` / `read` 渐进取得由 Lithograph Schema、KG OS Schema semantics 与 Domain organization 组合的 Domain / Definition / Property Object projection。KG OS 不建立独立 `get ontology` API，也不把完整 Ontology JSON 定义成带新 Object Ref 的顶层公共资源；调用方或 Web 可以在同一 resolved State 内临时聚合多个 Object read result。
- 依据：AI 需要直接理解“模型是什么、字段是什么意思、模型如何组织”，但大型 Ontology 不应要求一次加载；同时建立完整 Ontology resource 会重新引入一套与 Object 重叠的读取与 mutation 入口。
- 备选：提供独立完整 Ontology aggregate API / Object；让 AI 分别读取 Lithograph Schema 与 KG OS internal metadata；持久化一份完整 Ontology JSON。
- 取舍：AI 需要按任务逐步发现和读取相关 Object；换取单一 Object 访问模型、按需上下文大小与没有第二份 Ontology wire resource。

### D9 公共能力收敛为 Object / Graph / Evolution

- 决定：KG OS 的 AI-facing 公共能力只建立三组核心心智模型：Object 负责明确对象的发现、稳定读取与统一 Patch；Graph 负责 Cypher 查询和集合级 mutation；Evolution 负责 State / Branch / Tag / History / Diff / Merge。Ontology 与 Knowledge 保持产品语义和数据边界，但不再各自复制完整 CRUD / History API。
- 依据：AI 需要的是“找到对象并维护”“查询关系和集合”“理解时间与版本”三类确定性能力；把 Definition、Domain、Knowledge Node / Relationship 分别建接口会增加身份转换和重复 CRUD，而没有新的底层 owner 或 lifecycle。
- 备选：保留 Ontology Read/Define/Organize/History 与 Knowledge get/list/expand/mutate/history 两套能力；或者所有任务都要求直接写 Cypher。
- 取舍：公共能力面更小且身份统一；KG OS 需要维护稳定 Object projection / Patch contract，并让 Graph 与 Object 的职责边界清楚。

### D10 Object Patch 使用 canonical YAML + Git Extended Diff

- 决定：Object `read` 的 editable representation 是稳定 canonical YAML；Object `patch` 接收基于该 YAML 生成的普通 two-way Git Extended Diff（`git diff -p`）Patch，并覆盖 Add / Update / Delete / Rename / Restructure。KG OS 不自定义 Patch section / hunk / pathname-quoting grammar；多 Object 使用多个 `diff --git` entry，新增 / 删除 / rename 复用 Git 标准 extended headers 与 `/dev/null` 语义。一个请求可以修改多个明确 Object；已有对象使用 owner-backed Object Ref，新增对象只使用 request-local alias。Patch 对 `baseState` canonical YAML 精确应用，不 fuzzy match；Add/Update/Delete/Rename 不做隐式 upsert / no-op。KG OS 不使用 JSON Patch、JSON Merge Patch 或 `op/path/value` mutation DSL 作为公共 Object mutation 模型。系统分配的 identity 不能由调用方直接重写，但业务结构变化可以导致底层 replacement / migration，并通过 Ref transition / Evolution diff 暴露结果。
- 依据：AI 天然擅长读取稳定文本并生成文件式局部 Patch；Git Extended Diff 已经提供成熟、广泛实现的修改、新增、删除、rename、多目标和 pathname quoting 文本语法，没有当前需求要求 KG OS 再发明一套 Patch grammar。同一 Object mutation 模型可以维护 Definition、Domain、Property、Knowledge Node / Relationship，避免 `mutate`、Ontology CRUD、Domain CRUD 等重复写接口。Lithograph 已有 canonical Patch / Cypher / Schema / transaction 公共能力，KG OS 按目标变化选择最小可用组合，不再发明数据库 mutation engine。
- 备选：自定义 KG OS textual Patch framing；使用 RFC JSON Patch / Merge Patch；使用 operation-oriented JSON mutation DSL；Object Patch 只做 Update 而 Create/Delete/Rename 使用独立 API。
- 取舍：KG OS 必须维护 canonical YAML renderer、标准 YAML parser，并解析 / 应用本文冻结的 Git Extended Diff profile，再把业务 target change 编译成 Lithograph 实际 graph / Schema / Index mutation；Object Ref / alias target 与 logical Patch request/result 已由 D36/D37 冻结，剩余复杂度集中在 logical slot 到 Lithograph public mutation 的实现映射。Git blob hash、file mode、filesystem / index 行为不会成为 KG OS 业务语义，unsupported Git patch form 也不会因为 Git 支持就自动进入 KG OS v1。

### D11 Binding Record 提供语义连续性，Schema Locator 只负责定位

- 决定：KG OS 不要求 Lithograph 提供永久 `SchemaElementId`。每个调用方可见 Definition / Property 在 KG OS-valid State 中都恰好有一个稳定内部 Binding Record，即使没有任何 `title` / `description`；Binding Record 保存 Snapshot-scoped Schema Locator，Locator 只在目标 Commit 的 Schema 中确定性定位 element type / Property。调用方可见 Schema element 与 Binding Record 之间必须保持双向一一覆盖，reserved internal Schema element 例外。
- 依据：KG OS 当前需要的是 metadata、Domain membership 与显式 rename/history 的连续性，而不是把 Lithograph Schema 自身改造成带永久对象 ID 的另一种模型。Binding Record 已经能承担 KG OS 的连续性需求；结构事实仍由 Lithograph Schema 唯一拥有。
- 备选：仅以名称字符串同时承担跨版本连续 identity；要求 Lithograph 新增跨版本永久 Schema element identity；在 KG OS 再建立一份独立结构 Schema。
- 取舍：KG OS 为没有自然语言语义的 Definition / Property 也维护一个轻量 Binding Record；换取稳定 rename/history continuity 与确定性 Domain target。通过 KG OS 执行的 create / rename / delete 必须原子得到合法目标 Snapshot并维持双向一一覆盖；绕过 KG OS 的直接 Schema 修改可能产生 consistency error，KG OS 不做无依据自动修复。

### D12 Evolution 不镜像 Lithograph Version Procedure

- 决定：KG OS 当前 Evolution 只提供 `overview/get/ancestry/history/diff`、State create/data、Branch lifecycle、Tag lifecycle 与 merge；不因为 Lithograph 有 patch/rebase/squash/reset/revert/gc/checkout 就全部复制为 KG OS 公共能力。
- 依据：KG OS 的产品职责是知识世界的状态演进，不是通用数据库版本控制客户端；直接复制底层接口会扩大公共合同并泄露 internal semantic graph / connection-local 机制。
- 备选：一比一包装 Lithograph Version Procedure。
- 取舍：KG OS 公共能力更小、更稳定；高级数据库版本操作仍可由 Lithograph 提供，未来出现真实 KG OS use case 时再按业务语义提升。

### D13 State 引用显式且所有状态写入返回最终 State

- 决定：Object / Graph Read 直接使用 State / Branch / Tag reference；Branch / Tag 在 operation 开始时解析并 pin 到 immutable State，不再建立独立 `State Context` 抽象。Object Patch / Graph Execute 显式指定目标 Branch，不暴露 checkout；任何创建新 State 的 KG OS 操作成功后都返回最终 State identity，多步编排不要求调用方理解内部 Commit 数量。
- 依据：Git-style ref 已足以表达“读取哪个 Snapshot / 推进哪个 Branch”，无需再增加一层状态对象；同时 AI 与并发调用不应依赖 connection-local 隐式状态。
- 备选：建立独立 State Context request object；依赖 Lithograph checkout；或仅返回业务 mutation result 不返回 State。
- 取舍：公共模型更小；State / Branch / Tag 的 canonical StateRef 已由 D35 冻结，CLI / SDK / HTTP 只需要做 adapter mapping，不再创建第二套状态身份或引用格式。

### D14 Object Ref 直接复用 owner identity 或名称定位

- 决定：KG OS 不建立全局 Resource ID / UUID 体系，也不把原生 identity 包装成第二种 Object 地址。Knowledge element 的 Object Ref 直接使用 Lithograph `n:<id>` / `r:<id>`；Graph Type / standalone Constraint / Index 直接使用 Lithograph public schema locator / identity；Definition 使用 kind + 当前 Schema identifying name；Property 使用 owner Definition Ref + property name；Domain 使用当前 name。State / Branch / Tag 保持独立 Evolution reference。Definition / Property / Domain 的跨 rename 连续性由 KG OS internal graph identity 维护，不作为 v1 public identity。
- 依据：这些资源已经有足够的确定性定位信息；额外 UUID 会建立第二套身份映射，却没有当前使用场景需要调用方跨 rename 持有 opaque public identifier。
- 备选：为 Definition、Property、Domain 统一生成稳定 public UUID；直接暴露 Binding Record / Domain Node 的 Lithograph element identity。
- 取舍：rename 后公共名称引用会变化，历史读取必须结合目标 State；Evolution History / Diff 仍可依靠内部稳定 identity 识别连续性。若未来出现真实的跨 rename opaque-reference 需求，再通过新的设计修订评估稳定 public ID。

### D15 Definition / Property 删除不隐式级联 Knowledge

- 决定：Definition / Property delete 必须对整个 Object Patch 的目标 Snapshot 做 dependency 校验。若目标状态仍有依赖则 reject；KG OS 不自动删除、迁移或保留 orphan Knowledge，也不在 v1 提供 `force` / `cascade` / `preserve_orphan` 模式。调用方可以在同一个 Object Patch 中**显式**迁移 / 删除依赖 Knowledge 后再删除结构，只要最终 Snapshot 合法。成功删除同时清理对应 Binding Record；删除 Definition 时同时清理其 Property Binding Records 与 Domain `INCLUDES` membership。历史 State 不受影响。
- 依据：Schema 生命周期操作不应隐式触发大规模业务数据丢失或替调用方做迁移决策；同时 Object Patch 应能原子表达调用方已经明确给出的完整迁移计划，不强迫拆成多个请求。
- 备选：删除 Definition 时级联删除相关 Knowledge；允许删除结构后保留无法由当前 Ontology 解释的 orphan Knowledge；提供 `force` 参数让单个操作选择行为。
- 取舍：调用方必须显式声明依赖 Knowledge 的迁移或删除，不能只要求“强制删结构”；这些变化可以放在同一个 Object Patch 中原子完成。换取的是无隐式数据损失、没有 orphan 状态，也无需维护多套删除模式。

### D16 Object Patch 使用 strict base State

- 决定：Object Patch 必须基于调用方实际读取到的 immutable `baseState`，并显式指定目标 Branch；执行开始时目标 Branch head 必须仍等于 `baseState`，执行期间目标 Branch 再次移动也必须按 Lithograph branch-head compare 失败。KG OS 不把旧文本 Patch 自动套用到新 State，不自动 rebase / merge。
- 依据：textual Patch 的语义来自调用方看到的 canonical YAML；在不同 Snapshot 上“尽量应用”会把文件 Patch 模型变成隐式 merge，并产生难以预测的 AI 写入结果。Lithograph 已提供 Branch head compare 与 `BRANCH_HEAD_MOVED` 底层并发保护。
- 备选：即使 Branch 已前进，只要 Lithograph raw patch 的 before condition 仍满足就继续应用；自动 three-way merge / rebase。
- 取舍：并发写发生后调用方需要重新读取最新 Object 并重新生成 Patch；换取明确、可重复的 mutation base 和更简单的冲突语义。

### D17 Definition rename 执行语义保持的 Knowledge migration

- 决定：Definition / Property rename 不是只修改 Schema 名称与 Binding Locator；KG OS 必须同步更新依赖的 Schema / Constraint / Index references，并完成保持已有 Knowledge 业务含义所必需的数据迁移。Node identifying Label rename 迁移受影响 Node 的 Label；Property rename 只作用于 owner Definition 按 Lithograph Schema coverage 覆盖的 element，不全图修改同名 key，并且不得静默覆盖已有新 key value；如果同一 physical property 同时承载其它 Definition 的语义且无法无损局部迁移则失败。Relationship Type rename 在底层不能原地修改时重建受影响 Relationship 并产生新的 element identity。任何不能安全得到合法目标 Snapshot 的 rename 整体失败。这个语义保持 migration 是显式 rename 的组成部分，不属于 D15 禁止的“Delete 隐式级联数据删除”。
- 依据：Definition 是当前 Knowledge 的模型解释；只 rename Schema 而留下旧 Label / Type / Property key 会使同一成功操作产生结构与数据脱节的 State，这与 Object Patch“描述目标 Object 变化并由 KG OS 编排底层实现”的合同冲突。
- 备选：rename 只改 Definition，要求调用方另行显式迁移全部 Knowledge；禁止 rename，只允许 create + migrate + delete。
- 取舍：rename 可能是高成本批量操作，Relationship Type rename 还会改变大量 Relationship Ref。只有调用方直接寻址修改的 Object 承诺 Ref transition；Definition-level 批量 Relationship replacement 不承诺可永久恢复的一对一 oldRef→newRef 映射，调用方通过新 State 的 Graph 重新发现对象，并通过 bounded Evolution diff/history 审计集合变化。

### D18 Object 删除不隐式 DETACH Knowledge Node

- 决定：Object Patch 删除 Knowledge Relationship 只删除该 Relationship；删除仍存在 incident Relationship 的 Knowledge Node 时 reject，除非同一 Object Patch 已显式删除或重构这些 Relationship。Object Patch 不把 Node delete 自动提升为 `DETACH DELETE`。
- 依据：Object Patch 的价值之一是让 AI 明确表达目标对象变化；静默 DETACH 会因为一个 Node delete 隐式删除其它有独立 identity 的 Relationship Object，违背无隐式数据损失和明确 Object mutation 原则。
- 备选：所有 Node delete 默认 DETACH；为 Node delete 增加 cascade flag。
- 取舍：删除连接度高的 Node 需要调用方明确处理 incident Relationship；需要大规模条件删除时仍可用 Graph `execute` 明确表达 Cypher `DETACH DELETE` 等集合 mutation。

### D19 Object History 使用 anchor State + Object Ref

- 决定：对象级 Evolution `history` / `diff` 一律以 anchor State + Object Ref 定位起始对象，不能把裸 name / locator 当成跨版本永久 identity。解析后只使用 owner 已有 continuity evidence：Definition / Property / Domain 使用 internal Binding / Domain identity，Knowledge 使用 Lithograph element identity，Graph Type / Constraint / Index 使用 Lithograph public Schema history / identity 实际提供的连续性；没有稳定证据时不猜测同名 drop+create 为同一对象。Relationship replacement 产生的新 `r:<id>` 是新持久身份，history 不跨 mutation-result Ref transition 自动拼接。
- 依据：名称型 Ref 与某些 Schema locator 都可能被删除后重新使用；缺少 anchor State 或擅自按字符串连接历史都会把两个独立生命周期错误合并。
- 备选：把所有名称永久保留不可复用；向公共 API 暴露 / 新建统一 stable UUID；仅按字符串和相邻 diff 猜测连续性。
- 取舍：对象级历史调用需要同时提供一个 State，某些底层没有 stable Schema identity 的资源在 drop+create 之间不会自动获得 continuity；换取没有第二套公开 UUID，且历史解释只建立在可证明的 owner identity 上。

### D20 Knowledge replacement 不建立持久 Ref alias

- 决定：当直接 Knowledge Relationship Object Patch 因 type / endpoint 变化必须 replacement 时，成功结果可以返回旧 Ref → 新 Ref transition，帮助调用方继续本次工作；KG OS 不把该 transition 持久化为第二套 Knowledge identity / alias，也不让后续对象级 History 自动跨两个 `r:<id>` 合并生命周期。
- 依据：Lithograph Relationship identity 独立且 type / endpoint 变化通过新 Relationship 表达；持久保存 replacement continuity 会重新建立 KG OS 自己的 Knowledge identity mapping，与“直接复用 Lithograph element identity”冲突。
- 备选：为所有 replacement Relationship 建立 KG OS stable knowledge ID；把 Ref transition 永久记录进 semantic graph。
- 取舍：持有旧 `r:<id>` 的调用方必须使用当次 mutation result 更新引用，Definition-level 批量 replacement 后则重新 Graph query；换取不引入第二套持久身份和历史真源。

### D21 重叠 Object projection 不允许同 Patch 双重修改

- 决定：为减少 AI 上下文，Property 可以作为 Definition 的可寻址 child Object，同时 Definition read 可以包含 Property 的完整业务化投影。两者是同一底层 logical state 的不同读取粒度。一个 Object Patch 可以通过父 Definition 或 child Property 修改该 Property，但不能同时通过两个 section 修改同一底层 slot；KG OS 必须在执行前检测并拒绝 overlapping target change。
- 依据：允许 focused child Object 可以避免为了修改一个字段读取大型 Definition；允许 Definition 聚合读取又能保持模型理解完整。若不定义 overlap 规则，同一 Patch 的结果会依赖 entry 顺序，形成隐藏的第二套 mutation precedence。
- 备选：Definition 永远不展示完整 Property；Property 永远不能独立 Object；规定 parent 或 child 固定覆盖另一方。
- 取舍：调用方需要避免在一个 Patch 重复表达同一 Property change；换取读取粒度灵活、底层仍单一真源且 mutation 结果与 entry 顺序无关。

### D22 无有效 Object delta 不创建新 State

- 决定：Object Patch 在解析、归一化并比较 target Object set 后，如果没有产生任何 Ontology / Knowledge Snapshot change，则不执行 Lithograph mutation，不创建 Commit，成功结果的最终 State 仍是 `baseState`。需要内容不变但创建新 State 的调用方必须显式使用 Evolution `state.create`。
- 依据：Object Patch 表达对象状态变化，而 KG OS 已经有专门的 `state.create` 表达业务上的 empty-delta State；让普通 Patch 因无效编辑产生空 Commit 会混淆两种意图并污染历史。
- 备选：所有 syntactically valid Object Patch 都创建 Commit，即使 effective delta 为空，完全继承 Lithograph mutating-query write-intent 语义。
- 取舍：Object Patch 的 write-intent 不单独记录空状态；需要这种历史事件时调用方多一步显式 `state.create`，换取更可预测的 Object mutation history。

### D23 Object Patch 内已有对象引用统一按 base State 解析

- 决定：Object Patch 中所有指向 baseState 已存在 Object 的引用，无论出现在 entry target 还是另一个 Object 的内容中，都使用并解析 baseState Object Ref。若同一 Patch rename 该 Object，KG OS 依靠已解析的逻辑对象连续性把引用带到目标 Snapshot；同一 Patch 不使用 rename 后尚未产生的新 Ref 重新定位它。本次新建 Object 则使用 request-local alias。
- 依据：strict base-State textual Patch 来自调用方实际看到的 base canonical YAML；要求 AI 在同一 Patch 中混用“现在的 Ref”和“未来的 Ref”会增加不可验证的引用时序，并使结果依赖 entry 顺序。
- 备选：允许 old/new Ref 混用并由 KG OS 猜测；要求 rename section 先执行后其它 section 才能使用新 Ref。
- 取舍：同一 Patch 中引用正在 rename 的已有 Object 时继续写旧 Ref，看起来不是最终展示值；换取所有引用都能在执行前确定解析，target Ref 只作为结果产生。

### D24 Object representation 只投影 owner state

- 决定：Object Value 以及它的 YAML / JSON representation 只包含该 Object owner 的可编辑状态与跨 Object Ref，不内联其它独立 Object 的可变内容。Knowledge Node / Relationship 不复制 Definition semantics，Relationship 不复制 endpoint Node content，Domain 不复制成员内容。Definition 为整体模型理解可以包含 child Property projection，这是唯一当前确认的重叠 owner/child view，并服从 D21。
- 依据：canonical YAML 同时是 textual Patch 的编辑基线；若把其它 Object 的可变字段内联，AI 会看到同一底层状态出现在多个不相关 Patch target 中，从而重新产生重复 ownership 和冲突写入口；JSON representation 也必须与同一 Object Value 保持相同 ownership 边界。
- 备选：所有 Object read 都尽可能展开关联对象；把展开字段标记 read-only；只在 Patch 时忽略外部字段变化。
- 取舍：AI 需要额外 `read` 才能获得关联对象的详细语义；换取每个 Object Value 的 ownership 明确、canonical YAML token 可控且 Patch 不会跨对象误写。

### D25 全部 versioned Ontology Structure 通过 Object 暴露

- 决定：Lithograph versioned Schema state 中调用方可见的 current Graph Type、element Definition / Property、standalone Constraint 与 Index definition 都必须有 KG OS Object projection；KG OS 不为 Constraint / Index 另建 Schema API，也不把它们强行归属到某个 Definition。Graph Type / Constraint / Index Object Ref 直接使用 Lithograph 公开 schema locator / identity，不创建 Binding Record 或 KG OS UUID。Current Graph Type Object 只拥有 graph-level state，element Definition / Property lifecycle 由 child Object 独立拥有，Graph Type projection 不复制第二份可编辑 child schema。
- 依据：Lithograph 设计明确 Graph Type、standalone constraints、index definitions 共同构成 versioned Schema state；如果只让 Definition Object 可写，standalone / multi-target schema resource 将没有公共维护入口，Object / Graph / Evolution 就不再覆盖完整 KG OS 能力面。
- 备选：把所有 Constraint / Index 强制嵌入某个 Definition；新增独立 Schema API；允许 Graph `execute` 任意 Schema DDL。
- 取舍：Object kind 增加少量底层 schema resource 类型，但仍保持一个统一 Object surface；这些对象没有 KG OS 自然语言 semantic metadata，避免为尚无需求的 Schema annotation 增加 Binding 模型。调用方 Schema Object 仍受 reserved internal namespace / target 隔离，不能借 Constraint / Index 指向内部资源。若 Lithograph 暂未提供某类资源的无歧义公共 locator / mutation surface，该 Object kind 的实现被依赖阻塞，而不是由 KG OS 自建 identity 层绕过。

### D26 Object Patch 统一变化模型不覆盖 owner lifecycle

- 决定：Add / Update / Delete / Rename / Restructure 是公共 Patch 的变化分类，但某个 Object kind 是否允许某类变化、以及底层如何表达，继续服从该 Object owner 的已确认合同。KG OS 只为本文已明确的上层语义（例如 Definition / Property / Domain rename）做编排，不把通用 Patch vocabulary 解释成所有资源都有 rename/upsert/cascade 能力。
- 依据：统一交互模型的目的是减少 AI mutation surface，不是建立第二套数据库语义；否则 Constraint、Index、Graph Type、Knowledge element 会因为统一名词获得 Lithograph 并不存在的行为。
- 备选：为每个 Object kind 建独立 CRUD API；让通用 Patch 自动用 delete + create 模拟所有不支持的操作。
- 取舍：调用方需要理解目标 Object kind 的合法业务变化；换取底层语义忠实、无隐式 destructive emulation，同时继续只有一个 Patch 入口。

### D27 Graph Type projection 不复制 child Definition mutation ownership

- 决定：Current Graph Type Object 只暴露 graph-level state 和必要的 child Ref / summary；Definition / Property 的可编辑结构不在 Graph Type Object Value / canonical YAML 中重复出现，也不能通过 Graph Type Patch 间接修改。若 Lithograph 底层 DDL 需要 whole Graph Type replacement，KG OS compiler 从所有 target schema Objects 合成底层完整 Graph Type。
- 依据：Object 是 AI-facing ownership projection，不要求一比一复制底层 AST nesting。若 Graph Type 和 Definition 同时拥有完整 element definition，可编辑状态会再次出现两套公共 mutation target，违背 owner-only representation。
- 备选：Graph Type canonical YAML 完整内联并可编辑所有 element definitions，再用 D21 overlap reject 重叠；取消 Definition Object，只编辑整个 Graph Type。
- 取舍：Graph Type Object 不一定能原样显示底层完整 DDL AST；换取 Definition 级小上下文修改、唯一 mutation ownership 和大型 Schema 下更低 token 成本。

### D28 Standalone Constraint / Index 只有一个公共 mutation owner

- 决定：Graph Type / element definition 内生的 property type、key、existence 等结构由 Definition / Property Object 拥有；Lithograph standalone Constraint definition 与 Index definition 分别只由 Constraint Object、Index Object 拥有。其它 Object 可以引用或摘要显示这些资源，但不能内联第二份可编辑定义。被引用 Definition / Property rename 时，为保持同一逻辑 target 而产生的 locator rewrite 是 referential maintenance，不转移 Constraint / Index 的 mutation ownership，也不能修改其余配置。
- 依据：Lithograph 自身区分 Graph Type、standalone constraints 与 index definitions；KG OS 若把 standalone resource 同时嵌入 Definition 可写文本，会造成底层一个 logical slot 对应多个公共 owner。
- 备选：所有 Constraint / Index 都强制归属单个 Definition；Definition 与 standalone Object 都允许编辑并用 overlap detection 解决。
- 取舍：AI 修改 standalone schema resource 时需要读取对应 Constraint / Index Object；换取 mutation ownership 唯一，并支持跨 Definition / multi-target index 等不能自然归属单个 Definition 的能力。

### D29 Rename 可以派生跨 Object locator rewrite，但不转移 ownership

- 决定：当一个 Object 的 canonical state 保存对另一个 Object 的 Ref / schema locator 时，被引用 Object 的 rename 可以让 KG OS 自动重写该 locator，以保持原有逻辑引用。派生 rewrite 只覆盖“仍指向同一逻辑对象”所必需的 locator slot；其它字段仍只能由该 Object 自己的显式 Patch 修改。显式 change 与派生 rewrite 若落到同一 logical slot 且目标不同则整体冲突。
- 依据：Definition / Property rename 会改变 public/schema locator；若 Constraint / Index / Domain 等引用者完全不更新，就会形成悬空引用。但把整个引用者当成 rename 操作的隐式可写对象又会破坏 owner-only contract。
- 备选：要求调用方在 rename Patch 中显式更新所有引用者；允许 rename 任意修改关联 Object；把 Ref 设计成永久 UUID 避免 locator 变化。
- 取舍：KG OS compiler 需要做引用依赖分析和 deterministic locator rewrite；换取 rename 仍是一个语义完整操作，同时不引入永久公共 UUID 或跨 owner 隐式业务变更。

### D30 Evolution merge 必须保持 KG OS-valid Snapshot

- 决定：KG OS whole-Knowledge-Base merge 不以“Lithograph merge 没有 raw slot conflict”作为唯一成功条件；ours / theirs 与候选 merge result 还必须满足 KG OS 的 Binding coverage、internal graph / Schema isolation 等 consistency invariants。校验和 merge/ref move 位于同一请求原子边界；fast-forward source 无效时也不得移动目标 Branch。
- 依据：Ontology semantics 与 Lithograph Schema 是同一 State 的两个组成部分，底层按独立 logical slots 合并后仍可能组合成 KG OS 无法解释的状态；公共 Evolution 不能主动生成一个随后 Object read 就报 consistency error 的 State。
- 备选：完全透传 Lithograph merge，只在后续 Object read 时发现 KG OS inconsistency；merge 后自动猜测并修复 Binding。
- 取舍：KG OS merge 比 raw Lithograph merge 多一层业务一致性验证；换取所有通过 KG OS merge 产生的 State 都保持当前 KG OS 设计不变量。

### D31 Invalid Lithograph Snapshot 只允许 Evolution 诊断，不继续演进

- 决定：绕过 KG OS 产生且不满足 Binding / internal Schema 等 invariants 的 Lithograph Commit 保留在底层历史中；KG OS Evolution topology / metadata read 可以标记并诊断它，但 Object / Graph data capability、business History/Diff 和所有会创建新 State、推进 Branch 或创建 / 移动 Tag 到目标 Snapshot 的 KG OS mutation 都拒绝使用 invalid base / target。History 在 invalid / pre-KGOS ancestry boundary 终止，不跨边界猜 continuity。Commit Data set/clear 与 Branch/Tag delete 只修改 sidecar/ref cleanup，可以作用于 invalid State。KG OS v1 不自动修复这种 Snapshot。
- 依据：底层 immutable history 不能被 KG OS 静默改写；但允许正常公共写继续基于 invalid state 会让 inconsistency 扩散到更多 Commit / refs，并使“KG OS public write 产生可读 State”不再成立。
- 备选：所有能力一律完全拒绝看 invalid Commit；允许 Graph 继续查询/写普通 Knowledge；自动重建 Binding 或跳过异常 internal metadata。
- 取舍：Evolution 仍能提供排障所需 topology / metadata，但业务数据访问需要先回到一个 KG OS-valid State 或由外部底层维护显式修复；换取不会通过 KG OS API 传播坏状态。

### D32 Textual Patch 只把 base→patched 差异视为显式 target change

- 决定：Update / Rename / Restructure entry 应用 textual Patch 后，KG OS 将 patched YAML 解析得到的 Object Value 与 base canonical YAML 对应的 Object Value 比较，只把实际变化的 logical slots 作为调用方显式 target delta；Rename entry 的 old/new target 另外提供顶层 identifying locator 的显式 rename delta。未改变字段是 Patch context，不具有“锁定旧值”的 PUT 语义。Mandatory rename migration、locator rewrite 和当前操作所需 consistency change 可以更新这些 untouched slots；若派生变化与显式 delta 同时写同一 slot 且目标不同则 conflict。
- 依据：文件 Patch 天然表达局部编辑。若把 patch 后整份文本当成 full replacement，任何 Definition rename 都会与同时修改相关 Knowledge Object 的无关字段产生伪冲突，因为它们的 base 文本仍显示旧 label / type / property ref。
- 备选：Object Patch 等价完整 PUT；要求 AI 在每个受影响 Object entry 中手工同步所有派生字段；按 entry 顺序最后写入者获胜。
- 取舍：compiler 必须执行 canonical parse + logical diff，而不能只 parse final text；换取真正的 Git Extended Diff 局部修改语义、可组合多 Object migration 和确定的冲突检测。

### D33 KG OS v1 只 bootstrap 空 Lithograph Knowledge Base

- 决定：KG OS v1 只在 Lithograph empty Root State 上 bootstrap 自己需要的 reserved internal Schema resources，并从第一个 KG OS-valid State 开放公共业务能力；不自动 adoption 已经存在调用方 graph / Schema history 的任意 Lithograph database。pre-KGOS Root / bootstrap invalid Commit 只按 D31 诊断可见。
- 依据：Definition / Property Binding coverage 与 reserved internal Schema 是 KG OS-valid State 的硬不变量；自动接管已有数据库必须决定如何为既有 Schema 生成 Binding、如何解释已有业务语义和历史连续性，这不是启动时可以确定性猜测的事情。
- 备选：首次打开时自动为所有已有 Schema element 创建 Binding；允许没有 Binding 的 Schema 逐步懒迁移；直接把现有 database 一律视为有效 KG OS State。
- 取舍：已有 Lithograph 数据库不能在 v1 被无配置直接“挂载”为 KG OS，需要未来显式 migration / import 设计；换取 bootstrap 简单、所有公开 KG OS State 从一开始满足当前一致性不变量。

### D34 Object 使用单一 logical value、canonical YAML 与 JSON representation

- 决定：每个 Object 在目标 State 中只有一份逻辑 Object Value。v1 对外支持 `application/yaml` 与 `application/json` 两种 serialization；YAML 是唯一 canonical editable representation 和 Object Patch base，JSON 是同一 Object Value 的等价结构化 representation。KG OS 不定义自己的 YAML 方言：标准 YAML 输入只要能无歧义解析并映射到合法 Object Value 即可接受，后续读取再由 KG OS renderer 规范化为 canonical YAML。HTTP adapter 使用标准 `Accept` / `Content-Type` 做 representation negotiation，不增加 `representation.mode/format` 之类业务字段；SDK 中的 structured Object 只是 JSON / Object Value 的语言内解析结果，不是第三种 wire format。
- 依据：YAML 对自然语言长文本和 AI 局部编辑更友好，Git Extended Diff 需要唯一稳定文本基线；JSON 则是程序、SDK 与 Web 的成熟结构化交换格式。把二者都映射到同一 Object Value 可以同时满足 AI-first 编辑与普通 API 消费，而不建立两套对象模型或要求 Patch 携带 serializer selector。
- 备选：只提供 JSON；让 YAML / JSON 都成为 Patch base；自定义 `representation` request object；定义 KG OS-specific YAML subset / dialect。
- 取舍：KG OS 需要 deterministic canonical YAML renderer，并同时维护 JSON serializer；调用方以非 canonical 标准 YAML 表达同一值时可以写入，但下一次 `read` 会被规范化。HTTP 的具体 route、metadata envelope / header、CLI command 与 SDK method 仍属于 transport contract，不由本决定冻结。

### D35 公共 StateRef 直接复用 Lithograph Version Descriptor

- 决定：KG OS v1 的 StateRef 直接使用 `commit/<64-hex>`、`branch/<name>`、`tag/<name>`；所有 resolved State 一律返回 `commit/<64-hex>`。KG OS 不再设计 `state/...`、裸 Commit ID 或第二套 ref alias。
- 依据：Lithograph 已经冻结无歧义 version descriptor、Branch/Tag resolution 与 pinned Snapshot 语义；再包装只会增加转换而没有新的产品语义。
- 备选：新增 `state/<id>`；只返回裸 Commit ID；为 Branch / Tag 分别建立 KG OS JSON reference object。
- 取舍：KG OS wire 直接暴露 Lithograph 的版本 descriptor 形态，但仍只暴露 KG OS 允许的 Evolution 能力，不因此提升全部 Lithograph Version Procedure。

### D36 Object Ref 使用 canonical typed string，不建立 Resource ID 层

- 决定：Definition / Property / Domain 使用 `node:`、`relationship:`、`property:...#...`、`domain:` typed string；Knowledge 继续原样 `n:` / `r:`；Schema resource 使用 `graph-type:` / `constraint:` / `index:` + Lithograph public locator。component 使用 RFC 3986 percent-encoding；新增 Patch target 使用 `new:<kind>:<alias>`。
- 依据：Object Patch Git target、Domain `includes`、History filter 和 CLI/SDK 都需要紧凑可复制地址；typed string 可以在不建立持久 UUID 映射的前提下提供无歧义 kind/locator serialization，并复用标准 component escaping。
- 备选：每种 Object 使用不同 request shape；统一生成 KG OS UUID；把 JSON reference object 直接编码进 Git pathname。
- 取舍：名称型 Object rename 会改变 Ref，保持 D14/D19 已确认语义；Schema resource 仍依赖 Lithograph 提供 canonical public locator，KG OS 不填补底层缺口。

### D37 公共 capability 先冻结 transport-neutral logical wire

- 决定：Object / Graph / Evolution 先冻结本文 request/result/error logical shape；HTTP route、CLI command、SDK method 与具体 metadata carrier 只做 adapter mapping，不得改变字段语义或创建 adapter-specific capability。
- 依据：当前产品明确需要 CLI + Skill、SDK/Web 消费，但尚无要求把某一种 transport 变成 Kernel 产品语义；先冻结一个逻辑合同可以避免为 HTTP、CLI、SDK 维护三套接口定义。
- 备选：现在直接冻结 REST path / HTTP header；CLI 与 SDK 各自独立设计；等实现时再临时决定所有 wire shape。
- 取舍：后续 adapter 仍需各自 reference/usage 文档，但它们只能映射已确认逻辑合同，不能重新决定 StateRef、ObjectRef、pagination、typed value 或错误语义。

### D38 `__kgos_` 是 v1 reserved internal persistence namespace

- 决定：KG OS-owned internal graph / Schema identifiers 统一保留 exact UTF-8 prefix `__kgos_`，并使用本文冻结的 marker / Binding / Domain / Relationship / Property key 编码。调用方公共 mutation 不能创建或修改该 namespace；命中时返回 `RESERVED_IDENTIFIER`。这些名字是持久化格式的一部分，未来改名必须显式 migration。
- 依据：internal Ontology semantic graph 与调用方 Knowledge 共存在同一 Lithograph graph / Schema，需要一个确定、可在 mutation 前拒绝冲突且可由 `graphView` 隔离的持久化 namespace；如果只写“实现时任选内部名”，不同版本会无法稳定解释历史 State。
- 备选：每次启动随机前缀；仅依赖隐藏 element ID；把 internal semantics 放 SQLite side table；把具体名字长期留给实现自行选择。
- 取舍：调用方不能使用 `__kgos_` 开头的 Schema / graph identifier；换取 internal history、Graph View isolation、Schema bootstrap 与 migration 有稳定编码，同时不建立第二套数据库或绕过 Lithograph。

### D39 SQLite request atomicity 不隐藏 Lithograph intermediate State

- 决定：caller-owned SQLite transaction 可以把多个 Lithograph query 的持久化结果一起 commit / rollback，但不能把这些 query 已形成的 immutable Commit chain 当成“不可见内部步骤”。一个 KG OS Object Patch 若需要多个 Lithograph Commit，每个最终进入 DAG 的 intermediate Commit 都必须自身是 KG OS-valid State；如果某个 mixed graph / Schema / Index target change 无法满足该条件，就必须使用能在一个 Lithograph Commit 内表达它的公开能力，否则该操作保持依赖阻塞。
- 依据：outer transaction 解决 durability 原子性，不改写 Lithograph 的版本模型。允许 transaction 内先产生 missing Binding / dangling Binding 等 invalid Commit，再因为最终 Commit 合法就视为成功，会让 public History 在 transaction durable 后暴露 KG OS 无法解释的中间 State，并违反 D11/D30/D31。
- 备选：把 caller-owned transaction 内的 intermediate Commit 永久标成 KG OS-hidden；在 transaction commit 后 squash/rewrite history；直接 SQL 同时修改 Schema 与 internal graph；放宽 KG OS-valid State 不变量。
- 取舍：部分 Definition / Property create/rename/restructure 在 Lithograph one-Commit mixed mutation 能力可用前不能完整实现；换取 History 始终可解释、不建立第二套隐藏版本层，也不破坏 Lithograph immutable Commit DAG。

## 剩余依赖与工程合同

以下问题属于依赖阻塞、adapter mapping 或实现级持久化/编译设计，**不等于对应产品语义或 logical model 未设计**。判断是否真的出现新设计缺口时，必须先回看该主题所属章节和已确认 Decision；如果 logical state、ownership、identity、lifecycle 与公共 logical wire 已经明确，而只剩底层 projection、字符串常量、adapter carrier 或 operation mapping，则按工程问题处理，不重新向产品层提问。

| 已确认，不因本节重新打开 | 剩余依赖 / 工程工作 |
| --- | --- |
| Object logical state / owner、ObjectRef、canonical YAML / JSON、list/search/read/patch logical wire | Lithograph-owned `structure` inner projection 依赖 Lithograph public Schema introspection / locator |
| StateRef、Graph query/execute、Evolution read/mutation、pagination 与公共 error envelope | CLI / SDK / HTTP / Skill 的 adapter-specific route / method / metadata carrier 与 usage docs |
| Object Patch 的 Git Extended Diff、strict base、logical delta、derived migration、conflict/all-or-nothing 语义 | logical slot 到 Lithograph public Patch / Cypher / Schema operation 的实现映射与测试矩阵 |
| internal semantic graph 的职责、隔离、一致性不变量与 `__kgos_` v1 persistence encoding | bootstrap Schema、migration 与 consistency checker 的实现和验证 |

1. **Lithograph Schema projection dependency**：Definition / Property / Graph Type / Constraint / Index 的 `structure` 已确认只投影 Lithograph owner state，但其精确字段 shape 必须建立在 Lithograph public Schema introspection / locator contract 之上。若底层当前实现/设计仍未提供足够稳定的 canonical projection，KG OS 在该点等待 Lithograph，而不是自建第二套 Schema AST。
2. **Lithograph atomic mixed-Snapshot mutation dependency**：KG OS Definition / Property create、部分 rename / restructure 等操作需要在同一个 KG OS-valid State 中同时改变 Lithograph Schema 与 graph Binding / Knowledge。Lithograph 当前设计的 caller-owned outer transaction 能原子提交多个 query Commit，但不会隐藏或合并这些 Commit；而 canonical `patch.apply` 当前公开设计尚未冻结“调用方构造 AddNode / AddRelationship 时如何为全新 element 分配 identity / 返回 mapping”。在实现依赖这些操作前，Lithograph 必须提供一种**通用数据库能力**：能够通过公开合同在一个 Commit 内原子表达所需 mixed graph + Schema + Index target change，并为新 graph element 安全分配最终 identity（具体由 Lithograph 自己设计，不为 KG OS 特化）。KG OS 不以内部 allocator、预读 next-id、直接 SQL 或 invalid intermediate State 绕过这一依赖。
3. **Object Patch compiler implementation mapping**：本文已经冻结 parse → exact apply → Object Value → explicit delta → derived migration → logical-slot conflict → candidate validation → Lithograph public mutation 的语义；剩余是各 logical slot 到 Lithograph raw Patch / Cypher / Schema operation 的实现映射与测试矩阵，属于工程设计/实现，不再要求产品层逐项选择。映射时必须显式标记哪些 target change 依赖上一项 one-Commit mixed mutation 能力。
4. **Adapter contracts**：在实现 AI-facing CLI + Skill、SDK 与 Web adapter 时，把已确认 logical wire 映射成命令、method、HTTP route/header/streaming form，并建立 usage/reference 文档；adapter 不能重新定义能力语义。
5. **Human-facing Web**：Object / Graph / Evolution 的查看、管理和纠正交互可以在核心能力实现后按真实用户流程设计，不阻塞 Kernel / CLI / SDK 的数据与版本合同。

以上剩余项按真实实现依赖解决，不作为继续产品讨论的默认议题。只有实现证据表明现有产品合同无法唯一决定行为，并且不同答案会改变调用方可观察语义时，才升级为新的产品设计决定。

## 工程实现待办

实现顺序应建立在 Lithograph 对应公开能力真实可用的基础上，具体 readiness 始终从 Lithograph 仓库检查，不在这里复制状态。

其中有两个明确 gate：**Schema-backed Object read/write** 依赖 Lithograph public Schema introspection / canonical locator；**Definition / Property 等需要 Schema + graph 同 State 原子变化的 Object Patch** 还依赖 Lithograph one-Commit mixed-Snapshot mutation + new element identity allocation。gate 未满足时可以继续实现不依赖它的 Host、Domain、Knowledge Object、Graph/Evolution 等部分，但不能把被阻塞的 Schema-backed Object capability 声称为完成。

1. 建立最小 Lithograph host / client 边界，只暴露 KG OS 所需公开能力，不访问内部表；实现 D33 的 empty-database bootstrap boundary，未完成 KG OS-valid bootstrap 前不开放公共业务能力。
2. 按本文 `__kgos_` v1 internal physical encoding 实现 Ontology semantic graph：Definition / Property Binding Record、Domain / `INCLUDES`、同一 Lithograph Schema 中的 required internal Schema resources，以及基于 Lithograph `graphView` 的 Knowledge/Internal 隔离、双向 Binding coverage 与 Snapshot-scoped Schema Locator resolution。
3. 实现统一 Object Ref resolver 与 Object Value projection：按 D36 canonical Ref；先完成 Domain 与 Knowledge Node / Relationship；Lithograph Schema introspection / locator gate 满足后再完成 Graph Type / Constraint / Index 与 Definition / Property 的 `structure` projection。同一 State + Ref 产生同一 logical Object Value，并按 D34 renderer 稳定渲染为 canonical YAML 或等价 JSON，同时保持 internal graph 不可见。
4. 实现 Object `list` / `search` / `read`，支持大集合分页与轻量摘要；复杂 Knowledge discovery 不扩展 Object search，而是交给 Graph Cypher。
5. 实现 Object Patch compiler：canonical YAML + Git Extended Diff parser/application、标准 YAML parse → Object Value、Add / Update / Delete / Rename / Restructure、多 Object、request-local alias、strict base State / target Branch、direct Ref transition。Domain / ordinary Knowledge target change 可以先映射到现有 Lithograph public graph mutation；Definition / Property / mixed Schema+graph target change 必须等 one-Commit mixed-Snapshot mutation gate 满足后再开放。所有路径落实 dependency guard、D17 rename migration、Schema↔Binding 一一覆盖、semantic cleanup、合法 intermediate State 与 request all-or-nothing。
6. 实现 Graph `query` / `execute`：只读查询具有真实只读边界，writable execute 只修改普通 Knowledge graph data；两者固定到统一 State semantics、复用 Lithograph value encoding，并执行 Knowledge/Internal Graph View isolation。
7. 实现 Evolution 基础 Read：`overview`、State `get`、从明确 root 渐进读取 State DAG 的 `ancestry`、统一 `history`，以及 Branch / Tag list；保持 immutable State 与 mutable State Data / refs 的返回边界。
8. 实现 Evolution mutation：State create/data、Branch lifecycle、Tag lifecycle 与 whole-Knowledge-Base merge；不暴露 checkout，不复制尚无 KG OS use case 的 Lithograph Version Procedure。
9. 实现统一 History / Diff 的 Lithograph version 过滤与业务解释视图，支持 scope / Object Ref filter，覆盖公开 Ontology + Knowledge 并隐藏 internal semantic graph。
10. 在 Object / Graph / Evolution 公共合同稳定后，再建立 AI-facing CLI / Skill、SDK 与 Human-facing Web。

实现、验证、提交和推送必须分别按仓库真实状态报告；设计完成不代表 Lithograph 依赖能力或 KG OS 功能已经实现。
