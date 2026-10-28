# KG OS 本体论建模案例

本文件包含三个**合成业务场景**，用于从实际问题出发判断概念、身份、关系和分类，并用 KG OS 公共 Definition YAML 与 Cypher 表达。各案例彼此独立，属于教学与隔离测试数据，不是生产事实、通用强制 Schema 或可跨案例一次导入的完整 Ontology。

使用顺序：先说明要回答什么问题及为什么如此建模，再读取相应 `### node:` / `### relationship:` 下完整 `yaml` 代码块；实际操作依据当前 `kgos_docs`、目标 State 和授权执行。仓库的真实 Lithograph 测试从**本文件原文**创建 Definition、写入合成数据、查询和验证反例，不复制第二份 YAML。

## 案例 A：分类是 Knowledge，不是每种类别一个 Definition

**能力问题**：哪些观察属于“安全事件”？以后增加新的观察类别，是否需要迁移数据库 Schema？

**语义决策**：`Observation` 是一次有身份的观察事实，`ObservationCategory` 是可持续扩展的分类 Knowledge，`CLASSIFIED_AS` 表达具体分类关系。分类本身的名称不决定另一种 Node Definition。每条观察可选择适当分类，分类关系本身不证明观察已独立验证。

### node:Observation

```yaml
name: "Observation"
description: "一次具有稳定身份的已记录观察；它可能尚未经过独立验证。"
properties:
  - name: "observationKey"
    type: "STRING"
    required: true
    unique: true
    description: "来源身份作用域内确认的观察键。"
  - name: "summary"
    type: "STRING"
    required: true
    description: "实际观察或报告的摘要，不伪造验证。"
constraints: []
```

### node:ObservationCategory

```yaml
name: "ObservationCategory"
description: "可复用的分类概念；新增类别时添加实例而非新 Node Definition。"
properties:
  - name: "categoryKey"
    type: "STRING"
    required: true
    unique: true
    description: "该分类词表内稳定的类别键。"
  - name: "name"
    type: "STRING"
    required: true
    description: "可展示的类别名称。"
constraints: []
```

### relationship:CLASSIFIED_AS

```yaml
name: "CLASSIFIED_AS"
description: "将一次观察归于某个适用类别；只表达已保存的分类判断。"
from: "node:Observation"
to: "node:ObservationCategory"
properties:
  - name: "basis"
    type: "STRING"
    description: "本次分类的可得依据；不是独立核实的证明。"
constraints: []
```

## 合成实例 A

```cypher
CREATE (a:ObservationCategory {categoryKey:'security',name:'Security issue'}),
       (b:ObservationCategory {categoryKey:'routine',name:'Routine check'}),
       (c:ObservationCategory {categoryKey:'field-study',name:'Field study'}),
       (x:Observation {observationKey:'O1',summary:'Reported unusual access'}),
       (y:Observation {observationKey:'O2',summary:'Routine review recorded'}),
       (z:Observation {observationKey:'O3',summary:'Field study observation'}),
       (x)-[:CLASSIFIED_AS]->(a),
       (y)-[:CLASSIFIED_AS]->(b),
       (z)-[:CLASSIFIED_AS]->(c)
```

## 验证问题 A

### Q1：指定分类的观察是否可查？

```cypher
MATCH (o:Observation)-[:CLASSIFIED_AS]->(:ObservationCategory {categoryKey:'security'}) RETURN o.observationKey AS key ORDER BY key
```

```json
{"columns":["key"],"rows":[["O1"]]}
```

### Q2：新增“field-study”类别后，仍使用已有 Definition 吗？

```cypher
MATCH (o:Observation)-[:CLASSIFIED_AS]->(:ObservationCategory {categoryKey:'field-study'}) RETURN o.observationKey AS key ORDER BY key
```

```json
{"columns":["key"],"rows":[["O3"]]}
```

## 数据库反例 A

唯一业务键重复应该被实际数据库约束拒绝，不应创建第二个 O1。

```cypher
CREATE (:Observation {observationKey:'O1',summary:'Duplicate ID'})
```

## 语义反例 A

数据库允许保存缺乏独立验证的报告，不能据此自动推断其真实。

```cypher
CREATE (:Observation {observationKey:'O4',summary:'Claimed resolved without verification'})
```

## 语义检查 A

```cypher
MATCH (o:Observation {observationKey:'O4'}) RETURN o.summary AS reported
```

