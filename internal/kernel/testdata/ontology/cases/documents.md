# 案例 1：资料、来源快照与引文

<!-- cspell:words DCMI -->

**需求**：保存研究笔记，回答“引用了哪次获取的原材料、原文哪一段、只是引用还是用作支持”；同一 URL 的两次内容捕获必须可区分。本文不判断引文的真实性，也不设计完整文献管理系统。先遵守 [案例约定](../case-conventions.md)。

## 模型

### node:ResearchNote

```yaml
name: "ResearchNote"
description: "一条研究笔记，不是来源原文或已经证实的事实。"
properties:
  - name: "noteKey"
    description: "本笔记库分配的稳定编号；不是标题。"
    type: "STRING"
    required: true
    unique: true
  - name: "title"
    description: "笔记标题，可重名。"
    type: "STRING"
    required: true
  - name: "body"
    description: "提炼内容；可信程度由实际依据判断。"
    type: "STRING"
    required: true
    indexes:
      - name: "research_note_body_fulltext"
        type: "fulltext"
      - name: "research_note_body_semantic"
        type: "vector"
constraints: []
```

### node:SourceSnapshot

```yaml
name: "SourceSnapshot"
description: "一次材料内容捕获；一个 locator 可以有多个快照。"
properties:
  - name: "snapshotKey"
    description: "该次捕获的稳定编号，不由 URL 唯一替代。"
    type: "STRING"
    required: true
    unique: true
  - name: "locator"
    description: "原始材料定位符，可以是 URL 或受控文档编号。"
    type: "STRING"
    required: true
  - name: "snapshotLocator"
    description: "本次捕获内容的持久定位；应指向可核实的归档或已保存快照，不是可变原始 URL。"
    type: "STRING"
    required: true
  - name: "capturedAt"
    description: "真实采集时间；未知时不能填当前时间。"
    type: "ZONED DATETIME"
    required: true
  - name: "publishedOn"
    description: "材料已知的日精度发布日期；缺省为未知。"
    type: "DATE"
  - name: "contentDigest"
    description: "已实际计算的内容摘要；缺省表示未计算，不是内容必定相同。"
    type: "STRING"
constraints: []
```

### relationship:CITES

```yaml
name: "CITES"
description: "从笔记指向所引用的材料快照，不自动表示来源支持笔记。"
from: "node:ResearchNote"
to: "node:SourceSnapshot"
properties:
  - name: "locatorWithin"
    description: "页码、段落或可定位原文的片段标识。"
    type: "STRING"
    required: true
  - name: "use"
    description: "示例约定 quote/support/contradict；由写入工作流验证，不是 Schema enum。"
    type: "STRING"
    required: true
constraints: []
```

## 关键取舍与保证边界

ResearchNote 和 SourceSnapshot 的身份分别代表笔记与捕获；URL 不唯一，防止把可变网页当成不可变原文。snapshotLocator 指向实际保存的内容版本；仅有编号、时间或摘要不能重现原文，归档访问性仍须由采集任务核实。本例不声称 KG OS 自动提供网页归档服务。CITES 上的片段位置属于这次引用，不属于来源全体。`use` 表达引用意图，不证明证据真实或充分。

本场景要求采集时间和片段定位，所以设为 required；未知来源的草稿应保留在适合它的模型/流程，不能伪造元数据凑约束。只有文献而不需要版本/复用时，可简化成 Document 的 sourceLocator、capturedAt 等属性；无需强制分出 SourceSnapshot。

正文的全文与单 STRING 托管语义索引服务于两种实际检索需求。创建和读取索引定义不等于外部 embedding 查询已经验证；下面只验证结构化证据查询。

## 合成实例（仅隔离测试）

```cypher
CREATE (n:ResearchNote {noteKey:'N1',title:'Cache note',body:'Cache behavior changed'}),
       (s1:SourceSnapshot {snapshotKey:'S1',locator:'https://example.invalid/report',snapshotLocator:'archive:S1',capturedAt:datetime('2026-10-01T08:00:00Z')}),
       (s2:SourceSnapshot {snapshotKey:'S2',locator:'https://example.invalid/report',snapshotLocator:'archive:S2',capturedAt:datetime('2026-10-02T08:00:00Z')}),
       (n)-[:CITES {locatorWithin:'section-2',use:'support'}]->(s1),
       (n)-[:CITES {locatorWithin:'section-3',use:'contradict'}]->(s2)
```

## 验证问题

### 笔记实际引用了哪个版本和片段？

```cypher
MATCH (n:ResearchNote {noteKey:'N1'})-[c:CITES]->(s:SourceSnapshot) RETURN s.snapshotKey AS snapshot, s.snapshotLocator AS archive, c.locatorWithin AS location, c.use AS use ORDER BY snapshot
```

```json
{
  "columns": [
    "snapshot",
    "archive",
    "location",
    "use"
  ],
  "rows": [
    [
      "S1",
      "archive:S1",
      "section-2",
      "support"
    ],
    [
      "S2",
      "archive:S2",
      "section-3",
      "contradict"
    ]
  ]
}
```

### 同一来源是否保留两次捕获？

```cypher
MATCH (s:SourceSnapshot {locator:'https://example.invalid/report'}) RETURN count(s) AS captures
```

```json
{
  "columns": [
    "captures"
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
CREATE (:SourceSnapshot {snapshotKey:'S1',locator:'other',snapshotLocator:'archive:other',capturedAt:datetime('2026-10-03T08:00:00Z')})
```

## 语义反例（仅隔离测试）

在上面的正例查询和结构拒绝检查完成之后，单独加入下列业务上不合格、但数据库结构仍可接受的记录。该状态值不在案例约定内，但 STRING 类型仍能存储；引用含义必须经实际知识任务判断。

```cypher
MATCH (n:ResearchNote {noteKey:'N1'}), (s:SourceSnapshot {snapshotKey:'S1'}) CREATE (n)-[:CITES {locatorWithin:'section-4',use:'proves'}]->(s)
```

## 语义检查

```cypher
MATCH (n:ResearchNote)-[c:CITES]->(s:SourceSnapshot) WHERE NOT (c.use IN ['quote','support','contradict']) OR c.locatorWithin = '' RETURN n.noteKey AS note, c.use AS invalidUse ORDER BY note, invalidUse
```

```json
{
  "columns": [
    "note",
    "invalidUse"
  ],
  "rows": [
    [
      "N1",
      "proves"
    ]
  ]
}
```

## 反面模型与合理替代

**错误**：把 `locator` 设为全局 unique 并覆盖旧内容，无法回答笔记引用的是哪个版本。**近邻合法方案**：只管理一个来源资源的最新状态且明确不追踪版本时，资源 URL 唯一可以成立，但不是本案例需求。

**错误**：把 `CITES` 统一改名成 `PROVES`。引用或单个来源不能自动证明事实。复杂的多来源争议可增加独立论断与证据对象；只有资料摘录无需这一层。

## 修改与维护

发现同一捕获被重复导入，先用真实材料版本/摘要和采集语义判断，不能只按 URL 合并。将 `capturedAt` 重命名为 `publishedAt` 会改变含义，不是纯改名；新增发布日期时只能从材料证据补充，缺失仍保留未知。未来独立管理作者或出处机构时，复用现有对象，不为本例批量生成 Person。

## 参考依据

参考 [DCMI Terms](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/) 的来源、创建者、发布元数据概念和 [PROV-O](https://www.w3.org/TR/prov-o/) 的派生与限定溯源思路（核对：2026-10-20）。此 Property Graph 为原创案例，不声称实现这些 RDF 词汇或其全部语义。
