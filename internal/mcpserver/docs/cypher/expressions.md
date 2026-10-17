# 值、表达式与 Null

支持 Integer、Float、Boolean、String、List、Map、Node、Relationship、Path，以及 Cypher 25 的 Temporal/Duration、Point、UUID 和 Vector 值。`null` 表示缺失/未知值：`x = null` 不用于匹配空值，使用 `x IS NULL`；三值逻辑中 `true AND null` 等表达式遵循 Cypher 25 规则。`SET n.x = null` 是删除 Property，不是保存一个可区分的 null 值。

```cypher
RETURN CASE WHEN 2 > 1 THEN 'yes' ELSE 'no' END AS decision,
       coalesce(null, 'fallback') AS fallback,
       [1,2,3] AS values
```

```cypher
RETURN [x IN [1,2,3] WHERE x > 1 | x * 2] AS doubled
```

`WHERE`、`WITH`、Map/List projection、dynamic Property access、comprehension、子查询表达式和字符串插值等遵循冻结 Profile。不要对超出 JS 安全整数范围的原生 INTEGER64 假设 JavaScript Number 能无损表示；Lithograph JSON 值编码可能使用 tagged representation。原生 Vector 需匹配 index 的维度、坐标类型与相似度配置；详见 `cypher/search.md`。
