# 内置函数及值转换

**冻结范围**：Lithograph v0.3.1 / CY25-2026.08 的 scalar、aggregation、predicate、list、string、numeric、temporal/duration、spatial、vector、UUID 等当前图函数。**全部 169 个函数名、172 条准确签名与返回类型**已内置于 `docs.read("cypher/functions-reference.md")`，不需要外部网页；null 传播与具体错误行为应结合相应类型规则使用。运行时也可查询 `SHOW FUNCTIONS` 核实。不可因为其他 Neo4j 版本提供同名函数就认定本版本支持。

| 类别       | 常用入口与用途                                                                |
| ---------- | ----------------------------------------------------------------------------- |
| 标量与类型 | `coalesce`、`toString`、`toInteger`、`toFloat`、`type`、`labels`、`elementId` |
| 字符串     | `trim`、`toLower`、`toUpper`、`substring`、`replace`、`split`                 |
| 列表       | `size`、`head`、`last`、`tail`、`range`                                       |
| 聚合       | `count`、`sum`、`avg`、`min`、`max`、`collect`                                |
| 数学       | `abs`、`round`、`ceil`、`floor`、`sqrt`                                       |
| 日期时间   | `date`、`datetime`、`time`、`duration`                                        |
| 点与向量   | `point`、`vector` 及冻结 Profile 支持的距离/相似度函数                        |
| 图路径     | `nodes`、`relationships`、`length`                                            |

```cypher
RETURN toUpper('hello') AS upper, coalesce(null, 42) AS fallback
```

函数 `count(expr)`、`count(*)`、`null` 传播、整数精度及 Vector 维度须依其特定语义使用；不要把函数签名当作可以在 KG OS JavaScript Sandbox 内直接调用的 JS 方法。需要快速发现实际所有 overload，可使用 `graph.query` 执行适用的 `SHOW FUNCTIONS` 查询并按结果列阅读。
