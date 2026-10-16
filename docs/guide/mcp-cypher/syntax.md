# Cypher 25 — 语法基础

Cypher 单条语句由 Clause 组合，关键字如 `MATCH`、`WHERE`、`RETURN` 不区分大小写。Label `:Person`、Relationship Type `:WORKS_AT` 和 Property `p.name` 由数据库中实际用户模型定义。标识符必要时使用反引号；字符串使用单引号或双引号，不要通过 JS 拼接未经信任的文本。

## 查询参数

在 Cypher 中引用 `$name`，通过 `params` 传入 JSON-compatible Map。**值参数化**优先于字符串拼接。`params` 和 Sandbox 的 JavaScript 局部变量不是同一个作用域。

```js
const {state}=await evolution.overview();
return await graph.query({
  at:state,
  cypher:"MATCH (p:Person) WHERE p.age >= $minAge RETURN p.name AS name ORDER BY name LIMIT 10",
  params:{minAge:18}
});
```

## 字面量和注释

布尔 `true` / `false`、`null`、数值、字符串、列表 `[1,2]`、Map `{id:'a'}`；行注释 `//` 和块注释 `/* ... */`。`CYPHER 25` 可显式标明版本；当前仅执行 Cypher 25，不能要求 Cypher 5。字符串中的引号/换行遵循 Cypher 字面量规则，和 JS 模板字符串的外层转义相互独立。

```cypher
CYPHER 25 RETURN 1 + 2 AS sum, [true, false] AS flags
```

## 注意

`EXPLAIN` 只生成计划，`PROFILE` 会真正执行（写入语句尤其危险）。`params` 支持 Lithograph 的 JSON tagged values（如 Vector/Temporal），细节参见 `cypher/expressions.md`。查询只接受底层单条 Cypher query，不是 SQL 文件或以分号串联的多个语句。
