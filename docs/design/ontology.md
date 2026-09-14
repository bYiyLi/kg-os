# Ontology 与 Definition

本文件是 KG OS **Ontology、Definition、Domain、semantic graph、Binding Record 与 Schema Locator** 的设计真源。Object 的统一表示与 mutation 合同由 [Object](object.md) 负责。

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

公开 Definition Object Value 的最终外层字段与 child Property 形态由 [Object Value 与 representation](object.md#object-value-与-representation) 统一冻结；本节只拥有聚合语义：结构约束实时来自 Lithograph，`title` / `description` 来自同一 State 的 KG OS semantic metadata，不保存第二份完整 Definition JSON。

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

Object Patch compiler 的正常 mutation path 只使用 Lithograph **标准 Cypher 25 + public explicit transaction**，不把 Lithograph Structural Patch 提升成第二套业务 mutation language。KG OS 先基于 immutable `baseState` 完成 textual Patch exact apply、logical delta、derived migration 与可在写锁外确定的 candidate validation；确认存在有效 target delta 后，以 target Branch 和 `expectedHead = baseState` 调用 Lithograph `tx_begin`，再在同一 transaction 中执行实现该目标所需的最少标准 Cypher graph / Schema / Constraint / Index mutation，最后一次 `tx_commit`。Lithograph 为新 Node / Relationship 分配的最终 identity 可以由后续同 transaction query 直接引用，KG OS 的 request-local alias 只负责把本请求的新 Object 映射到这些最终 owner-backed Ref。

因此一个成功且非 no-op 的 Object Patch 恰好产生一个新的 Lithograph Commit，也就是一个新的 KG OS State；任一 query、validation 或 commit 失败都不会留下 intermediate State。Lithograph `tx_begin(expectedHead)` 返回的 Branch-head mismatch 映射为 KG OS `STALE_BASE_STATE`。KG OS 不要求 Lithograph 为 Object Patch 增加专用语法，也不直接调用 `_lithograph_*` allocator / internal table。

KG OS 不把内部编排步骤提升为公共语义。操作成功后必须返回最终 resolved State identity；如果调用方直接寻址修改的 Object 因 rename / restructure 导致底层 identity replacement，还必须返回该 Object 的 Ref transition。Definition-level migration 派生出的海量 Relationship replacement 遵守 Object 章节的批量迁移规则，不承诺逐对 transition。调用方不需要理解 KG OS 如何把 logical delta 分解成具体 Cypher graph / Schema / Constraint / Index statements，也不接触底层 connection-local explicit transaction lifecycle。

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