```json
{"columns":["reported"],"rows":[["Claimed resolved without verification"]]}
```

## 案例 B：角色与有效期间属于关系，而不是人的永久属性

**能力问题**：两个人同名，谁在某一天任职？同一个人先离职后复职，能否保留两段关联？

**语义决策**：`Person`、`Organization` 是可独立识别的对象；`MEMBER_OF` 是可拥有 Property 的一等 Relationship，角色与期间属于**每次任职关系**，不属于 Person 的永久 Property。是否需另建 Membership Node 取决于独立审批、参与者或进一步证据关联需求；本案例没有这类要求。

### node:Person

```yaml
name: "Person"
description: "具有身份的个人；展示名不能作为稳定身份。"
properties:
  - name: "personKey"
    type: "STRING"
    required: true
    unique: true
    description: "由本案例实际身份来源确认的唯一键。"
  - name: "name"
    type: "STRING"
    required: true
    description: "可重名的展示名称。"
constraints: []
```

### node:Organization

```yaml
name: "Organization"
description: "具有稳定身份的组织，与人员独立存在。"
properties:
  - name: "orgKey"
    type: "STRING"
    required: true
    unique: true
    description: "组织身份来源确认的稳定键。"
  - name: "name"
    type: "STRING"
    required: true
    description: "组织名称，可变或重名。"
constraints: []
```

### relationship:MEMBER_OF

```yaml
name: "MEMBER_OF"
description: "一个人在一段有依据的期间内担任某组织的角色；相同端点可有不同期间。"
from: "node:Person"
to: "node:Organization"
properties:
  - name: "role"
    type: "STRING"
    required: true
    description: "本次关系中的角色，不是 Person 固定身份。"
  - name: "validFrom"
    type: "DATE"
    required: true
    description: "任职开始日期，包含。"
  - name: "validUntil"
    type: "DATE"
    description: "已确认任职结束日期，排除。本合成样本中缺省表示尚在任，不适用于未知终止时间的真实数据。"
constraints: []
```

## 合成实例 B

```cypher
CREATE (a:Person {personKey:'P1',name:'Alex'}),
       (b:Person {personKey:'P2',name:'Alex'}),
       (o:Organization {orgKey:'O1',name:'Example Studio'}),
       (a)-[:MEMBER_OF {role:'engineer',validFrom:date('2025-01-01'),validUntil:date('2025-07-01')}]->(o),
       (a)-[:MEMBER_OF {role:'engineer',validFrom:date('2026-01-01')}]->(o),
       (b)-[:MEMBER_OF {role:'reviewer',validFrom:date('2026-01-01')}]->(o)
```

## 验证问题 B

### Q1：指定日期谁担任工程师？

```cypher
MATCH (p:Person)-[m:MEMBER_OF]->(:Organization {orgKey:'O1'}) WHERE m.role = 'engineer' AND m.validFrom <= date('2026-02-01') AND (m.validUntil IS NULL OR date('2026-02-01') < m.validUntil) RETURN p.personKey AS person ORDER BY person
```

```json
{"columns":["person"],"rows":[["P1"]]}
```

### Q2：同一人两段任职是否都存在？

```cypher
MATCH (:Person {personKey:'P1'})-[m:MEMBER_OF]->(:Organization {orgKey:'O1'}) RETURN count(m) AS periods
```

```json
{"columns":["periods"],"rows":[[2]]}
```

## 数据库反例 B

```cypher
CREATE (:Person {personKey:'P1',name:'Another person'})
```

## 语义反例 B

数据库不会自动检查“本次任职的角色是否由真实来源证实”。

```cypher
MATCH (p:Person {personKey:'P2'}),(o:Organization {orgKey:'O1'}) CREATE (p)-[:MEMBER_OF {role:'unverified-chief',validFrom:date('2026-02-01')}]->(o)
```

## 语义检查 B

```cypher
MATCH (:Person {personKey:'P2'})-[m:MEMBER_OF {role:'unverified-chief'}]->(:Organization {orgKey:'O1'}) RETURN m.role AS unverifiedRole
```

```json
{"columns":["unverifiedRole"],"rows":[["unverified-chief"]]}
```

## 案例 C：同一来源的不同捕获版本不能靠 URL 合并

**能力问题**：某条知识引用的是哪次捕获的材料？同一链接后来内容变化，能否保留两次捕获及其片段与用途？

