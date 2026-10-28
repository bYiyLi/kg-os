# 案例 8：受控词表、别名与组织 Domain

<!-- cspell:words SKOS -->

**需求**：同一词表中用稳定编码定位概念，支持同义标签和明确的上位概念；不同词表可复用相同编码。Domain 只用于浏览模型，不作为词表身份、实例隔离或类别继承。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:Concept

```yaml
name: "Concept"
description: "某一词表方案内的一个概念，不是词语出现次数或 KG OS Domain。"
properties:
  - name: "scheme"
    description: "用户选择的词表方案标识。"
    type: "STRING"
  - name: "code"
    description: "在该方案内稳定的概念编码。"
    type: "STRING"
  - name: "preferredLabel"
    description: "本例单一语言的首选显示词，不是唯一身份。"
    type: "STRING"
    required: true
  - name: "alternativeLabels"
    description: "同一含义的别称；不是相似但不同的概念。"
    type: "LIST<STRING NOT NULL>"
constraints:
  - name: "concept_scheme_code_key"
    type: "key"
    properties:
      - "scheme"
      - "code"
```

### relationship:BROADER

```yaml
name: "BROADER"
description: "从较具体概念指向较宽泛概念；不自动等于 is-a 或产生传递推理。"
from: "node:Concept"
to: "node:Concept"
properties:
  - name: "basis"
    description: "层级判断的来源或业务依据。"
    type: "STRING"
    required: true
constraints: []
```

### domain:VocabularyModels

```yaml
name: "VocabularyModels"
description: "只组织词表模型的导航分组，不是 Concept.scheme 的值域或命名空间。"
includes:
  - "node:Concept"
  - "relationship:BROADER"
```

## 关键取舍与保证边界

scheme+code 复合 key 表达身份作用域；不同 scheme 的 code=DB 并不冲突。别名只有同一含义才进入 alternativeLabels，不把近义、上下位或跨语言不等价词硬合并。语言扩展若需要逐标签语言/来源，应另做标签对象或明确结构，而非假设本例列表已表达语言信息。

本例业务选择仅允许同一 scheme 内的 BROADER 且不形成循环；端点约束只能保证连接 Concept，不能保证同 scheme 或无环。需要外部检查。Domain includes 只是组织定义，本身允许的循环/多父级不因此受到本例概念层级政策限制。

## 合成实例（仅隔离测试）

```cypher
CREATE (a:Concept {scheme:'tech',code:'DATA',preferredLabel:'Data system'}),
       (b:Concept {scheme:'tech',code:'DB',preferredLabel:'Database',alternativeLabels:['Data store']}),
       (:Concept {scheme:'finance',code:'DB',preferredLabel:'Debit'}),
       (b)-[:BROADER {basis:'taxonomy:v1'}]->(a)
```

## 验证问题

### 编码相同但作用域不同的概念是否分开？

```cypher
MATCH (c:Concept {code:'DB'}) RETURN c.scheme AS scheme, c.preferredLabel AS label ORDER BY scheme
```

```json
{
  "columns": [
    "scheme",
    "label"
  ],
  "rows": [
    [
      "finance",
      "Debit"
    ],
    [
      "tech",
      "Database"
    ]
  ]
}
```

### 指定词表的上位概念是什么？

```cypher
MATCH (:Concept {scheme:'tech',code:'DB'})-[:BROADER]->(p:Concept) RETURN p.code AS broader
```

```json
{
  "columns": [
    "broader"
  ],
  "rows": [
    [
      "DATA"
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:Concept {scheme:'tech',code:'DB',preferredLabel:'Different concept'})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。端点都为 Concept 仍可能违反本例同 scheme 的层级约定；跨 scheme 映射应该另有明确语义，不把其误作同一词表的层级。该检查不等于已验证无环。

```cypher
MATCH (a:Concept {scheme:'tech',code:'DB'}),(b:Concept {scheme:'finance',code:'DB'}) CREATE (a)-[:BROADER {basis:'bad-mapping'}]->(b)
```

## 语义检查

```cypher
MATCH (a:Concept)-[:BROADER]->(b:Concept) WHERE a.scheme <> b.scheme RETURN a.scheme AS childScheme, b.scheme AS parentScheme ORDER BY childScheme, parentScheme
```

```json
{
  "columns": [
    "childScheme",
    "parentScheme"
  ],
  "rows": [
    [
      "tech",
      "finance"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：以显示词或 code 全局唯一，把两个 scheme 合成一个；或者使用 KG OS Domain 假装自动提供 namespace。**合法简化**：只有一个永不混用的词表且合同明确时，可只以 code 为键。

**错误**：把 `BROADER` 解释成额外 Label 的继承或自动传递边。概念层级与 Property Graph 模型约束不是同一层；需要查询多跳时应明确查询，而非假装数据库已新增推断事实。

## 修改与维护

改显示标签不改概念身份；改含义要识别是否实际上创建新概念。合并词条需有等价依据并核对全部使用方，不按字符串距离自动合并。删除 VocabularyModels Domain 不应删除 Concept、BROADER 或任意知识实例；跨 scheme 映射有需求后再定义不同语义的映射关系。

## 参考依据

参考 [W3C SKOS Reference](https://www.w3.org/TR/skos-reference/) 的概念、词表、标签和层级区分（核对：2026-10-20）。本例没有实现 SKOS 的 RDF 推理、完整标签约束或跨方案映射规则。
