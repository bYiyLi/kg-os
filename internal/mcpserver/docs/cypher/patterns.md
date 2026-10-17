# Node、Relationship、Pattern

Node `(p:Person {id:'a'})`；关系 `-[r:KNOWS]->`（有方向）、`<-[r:KNOWS]-`、`-[r:KNOWS]-`（模式不指定方向）。Relationship 是有独立身份及 Property 的一等元素；自环、同端点多条同类型 Relationship 均可存在。业务唯一性需要 Constraint，而不是只依赖端点。

```cypher
MATCH (a:Person)-[r:KNOWS]->(b:Person)
RETURN a.name AS source, b.name AS target, r.since AS since
```

```cypher
MATCH (p:Person)
WHERE p.name STARTS WITH $prefix
RETURN elementId(p) AS identity, labels(p) AS labels, properties(p) AS properties
```

`elementId(n)` 和 `elementId(r)` 分别返回稳定 `n:<id>` / `r:<id>`，可在同一 KG OS 图谱中作为 Knowledge Object Ref 使用，**不是**业务键。Label / Type 表达式以及 Property predicates 使用 Cypher 25 标准语义；避免把 KG OS Ontology title 等可变字段当作图元素的标识。

`MATCH (a),(b)` 可能生成笛卡尔积，尤其大图须先明确关联模式、过滤范围与 `LIMIT`。路径变量可写 `MATCH path = (a)-[:KNOWS]->(b) RETURN length(path)`。
