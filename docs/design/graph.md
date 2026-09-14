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
