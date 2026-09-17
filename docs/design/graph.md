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

Graph 是 KG OS 面向普通 Knowledge 图的通用计算入口，直接复用 Lithograph Cypher 25，不再提供 `get` / `list` / `expand` / `mutate` 等另一套 Knowledge CRUD / traversal language。

```text
Graph Capability
│
├── query
└── execute
```

`query` 执行任意 **普通 Knowledge graph-data 范围内的 read-only Cypher**。它直接使用 Lithograph 的只读执行路径，并受公共 Knowledge Graph View 约束。除了拒绝 graph / schema / version/ref mutation、外部 I/O、connection-state mutation 或其它副作用，还必须拒绝会绕过公共能力边界的 read-only surface：模型结构、约束和索引通过 Ontology / Object 的 Definition aggregate 读取，不直接透传 current Graph Type / Schema SHOW，Commit / Branch / Tag / log 等 version introspection 通过 Evolution 读取，KG OS internal procedure / metadata 不通过 Graph 暴露。全文、托管语义检索、结构化条件、图遍历、聚合、排序与混合检索都可以由 AI 在同一个 Knowledge Cypher 查询中按 Lithograph 当前公开能力自由组合，因此 KG OS 不增加另一套 Search DSL。

KG OS-managed Full-text 的官方使用模型不提供 analyzer selector：Ontology 只暴露真实 Full-text index name/targets/properties，查询调用 `db.index.fulltext.queryNodes/queryRelationships` 时省略 Lithograph 的 query-time analyzer override，使目标 State 的**实际 versioned IndexDefinition**决定 index/query 默认 tokenizer。全局 `[fulltext].analyzer` 只用于 KG OS 创建或因业务 Schema 变化重建 Full-text IndexDefinition，不作为每次 query 参数重复传递，也不会在 restart 时覆盖既有 IndexDefinition。由于 Graph 保持原始 Lithograph Cypher passthrough，KG OS **不会为了禁止一个显式写在 Cypher 里的底层 `{analyzer: ...}` override 而再实现 Cypher parser/rewrite**；调用方若主动使用这个 Lithograph 专有低层选项，其本次 query tokenization 直接遵守 Lithograph contract，属于 KG OS managed Full-text 简化模型之外的显式 escape hatch，不修改 State、Ontology 或 runtime config。AI-facing CLI/Skill/文档不得把它生成成 KG OS 常规能力。

当 `query` 返回 Lithograph Node / Relationship 时，其 `elementId()` `n:<id>` / `r:<id>` 就是对应 Knowledge Object Ref；KG OS 不做 identity 转换。AI 可以把这个 Ref 直接交给 Object `read` / `patch`，也可以原样重新写入 Cypher。这个直接互操作只适用于 Knowledge element Ref；Schema / Domain 等其它 Object Ref 不是 `elementId()`。Scalar、Map、List、Path、aggregate 等普通 query result 只是计算结果，不因为来自 Graph 就自动成为 Object。

`execute` 执行**普通 Knowledge graph-data mutation Cypher**，适合条件级、集合级、大规模或模式驱动的 mutation，例如条件更新、`MERGE`、复杂模式匹配后修改。一个或少量明确 Object 的维护优先使用 Object Patch；需要对大量匹配结果逐个生成 Object Patch 时，应直接使用 Graph `execute`。最终成功语义要求调用方 mutation、KG OS public-profile validation 与任何 mandatory managed-vector refresh **共同形成一个最终 State**；任一 validation / Provider / refresh 失败都不能留下 partial Commit 或第二个隐藏修复 Commit。

普通 staged validation 可以使用 KG OS-owned Lithograph explicit transaction，但实现不能因此在持有 Lithograph single-writer ownership 时等待 Embedding Provider 网络 I/O。对动态 Cypher 修改 semantic source **或改变 element 是否属于某个 semantic Index target** 的场景，受影响 element、最终 target membership 与 source value 只有执行后才能确定，而当前 Lithograph explicit transaction 又明确要求 writer transaction 保持短小、不能等待长时间网络交互；因此该场景在当前依赖能力下是明确的 integration readiness blocker，而不是允许实现退化为 `tx_execute → 网络 embedding → tx_commit`。满足这一公共合同需要 Lithograph 提供通用、非 KG OS 私有的 candidate/preparation boundary 或等价能力，使 KG OS 能在不长时间持有 writer 的情况下取得确定的最终 target/source changes、完成 embedding，并仍以原 base/head 原子提交同一逻辑 mutation。具体下层机制由 Lithograph 自身设计决定。

