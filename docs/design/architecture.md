# 架构与 Knowledge Base

本文件是 KG OS **系统架构、底层责任边界与 Knowledge Base 生命周期**的设计真源。设计总入口见 [design.md](../design.md)，产品定义见 [README](../../README.md)。

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

### v1 运行时与技术分层

KG OS v1 保持早期已经确认的**本地 daemon + client-facing TypeScript/npm** 分层；引入 Lithograph 改变的是数据库核心归属，不改变这一上层运行结构。当前运行时结构为：

```text
AI / Agent
    │
    ▼
CLI / SDK / Web / Skill
    TypeScript / npm
    │
    │ client ↔ daemon transport
    ▼
kgosd
    Rust local daemon
    ├── KG OS Kernel
    │   ├── Object
    │   ├── Graph
    │   └── Evolution
    ├── Ontology / Knowledge semantics
    ├── projection / compiler / consistency
    └── Lithograph host / client
             │
             ▼
         Lithograph
             │
             ▼
           SQLite
```

- **`kgosd` 是 KG OS v1 的本地统一访问入口。** 它承载 KG OS Kernel，并负责打开 Knowledge Base、加载 Lithograph extension、维护所需 connection / transaction lifecycle，以及执行 KG OS 到 Lithograph 的 projection / compiler / consistency orchestration。
- **Rust 层负责确定性核心。** `kgosd`、Kernel、Lithograph host/client、Object projection / Patch compiler、Evolution projection 与 KG OS consistency validation 使用 Rust 实现；Rust 层不重新实现 Lithograph 已拥有的 Graph Engine、Search Engine、Schema Engine 或 Version Engine。
- **TypeScript / npm 层负责上层产品面。** SDK、CLI、Web 以及 Skill / 生态集成以 TypeScript / npm 为主要交付形态；它们消费 KG OS 公共 logical contract，不直接打开 SQLite database、加载 Lithograph extension 或依赖 `_lithograph_*` 内部状态。
- **client ↔ `kgosd` 的具体 transport 不是 Kernel 产品语义。** HTTP route、metadata carrier、streaming form、本地进程发现与其它 transport 细节由 adapter / runtime 工程合同决定，但所有 transport 必须映射到同一 Object / Graph / Evolution logical contract，不能形成第二套行为。

这套结构是对早期 KG OS 技术架构中 `CLI / SDK / Web / Skill → kgosd → database` 分层的延续。被后续 Lithograph 架构替换的是原先由 KG OS 自己维护的 GraphQLite / FTS5 / sqlite-vec 数据库实现，不是 `kgosd` 的本地服务职责或 Rust / TypeScript 的上下层边界。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和状态演进的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Lithograph 的公开查询与 Schema 语义继续以其冻结的 Cypher 25 compatibility profile 为准；Cypher 25 没有的 Ontology 语义由 KG OS 在上层表达，不修改 Lithograph 方言。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 加载 Lithograph extension；
- 维护 Lithograph Native API 所要求的 connection / autocommit 生命周期，并通过 Lithograph public explicit transaction API 组织需要多个 Cypher execution 的单-State mutation。

KG OS 不把 caller-owned SQLite `BEGIN/COMMIT` 解释为自己的 Object Patch transaction，也不使用 SQLite 直接建立第二套知识、Ontology、Search、State 或 Evolution 业务表；KG OS 不绕过 Lithograph 用 SQL 修改图数据、Schema 或 version refs。

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

State Data、Branch 与 Tag 属于 State Space / Evolution 的 sidecar / ref 状态，不是 State Snapshot 内的第三种业务数据；它们的详细可变性、读取与历史边界由 [Evolution](evolution.md) 唯一负责。需要被 versioning、Cypher query、Constraint、Diff 或 Merge 共同管理的业务事实仍必须保存为 Ontology / Knowledge。

调用方定义领域模型。KG OS Kernel 不预定义 `Person`、`Company`、`works_at` 等领域概念，也不执行理解、分类、提炼或建模决策；这些认知工作仍属于外部 Agent / Skill。

### Knowledge Base bootstrap

KG OS v1 只负责初始化自己创建或明确以**空 Lithograph Root State**交给 KG OS 的 Knowledge Base，不自动接管一个已经包含调用方 graph / Schema history 的任意 Lithograph database。自动 adoption 会要求 KG OS 猜测已有 Schema element 与 semantic Binding / Domain 的业务意图，属于独立的数据导入 / 迁移问题，不是普通启动流程。

Bootstrap 流程是：先执行 Lithograph `lithograph_init()` 得到空图 Root Commit 与 `main`，然后以 Root Commit 作为 `expectedHead` 开启一个 Lithograph explicit transaction，在其中通过标准 Cypher 25 建立当前 KG OS 版本要求的 reserved internal Schema resources、internal semantic graph bootstrap data 与当前 bootstrap 真正需要的 Constraint / Index definition，最后一次 `tx_commit` 产生第一个 **KG OS-valid State**。Bootstrap 完成前不开放 Object / Graph / 普通 Evolution mutation；任一 bootstrap query / validation / commit 失败都由 Lithograph explicit transaction 整体 abort，不退回直接 SQL、内部表写入或多个 intermediate Commit。

因此 v1 正常 bootstrap 不产生 durable intermediate Commit：Lithograph Root Commit 是第一个 KG OS-valid State 之前唯一预期存在的 pre-KGOS / invalid history 节点，只按 D31 的 Evolution 诊断规则查看。KG OS 公共业务能力从 explicit transaction 成功产生的第一个 KG OS-valid State 开始。未来若需要把已有 Lithograph database 导入 KG OS，必须另行设计显式 adoption / migration contract；v1 不做自动推断。
