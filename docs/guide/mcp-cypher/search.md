# Full-text、Vector 与 Managed Semantic 查询

三种检索路径有不同前置条件：全文索引需要存在且当前连接可以构造对应 analyzer；Raw Vector 需要外部向量值与索引维度/坐标类型吻合；Managed Semantic 通过已配置的 Provider 将查询字符串变成检索向量，不等价于 Raw Vector。

## Full-text

```cypher
CALL db.index.fulltext.queryNodes('doc_text', $text, {skip:0, limit:10})
YIELD node, score
RETURN node.title AS title, score
```

Relationship 全文检索使用 `db.index.fulltext.queryRelationships`，返回 `relationship, score`。分词规则由实际 IndexDefinition 的 FTS5 tokenizer specification 决定，`porter unicode61` 与 Neo4j “english” analyzer 不应假定等价。

## Raw Vector

```cypher
MATCH (d:Doc)
SEARCH d IN (VECTOR INDEX doc_embedding FOR $embedding LIMIT 5)
SCORE AS score
RETURN d.title AS title, score
```

`$embedding` 必须是实际支持的 Lithograph typed Vector 值，不能用普通字符串代替。`SEARCH` 内部过滤可约束 ANN top-k 的候选范围；`YIELD` 后的 `WHERE` 过滤不等价于“在过滤范围内重新算 top-k”。

## Managed Semantic

```cypher
CALL db.index.semantic.queryNodes('document_semantic', $query, {limit:10})
YIELD node, score
RETURN node.title AS title, score
```

```js
const {state}=await evolution.overview();
return await graph.query({
  at:state,
  cypher:"CALL db.index.semantic.queryNodes('document_semantic', $query, {limit:10}) YIELD node, score RETURN node.title AS title, score",
  params:{query:"如何设计知识图谱"}
});
```

是否有 `doc_text` / `doc_embedding` / `document_semantic` 取决于**真实用户数据和 Schema**。缺 Index/Provider/tokenizer 应当保留底层错误，不可伪装为零命中。Provider-owned cache 是派生数据，不改变图历史。
