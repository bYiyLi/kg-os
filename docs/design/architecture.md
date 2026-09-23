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

KG OS v1 使用 **Go 实现 `kgosd`、Kernel 与 `kg` CLI**；TypeScript / npm 继续用于 SDK 与浏览器 Web。Web 构建产物随 `kgosd` 一起交付，由同一 daemon、同一 configured host/port 提供页面、静态资源与 API；浏览器是客户端，不对应另一个 Web 服务。当前运行时结构为：

```text
AI / Agent / Skill → kg CLI (Go) / SDK (TypeScript) ── HTTP ──┐
Browser ─────────── Web (TypeScript) + API HTTP ──────────────┤
                                                             ▼
kgosd — Go，本地服务
    ├── net/http API
    ├── 内置 Web 静态资源（同进程、同端口）
    ├── KG OS Kernel（Go）
    │   ├── Object
    │   ├── Graph
    │   └── Evolution
    ├── Ontology / Knowledge semantics
    ├── projection / compiler / consistency
    └── database/sql + go-sqlite3
             │
             ▼
         SQLite connection
             │
      ┌──────┴────────┐
      ▼               ▼
  Lithograph      SQLite extensions
      │               │
      └──── Embedding Provider / FTS tokenizer
```

- **`kgosd` 是 KG OS v1 的本地统一访问入口。** 它承载 Kernel，并负责解析 `KG_HOME`、读取该 profile 的 `config.toml` / `auth.json`、解析并加载 SQLite extensions、打开唯一 Knowledge Base `kgos.db`、维护读写 connection / transaction lifecycle，以及执行 KG OS 到 Lithograph 的 projection / compiler / consistency orchestration。Lithograph 自身也通过通用 SQLite Extension lifecycle 提供，不静态内嵌为 KG OS 私有数据库模块。
- **Go 是 daemon / Kernel / CLI 的服务端实现基线。** HTTP 使用标准库 `net/http`；SQLite host 使用 `database/sql` + `github.com/mattn/go-sqlite3`，通过 CGO 运行 driver 自带的 bundled SQLite amalgamation并加载 Lithograph。构建固定启用 `sqlite_fts5`，不使用 `libsqlite3` 系统 SQLite，也不得启用 `sqlite_omit_load_extension`。请求取消、daemon stop 与长查询取消沿 `context.Context` 传播到 driver / SQLite interrupt；不得为数据库执行另建 Node worker/child-process IPC、FFI shim 或第二套 private SQLite runtime。
- **SQLite Extension 只是一层运行时能力装配机制。** KG OS 不按“全文插件 / 向量插件 / Lithograph 插件”建立多套 loader；所有 loadable extension 都从 startup config 的 ordered source list 解析为本地 immutable artifact，每项显式提供 init `entrypoint`，再按原顺序加载到每个 SQLite connection。Extension 可以提供 tokenizer、SQL function、virtual table 或其它 SQLite capability；通用 loader 不理解业务语义。全部加载完成后再通过公开 SQL probe 验证 Lithograph 与当前 Full-text / Managed Semantic runtime capability。
- **Lithograph v0.3.0 对 KG OS 只暴露 SQL execution surface。** 完整结果使用 `lithograph()`，真正 streaming 使用 `lithograph_rows()`，校验使用 `lithograph_validate(query)`；多 execution 单 Commit 使用 `lithograph_tx_begin() -> lithograph()/lithograph_rows()* -> lithograph_tx_commit()/abort()`。KG OS 不绑定 application-facing Native query ABI、不取得 `sqlite3*`、不维护 `lithograph_tx_execute()` compatibility path。
- **Full-text analyzer 是 Knowledge Base 初始化配置。** Ontology 只声明 `type: fulltext` 及其真实 index name/targets/properties；安装时必须显式选择 `[fulltext].analyzer`，并提示初始化后禁止修改。KG OS 创建或因业务 Schema 变化重建 Full-text IndexDefinition 时使用当前配置；已经存在的 versioned IndexDefinition 保留创建时 analyzer。
- **Embedding 交给 Lithograph 与 Provider extension，persistent text -> Vector cache 由 Provider 自己拥有。** `kgosd` 通过同一 SQLite extension loader 装配 Lithograph 和 `lithograph-openai-compatible`；`[embedding]` 同样是必须完整提供、初始化后禁止修改的配置，`[cache]` 必须显式提供 path / budget 且始终启用。KG OS 把这些值编译进新建 / 必须重建的 Semantic Index `providerConfig`。Provider cache 使用独立 SQLite database，不写 Lithograph `main`；Lithograph 继续拥有 Raw Vector、HNSW 与 query-local/TEMP Semantic materialization。KG OS 不实现 Embeddings HTTP client或缓存算法。
- **v1 不提供 Full-text / Embedding 配置版本管理或迁移。** “初始化后禁止修改”是安装合同，不通过 fingerprint、历史配置副本、修改检测或启动拒绝来强制；已有索引和历史查询继续使用各自 versioned 配置，KG OS 不自动重写历史或全库重算。
- **CLI / SDK / 浏览器 Web 消费同一公共合同。** `kg` CLI 使用 Go；SDK 与 Web 使用 TypeScript。语言不同不改变 client ↔ daemon 的 HTTP 边界，也不建立第二套产品语义。客户端不直接打开 SQLite、加载 Lithograph 或依赖 `_lithograph_*` 内部状态。Web 构建产物进入 daemon 交付物，不拆成独立部署服务。本机 `kg` 额外拥有 `doctor / install / Runtime ensure`：doctor只诊断，install建立完整 profile，业务命令在 daemon stopped 时自动拉起 Runtime；这些本地职责不形成数据库旁路。
- **client ↔ `kgosd` 使用 HTTP，标准安装推荐绑定本机 loopback。** configurable host / port、Web hosting、`KG_HOME`、single-token Bearer authentication 与 credential 边界由 [本地运行时](runtime.md)唯一负责；所有 API 调用都必须认证。v1 不再建立独立 daemon-control HTTP namespace。

