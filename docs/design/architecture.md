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
- 调用配置好的 Embedding Provider 把明确文本确定性转换为向量属于基础数据处理，不属于 Agent 认知决策；KG OS 不因此内置聊天模型、分类器或领域判断。

### 这不意味着

- 所有领域必须使用同一种固定模型。
- 所有内容必须提前静态定义。
- 核心理念会自动决定全部机制；具体已确认范围以下文为准。

## 目标架构

KG OS 是构建在 Lithograph 之上的 AI-first 高级知识库。KG OS 不再维护独立 Graph Engine、数据库约束执行引擎、Search Engine 或 Version Engine；这些底层数据库能力以 Lithograph 的公开合同为准。KG OS 自己拥有面向 AI 的 Ontology 逻辑 aggregate 与 compiler；这不是重复实现数据库。

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
| KG OS | Object / Graph / Evolution 公共能力、Ontology semantic metadata、Domain / Definition mutation aggregate、渐进式 Ontology read、Knowledge 的 Object 投影、OpenAI-compatible embedding service 编排与托管语义向量、Knowledge Base 状态演进的业务化解释、AI-facing CLI / Skill、Human-facing Web |
| Lithograph | Property Graph、Cypher 25、Graph Type / Schema、Constraint、Index、Search、immutable Commit DAG、Branch、Tag、Commit Data 与版本化状态操作 |
| SQLite | Lithograph 的运行宿主、持久化文件、connection、transaction 与基础数据库机制 |

KG OS 的设计必须建立在 Lithograph **公开能力**之上，而不是 Lithograph 的内部存储实现之上。公共能力与底层资源不要求一一对应：一次 Definition Patch 可以编排多个 Schema/Constraint/Index 变化，AI 不需要逐个组合它们。

Ontology 阅读提供全局 → 可选 Domain → Definition 的明确入口；编辑仍使用共享 Object read/patch。它不是新的全套 CRUD，也不是虚拟文件系统。具体字段与读取规则唯一见 [Ontology](ontology.md)。

### v1 运行时与技术分层

KG OS v1 保持早期已经确认的**本地 daemon + client-facing TypeScript/npm** 分层；引入 Lithograph 改变的是数据库核心归属，不改变这一上层运行结构。当前运行时结构为：