Definition、其 Property/Constraint/Index 与 Domain 的变更由统一 Object Patch 编译，Branch / Tag / State / Merge 属于 Evolution，不通过 Graph `execute` 暴露。Graph 也不能访问 `_lithograph_*` 内部实现或 KG OS internal Ontology semantic graph。

Graph `query` / `execute` 使用统一 State reference semantics：读取可以引用 State / Branch / Tag，并在 operation 开始时 pin 到 immutable State；写入必须显式指定目标 Branch。Graph `execute` 是 command-based Cypher mutation，不继承 Object textual Patch 的 explicit `baseState` 合同：它以执行开始时解析出的目标 Branch head 为输入 Snapshot，并继续使用 Lithograph 的 branch-head compare 处理执行期间并发移动。成功的 writable `execute` 返回最终 State identity。Graph 与 Object 共享同一 Knowledge `graphView` isolation，不建立 `knowledgeVersion` 或第二套数据身份。

### Graph 公共调用合同

Graph v1 对普通 parameter / result value 复用 Lithograph JSON v1 encoding，但 **public value profile 排除 Vector**；Node / Relationship / Temporal / Point / UUID 等仍沿用 Lithograph encoding。调用方直接提交 Lithograph `$type: "Vector"` parameter，或查询结果中出现 Vector（包括嵌套在 List / Map / Path-visible property 中的 Vector）都不属于 KG OS v1 Graph public contract。唯一允许产生内部 query Vector 的公共输入是 KG OS adapter-only `SemanticText`：

```json
{"$semantic":"如何设计知识图谱"}
```

它只允许作为 `params` 的**直接 value**，并且 object 必须恰好只有 `$semantic` 一个 key，其 value 为非空 String。KG OS 在把请求交给 Lithograph 之前遍历顶层 params：普通 public value 原样按 Lithograph JSON v1 解码；raw Vector parameter 直接拒绝；`SemanticText` 使用当前全局 OpenAI-compatible embedding service 转成**仅供本次内部 execution 使用**的 Lithograph Vector parameter。这个 marker 是 input-only adapter metadata，不是 Cypher value、不是 Object Value、不会持久化，也不会传给 Lithograph。调用方确实要传一个普通 Map 且 key 为 `$semantic` 时，使用 Lithograph 已有的 `$type: "Map"` wrapper 明确转义。

**KG OS 不解析、验证或改写 Cypher 来完成 semantic parameter conversion。** Cypher bytes 原样交给 Lithograph；KG OS 只根据 parameter 自己的显式 marker 决定是否调用 OpenAI-compatible embedding service。因此同一个 semantic parameter 被放到不接受 Vector 的 Cypher 位置时，后续由 Lithograph 按正常 Cypher type/semantic error 处理。全文与语义检索需要同时使用同一段文本时，调用方传两个参数：普通 String 给 Full-text，`SemanticText` 给 Vector `SEARCH`。

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

`query.at` 必填，避免 AI / SDK 依赖隐藏的 current Branch。`query` 先 pin immutable State 并解析 params；存在 SemanticText parameter 时，KG OS 直接使用**当前 daemon 的 `[embedding]`**生成 query Vector。service failure 返回 `EMBEDDING_PROVIDER_ERROR`，此时不执行 Lithograph query。KG OS 不在 State 中保存 embedding-space fingerprint，也不检查当前 query Vector 与目标 State 已有 managed vectors 是否来自同一个 embedding model/space；修改 runtime config 后由 operator 自己承担已有向量与当前 query space 的兼容性，v1 不自动迁移或拒绝查询。

没有 SemanticText 的普通 Graph / Full-text historical read 不调用 embedding service。历史 Full-text query 使用目标 State 中实际 versioned IndexDefinition 保存的 analyzer；如果当前 connection 没有注册那个 analyzer/tokenizer，则该 Full-text 操作返回 `FULLTEXT_ANALYZER_UNAVAILABLE`，但普通历史 graph read 不受影响。Lithograph query 执行后，adapter 在返回前递归验证 public result value；任何 Vector result 都按当前 public profile 拒绝，因此 `RETURN $semanticParam` 不会把内部 query embedding 暴露给调用方。

