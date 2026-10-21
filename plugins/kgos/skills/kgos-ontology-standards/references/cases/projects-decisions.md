# 案例 4：项目决策与实际落地

**需求**：区分提案、已批准决策和已验证实施；回答“哪些决定已经批准但尚未验证落地、依据是什么”。不建立任务调度，也不是官方 VLog Model。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:Project

```yaml
name: "Project"
description: "一个受管理项目，项目名不是唯一身份。"
properties:
  - name: "projectKey"
    description: "项目登记键。"
    type: "STRING"
    required: true
    unique: true
  - name: "name"
    description: "项目名称。"
    type: "STRING"
    required: true
constraints: []
```

### node:Decision

```yaml
name: "Decision"
description: "一项可追溯的方案决策，批准与实施是两个不同维度。"
properties:
  - name: "decisionKey"
    description: "决策登记键。"
    type: "STRING"
    required: true
    unique: true
  - name: "statement"
    description: "决定的具体内容。"
    type: "STRING"
    required: true
  - name: "decisionState"
    description: "示例 proposed/accepted/rejected；工作流校验。"
    type: "STRING"
    required: true
  - name: "basisLocator"
    description: "讨论、报告或确认记录的定位信息。"
    type: "STRING"
    required: true
  - name: "acceptedAt"
    description: "实际批准时间；未批准则缺省。"
    type: "ZONED DATETIME"
constraints: []
```

### relationship:APPLIES_TO

```yaml
name: "APPLIES_TO"
description: "决策在某项目具体范围的适用与实施结果；不同项目可以独立落地。"
from: "node:Decision"
to: "node:Project"
properties:
  - name: "scope"
    description: "决策在该项目影响的范围；不同范围可独立实施。"
    type: "STRING"
    required: true
  - name: "deliveryState"
    description: "本项目本范围的实施状态，示例 pending/verified；由工作流校验。"
    type: "STRING"
    required: true
  - name: "verifiedAt"
    description: "本项目本范围实际核实实施的时间。"
    type: "ZONED DATETIME"
  - name: "verificationLocator"
    description: "本项目本范围实施结果的证据定位。"
    type: "STRING"
constraints: []
```

## 关键取舍与保证边界

批准状态属于 Decision，落地状态和证据属于决策在某个项目/范围的 APPLIES_TO。一个已批准决策可以在项目 P 待实施、在项目 Q 已核实；若把 deliveryState 放在 Decision 上就会错误混淆二者。本例的批准指对决策文本本身的统一确认；若每个项目的批准也独立，则批准信息也应归适用关系或独立审批对象，不能借用全局批准。

本例规定 accepted 必须有 acceptedAt；APPLIES_TO 的 verified 必须有 verifiedAt 和 verificationLocator，且指向 accepted 决策。这些是语义不变量，不是当前 Schema 自动执行的复合条件。相同决策、项目和 scope 不应重复登记；跨端点/属性组合唯一需由实际写入流程检查，不由端点约束自动保证。

Project 和 Decision 分开是为了独立追溯和多项目复用。简单笔记或统一范围实施的单项目场景可以有更轻量的模型，不要把本例所有状态字段强加给无实施追踪需求的知识。

## 合成实例（仅隔离测试）

```cypher
CREATE (p:Project {projectKey:'P',name:'Example P'}), (q:Project {projectKey:'Q',name:'Example Q'}),
       (d1:Decision {decisionKey:'D1',statement:'Use a cache',decisionState:'accepted',basisLocator:'meeting-1',acceptedAt:datetime('2026-10-01T09:00:00Z')}),
       (d2:Decision {decisionKey:'D2',statement:'Ship an API',decisionState:'accepted',basisLocator:'meeting-2',acceptedAt:datetime('2026-10-02T09:00:00Z')}),
       (d3:Decision {decisionKey:'D3',statement:'Draft idea',decisionState:'proposed',basisLocator:'draft-3'}),
       (d1)-[:APPLIES_TO {scope:'cache',deliveryState:'pending'}]->(p),
       (d1)-[:APPLIES_TO {scope:'cache',deliveryState:'verified',verifiedAt:datetime('2026-10-04T09:00:00Z'),verificationLocator:'test-run-Q1'}]->(q),
       (d2)-[:APPLIES_TO {scope:'api',deliveryState:'verified',verifiedAt:datetime('2026-10-03T09:00:00Z'),verificationLocator:'test-run-P2'}]->(p),
       (d3)-[:APPLIES_TO {scope:'future',deliveryState:'pending'}]->(p)
```

