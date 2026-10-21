# 案例 3：人物、组织与任职区间

**需求**：区分同名人物，查询在某日担任某组织角色的人，保留离职后再次任职的两段关联。本例数据不包含真实个人隐私；身份编号来自用户认可的人员目录。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:Person

```yaml
name: "Person"
description: "可独立识别的人，名称可变且可重名。"
properties:
  - name: "personKey"
    description: "人员目录确认的稳定键；不以姓名替代。"
    type: "STRING"
    required: true
    unique: true
  - name: "name"
    description: "用于展示的姓名。"
    type: "STRING"
    required: true
constraints: []
```

### node:Organization

```yaml
name: "Organization"
description: "可独立识别的组织。"
properties:
  - name: "orgKey"
    description: "组织目录的稳定键。"
    type: "STRING"
    required: true
    unique: true
  - name: "name"
    description: "组织名称，可重名。"
    type: "STRING"
    required: true
constraints: []
```

### relationship:MEMBER_OF

```yaml
name: "MEMBER_OF"
description: "一个人在一个组织担任一个角色的一段任职；同一端点允许不同期间或角色。"
from: "node:Person"
to: "node:Organization"
properties:
  - name: "role"
    description: "在此组织的角色，不是 Person 的永久属性。"
    type: "STRING"
    required: true
  - name: "validFrom"
    description: "任职起日，包含。"
    type: "DATE"
    required: true
  - name: "validUntil"
    description: "已知结束日，排除；本例缺省明确表示仍在任。"
    type: "DATE"
constraints: []
```

## 关键取舍与保证边界

Person 与 Organization 独立存在，角色和期间附着于关系。当前场景的数据采集合同保证 validFrom 已知、缺结束即确认在任；若实际数据存在未知离职时间，应采用时效案例的显式未知表示，不能套本例默认。

本模型不强制“一人只能任职一次”或“一组织一名经理”。存在这种规则时，需按角色和时间检查重叠；`personKey` 唯一不约束关系数量。若任职本身需被独立审批、连接多个证明或参与者，再考虑 Membership 节点，不提前复制一层对象。

## 合成实例（仅隔离测试）

```cypher
CREATE (a:Person {personKey:'P1',name:'Alex'}), (b:Person {personKey:'P2',name:'Alex'}), (o:Organization {orgKey:'O1',name:'Example Lab'}),
       (a)-[:MEMBER_OF {role:'engineer',validFrom:date('2025-01-01'),validUntil:date('2025-07-01')}]->(o),
       (a)-[:MEMBER_OF {role:'engineer',validFrom:date('2026-01-01')}]->(o),
       (b)-[:MEMBER_OF {role:'reviewer',validFrom:date('2026-01-01')}]->(o)
```

## 验证问题

### 指定日期的工程角色是谁，不混入同名人物？

```cypher
MATCH (p:Person)-[m:MEMBER_OF]->(:Organization {orgKey:'O1'}) WHERE m.role = 'engineer' AND m.validFrom <= date('2026-02-01') AND (m.validUntil IS NULL OR date('2026-02-01') < m.validUntil) RETURN p.personKey AS person ORDER BY person
```

```json
{
  "columns": [
    "person"
  ],
  "rows": [
    [
      "P1"
    ]
  ]
}
```

### 同一人两次任职是否仍可辨认？

```cypher
MATCH (:Person {personKey:'P1'})-[m:MEMBER_OF]->(:Organization {orgKey:'O1'}) RETURN count(m) AS periods
```

```json
{
  "columns": [
    "periods"
  ],
  "rows": [
    [
      2
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:Person {personKey:'P1',name:'Different person'})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。关系端点类型和日期类型合法，不代表任职区间合法；先检查这些条件再回答人员有效期问题。

```cypher
MATCH (p:Person {personKey:'P1'}),(o:Organization {orgKey:'O1'}) CREATE (p)-[:MEMBER_OF {role:'reviewer',validFrom:date('2026-02-01'),validUntil:date('2026-01-01')}]->(o)
```

## 语义检查

```cypher
MATCH (p:Person)-[m:MEMBER_OF]->(:Organization) WHERE m.validUntil IS NOT NULL AND m.validUntil <= m.validFrom RETURN p.personKey AS person, m.role AS role ORDER BY person, role
```

```json
{
  "columns": [
    "person",
    "role"
  ],
  "rows": [
    [
      "P1",
      "reviewer"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：把姓名设为 unique，或把 `company`、`role` 作为人的单一永久字段，会阻碍重名、兼职与重返组织。**合法替代**：只记录一个联系人当前单位且业务不需要独立组织身份/历史时，一个文本字段可能够用。

**错误**：为了整齐，把所有 MEMBERSHIP 都升级为多节点审批流程。若只需二元关系和属性，Relationship 足够且身份独立；不要先建未来流程。

## 修改与维护

纠正姓名无需改变人员身份。合并疑似重复人物必须有目录/真实身份依据，并检查两人的全部关联，不能按名字合并。引入任职独立对象属于模型重构，迁移要保留每个期间/角色，不能只留下最后一条。

## 参考依据

参考 [W3C Organization Ontology](https://www.w3.org/TR/vocab-org/) 的组织、成员关系与角色概念（核对：2026-10-20）。此例选择 Property Graph 关系表达，不复制完整 ORG 或其组织层级语义。
