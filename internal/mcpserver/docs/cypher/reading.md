# 读取、过滤与投影

`MATCH` 根据 Node / Relationship pattern 匹配图数据；`OPTIONAL MATCH` 保留未命中的外部行并用 `null` 填充。`WHERE` / `FILTER` 筛选行。`WITH` 在子流程中传递所需列，`LET` 命名表达式，`RETURN` 定义输出列。`ORDER BY` / `SKIP` / `LIMIT` 约束结果展示；无排序时不要假定行顺序。

```cypher
MATCH (p:Person)
WHERE p.age >= 18
RETURN p.name AS name, p.age AS age
ORDER BY age DESC, name
LIMIT 20
```

```cypher
MATCH (p:Person)
OPTIONAL MATCH (p)-[:WORKS_AT]->(c:Company)
RETURN p.name AS person, c.name AS company
ORDER BY person
```

`WHERE` 与对应 `MATCH` 的匹配语义有关，尤其涉及 `OPTIONAL MATCH`：先筛掉未命中的候选和在 `RETURN` 后筛选最终 `null` 结果并不总等价。`WITH` 之后未传递的变量不在作用域中。`RETURN n` 返回 Node 类型的 JSON 编码，不等于自动展开为普通 Map；大量行应优先显式投影字段。

## MCP 调用

```js
const { state } = await evolution.overview();
return await graph.query({
  at: state,
  cypher: "MATCH (n:Person) RETURN n.name AS name ORDER BY name LIMIT $limit",
  params: { limit: 10 }
});
```

要在历史 State 查询，传 `at:"commit/<64位小写hex>"`；Branch/Tag 在**每次读取开始时**解析并固定成 Commit，跨多次 SDK 调用请复用同一个返回的 `state`。
