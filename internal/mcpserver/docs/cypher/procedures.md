# Named Procedure、SHOW 与 Version Control

命名 Procedure 用 `CALL name(args...) YIELD columns RETURN ...` 执行。参数与准确返回列应由当前 Lithograph 运行环境中 `SHOW PROCEDURES` 和对应固定版本的接口参考确认；名称可用不代表任何事务或只读连接都可以执行。

```cypher
SHOW PROCEDURES
```

```cypher
SHOW FUNCTIONS
```

Lithograph 在同一 Cypher 系统内提供 `lithograph.*` Version Procedures（Branch、Tag、Commit、History、Diff、Patch、Merge、Rebase、Squash 等）。但是 **KG OS MCP 不保证完整 SQLite 扩展客户端接口**：首选 `evolution.*` 的已暴露方法，Graph Procedure 仍遵守底层版本与事务规则，不能把一次脚本包装为一个全局原子操作。

不要把 `CALL db.index.semantic.queryNodes`、`db.index.fulltext.queryNodes` 当成 JavaScript 函数；它们是包含在 `cypher` 字符串中的数据库 Procedure。**完整的 38 个 Procedure 签名、参数类型、读写模式与输出列**可通过独立 MCP Tool `kgos_docs` 读取，传入 `{"paths":["cypher/procedures-reference.md"]}`，无需打开外部链接或在 JavaScript 中调用文档方法。也可在有权限的 `graph.query` / `graph.execute` 中使用 `SHOW PROCEDURES` 查询运行环境清单。涉及版本修改、Merge、缓存和外部 Provider 的 Procedure，必须先检查相应操作条件，不应仅据 Mode 自动判断其副作用。
