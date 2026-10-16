# LOAD CSV、事务子查询与外部 I/O

`LOAD CSV` 可读取 URI 源；当前底层 SQL/SQLite Host 的进程权限和网络环境决定实际文件/网络可访问性。**MCP Sandbox 本身不开放文件系统或任意网络**，但这不等于 Lithograph 通过 Cypher 访问外部 URI 被 KG OS 额外禁用。

```cypher
LOAD CSV WITH HEADERS FROM $uri AS row
RETURN row.name AS name
LIMIT 10
```

`CALL { ... } IN TRANSACTIONS` 和 `IN CONCURRENT TRANSACTIONS` 具有独立 batch 写入边界，可按 Profile 使用 `DISJOINT BY`、`ON ERROR`、`REPORT STATUS` 等规则；调用通常要求 SQLite autocommit 且没有活动的 Lithograph explicit transaction。不要假定多个 batch 会构成“全部成功或全部回滚”的单一 Commit。SQLite 单文件仍序列化实际写提交。

`graph.execute` 在 KG OS 中按当前 Branch 选择读写连接；对明确指定其它 Branch/Version Procedure 的 Cypher 不做隐藏重写。如果脚本或流在部分操作后错误、取消、断线，必须检查真实 Branch Head、History、数据才可决定是否重试；不能仅凭错误推断副作用未发生。

MCP 不是 SQLite raw SQL shell，无法通过 `graph.execute` 执行 `BEGIN; ... COMMIT;` SQL 文本。具体 transaction/execution 语义以 Lithograph v0.3.1 公开合同为准。