## 验证问题

### 项目 P 已批准但未验证实施的决策有哪些？

```cypher
MATCH (d:Decision)-[a:APPLIES_TO]->(:Project {projectKey:'P'}) WHERE d.decisionState = 'accepted' AND a.deliveryState = 'pending' RETURN d.decisionKey AS decision, d.basisLocator AS basis ORDER BY decision
```

```json
{"columns":["decision","basis"],"rows":[["D1","meeting-1"]]}
```

### 同一决策在两个项目的落地状态是否保持独立？

```cypher
MATCH (:Decision {decisionKey:'D1'})-[a:APPLIES_TO]->(p:Project) RETURN p.projectKey AS project, a.deliveryState AS delivery ORDER BY project
```

```json
{"columns":["project","delivery"],"rows":[["P","pending"],["Q","verified"]]}
```

### 声称已核实却缺证据的适用记录有哪些？

```cypher
MATCH (d:Decision)-[a:APPLIES_TO]->(p:Project) WHERE a.deliveryState = 'verified' AND (d.decisionState <> 'accepted' OR a.verifiedAt IS NULL OR a.verificationLocator IS NULL) RETURN d.decisionKey AS decision, p.projectKey AS project ORDER BY decision, project
```

```json
{"columns":["decision","project"],"rows":[]}
```

## 数据库反例

以下写入违反本案例明确的结构约束，应拒绝且不移动测试分支 Head；不是业务库操作建议。

```cypher
CREATE (:Decision {decisionKey:'D1',statement:'Duplicate',decisionState:'accepted',basisLocator:'other'})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。单字段约束不能证明批准和实施；审核必须找到缺失的相应证据，而非直接把 verified 当事实。

```cypher
MATCH (p:Project {projectKey:'P'}) CREATE (d:Decision {decisionKey:'D4',statement:'Unsupported completion',decisionState:'accepted',basisLocator:'draft-4'}), (d)-[:APPLIES_TO {scope:'other',deliveryState:'verified'}]->(p)
```

## 语义检查

```cypher
MATCH (d:Decision)-[a:APPLIES_TO]->(p:Project) WHERE (d.decisionState = 'accepted' AND d.acceptedAt IS NULL) OR (a.deliveryState = 'verified' AND (d.decisionState <> 'accepted' OR a.verifiedAt IS NULL OR a.verificationLocator IS NULL)) RETURN d.decisionKey AS invalidDecision ORDER BY invalidDecision
```

```json
{
  "columns": [
    "invalidDecision"
  ],
  "rows": [
    [
      "D4"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：一个 `status=done` 同时表示批准、编写、测试、发布，无法判断真实实施。**合法简化**：业务只关心决策批准状态时，不必额外跟踪 deliveryState。

**错误**：把 Git/KG OS Commit 成功当实施验证证据，或要求 AI 为未批准提案填写 acceptedAt。保存决策不等于执行决策，缺失时间应保留。

## 修改与维护

把某项目的适用关系改为实施完成需要该项目/范围的独立证据，不是文案润色；从旧全局状态迁移时不能把 verified 复制到所有项目，须逐项核实，未知者保留未决状态。增加撤回、替代关系时定义适用语义与时间，不自动将历史决定删除。模型维护中发现实例缺少验证证据，先报告数据/流程缺口，不能把 required 放宽后宣称知识质量问题解决。

## 参考依据

这是 KG OS 原创业务案例；状态和所需证据仅由上述场景定义。来源定位参考资料案例的语义，不创建另一套官方 VLog 规则。
