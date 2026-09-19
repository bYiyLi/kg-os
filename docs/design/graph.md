# Knowledge 与 Graph

本文件是 KG OS **Knowledge 数据模型以及 Graph query / execute 能力边界**的设计真源。底层数据库行为以 Lithograph 公开合同为准。

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

Knowledge 的 Property、Label、Relationship Type、端点、类型和查询语义都以 Lithograph 当前 Snapshot 中的真实 graph data 为准。Knowledge Object Value / canonical YAML 只投影这个 Node / Relationship 自己的 graph state；Label / Relationship Type 本身就是对当前 Ontology Structure 的名称引用，但 KG OS 不把对应 Definition 的 `title` / `description` 等可变语义复制进 Knowledge Object representation。AI 需要理解这些 Label / Type 时，使用对应 Definition Ref 通过 Ontology 渐进读取获取聚合详情。Node / Relationship 的 logical model 与公共 body shape 已由本文确认；Ontology 交互变化不重新设计 Knowledge model，也不把实例包装成 Markdown 文件。

## Graph

Graph 是 KG OS 的通用 Cypher 执行入口，直接使用 Lithograph 支持的 Cypher 与 procedure。KG OS 不按语句内容限制能力，不维护允许或禁止的语句清单，也不解析、重写 Cypher。

```text
graph query   → 只读连接 → Lithograph
graph execute → 读写连接 → Lithograph
```

