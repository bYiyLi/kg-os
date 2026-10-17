# KG OS MCP — Cypher 25

此手册由 KG OS 维护，面向 `kgos_query` / `kgos_mutate` 的 JavaScript Sandbox。适配 **Lithograph v0.3.1**、冻结兼容 Profile **CY25-2026.08**。Cypher 的语义、限制和真正执行由 Lithograph 决定；本手册只解释通过 KG OS MCP 如何使用它，不建立第二种数据库语言。

**基本原则**：`graph.query({at,cypher,params?})` 使用只读连接并固定某个 State；`graph.execute({branch,cypher,params?,author?,message?})` 使用读写连接，能够执行读写 Cypher 和数据库 Procedure。`graph.streamQuery` 与 `graph.streamExecute` 保留相同语义，只改成事件流。所有示例是 JS Sandbox 函数体或独立的 `cypher` 文本；不要把 `SELECT lithograph(...)` 这样的 SQLite 宿主 SQL 传给 `cypher` 参数。

| 主题 | 读取路径 |
| --- | --- |
| 参数、标识符、文字、Cypher 25 前缀 | `cypher/syntax.md` |
| MATCH / OPTIONAL MATCH / WHERE / FILTER / RETURN | `cypher/reading.md` |
| Node/Relationship/Pattern 和路径遍历 | `cypher/patterns.md` |
| 量化路径、最短路径和 Path/Match Modes | `cypher/paths.md` |
| 类型、null、表达式、CASE 与函数 | `cypher/expressions.md` |
| DISTINCT / GROUP BY / 聚合 / ORDER BY | `cypher/aggregation.md` |
| UNWIND/FOR、UNION/WHEN/NEXT、子查询 | `cypher/composition.md` |
| CREATE / INSERT / MERGE / SET / DELETE | `cypher/mutations.md` |
| Graph Type、Property、Constraint、Index | `cypher/schema.md` |
| Full-text / Raw Vector / Semantic Search | `cypher/search.md` |
| Procedure、SHOW、版本控制 | `cypher/procedures.md` |
| LOAD CSV、事务子查询与外部 I/O | `cypher/transactions.md` |
| EXPLAIN、PROFILE、错误与安全边界 | `cypher/diagnostics.md` |
| 常用函数类别及查询发现 | `cypher/functions.md` |
| 全部 169 个函数名与 172 条签名 | `cypher/functions-reference.md` |
| 全部 38 个 Procedure 与参数、输出列 | `cypher/procedures-reference.md` |

先按需读取其中一页；如果需要精确方法参数，读取 `sdk/graph/query.md` 或 `sdk/graph/execute.md`。数据 Label、Relationship Type、Property 名字是用户模型决定的，应先通过 `kgos_ontology_overview` / `ontology.read` 了解，不应根据本手册的 `Person` 教学样例假定真实数据存在。

**固定上游基线**：Lithograph v0.3.1 [Cypher 手册](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/cypher/index.md)、[函数参考](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/reference/functions.md)、[Procedure 参考](https://github.com/bYiyLi/Lithograph/blob/v0.3.1/docs/reference/procedures.md)。上游更新不自动改变当前镜像能力。
