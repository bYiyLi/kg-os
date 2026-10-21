# 案例：身份和图关系上下文

应用 [问题与策略](../strategy.md)。所有对象、记录和索引名为合成案例的既定条件，不是 KG OS 内置模型。下面只读 Cypher 的 `json` 块给出该合成快照的预期列/行；实际操作须使用真实模型和真实State，不将示例当用户数据或自动运行清单。

## I1：相似项目不是用户指定项目

既有 `RetrievalProject` 的key是已确认的业务唯一标识；P和Q名称都为“Atlas”，P负责人Mina，Q负责人Noah。用户问P的负责人，已知道对应模型和key；不需要语义搜索“Atlas”、重新遍历全部Ontology或把两个同名结果合并。

### exact-project

```cypher
MATCH (p:RetrievalProject {key:'P'}) RETURN p.key AS project, p.owner AS owner
```

```json
{"columns":["project","owner"],"rows":[["P","Mina"]]}
```

**可结束条件**：实际匹配身份唯一、owner含义明确、结果完整，足以回答“该库中P记录的负责人”。用户改问“Atlas是谁负责”且无法确认P/Q，则需消歧，不能自动选第一名。已知真实Object Ref时可直接读取，不必为了本例再按key搜索。

## I2：两条边不等于两家公司

人员A通过两个不同任职事件M1、M2关联同一组织O，关系类型`RETRIEVAL_WORKS_AT`及periodKey、role均已定义。问“此人有多少个任职事件”与“任职于多少家不同组织”需要不同计数。

### episodes-and-organizations

```cypher
MATCH (:RetrievalPerson {key:'A'})-[r:RETRIEVAL_WORKS_AT]->(o:RetrievalOrg)
RETURN count(r) AS episodes, count(DISTINCT o) AS organizations
```

```json
{"columns":["episodes","organizations"],"rows":[[2,1]]}
```

**危险反例**：把两条路径说成两家组织，或为了去重删除M2。读取规范不处理实例删除；角色/期间属于对应关系，不从Person或其它任职推断。

## I3：有路径，不代表直接依赖或因果

组件A依赖B，B依赖C，没有A到C的直接边。用户问“是否直接依赖C”不能用两跳路径回答是；用户问“能否沿依赖路径到达C”则两跳足够。图中可达也不是未经定义的因果关系。

### direct-dependency

```cypher
MATCH (:RetrievalComponent {key:'A'})-[r:RETRIEVAL_DEPENDS_ON]->(:RetrievalComponent {key:'C'})
RETURN count(r) AS directEdges
```

```json
{"columns":["directEdges"],"rows":[[0]]}
```

### two-hop-dependency

```cypher
MATCH (:RetrievalComponent {key:'A'})-[:RETRIEVAL_DEPENDS_ON]->(b:RetrievalComponent)-[:RETRIEVAL_DEPENDS_ON]->(:RetrievalComponent {key:'C'})
RETURN b.key AS intermediate
```

```json
{"columns":["intermediate"],"rows":[["B"]]}
```

**范围**：这证明给定快照的直边数量和明确两跳路径，不证明所有可能长度路径已经穷尽，也不证明实际系统部署依赖已被完整登记。用户只问这两种限定关系时，不无故扫描无限跳邻居。
