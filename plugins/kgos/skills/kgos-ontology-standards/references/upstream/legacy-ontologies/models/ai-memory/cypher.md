# AIMemory · 真实业务查询

这些只读查询要求 [本体](ontology.md) 的相关 Definition 已在同一目标 State 中安装；Q5、Q8、Q9 还要求该 State 内有兼容的 Source/Event/Place/Entity 及真实证据关系。当前仓库借用 [VLog 本体](../vlog/ontology.md) 中这些共享 Definition 进行隔离测试，不意味着必须创建 VLog Branch。

固定实际读取 State、核对真实授权、记忆归属和查询范围。任意示例结果/Top-K 零命中都不能代替完整枚举；来源、有效性、分类和 Cue 均需独立核实。所有 Qn 是参数化查询，不会写入数据。

## Q1：按归属与记忆类型查找

实际归属和分类均为明确字段/边。

```cypher
MATCH (m:Memory {ownerKey: $ownerKey})-[:HAS_KIND]->(k:MemoryKind {kindKey: $kindKey})
RETURN m.memoryKey AS memoryKey, m.summary AS summary
ORDER BY memoryKey
```

## Q2：按直接主题找记忆

只覆盖显式 IN_TOPIC，不隐含所有子主题。

```cypher
MATCH (m:Memory {ownerKey: $ownerKey})-[:IN_TOPIC]->(t:MemoryTopic {topicKey: $topicKey})
RETURN m.memoryKey AS memoryKey, m.lifecycle AS lifecycle
ORDER BY memoryKey
```

## Q3：按一个子主题层级查找

只查一层显式 SUBTOPIC_OF，不宣称无界层级全覆盖。

```cypher
MATCH (child:MemoryTopic)-[:SUBTOPIC_OF]->(parent:MemoryTopic {topicKey: $parentKey})
MATCH (m:Memory {ownerKey: $ownerKey})-[:IN_TOPIC]->(child)
RETURN m.memoryKey AS memoryKey, child.topicKey AS topicKey
ORDER BY memoryKey
```

## Q4：按召回线索找候选

匹配 Cue 仅产生候选，仍须判断有效性与授权。

```cypher
MATCH (m:Memory {ownerKey: $ownerKey})-[:RECALLED_WHEN]->(c:MemoryCue {cueKey: $cueKey})
RETURN m.memoryKey AS memoryKey, m.summary AS summary
ORDER BY memoryKey
```

## Q5：记忆证据与用途

来源必须是实际可访问的 Source，edge 用途不能冒充独立验证。

```cypher
MATCH (m:Memory {memoryKey: $memoryKey})-[link:EVIDENCED_BY]->(s:Source)
RETURN s.sourceKey AS sourceKey, s.locator AS locator, link.use AS evidenceUse
ORDER BY sourceKey
```

## Q6：现实变化的直接替代关系

SUPERSEDES 是明确、非自动传递关系，纠错不应虚造现实变化。

```cypher
MATCH (current:Memory)-[:SUPERSEDES]->(old:Memory {memoryKey: $oldKey})
RETURN current.memoryKey AS currentKey, old.memoryKey AS oldKey
ORDER BY currentKey
```

## Q7：某归属的当前记忆

仅是已记录 lifecycle=current 的集合；不等于权限校验，也不说明未知状态不适用。

```cypher
MATCH (m:Memory {ownerKey: $ownerKey, lifecycle: 'current'})
RETURN m.memoryKey AS memoryKey
ORDER BY memoryKey
```

## Q8：与事件及实际地点关联的记忆

需要同一 Snapshot 内真实的 Event / Place / OCCURRED_AT 模型，未提供地点不能编造。

```cypher
MATCH (m:Memory)-[:FORMED_DURING]->(e:Event {eventKey: $eventKey})
MATCH (e)-[:OCCURRED_AT]->(p:Place {placeKey: $placeKey})
RETURN m.memoryKey AS memoryKey, e.eventKey AS eventKey
ORDER BY memoryKey
```

## Q9：记忆涉及一个真实领域对象

这里的 Entity 来自选用的兼容模型；ABOUT to:null 并不自动强制身份。

```cypher
MATCH (m:Memory {ownerKey: $ownerKey})-[:ABOUT]->(x:Entity {entityKey: $entityKey})
RETURN m.memoryKey AS memoryKey, x.name AS entityName
ORDER BY memoryKey
```
