# 发现上下文、固定版本及批量读取

用 `kgos_preview` 发现真实 Branch、Ontology、Definition/Property/Index，不要根据教学示例自动假定 `Person`、`Company` 已存在。Preview 分页按完整 Markdown 的绝对行偏移读取，并按返回的 `viewRevision` 固定同一视图。查看历史时调用 `state_ancestry` 并按 cursor 继续。

## 同一 State 的多次读取

```js
const { state } = await evolution.overview();
const ontologyResult = await ontology.read({ at: state });
const graphResult = await graph.query({
  at: state,
  cypher: "MATCH (n) RETURN count(n) AS total"
});
return { state, ontology: ontologyResult, graph: graphResult };
```

`evolution.overview()` 会返回当前默认 Branch 的已解析 Commit；在一次业务任务内复用 `state`，避免几次独立的 Branch 解析落到不同 Snapshot。需要历史读取可显式使用 `commit/<64-lowercase-hex>`、`branch/<name>` 或 `tag/<name>`。

SDK 接口参考：`sdk/evolution/overview.md`、`sdk/ontology/read.md`、`sdk/graph/query.md`。