[D65](decisions.md#d65-go-runtime) 替换 D63 的服务端/CLI TypeScript 语言决定，但保留“单 daemon + 内置 Web”的交付边界；[D66](decisions.md#d66-lithograph-v030-sql-only) 替换旧 Native query / Core embedding-cache 接入假设。

## Lithograph 边界

### 只复用公开能力

KG OS 对知识、Ontology 结构、查询、搜索和状态演进的操作统一通过 Lithograph 公开接口完成。KG OS 不直接读写 `_lithograph_*` 内部对象，也不把 Lithograph 的内部物理结构提升为 KG OS 产品合同。

KG OS 不要求 Lithograph 增加 KG OS 专用语法、Schema 字段或 Annotation。Graph 复用其公开 Cypher 与 database procedures；`db.index.semantic.*` 是 Lithograph 的通用扩展，不宣称属于标准 Cypher 25。KG OS 不再通过 `SemanticText` 将参数转换成 Vector，也不为语义查询解析 / 重写 Cypher。

Lithograph 作为通用数据库支持 Raw Vector value / Property / Index，Graph 原样传递其 Cypher 与值，不增加 KG OS 类型或语句限制。Ontology / Object v1 的简化模型仍不接受 caller-owned Vector；相关 compiler / consistency validation 只用于这些高层能力，不再作为 Graph 的执行或提交条件。Managed Semantic embedding 仍是非图属性派生数据，不进入 Commit。具体边界见 [Graph](graph.md#graph)。

### SQLite 只作为 Host

KG OS 可以为承载 Lithograph 做最小 SQLite host 工作，例如：

- 打开／关闭 database connection；
- 从 [Runtime](runtime.md#sqlite-extension-source-resolver) 冻结的 source resolver 得到本地 immutable artifacts，并按配置顺序加载 SQLite extensions；
- 只在 connection 初始化阶段通过 SQLite 驱动的 extension-loading API 临时开启加载，完成后立即关闭，不把 SQL `load_extension()` 能力暴露给业务 Cypher；
- 在所有 extension 加载完成后验证 Lithograph v0.3.0 public SQL capability、当前 Full-text analyzer 与 Embedding Provider registration；
- 维护同一 SQLite connection / autocommit 生命周期；普通 execution 使用 `lithograph()` / `lithograph_rows()`，需要多个 Cypher execution 的单-State mutation 使用 `lithograph_tx_begin/commit/abort` lifecycle，不能另套 SQLite `BEGIN/COMMIT`。

KG OS 不把 caller-owned SQLite `BEGIN/COMMIT` 解释为自己的 Object Patch transaction，也不使用 SQLite 直接建立第二套知识、Ontology、Search、State 或 Evolution 业务表；KG OS 不绕过 Lithograph 用 SQL 修改图数据、Schema 或 version refs。

Embedding Provider cache 不属于 Lithograph storage。KG OS 只把显式 `[cache]` 配置编译进 OpenAI-compatible Provider 的 versioned `providerConfig.cache`；Provider 自己打开独立 SQLite cache file。KG OS 不读写 Provider cache schema，Lithograph 只拥有 graph/vector search 与 TEMP/HNSW derived state；具体路径和预算由 [Runtime](runtime.md#embedding-result-cache)负责。

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

v1 的 runtime target 已冻结：**一个 `KG_HOME` 只拥有一个 Knowledge Base，物理 target 是 `$KG_HOME/kgos.db`；一个 active `kgosd` 只打开这个库。** `KG_HOME` 未设置时默认 `~/.kgosd`。切换 Knowledge Base 等价于切换整个 `KG_HOME` profile，而不是在一个 daemon 内选择 name/alias；因此 v1 不建立 Knowledge Base registry、selector、`--base` 或 `base use`。`KG_HOME`、`config.toml`、`auth.json`、extension artifact cache、lock 与 logs 都是 runtime/profile 状态，不进入 State Snapshot；Provider-owned embedding cache 位于 `$KG_HOME/cache/`（或 operator 显式配置的路径）并与 `kgos.db` 隔离，同样不是 Snapshot 数据。

`config.toml` 文件本身不属于 State Snapshot。Full-text analyzer 与 Semantic provider/config/dimensions/similarity 则由 Lithograph 正常保存为 versioned IndexDefinition；KG OS 不在 State Data 或 reserved metadata 里再存一份运行配置。正文与索引定义随 State 演进，生成的 embedding 与 cache 不随 Commit 演进。

`[fulltext]` / `[embedding]` 在安装时被明确标为初始化后禁止修改；KG OS 不保存初始化副本来比较当前文件，也不自动修复、迁移或拒绝人工修改后的配置。后续查询始终使用所选 State 中实际保存的 IndexDefinition；数据库不快照外部模型或扩展资源。

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

这里的“空 Lithograph Root State”指 fresh initialized baseline：`branch/main` 仍指向 Root Commit、没有其它 Branch / Tag，且 Root graph 与 Schema 为空。任何**当前 Branch / Tag 可达**的非 Root history 都会表现为额外 ref 或非 Root head，因此不满足该 baseline。已经失去全部 Branch / Tag 的 orphan Commit 不阻塞 bootstrap：Lithograph v0.3.0 的 public SQL contract 没有只读的全库 orphan inventory，而 KG OS 禁止读取其内部表；KG OS 也不会为这些 orphan Commit 建 Binding、移动 ref 或把它们宣称为 KG OS-valid State。**这条严格条件只决定“是否允许自动 bootstrap”**。

打开已有数据库时，KG OS 先解析并验证 `branch/main` 当前 head；只要该 Snapshot 满足当前 KG OS-valid consistency invariants，就按已有 KG OS Knowledge Base 打开，不要求启动时扫描并证明所有历史 Commit、其它 Branch 或 Tag 都有效。consistency-invalid 历史仍可按 Ontology / Evolution / Graph 已定义的边界存在和诊断。只有 `main` head 不是 KG OS-valid、同时数据库又不满足上面的 fresh Root baseline 时，才属于 adoption / migration 边界并拒绝自动 bootstrap。这样不会把历史中的坏 Snapshot 当成启动阻塞，也不会把任意已有 Lithograph history静默收编。

KG OS v1 **不保存 provenance sentinel** 来证明“这个库过去一定由 kgosd 创建”。因此一个 Snapshot 是否属于可打开的 KG OS State 只由当前冻结的 on-disk invariants决定：如果外部工具已经显式构造出与当前 KG OS persistence contract 完全等价的 reserved Schema / Binding / consistency state，KG OS 无需猜测或改写即可验证并打开它；这属于 validation，不是 adoption。所谓禁止自动 adoption，是指 KG OS 不会面对任意既有 graph/Schema 自动生成 Binding、推断 Domain/description、重写历史或补齐内部结构使其“变成 KG OS”。

Bootstrap 流程是：先执行 Lithograph `lithograph_init()` 得到空图 Root Commit 与 `main`，然后以 Root Commit 作为 `expectedHead` 开启一个 Lithograph explicit transaction，在其中通过标准 Cypher 25 建立 [Ontology 冻结的 reserved Graph Type profile](ontology.md#semantic-graph-的内部边界)，最后一次 `tx_commit` 产生第一个 **KG OS-valid State**。v1 初始 bootstrap 不额外创建 standalone internal Constraint / Index；所需 Property type / NOT NULL / endpoint legality由 reserved Graph Type本身表达，其余 Binding/Domain invariant由 KG OS consistency validation负责。bootstrap transaction 不设置调用方 `author/message`，也不写 State Data，因此首个 KG OS-valid Commit 的 `author/message` 为 `null`；它只表示系统初始化，不冒充某个用户操作。Bootstrap 完成前不开放 Ontology read / Object / Graph / 普通 Evolution mutation；任一 bootstrap query / validation / commit 失败都由 Lithograph explicit transaction 整体 abort，不退回直接 SQL、内部表写入或多个 intermediate Commit。

空 Ontology 的 bootstrap **不创建 sentinel、版本标记、默认 Domain、Definition Binding 或 Property Binding Node**。在没有调用方 Definition / Domain 时，internal semantic graph 可以为空；第一个 KG OS-valid State 由当前版本要求的 reserved internal Schema 与一致性规则共同判定，不依赖一个额外“已初始化”数据节点。Domain / Binding 只在真实 Ontology 对象出现时创建。未来 internal persistence format 需要迁移时必须另行建立显式 migration contract，不能提前把未使用的版本节点写进当前模型。

因此 v1 正常 bootstrap 不产生 durable intermediate Commit：当前 `main` 的 Root Commit 是第一个 KG OS-valid State 之前唯一允许自动承接的 **ref-reachable** pre-KGOS / invalid history 节点。无 ref orphan Commit 不改变 bootstrap target，也不会被 KG OS 自动补 Binding；若调用方显式持有其 immutable Commit descriptor，底层 Graph passthrough 仍可按 Lithograph 合同寻址它，这不等于 KG OS 自动 adoption。高层能力按 [Ontology 一致性规则](ontology.md#binding-record-与-schema-locator)处理目标 State；bootstrap 完成后的 Graph 可按 [D59](decisions.md#d59-cypher-passthrough)直接访问底层历史，不受“仅 Evolution 诊断”的旧限制。KG OS 公共业务能力从 explicit transaction 成功产生的第一个 KG OS-valid State 开始。未来若需要把已有 Lithograph graph / Schema history 导入 KG OS，必须另行设计显式 adoption / migration contract；v1 不做自动推断。
