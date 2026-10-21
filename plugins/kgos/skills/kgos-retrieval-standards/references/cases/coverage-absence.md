# 案例：完整性、计数和否定

应用 [覆盖与停止](../coverage.md)。给定已存在的 `RetrievalTask`：任务key在此集合唯一，project定义项目归属，status可缺省表示尚未确认。以下快照中P有T1、T2、T3，前两条done，T3未知；Q有T4，状态open。内容均为合成案例，不是业务数据。

## C1：前两条、总数与全部分别成立

用户要求P全部任务。按唯一key排序的第一页只返回T1/T2；这一页成功不代表全部。继续相同快照与相同条件的剩余页，再按对象身份合并；如果只问数量，直接完整聚合即可，不必读取所有正文。

### first-page

```cypher
MATCH (t:RetrievalTask {project:'P'}) RETURN t.key AS task ORDER BY task SKIP 0 LIMIT 2
```

```json
{"columns":["task"],"rows":[["T1"],["T2"]]}
```

### remaining-page

```cypher
MATCH (t:RetrievalTask {project:'P'}) RETURN t.key AS task ORDER BY task SKIP 2 LIMIT 2
```

```json
{"columns":["task"],"rows":[["T3"]]}
```

### count-project

```cypher
MATCH (t:RetrievalTask {project:'P'}) RETURN count(t) AS total
```

```json
{"columns":["total"],"rows":[[3]]}
```

这里页长2只是演示。实际结束依据是成功遍历了该有界目标集合或其它等价覆盖证明，不是固定“查两页”。用户只要两条示例时，第一页已足够，可按示例交付，不继续全量导出。

## C2：没有已知未完成，不等于全部完成

“P是否所有任务都完成？”不能只检查 `status <> 'done'`。null不会匹配该谓词；要把未知单列并确认集合范围。

### known-not-done

```cypher
MATCH (t:RetrievalTask {project:'P'}) WHERE t.status <> 'done' RETURN t.key AS task ORDER BY task
```

```json
{"columns":["task"],"rows":[]}
```

### unknown-status

```cypher
MATCH (t:RetrievalTask {project:'P'}) WHERE t.status IS NULL RETURN t.key AS task ORDER BY task
```

```json
{"columns":["task"],"rows":[["T3"]]}
```

**正确结论**：库内P有三条任务，其中T3状态未知，不能确认全部完成。不能将T3写成open来“修正”结果；未知不是已知未完成。空项目也不能被报告为真实项目已验收。

## C3：可以给出限定的否定，不应永远拒绝

用户只问“此快照中是否登记了project=Z的RetrievalTask”。字段含义、集合和可见范围明确，完整成功的计数为零即可回答该库范围内没有记录，不必再搜全文、语义或要求用户证明外部世界。

### absent-in-snapshot

```cypher
MATCH (t:RetrievalTask {project:'Z'}) RETURN count(t) AS total
```

```json
{"columns":["total"],"rows":[[0]]}
```

相邻问题“Z现实中没有任务吗”需要登记完备性的外部依据；同一个零计数不能自动证明。若只是Top-K、部分页或鉴权失败，则连“库内全部不存在”也不能声称。

## C4：错误不是空列表

Provider报错、全文索引不存在或stream未收到成功summary，保持检索未完成的状态。可用的结构化或全文替代应保持原问题含义；不能吞掉错误返回空数组，再宣称没有相关知识。已经确认的独立部分可回答并明确局限，不把失败扩大为所有知识都不可用。