`execute.branch` 必填且没有 `baseState`。KG OS 在 operation 开始时解析 Branch head；实现使用的 atomic preparation/commit boundary 必须以这个 head 作为 expected base，因此仍保持 command-based“执行开始时的 Branch State”语义，而不是变成 Object Patch 的 caller-supplied `baseState`。最终 commit 前至少验证：调用方 result 不含 Vector；caller-owned changed Property value/type 不含 Vector；changed Label / Relationship Type / Property key 不使用 reserved `__kgos_` prefix；semantic Index target membership 与 source value 的所有变化都已经对应到需要 create/recompute/delete 的 managed materialization。SemanticText 只使用当前 runtime OpenAI-compatible service 生成内部 Vector。Branch 在 preparation 期间前进时必须整体失败，不把旧 candidate 套到新 head。普通 public `rows` / parameter value 使用 Lithograph JSON v1 tagged-value encoding 的 KG OS 子集；`counters` 复用 Lithograph public summary counter names。

### 托管向量的结果边界

KG OS semantic Index 的 managed Vector 是**内部 materialization**，不是 Knowledge Property。对公共 Graph 语义，它必须像不存在一样：`RETURN n` / `RETURN r` 的 element properties、`properties(n)`、`keys(n)`、map projection、dynamic property access 和其它正常 Knowledge 读取都不能观察到 reserved managed vector Property/metadata；调用方也不能直接写它。Vector Search 的可观察结果是调用方自己 `RETURN` 的业务字段 / Node / Relationship 与 `SCORE` 等普通计算结果，不额外返回 embedding。

KG OS v1 不建立“业务 Vector”和“托管 Vector”两套公开概念：**caller-owned Vector Property/value 一律不在公共 Knowledge profile 中**。Lithograph 自身仍可计算和存储 Vector；KG OS 只在内部 semantic-index path 使用它。因为 Graph 保持原始 Cypher passthrough，KG OS 不尝试通过解析语法禁止每一种只存在于 Cypher expression 内部的 Lithograph Vector 计算；只要 Vector 不穿过 caller parameter、public result 或 durable caller-owned Property 边界，这类底层表达式由 Lithograph 自己解释，但**不属于 KG OS 承诺的 Vector 使用接口**。KG OS 官方 semantic-search input 仍只有 SemanticText；raw Vector parameter、Vector result 与持久化 caller-owned Vector Property 都在 adapter / candidate-state boundary 拒绝，不能形成 KG OS-valid State 或公共返回值。

大型 result 的 adapter 可以流式传输 `columns` 一次、`row` 零到多次、最终 summary 一次，但 row/value semantics 与上述 bounded result 完全相同；streaming 只是 transport，不建立第二套 Graph API。

### Graph 能力边界

- 不建立 KG OS query language、Search DSL、Traversal DSL 或独立 Search Engine；
- Full-text analyzer 不进入 Ontology、Graph request 或 KG OS Search DSL；常规 query 使用目标 IndexDefinition 的 analyzer，第三方 tokenizer implementation 由 daemon SQLite extension runtime 提供；
- 不增加 `graph embed` / `graph search` 或 KG OS 自有查询语言；semantic text 只通过 Graph params 的显式 input marker 转成 Vector，真正检索仍是 Lithograph Cypher / `SEARCH`；
- KG OS 不为了 semantic search 引入第二套 Cypher parser、AST 或 query rewrite；
- 不把 Lithograph 的 Vector value/type 提升为 KG OS caller-owned Knowledge 类型；
- 不通过 Graph `query` 暴露 Schema `SHOW` / introspection 或 Version Procedure；Ontology 模型理解属于渐进式 Ontology read，编辑基线属于 Object aggregate read，State / ref / history introspection 属于 Evolution；
- 不再维护与 Object Patch 重复的 Knowledge `mutate` / CRUD surface；
- 不为 Node / Relationship 建立 KG OS 自己的 ID；
- 不允许普通 Graph query / execute 返回或修改 KG OS internal Ontology semantic metadata，也不访问 Lithograph 内部表。

Ontology 负责告诉上层“当前 Knowledge 应按什么模型理解”；Object 负责明确对象的读取与维护；Graph 负责关系发现、计算与集合级 mutation；真实约束和 query / mutation 数据库语义由 Lithograph 按其公开 Schema 与 Cypher 合同负责。

Embedding 统一由 `kgosd` 使用全局 OpenAI-compatible Embeddings service 生成；外部 Agent/Application 不需要选择协议实现或维护托管 Vector Property。远端 service 调用是确定性基础设施 I/O，不把 Agent 认知能力放入 Kernel。Ontology 中显示的 Label、Relationship Type、Property name 与 Index name 必须对应同一 State 的真实查询名称；semantic query 只需要写正常 Lithograph `SEARCH` 并把对应参数标记为 `SemanticText`。