调用方通过 `query` / `execute` 选择读写入口；KG OS 据此选择连接，不根据关键字猜测语句类型。`query` 中误提交写语句时，由底层只读执行保证拒绝，不自动改走读写连接。`execute` 可以执行底层支持的读或写语句。只读连接与内部缓存写入的衔接见 [Runtime](runtime.md#cypher-执行连接)。

`LOAD CSV`、Schema `SHOW` / DDL、Version Procedure、全文、向量、结构化条件、图遍历等都直接遵守 Lithograph 的语法、参数、事务与错误合同。KG OS 不再以“只能查询 Knowledge”“只有 Embedding Provider 可以访问外部资源”等理由拦截它们。文件与网络访问使用 `kgosd` 宿主进程的实际权限；读连接不等于禁止读取文件或调用网络服务。原样执行 Cypher 不等于提供 raw SQL 或直接访问 SQLite 内部表的接口。

公共 Graph 不注入排除 `__kgos_` 的 Knowledge `graphView`，不在参数、结果或提交前按 Vector / reserved identifier 增加 KG OS 检查。否则仍会限制有效 Cypher，或使底层 Schema / Version Procedure 因固定 Graph View 而无法执行。Object / Ontology 的聚合编辑、内部数据投影和一致性检查仍由各自合同负责，不反向变成 Graph 的执行条件。

Semantic query 可能产生模型 I/O，`LOAD CSV` 可能产生文件或网络 I/O，因此公共 Graph 使用普通 Native execution，不使用会拒绝这些能力的 `lithograph_rows()`。KG OS 负责认证、request / parameter 解码、连接与执行上下文、结果传输；语句解析、读写判定、procedure 行为、数据库约束与执行错误由 Lithograph 负责。具体接入证据见 [integration readiness](implementation.md#managed-semantic-integration-readiness)。

KG OS-managed Full-text 默认使用目标 State 的实际 versioned IndexDefinition 中的 analyzer；全局 `[fulltext].analyzer` 只用于创建或因业务 Schema 变化重建索引。调用方在 Cypher 中显式传入底层 `{analyzer: ...}` 时原样执行，不修改全局配置或已有 IndexDefinition。KG OS 不为此增加解析或重写逻辑。

普通 Knowledge Node / Relationship 的 `elementId()` `n:<id>` / `r:<id>` 可直接作为 Object Ref 使用，无需转换。但 Graph 现在也能返回内部 semantic graph element；这些 element 不因此成为公共 Knowledge Object。Schema / Domain 等其它 Object Ref 不是 Knowledge elementId。Scalar、Map、List、Path、Vector 与 aggregate 等查询值也不会自动成为 Object。

`execute` 直接使用 Lithograph 的执行和提交语义，不再附加 KG OS public-profile candidate validation。普通 graph / schema mutation 的原子性、Branch CAS 与 Commit 行为由底层保证；Version Procedure 与 `CALL ... IN TRANSACTIONS` 等按各自底层合同执行，KG OS 不把任意 Cypher 包装成“恰好一个 Commit”或统一 all-or-nothing 事务，也不追加隐藏修复 Commit。

保存 semantic source / target membership 只写普通 graph data，不触发 KG OS embedding refresh。Semantic query、cache maintenance 与 graph mutation 能否共用 execution / transaction，由 Lithograph 判定；KG OS 不在执行前扫描语句或重复实现这些规则。

Ontology / Object / Evolution 仍提供模型聚合、Patch 和版本操作的专用交互，但不是禁止调用对应 Cypher 的理由。直接通过 Graph 修改 Schema、Binding、内部图或 Raw Vector，可能产生不能按 KG OS 高层模型解释的 Snapshot；Graph 仍可按底层合同执行，高层能力按 [Ontology 一致性规则](ontology.md#binding-record-与-schema-locator)报告错误，不自动补 Binding、修复数据或回滚已完成的底层提交。

Graph `query` / `execute` 继续使用 State / Branch 上下文，不建立 `knowledgeVersion` 或另一套数据身份；它们不继承 Object Patch 的 textual Patch / strict `baseState` 规则。

### Graph 公共调用合同

Graph parameter / result 直接复用 Lithograph JSON v1 encoding，包括底层支持的 Node、Relationship、Temporal、Point、UUID、Vector 等值。KG OS 不再对 Graph 单独裁剪 Vector 类型。托管语义查询仍只需要普通 String：

```json
{"query":"如何设计知识图谱"}
```

对应 Cypher：

```cypher
CALL db.index.semantic.queryNodes('document_semantic', $query, {limit: 10})
YIELD node, score
RETURN node.title, node.content, score
```

Relationship 使用 `db.index.semantic.queryRelationships`，返回 `relationship, score`。`limit` 为必填非负 Integer，`skip` 缺省为 `0`；其它参数与错误遵守 Lithograph procedure contract。这段示例返回调用方选择的业务值与 score，不要求调用方先生成向量。

不提供 `SemanticText` / `$semantic` 参数预处理。含 `$semantic` key 的普通 Map 没有特殊意义，把它传给要求 String 的 procedure 会按底层参数类型错误失败。全文和语义检索可以复用同一个 String 参数；需要 Raw Vector 的调用使用 Lithograph 自身的值编码与接口。

逻辑 request / response：

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

`query.at` 必填：在 operation 开始时解析并 pin immutable State。Semantic query 使用该 Snapshot 的 IndexDefinition 和 provider/config，不以当前 `[embedding]` 覆盖历史配置。KG OS 不生成 query Vector，也不保存第二份配置 fingerprint。

`execute.branch` 必填，用于选择本次调用的默认 Branch 上下文；没有 `baseState`。procedure 若在语句内部显式选择其它 target，按 Lithograph 合同执行，KG OS 不检查或改写它。adapter 必须用公开连接 / execution 能力绑定上下文，不能把 `branch` / `graphView` 等 options 无条件附加到不接受它们的 procedure，也不能依赖其它请求遗留的 checkout。该映射需通过 [集成验收](implementation.md#managed-semantic-integration-readiness)。`author/message` 的适用性与结果 `state/counters` 使用底层公开执行合同；不能为没有生成 Commit 的操作虚构新 State。

普通 graph / Full-text read 不调用 embedding service。Semantic query 必须能在当前 connection 解析所需 Provider，即使 cache 已热也不能缺少该扩展；远端服务仅在需要计算缺失 embedding 时被调用。Provider failure / cancellation 不能变成遗漏部分候选的“成功 top-k”。错误分类见 [公共合同](contracts.md#公共错误合同)。

联合检索的执行顺序由 Lithograph 决定。`YIELD` 后追加的 `WHERE` 只过滤 procedure 已返回的候选，不承诺过滤范围内的 top-k；不因取消 KG OS 限制就声称底层新增过滤能力。

### 托管向量的结果边界

Lithograph Semantic Index 的 embedding 是非图属性派生数据；`RETURN n`、`properties(n)`、`keys(n)`、projection / dynamic property access 不会因此返回内部 embedding。KG OS 不为它增加隐藏 Property 或结果删字段。

调用方显式计算、传入、返回或存储的 Raw Vector 则遵守 Lithograph 合同，Graph 不拦截。Object / Ontology v1 的简化值模型仍不接受 caller-owned Vector；直接 Cypher 能力与高层 Object 能否解释该状态是两件事，不能用 Object profile 限制 Graph。

大型结果可以按 `columns`、多条 `row`、最终 `summary` 流式传输。streaming 只改变 transport，不改变值编码或底层事务语义；没有最终 summary 表示调用方未获得完整成功结果，不证明任意 Cypher 都没有已提交副作用。

### Graph 能力边界

- KG OS 不建立 query language、Search DSL、Traversal DSL、Cypher parser、AST 或 query rewrite。
- `query` / `execute` 只负责选择只读 / 读写连接，语句能力与执行规则由 Lithograph 决定。
- 不增加 `graph embed` / `graph search`；托管语义检索直接调用 `db.index.semantic.query*`。
- Object、Ontology、Evolution 的专用合同保留；它们不成为 Graph 的语句或值白名单。
- 不提供 raw SQL / SQLite 内部表接口，不为 Node / Relationship 建立第二套 ID。

Embedding 由 Lithograph 调用当前 connection 的 Provider 扩展生成。KG OS 只负责运行配置和 Ontology 声明的映射，不实现 HTTP client 或缓存。实际调用示例见 [CLI](cli.md#query)，连接、缓存与凭证配置见 [Runtime](runtime.md#cypher-执行连接)。
