# 聚合、分组和分页

Cypher 聚合包括 `count()`、`sum()`、`avg()`、`min()`、`max()`、`collect()` 等。`DISTINCT` 作用于指定值或返回行；聚合前后的行粒度不同。支持冻结 Profile 中的隐式/显式 `GROUP BY`。

```cypher
MATCH (p:Person)
RETURN count(p) AS people
```

```cypher
MATCH (p:Person)
RETURN p.department AS department, count(p) AS employees
ORDER BY employees DESC, department
LIMIT 20
```

`count(*)` 计数输入行，`count(expr)` 遵循 `null` 处理规则。`ORDER BY` 不能让无业务唯一键的并列值自动有稳定顺序；需要稳定分页，使用可重复的次级排序键。大数据聚合、`ORDER BY` 和 `DISTINCT` 等操作可能要求临时排序或聚合屏障，`streamQuery` 只承诺输出增量消费，不保证任意运算符均不使用中间内存。