**语义决策**：`KnowledgeNote` 是调用方提炼的知识记录；`SourceCapture` 是一次实际保存的材料捕获版本，URL 不是快照唯一身份；`CITES` 指向**具体捕获**，并保存引用片段和用途。引用不自动证明来源支持或内容真实。

### node:KnowledgeNote

```yaml
name: "KnowledgeNote"
description: "有身份的知识笔记，内容与材料源版本分开。"
properties:
  - name: "noteKey"
    type: "STRING"
    required: true
    unique: true
    description: "笔记身份键。"
  - name: "summary"
    type: "STRING"
    required: true
    description: "笔记主张或摘要，不预设已经独立证实。"
constraints: []
```

### node:SourceCapture

```yaml
name: "SourceCapture"
description: "同一来源的一次有依据的内容捕获；两个时间的捕获不是同一个实例。"
properties:
  - name: "captureKey"
    type: "STRING"
    required: true
    unique: true
    description: "此次内容捕获的稳定身份。"
  - name: "locator"
    type: "STRING"
    required: true
    description: "原始链接或来源标识，可能多次指向不同内容版本。"
  - name: "snapshotLocator"
    type: "STRING"
    required: true
    description: "本次实际存储内容的定位，不等于可能变化的原链接。"
  - name: "capturedAt"
    type: "ZONED DATETIME"
    required: true
    description: "已知实际捕获时间。"
constraints: []
```

### relationship:CITES

```yaml
name: "CITES"
description: "笔记引用一次已明确的材料捕获，引用的用途与片段属于这条关系。"
from: "node:KnowledgeNote"
to: "node:SourceCapture"
properties:
  - name: "locatorWithin"
    type: "STRING"
    required: true
    description: "实际引用的片段位置。"
  - name: "use"
    type: "STRING"
    required: true
    description: "当前使用意图，如 quote、support、contradict，由应用核实而非数据库枚举。"
constraints: []
```

## 合成实例 C

```cypher
CREATE (n:KnowledgeNote {noteKey:'N1',summary:'Revised service behavior'}),
       (a:SourceCapture {captureKey:'S1',locator:'https://example.invalid/reference',snapshotLocator:'archive:S1',capturedAt:datetime('2026-10-01T08:00:00Z')}),
       (b:SourceCapture {captureKey:'S2',locator:'https://example.invalid/reference',snapshotLocator:'archive:S2',capturedAt:datetime('2026-10-02T08:00:00Z')}),
       (n)-[:CITES {locatorWithin:'section-A',use:'quote'}]->(a),
       (n)-[:CITES {locatorWithin:'section-B',use:'contradict'}]->(b)
```

## 验证问题 C

### Q1：这条笔记分别引用了哪个捕获版本和片段？

```cypher
MATCH (:KnowledgeNote {noteKey:'N1'})-[c:CITES]->(s:SourceCapture) RETURN s.captureKey AS capture,c.locatorWithin AS part,c.use AS use ORDER BY capture
```

```json
{"columns":["capture","part","use"],"rows":[["S1","section-A","quote"],["S2","section-B","contradict"]]}
```

### Q2：同一 URL 被捕获过多少个独立版本？

```cypher
MATCH (s:SourceCapture {locator:'https://example.invalid/reference'}) RETURN count(s) AS versions
```

```json
{"columns":["versions"],"rows":[[2]]}
```

## 数据库反例 C

```cypher
CREATE (:SourceCapture {captureKey:'S1',locator:'https://example.invalid/reference',snapshotLocator:'archive:duplicate',capturedAt:datetime('2026-10-03T08:00:00Z')})
```

## 语义反例 C

能保存一条错误主张，并不代表材料真实支持它；`CITES.use` 是作者记录的使用意图。

```cypher
CREATE (:KnowledgeNote {noteKey:'N2',summary:'Unsubstantiated assertion'})
```

## 语义检查 C

```cypher
MATCH (n:KnowledgeNote {noteKey:'N2'}) RETURN n.summary AS assertion
```

```json
{"columns":["assertion"],"rows":[["Unsubstantiated assertion"]]}
```

---

上述三个示例分别展示了**分类扩展、本体角色/关系时间、来源版本身份**。需要系统日志的专用事件 Ontology 时，可在确实安装且适用的情况下选择 `kgos-vlog-standards`；不能把它强制作为所有领域的默认基础本体。模型决定应以 [本体论方法论](ontology-methodology.md) 与当前知识世界真实需求为准。