```text
AI / Agent
    │
    ▼
CLI / SDK / Web / Skill
    TypeScript / npm
    │
    │ HTTP
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

- **`kgosd` 是 KG OS v1 的本地统一访问入口。** 它承载 KG OS Kernel，并负责解析/加载 `config.toml` 中声明的 SQLite extensions、打开 Knowledge Base、维护所需 connection / transaction lifecycle，以及执行 KG OS 到 Lithograph 的 projection / compiler / consistency orchestration。Lithograph 自身也是通过这套通用 SQLite Extension lifecycle 提供，不内嵌进 KG OS binary。
- **SQLite Extension 只是一层运行时能力装配机制。** KG OS 不按“全文插件 / 向量插件 / Lithograph 插件”建立多套 loader；所有 loadable extension 都从 startup config 的 ordered source list 解析为本地 immutable artifact，再加载到每个 SQLite connection。Extension 可以提供 tokenizer、SQL function、virtual table 或其它 SQLite capability；通用 loader 不理解它们的业务语义。KG OS 在全部加载完成后单独验证 Lithograph public capability，因为 Lithograph 是 KG OS 的数据库基础，而不是因为配置项具有特殊 `kind`。Native execution/transaction 需要的 Lithograph ABI 也从同一批 resolved libraries 自动发现：必须恰好一个 library 暴露完整 ABI 1 symbol family；函数指针绑定不代替该 library 在目标 SQLite connection 上的正常 extension registration。
- **Full-text analyzer 是 `kgosd` 的全局运行配置。** Ontology 只声明 `type: fulltext` 及其真实 index name/targets/properties；per-index tokenizer/analyzer 不是 KG OS v1 的公共模型字段。KG OS 创建或因业务 Schema 变化重建 Full-text IndexDefinition 时使用当前 `[fulltext].analyzer`；已经存在的 Lithograph versioned IndexDefinition 保留自己创建时实际写入的 analyzer，不因 daemon restart 或配置变化被自动改写。第三方 tokenizer 的实现来自当前 SQLite connection 已加载的 extension；KG OS 不根据 analyzer 名字自动寻找或安装插件。
- **OpenAI-compatible Embeddings service 是 `kgosd` 的基础运行依赖。** v1 只支持这一种远端协议，不提供 provider plugin / selector；`base_url/model/dimensions/credential/similarity` 由当前 startup config 决定，Ontology 与 Knowledge Base 不保存第二份 provider/model 配置。KG OS 每次生成/刷新托管 embedding 或解析 SemanticText 时直接使用当前 daemon 的 `[embedding]`；它不解析/改写 Cypher，也不把远端模型服务提升为领域 Model 或 Agent。
- **v1 不提供 Full-text / Embedding 配置迁移。** `kgosd` 不把这两组 runtime config 持久化为 Knowledge Base fingerprint/generation，也不在打开已有库时比较“历史配置是否一致”。修改配置后 restart 会照常使用新值；KG OS 不自动重写历史、不批量重建旧索引/旧向量，也不因配置漂移拒绝启动。对已有库长期保持兼容的 analyzer / embedding space 是 operator 的运行配置责任。
- **Rust 层负责确定性核心。** `kgosd`、Kernel、Lithograph host/client、Object projection / Patch compiler、Evolution projection 与 KG OS consistency validation 使用 Rust 实现；Rust 层不重新实现 Lithograph 已拥有的 Graph Engine、Search Engine、Schema Engine 或 Version Engine。
- **TypeScript / npm 层负责上层产品面。** SDK、CLI、Web 以及 Skill / 生态集成以 TypeScript / npm 为主要交付形态；它们消费 KG OS 公共 logical contract，不直接打开 SQLite database、加载 Lithograph extension 或依赖 `_lithograph_*` 内部状态。
- **client ↔ `kgosd` 使用 HTTP，默认绑定本机 loopback。** configurable host / port、Web hosting、`~/.kgosd/` 目录与无认证边界由 [本地运行时](runtime.md) 唯一负责；具体 HTTP route / metadata carrier 仍由 adapter mapping 决定，但不能改变 Object / Graph / Evolution logical contract。

这套结构是对早期 KG OS 技术架构中 `CLI / SDK / Web / Skill → kgosd → database` 分层的延续。被后续 Lithograph 架构替换的是原先由 KG OS 自己维护的 GraphQLite / FTS5 / sqlite-vec 数据库实现，不是 `kgosd` 的本地服务职责或 Rust / TypeScript 的上下层边界。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和状态演进的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Lithograph 的公开查询与 Schema 语义继续以其冻结的 Cypher 25 compatibility profile 为准；Cypher 25 没有的 Ontology 语义由 KG OS 在上层表达，不修改 Lithograph 方言。`SemanticText` 是 KG OS transport/adapter 的 parameter marker，进入 Lithograph 前已经变成标准 Vector parameter，因此不构成 Cypher 方言扩展。

Lithograph 作为通用数据库继续完整支持 `VECTOR` value / Property / Index；KG OS v1 **有意不把 caller-owned Vector 提升为自己的 Ontology / Knowledge 数据类型**。KG OS-valid State 中，Vector 只能出现在 reserved KG OS-managed semantic materialization；caller-owned Schema type/constraint 或 public Knowledge Property value 出现 Vector 都违反 KG OS public profile。由于 Lithograph Graph Type 保持 open semantics，这个不变量不能只靠 Schema 声明保证；KG OS Graph write 必须在 durable commit 前基于 candidate / staged changes 验证实际变化。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 从 [Runtime](runtime.md#sqlite-extension-source-resolver) 冻结的 source resolver 得到本地 immutable artifacts，并按配置顺序加载 SQLite extensions；
- 只在 connection 初始化阶段通过 SQLite host C API 临时开启 extension loading，完成后立即关闭，不把 SQL `load_extension()` 能力暴露给业务 Cypher；
- 在所有 extension 加载完成后验证 Lithograph public initialization / ABI capability 与当前 Full-text analyzer runtime capability；
- 维护 Lithograph Native API 所要求的 connection / autocommit 生命周期，并通过 Lithograph public explicit transaction API 组织需要多个 Cypher execution 的单-State mutation。

KG OS 不把 caller-owned SQLite `BEGIN/COMMIT` 解释为自己的 Object Patch transaction，也不使用 SQLite 直接建立第二套知识、Ontology、Search、State 或 Evolution 业务表；KG OS 不绕过 Lithograph 用 SQL 修改图数据、Schema 或 version refs。

Extension source、下载缓存与 native library 都属于 daemon runtime，不属于 Knowledge Base State。修改 extension list 需要 restart 让新 connection environment 生效，但不会自动创建 Commit。由于 SQLite loadable extension 以 `kgosd` 的 OS 权限执行，`config.toml` 的 extension source 是 operator trust boundary；业务 API / Ontology / Graph 不能动态增加 native extension。

因此：**KG OS 使用 Lithograph 的数据库能力；SQLite 是 Lithograph 的宿主与事务基础，不是 KG OS 的业务数据接口。**

## Knowledge Base

一个 KG OS Knowledge Base 对应一个由 Lithograph 承载的知识世界。这里必须区分**公共能力面**与**State Snapshot 中的数据语义**：

```text
Public Capability
├── Object      → 读取/维护业务 aggregate；Ontology 另提供渐进阅读呈现
├── Graph       → 查询、遍历、搜索、集合级计算 / mutation
└── Evolution   → State / Branch / Tag / History / Diff / Merge

