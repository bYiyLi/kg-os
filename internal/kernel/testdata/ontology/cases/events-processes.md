# 案例 5：流程运行、事件和重试

**需求**：保留一个流程实际发生的事件，区分失败后重试的不同尝试，并按采集约定的顺序读取事件；同一时刻不推导唯一顺序。不建立执行器或调度平台。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:ProcessRun

```yaml
name: "ProcessRun"
description: "一次实际流程运行，不是计划或任务定义。"
properties:
  - name: "runKey"
    description: "外部执行方给出的运行键。"
    type: "STRING"
    required: true
    unique: true
  - name: "purpose"
    description: "本次运行的目标。"
    type: "STRING"
    required: true
constraints: []
```

### node:ProcessEvent

```yaml
name: "ProcessEvent"
description: "一次发生事件或收到的执行回执，不表示未来计划。"
properties:
  - name: "eventKey"
    description: "执行方的事件键，用于识别重复投递。"
    type: "STRING"
    required: true
    unique: true
  - name: "kind"
    description: "事件类别；示例 attempt-finished。"
    type: "STRING"
    required: true
  - name: "attempt"
    description: "执行方定义的尝试序号，不从时间猜测。"
    type: "INTEGER"
    required: true
  - name: "outcome"
    description: "该事件报告的结果，不等于整个流程状态。"
    type: "STRING"
    required: true
  - name: "occurredAt"
    description: "实际发生时间；未知时缺省。"
    type: "ZONED DATETIME"
  - name: "observedAt"
    description: "采集到该回执的时间。"
    type: "ZONED DATETIME"
    required: true
constraints: []
```

### relationship:IN_RUN

```yaml
name: "IN_RUN"
description: "事件归属某个运行；顺序由执行方在该运行内定义，不是全局时间顺序。"
from: "node:ProcessEvent"
to: "node:ProcessRun"
properties:
  - name: "sequence"
    description: "运行内的记录顺序；正值和同运行唯一由采集检查保证。"
    type: "INTEGER"
    required: true
constraints: []
```

## 关键取舍与保证边界

独立 Event 保留重试、来源和时刻，不覆盖成一个模糊 `run.status=done`。若需要派生当前状态，必须另有事件解释规则；最后记录的事件可能是补录、清理或诊断，不能无条件视为业务成功。

eventKey 可拒绝重复身份，但不自动保证“事件恰好属于一个 Run”或“sequence 在同 Run 唯一”；这些属于跨边应用约束。发生时间与观察时间独立，时间相同不能合并事件。没有顺序合同的外部来源应保留局部顺序/未知，不能借本例伪造全序。

## 合成实例（仅隔离测试）

```cypher
CREATE (r:ProcessRun {runKey:'RUN1',purpose:'Import'}),
       (e1:ProcessEvent {eventKey:'E1',kind:'attempt-finished',attempt:1,outcome:'failed',occurredAt:datetime('2026-10-01T10:00:00Z'),observedAt:datetime('2026-10-01T10:00:01Z')}),
       (e2:ProcessEvent {eventKey:'E2',kind:'attempt-finished',attempt:2,outcome:'succeeded',occurredAt:datetime('2026-10-01T10:00:00Z'),observedAt:datetime('2026-10-01T10:00:02Z')}),
       (e1)-[:IN_RUN {sequence:1}]->(r), (e2)-[:IN_RUN {sequence:2}]->(r)
```

## 验证问题

### 最后记录的是哪个事件，而不是推定整个流程成功？

```cypher
MATCH (e:ProcessEvent)-[i:IN_RUN]->(:ProcessRun {runKey:'RUN1'}) RETURN e.eventKey AS event, e.attempt AS attempt, e.outcome AS outcome ORDER BY i.sequence DESC LIMIT 1
```

```json
{
  "columns": [
    "event",
    "attempt",
    "outcome"
  ],
  "rows": [
    [
      "E2",
      2,
      "succeeded"
    ]
  ]
}
```

### 失败尝试有没有被成功重试覆盖？

```cypher
MATCH (e:ProcessEvent)-[i:IN_RUN]->(:ProcessRun {runKey:'RUN1'}) RETURN e.eventKey AS event, e.outcome AS outcome ORDER BY i.sequence
```

```json
{
  "columns": [
    "event",
    "outcome"
  ],
  "rows": [
    [
      "E1",
      "failed"
    ],
    [
      "E2",
      "succeeded"
    ]
  ]
}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:ProcessEvent {eventKey:'E1',kind:'attempt-finished',attempt:3,outcome:'failed',observedAt:datetime('2026-10-01T11:00:00Z')})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。sequence 同运行唯一不由其 INTEGER 属性约束；若检查失败，就不能按该顺序宣称最后事件唯一。

```cypher
MATCH (r:ProcessRun {runKey:'RUN1'}) CREATE (e:ProcessEvent {eventKey:'E3',kind:'diagnostic',attempt:2,outcome:'observed',observedAt:datetime('2026-10-01T10:00:03Z')}), (e)-[:IN_RUN {sequence:2}]->(r)
```

## 语义检查

```cypher
MATCH (:ProcessEvent)-[i:IN_RUN]->(r:ProcessRun) WITH r.runKey AS run, i.sequence AS sequence, count(i) AS occurrences WHERE occurrences > 1 RETURN run, sequence, occurrences ORDER BY run, sequence
```

```json
{
  "columns": [
    "run",
    "sequence",
    "occurrences"
  ],
  "rows": [
    [
      "RUN1",
      2,
      2
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：用发生时间作唯一键，相同时间的两个重试被覆盖；或把 occurredAt 缺失填成 observedAt 并声称是真实发生时刻。**合理替代**：确实只有一条不变的最终结果且无需事件追溯时，直接保存结果对象更简单。

**错误**：把 `sequence` 设为关系属性全局 unique，导致不同运行都不能有第 1 个事件。顺序作用域属于 Run，当前示例用采集检查承担该语义。

## 修改与维护

新增事件类型先检查解释规则是否将所有未知类型错误计为成功。合并事件源时保存各自身份和排序依据；补录不能假装最早知道。需要表达多参与者或因果时再增加明确关系，不能把序号自动解释成因果边。

## 参考依据

原创流程建模案例；参考 [PROV-O](https://www.w3.org/TR/prov-o/) 区分生成活动和其产物的思想（核对：2026-10-20），不声称这是 KG OS VLog 的正式结构或调度协议。
