# 案例 2：有生效区间的规则版本

**需求**：按适用范围查某日可确定生效的规则，区分已知结束、确认开放结束和不知道结束；同一规则允许多个版本。示例约定日精度半开区间 `[validFrom,validUntil)`，不是所有业务的默认约定。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:PolicyRevision

```yaml
name: "PolicyRevision"
description: "一个范围内一条规则的一个业务修订版；不是 KG OS Commit。"
properties:
  - name: "scope"
    description: "规则适用范围标识。"
    type: "STRING"
  - name: "ruleCode"
    description: "该 scope 中的规则编码。"
    type: "STRING"
  - name: "revision"
    description: "该规则的业务修订序号。"
    type: "INTEGER"
  - name: "text"
    description: "规则内容。"
    type: "STRING"
    required: true
  - name: "publishedOn"
    description: "发布日期，未知时缺省。"
    type: "DATE"
  - name: "validFrom"
    description: "业务生效起日，包含。"
    type: "DATE"
    required: true
  - name: "endKind"
    description: "本例 known/open/unknown；不是数据库枚举。"
    type: "STRING"
    required: true
  - name: "validUntil"
    description: "known 时的排除式结束日期；其它状态不得据缺省推断仍有效。"
    type: "DATE"
  - name: "observedAt"
    description: "这版规则被观察到的时间；不替代生效时间。"
    type: "ZONED DATETIME"
    required: true
constraints:
  - name: "policy_revision_key"
    type: "key"
    properties:
      - "scope"
      - "ruleCode"
      - "revision"
```

### relationship:SUPERSEDES

```yaml
name: "SUPERSEDES"
description: "新修订指向旧修订；取代关系本身不会修改旧版有效期。"
from: "node:PolicyRevision"
to: "node:PolicyRevision"
properties:
  - name: "basis"
    description: "取代依据的定位信息。"
    type: "STRING"
    required: true
constraints: []
```

## 关键取舍与保证边界

复合 key 保证 scope、ruleCode、revision 联合必填且唯一；不能把三个字段分别设 unique。`endKind=known` 要有 validUntil 且大于 validFrom，open 表示已确认开放结束，unknown 表示尚不能确定；这些关联条件必须由工作流/检查查询验证，Schema 仅保证字段类型和声明的存在性。

本例查询返回“可确定有效”而非“也许有效”。未知结束单列，不等价于失效或有效。不同版本的区间不重叠若是业务要求，也需明确检查，不由复合 key 或 SUPERSEDES 自动保证。

## 合成实例（仅隔离测试）

```cypher
CREATE (p1:PolicyRevision {scope:'A',ruleCode:'R',revision:1,text:'Old',validFrom:date('2026-01-01'),endKind:'known',validUntil:date('2026-06-01'),observedAt:datetime('2026-01-02T00:00:00Z')}),
       (p2:PolicyRevision {scope:'A',ruleCode:'R',revision:2,text:'New',validFrom:date('2026-06-01'),endKind:'open',observedAt:datetime('2026-05-20T00:00:00Z')}),
       (:PolicyRevision {scope:'A',ruleCode:'U',revision:1,text:'Uncertain end',validFrom:date('2026-01-01'),endKind:'unknown',observedAt:datetime('2026-01-02T00:00:00Z')}),
       (p2)-[:SUPERSEDES {basis:'notice-2'}]->(p1)
```

## 验证问题

### 边界当天哪版规则可确定有效？

```cypher
MATCH (p:PolicyRevision {scope:'A'}) WHERE p.validFrom <= date('2026-06-01') AND (p.endKind = 'open' OR (p.endKind = 'known' AND date('2026-06-01') < p.validUntil)) RETURN p.ruleCode AS rule, p.revision AS revision ORDER BY rule, revision
```

```json
{
  "columns": [
    "rule",
    "revision"
  ],
  "rows": [
    [
      "R",
      2
    ]
  ]
}
```

### 哪些规则不能确定截止时间？

```cypher
MATCH (p:PolicyRevision {endKind:'unknown'}) RETURN p.ruleCode AS rule ORDER BY rule
```

```json
{
  "columns": [
    "rule"
  ],
  "rows": [
    [
      "U"
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:PolicyRevision {scope:'A',ruleCode:'R',revision:2,text:'Duplicate',validFrom:date('2026-06-01'),endKind:'open',observedAt:datetime('2026-05-20T00:00:00Z')})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。时间先后和结束状态组合不能由 DATE/STRING 类型自动保证。确定有效查询应在这些不变量已验证的数据范围使用；它不代替输入质量检查。

```cypher
CREATE (:PolicyRevision {scope:'A',ruleCode:'BAD',revision:1,text:'Invalid interval',validFrom:date('2026-07-01'),endKind:'known',validUntil:date('2026-06-01'),observedAt:datetime('2026-05-20T00:00:00Z')})
```

## 语义检查

```cypher
MATCH (p:PolicyRevision) WHERE NOT (p.endKind IN ['known','open','unknown']) OR (p.endKind = 'known' AND (p.validUntil IS NULL OR p.validUntil <= p.validFrom)) OR (p.endKind IN ['open','unknown'] AND p.validUntil IS NOT NULL) RETURN p.ruleCode AS invalidRule ORDER BY invalidRule
```

```json
{
  "columns": [
    "invalidRule"
  ],
  "rows": [
    [
      "BAD"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：`validUntil IS NULL` 一律表示永久有效。它会把 U 混入确定有效规则。**合法替代**：数据合同明确“所有未设结束都是经确认的开放结束”，且未知单独处理时，可以省去本例的 endKind。

**错误**：以 Commit 时间判定政策生效。提前录入的规则可以未来生效，事后补录也可以追溯过去。**合法简单方案**：只要当前状态、不需要业务历史的资料不必建立多时间模型。

## 修改与维护

补到未知结束日期时，保留原观察证据并更新相应状态，不能给所有缺失值填今天。由日精度改为精确时刻前必须明确时区/转换依据，不能把旧日期统一解释成 UTC 午夜。分支历史回答数据库版本变化，不替代 scope 内规则冲突检查。

## 参考依据

参考 [OWL-Time](https://www.w3.org/TR/owl-time/) 的时刻与区间区分（核对：2026-10-20）。本例半开边界和 endKind 是此场景的原创业务约定，不是 OWL-Time 或 KG OS 强制字段。