State Snapshot Data Semantics
├── Ontology    → 世界如何建模、模型是什么意思
└── Knowledge   → 世界中实际存在的 Node / Relationship / Property values
```

Full-text / Embedding 的 daemon 配置**不属于 State Snapshot**。KG OS 不在 State、State Data 或其它 reserved metadata 中保存配置副本、fingerprint 或 generation。Lithograph Full-text IndexDefinition 为了执行查询会正常保存它创建时的 analyzer；这属于数据库自身的 versioned IndexDefinition，而不是 KG OS 再持久化一份 runtime config。KG OS-managed Vector value 仍作为内部 materialization 随具体 State 保持与当次业务 mutation 一致，但生成它所用的 endpoint/model identity 不作为 State metadata 保存。caller-owned Vector Schema/Property value 仍违反 KG OS public profile。

因此修改 `config.toml` 后，已有历史 State 不会被自动修复或迁移：旧 Full-text IndexDefinition 继续保持旧 analyzer，已经存在的 managed vectors 也不会仅因 model 配置变化而批量重算；后续需要 analyzer / embedding 的新操作直接使用当前 daemon config。KG OS v1 不检测这些运行配置在时间上的语义兼容性。

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

Bootstrap 流程是：先执行 Lithograph `lithograph_init()` 得到空图 Root Commit 与 `main`，然后以 Root Commit 作为 `expectedHead` 开启一个 Lithograph explicit transaction，在其中通过标准 Cypher 25 建立当前 KG OS 版本要求的 reserved internal Schema resources、internal semantic graph bootstrap data 与当前 bootstrap 真正需要的 Constraint / Index definition，最后一次 `tx_commit` 产生第一个 **KG OS-valid State**。Bootstrap 完成前不开放 Ontology read / Object / Graph / 普通 Evolution mutation；任一 bootstrap query / validation / commit 失败都由 Lithograph explicit transaction 整体 abort，不退回直接 SQL、内部表写入或多个 intermediate Commit。

因此 v1 正常 bootstrap 不产生 durable intermediate Commit：Lithograph Root Commit 是第一个 KG OS-valid State 之前唯一预期存在的 pre-KGOS / invalid history 节点，只按 D31 的 Evolution 诊断规则查看。KG OS 公共业务能力从 explicit transaction 成功产生的第一个 KG OS-valid State 开始。未来若需要把已有 Lithograph database 导入 KG OS，必须另行设计显式 adoption / migration contract；v1 不做自动推断。
