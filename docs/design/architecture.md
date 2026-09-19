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
| KG OS | Object / Graph / Evolution 公共能力、Ontology semantic metadata、Domain / Definition mutation aggregate、渐进式 Ontology read、Knowledge 的 Object 投影、托管语义索引声明与运行配置映射、Knowledge Base 状态演进的业务化解释、AI-facing CLI / Skill、Human-facing Web |
| Lithograph | Property Graph、Cypher 25、Graph Type / Schema、Constraint、Index、Search、Managed Semantic embedding/cache、immutable Commit DAG、Branch、Tag、Commit Data 与版本化状态操作 |
| Embedding Provider extension | 实现 Lithograph 公开 Provider ABI，执行 OpenAI-compatible HTTP 请求、batching 与响应校验 |
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

- **`kgosd` 是 KG OS v1 的本地统一访问入口。** 它承载 KG OS Kernel，并负责解析 `KG_HOME`、读取该 profile 的 `config.toml` / `auth.json`、通过 Lithograph 公开 procedure 设置 embedding cache policy、加载 SQLite extensions、打开唯一 Knowledge Base `kgos.db`、维护所需 connection / transaction lifecycle，以及执行 KG OS 到 Lithograph 的 projection / compiler / consistency orchestration。Lithograph 自身也是通过这套通用 SQLite Extension lifecycle 提供，不内嵌进 KG OS binary。
- **SQLite Extension 只是一层运行时能力装配机制。** KG OS 不按“全文插件 / 向量插件 / Lithograph 插件”建立多套 loader；所有 loadable extension 都从 startup config 的 ordered source list 解析为本地 immutable artifact，再加载到每个 SQLite connection。Extension 可以提供 tokenizer、SQL function、virtual table 或其它 SQLite capability；通用 loader 不理解它们的业务语义。KG OS 在全部加载完成后单独验证 Lithograph public capability，因为 Lithograph 是 KG OS 的数据库基础，而不是因为配置项具有特殊 `kind`。Native execution/transaction 需要的 Lithograph ABI 也从同一批 resolved libraries 自动发现：必须恰好一个 library 暴露完整 ABI 1 symbol family；函数指针绑定不代替该 library 在目标 SQLite connection 上的正常 extension registration。
- **Full-text analyzer 是 `kgosd` 的全局运行配置。** Ontology 只声明 `type: fulltext` 及其真实 index name/targets/properties；per-index tokenizer/analyzer 不是 KG OS v1 的公共模型字段。KG OS 创建或因业务 Schema 变化重建 Full-text IndexDefinition 时使用当前 `[fulltext].analyzer`；已经存在的 Lithograph versioned IndexDefinition 保留自己创建时实际写入的 analyzer，不因 daemon restart 或配置变化被自动改写。第三方 tokenizer 的实现来自当前 SQLite connection 已加载的 extension；KG OS 不根据 analyzer 名字自动寻找或安装插件。
- **Embedding 交给 Lithograph 与 Provider extension。** `kgosd` 通过同一 SQLite extension loader 装配 Lithograph 和 `lithograph-openai-compatible`，把全局 `[embedding]` 默认值编译进新建 / 必须重建的 Semantic Index。已有索引使用自身 versioned 配置；Ontology 只声明文本字段和真实索引名。KG OS 不实现 Embeddings HTTP client、内部向量 Property、写入/合并后的向量刷新或独立 `cache.db`。配置与凭证见 [Runtime](runtime.md#embedding-配置与索引映射)，模型与查询分别见 [Ontology](ontology.md#托管语义索引) 和 [Graph](graph.md#graph-公共调用合同)。
- **v1 不提供 Full-text / Embedding 自动配置迁移。** runtime 默认值在 restart 时重新读取，只影响之后新建 / 必须重建的索引；旧索引和历史查询保留各自配置。配置本身随数据库 IndexDefinition 正常版本化，KG OS 不保存第二份 fingerprint/generation，不自动重写历史或全库重算。
- **Rust 层负责确定性核心。** `kgosd`、Kernel、Lithograph host/client、Object projection / Patch compiler、Evolution projection 与 KG OS consistency validation 使用 Rust 实现；Rust 层不重新实现 Lithograph 已拥有的 Graph Engine、Search Engine、Schema Engine 或 Version Engine。
- **TypeScript / npm 层负责上层产品面。** SDK、CLI、Web 以及 Skill / 生态集成以 TypeScript / npm 为主要交付形态；它们消费 KG OS 公共 logical contract，不直接打开 SQLite database、加载 Lithograph extension 或依赖 `_lithograph_*` 内部状态。
- **client ↔ `kgosd` 使用 HTTP，默认绑定本机 loopback。** configurable host / port、Web hosting、`KG_HOME`、single-token Bearer authentication 与 credential 边界由 [本地运行时](runtime.md) 唯一负责；所有 data/control API 调用都必须认证。具体业务 HTTP route / metadata carrier 仍由 adapter mapping 决定，但不能改变 Object / Graph / Evolution logical contract。

这套结构是对早期 KG OS 技术架构中 `CLI / SDK / Web / Skill → kgosd → database` 分层的延续。被后续 Lithograph 架构替换的是原先由 KG OS 自己维护的 GraphQLite / FTS5 / sqlite-vec 数据库实现，不是 `kgosd` 的本地服务职责或 Rust / TypeScript 的上下层边界。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和状态演进的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Graph 复用其公开 Cypher 与 database procedures；`db.index.semantic.*` 是 Lithograph 的通用扩展，不宣称属于标准 Cypher 25。KG OS 不再通过 `SemanticText` 将参数转换成 Vector，也不为语义查询解析 / 重写 Cypher。

Lithograph 作为通用数据库支持 Raw Vector value / Property / Index，Graph 原样传递其 Cypher 与值，不增加 KG OS 类型或语句限制。Ontology / Object v1 的简化模型仍不接受 caller-owned Vector；相关 compiler / consistency validation 只用于这些高层能力，不再作为 Graph 的执行或提交条件。Managed Semantic embedding 仍是非图属性派生数据，不进入 Commit。具体边界见 [Graph](graph.md#graph)。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 从 [Runtime](runtime.md#sqlite-extension-source-resolver) 冻结的 source resolver 得到本地 immutable artifacts，并按配置顺序加载 SQLite extensions；
- 只在 connection 初始化阶段通过 SQLite host C API 临时开启 extension loading，完成后立即关闭，不把 SQL `load_extension()` 能力暴露给业务 Cypher；
- 在所有 extension 加载完成后验证 Lithograph public initialization / ABI capability 与当前 Full-text analyzer runtime capability；
- 维护 Lithograph Native API 所要求的 connection / autocommit 生命周期，并通过 Lithograph public explicit transaction API 组织需要多个 Cypher execution 的单-State mutation。

KG OS 不把 caller-owned SQLite `BEGIN/COMMIT` 解释为自己的 Object Patch transaction，也不使用 SQLite 直接建立第二套知识、Ontology、Search、State 或 Evolution 业务表；KG OS 不绕过 Lithograph 用 SQL 修改图数据、Schema 或 version refs。

Embedding cache 也使用 Lithograph 的公开 procedure 管理，KG OS 不再为它另开 SQLite 文件或直接访问内部表。cache 与 HNSW 是派生数据，清理不改变 graph/schema/history；缓存位置、预算与预热边界由 [Runtime](runtime.md#embedding-result-cache)负责。

Extension source、下载缓存与 native library 都属于 daemon runtime，不属于 Knowledge Base State。修改 extension list 需要 restart 让新 connection environment 生效，但不会自动创建 Commit。由于 SQLite loadable extension 以 `kgosd` 的 OS 权限执行，`config.toml` 的 extension source 是 operator trust boundary；业务 API / Ontology / Graph 不能动态增加 native extension。

因此：**KG OS 使用 Lithograph 的数据库能力；SQLite 是 Lithograph 的宿主与事务基础，不是 KG OS 的业务数据接口。**

## Knowledge Base

一个 KG OS Knowledge Base 对应一个由 Lithograph 承载的知识世界。这里必须区分**公共能力面**与**State Snapshot 中的数据语义**：

```text
Public Capability
├── Object      → 读取/维护业务 aggregate；Ontology 另提供渐进阅读呈现
├── Graph       → Lithograph Cypher 查询 / 执行（按入口区分读写连接）
└── Evolution   → State / Branch / Tag / History / Diff / Merge

State Snapshot Data Semantics
├── Ontology    → 世界如何建模、模型是什么意思
└── Knowledge   → 世界中实际存在的 Node / Relationship / Property values
```

v1 的 runtime target 已冻结：**一个 `KG_HOME` 只拥有一个 Knowledge Base，物理 target 是 `$KG_HOME/kgos.db`；一个 active `kgosd` 只打开这个库。** `KG_HOME` 未设置时默认 `~/.kgosd`。切换 Knowledge Base 等价于切换整个 `KG_HOME` profile，而不是在一个 daemon 内选择 name/alias；因此 v1 不建立 Knowledge Base registry、selector、`--base` 或 `base use`。`KG_HOME`、`config.toml`、`auth.json`、extension artifact cache、lock 与 logs 都是 runtime/profile 状态，不进入 State Snapshot；Lithograph 的 embedding cache 位于数据库内部派生区，同样不是 Snapshot 数据。

`config.toml` 文件本身不属于 State Snapshot。Full-text analyzer 与 Semantic provider/config/dimensions/similarity 则由 Lithograph 正常保存为 versioned IndexDefinition；KG OS 不在 State Data 或 reserved metadata 里再存一份运行配置。正文与索引定义随 State 演进，生成的 embedding 与 cache 不随 Commit 演进。

修改 `config.toml` 后，已有索引与历史 State 不被自动修复或迁移。新建 / 必须重建的索引使用当前默认值；后续查询使用所选 State 中的实际索引配置。数据库不快照外部模型或扩展资源，部署者仍需维护这些运行依赖的语义稳定性。

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

因此 v1 正常 bootstrap 不产生 durable intermediate Commit：Lithograph Root Commit 是第一个 KG OS-valid State 之前唯一预期存在的 pre-KGOS / invalid history 节点。高层能力按 [Ontology 一致性规则](ontology.md#binding-record-与-schema-locator)处理它；bootstrap 完成后的 Graph 可按 [D59](decisions.md#d59-cypher-passthrough)直接访问底层历史，不受“仅 Evolution 诊断”的旧限制。KG OS 公共业务能力从 explicit transaction 成功产生的第一个 KG OS-valid State 开始。未来若需要把已有 Lithograph database 导入 KG OS，必须另行设计显式 adoption / migration contract；v1 不做自动推断。
