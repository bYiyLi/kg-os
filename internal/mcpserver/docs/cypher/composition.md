# 查询组合与子查询

`WITH` 链接查询部分，`UNWIND` 展开 List 行，`FOR` 属于当前 Cypher 25 Profile。`UNION` 合并兼容列，`UNION ALL` 保留重复；`WHEN` 与 `NEXT` 为冻结 Profile 的组合能力。`CALL { ... }` 子查询具有显式的作用域和导入规则。

```cypher
UNWIND [1, 2, 3] AS x
RETURN x * x AS square
ORDER BY square
```

```cypher
RETURN 1 AS value
UNION ALL
RETURN 2 AS value
```

相关 `EXISTS { ... }`、`COUNT { ... }`、`COLLECT { ... }` 子查询可以在表达式上下文使用。子查询内部变量不会不经导出自动存在于外层；`UNION` 各分支需要兼容的输出列和类型。`CALL { ... } IN TRANSACTIONS` 会改变事务边界，不能把它当成普通纯查询子查询；见 `cypher/transactions.md`。
