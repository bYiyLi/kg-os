# VLog 常见业务查询

这些查询只适用于 [事件中心本体](ontology.md) 中相应 Definition 已在目标 State 真实存在的场景。所有查询均为只读示例，传入实际用户任务确认过的参数，先固定查询 State；不默认当前分支就是 `branch/vlog`。没有查询结果不等于系统现实中未发生相应事件，分页、权限与查询覆盖须按实际需要核实。

每个 `Qn` 小节恰好包含一个完整 `cypher` 代码块。仓库的隔离测试从本文件直接提取并执行查询，测试数据不在运行时 Skill 中分发。

## Q1：按事件类别查询

**问题**：指定类别的真实事件有哪些？新增类别（例如 `security-incident`）只增加 `Concept` Knowledge，不需要修改 Event Definition。类别概念必须使用稳定键。

```cypher
MATCH (e:Event)-[:HAS_TYPE]->(c:Concept {conceptKey: $conceptKey})
RETURN e.eventKey AS eventKey, e.summary AS summary, e.outcome AS outcome
ORDER BY eventKey
```

## Q2：与某个实体相关的事件

**问题**：某系统、Agent、项目或环境实际参与了哪些事件，承担什么角色？目标软件环境属于 Entity，不当作物理地点。

```cypher
MATCH (e:Event)-[link:INVOLVES]->(x:Entity {entityKey: $entityKey})
RETURN e.eventKey AS eventKey, link.role AS role
ORDER BY eventKey
```

## Q3：一项事件之后发生了哪些直接后续事件

**问题**：已记录的直接后续尝试有哪些？`FOLLOWS` 仅表示有据的先后，不能推断因果、全序或自动传递。

```cypher
MATCH (later:Event)-[:FOLLOWS]->(earlier:Event {eventKey: $eventKey})
RETURN later.eventKey AS eventKey, later.outcome AS outcome
ORDER BY eventKey
```

## Q4：一项操作的独立验证结果

**问题**：对应这一次执行的验证是否通过？执行成功不能替代验证成功。验证是独立 Event，经 `VERIFIES` 指向被验证 Event。

```cypher
MATCH (v:Event)-[:VERIFIES]->(operation:Event {eventKey: $eventKey})
MATCH (v)-[:HAS_TYPE]->(:Concept {conceptKey: 'verification'})
RETURN v.eventKey AS verificationKey, v.outcome AS outcome
ORDER BY verificationKey
```

## Q5：事件证据及来源版本

**问题**：记录引用了哪份回执或材料，它原本属于哪个来源分支？Source 的定位属性不是跨 Branch 的 Graph Relationship；所列版本和业务事实都必须另按真实证据解释。

```cypher
MATCH (e:Event {eventKey: $eventKey})-[:DOCUMENTED_BY]->(s:Source)
RETURN s.sourceKey AS sourceKey, s.locator AS locator, s.sourceBranch AS sourceBranch
ORDER BY sourceKey
```

## Q6：某物理地点在指定时间窗口内的事件

**问题**：哪些事件明确发生在这个物理地点，并关联到一个独立时间窗口？如果仅有 Event 自身的 `occurredAt`，不应仅因此造 Time 节点；此查询只覆盖具有这两种已记录关系的事件。

```cypher
MATCH (e:Event)-[:OCCURRED_AT]->(p:Place {placeKey: $placeKey})
MATCH (e)-[:OCCURRED_DURING]->(t:Time {timeKey: $timeKey})
RETURN e.eventKey AS eventKey, t.timeKey AS timeKey
ORDER BY eventKey
```

## 查询语义边界

- 以上都是基于真实图关系的定向查询，不能用缺失 `FOLLOWS`、`VERIFIES` 或 `DOCUMENTED_BY` 推断现实中没有先后、验证或来源；未建立的关系不应编造。
- 查询 `Event.outcome` 只能说明该事件本身的实际记录结果；`outcome: succeeded` 不能证明关联验证已通过，验证 Event 的结论也不证明所有环境与版本通过。
- 具体分页、全文/向量搜索、时间比较、Cypher 支持范围以当前连接的 `kgos_docs` 和实际模型为准。需要完整枚举时按真实查询能力处理，不能把示例结果冒充全量知识。
