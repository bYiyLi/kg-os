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
