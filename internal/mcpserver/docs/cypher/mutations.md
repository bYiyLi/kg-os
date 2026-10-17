# 图数据修改

写语句必须通过 **`kgos_mutate` → `graph.execute({branch,...})`**，而不是 `kgos_query` 的只读 `graph.query`。KG OS 不做 Cypher AST 检查或改写；Lithograph 判断语义、约束、提交粒度及错误。

```cypher
CREATE (p:Person {id:'demo', name:'Demo'}) RETURN elementId(p) AS ref
```

```cypher
MERGE (p:Person {id:$id})
ON CREATE SET p.name=$name
ON MATCH SET p.name=$name
RETURN p.id AS id
```

```cypher
MATCH (p:Person {id:$id}) SET p.name=$name RETURN p.id AS id
```

```cypher
MATCH (p:Person {id:$id}) DETACH DELETE p FINISH
```

还支持 `INSERT`、`REMOVE`、`DELETE`、`FOREACH`，以及由 Cypher 25 定义的限制。`MERGE` 按模式匹配或创建，不能替代业务唯一键与 Schema Constraint。`DELETE` 默认不能留下 dangling Relationship；`DETACH DELETE` 删除关联的边。

```js
const branch = "<authorized-test-branch>"; // 必须替换成已授权、已有的隔离 Branch
await evolution.get({ state: "branch/" + branch }); // 核实目标，而不是默认为 main
return await graph.execute({
  branch,
  cypher: "MERGE (p:Person {id:$id}) SET p.name=$name RETURN p.id AS id",
  params: { id: "demo", name: "Demo" },
  author: "AI",
  message: "Upsert demo Person"
});
```

一次 `graph.execute` 不能概括为“始终创建一个 Commit”；Version Procedure、事务子查询、只读执行等均使用各自底层合同。多个 `kgos_mutate` 内的 SDK 写入不自动构成跨方法事务，失败后须读回真实 State/History 再决定是否重试。
