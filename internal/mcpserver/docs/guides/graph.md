# Graph：只读、读写和组合语句

只读 `kgos_query` 允许 `graph.query` 或 `graph.streamQuery`；读写 `kgos_mutate` 可用 `graph.execute` 或 `graph.streamExecute`。所有参数都在 JS 对象中传递，Cypher 本身作为字符串提供。`query.at` 是 StateRef，`execute.branch` 是纯 Branch 名称。

```js
const { state } = await evolution.overview();
return await graph.query({
  at: state,
  cypher: "MATCH (n) RETURN count(n) AS total"
});
```

```js
const branch = "demo"; // 必须是已存在且已授权的隔离测试 Branch
await evolution.get({ state: "branch/" + branch }); // 核对实际目标，不使用默认 Branch
return await graph.execute({
  branch,
  cypher: "CREATE (:Demo {name:$name}) FINISH",
  params: { name: "new-node" },
  message: "Create demo node"
});
```

第二段只能在明确授权并确认已有目标 `demo` Branch 时交给 `kgos_mutate`；需要选择其它目标时修改 `branch`，不能默认操作 `main`。一次 `execute` 不是“保证创建一个 Commit”，底层 Version Procedure / 事务子查询/只读查询具有不同效果。详细语法查 `cypher/index.md`；数据库操作不经过额外的 KG OS Cypher 重写。

## Scope：在 Domain 或 Graph View 内检索

以下是可在 kgos_query 中执行的只读 JavaScript 示例（须先确认 Domain 在目标 State 中存在）：

```js
const { state } = await evolution.get({ state: "branch/main" });
return await graph.query({
  at: state,
  domain: "domain:DevelopmentDelivery",
  cypher: "MATCH (n) RETURN n LIMIT 20"
});
```

也可以用 graphView: { requireAnyLabels: ["Rule", "Decision"] } 指定显式 Label 并集；两个字段互斥。domain 自动选择目标领域及所有子领域的 Node Definition，Graph View 在 Full-text / Vector / Managed Semantic 的 Top-K 前生效。索引发现 SHOW INDEXES 属于全局元数据查询，不受 Domain 范围限制，应不带 Scope 读取；实际知识检索始终传 Scope。空领域表示空可见子图，不回退全图。共享 Definition 属于多个领域时，实例可在多个领域出现，这并非权限/实例所有权；关系 Type 或更复杂实例过滤须由调用方按需要显式表达。

## 检索候选与结构化范围

下面的索引 `retrieval_semantic`、标签 `RetrievalDoc`、业务属性 `project` 是**隔离测试已有**的示例，不是 KG OS 默认模型/索引；实际调用先通过 `ontology.read`、Schema 与授权范围核实。两种查询必须固定在**同一个**已允许的 State 上比较：

```js
const branch = "research"; // 示例：已存在且获准的知识世界，不是默认 main
const { state } = await evolution.get({ state: "branch/" + branch });
const candidates = await graph.query({
  at: state,
  cypher:
    "CALL db.index.semantic.queryNodes('retrieval_semantic','needle',{limit:3}) YIELD node, score WHERE node.project='P' RETURN node.key AS doc ORDER BY doc"
});
const allDocuments = await graph.query({
  at: state,
  cypher: "MATCH (d:RetrievalDoc {project:'P'}) RETURN d.key AS doc ORDER BY doc"
});
return { state, candidates, allDocuments };
```

旧版真实 Lithograph v0.3.3 隔离测试数据中，语义全局前三经 `WHERE project='P'` 过滤会得到 P1/P2，结构化集合还包括无 `body` 的 P3。`YIELD` 后的 `WHERE` **不保证执行范围内 top-k 检索**：全局只取前两条时可能只留 P1。扩大候选数量也不保证全量覆盖；请按问题选择结构化范围、全文与语义通道，不把没有索引命中说成知识不存在。

更进一步的关联查询应基于当前 Cypher 与真实 Graph Schema 重绑定变量、通过结构化身份查关系；不要假定搜索候选已经满足业务关系。错误要保留错误类型和源查询，不自动重写 Cypher。`query.at` 固定历史，`execute.branch` 才允许获授权的写入；Provider 超时、沙箱脚本总预算超时、客户端取消和真实空结果是不同状态，不能互相伪装。发生未知写入回执时先检查目标 Branch Head 和历史再决定是否重试。

**属性边界**：通用 Property Graph 实例可以有业务额外属性，是否满足 Definition 声明的必填、类型、KEY/UNIQUE 由真实 Schema 检查。Object 顶层出现未知 API 字段是另一个类型错误，不等于所有 Knowledge Property 都是封闭白名单；允许存储也不意味着未知资料内容已被语义验证。
