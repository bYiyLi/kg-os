# 变长、量化路径与路径选择

使用变长 Relationship 和 Cypher 25 量化模式查询多跳关系。真实语义包括 group variables、匹配/路径模式、重复关系约束、`ANY` / `ALL` shortest、k/group selectors，不能将所有路径枚举理解为自动去重或最短路径。

```cypher
MATCH p = (:Person {id:'alice'})-[:KNOWS*1..3]->(:Person)
RETURN length(p) AS hops
ORDER BY hops
LIMIT 20
```

对于强度很高的分支图或极大深度，路径结果可能指数增长。应选择明确上限、过滤条件、预算和输出列。路径类型与单个 Node/Relationship 不同，`nodes(p)`、`relationships(p)` 返回路径组成元素，`length(p)` 返回路径长度；查看具体版本内的 Path Selector 语法请参考对应的 Lithograph 冻结 Profile，不要套用 GQL/其他 Neo4j DBMS 语法。
