# 案例：搜索候选、排名与过滤

应用 [问题与策略](../strategy.md)及 [覆盖与停止](../coverage.md)。给定 `RetrievalDoc` 的project、key、body、title均有既定含义；body上的全文索引为retrieval_text，单字段Managed Semantic索引为retrieval_semantic。名字仅供隔离案例；当前库若没有这些索引，不能据示例假定存在或自行创建。

## S1：全局Top-K之后过滤，不是范围内Top-K

受控输入的全局相似排序为：X（项目Q）、P1（项目P）、P2（项目P）。用户要项目P中两条最相似资料。先取全局前2，再过滤P只剩P1，并不会返回P2。

### post-filter-candidates

```cypher
CALL db.index.semantic.queryNodes('retrieval_semantic', 'needle', {limit:2})
YIELD node, score
WHERE node.project = 'P'
RETURN node.key AS doc ORDER BY doc
```

```json
{"columns":["doc"],"rows":[["P1"]]}
```

### wider-candidates

```cypher
CALL db.index.semantic.queryNodes('retrieval_semantic', 'needle', {limit:3})
YIELD node, score
WHERE node.project = 'P'
RETURN node.key AS doc ORDER BY doc
```

```json
{"columns":["doc"],"rows":[["P1"],["P2"]]}
```

扩大候选在这个小集合中补到了P2，但不能推广成“limit乘二保证范围内Top-K”。示例故意按doc排序便于核对集合，不将展示顺序当相似排名。生产语义分数由真实Provider/索引决定；本例确定顺序是教学条件，不是模型质量承诺。

## S2：缺source的资料仍然存在

同一快照还有项目P的P3，其title包含相关文字，body缺失。它不参与body语义索引；扩大limit也不能使它出现。用户要P全部资料时应读取实际集合，而非枚举这个索引。

### project-documents

```cypher
MATCH (d:RetrievalDoc {project:'P'}) RETURN d.key AS doc ORDER BY doc
```

```json
{"columns":["doc"],"rows":[["P1"],["P2"],["P3"]]}
```

**危险反例**：声称P只有两份资料；或为召回P3擅自给body补title、添加拼接字段、重建索引。需要继续解决什么由用户问题决定，模型更改不是检索的隐含权限。

## S3：全文有结果，也需检查实际含义

给定body中只有X和P1含独立词 `needle`，P2为“related concept”，P3没有body。全文适合明确术语匹配，但不会自动检索title、翻译同义词或证明正文主张为真。

### fulltext-candidates

```cypher
CALL db.index.fulltext.queryNodes('retrieval_text', 'needle', {limit:10})
YIELD node, score
RETURN node.key AS doc ORDER BY doc
```

```json
{"columns":["doc"],"rows":[["P1"],["X"]]}
```

问题是“找包含该术语的body记录”时，这种搜索合理；问题是“相同含义的所有材料”时，单词匹配不足。多路结果按实际对象身份去重，但不能把语义0.9和全文分数相加称为90%可信。

## S4：能力缺失与合法降级

语义Provider失效，若用户只是找相关内容，可继续现有全文/图读取并说明语义通道未完成；若用户指定严格语义排名，就不能换成关键词结果仍称“最相似”。不要为查资料调用索引维护、改Provider、生成raw embedding或绕开外部访问限制。原任务授权范围内可用的Raw Vector读取是另一能力，需使用其实际输入和语法，不将其过滤保证迁移到Managed Semantic。
